"""Clients for the reverse proxy APIs (Zoraxy, Traefik, Nginx Proxy Manager), shared by the coordinators and the
config flow."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any
from urllib.parse import urlencode

import aiohttp

_LOGGER = logging.getLogger(__name__)

CSRF_META_RE = re.compile(r'<meta\s+name="zoraxy\.csrf\.Token"\s+content="([^"]+)"')
FORM_CONTENT_TYPE = "application/x-www-form-urlencoded"


class ProxyError(Exception):
    """The reverse proxy could not be reached or answered with an error."""


class ProxyAuthError(ProxyError):
    """The reverse proxy refused the credentials."""


def normalize_host(host: str) -> str:
    """Host as used for the unique id: no trailing slash, lower case."""
    return host.strip().rstrip("/").lower()


class ProxyClient:
    """What the coordinators and the config flow need from a reverse proxy API."""

    host: str

    async def login(self) -> None:
        """Check the address and the credentials. Raises ProxyAuthError when the credentials are refused."""
        raise NotImplementedError

    async def fetch_json(self, endpoint: str, method: str = "GET", fields: dict[str, str] | None = None) -> Any:
        raise NotImplementedError


class LoginClient(ProxyClient):
    """A proxy API with a login (Zoraxy's session, Nginx Proxy Manager's token), renewed when it expires.

    Concurrent calls that see the expiry at the same time log in only once: the login runs under a lock and a
    generation counter tells the others that a fresh login already happened.
    """

    BRAND = "the proxy"

    def __init__(self, session: aiohttp.ClientSession, host: str, username: str, password: str) -> None:
        self._session = session
        self.host = host.strip().rstrip("/")
        self._username = username
        self._password = password
        self._logged_in = False
        self._generation = 0
        self._lock = asyncio.Lock()

    async def _request(
        self, method: str, endpoint: str, *, timeout: float = 15, **kwargs: Any
    ) -> tuple[int, str, str, str]:
        """Send one request; return status, final URL path, content type and body.

        The body is read under the timeout and the response is always released.
        """
        try:
            async with (
                asyncio.timeout(timeout),
                self._session.request(method, f"{self.host}{endpoint}", allow_redirects=True, **kwargs) as resp,
            ):
                body = await resp.text()
                return resp.status, resp.url.path, resp.headers.get("Content-Type", ""), body
        except TimeoutError as err:
            raise ProxyError(f"Timeout while calling {self.BRAND} ({self.host})") from err
        except aiohttp.ClientError as err:
            raise ProxyError(f"Cannot reach {self.BRAND} ({self.host}): {err}") from err

    async def _relogin(self, generation: int) -> None:
        """Log in again, unless another call already did since `generation`."""
        async with self._lock:
            if self._logged_in and self._generation != generation:
                return
            await self.login()

    async def ensure_logged_in(self) -> None:
        if not self._logged_in:
            await self._relogin(self._generation)


class ZoraxyClient(LoginClient):
    """Zoraxy web API with its CSRF login.

    The Zoraxy session expires after about an hour. Zoraxy then redirects to /login.html, detected from the final
    URL once the redirects are followed, from a 401/403, or from an HTML page where JSON was expected. The client
    logs in again once and retries. Concurrent calls that see the expiry at the same time log in only once: the
    login runs under a lock and a generation counter tells the others that a fresh session already exists.
    """

    BRAND = "Zoraxy"

    def __init__(self, session: aiohttp.ClientSession, host: str, username: str, password: str) -> None:
        super().__init__(session, host, username, password)
        self._csrf_token: str | None = None

    async def login(self) -> None:
        """Log in with a clean cookie jar. Raises ProxyAuthError when the credentials are refused."""
        self._logged_in = False
        self._csrf_token = None
        # Drop the expired cookies, the CSRF cookie comes back with the login page.
        self._session.cookie_jar.clear()

        _, _, _, page = await self._request("GET", "/login.html", timeout=10)
        match = CSRF_META_RE.search(page)
        if not match:
            raise ProxyError(f"No Zoraxy login page at {self.host} (CSRF token not found)")
        token = match.group(1)

        status, _, _, body = await self._request(
            "POST",
            "/api/auth/login",
            timeout=10,
            headers={"X-CSRF-Token": token, "Content-Type": FORM_CONTENT_TYPE},
            data=urlencode({"username": self._username, "password": self._password}),
        )
        if status >= 500:
            raise ProxyError(f"Zoraxy login failed (HTTP {status})")
        try:
            data = json.loads(body)
        except ValueError:
            data = None
        if status != 200 or (isinstance(data, dict) and data.get("error")):
            _LOGGER.debug("Zoraxy: login refused (HTTP %s): %s", status, body[:200])
            raise ProxyAuthError(f"Zoraxy refused the login (HTTP {status})")

        self._csrf_token = token
        self._logged_in = True
        self._generation += 1
        _LOGGER.debug("Zoraxy: logged in")

    @staticmethod
    def _expired(status: int, path: str, content_type: str) -> bool:
        return status in (401, 403) or "login" in path or (status == 200 and "text/html" in content_type)

    async def fetch(
        self, endpoint: str, method: str = "GET", fields: dict[str, str] | None = None, *, timeout: float = 15
    ) -> str:
        """Call the API and return the body, logging in again once when the session expired."""
        await self.ensure_logged_in()
        for attempt in range(2):
            generation = self._generation
            headers = {"X-CSRF-Token": self._csrf_token or ""}
            if method == "GET":
                result = await self._request("GET", endpoint, timeout=timeout, params=fields, headers=headers)
            else:
                headers["Content-Type"] = FORM_CONTENT_TYPE
                result = await self._request(
                    method, endpoint, timeout=timeout, headers=headers, data=urlencode(fields or {})
                )
            status, path, content_type, body = result
            if not self._expired(status, path, content_type):
                break
            if attempt:
                raise ProxyError(f"Zoraxy session expired again on {endpoint}")
            _LOGGER.debug("Zoraxy: session expired on %s, logging in again", endpoint)
            await self._relogin(generation)

        if status != 200:
            raise ProxyError(f"Zoraxy answered HTTP {status} on {endpoint}")
        return body

    async def fetch_json(self, endpoint: str, method: str = "GET", fields: dict[str, str] | None = None) -> Any:
        body = await self.fetch(endpoint, method, fields)
        try:
            return json.loads(body)
        except ValueError as err:
            raise ProxyError(f"Invalid response from Zoraxy on {endpoint}") from err

    async def command(
        self, endpoint: str, method: str = "POST", fields: dict[str, str] | None = None, *, timeout: float = 15
    ) -> None:
        """Run an action; Zoraxy reports a failure as {"error": "..."} with HTTP 200."""
        body = await self.fetch(endpoint, method, fields, timeout=timeout)
        try:
            data = json.loads(body)
        except ValueError:
            data = None
        if isinstance(data, dict) and data.get("error"):
            raise ProxyError(str(data["error"]))


class TraefikClient(ProxyClient):
    """Traefik API (/api/overview, /api/http/routers…), read-only.

    The API is served by the `api` entrypoint (api.insecure, or the dashboard router); it has no login of its own.
    When the dashboard sits behind a basicAuth middleware, the credentials are sent as HTTP basic auth.
    """

    def __init__(self, session: aiohttp.ClientSession, host: str, username: str = "", password: str = "") -> None:
        self._session = session
        self.host = host.strip().rstrip("/")
        # As a header rather than aiohttp's auth argument, so that it is sent (and seen by tests) like any header.
        self._headers = {"Authorization": aiohttp.BasicAuth(username, password).encode()} if username else {}

    async def _request(self, endpoint: str, *, timeout: float = 15, **kwargs: Any) -> tuple[int, str, str]:
        """GET an endpoint; return status, content type and body (the response is always released)."""
        try:
            async with (
                asyncio.timeout(timeout),
                self._session.get(
                    f"{self.host}{endpoint}", headers=self._headers, allow_redirects=True, **kwargs
                ) as resp,
            ):
                body = await resp.text()
                return resp.status, resp.headers.get("Content-Type", ""), body
        except TimeoutError as err:
            raise ProxyError(f"Timeout while calling Traefik ({self.host})") from err
        except aiohttp.ClientError as err:
            raise ProxyError(f"Cannot reach Traefik ({self.host}): {err}") from err

    async def login(self) -> None:
        """Read /api/version: wrong credentials give a 401, another server gives no Traefik version."""
        version = await self.fetch_json("/api/version", timeout=10)
        if not isinstance(version, dict) or "Version" not in version:
            raise ProxyError(f"No Traefik API at {self.host} (/api/version gives no version)")
        _LOGGER.debug("Traefik: %s reached, version %s", self.host, version.get("Version"))

    async def fetch_json(
        self, endpoint: str, method: str = "GET", fields: dict[str, str] | None = None, *, timeout: float = 15
    ) -> Any:
        """GET an endpoint and decode its JSON. The Traefik API is read-only: `method` is accepted for the
        coordinator's shared code and must be GET."""
        if method != "GET":
            raise ProxyError(f"Traefik API is read-only ({method} {endpoint})")
        status, content_type, body = await self._request(endpoint, timeout=timeout, params=fields)
        if status in (401, 403):
            raise ProxyAuthError(f"Traefik refused the credentials (HTTP {status})")
        if status != 200:
            raise ProxyError(f"Traefik answered HTTP {status} on {endpoint}")
        try:
            return json.loads(body)
        except ValueError as err:
            # A login page or a reverse proxy error page where JSON was expected.
            kind = "an HTML page" if "text/html" in content_type else "an invalid response"
            raise ProxyError(f"Traefik gave {kind} on {endpoint}") from err


