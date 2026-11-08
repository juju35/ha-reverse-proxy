"""Base entity shared by the reverse proxy platforms."""

from __future__ import annotations

from collections.abc import Callable, Iterable

from homeassistant.core import callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity import Entity
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.util import slugify

from .const import DOMAIN, PROXIES, PROXY_ZORAXY
from .coordinator import ProxyDataUpdateCoordinator


class ProxyEntity(CoordinatorEntity[ProxyDataUpdateCoordinator]):
    """Reverse proxy entity: translated name under the proxy's device.

    Up to 1.4.x the Zoraxy names were hard-coded in French ("Zoraxy - Règles proxy"). The entity ids built from
    them (sensor.zoraxy_reverse_proxy_zoraxy_regles_proxy…) are what the card's fallback looks for, so new Zoraxy
    installs are given the same ids: `_legacy_name` is the former name, `_platform` the entity domain. Existing ids
    stay in the registry. The entities of the other proxies get Home Assistant's default ids (device name and
    translated name).
    """

    _attr_has_entity_name = True
    _platform: str
    _legacy_name: str

    def __init__(self, coordinator: ProxyDataUpdateCoordinator, entry) -> None:
        super().__init__(coordinator)
        self._entry = entry
        info = PROXIES[coordinator.proxy_type]
        if coordinator.proxy_type == PROXY_ZORAXY:
            self.entity_id = f"{self._platform}.{slugify(f'{info["device_name"]} {self._legacy_name}')}"
        self._attr_device_info = DeviceInfo(
            name=info["device_name"],
            manufacturer=info["manufacturer"],
            model=info["model"],
            sw_version=coordinator.version,
            identifiers={(DOMAIN, entry.entry_id)},
            configuration_url=entry.data["host"],
        )

    def _data(self) -> dict:
        return self.coordinator.data or {}


class ProxyDomainEntity(ProxyEntity):
    """Entity tied to one certificate or rule domain; the domain is a placeholder of the translated name."""

    def __init__(self, coordinator: ProxyDataUpdateCoordinator, entry, domain_name: str) -> None:
        self._domain = domain_name
        self._legacy_name = self._legacy_name.format(domain=domain_name)
        self._attr_translation_placeholders = {"domain": domain_name}
        super().__init__(coordinator, entry)


def async_track_cert_entities(
    coordinator: ProxyDataUpdateCoordinator,
    entry,
    async_add_entities: Callable[[Iterable[Entity]], None],
    factory: Callable[[str], Iterable[ProxyEntity]],
) -> list[ProxyEntity]:
    """Entities of the certificates listed now; those of a certificate added later in the proxy follow at its update.

    Without this, a new certificate only got its entities after a reload, while the count sensor already counted it.
    Likewise, the entities of a certificate removed from the proxy are removed from the registry at the update that
    no longer lists it (only when the certificate list actually answered), instead of staying until a reload.
    """
    return _async_track_domain_entities(
        coordinator,
        entry,
        async_add_entities,
        factory,
        lambda: coordinator.cert_list,
        lambda: coordinator.cert_list_loaded,
    )


def async_track_rule_entities(
    coordinator: ProxyDataUpdateCoordinator,
    entry,
    async_add_entities: Callable[[Iterable[Entity]], None],
    factory: Callable[[str], Iterable[ProxyEntity]],
) -> list[ProxyEntity]:
    """Entities of the proxy rules, added and removed with the rules like those of the certificates."""
    return _async_track_domain_entities(
        coordinator,
        entry,
        async_add_entities,
        factory,
        coordinator.rule_domains,
        lambda: coordinator.proxy_list_loaded,
    )


def _async_track_domain_entities(
    coordinator: ProxyDataUpdateCoordinator,
    entry,
    async_add_entities: Callable[[Iterable[Entity]], None],
    factory: Callable[[str], Iterable[ProxyEntity]],
    domains: Callable[[], list[str]],
    loaded: Callable[[], bool],
) -> list[ProxyEntity]:
    """Entities of the domains listed now, then added and removed at each update (removed only when `loaded`)."""
    known: dict[str, list[ProxyEntity]] = {}

    def new_entities() -> list[ProxyEntity]:
        new = [d for d in dict.fromkeys(domains()) if d not in known]
        for domain in new:
            known[domain] = list(factory(domain))
        return [entity for domain in new for entity in known[domain]]

    @callback
    def _remove_gone() -> None:
        if not loaded():
            return
        current = set(domains())
        registry = er.async_get(coordinator.hass)
        for domain in [d for d in known if d not in current]:
            for entity in known.pop(domain):
                if entity_id := registry.async_get_entity_id(entity._platform, DOMAIN, entity.unique_id):
                    registry.async_remove(entity_id)

    @callback
    def _check() -> None:
        _remove_gone()
        if entities := new_entities():
            async_add_entities(entities)

    entry.async_on_unload(coordinator.async_add_listener(_check))
    return new_entities()
