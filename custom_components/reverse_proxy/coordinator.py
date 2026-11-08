"""Coordinators: one per reverse proxy, behind one interface the entities and the card rely on.

Each coordinator keeps the raw answers of its proxy in `data` (for the diagnostics) and exposes them through the
methods of ProxyDataUpdateCoordinator: running flag, option flags, port, proxy rules, redirects, certificates and
upstream health, all in the same shape whatever the proxy.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from datetime import UTC, datetime, timedelta
from typing import Any, ClassVar

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed, HomeAssistantError
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import ProxyAuthError, ProxyClient, ProxyError, TraefikClient, ZoraxyClient
from .const import (
    ACME_POLL_SECONDS,
    CONF_PROXY_TYPE,
    CONF_SCAN_INTERVAL,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    FEATURES,
    MIN_SCAN_INTERVAL,
    PROXY_TRAEFIK,
    PROXY_ZORAXY,
    UPTIME_POLL_SECONDS,
    UPTIME_STALE_SECONDS,
    proxy_name,
)

_LOGGER = logging.getLogger(__name__)

VERSION_POLL_SECONDS = ACME_POLL_SECONDS  # Traefik's version is re-read at most once an hour


def entry_settings(entry: ConfigEntry) -> dict[str, Any]:
    """Entry data overridden by the options (scan interval, TLS verification)."""
    return {**entry.data, **entry.options}


def entry_proxy_type(entry: ConfigEntry) -> str:
    """Proxy type of an entry; the entries created up to 1.14.x (Zoraxy only) have none."""
    return entry.data.get(CONF_PROXY_TYPE, PROXY_ZORAXY)


class ProxyDataUpdateCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Common interface of the reverse proxy coordinators."""

    proxy_type: str
    # Translation key of the option flags: the proxy's name for each.
    OPTION_KEYS: ClassVar[dict[str, str]] = {}

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, client: ProxyClient) -> None:
        seconds = int(entry_settings(entry).get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL))
        super().__init__(
            hass,
            _LOGGER,
            config_entry=entry,
            name=f"{DOMAIN} {self.proxy_type}",
            update_interval=timedelta(seconds=max(MIN_SCAN_INTERVAL, seconds)),
        )
        self.client = client
        self.features = FEATURES[self.proxy_type]
        self.brand = proxy_name(self.proxy_type)
        # Only a list actually returned by the proxy may remove the entities of a certificate or a rule.
        self.cert_list_loaded = False
        self.proxy_list_loaded = False

    def _data(self) -> dict[str, Any]:
        return self.data or {}

    def _previous(self, key: str) -> list:
        return self._data().get(key, [])

    async def _optional(self, endpoint: str, method: str = "GET", fields: dict[str, str] | None = None) -> Any:
        """An endpoint whose failure keeps the previous data instead of failing the update."""
        try:
            return await self.client.fetch_json(endpoint, method, fields)
        except ProxyAuthError:
            raise
        except ProxyError as err:
            _LOGGER.debug("%s: API error on %s: %s", self.brand, endpoint, err)
            return None

    def _error(self, key: str, **placeholders: str) -> HomeAssistantError:
        return HomeAssistantError(
            translation_domain=DOMAIN,
            translation_key=key,
            translation_placeholders={"proxy": self.brand, **placeholders},
        )

    # ── Normalized view ───────────────────────────────────────────────────────

    @property
    def running(self) -> bool:
        raise NotImplementedError

    @property
    def tls_enabled(self) -> bool:
        return False

    @property
    def port(self) -> int | None:
        return None

    @property
    def version(self) -> str | None:
        return None

    def flag(self, key: str) -> bool | None:
        """An option flag (https_redirect, port_80, development_mode); None when the proxy has none."""
        return None

    def rules(self) -> list[dict[str, Any]]:
        """Proxy rules: {domain, target, enabled, tls}."""
        return []

    def rule_domains(self) -> list[str]:
        """Domains of the proxy rules, which get an upstream health binary sensor each."""
        return [rule["domain"] for rule in self.rules() if rule.get("domain")]

    def rule_enabled(self, domain: str) -> bool | None:
        """Whether the rule of a domain is enabled; None when no rule has that domain."""
        return next((bool(rule["enabled"]) for rule in self.rules() if rule.get("domain") == domain), None)

    def redirects(self) -> list[dict[str, Any]]:
        """HTTP redirections: {RedirectURL, TargetURL, StatusCode} (the keys the card reads since 1.0)."""
        return []

    @property
    def access_rules_count(self) -> int:
        return 0

    @property
    def middlewares_count(self) -> int:
        return 0

    @property
    def cert_list(self) -> list[str]:
        return []

    @property
    def cert_expiry(self) -> dict[str, str]:
        return {}

    def upstream_checks(self, domain: str) -> list[dict[str, Any]]:
        """Last health check of each upstream of a rule: {url, online, status_code, latency_ms, checked}."""
        return []

    # ── Actions (Zoraxy only) ─────────────────────────────────────────────────

    async def set_flag(self, key: str, enable: bool) -> None:
        raise self._error("not_supported")

    async def toggle_rule(self, domain: str, enable: bool) -> None:
        raise self._error("not_supported")

    async def renew_certificate(self, domain: str) -> None:
        raise self._error("not_supported")