class NpmClient(LoginClient):
    """Nginx Proxy Manager API (/api/nginx/proxy-hosts…), with a bearer token.

    The token comes from POST /api/tokens with the account's email and password; it lasts a day by default. A 401
    means it expired: the client asks for a new one once and retries.
    """

    BRAND = "Nginx Proxy Manager"

    def __init__(self, session: aiohttp.ClientSession, host: str, username: str, password: str) -> None:
        super().__init__(session, host, username, password)
        self._token: str | None = None

    async def login(self) -> None:
        """Ask for a token. Raises ProxyAuthError when the email or the password is refused."""
        self._logged_in = False
        self._token = None
        status, _, _, body = await self._request(
            "POST", "/api/tokens", timeout=10, json={"identity": self._username, "secret": self._password}
        )
        try:
            data = json.loads(body)
        except ValueError:
            data = None
        if status >= 500:
            raise ProxyError(f"Nginx Proxy Manager login failed (HTTP {status})")
        # NPM always answers JSON: another server's error page is an address problem, not refused credentials.
        if not isinstance(data, dict):
            raise ProxyError(f"No Nginx Proxy Manager API at {self.host} (/api/tokens gives no JSON)")
        if status in (400, 401, 403):
            _LOGGER.debug("Nginx Proxy Manager: login refused (HTTP %s): %s", status, body[:200])
            raise ProxyAuthError(f"Nginx Proxy Manager refused the login (HTTP {status})")
        if data.get("requires_2fa"):
            # The API asks for a second factor: an account with two-factor authentication cannot be polled.
            raise ProxyAuthError("Nginx Proxy Manager asks for a two-factor code for this account")
        if status != 200 or not isinstance(token := data.get("token"), str):
            raise ProxyError(f"Nginx Proxy Manager gave no token (HTTP {status})")
        self._token = token
        self._logged_in = True
        self._generation += 1
        _LOGGER.debug("Nginx Proxy Manager: logged in")

    async def _call(self, method: str, endpoint: str, *, timeout: float = 15, **kwargs: Any) -> str:
        """Call the API with the token and return the body, logging in again once when it expired."""
        await self.ensure_logged_in()
        for attempt in range(2):
            generation = self._generation
            headers = {"Authorization": f"Bearer {self._token}"}
            status, _, _, body = await self._request(method, endpoint, timeout=timeout, headers=headers, **kwargs)
            if status != 401:
                break
            if attempt:
                raise ProxyAuthError(f"Nginx Proxy Manager refused the token again on {endpoint}")
            _LOGGER.debug("Nginx Proxy Manager: token expired on %s, logging in again", endpoint)
            await self._relogin(generation)
        if status == 403:
            raise ProxyError(f"Nginx Proxy Manager: this account may not use {endpoint} (HTTP 403)")
        if status not in (200, 201):
            raise ProxyError(f"Nginx Proxy Manager answered HTTP {status} on {endpoint}")
        return body

    async def fetch_json(
        self, endpoint: str, method: str = "GET", fields: dict[str, str] | None = None, *, timeout: float = 15
    ) -> Any:
        body = await self._call(method, endpoint, timeout=timeout, params=fields)
        try:
            return json.loads(body)
        except ValueError as err:
            raise ProxyError(f"Invalid response from Nginx Proxy Manager on {endpoint}") from err

    async def command(self, endpoint: str, *, timeout: float = 15) -> None:
        """POST an action (enable, disable, renew); NPM answers true or the changed object."""
        await self._call("POST", endpoint, timeout=timeout)
