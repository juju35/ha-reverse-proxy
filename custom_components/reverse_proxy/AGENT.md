# Reverse Proxy Integration — Agent Context

## Purpose
Home Assistant custom integration (domain `reverse_proxy`, up to 1.14.x `zoraxy`) for reverse proxies: [Zoraxy](https://github.com/tobychui/zoraxy) (v3.3.2+), [Traefik](https://doc.traefik.io/traefik/operations/api/) (v2/v3) and [Nginx Proxy Manager](https://nginxproxymanager.com/) (v2).
Polls the proxy's REST API and exposes entities for monitoring and, for Zoraxy and Nginx Proxy Manager, control.

## Architecture

```
custom_components/reverse_proxy/
├── __init__.py          # Setup, migration (1.x → 2.1), take-over of `zoraxy` entries, card registration, toggle_proxy_rule service
├── api.py               # ProxyClient interface; ZoraxyClient (CSRF login, session expiry); TraefikClient (read-only, optional basic auth); NpmClient (bearer token)
├── coordinator.py       # ProxyDataUpdateCoordinator interface; ZoraxyDataUpdateCoordinator; TraefikDataUpdateCoordinator; NpmDataUpdateCoordinator
├── sensor.py            # Sensor entities (counts, port, version, expiry dates)
├── binary_sensor.py     # Binary sensors (running, TLS, option flags, cert expiry alerts, upstream health)
├── switch.py            # Switches (Zoraxy: HTTPS redirect, port 80, dev mode)
├── button.py            # Buttons (Zoraxy: ACME certificate renewal per domain)
├── config_flow.py       # Menu (zoraxy / traefik / nginx_proxy_manager) → per-proxy step, reauth, reconfigure, options
├── diagnostics.py       # Config entry diagnostics, credentials redacted (TO_REDACT)
├── const.py             # Constants, PROXIES (brand, defaults, device info), FEATURES per proxy, safe_domain()
├── entity.py            # ProxyEntity base: device, translated name, Zoraxy entity ids kept from 1.4.x
├── manifest.json        # HA integration manifest
├── icons.json           # MDI icon per translation key
├── translations/        # en, fr, de, es, sr, sr-Latn, it, nl, pt, pt-BR (copy of pt), pl, ro, da, sv, bg, ru, uk, hu, sk, cs, sl, lv, el
├── frontend/reverse-proxy-card.js  # Full card and mini card (custom:reverse-proxy-card, -mini-card; zoraxy-card aliases)
└── brand/               # icon.svg (source) → icon.png, icon@2x.png, logo.png, logo@2x.png: rounded indigo tile, white server-network glyph,
                         # orange swap badge — the style of the other ha-* integration icons (parcel, git-sync, smart-comfort);
                         # zoraxy.svg, traefik.svg, nginx_proxy_manager.svg: the brand marks used as header badges
```

## Proxy abstraction

`ProxyDataUpdateCoordinator` (coordinator.py) is what the entities and the service use; each proxy's coordinator keeps the raw API answers in `data` (diagnostics) and implements: `running`, `tls_enabled`, `port`, `version`, `flag(key)`, `rules()` → `[{domain, target, enabled, tls}]`, `rule_domains()`, `rule_enabled(domain)`, `redirects()` → `[{RedirectURL, TargetURL, StatusCode}]` (keys the card has read since 1.0), `access_rules_count`, `middlewares_count`, `cert_list`, `cert_expiry`, `upstream_checks(domain)` → `[{url, online, status_code, latency_ms, checked}]`, and the actions `set_flag`, `toggle_rule`, `renew_certificate` (raise `HomeAssistantError(not_supported)` by default). `FEATURES[proxy_type]` (const.py) decides which entities each platform creates: `controls`, `certificates`, `toggle_rules`, `redirects`, `access_rules`, `version`, `middlewares`. The *Proxy running* binary sensor exposes `proxy_type` and `features` for the card. Error messages take a `{proxy}` placeholder (brand name).

### Config entry
- Version 2.1: `proxy_type` in the data (`zoraxy` / `traefik` / `nginx_proxy_manager`); 1.x entries are migrated by `async_migrate_entry` (1.1 → verify_ssl False as before). Unique id = `normalize_host(host)`.
- `_async_adopt_legacy_entry` (async_setup_entry, Zoraxy entries): a `zoraxy` config entry (the integration up to 1.14.x) with the same host, once `custom_components/zoraxy` is gone, has its entities moved (`async_update_entity_platform`, unique ids rebuilt on the new entry id) then its device (identifiers, config entry — add and remove in two calls, one call loses the addition) to the new entry, and is removed. While the old integration is still installed nothing is moved and a warning says to remove it.
- Config flow: `user` is a menu (`async_show_menu`) → steps `zoraxy` / `traefik`; the duplicate check is by hand so that the abort message names the proxy (`description_placeholders`) on older Home Assistant versions.

## Traefik (TraefikClient, TraefikDataUpdateCoordinator)
- Read-only API, no login: `login()` reads `/api/version` (a 401/403 means refused basic auth, no `Version` key means not a Traefik). Credentials, when given, are sent as an `Authorization: Basic` header.
- `/api/overview` is required (UpdateFailed otherwise); `/api/http/routers`, `/api/http/services`, `/api/http/middlewares`, `/api/entrypoints` are optional (previous value kept); `/api/version` is read at most once an hour.
- Routers/services/middlewares of the `internal` provider (`api@internal`, `dashboard@internal`…) are left out. A rule's domain is the first `Host(`…`)` of the router rule (`router_hosts`), else the router name; its target the first server of its service (service name as given or `<name>@<provider>`); `tls` is the presence of the router's `tls` key (`{}` for a TLS router without options). Upstream health comes from the service's `serverStatus` (`UP`/`DOWN`, health checks on); none → unknown.
- Redirects: `redirectScheme` (name, `scheme://…[:port]`, 301 if permanent) and `redirectRegex` (regex, replacement) middlewares. Port: the `websecure` entrypoint, else the first with `http.tls`, else the first not named `traefik`/`metrics`.

## Nginx Proxy Manager (NpmClient, NpmDataUpdateCoordinator)
- `login()` POSTs `{identity, secret}` (the entry's `username` is the account's email) to `/api/tokens`; 400/401/403 → `ProxyAuthError`, `requires_2fa` in the answer → `ProxyAuthError` (an account with two-factor authentication cannot be polled), no JSON → `ProxyError` (not an NPM). The token (a day by default) goes in `Authorization: Bearer`; a 401 logs in again once (lock + generation counter, as for Zoraxy), a second one raises `ProxyAuthError` (reauth).
- `/api/` (status and version, `{status: "OK", version: {major, minor, revision}}`) is required; `/api/nginx/proxy-hosts`, `/api/nginx/redirection-hosts`, `/api/nginx/certificates`, `/api/nginx/access-lists` are optional (previous value kept).
- A rule is a proxy host: domain = first `domain_names`, target `forward_scheme://forward_host:forward_port`, `enabled`, `tls` = a `certificate_id`. No upstream health check in NPM: upstream sensors stay unknown. Port: 443 once a host has a certificate, else 80.
- Certificates are named after their first domain name (an imported one without any: its `nice_name`); `expires_on` (`YYYY-MM-DD HH:mm:ss`, UTC) → aware ISO by `npm_expiry`. Renewal: POST `/api/nginx/certificates/{id}/renew`, Let's Encrypt only (`provider == "letsencrypt"`). Toggle: POST `/api/nginx/proxy-hosts/{id}/enable|disable`.
- The card's brand mark is the Nginx Proxy Manager logo (brand/nginx_proxy_manager.svg, inlined in `BRANDS`).

## Zoraxy authentication

Zoraxy v3.3.2 uses **gorilla/csrf** protection. Login flow:

1. `GET /login.html` (follow redirects) → receives `zoraxy_csrf` cookie + extracts CSRF token from `<meta name="zoraxy.csrf.Token" content="...">`
2. `POST /api/auth/login` with:
   - Header: `X-CSRF-Token: <meta token>`
   - Header: `Content-Type: application/x-www-form-urlencoded`
   - Body: `username=...&password=...`
3. Receives session cookie `Zoraxy=...` (TTL ~1h)
4. All subsequent POST requests require `X-CSRF-Token` header

**Session expiry detection** (Zoraxy returns 307 → /login.html, not 401):
- Check if response URL contains `"login"` after redirects
- Check if response Content-Type is `text/html` instead of JSON
- On expiry: re-login under a lock and retry once (a generation counter tells waiting calls that a fresh session already exists)

## Key Classes

### `ZoraxyClient` (`api.py`)
- Uses a Home Assistant session (`async_create_clientsession(verify_ssl=..., cookie_jar=CookieJar(unsafe=True))`, closed with the entry); the config flow uses the same client
- `login()` — clears the cookies, GETs login.html for the CSRF token, POSTs the credentials; `ZoraxyAuthError` when refused
- `fetch()` / `fetch_json()` / `command()` — API call under `asyncio.timeout`, response always released, one re-login on expiry; `command()` also fails on `{"error": ...}`
- Re-login under an `asyncio.Lock` with a generation counter, so concurrent calls log in only once
- Errors: `ProxyError` (unreachable, HTTP error), `ProxyAuthError` (credentials refused → `ConfigEntryAuthFailed`, reauth flow)

### `ZoraxyDataUpdateCoordinator` (`coordinator.py`)
- `_async_update_data()` — `/api/proxy/status` is required (`UpdateFailed` otherwise, entities unavailable); the other lists keep their previous value on failure
- `cert_list_loaded` — stale certificate entities are removed only when `/api/cert/list` actually answered
- `_extract_cert_expiry(proxy_status)` — deduplicates LoadedCerts by PriKey
- `renew_certificate(domain)` — GET `/api/acme/obtainCert` with email/ca params, raises `HomeAssistantError` on failure

### Config entry
- Version 1.2: `verify_ssl` (new entries: true; entries migrated from 1.1: false, as the TLS certificate was never checked before), unique id = `normalize_host(host)`
- Options override the data: `scan_interval` (10 s minimum), `verify_ssl`; changing them reloads the entry
- Reauth stores the new password and lets the update listener reload the entry (it reloads it itself only when that listener is not registered, e.g. the setup failed, or nothing changed)
- Reconfigure changes host, username and password (verify_ssl stays in the options), validated by `_validate` like the user step; refuses a host another entry uses (`already_configured`), moves the unique id and the default title, reloads like the reauth
- Diagnostics redact the entry's host/username/password and, at any depth in the coordinator data, credential keys (basic auth `Username`/`PasswordHash`, tokens, secrets, cookies, emails)
- `toggle_proxy_rule` is registered in `async_setup` as an admin service (`async_register_admin_service`) and resolves the coordinator at each call (the entry given by the optional `config_entry_id`, which the card sends from its device's `primary_config_entry`, else the one whose `proxy_list` has the domain); raises `ServiceValidationError` / `HomeAssistantError`, which the card's optimistic rollback relies on

## API Endpoints Used

| Endpoint | Method | Notes |
|----------|--------|-------|
| `/api/auth/login` | POST | Login with CSRF token |
| `/api/proxy/status` | GET | Proxy config, TLS certs (LoadedCerts), port |
| `/api/proxy/list` | POST | `type=host` — proxy rules (`type=root` returns the root object alone, so it is not polled) |
| `/api/cert/list` | GET | List of certificate domain names |
| `/api/redirect/list` | GET | HTTP redirections |
| `/api/access/list` | GET | Access control rules |
| `/api/utm/list` | GET | Uptime monitor log `{target id: [records, oldest first]}`; target id = rule domain in lower case, `<domain> (upstream:<n>)` with several upstreams, `<domain><path>` for a virtual directory. Read at most every `UPTIME_POLL_SECONDS` (60 s); only the latest record per target is kept (`data["uptime"]`), dropped once no read succeeded for `UPTIME_STALE_SECONDS` (3 min) |
| `/api/acme/autoRenew/email` | GET | ACME email config |
| `/api/acme/autoRenew/ca` | GET | ACME CA config |
| `/api/acme/obtainCert` | GET | Trigger ACME renewal (params: domains, filename, email, ca, dns) |
| `/api/proxy/useHttpsRedirect` | POST | Toggle HTTPS redirect |
| `/api/proxy/listenPort80` | POST | Toggle port 80 listener |
| `/api/proxy/developmentMode` | GET | Toggle dev/no-cache mode (`GetBool(r, "enable")` reads the query string only) |

## Entity Patterns

Entities use `has_entity_name` and a `translation_key` (names in `translations/en.json` and `fr.json`, icons in `icons.json`). Their suggested entity id is built from the French name they had up to 1.4.x (`_legacy_name`, e.g. `sensor.zoraxy_reverse_proxy_zoraxy_regles_proxy`), which is what the card looks for.

Dynamic entities are created per certificate (from `/api/cert/list`):
- `sensor.zoraxy_*_cert_{safe_domain}` — expiry timestamp
- `binary_sensor.zoraxy_*_cert_expirant_{safe_domain}` — expires within 30 days
- `button.zoraxy_*_renouveler_{safe_domain}` — trigger ACME renewal

`safe_domain(domain)` converts `app.example.org` → `app_example_org`.

Dynamic entities per proxy rule (from `/api/proxy/list`):
- `binary_sensor.zoraxy_*_upstream_{safe_domain}` — upstream problem from the uptime monitor (`unknown` without a check)

Stale entities are cleaned up at startup via `_cleanup_stale_entities()` using `CERT_SUFFIXES = ("_cert_expiry_", "_cert_expiring_", "_renew_")` and `RULE_SUFFIXES = ("_upstream_problem_",)`, matched right after the entry id; at runtime, `async_track_cert_entities()` / `async_track_rule_entities()` add the entities of a new certificate / rule and remove from the registry those no longer listed (only when `cert_list_loaded` / `proxy_list_loaded`).

The `rules` / `redirects` and `certificates` list attributes are in `_unrecorded_attributes`: kept in the state for the card, left out of the recorder.

## TLS Certificate Parsing

`LoadedCerts` in `/api/proxy/status` contains the full chain per domain (leaf + intermediates + root CA), all sharing the same `PriKey` path. Deduplication by `PriKey` gives the actual count. Domain name comes from `Cert.DNSNames[0]`, expiry from `Cert.NotAfter`.

## Lovelace Custom Card (`frontend/reverse-proxy-card.js`)

Served by the integration at `/reverse_proxy/reverse-proxy-card.js` (the `/zoraxy/zoraxy-card.js` resource of 1.x is replaced) (`async_setup` registers the static path and the dashboard resource, as ha-parcel does). Versions up to 1.2.1 copied it to `/config/www/` and loaded it from `/local/zoraxy-card.js`: that copy is deleted and that resource replaced at startup. `_lovelace_resources()` reads `hass.data["lovelace"]` as a dict (before 2025.2) or a dataclass (`mode` from 2025.2, then `resource_mode` from 2026.2); YAML mode falls back to `add_extra_js_url`.

Web components `<reverse-proxy-card>` and `<reverse-proxy-mini-card>` (classes `ReverseProxyCard`, `ReverseProxyMiniCard`; `<zoraxy-card>`, `<zoraxy-mini-card>` and their editors are alias subclasses, not listed in the card picker). `_proxyType()` / `_has(feature)` read the running binary sensor's `proxy_type` / `features` (Zoraxy defaults without them); `BRANDS` holds each proxy's name, mark and default features; `_t()` replaces `{proxy}` with the brand name (the editors say "Zoraxy / Traefik"); `_url()` reads `proxy_url`, else `zoraxy_url`. Key design decisions:
- **Admin only**: rule buttons are rendered `disabled` (state only) when `hass.user.is_admin === false`; toggle failures go to a `hass-notification` toast (the call passes `notifyOnError` false)
- **Render on change**: the card re-renders only when one of its entities' state objects, the language or the hour changes; the entity list is cached on `hass.entities`
- **Escaping**: every entity attribute or config value goes through `rpEsc()`; `proxy_url` is a link only when it starts with `http://` or `https://`
- **Section state**: `_sectionOpen` dict persists open/closed state across renders
- **Entities**: `_registry()` finds the device's entities in `hass.entities` (platform `reverse_proxy`, `device_id`, `translation_key`); `_eid("sensor.proxy_rules")` gives one, `_many("button.renew")` the per-domain ones, matched by their `domain` attribute. The device is the `device` option, else the one of `sensor.<entity_prefix>_regles_proxy`, else the first proxy device. Without the registry (or no proxy entity in it) the ids are built from `entity_prefix` (default `zoraxy_reverse_proxy_zoraxy`) and `ReverseProxyCard.LEGACY`
- **I18N**: `static I18N = {fr: {...}, en: {...}}` + `_t(key)` via `hass.locale.language`; no brand name in the texts, `{proxy}` instead
- **Static assets**: `ICONS`, `LOGO`, `CSS` are static class properties (created once)

Mini card (same file): `ReverseProxyMiniCard extends ReverseProxyCard`, two lines (logo, name, status pill; chips from `_miniChips()`). `_zoomed` switches `_render()` to the full card's `super._render()`; `_addZoom()` appends the detail button to `.head` / `.header` after each render (`zoom: false`: none). A capture-phase document click outside the card and outside any `ha-more-info-dialog` / `ha-dialog` / `dialog` unzooms it. Its editor `ReverseProxyMiniCardEditor` extends the full card's editor (`SCHEMA` + `zoom`, `DEFAULTS`).

Config YAML:
```yaml
type: custom:reverse-proxy-card
proxy_url: http://zoraxy.local:8000
# Optional: device, entity_prefix (default zoraxy_reverse_proxy_zoraxy), language
```

## Known Behaviors & Quirks

- Zoraxy session TTL is ~1 hour — reconnection is automatic
- `/api/proxy/list` requires a `type` param; only `type=host` is polled (`type=root` returns the root object alone)
- `/api/acme/obtainCert` is a GET (not POST) despite being a mutation
- All POST API calls require `X-CSRF-Token` header (same token as login)
- `CookieJar(unsafe=True)` is mandatory for local IP addresses
- Tests: `pip install -r requirements_test.txt && pytest` (tests/test_init.py: Zoraxy and the take-over of `zoraxy` entries; tests/test_traefik.py: Traefik; tests/test_npm.py: Nginx Proxy Manager); `node --test test/*.test.mjs` for the card. Job `tests` runs on Python 3.14, i.e. the latest Home Assistant (2026.3+ needs Python 3.14; 3.13 would silently resolve to 2026.2) and prints its version as an annotation; job `pytest-min-ha` runs the suite on HA 2024.12.0. An autouse fixture (`tests/conftest.py`, `no_deprecated_calls`) fails any test during which Home Assistant reports a deprecated call naming `reverse_proxy`, and CI turns those reports into annotations. Never look a device up with `DeviceRegistry.async_get_device` (deprecated in 2026.8; `async_get_device_by_identifier` doesn't exist on 2024.12): go through the entities' `device_id`. The http fixture patch only applies where `start_http_server_and_save_config` still exists (gone in 2026.10).
- `asyncio.timeout` is used (Python 3.11+ native); no `async_timeout` dependency

## Translations
The frontend files keep every language in the sources. The release runs `scripts/split-frontend.mjs` before building the zip: English stays in each file, every other language goes to `<file>.i18n.<lang>.js` next to it, fetched when a card or the panel first needs it (`scripts/i18n-split.mjs`; it rebuilds every table to check the split, and the Validate job runs it on a copy with `--check`). The frontend folder is served as a whole, so those files are served next to the card.
