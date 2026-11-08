"""Reverse proxy option switches (Zoraxy: HTTPS redirect, port 80 listener, development mode)."""

from __future__ import annotations

from homeassistant.components.switch import SwitchEntity

from .coordinator import ProxyDataUpdateCoordinator
from .entity import ProxyEntity


async def async_setup_entry(hass, entry, async_add_entities):
    coordinator: ProxyDataUpdateCoordinator = entry.runtime_data
    if "controls" not in coordinator.features:
        return
    async_add_entities(
        [
            HttpsRedirectSwitch(coordinator, entry),
            Port80Switch(coordinator, entry),
            DevModeSwitch(coordinator, entry),
        ]
    )


class FlagSwitch(ProxyEntity, SwitchEntity):
    """Turns one option flag of the proxy on or off; shows the flag like the binary sensor of the same key."""

    _platform = "switch"
    _suffix: str

    @property
    def unique_id(self):
        return f"{self._entry.entry_id}_switch_{self._suffix}"

    @property
    def is_on(self):
        return self.coordinator.flag(self._attr_translation_key)

    async def async_turn_on(self, **_):
        # Raises HomeAssistantError on failure, so the caller (and the card) sees it.
        await self.coordinator.set_flag(self._attr_translation_key, True)

    async def async_turn_off(self, **_):
        await self.coordinator.set_flag(self._attr_translation_key, False)


class HttpsRedirectSwitch(FlagSwitch):
    _attr_translation_key = "https_redirect"
    _legacy_name = "Zoraxy - Redirection HTTPS"
    _suffix = "https_redirect"


class Port80Switch(FlagSwitch):
    _attr_translation_key = "port_80"
    _legacy_name = "Zoraxy - Écoute port 80"
    _suffix = "port80"


class DevModeSwitch(FlagSwitch):
    _attr_translation_key = "development_mode"
    _legacy_name = "Zoraxy - Mode développement"
    _suffix = "dev_mode"
