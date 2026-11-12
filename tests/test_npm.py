"""Tests for the Nginx Proxy Manager side of the Reverse Proxy integration."""

import pytest
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.reverse_proxy.const import DOMAIN
from custom_components.reverse_proxy.coordinator import npm_expiry

HOST = "http://npm.local:81"
DATA = {
    "host": HOST,
    "username": "admin@example.org",
    "password": "secret",
    "scan_interval": 30,
    "verify_ssl": True,
    "proxy_type": "nginx_proxy_manager",
}
# Default entity ids: the device name ("Nginx Proxy Manager") and the translated name.
N = "nginx_proxy_manager"

STATUS = {"status": "OK", "setup": True, "version": {"major": 2, "minor": 12, "revision": 3}}
PROXY_HOSTS = [
    {
        "id": 1,
        "domain_names": ["ha.example.org"],
        "forward_scheme": "http",
        "forward_host": "10.0.0.2",
        "forward_port": 8123,
        "certificate_id": 3,
        "enabled": True,
    },
    {
        "id": 2,
        "domain_names": ["nas.example.org", "files.example.org"],
        "forward_scheme": "https",
        "forward_host": "10.0.0.3",
        "forward_port": 5001,
        "certificate_id": 0,
        "enabled": 0,
    },
]
REDIRECTION_HOSTS = [
    {
        "id": 1,
        "domain_names": ["old.example.org"],
        "forward_scheme": "https",
        "forward_domain_name": "new.example.org",
        "forward_http_code": 301,
        "enabled": True,
    },
    {"id": 2, "domain_names": ["www.example.org"], "forward_scheme": "auto", "forward_domain_name": "example.org"},
]
CERTIFICATES = [
    {
        "id": 3,
        "provider": "letsencrypt",
        "nice_name": "ha.example.org",
        "domain_names": ["ha.example.org"],
        "expires_on": "2099-02-10 12:00:00",
        "meta": {
            "letsencrypt_email": "admin@example.org",
            "dns_challenge": True,
            "dns_provider": "cloudflare",
            "dns_provider_credentials": "dns_cloudflare_api_token = abc",
        },
    },
    {
        "id": 4,
        "provider": "other",
        "nice_name": "Imported",
        "domain_names": [],
        "expires_on": "2099-01-01 00:00:00",
        "meta": {"certificate": "-----BEGIN CERTIFICATE-----", "certificate_key": "-----BEGIN PRIVATE KEY-----"},
    },
]
ACCESS_LISTS = [{"id": 1, "name": "LAN only"}]


def mock_npm(aioclient_mock, *, status=STATUS, proxy_hosts=PROXY_HOSTS, token_status=200, host=HOST):
    """Register a working Nginx Proxy Manager API on aioclient_mock."""
    if token_status == 200:
        aioclient_mock.post(f"{host}/api/tokens", json={"token": "tok", "expires": "2099-01-01T00:00:00Z"})
    else:
        aioclient_mock.post(f"{host}/api/tokens", status=token_status, json={"error": {"message": "Invalid"}})
    if isinstance(status, int):
        aioclient_mock.get(f"{host}/api/", status=status, text="boom")
    else:
        aioclient_mock.get(f"{host}/api/", json=status)
    if isinstance(proxy_hosts, int):
        aioclient_mock.get(f"{host}/api/nginx/proxy-hosts", status=proxy_hosts, text="boom")
    else:
        aioclient_mock.get(f"{host}/api/nginx/proxy-hosts", json=proxy_hosts)
    aioclient_mock.get(f"{host}/api/nginx/redirection-hosts", json=REDIRECTION_HOSTS)
    aioclient_mock.get(f"{host}/api/nginx/certificates", json=CERTIFICATES)
    aioclient_mock.get(f"{host}/api/nginx/access-lists", json=ACCESS_LISTS)


@pytest.fixture
def entry(hass: HomeAssistant) -> MockConfigEntry:
    entry = MockConfigEntry(domain=DOMAIN, data=DATA, unique_id=HOST, version=2, minor_version=1)
    entry.add_to_hass(hass)
    return entry


