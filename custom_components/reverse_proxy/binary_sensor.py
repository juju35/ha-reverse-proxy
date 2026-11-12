"""Reverse proxy binary sensors."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity

from .const import EXPIRY_WARNING_DAYS, safe_domain
from .coordinator import ProxyDataUpdateCoordinator
from .entity import ProxyDomainEntity, ProxyEntity, async_track_cert_entities, async_track_rule_entities


async def async_setup_entry(hass, entry, async_add_entities):
    coordinator: ProxyDataUpdateCoordinator = entry.runtime_data
    features = coordinator.features
    entities: list[ProxyEntity] = [
        ProxyRunningBinarySensor(coordinator, entry),
        TLSEnabledBinarySensor(coordinator, entry),
    ]
    if "controls" in features:
        entities += [
            HttpsRedirectBinarySensor(coordinator, entry),
            Port80BinarySensor(coordinator, entry),
            DevModeBinarySensor(coordinator, entry),
        ]
    if "certificates" in features:
        entities += async_track_cert_entities(
            coordinator, entry, async_add_entities, lambda d: [CertExpiringBinarySensor(coordinator, entry, d)]
        )
    if "upstream_health" in features:
        # Only for a proxy that checks its upstreams: elsewhere the sensor could only ever be unknown (#67).
        entities += async_track_rule_entities(
            coordinator, entry, async_add_entities, lambda d: [UpstreamProblemBinarySensor(coordinator, entry, d)]
        )
    async_add_entities(entities)


class BaseBinarySensor(ProxyEntity, BinarySensorEntity):
    _platform = "binary_sensor"


# ── System sensors ───────────────────────────────────────────────────────────


class ProxyRunningBinarySensor(BaseBinarySensor):
    _attr_translation_key = "proxy_running"
    _legacy_name = "Zoraxy - Proxy actif"
    _attr_device_class = BinarySensorDeviceClass.RUNNING

    @property
    def unique_id(self):
        return f"{self._entry.entry_id}_proxy_running"

    @property
    def is_on(self):
        return self.coordinator.running

    @property
    def extra_state_attributes(self):
        # The card reads the proxy type and its features here: it shows only the controls the proxy has.
        return {"proxy_type": self.coordinator.proxy_type, "features": sorted(self.coordinator.features)}


class TLSEnabledBinarySensor(BaseBinarySensor):
    _attr_translation_key = "tls_enabled"
    _legacy_name = "Zoraxy - TLS activé"

    @property
    def unique_id(self):
        return f"{self._entry.entry_id}_tls_enabled"

    @property
    def is_on(self):
        return self.coordinator.tls_enabled


class FlagBinarySensor(BaseBinarySensor):
    """An option flag of the proxy (Zoraxy)."""

    @property
    def is_on(self):
        return self.coordinator.flag(self._attr_translation_key)


class HttpsRedirectBinarySensor(FlagBinarySensor):
    _attr_translation_key = "https_redirect"
    _legacy_name = "Zoraxy - Redirection HTTPS"

    @property
    def unique_id(self):
        return f"{self._entry.entry_id}_https_redirect"


class Port80BinarySensor(FlagBinarySensor):
    _attr_translation_key = "port_80"
    _legacy_name = "Zoraxy - Écoute port 80"

    @property
    def unique_id(self):
        return f"{self._entry.entry_id}_listen_port80"


class DevModeBinarySensor(FlagBinarySensor):
    _attr_translation_key = "development_mode"
    _legacy_name = "Zoraxy - Mode développement"

    @property
    def unique_id(self):
        return f"{self._entry.entry_id}_dev_mode"


# ── Per-certificate sensors ────────────────────────────────────────────────────


class CertExpiringBinarySensor(ProxyDomainEntity, BaseBinarySensor):
    """On when the certificate expires in less than EXPIRY_WARNING_DAYS days."""

    _attr_device_class = BinarySensorDeviceClass.PROBLEM
    _attr_translation_key = "certificate_expiring"
    _legacy_name = "Zoraxy - Cert expirant {domain}"

    @property
    def unique_id(self):
        return f"{self._entry.entry_id}_cert_expiring_{safe_domain(self._domain)}"

    @property
    def is_on(self):
        expiry_str = self.coordinator.cert_expiry.get(self._domain)
        if not expiry_str:
            return None
        try:
            expiry = datetime.fromisoformat(expiry_str)
            # TypeError: a naive NotAfter can't be compared with an aware now().
            return expiry < datetime.now(UTC) + timedelta(days=EXPIRY_WARNING_DAYS)
        except (ValueError, TypeError):
            return None

    @property
    def extra_state_attributes(self):
        return {
            "domain": self._domain,
            "expires": self.coordinator.cert_expiry.get(self._domain, "?"),
            "warning_days": EXPIRY_WARNING_DAYS,
        }


# ── Per-rule sensors ───────────────────────────────────────────────────────────


class UpstreamProblemBinarySensor(ProxyDomainEntity, BaseBinarySensor):
    """On when the proxy found an upstream of the rule offline at its last check.

    Zoraxy: its uptime monitor. Traefik: the health check status of the service's servers. Unknown when the proxy
    has no check of the rule: rule disabled, its monitoring or health check turned off, not checked yet.
    """

    _attr_device_class = BinarySensorDeviceClass.PROBLEM
    _attr_translation_key = "upstream_problem"
    _legacy_name = "Zoraxy - Upstream {domain}"
    # Latency and check time change at every check: kept in the state for the card, not in the recorder.
    _unrecorded_attributes = frozenset({"upstreams"})

    @property
    def unique_id(self):
        return f"{self._entry.entry_id}_upstream_problem_{safe_domain(self._domain)}"

    @property
    def is_on(self):
        checks = self.coordinator.upstream_checks(self._domain)
        if not checks:
            return None
        return any(not check.get("online") for check in checks)

    @property
    def extra_state_attributes(self):
        return {"domain": self._domain, "upstreams": self.coordinator.upstream_checks(self._domain)}
