"""Constants for the Reverse Proxy integration (Zoraxy, Traefik)."""

from __future__ import annotations

DOMAIN = "reverse_proxy"
# Domain of the integration up to 1.14.x (Zoraxy only); its entries are adopted by async_setup_entry.
LEGACY_DOMAIN = "zoraxy"

DEFAULT_SCAN_INTERVAL = 30  # seconds
MIN_SCAN_INTERVAL = 10  # seconds
ACME_POLL_SECONDS = 3600  # the ACME auto-renew settings are re-read at most once an hour
UPTIME_POLL_SECONDS = 60  # the uptime monitor log is re-read at most once a minute
# Last uptime monitor checks older than this (the log could not be read since): dropped, upstream health unknown.
UPTIME_STALE_SECONDS = 3 * UPTIME_POLL_SECONDS
DEFAULT_VERIFY_SSL = True

CONF_PROXY_TYPE = "proxy_type"
CONF_SCAN_INTERVAL = "scan_interval"
CONF_VERIFY_SSL = "verify_ssl"

PROXY_ZORAXY = "zoraxy"
PROXY_TRAEFIK = "traefik"
PROXY_TYPES = (PROXY_ZORAXY, PROXY_TRAEFIK)

# Brand name, default address and device info of each supported reverse proxy.
PROXIES: dict[str, dict[str, str]] = {
    PROXY_ZORAXY: {
        "name": "Zoraxy",
        "default_host": "http://zoraxy.local:8000",
        "device_name": "Zoraxy Reverse Proxy",
        "manufacturer": "tobychui",
        "model": "Zoraxy",
    },
    PROXY_TRAEFIK: {
        "name": "Traefik",
        "default_host": "http://traefik.local:8080",
        "device_name": "Traefik Reverse Proxy",
        "manufacturer": "Traefik Labs",
        "model": "Traefik",
    },
}

SERVICE_TOGGLE_PROXY_RULE = "toggle_proxy_rule"
EXPIRY_WARNING_DAYS = 30  # days before expiry that trigger the warning

# What each proxy's API lets the integration do; the entities and the card's controls follow.
# controls: HTTPS redirect, port 80 and development mode switches; certificates: TLS certificate entities and
# ACME renewal; toggle_rules: enabling or disabling a proxy rule; redirects: a redirect list; access_rules: an
# access rule count; version: a version sensor; middlewares: a middleware count.
FEATURES: dict[str, frozenset[str]] = {
    PROXY_ZORAXY: frozenset({"controls", "certificates", "toggle_rules", "redirects", "access_rules"}),
    PROXY_TRAEFIK: frozenset({"redirects", "version", "middlewares"}),
}


def proxy_name(proxy_type: str) -> str:
    """Brand name of a proxy type ("Zoraxy", "Traefik")."""
    return PROXIES.get(proxy_type, PROXIES[PROXY_ZORAXY])["name"]


def safe_domain(domain: str) -> str:
    """Turn a domain name into a suffix safe for unique_id."""
    return domain.replace(".", "_").replace("*", "wildcard").replace("-", "_").lower()
