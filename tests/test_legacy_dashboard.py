"""The repair for the Marketplace Dashboard entry left from before this repository became an integration."""

import json
from pathlib import Path

import pytest
from homeassistant.helpers import issue_registry as ir

from custom_components.reverse_proxy.const import DOMAIN
from custom_components.reverse_proxy.legacy_dashboard import (
    ISSUE_LEGACY_DASHBOARD,
    PLUGIN_DIRS,
    PLUGIN_FILE,
    REPOSITORY_ID,
    REPOSITORY_NAMES,
    async_check_legacy_dashboard,
)


@pytest.fixture
def config(hass, tmp_path):
    hass.config.config_dir = str(tmp_path)
    return tmp_path


def _issue(hass):
    return ir.async_get(hass).async_get_issue(DOMAIN, ISSUE_LEGACY_DASHBOARD)


def _store(config: Path, content: str) -> Path:
    store = config / ".storage" / "marketplace.repositories"
    store.parent.mkdir(parents=True, exist_ok=True)
    store.write_text(content)
    return store


@pytest.mark.parametrize("folder", PLUGIN_DIRS)
async def test_repair_while_the_plugin_files_are_there(hass, config, folder):
    plugin = config / "www" / "community" / folder
    plugin.mkdir(parents=True)
    (plugin / f"{PLUGIN_FILE}.gz").write_bytes(b"")
    await async_check_legacy_dashboard(hass)
    assert _issue(hass) is not None
    (plugin / f"{PLUGIN_FILE}.gz").unlink()
    await async_check_legacy_dashboard(hass)
    assert _issue(hass) is None


@pytest.mark.parametrize(("key", "name"), [(REPOSITORY_ID, "x/y"), *(("1", n.upper()) for n in REPOSITORY_NAMES)])
async def test_repair_while_the_marketplace_keeps_a_dashboard_record(hass, config, key, name):
    records = {key: {"full_name": name, "category": "plugin", "installed": False}}
    store = _store(config, json.dumps({"version": 1, "minor_version": 1, "data": records}))
    await async_check_legacy_dashboard(hass)
    issue = _issue(hass)
    assert issue is not None
    assert issue.translation_placeholders["url"].startswith("https://github.com/")
    # Removed under Added from links and added again as an integration
    records[key]["category"] = "integration"
    store.write_text(json.dumps({"version": 1, "data": records}))
    await async_check_legacy_dashboard(hass)
    assert _issue(hass) is None


@pytest.mark.parametrize(
    "content",
    [
        json.dumps({"data": {REPOSITORY_ID: {"full_name": REPOSITORY_NAMES[0], "category": "integration"}}}),
        json.dumps({"data": {"42": {"full_name": "someone/else", "category": "plugin"}}}),
        json.dumps({"data": ["not", "a", "dict"]}),
        "not json",
    ],
)
async def test_no_repair_from_other_marketplace_records(hass, config, content):
    _store(config, content)
    await async_check_legacy_dashboard(hass)
    assert _issue(hass) is None


async def test_no_repair_without_anything(hass, config):
    await async_check_legacy_dashboard(hass)
    assert _issue(hass) is None