# ── Zoraxy ────────────────────────────────────────────────────────────────────


class ZoraxyDataUpdateCoordinator(ProxyDataUpdateCoordinator):
    """Zoraxy coordinator.

    The proxy status is required: when it can't be read the update fails and the entities become unavailable.
    The other lists are optional: on failure the previous value is kept.
    """

    proxy_type = PROXY_ZORAXY
    OPTION_KEYS: ClassVar[dict[str, str]] = {
        "https_redirect": "ForceHttpsRedirect",
        "port_80": "ListenOnPort80",
        "development_mode": "NoCache",
    }
    # Zoraxy endpoint, parameter name and HTTP method of each option: each handler reads its own (src/reverseproxy.go).
    OPTION_ENDPOINTS: ClassVar[dict[str, tuple[str, str, str]]] = {
        "https_redirect": ("/api/proxy/useHttpsRedirect", "set", "POST"),  # PostBool(r, "set")
        "port_80": ("/api/proxy/listenPort80", "enable", "POST"),
        "development_mode": ("/api/proxy/developmentMode", "enable", "GET"),  # GetBool(r, "enable") reads the query
    }

    client: ZoraxyClient

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, client: ZoraxyClient) -> None:
        super().__init__(hass, entry, client)
        self._uptime_checked: float | None = None
        self._acme_email: str | None = None
        self._acme_ca: str = "Let's Encrypt"
        self._acme_checked: float | None = None

    def _option(self) -> dict:
        status = self._data().get("proxy_status", {})
        # "Option": null must not break the state: fall back to no option.
        return (status.get("Option") or {}) if isinstance(status, dict) else {}

    @property
    def running(self) -> bool:
        # /api/proxy/status serialises the whole Router: Running goes false on "Stop service" while Option stays
        # filled. Option only decides when Running is missing.
        status = self._data().get("proxy_status")
        if not isinstance(status, dict):
            return False
        running = status.get("Running")
        return running if isinstance(running, bool) else bool(self._option())

    @property
    def tls_enabled(self) -> bool:
        return bool(self._option().get("UseTls", False))

    @property
    def port(self) -> int | None:
        return self._option().get("Port")

    def flag(self, key: str) -> bool | None:
        return bool(self._option().get(self.OPTION_KEYS[key], False))

    def rules(self) -> list[dict[str, Any]]:
        return [
            {
                "domain": r.get("RootOrMatchingDomain", "?"),
                "target": r["ActiveOrigins"][0].get("OriginIpOrDomain", "?") if r.get("ActiveOrigins") else "?",
                "enabled": not r.get("Disabled", False),
                "tls": r["ActiveOrigins"][0].get("RequireTLS", False) if r.get("ActiveOrigins") else False,
            }
            for r in self._previous("proxy_list")
            if isinstance(r, dict)
        ]

    def rule_domains(self) -> list[str]:
        return [
            domain
            for rule in self._previous("proxy_list")
            if isinstance(rule, dict) and isinstance(domain := rule.get("RootOrMatchingDomain"), str) and domain
        ]

    def redirects(self) -> list[dict[str, Any]]:
        return [
            {
                "RedirectURL": r.get("RedirectURL", "?"),
                "TargetURL": r.get("TargetURL", "?"),
                "StatusCode": r.get("StatusCode", 307),
            }
            for r in self._previous("redirect_list")
            if isinstance(r, dict)
        ]

    @property
    def access_rules_count(self) -> int:
        return len(self._previous("access_rules"))

    @property
    def cert_list(self) -> list[str]:
        return [d for d in self._previous("cert_list") if isinstance(d, str)]

    @property
    def cert_expiry(self) -> dict[str, str]:
        return self._data().get("cert_expiry", {})

    def upstream_checks(self, domain: str) -> list[dict[str, Any]]:
        """Last check of each upstream of the rule (several for a load-balanced rule), virtual directories aside.

        A target id of the uptime monitor is the rule's domain in lower case, "<domain> (upstream:<n>)" for a rule
        with several upstreams, or "<domain><path>" for a virtual directory.
        """
        key = domain.lower()
        uptime = self._data().get("uptime", {})
        checks = []
        for target, record in sorted(uptime.items()):
            if target != key and not target.startswith(f"{key} (upstream:"):
                continue
            timestamp = record.get("Timestamp")
            checks.append(
                {
                    "url": record.get("URL"),
                    "online": bool(record.get("Online")),
                    "status_code": record.get("StatusCode"),
                    "latency_ms": record.get("Latency"),
                    "checked": (
                        datetime.fromtimestamp(timestamp, UTC).isoformat()
                        if isinstance(timestamp, (int, float))
                        else None
                    ),
                }
            )
        return checks

    # ── Actions ───────────────────────────────────────────────────────────────

    async def set_flag(self, key: str, enable: bool) -> None:
        endpoint, field, method = self.OPTION_ENDPOINTS[key]
        try:
            await self.client.command(endpoint, method, fields={field: "true" if enable else "false"})
        except ProxyError as err:
            raise self._error("command_failed", error=str(err)) from err
        await self.async_request_refresh()

    async def toggle_rule(self, domain: str, enable: bool) -> None:
        set_value = "true" if enable else "false"
        try:
            await self.client.command("/api/proxy/toggle", fields={"ep": domain, "enable": set_value})
        except ProxyError as err:
            raise self._error("rule_change_failed", domain=domain, error=str(err)) from err
        _LOGGER.debug("Zoraxy toggle_proxy_rule '%s' enable=%s", domain, set_value)
        await self.async_request_refresh()

    async def renew_certificate(self, domain: str) -> None:
        """Ask Zoraxy for a new ACME certificate. Raises HomeAssistantError on failure."""
        if domain.startswith("_."):
            # Zoraxy stores *.example.org as _.example.org. A wildcard needs a DNS challenge, which this HTTP
            # renewal cannot do: say so instead of sending a request that cannot succeed.
            raise self._error("wildcard_renewal", domain=domain)
        if not self._acme_email:
            # Not read yet (Zoraxy was starting, a request timed out): read it now instead of at the next poll.
            await self._async_fetch_acme()
        if not self._acme_email:
            raise self._error("acme_email_unavailable")
        try:
            await self.client.command(
                "/api/acme/obtainCert",
                method="GET",
                fields={
                    "domains": domain,
                    "filename": domain,
                    "email": self._acme_email,
                    "ca": self._acme_ca,
                    "dns": "false",
                },
                timeout=120,
            )
        except ProxyError as err:
            raise self._error("renewal_failed", domain=domain, error=str(err)) from err
        _LOGGER.info("Zoraxy: certificate %s renewed", domain)

    # ── Polling ───────────────────────────────────────────────────────────────

    def _extract_cert_expiry(self, proxy_status: dict) -> dict[str, str]:
        all_certs = ((proxy_status.get("Option") or {}).get("TlsManager") or {}).get("LoadedCerts") or []
        names: list[tuple[list[str], str]] = []
        # The file listed by /api/cert/list is the key file name (Zoraxy fills PriKey with CertStore/<name>.key):
        # the only reliable key for a wildcard (*.example.org is stored as _.example.org) or an imported certificate.
        result: dict[str, str] = {}
        seen: set[str] = set()
        for c in all_certs:
            if not isinstance(c, dict):
                continue
            pk = c.get("PriKey", "")
            if not pk or pk in seen:
                continue
            seen.add(pk)
            cert = c.get("Cert")
            if not isinstance(cert, dict):
                continue
            if not (expiry := cert.get("NotAfter", "")):
                continue
            if isinstance(pk, str) and (file_name := pk.replace("\\", "/").rsplit("/", 1)[-1]).endswith(".key"):
                result[file_name.removesuffix(".key")] = expiry
            if dns := [name for name in cert.get("DNSNames") or [] if isinstance(name, str)]:
                names.append((dns, expiry))
        # Then the main name of each certificate, so that a certificate of its own wins over a secondary name...
        for dns, expiry in names:
            result.setdefault(dns[0], expiry)
        # ...then the other SANs: the file listed by /api/cert/list may be named after any of them.
        for dns, expiry in names:
            for name in dns[1:]:
                result.setdefault(name, expiry)
        return result

    def _store_acme(self, acme_email: Any, acme_ca: Any) -> bool:
        """Keep the ACME settings read from Zoraxy. True when the email could be read."""
        if isinstance(acme_ca, str):
            self._acme_ca = acme_ca.strip('"') or "Let's Encrypt"
        if not isinstance(acme_email, str):
            return False
        self._acme_email = acme_email.strip('"')
        return True

    async def _async_fetch_acme(self) -> None:
        """Read the ACME auto-renew settings now (renewal with no email known yet)."""
        try:
            acme_email, acme_ca = await asyncio.gather(
                self._optional("/api/acme/autoRenew/email"), self._optional("/api/acme/autoRenew/ca")
            )
        except ProxyError as err:
            _LOGGER.debug("Zoraxy: could not read the ACME settings: %s", err)
            return
        if self._store_acme(acme_email, acme_ca):
            self._acme_checked = time.monotonic()

    @staticmethod
    def _extract_uptime(log: dict) -> dict[str, dict]:
        """Latest uptime monitor check of each target, from /api/utm/list ({target id: [records, oldest first]})."""
        return {
            target: records[-1]
            for target, records in log.items()
            if isinstance(target, str) and isinstance(records, list) and records and isinstance(records[-1], dict)
        }

    async def _async_update_data(self) -> dict[str, Any]:
        try:
            proxy_status = await self.client.fetch_json("/api/proxy/status")
            if not isinstance(proxy_status, dict):
                raise UpdateFailed("Unexpected proxy status from Zoraxy")
            # The ACME auto-renew settings only feed the renewal service and almost never change:
            # they are read on the first refresh, then at most once an hour.
            fetch_acme = self._acme_checked is None or time.monotonic() - self._acme_checked >= ACME_POLL_SECONDS
            requests = [
                self._optional("/api/proxy/list", method="POST", fields={"type": "host"}),
                self._optional("/api/cert/list"),
                self._optional("/api/redirect/list"),
                self._optional("/api/access/list"),
            ]
            # The uptime monitor checks each upstream every 5 minutes (30 s while it is down) and keeps a day of
            # records per target: read at most once a minute.
            fetch_uptime = (
                self._uptime_checked is None or time.monotonic() - self._uptime_checked >= UPTIME_POLL_SECONDS
            )
            if fetch_uptime:
                requests.append(self._optional("/api/utm/list"))
            if fetch_acme:
                requests += [self._optional("/api/acme/autoRenew/email"), self._optional("/api/acme/autoRenew/ca")]
            # type=root answers the root object alone (zsrc/rp.go), not a rule list: only host rules are listed.
            host_rules, cert_list, redirect_list, access_rules, *extra = await asyncio.gather(*requests)
            uptime_log = extra.pop(0) if fetch_uptime else None
            acme_email, acme_ca = extra or (None, None)
        except ProxyAuthError as err:
            raise ConfigEntryAuthFailed(str(err)) from err
        except ProxyError as err:
            raise UpdateFailed(str(err)) from err

        # Only a successful read delays the next one by an hour: after a failure it is retried at the next poll.
        if fetch_acme and self._store_acme(acme_email, acme_ca):
            self._acme_checked = time.monotonic()

        # Like the certificates: only a list actually returned removes the entities of a rule.
        self.proxy_list_loaded = isinstance(host_rules, list)
        proxy_list = host_rules if self.proxy_list_loaded else self._previous("proxy_list")

        # Not read this time, or not available (monitor still starting, older Zoraxy): the last checks are kept,
        # until they are UPTIME_STALE_SECONDS old: then upstream health becomes unknown rather than stale forever.
        if isinstance(uptime_log, dict):
            self._uptime_checked = time.monotonic()
            uptime = self._extract_uptime(uptime_log)
        elif self._uptime_checked is None or time.monotonic() - self._uptime_checked >= UPTIME_STALE_SECONDS:
            uptime = {}
        else:
            uptime = self._data().get("uptime", {})

        # Only a list actually returned by Zoraxy may remove certificate entities (see async_setup_entry).
        self.cert_list_loaded = isinstance(cert_list, list)

        return {
            "proxy_status": proxy_status,
            "proxy_list": proxy_list,
            "cert_list": cert_list if self.cert_list_loaded else self._previous("cert_list"),
            "redirect_list": redirect_list if isinstance(redirect_list, list) else self._previous("redirect_list"),
            "access_rules": access_rules if isinstance(access_rules, list) else self._previous("access_rules"),
            "cert_expiry": self._extract_cert_expiry(proxy_status),
            "uptime": uptime,
        }


