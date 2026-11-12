"""Reverse Proxy integration for Home Assistant: Zoraxy and Traefik."""

from __future__ import annotations

import hashlib
import inspect
import logging
from pathlib import Path
from typing import Any

import aiohttp
import voluptuous as vol
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED, Platform
from homeassistant.core import Event, HomeAssistant, ServiceCall
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.aiohttp_client import async_create_clientsession
from homeassistant.helpers.service import async_register_admin_service
from homeassistant.helpers.typing import ConfigType
from homeassistant.loader import IntegrationNotFound, async_get_integration

from .api import NpmClient, TraefikClient, ZoraxyClient, normalize_host
from .const import (
    CONF_PROXY_TYPE,
    CONF_VERIFY_SSL,
    DEFAULT_VERIFY_SSL,
    DOMAIN,
    LEGACY_DOMAIN,
    PROXY_NPM,
    PROXY_TRAEFIK,
    PROXY_ZORAXY,
    SERVICE_TOGGLE_PROXY_RULE,
    safe_domain,
)
from .coordinator import COORDINATORS, ProxyDataUpdateCoordinator, entry_proxy_type, entry_settings
from .repairs import ProxyIssues, async_remove_issues

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[Platform] = [
    Platform.SENSOR,
    Platform.BINARY_SENSOR,
    Platform.SWITCH,
    Platform.BUTTON,
]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)
TOGGLE_PROXY_RULE_SCHEMA = vol.Schema(
    {
        vol.Required("domain"): vol.All(cv.string, vol.Strip, vol.Length(min=1)),
        # True enables, False disables, left out toggles the rule.
        vol.Optional("enable"): cv.boolean,
        # The instance the rule belongs to (the card passes its device's entry); left out, the one listing the domain.
        vol.Optional("config_entry_id"): cv.string,
    }
)

# From 2026.x a device belongs to a single config entry and is moved with `new_config_entry_id`; before, it is
# attached to the new entry and detached from the old one (the former way is deprecated, removed in 2027.8).
_MOVE_DEVICE_WITH_NEW_ENTRY = (
    "new_config_entry_id" in inspect.signature(dr.DeviceRegistry.async_update_device).parameters
)

# Unique id suffixes of the per-certificate entities, then of the per-rule ones (after "<entry_id>").
CERT_SUFFIXES = ("_cert_expiry_", "_cert_expiring_", "_renew_")
RULE_SUFFIXES = ("_upstream_problem_",)

