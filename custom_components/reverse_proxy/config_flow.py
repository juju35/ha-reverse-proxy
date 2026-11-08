"""Config flow for the Reverse Proxy integration (Zoraxy, Traefik)."""

from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Any

import aiohttp
import voluptuous as vol
from homeassistant.config_entries import ConfigEntry, ConfigEntryState, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_create_clientsession
from homeassistant.helpers.selector import (
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
    TextSelector,
    TextSelectorConfig,
    TextSelectorType,
)

from .api import ProxyAuthError, ProxyError, TraefikClient, ZoraxyClient, normalize_host
from .const import (
    CONF_PROXY_TYPE,
    CONF_SCAN_INTERVAL,
    CONF_VERIFY_SSL,
    DEFAULT_SCAN_INTERVAL,
    DEFAULT_VERIFY_SSL,
    DOMAIN,
    MIN_SCAN_INTERVAL,
    PROXIES,
    PROXY_TRAEFIK,
    PROXY_TYPES,
    PROXY_ZORAXY,
    proxy_name,
)

_LOGGER = logging.getLogger(__name__)

SCAN_INTERVAL_SELECTOR = NumberSelector(
    NumberSelectorConfig(min=MIN_SCAN_INTERVAL, max=3600, step=1, unit_of_measurement="s", mode=NumberSelectorMode.BOX)
)
PASSWORD_SELECTOR = TextSelector(TextSelectorConfig(type=TextSelectorType.PASSWORD))


def _user_schema(proxy_type: str) -> vol.Schema:
    """Fields of a new entry: Zoraxy needs an account, Traefik's API has none of its own (basic auth optional)."""
    host = vol.Required("host", default=PROXIES[proxy_type]["default_host"])
    if proxy_type == PROXY_TRAEFIK:
        credentials = {
            vol.Optional("username", default=""): str,
            vol.Optional("password", default=""): PASSWORD_SELECTOR,
        }
    else:
        credentials = {vol.Required("username", default="admin"): str, vol.Required("password"): PASSWORD_SELECTOR}
    return vol.Schema(
        {
            host: str,
            **credentials,
            vol.Optional(CONF_SCAN_INTERVAL, default=DEFAULT_SCAN_INTERVAL): SCAN_INTERVAL_SELECTOR,
            vol.Optional(CONF_VERIFY_SSL, default=DEFAULT_VERIFY_SSL): bool,
        }
    )


def _reconfigure_schema(proxy_type: str) -> vol.Schema:
    if proxy_type == PROXY_TRAEFIK:
        credentials = {
            vol.Optional("username", default=""): str,
            vol.Optional("password", default=""): PASSWORD_SELECTOR,
        }
    else:
        credentials = {vol.Required("username"): str, vol.Required("password"): PASSWORD_SELECTOR}
    return vol.Schema({vol.Required("host"): str, **credentials})


def _reauth_schema(proxy_type: str) -> vol.Schema:
    # Traefik: the whole basic auth may change (the username too); Zoraxy: the account keeps its name.
    if proxy_type == PROXY_TRAEFIK:
        return vol.Schema(
            {vol.Optional("username", default=""): str, vol.Optional("password", default=""): PASSWORD_SELECTOR}
        )
    return vol.Schema({vol.Required("password"): PASSWORD_SELECTOR})


async def _validate(
    hass: HomeAssistant, proxy_type: str, host: str, username: str, password: str, verify_ssl: bool
) -> str | None:
    """Check the address and the credentials; return an error key, or None when the proxy answers."""
    session = async_create_clientsession(
        hass, verify_ssl=verify_ssl, auto_cleanup=False, cookie_jar=aiohttp.CookieJar(unsafe=True)
    )
    client = (
        TraefikClient(session, host, username, password)
        if proxy_type == PROXY_TRAEFIK
        else ZoraxyClient(session, host, username, password)
    )
    try:
        await client.login()
    except ProxyAuthError:
        return "invalid_auth"
    except ProxyError as err:
        _LOGGER.debug("%s: cannot connect to %s: %s", proxy_name(proxy_type), host, err)
        return "cannot_connect"
    except Exception:
        _LOGGER.exception("%s: unexpected error while checking %s", proxy_name(proxy_type), host)
        return "unknown"
    finally:
        # The connector is shared by Home Assistant: detach it rather than closing it.
        session.detach()
    return None


def _placeholders(proxy_type: str, **extra: str) -> dict[str, str]:
    return {"proxy": proxy_name(proxy_type), **extra}


