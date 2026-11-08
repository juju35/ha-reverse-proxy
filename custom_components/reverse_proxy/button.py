"""Certificate renewal buttons (Zoraxy, ACME)."""

from __future__ import annotations

from homeassistant.components.button import ButtonEntity

from .const import safe_domain
from .coordinator import ProxyDataUpdateCoordinator
from .entity import ProxyDomainEntity, async_track_cert_entities


async def async_setup_entry(hass, entry, async_add_entities):
    coordinator: ProxyDataUpdateCoordinator = entry.runtime_data
    if "certificates" not in coordinator.features:
        return
    async_add_entities(
        async_track_cert_entities(
            coordinator, entry, async_add_entities, lambda d: [CertRenewButton(coordinator, entry, d)]
        )
    )


class CertRenewButton(ProxyDomainEntity, ButtonEntity):
    """ACME renewal button for one certificate."""

    _attr_translation_key = "renew"
    _platform = "button"
    _legacy_name = "Zoraxy - Renouveler {domain}"

    @property
    def unique_id(self):
        return f"{self._entry.entry_id}_renew_{safe_domain(self._domain)}"

    @property
    def extra_state_attributes(self):
        # The card finds the button of a certificate by this domain, whatever the entity id.
        return {"domain": self._domain}

    async def async_press(self):
        # Raises HomeAssistantError on failure, so the caller (and the card) sees it.
        await self.coordinator.renew_certificate(self._domain)
        await self.coordinator.async_request_refresh()
