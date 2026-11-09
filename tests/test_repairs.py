"""Repairs issues: a certificate expiring soon or expired, an upstream offline for a while."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from homeassistant.helpers import issue_registry as ir

from custom_components.reverse_proxy.const import DOMAIN

from .test_init import PROXY_STATUS, _setup, entry, mock_zoraxy  # noqa: F401 - entry is a fixture


def _status(not_after: str) -> dict:
    status = {**PROXY_STATUS, "Option": {**PROXY_STATUS["Option"]}}
    status["Option"]["TlsManager"] = {
        "LoadedCerts": [{"PriKey": "a.key", "Cert": {"DNSNames": ["a.example.org"], "NotAfter": not_after}}]
    }
    return status


def _issues(hass) -> dict[str, ir.IssueEntry]:
    return {i: e for (d, i), e in ir.async_get(hass).issues.items() if d == DOMAIN}


async def test_certificate_issues_follow_the_expiry(hass, aioclient_mock, entry):  # noqa: F811
    soon = (datetime.now(UTC) + timedelta(days=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
    mock_zoraxy(aioclient_mock, status=_status(soon))
    await _setup(hass, entry)
    issue = _issues(hass)[f"certificate_{entry.entry_id}_a.example.org"]
    assert issue.translation_key == "certificate_expiring"
    assert issue.severity is ir.IssueSeverity.WARNING
    assert issue.translation_placeholders["domain"] == "a.example.org"

    # Expired: an error.
    aioclient_mock.clear_requests()
    mock_zoraxy(aioclient_mock, status=_status("2020-01-01T00:00:00Z"))
    await entry.runtime_data.async_refresh()
    await hass.async_block_till_done()
    issue = _issues(hass)[f"certificate_{entry.entry_id}_a.example.org"]
    assert issue.translation_key == "certificate_expired"
    assert issue.severity is ir.IssueSeverity.ERROR

    # Renewed: gone.
    aioclient_mock.clear_requests()
    mock_zoraxy(aioclient_mock)
    await entry.runtime_data.async_refresh()
    await hass.async_block_till_done()
    assert not _issues(hass)


async def test_upstream_issue_after_ten_minutes_offline(hass, aioclient_mock, entry, freezer):  # noqa: F811
    down = {"app.example.org": [{"ID": "app.example.org", "Online": False, "StatusCode": 502}]}
    mock_zoraxy(aioclient_mock, uptime=down)
    await _setup(hass, entry)
    # Down for a moment (a restart of the service): nothing yet.
    assert not _issues(hass)
    coordinator = entry.runtime_data
    freezer.tick(timedelta(minutes=11))
    coordinator._uptime_checked -= 700
    await coordinator.async_refresh()
    await hass.async_block_till_done()
    issue = _issues(hass)[f"upstream_{entry.entry_id}_app.example.org"]
    assert issue.translation_key == "upstream_offline"

    # Back up: gone. The entry removed: its issues too.
    aioclient_mock.clear_requests()
    mock_zoraxy(aioclient_mock)
    coordinator._uptime_checked -= 700
    await coordinator.async_refresh()
    await hass.async_block_till_done()
    assert not _issues(hass)


async def test_issues_removed_with_the_entry(hass, aioclient_mock, entry):  # noqa: F811
    soon = (datetime.now(UTC) + timedelta(days=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
    mock_zoraxy(aioclient_mock, status=_status(soon))
    await _setup(hass, entry)
    assert _issues(hass)
    await hass.config_entries.async_remove(entry.entry_id)
    await hass.async_block_till_done()
    assert not _issues(hass)
