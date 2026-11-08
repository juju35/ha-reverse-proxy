"""Tests for the Traefik side of the Reverse Proxy integration."""

from unittest.mock import patch

import pytest
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.reverse_proxy.const import DOMAIN
from custom_components.reverse_proxy.coordinator import router_hosts

HOST = "http://traefik.local:8080"
DATA = {
    "host": HOST,
    "username": "",
    "password": "",
    "scan_interval": 30,
    "verify_ssl": True,
    "proxy_type": "traefik",
}
# Default entity ids: the device name ("Traefik Reverse Proxy") and the translated name.
T = "traefik_reverse_proxy"

OVERVIEW = {"http": {"routers": {"total": 4}, "services": {"total": 3}, "middlewares": {"total": 3}}}
VERSION = {"Version": "3.3.6", "Codename": "saintnectaire"}
ENTRYPOINTS = [
    {"name": "web", "address": ":80"},
    {"name": "websecure", "address": ":443", "http": {"tls": {}}},
    {"name": "traefik", "address": ":8080"},
]
ROUTERS = [
    {
        "name": "ha@docker",
        "provider": "docker",
        "status": "enabled",
        "rule": "Host(`ha.example.org`)",
        "service": "ha",
        "entryPoints": ["websecure"],
        "tls": {"certResolver": "le"},
    },
    {
        "name": "nas@file",
        "provider": "file",
        "status": "enabled",
        "rule": "Host(`nas.example.org`) && PathPrefix(`/`)",
        "service": "nas@file",
        "tls": {},
    },
    {
        "name": "photos@docker",
        "provider": "docker",
        "status": "disabled",
        "rule": "Host(`photos.example.org`)",
        "service": "photos",
    },
    {
        "name": "api@internal",
        "provider": "internal",
        "status": "enabled",
        "rule": "PathPrefix(`/api`)",
        "service": "api@internal",
    },
]
SERVICES = [
    {
        "name": "ha@docker",
        "provider": "docker",
        "status": "enabled",
        "loadBalancer": {"servers": [{"url": "http://10.0.0.2:8123"}]},
    },
    {
        "name": "nas@file",
        "provider": "file",
        "status": "enabled",
        "loadBalancer": {"servers": [{"url": "http://10.0.0.3:9999"}, {"url": "http://10.0.0.4:9999"}]},
        "serverStatus": {"http://10.0.0.3:9999": "UP", "http://10.0.0.4:9999": "DOWN"},
    },
    {"name": "api@internal", "provider": "internal", "status": "enabled"},
]
MIDDLEWARES = [
    {
        "name": "redirect-to-https@docker",
        "provider": "docker",
        "redirectScheme": {"scheme": "https", "permanent": True},
    },
    {
        "name": "www@file",
        "provider": "file",
        "redirectRegex": {"regex": "^https://example.org/(.*)", "replacement": "https://www.example.org/${1}"},
    },
    {"name": "auth@file", "provider": "file", "basicAuth": {"users": ["admin:$apr1$x"]}},
    {
        "name": "dashboard_redirect@internal",
        "provider": "internal",
        "redirectRegex": {"regex": "^(.*)/dashboard$", "replacement": "${1}/dashboard/"},
    },
]


def mock_traefik(aioclient_mock, *, overview=OVERVIEW, routers=ROUTERS, services=SERVICES, host=HOST):
    """Register a working Traefik API on aioclient_mock."""
    aioclient_mock.get(f"{host}/api/version", json=VERSION)
    if isinstance(overview, int):
        aioclient_mock.get(f"{host}/api/overview", status=overview, text="boom")
    else:
        aioclient_mock.get(f"{host}/api/overview", json=overview)
    if isinstance(routers, int):
        aioclient_mock.get(f"{host}/api/http/routers", status=routers, text="boom")
    else:
        aioclient_mock.get(f"{host}/api/http/routers", json=routers)
    aioclient_mock.get(f"{host}/api/http/services", json=services)
    aioclient_mock.get(f"{host}/api/http/middlewares", json=MIDDLEWARES)
    aioclient_mock.get(f"{host}/api/entrypoints", json=ENTRYPOINTS)


@pytest.fixture
def entry(hass: HomeAssistant) -> MockConfigEntry:
    entry = MockConfigEntry(domain=DOMAIN, data=DATA, unique_id=HOST, version=2, minor_version=1)
    entry.add_to_hass(hass)
    return entry


async def _setup(hass, entry):
    assert await async_setup_component(hass, "http", {})
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


def _calls(aioclient_mock, path):
    return [c for c in aioclient_mock.mock_calls if str(c[1]).startswith(f"{HOST}{path}")]


# ── Entities ──────────────────────────────────────────────────────────────────