CARD_FILENAME = "reverse-proxy-card.js"
CARD_PATH = Path(__file__).parent / "frontend" / CARD_FILENAME
FRONTEND_URL = f"/{DOMAIN}"
# Up to 1.14.x the card was zoraxy-card.js, served at /zoraxy/; up to 1.2.1 it was copied to /config/www/.
LEGACY_CARD_FILENAME = "zoraxy-card.js"
LEGACY_CARD_URLS = (f"/{LEGACY_DOMAIN}/{LEGACY_CARD_FILENAME}", f"/local/{LEGACY_CARD_FILENAME}")


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Serve the Lovelace card from the integration and add it to the dashboard resources."""
    await hass.http.async_register_static_paths([StaticPathConfig(FRONTEND_URL, str(CARD_PATH.parent), True)])
    await hass.async_add_executor_job(_remove_legacy_card_file, hass)
    await _async_register_card(hass)
    # Enabling or disabling a rule changes what the proxy exposes: administrators only, like the proxy's own UI.
    async_register_admin_service(
        hass, DOMAIN, SERVICE_TOGGLE_PROXY_RULE, _async_toggle_proxy_rule(hass), TOGGLE_PROXY_RULE_SCHEMA
    )
    return True


def _remove_legacy_card_file(hass: HomeAssistant) -> None:
    """Delete the copy of the card that versions up to 1.2.1 put in /config/www/."""
    legacy = Path(hass.config.config_dir) / "www" / LEGACY_CARD_FILENAME
    try:
        if legacy.is_file() and "ZORAXY_CARD_VERSION" in legacy.read_text(encoding="utf-8", errors="ignore"):
            legacy.unlink()
            _LOGGER.info("Reverse proxy: removed the old copy of the card in %s", legacy)
    except OSError as err:
        _LOGGER.warning("Reverse proxy: could not remove the old copy of the card in %s: %s", legacy, err)


async def _async_register_card(hass: HomeAssistant) -> None:
    """Add the card to the dashboard resources, or update it, as ha-parcel does.

    The file hash in the URL makes browsers fetch the new card after an update. The resources of the earlier
    names of the card (/zoraxy/zoraxy-card.js, /local/zoraxy-card.js) are replaced by the integration's URL.
    """
    # Cache busting, not cryptography: usedforsecurity keeps FIPS-mode Pythons from rejecting md5.
    digest = await hass.async_add_executor_job(
        lambda: hashlib.md5(CARD_PATH.read_bytes(), usedforsecurity=False).hexdigest()[:8]
    )
    base_url = f"{FRONTEND_URL}/{CARD_FILENAME}"
    url = f"{base_url}?v={digest}"

    async def register(_event: Event | None = None) -> None:
        resources, mode = _lovelace_resources(hass.data.get("lovelace"))
        if resources is None or mode != "storage":
            # Dashboards in YAML mode: resources can't be edited, load the card on every page.
            add_extra_js_url(hass, url)
            return
        try:
            if not resources.loaded:
                await resources.async_load()
                resources.loaded = True
            existing = [
                item
                for item in resources.async_items()
                if item.get("url", "").split("?")[0] in (base_url, *LEGACY_CARD_URLS)
            ]
            if not existing:
                await resources.async_create_item({"res_type": "module", "url": url})
                _LOGGER.info("Reverse proxy card added to dashboard resources: %s", url)
            elif existing[0].get("url") != url:
                await resources.async_update_item(existing[0]["id"], {"res_type": "module", "url": url})
                _LOGGER.info("Reverse proxy card resource updated: %s", url)
            for duplicate in existing[1:]:
                await resources.async_delete_item(duplicate["id"])
        except Exception as err:  # noqa: BLE001
            _LOGGER.warning(
                "Could not add the reverse proxy card to dashboard resources (%s). Add %s manually "
                "in Settings > Dashboards > Resources (JavaScript module)",
                err,
                url,
            )
            add_extra_js_url(hass, url)

    if hass.is_running:
        await register()
    else:
        hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, register)


def _lovelace_resources(lovelace: Any) -> tuple[Any, str]:
    """Lovelace resources collection and its mode, whatever the Home Assistant version.

    hass.data["lovelace"] is a dict before 2025.2, then a dataclass whose `mode` field became `resource_mode` in 2026.2.
    """
    if isinstance(lovelace, dict):
        return lovelace.get("resources"), lovelace.get("resource_mode", lovelace.get("mode", "storage"))
    return getattr(lovelace, "resources", None), getattr(
        lovelace, "resource_mode", getattr(lovelace, "mode", "storage")
    )


async def _cleanup_stale_entities(hass: HomeAssistant, entry: ConfigEntry, current: dict[str, list[str]]) -> None:
    """Remove the entities of certificates or rules no longer listed: {unique id suffix: domains listed now}.

    The suffix is matched right after the entry id, so a domain containing "_renew_" or "_cert_expiry_" cannot
    be taken for another kind of entity.
    """
    registry = er.async_get(hass)
    current_safe = {suffix: {safe_domain(d) for d in domains} for suffix, domains in current.items()}
    to_remove = [
        e.entity_id
        for e in er.async_entries_for_config_entry(registry, entry.entry_id)
        if any(
            (e.unique_id or "").startswith(head := f"{entry.entry_id}{suffix}") and e.unique_id[len(head) :] not in safe
            for suffix, safe in current_safe.items()
        )
    ]
    for entity_id in to_remove:
        _LOGGER.info("Reverse proxy: removing stale entity %s", entity_id)
        registry.async_remove(entity_id)


async def async_migrate_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """1.1 → 1.2: TLS verification becomes an option. 1.x → 2.1: the entry says which proxy it is (Zoraxy).

    Up to 1.2 the certificate was never checked. Existing entries keep that (verify_ssl False) so an HTTPS Zoraxy
    with a self-signed certificate keeps working; new entries check it by default. The unique id is normalized
    like the config flow now does, unless another entry already uses that value.
    """
    if entry.version > 2:
        return False
    if entry.version == 1:
        updates: dict[str, Any] = {
            "data": {**entry.data, CONF_PROXY_TYPE: PROXY_ZORAXY},
            "version": 2,
            "minor_version": 1,
        }
        if entry.minor_version < 2:
            updates["data"][CONF_VERIFY_SSL] = False
        unique_id = normalize_host(entry.data["host"])
        if unique_id != entry.unique_id and not any(
            e.unique_id == unique_id for e in hass.config_entries.async_entries(DOMAIN) if e is not entry
        ):
            updates["unique_id"] = unique_id
        hass.config_entries.async_update_entry(entry, **updates)
        _LOGGER.debug("Reverse proxy: migrated entry %s to 2.1", entry.entry_id)
    return True


async def _async_adopt_legacy_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Take over the `zoraxy` entry (integration up to 1.14.x) of the same host, once that integration is gone.

    Its device, entities (ids, names, areas, history) move to this entry with the unique ids rebuilt on this
    entry's id, then the old entry is removed. Nothing is touched while the old integration is still installed
    (its entities are loaded): the user is told to remove custom_components/zoraxy.
    """
    host = normalize_host(entry.data["host"])
    legacy = [
        old
        for old in hass.config_entries.async_entries(LEGACY_DOMAIN)
        if normalize_host(str(old.data.get("host", ""))) == host
    ]
    if not legacy:
        return
    try:
        await async_get_integration(hass, LEGACY_DOMAIN)
    except IntegrationNotFound:
        pass
    else:
        _LOGGER.warning(
            "Reverse proxy: the former Zoraxy integration (custom_components/zoraxy) is still installed; "
            "remove it so that its entry for %s can be taken over by this one",
            entry.data["host"],
        )
        return

    device_registry = dr.async_get(hass)
    entity_registry = er.async_get(hass)
    for old in legacy:
        # The entities first: taking the old entry off a device removes the device's entities of that entry.
        for entity in er.async_entries_for_config_entry(entity_registry, old.entry_id):
            unique_id = (entity.unique_id or "").replace(old.entry_id, entry.entry_id, 1)
            entity_registry.async_update_entity_platform(
                entity.entity_id,
                DOMAIN,
                new_unique_id=unique_id,
                new_config_entry_id=entry.entry_id,
                new_device_id=entity.device_id,
            )
        for device in dr.async_entries_for_config_entry(device_registry, old.entry_id):
            identifiers = {
                (DOMAIN, entry.entry_id) if ident == (LEGACY_DOMAIN, old.entry_id) else ident
                for ident in device.identifiers
            }
            if _MOVE_DEVICE_WITH_NEW_ENTRY:
                # A device belongs to one config entry (2026.x): move it.
                device_registry.async_update_device(
                    device.id, new_identifiers=identifiers, new_config_entry_id=entry.entry_id
                )
            else:
                # Older Home Assistant: two calls, as adding and removing in one call loses the addition.
                device_registry.async_update_device(
                    device.id, new_identifiers=identifiers, add_config_entry_id=entry.entry_id
                )
                device_registry.async_update_device(device.id, remove_config_entry_id=old.entry_id)
        await hass.config_entries.async_remove(old.entry_id)
        _LOGGER.info("Reverse proxy: took over the former Zoraxy entry %s for %s", old.entry_id, entry.data["host"])


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    settings = entry_settings(entry)
    proxy_type = entry_proxy_type(entry)
    if proxy_type == PROXY_ZORAXY:
        await _async_adopt_legacy_entry(hass, entry)
    # Session owned by Home Assistant: closed when the entry unloads or its setup fails.
    session = async_create_clientsession(
        hass,
        verify_ssl=settings.get(CONF_VERIFY_SSL, DEFAULT_VERIFY_SSL),
        cookie_jar=aiohttp.CookieJar(unsafe=True),
    )
    if proxy_type == PROXY_TRAEFIK:
        client = TraefikClient(session, settings["host"], settings.get("username", ""), settings.get("password", ""))
    elif proxy_type == PROXY_NPM:
        client = NpmClient(session, settings["host"], settings["username"], settings["password"])
    else:
        client = ZoraxyClient(session, settings["host"], settings["username"], settings["password"])
    coordinator = COORDINATORS[proxy_type](hass, entry, client)
    await coordinator.async_config_entry_first_refresh()
    current: dict[str, list[str]] = {}
    if coordinator.cert_list_loaded:
        current.update(dict.fromkeys(CERT_SUFFIXES, coordinator.cert_list))
    if "upstream_health" not in coordinator.features:
        # No upstream sensor for a proxy that does not check its upstreams: those created by 2.4.0 go (#67).
        current.update({suffix: [] for suffix in RULE_SUFFIXES})
    elif coordinator.proxy_list_loaded:
        current.update(dict.fromkeys(RULE_SUFFIXES, coordinator.rule_domains()))
    await _cleanup_stale_entities(hass, entry, current)
    entry.runtime_data = coordinator
    issues = ProxyIssues(hass, coordinator)
    issues.async_update()
    entry.async_on_unload(coordinator.async_add_listener(issues.async_update))
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_reload))
    return True