async def _setup(hass, entry):
    assert await async_setup_component(hass, "http", {})
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


def _calls(aioclient_mock, path, method=None):
    return [
        c
        for c in aioclient_mock.mock_calls
        if str(c[1]).split("?")[0] == f"{HOST}{path}" and (method is None or c[0] == method)
    ]


# ── Entities ──────────────────────────────────────────────────────────────────


async def test_setup_entities(hass, aioclient_mock, entry):
    """Proxy hosts as rules, redirection hosts, certificates, access lists and version; no option switch."""
    mock_npm(aioclient_mock)
    await _setup(hass, entry)
    assert entry.state is ConfigEntryState.LOADED

    running = hass.states.get(f"binary_sensor.{N}_proxy_running")
    assert running.state == "on"
    assert running.attributes["proxy_type"] == "nginx_proxy_manager"
    assert running.attributes["features"] == ["access_rules", "certificates", "redirects", "toggle_rules", "version"]
    assert hass.states.get(f"binary_sensor.{N}_tls_enabled").state == "on"

    rules = hass.states.get(f"sensor.{N}_proxy_rules")
    assert rules.state == "2"
    assert rules.attributes["rules"] == [
        {"domain": "ha.example.org", "target": "http://10.0.0.2:8123", "enabled": True, "tls": True},
        {"domain": "nas.example.org", "target": "https://10.0.0.3:5001", "enabled": False, "tls": False},
    ]
    assert rules.attributes["redirects"] == [
        {"RedirectURL": "old.example.org", "TargetURL": "https://new.example.org", "StatusCode": 301},
        {"RedirectURL": "www.example.org", "TargetURL": "example.org", "StatusCode": 301},
    ]
    assert hass.states.get(f"sensor.{N}_active_rules").state == "1"
    assert hass.states.get(f"sensor.{N}_access_rules").state == "1"
    assert hass.states.get(f"sensor.{N}_inbound_port").state == "443"
    assert hass.states.get(f"sensor.{N}_version").state == "2.12.3"
    assert hass.states.get(f"sensor.{N}_tls_certificates").state == "2"

    # Certificates: the first domain name, else the nice name of an imported one.
    expiry = hass.states.get(f"sensor.{N}_ha_example_org_certificate")
    assert expiry is not None
    assert expiry.state == "2099-02-10T12:00:00+00:00"
    assert hass.states.get(f"binary_sensor.{N}_ha_example_org_certificate_expiring").state == "off"
    assert len(hass.states.async_entity_ids("button")) == 2

    # No option switch: NPM has no global HTTPS redirect, port 80 or dev mode.
    assert hass.states.async_entity_ids("switch") == []
    # NPM does not check the upstreams: their health is unknown.
    assert hass.states.get(f"binary_sensor.{N}_ha_example_org_upstream").state == "unknown"


async def test_device_carries_the_version(hass, aioclient_mock, entry):
    mock_npm(aioclient_mock)
    await _setup(hass, entry)
    registry = er.async_get(hass)
    device_id = registry.async_get(f"sensor.{N}_proxy_rules").device_id
    from homeassistant.helpers import device_registry as dr

    device = dr.async_get(hass).async_get(device_id)
    assert device.model == "Nginx Proxy Manager"
    assert device.sw_version == "2.12.3"


async def test_bearer_token_sent_and_login_once(hass, aioclient_mock, entry):
    mock_npm(aioclient_mock)
    await _setup(hass, entry)
    login = _calls(aioclient_mock, "/api/tokens", "POST")
    assert len(login) == 1
    assert login[0][2] == {"identity": "admin@example.org", "secret": "secret"}
    assert _calls(aioclient_mock, "/api/nginx/proxy-hosts")[0][3]["Authorization"] == "Bearer tok"
    await entry.runtime_data.async_refresh()
    await hass.async_block_till_done()
    assert len(_calls(aioclient_mock, "/api/tokens", "POST")) == 1