async def test_setup_entities(hass, aioclient_mock, entry):
    """Rules from the routers (Traefik's own aside), middlewares, port, version; no switch, no certificate."""
    mock_traefik(aioclient_mock)
    await _setup(hass, entry)
    assert entry.state is ConfigEntryState.LOADED

    running = hass.states.get(f"binary_sensor.{T}_proxy_running")
    assert running.state == "on"
    assert running.attributes["proxy_type"] == "traefik"
    assert running.attributes["features"] == ["middlewares", "redirects", "version"]
    assert hass.states.get(f"binary_sensor.{T}_tls_enabled").state == "on"

    rules = hass.states.get(f"sensor.{T}_proxy_rules")
    assert rules.state == "3"  # api@internal is not a proxy rule
    assert rules.attributes["rules"] == [
        {"domain": "ha.example.org", "target": "http://10.0.0.2:8123", "enabled": True, "tls": True},
        {"domain": "nas.example.org", "target": "http://10.0.0.3:9999", "enabled": True, "tls": True},
        {"domain": "photos.example.org", "target": "photos", "enabled": False, "tls": False},
    ]
    assert rules.attributes["redirects"] == [
        {"RedirectURL": "redirect-to-https", "TargetURL": "https://…", "StatusCode": 301},
        {"RedirectURL": "^https://example.org/(.*)", "TargetURL": "https://www.example.org/${1}", "StatusCode": 302},
    ]
    assert hass.states.get(f"sensor.{T}_active_rules").state == "2"
    assert hass.states.get(f"sensor.{T}_middlewares").state == "3"
    assert hass.states.get(f"sensor.{T}_inbound_port").state == "443"
    assert hass.states.get(f"sensor.{T}_version").state == "3.3.6"

    # No Zoraxy-only entity: option switches, certificates, access rules.
    assert hass.states.async_entity_ids("switch") == []
    assert hass.states.async_entity_ids("button") == []
    assert hass.states.get(f"sensor.{T}_tls_certificates") is None
    assert hass.states.get(f"sensor.{T}_access_rules") is None
    assert hass.states.get(f"binary_sensor.{T}_https_redirect") is None


async def test_upstream_health_from_server_status(hass, aioclient_mock, entry):
    """A service's serverStatus (health checks on) gives the rule's upstream health; none: unknown."""
    mock_traefik(aioclient_mock)
    await _setup(hass, entry)
    nas = hass.states.get(f"binary_sensor.{T}_nas_example_org_upstream")
    assert nas.state == "on"
    assert nas.attributes["upstreams"] == [
        {"url": "http://10.0.0.3:9999", "online": True, "status_code": None, "latency_ms": None, "checked": None},
        {"url": "http://10.0.0.4:9999", "online": False, "status_code": None, "latency_ms": None, "checked": None},
    ]
    assert hass.states.get(f"binary_sensor.{T}_ha_example_org_upstream").state == "unknown"
    assert hass.states.get(f"binary_sensor.{T}_photos_example_org_upstream").state == "unknown"


async def test_device_carries_the_version(hass, aioclient_mock, entry):
    mock_traefik(aioclient_mock)
    await _setup(hass, entry)
    registry = er.async_get(hass)
    device_id = registry.async_get(f"sensor.{T}_proxy_rules").device_id
    from homeassistant.helpers import device_registry as dr

    device = dr.async_get(hass).async_get(device_id)
    assert device.manufacturer == "Traefik Labs"
    assert device.sw_version == "3.3.6"
    assert device.configuration_url == HOST


async def test_version_polled_hourly(hass, aioclient_mock, entry):
    mock_traefik(aioclient_mock)
    await _setup(hass, entry)
    assert len(_calls(aioclient_mock, "/api/version")) == 1
    await entry.runtime_data.async_refresh()
    await hass.async_block_till_done()
    assert len(_calls(aioclient_mock, "/api/version")) == 1
    assert len(_calls(aioclient_mock, "/api/overview")) == 2


async def test_overview_failure_makes_entities_unavailable(hass, aioclient_mock, entry):
    mock_traefik(aioclient_mock)
    await _setup(hass, entry)
    aioclient_mock.clear_requests()
    mock_traefik(aioclient_mock, overview=500)
    await entry.runtime_data.async_refresh()
    await hass.async_block_till_done()
    assert hass.states.get(f"sensor.{T}_proxy_rules").state == "unavailable"


async def test_router_failure_keeps_rules(hass, aioclient_mock, entry):
    """The router list is optional: on failure the previous rules stay and no rule entity is removed."""
    mock_traefik(aioclient_mock)
    await _setup(hass, entry)
    aioclient_mock.clear_requests()
    mock_traefik(aioclient_mock, routers=500)
    await entry.runtime_data.async_refresh()
    await hass.async_block_till_done()
    assert hass.states.get(f"sensor.{T}_proxy_rules").state == "3"
    assert hass.states.get(f"binary_sensor.{T}_nas_example_org_upstream").state == "on"