async def _async_reload(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Its Repairs issues (certificates, upstreams) go with it."""
    async_remove_issues(hass, entry.entry_id)


def _async_toggle_proxy_rule(hass: HomeAssistant):
    """Service handler that looks up the loaded coordinators at each call, so it survives reloads."""

    async def handle(call: ServiceCall) -> None:
        domain_name: str = call.data["domain"]
        enable: bool | None = call.data.get("enable")
        entry_id: str | None = call.data.get("config_entry_id")
        coordinators: list[ProxyDataUpdateCoordinator] = [
            entry.runtime_data
            for entry in hass.config_entries.async_entries(DOMAIN)
            if entry.state is ConfigEntryState.LOADED and entry_id in (None, entry.entry_id)
        ]
        if not coordinators:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="no_instance")
        # With several instances, the rule belongs to the one that lists the domain.
        match = next(
            (
                (coordinator, enabled)
                for coordinator in coordinators
                if (enabled := coordinator.rule_enabled(domain_name)) is not None
            ),
            None,
        )
        if match is None:
            raise ServiceValidationError(
                translation_domain=DOMAIN,
                translation_key="rule_not_found",
                translation_placeholders={"domain": domain_name},
            )
        coordinator, currently_enabled = match
        # Left out, enable toggles the rule: a disabled rule gets enabled.
        should_enable = (not currently_enabled) if enable is None else enable
        # A proxy whose API is read-only (Traefik) raises HomeAssistantError (not_supported).
        await coordinator.toggle_rule(domain_name, should_enable)

    return handle
