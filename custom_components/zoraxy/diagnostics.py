"""Diagnostics for the Zoraxy integration."""

from __future__ import annotations

from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

# Entry fields, and the keys of Zoraxy's answers that can hold credentials (basic auth of proxy rules,
# SSO and ACME settings). async_redact_data matches the keys at any depth.
TO_REDACT = {
    "host",
    "username",
    "password",
    "Username",
    "Password",
    "PasswordHash",
    "token",
    "Token",
    "csrf_token",
    "access_token",
    "refresh_token",
    "api_key",
    "ApiKey",
    "secret",
    "Secret",
    "client_secret",
    "ClientSecret",
    "cookie",
    "cookies",
    "Cookie",
    "Cookies",
    "email",
    "Email",
}


async def async_get_config_entry_diagnostics(hass: HomeAssistant, entry: ConfigEntry) -> dict[str, Any]:
    """Entry settings and the last data read from Zoraxy, without credentials."""
    coordinator = getattr(entry, "runtime_data", None)
    return {
        "entry": {
            "version": entry.version,
            "minor_version": entry.minor_version,
            "data": async_redact_data(dict(entry.data), TO_REDACT),
            "options": async_redact_data(dict(entry.options), TO_REDACT),
        },
        "coordinator": None
        if coordinator is None
        else {
            "last_update_success": coordinator.last_update_success,
            "update_interval": coordinator.update_interval.total_seconds() if coordinator.update_interval else None,
            "cert_list_loaded": coordinator.cert_list_loaded,
            "data": async_redact_data(coordinator.data or {}, TO_REDACT),
        },
    }
