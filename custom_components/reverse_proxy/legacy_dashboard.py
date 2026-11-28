"""Repair while the Marketplace still holds this repository as the Dashboard entry it was before it became an integration.

That entry downloads the integration's reverse_proxy.zip as a dashboard plugin, so its installs and updates fail
("The installed content has no reverse_proxy.zip"). Seen from its files in www/community/, or from its record in the
Marketplace's storage when nothing was written (an install that failed, or one uninstalled and added again: the
repository stays under Add from link with its category).
"""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir
from homeassistant.util.json import load_json

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

ISSUE_LEGACY_DASHBOARD = "legacy_dashboard_install"
# The Marketplace's records, keyed by GitHub repository id
MARKETPLACE_STORE = "marketplace.repositories"
REPOSITORY_ID = "1258769149"
REPOSITORY_NAMES = ('juju35/ha-reverse-proxy', 'juju35/ha-zoraxy')
REPOSITORY_URL = "https://github.com/juju35/ha-reverse-proxy"
# Folders under www/community/ where the old dashboard plugin lives (before and after the repository was renamed)
PLUGIN_DIRS = ('ha-zoraxy', 'ha-reverse-proxy')
PLUGIN_FILE = "zoraxy-card.js"
PLACEHOLDERS = {
    "name": "Reverse Proxy",
    "error": "The installed content has no reverse_proxy.zip",
    "repositories": " / ".join(f"`{n}`" for n in REPOSITORY_NAMES),
    "url": REPOSITORY_URL,
}


async def async_check_legacy_dashboard(hass: HomeAssistant) -> None:
    """Raise the repair while the old Dashboard entry is there, delete it once it is gone."""
    if not await hass.async_add_executor_job(legacy_dashboard_entry, Path(hass.config.path())):
        ir.async_delete_issue(hass, DOMAIN, ISSUE_LEGACY_DASHBOARD)
        return
    ir.async_create_issue(
        hass,
        DOMAIN,
        ISSUE_LEGACY_DASHBOARD,
        is_fixable=False,
        is_persistent=False,
        severity=ir.IssueSeverity.WARNING,
        translation_key=ISSUE_LEGACY_DASHBOARD,
        translation_placeholders=PLACEHOLDERS,
        learn_more_url=f"{REPOSITORY_URL}#readme",
    )


def legacy_dashboard_entry(config: Path) -> bool:
    """Whether the old dashboard plugin is still installed or still recorded by the Marketplace."""
    community = config / "www" / "community"
    if any(any((community / name).glob(f"{PLUGIN_FILE}*")) for name in PLUGIN_DIRS):
        return True
    return marketplace_category(config / ".storage" / MARKETPLACE_STORE) not in (None, "integration")


def marketplace_category(store: Path) -> str | None:
    """The category the Marketplace keeps this repository under, None when it has no record of it."""
    if not store.is_file():
        return None
    try:
        data = load_json(store)
    except Exception:  # noqa: BLE001 - another integration's file: never fail the setup over it
        _LOGGER.debug("Unreadable %s", store, exc_info=True)
        return None
    records = data.get("data") if isinstance(data, dict) else None
    if not isinstance(records, dict):
        return None
    for key, record in records.items():
        if isinstance(record, dict) and (
            str(key) == REPOSITORY_ID or str(record.get("full_name", "")).lower() in REPOSITORY_NAMES
        ):
            return record.get("category")
    return None
