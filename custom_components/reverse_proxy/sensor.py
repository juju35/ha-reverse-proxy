"""Reverse proxy sensors."""

from __future__ import annotations

from datetime import datetime

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.const import EntityCategory

from .const import safe_domain
from .coordinator import ProxyDataUpdateCoordinator
from .entity import ProxyDomainEntity, ProxyEntity, async_track_cert_entities


async def async_setup_entry(hass, entry, async_add_entities):
    coordinator: ProxyDataUpdateCoordinator = entry.runtime_data
    features = coordinator.features
    entities: list[ProxyEntity] = [
        ProxyRulesCountSensor(coordinator, entry),
        ActiveRulesCountSensor(coordinator, entry),
        InboundPortSensor(coordinator, entry),
    ]
    if "certificates" in features:
        entities.append(CertCountSensor(coordinator, entry))
        entities += async_track_cert_entities(
            coordinator, entry, async_add_entities, lambda d: [CertExpirySensor(coordinator, entry, d)]
        )
    if "access_rules" in features:
        entities.append(AccessRulesCountSensor(coordinator, entry))
    if "middlewares" in features:
        entities.append(MiddlewaresCountSensor(coordinator, entry))
    if "version" in features:
        entities.append(VersionSensor(coordinator, entry))
    async_add_entities(entities)


class BaseSensor(ProxyEntity, SensorEntity):
    _platform = "sensor"


class ProxyRulesCountSensor(BaseSensor):
    _attr_translation_key = "proxy_rules"
    _legacy_name = "Zoraxy - Règles proxy"
    _attr_state_class = SensorStateClass.MEASUREMENT
    # Full lists, rewritten at every change: kept in the state (the card reads them) but not in the recorder.
    _unrecorded_attributes = frozenset({"rules", "redirects"})

    @property
    def unique_id(self):
        return f"{self._entry.entry_id}_proxy_rules_count"

    @property
    def native_value(self):
        return len(self.coordinator.rules())

    @property
    def extra_state_attributes(self):
        return {"rules": self.coordinator.rules(), "redirects": self.coordinator.redirects()}


class ActiveRulesCountSensor(BaseSensor):
    _attr_translation_key = "active_rules"
    _legacy_name = "Zoraxy - Règles actives"
    _attr_state_class = SensorStateClass.MEASUREMENT

    @property
    def unique_id(self):
        return f"{self._entry.entry_id}_active_rules_count"

    @property
    def native_value(self):
        return sum(1 for r in self.coordinator.rules() if r.get("enabled"))


class CertCountSensor(BaseSensor):
    _attr_translation_key = "tls_certificates"
    _legacy_name = "Zoraxy - Certificats TLS"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _unrecorded_attributes = frozenset({"certificates"})

    @property
    def unique_id(self):
        return f"{self._entry.entry_id}_cert_count"

    @property
    def native_value(self):
        return len(self.coordinator.cert_list)

    @property
    def extra_state_attributes(self):
        expiry = self.coordinator.cert_expiry
        return {"certificates": [{"domain": d, "expires": expiry.get(d, "?")} for d in self.coordinator.cert_list]}


class AccessRulesCountSensor(BaseSensor):
    _attr_translation_key = "access_rules"
    _legacy_name = "Zoraxy - Règles d'accès"
    _attr_state_class = SensorStateClass.MEASUREMENT

    @property
    def unique_id(self):
        return f"{self._entry.entry_id}_access_rules_count"

    @property
    def native_value(self):
        return self.coordinator.access_rules_count


class MiddlewaresCountSensor(BaseSensor):
    """Traefik: HTTP middlewares, the proxy's own (api@internal…) aside."""

    _attr_translation_key = "middlewares"
    _attr_state_class = SensorStateClass.MEASUREMENT

    @property
    def unique_id(self):
        return f"{self._entry.entry_id}_middlewares_count"

    @property
    def native_value(self):
        return self.coordinator.middlewares_count


class InboundPortSensor(BaseSensor):
    _attr_translation_key = "inbound_port"
    _legacy_name = "Zoraxy - Port entrant"

    @property
    def unique_id(self):
        return f"{self._entry.entry_id}_inbound_port"

    @property
    def native_value(self):
        return self.coordinator.port


class VersionSensor(BaseSensor):
    _attr_translation_key = "version"
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    @property
    def unique_id(self):
        return f"{self._entry.entry_id}_version"

    @property
    def native_value(self):
        return self.coordinator.version


class CertExpirySensor(ProxyDomainEntity, BaseSensor):
    """Expiry date of one certificate."""

    _attr_device_class = SensorDeviceClass.TIMESTAMP
    _attr_translation_key = "certificate"
    _legacy_name = "Zoraxy - Cert {domain}"

    @property
    def unique_id(self):
        return f"{self._entry.entry_id}_cert_expiry_{safe_domain(self._domain)}"

    @property
    def native_value(self):
        expiry_str = self.coordinator.cert_expiry.get(self._domain)
        if not expiry_str:
            return None
        try:
            return datetime.fromisoformat(expiry_str)
        except (ValueError, TypeError):
            return None

    @property
    def extra_state_attributes(self):
        return {"domain": self._domain}