async def test_rule_entities_follow_the_routers(hass, aioclient_mock, entry):
    mock_traefik(aioclient_mock)
    await _setup(hass, entry)
    aioclient_mock.clear_requests()
    mock_traefik(
        aioclient_mock,
        routers=[
            *ROUTERS[:1],
            {
                "name": "new@docker",
                "provider": "docker",
                "status": "enabled",
                "rule": "Host(`new.example.org`)",
                "service": "new",
            },
        ],
    )
    await entry.runtime_data.async_refresh()
    await hass.async_block_till_done()
    assert hass.states.get(f"binary_sensor.{T}_new_example_org_upstream") is not None
    registry = er.async_get(hass)
    assert registry.async_get(f"binary_sensor.{T}_nas_example_org_upstream") is None


async def test_unauthorized_starts_reauth(hass, aioclient_mock, entry):
    aioclient_mock.get(f"{HOST}/api/overview", status=401, text="Unauthorized")
    await _setup(hass, entry)
    assert entry.state is ConfigEntryState.SETUP_ERROR
    assert any(f["context"].get("source") == "reauth" for f in hass.config_entries.flow.async_progress())


async def test_toggle_proxy_rule_is_refused(hass, aioclient_mock, entry):
    """Traefik's API is read-only: the action says so, in the proxy's name."""
    mock_traefik(aioclient_mock)
    await _setup(hass, entry)
    with pytest.raises(HomeAssistantError) as err:
        await hass.services.async_call(
            DOMAIN, "toggle_proxy_rule", {"domain": "ha.example.org", "enable": False}, blocking=True
        )
    assert err.value.translation_key == "not_supported"
    assert err.value.translation_placeholders == {"proxy": "Traefik"}


async def test_basic_auth_is_sent(hass, aioclient_mock):
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={**DATA, "username": "admin", "password": "secret"},
        unique_id=HOST,
        version=2,
        minor_version=1,
    )
    entry.add_to_hass(hass)
    mock_traefik(aioclient_mock)
    await _setup(hass, entry)
    headers = _calls(aioclient_mock, "/api/overview")[0][3]
    assert headers["Authorization"].startswith("Basic ")


@pytest.mark.parametrize(
    ("rule", "hosts"),
    [
        ("Host(`a.example.org`)", ["a.example.org"]),
        ("Host(`a.example.org`, `b.example.org`) && PathPrefix(`/x`)", ["a.example.org", "b.example.org"]),
        ("HostRegexp(`{sub:.+}.example.org`)", ["{sub:.+}.example.org"]),
        ("PathPrefix(`/api`)", []),
        (None, []),
    ],
)
def test_router_hosts(rule, hosts):
    assert router_hosts(rule) == hosts


# ── Config flow ───────────────────────────────────────────────────────────────


async def _start_traefik_flow(hass):
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] is FlowResultType.MENU
    assert result["menu_options"] == ["zoraxy", "traefik"]
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"next_step_id": "traefik"})
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "traefik"
    assert result["description_placeholders"] == {"proxy": "Traefik"}
    return result


async def test_config_flow_without_credentials(hass, aioclient_mock):
    mock_traefik(aioclient_mock)
    result = await _start_traefik_flow(hass)
    with patch("custom_components.reverse_proxy.async_setup_entry", return_value=True):
        result = await hass.config_entries.flow.async_configure(result["flow_id"], {"host": f"{HOST}/"})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == f"Traefik ({HOST})"
    assert result["data"] == DATA
    assert result["result"].unique_id == HOST


async def test_config_flow_not_a_traefik(hass, aioclient_mock):
    """A server that answers /api/version with something else is not a Traefik."""
    aioclient_mock.get(f"{HOST}/api/version", text="<html>login</html>")
    result = await _start_traefik_flow(hass)
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"host": HOST})
    assert result["errors"] == {"base": "cannot_connect"}


async def test_config_flow_refused_credentials(hass, aioclient_mock):
    aioclient_mock.get(f"{HOST}/api/version", status=401, text="Unauthorized")
    result = await _start_traefik_flow(hass)
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"host": HOST, "username": "admin", "password": "bad"}
    )
    assert result["errors"] == {"base": "invalid_auth"}


async def test_config_flow_duplicate(hass, aioclient_mock, entry):
    result = await _start_traefik_flow(hass)
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"host": "HTTP://Traefik.local:8080/"})
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "already_configured"
    assert result["description_placeholders"] == {"proxy": "Traefik"}


async def test_reauth_changes_the_basic_auth(hass, aioclient_mock, entry):
    mock_traefik(aioclient_mock)
    await _setup(hass, entry)
    entry.async_start_reauth(hass)
    await hass.async_block_till_done()
    flow = hass.config_entries.flow.async_progress()[0]
    form = await hass.config_entries.flow.async_configure(flow["flow_id"])
    assert {k: form["description_placeholders"][k] for k in ("proxy", "host", "username")} == {
        "proxy": "Traefik",
        "host": HOST,
        "username": "",
    }
    result = await hass.config_entries.flow.async_configure(flow["flow_id"], {"username": "admin", "password": "new"})
    assert result["reason"] == "reauth_successful"
    assert entry.data["username"] == "admin"
    assert entry.data["password"] == "new"
