"""Repairs issues: a certificate expiring soon, an upstream offline for a while.

Raised and removed after each update of the proxy's data; never fixable from the Repairs page (renew the certificate,
bring the upstream back). An upstream counts once it has been offline at every check for UPSTREAM_ISSUE_DELAY, so a
restart of the service behind the proxy raises nothing.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import issue_registry as ir
from homeassistant.util import dt as dt_util

from .const import DOMAIN, EXPIRY_WARNING_DAYS

if TYPE_CHECKING:
    from .coordinator import ProxyDataUpdateCoordinator

UPSTREAM_ISSUE_DELAY = timedelta(minutes=10)


def _expiring(coordinator: ProxyDataUpdateCoordinator, now: datetime) -> dict[str, datetime]:
    found = {}
    for domain, value in coordinator.cert_expiry.items():
        try:
            expiry = datetime.fromisoformat(value)
            if expiry < now + timedelta(days=EXPIRY_WARNING_DAYS):
                found[domain] = expiry
        except (ValueError, TypeError):
            continue
    return found


class ProxyIssues:
    """The Repairs issues of one proxy entry, kept in step with its coordinator."""

    def __init__(self, hass: HomeAssistant, coordinator: ProxyDataUpdateCoordinator) -> None:
        self.hass = hass
        self.coordinator = coordinator
        self.entry_id = coordinator.config_entry.entry_id
        # Since when each rule's upstreams have been offline at every check.
        self._offline_since: dict[str, datetime] = {}
        self._raised: set[str] = set()

    def _id(self, kind: str, domain: str) -> str:
        return f"{kind}_{self.entry_id}_{domain}"

    @callback
    def async_update(self) -> None:
        if not self.coordinator.last_update_success:
            return  # Unreachable proxy: what it said last still stands.
        now = datetime.now(UTC)
        wanted: dict[str, tuple[str, dict[str, str]]] = {}
        proxy = self.coordinator.config_entry.title
        for domain, expiry in _expiring(self.coordinator, now).items():
            key = "certificate_expired" if expiry <= now else "certificate_expiring"
            wanted[self._id("certificate", domain)] = (
                key,
                {"domain": domain, "proxy": proxy, "expires": dt_util.as_local(expiry).strftime("%Y-%m-%d")},
            )
        offline = set()
        for domain in self.coordinator.rule_domains():
            checks = self.coordinator.upstream_checks(domain)
            if checks and all(not c.get("online") for c in checks):
                offline.add(domain)
                since = self._offline_since.setdefault(domain, now)
                if now - since >= UPSTREAM_ISSUE_DELAY:
                    wanted[self._id("upstream", domain)] = (
                        "upstream_offline",
                        {"domain": domain, "proxy": proxy, "since": dt_util.as_local(since).strftime("%H:%M")},
                    )
        self._offline_since = {d: t for d, t in self._offline_since.items() if d in offline}
        for issue_id, (key, placeholders) in wanted.items():
            ir.async_create_issue(
                self.hass,
                DOMAIN,
                issue_id,
                is_fixable=False,
                severity=ir.IssueSeverity.ERROR if key != "certificate_expiring" else ir.IssueSeverity.WARNING,
                translation_key=key,
                translation_placeholders=placeholders,
            )
        for issue_id in self._raised - set(wanted):
            ir.async_delete_issue(self.hass, DOMAIN, issue_id)
        self._raised = set(wanted)


@callback
def async_remove_issues(hass: HomeAssistant, entry_id: str) -> None:
    """The entry is removed: its issues go with it."""
    for domain, issue_id in list(ir.async_get(hass).issues):
        if domain == DOMAIN and issue_id.split("_", 1)[-1].startswith(f"{entry_id}_"):
            ir.async_delete_issue(hass, DOMAIN, issue_id)