async def test_expired_token_logs_in_again(hass, aioclient_mock, entry):
    mock_npm(aioclient_mock)
    await _setup(hass, entry)
    aioclient_mock.clear_requests()
    aioclient_mock.post(f"{HOST}/api/tokens", json={"token": "tok2"})
    aioclient_mock.get(f"{HOST}/api/", status=401, json={"error": {"message": "Token expired"}})
    await entry.runtime_data.async_refresh()
    await hass.async_block_till_done()
    # The token is asked for again once, then the second 401 asks the user for the password.
    assert len(_calls(aioclient_mock, "/api/tokens", "POST")) == 1
    assert any(f["context"].get("source") == "reauth" for f in hass.config_entries.flow.async_progress())


async def test_status_failure_makes_entities_unavailable(hass, aioclient_mock, entry):
    mock_npm(aioclient_mock)
    await _setup(hass, entry)
    aioclient_mock.clear_requests()
    mock_npm(aioclient_mock, status=500)
    await entry.runtime_data.async_refresh()
    await hass.async_block_till_done()
    assert hass.states.get(f"sensor.{N}_proxy_rules").state == "unavailable"


async def test_proxy_host_failure_keeps_rules(hass, aioclient_mock, entry):
    mock_npm(aioclient_mock)
    await _setup(hass, entry)
    aioclient_mock.clear_requests()
    mock_npm(aioclient_mock, proxy_hosts=500)
    await entry.runtime_data.async_refresh()
    await hass.async_block_till_done()
    assert hass.states.get(f"sensor.{N}_proxy_rules").state == "2"
    assert hass.states.get(f"binary_sensor.{N}_nas_example_org_upstream") is not None


async def test_diagnostics_redact_npm_secrets(hass, aioclient_mock, entry):
    """DNS provider credentials, the key of an imported certificate and the account's email never leave."""
    from homeassistant.components.diagnostics import REDACTED

    from custom_components.reverse_proxy.diagnostics import async_get_config_entry_diagnostics

    mock_npm(aioclient_mock)
    await _setup(hass, entry)
    diag = await async_get_config_entry_diagnostics(hass, entry)
    certs = diag["coordinator"]["data"]["certificates"]
    assert certs[0]["meta"]["dns_provider_credentials"] == REDACTED
    assert certs[0]["meta"]["letsencrypt_email"] == REDACTED
    assert certs[0]["meta"]["dns_provider"] == "cloudflare"
    assert certs[1]["meta"]["certificate_key"] == REDACTED
    assert diag["entry"]["data"]["username"] == REDACTED
    assert diag["entry"]["data"]["password"] == REDACTED
    assert "abc" not in str(diag)


async def test_refused_login_starts_reauth(hass, aioclient_mock, entry):
    mock_npm(aioclient_mock, token_status=401)
    await _setup(hass, entry)
    assert entry.state is ConfigEntryState.SETUP_ERROR
    assert any(f["context"].get("source") == "reauth" for f in hass.config_entries.flow.async_progress())


# ── Actions ───────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(("enable", "action"), [(False, "disable"), (True, "enable")])
async def test_toggle_proxy_rule(hass, aioclient_mock, entry, enable, action):
    """The action posts to the enable / disable endpoint of the proxy host of the domain."""
    mock_npm(aioclient_mock)
    aioclient_mock.post(f"{HOST}/api/nginx/proxy-hosts/2/{action}", json=True)
    await _setup(hass, entry)
    await hass.services.async_call(
        DOMAIN, "toggle_proxy_rule", {"domain": "nas.example.org", "enable": enable}, blocking=True
    )
    call = _calls(aioclient_mock, f"/api/nginx/proxy-hosts/2/{action}", "POST")
    assert len(call) == 1
    assert call[0][3]["Authorization"] == "Bearer tok"


async def test_toggle_unknown_domain(hass, aioclient_mock, entry):
    mock_npm(aioclient_mock)
    await _setup(hass, entry)
    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(
            DOMAIN, "toggle_proxy_rule", {"domain": "nope.example.org", "enable": True}, blocking=True
        )