class ReverseProxyConfigFlow(ConfigFlow, domain=DOMAIN):
    # 2.1: the entry says which proxy it is (CONF_PROXY_TYPE); 1.2 (Zoraxy only) had the verify_ssl option.
    VERSION = 2
    MINOR_VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Pick the reverse proxy: one step per type, so each has its own fields and help text."""
        return self.async_show_menu(step_id="user", menu_options=list(PROXY_TYPES))

    async def async_step_zoraxy(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        return await self._async_step_proxy(PROXY_ZORAXY, user_input)

    async def async_step_traefik(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        return await self._async_step_proxy(PROXY_TRAEFIK, user_input)

    async def _async_step_proxy(self, proxy_type: str, user_input: dict[str, Any] | None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            host = user_input["host"].strip().rstrip("/")
            unique_id = normalize_host(host)
            await self.async_set_unique_id(unique_id)
            # Checked by hand rather than with _abort_if_unique_id_configured: its description_placeholders
            # argument, which names the proxy in the abort message, is missing from older Home Assistant versions.
            if any(e.unique_id == unique_id for e in self._async_current_entries()):
                return self.async_abort(reason="already_configured", description_placeholders=_placeholders(proxy_type))
            data = {
                **user_input,
                CONF_PROXY_TYPE: proxy_type,
                "host": host,
                "username": user_input.get("username", "").strip(),
                "password": user_input.get("password", ""),
                CONF_SCAN_INTERVAL: int(user_input.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)),
                CONF_VERIFY_SSL: user_input.get(CONF_VERIFY_SSL, DEFAULT_VERIFY_SSL),
            }
            error = await _validate(
                self.hass, proxy_type, host, data["username"], data["password"], data[CONF_VERIFY_SSL]
            )
            if error is None:
                return self.async_create_entry(title=f"{proxy_name(proxy_type)} ({host})", data=data)
            errors["base"] = error

        return self.async_show_form(
            step_id=proxy_type,
            data_schema=self.add_suggested_values_to_schema(_user_schema(proxy_type), user_input),
            errors=errors,
            description_placeholders=_placeholders(proxy_type),
        )

    async def async_step_reauth(self, entry_data: Mapping[str, Any]) -> ConfigFlowResult:
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        entry = self._get_reauth_entry()
        proxy_type = entry.data.get(CONF_PROXY_TYPE, PROXY_ZORAXY)
        if user_input is not None:
            settings = {**entry.data, **entry.options}
            username = user_input.get("username", settings["username"]).strip()
            error = await _validate(
                self.hass,
                proxy_type,
                settings["host"],
                username,
                user_input.get("password", ""),
                settings.get(CONF_VERIFY_SSL, DEFAULT_VERIFY_SSL),
            )
            if error is None:
                # A changed loaded entry is reloaded by its update listener; async_update_reload_and_abort
                # would reload it a second time. Reload here only when that listener does not run.
                loaded = entry.state is ConfigEntryState.LOADED
                changed = self.hass.config_entries.async_update_entry(
                    entry, data={**entry.data, "username": username, "password": user_input.get("password", "")}
                )
                if not (loaded and changed):
                    self.hass.config_entries.async_schedule_reload(entry.entry_id)
                return self.async_abort(reason="reauth_successful")
            errors["base"] = error

        return self.async_show_form(
            step_id="reauth_confirm",
            data_schema=self.add_suggested_values_to_schema(
                _reauth_schema(proxy_type), user_input or {"username": entry.data.get("username", "")}
            ),
            errors=errors,
            description_placeholders=_placeholders(
                proxy_type, host=entry.data["host"], username=entry.data.get("username", "")
            ),
        )

    async def async_step_reconfigure(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Change the address or the credentials of an existing entry, checked like the user step."""
        errors: dict[str, str] = {}
        entry = self._get_reconfigure_entry()
        proxy_type = entry.data.get(CONF_PROXY_TYPE, PROXY_ZORAXY)
        if user_input is not None:
            host = user_input["host"].strip().rstrip("/")
            unique_id = normalize_host(host)
            if any(e.unique_id == unique_id for e in self._async_current_entries() if e.entry_id != entry.entry_id):
                return self.async_abort(reason="already_configured", description_placeholders=_placeholders(proxy_type))
            settings = {**entry.data, **entry.options}
            username = user_input.get("username", "").strip()
            error = await _validate(
                self.hass,
                proxy_type,
                host,
                username,
                user_input.get("password", ""),
                settings.get(CONF_VERIFY_SSL, DEFAULT_VERIFY_SSL),
            )
            if error is None:
                # Same reload rule as the reauth: the update listener reloads a changed loaded entry.
                loaded = entry.state is ConfigEntryState.LOADED
                title = entry.title
                if title == f"{proxy_name(proxy_type)} ({entry.data['host']})":
                    title = f"{proxy_name(proxy_type)} ({host})"
                changed = self.hass.config_entries.async_update_entry(
                    entry,
                    title=title,
                    unique_id=unique_id,
                    data={
                        **entry.data,
                        "host": host,
                        "username": username,
                        "password": user_input.get("password", ""),
                    },
                )
                if not (loaded and changed):
                    self.hass.config_entries.async_schedule_reload(entry.entry_id)
                return self.async_abort(reason="reconfigure_successful")
            errors["base"] = error

        suggested = user_input or {"host": entry.data["host"], "username": entry.data.get("username", "")}
        return self.async_show_form(
            step_id="reconfigure",
            data_schema=self.add_suggested_values_to_schema(_reconfigure_schema(proxy_type), suggested),
            errors=errors,
            description_placeholders=_placeholders(proxy_type),
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return ReverseProxyOptionsFlow()


class ReverseProxyOptionsFlow(OptionsFlow):
    """Refresh interval and TLS certificate verification."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            user_input[CONF_SCAN_INTERVAL] = int(user_input[CONF_SCAN_INTERVAL])
            return self.async_create_entry(data=user_input)

        current = {**self.config_entry.data, **self.config_entry.options}
        schema = vol.Schema(
            {
                vol.Required(
                    CONF_SCAN_INTERVAL, default=current.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)
                ): SCAN_INTERVAL_SELECTOR,
                vol.Required(CONF_VERIFY_SSL, default=current.get(CONF_VERIFY_SSL, DEFAULT_VERIFY_SSL)): bool,
            }
        )
        return self.async_show_form(
            step_id="init",
            data_schema=schema,
            description_placeholders=_placeholders(self.config_entry.data.get(CONF_PROXY_TYPE, PROXY_ZORAXY)),
        )