# ── Traefik ───────────────────────────────────────────────────────────────────

# Host(`a.example.org`) or Host(`a.example.org`, `b.example.org`), also HostRegexp and HostSNI.
HOST_RE = re.compile(r"Host(?:Regexp|SNI)?\(\s*((?:`[^`]*`\s*,?\s*)+)\)")
HOST_NAME_RE = re.compile(r"`([^`]*)`")
# Entrypoint that serves the API and the dashboard: not a proxy rule.
INTERNAL_PROVIDER = "@internal"


def router_hosts(rule: Any) -> list[str]:
    """Host names of a Traefik router rule, in order (a rule without Host matcher gives none)."""
    if not isinstance(rule, str):
        return []
    return [name for match in HOST_RE.finditer(rule) for name in HOST_NAME_RE.findall(match.group(1)) if name]


class TraefikDataUpdateCoordinator(ProxyDataUpdateCoordinator):
    """Traefik coordinator, over its read-only API.

    /api/overview is required: when it can't be read the update fails and the entities become unavailable. The
    HTTP routers, services, middlewares and entrypoints are optional: on failure the previous value is kept.
    Traefik's API has no write access (no option switch, no rule toggle) and does not expose the ACME certificates
    (they live in acme.json): those entities do not exist for a Traefik entry.
    """

    proxy_type = PROXY_TRAEFIK
    client: TraefikClient

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, client: TraefikClient) -> None:
        super().__init__(hass, entry, client)
        self._version_checked: float | None = None

    @staticmethod
    def _external(items: Any) -> list[dict]:
        """The routers, services or middlewares that are not Traefik's own (api@internal, dashboard@internal…)."""
        return [
            item
            for item in (items if isinstance(items, list) else [])
            if isinstance(item, dict)
            and not str(item.get("name", "")).endswith(INTERNAL_PROVIDER)
            and item.get("provider") != "internal"
        ]

    def _routers(self) -> list[dict]:
        return self._external(self._previous("routers"))

    def _services(self) -> dict[str, dict]:
        return {s["name"]: s for s in self._external(self._previous("services")) if isinstance(s.get("name"), str)}

    def _service_of(self, router: dict) -> dict | None:
        """The service of a router: its name as given, or with the router's provider appended ("app@docker")."""
        name = router.get("service")
        if not isinstance(name, str):
            return None
        services = self._services()
        if name in services:
            return services[name]
        provider = router.get("provider")
        return services.get(f"{name}@{provider}") if isinstance(provider, str) else None

    @property
    def running(self) -> bool:
        # The overview answered: Traefik is up. Its router/service error counts are reported by the rules.
        return isinstance(self._data().get("overview"), dict)

    @property
    def tls_enabled(self) -> bool:
        # Traefik gives "tls": {} for a TLS router without options: the key's presence counts, not its truth.
        if any(isinstance(router.get("tls"), dict) for router in self._routers()):
            return True
        return any(isinstance(ep, dict) and (ep.get("http") or {}).get("tls") for ep in self._previous("entrypoints"))

    @property
    def port(self) -> int | None:
        """Port of the websecure entrypoint, else of the first entrypoint with TLS, else of the first one."""
        entrypoints = [ep for ep in self._previous("entrypoints") if isinstance(ep, dict)]
        if not entrypoints:
            return None
        preferred = (
            next((ep for ep in entrypoints if ep.get("name") == "websecure"), None)
            or next((ep for ep in entrypoints if (ep.get("http") or {}).get("tls")), None)
            or next((ep for ep in entrypoints if ep.get("name") not in ("traefik", "metrics")), None)
            or entrypoints[0]
        )
        address = str(preferred.get("address", ""))
        port = address.rsplit(":", 1)[-1].split("/")[0]
        return int(port) if port.isdigit() else None

    @property
    def version(self) -> str | None:
        version = self._data().get("version")
        return version.get("Version") if isinstance(version, dict) else None

    def rules(self) -> list[dict[str, Any]]:
        rules = []
        for router in self._routers():
            hosts = router_hosts(router.get("rule"))
            # A router without a Host matcher (PathPrefix only): its name stands for the domain.
            domain = hosts[0] if hosts else str(router.get("name", "?")).split("@")[0]
            service = self._service_of(router)
            servers = ((service or {}).get("loadBalancer") or {}).get("servers") or []
            target = next((s.get("url") or s.get("address") for s in servers if isinstance(s, dict)), None)
            rules.append(
                {
                    "domain": domain,
                    "target": target or str(router.get("service", "?")).split("@")[0],
                    "enabled": router.get("status", "enabled") == "enabled",
                    "tls": isinstance(router.get("tls"), dict),
                }
            )
        return rules

    def redirects(self) -> list[dict[str, Any]]:
        """The redirectScheme and redirectRegex middlewares."""
        redirects = []
        for mw in self._external(self._previous("middlewares")):
            name = str(mw.get("name", "?")).split("@")[0]
            if isinstance(scheme := mw.get("redirectScheme"), dict):
                port = f":{scheme['port']}" if scheme.get("port") else ""
                redirects.append(
                    {
                        "RedirectURL": name,
                        "TargetURL": f"{scheme.get('scheme', 'https')}://…{port}",
                        "StatusCode": 301 if scheme.get("permanent") else 302,
                    }
                )
            elif isinstance(regex := mw.get("redirectRegex"), dict):
                redirects.append(
                    {
                        "RedirectURL": regex.get("regex", name),
                        "TargetURL": regex.get("replacement", "?"),
                        "StatusCode": 301 if regex.get("permanent") else 302,
                    }
                )
        return redirects

    @property
    def middlewares_count(self) -> int:
        return len(self._external(self._previous("middlewares")))

    def upstream_checks(self, domain: str) -> list[dict[str, Any]]:
        """Server status of the services of the routers of a domain ({url: "UP" | "DOWN"}, health checks on)."""
        checks = []
        for router in self._routers():
            hosts = router_hosts(router.get("rule"))
            name = hosts[0] if hosts else str(router.get("name", "?")).split("@")[0]
            if name != domain:
                continue
            service = self._service_of(router)
            statuses = (service or {}).get("serverStatus")
            if not isinstance(statuses, dict):
                continue
            checks += [
                {"url": url, "online": status == "UP", "status_code": None, "latency_ms": None, "checked": None}
                for url, status in sorted(statuses.items())
            ]
        return checks

    async def _async_update_data(self) -> dict[str, Any]:
        try:
            overview = await self.client.fetch_json("/api/overview")
            if not isinstance(overview, dict):
                raise UpdateFailed("Unexpected overview from Traefik")
            fetch_version = (
                self._version_checked is None or time.monotonic() - self._version_checked >= VERSION_POLL_SECONDS
            )
            requests = [
                self._optional("/api/http/routers"),
                self._optional("/api/http/services"),
                self._optional("/api/http/middlewares"),
                self._optional("/api/entrypoints"),
            ]
            if fetch_version:
                requests.append(self._optional("/api/version"))
            routers, services, middlewares, entrypoints, *extra = await asyncio.gather(*requests)
            version = extra[0] if extra else None
        except ProxyAuthError as err:
            raise ConfigEntryAuthFailed(str(err)) from err
        except ProxyError as err:
            raise UpdateFailed(str(err)) from err

        if isinstance(version, dict):
            self._version_checked = time.monotonic()
        else:
            version = self._data().get("version")

        # Only a list actually returned removes the entities of a rule.
        self.proxy_list_loaded = isinstance(routers, list)
        return {
            "overview": overview,
            "routers": routers if self.proxy_list_loaded else self._previous("routers"),
            "services": services if isinstance(services, list) else self._previous("services"),
            "middlewares": middlewares if isinstance(middlewares, list) else self._previous("middlewares"),
            "entrypoints": entrypoints if isinstance(entrypoints, list) else self._previous("entrypoints"),
            "version": version,
        }


COORDINATORS: dict[str, type[ProxyDataUpdateCoordinator]] = {
    PROXY_ZORAXY: ZoraxyDataUpdateCoordinator,
    PROXY_TRAEFIK: TraefikDataUpdateCoordinator,
}