async def test_renew_letsencrypt_certificate(hass, aioclient_mock, entry):
    mock_npm(aioclient_mock)
    aioclient_mock.post(f"{HOST}/api/nginx/certificates/3/renew", json={"id": 3})
    await _setup(hass, entry)
    button = next(e for e in hass.states.async_entity_ids("button") if "ha_example_org" in e)
    await hass.services.async_call("button", "press", {"entity_id": button}, blocking=True)
    assert len(_calls(aioclient_mock, "/api/nginx/certificates/3/renew", "POST")) == 1


async def test_imported_certificate_is_not_renewed(hass, aioclient_mock, entry):
    mock_npm(aioclient_mock)
    await _setup(hass, entry)
    button = next(e for e in hass.states.async_entity_ids("button") if "imported" in e)
    with pytest.raises(HomeAssistantError) as err:
        await hass.services.async_call("button", "press", {"entity_id": button}, blocking=True)
    assert err.value.translation_key == "renewal_failed"
    assert not _calls(aioclient_mock, "/api/nginx/certificates/4/renew")


@pytest.mark.parametrize(
    ("value", "iso"),
    [
        ("2026-02-10 12:00:00", "2026-02-10T12:00:00+00:00"),
        ("2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00+00:00"),
        ("", None),
        (None, None),
        ("soon", None),
    ],
)
def test_npm_expiry(value, iso):
    assert npm_expiry(value) == iso


# ── Config flow ───────────────────────────────────────────────────────────────


async def _flow(hass, user_input):
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] is FlowResultType.MENU
    assert "nginx_proxy_manager" in result["menu_options"]
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"next_step_id": "nginx_proxy_manager"})
    assert result["type"] is FlowResultType.FORM
    return await hass.config_entries.flow.async_configure(result["flow_id"], user_input)


async def test_config_flow(hass, aioclient_mock):
    mock_npm(aioclient_mock)
    result = await _flow(hass, {"host": HOST, "username": "admin@example.org", "password": "secret"})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert "Nginx Proxy Manager" in result["title"]
    assert result["data"]["proxy_type"] == "nginx_proxy_manager"
    assert result["data"]["username"] == "admin@example.org"


async def test_config_flow_refused_credentials(hass, aioclient_mock):
    mock_npm(aioclient_mock, token_status=401)
    result = await _flow(hass, {"host": HOST, "username": "admin@example.org", "password": "wrong"})
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"base": "invalid_auth"}


async def test_config_flow_two_factor_account(hass, aioclient_mock):
    aioclient_mock.post(f"{HOST}/api/tokens", json={"requires_2fa": True, "challenge_token": "x"})
    result = await _flow(hass, {"host": HOST, "username": "admin@example.org", "password": "secret"})
    assert result["errors"] == {"base": "invalid_auth"}


async def test_config_flow_other_server_error_page(hass, aioclient_mock):
    """A 400 without JSON comes from another server: a wrong address, not refused credentials."""
    aioclient_mock.post(f"{HOST}/api/tokens", status=400, text="<html>Bad Request</html>")
    result = await _flow(hass, {"host": HOST, "username": "admin@example.org", "password": "secret"})
    assert result["errors"] == {"base": "cannot_connect"}


async def test_config_flow_not_an_npm(hass, aioclient_mock):
    aioclient_mock.post(f"{HOST}/api/tokens", text="<html>nope</html>")
    result = await _flow(hass, {"host": HOST, "username": "admin@example.org", "password": "secret"})
    assert result["errors"] == {"base": "cannot_connect"}


async def test_reconfigure_asks_for_the_email(hass, aioclient_mock, entry):
    """NPM's account field is "email" in the reconfigure form, saved as the entry's username."""
    mock_npm(aioclient_mock)
    await _setup(hass, entry)
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": "reconfigure", "entry_id": entry.entry_id}
    )
    assert result["step_id"] == "reconfigure"
    fields = [str(key) for key in result["data_schema"].schema]
    assert "email" in fields
    assert "username" not in fields
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"host": HOST, "email": "ops@example.org", "password": "new"}
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "reconfigure_successful"
    assert entry.data["username"] == "ops@example.org"
    assert entry.data["password"] == "new"
