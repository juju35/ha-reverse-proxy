# Changelog

## 2.4.2 - 2026-11-13

### Fixes
- Folding back on a tap elsewhere now works on iOS (Safari and the companion app): a tap on something that is not clickable sent no click to the page, so what a click elsewhere folds (unfolded sections, the detailed view of the mini card, popups) stayed open. The press and the release are caught instead; a slider dragged out of the card and a scroll do not fold anything.
- Leaving the card (another dashboard view, a conditional card hidden) brings it back in its default state.

## 2.4.1 - 2026-11-13

### Fixes
- Nginx Proxy Manager: no more upstream health binary sensor per proxy host (#67). NPM does not check its upstreams, so these sensors (shown as *Upstream {domain}* / *Serveur cible {domain}*) could only ever be `unknown`, while the target of each proxy host is already in the *Proxy rules* sensor and on the card. Those created by 2.4.0 are removed at startup; Zoraxy and Traefik keep theirs.

## 2.4.0 - 2026-11-12

### Features
- Nginx Proxy Manager support (#65): add it with **Settings → Devices & services → Add integration → Reverse Proxy → Nginx Proxy Manager** (address of the admin interface, the email and password of an account without two-factor authentication). Its proxy hosts are the proxy rules (with their on/off button on the card and in `reverse_proxy.toggle_proxy_rule`), its redirection hosts the redirects; access lists, version, and the certificates with their expiry sensors and renewal button (Let's Encrypt certificates) are there too. NPM does not check its upstreams: their health stays unknown. The token is renewed by itself when it expires.

## 2.3.0 - 2026-11-12

### Features
- `show_title` and `show_subtitle` options (also in the visual editor) hide the header's title (the proxy's name) and its subtitle (its web address), separately, for a card placed under a section heading of its own (asked in juju35/ha-vehicle-card#72).

## 2.2.1 - 2026-11-09

### Maintenance
- No code change: released again to check the installation from the Marketplace.

## 2.2.0 - 2026-11-09

### Features
- **Repairs issues**: a certificate expiring within 30 days (warning) or expired (error), and a rule whose upstreams have all been offline for 10 minutes (error), in Settings → Repairs; each goes away by itself once fixed, and with the entry when it is removed.

## 2.1.0 - 2026-11-09

### Performance
- **Translations load on demand**: in the release zip, the frontend files keep English only (`reverse-proxy-card.js` 108 KB → 76 KB) and each other language is its own `<file>.i18n.<lang>.js` file next to them, fetched the first time a card or the panel needs it. Home Assistant loads the card on every dashboard, so each page used to download and parse all 22 languages to use one. The cards and panel are defined once the page's language has arrived (a few milliseconds), so they render translated from the start.

### Maintenance
- The Marketplace now installs the release zip (`zip_release`), like the other ha-* integrations: the split files are only in it.
- The repository keeps every language in the sources: the release runs `scripts/split-frontend.mjs` before building the zip, and the Validate workflow checks the split on a copy (every table is rebuilt from the split files and compared).

## 2.0.0 - 2026-11-08
### Breaking changes
- The integration is now **Reverse Proxy** (`reverse_proxy`) and the repository **ha-reverse-proxy** (the old address redirects). After the update, remove `custom_components/zoraxy/` if it is still there and add **Reverse Proxy → Zoraxy** for your Zoraxy address: the new entry takes over the former Zoraxy entry of the same address, with its device, entities (ids, names, areas, history) and removes it.
- The action `zoraxy.toggle_proxy_rule` is now `reverse_proxy.toggle_proxy_rule`; the `config_entry_id` field is now called *Instance*.
- Cards: `custom:reverse-proxy-card` and `custom:reverse-proxy-mini-card`, served at `/reverse_proxy/reverse-proxy-card.js` (the old resource is replaced at startup); `custom:zoraxy-card` and `custom:zoraxy-mini-card` stay as aliases. The `zoraxy_url` option is now `proxy_url` (the old name is still read).

### What's new
- **Traefik** support (v2 / v3): a Traefik entry reads its API (`/api/overview`, HTTP routers, services, middlewares, entrypoints, version) and gives proxy rules (the `@internal` ones aside) with their state and upstream health from the services' health checks, redirects from the `redirectScheme` / `redirectRegex` middlewares, a middleware count, the TLS flag, the inbound port (the `websecure` entrypoint) and a version sensor; optional HTTP basic auth when the API sits behind a `basicAuth` middleware. Traefik's API being read-only and not exposing the ACME certificates, a Traefik entry has no switch, no certificate entity and no rule toggle.
- The config flow starts by asking which reverse proxy to add; the reauth, reconfigure and options dialogs and the error messages name the proxy of the entry.
- Cards: the header shows the brand mark of the proxy (Zoraxy or Traefik) and only the controls its API allows; a Traefik card shows a middleware tile instead of the certificates, the rules' state as plain chips, and its mini card adds the version.
- The *Proxy running* binary sensor carries `proxy_type` and `features` attributes.
- Integration icon: an indigo tile with the server-network glyph and an orange proxy badge, in the style of the other ha-* integrations (no longer the Zoraxy logo).

### Internals
- One coordinator per proxy behind a common interface (`coordinator.py`), entities created from the proxy's features, Traefik screenshots in `scripts/screenshots.py`.

## 1.14.0 - 2026-11-08
### What's new
- Cards: the header shows the round server icon of the project page, tinted with the proxy status (green running, red stopped, grey unavailable), with the Zoraxy mark as a badge, as on the other ha-* cards.
- Cards: a click on that header icon opens the Zoraxy web interface (`zoraxy_url`); the title is plain text.

## 1.13.1 - 2026-11-08
### Fixes
- Cards: a proxy rule's button now changes the rule of the card's own Zoraxy instance (new optional `config_entry_id` field of `zoraxy.toggle_proxy_rule`), shows a failure in a toast, and is disabled for users who are not administrators.
- Upstream health becomes unknown when Zoraxy's uptime monitor log cannot be read for 3 minutes, instead of keeping the last check forever.

## 1.13.0 - 2026-11-07
### What's new
- Upstream health: each proxy rule gets a problem binary sensor from Zoraxy's uptime monitor, on when an upstream of the rule was found offline at its last check.
- Cards: a proxy rule whose upstream is down shows a *Down* badge, and the mini card shows how many rules have an upstream down.
- Cards: the entities are found in the entity registry by their Zoraxy device and kind, so renamed entity ids keep working; with several Zoraxy instances, each card picks its instance with the new **Device** option.

### Security
- The `zoraxy.toggle_proxy_rule` action is now reserved to administrators.

## 1.12.0 - 2026-11-07
### What's new
- Diagnostics: **Download diagnostics** gives the entry settings and the last data read from Zoraxy, with the address, credentials, tokens, secrets, cookies and email addresses redacted.
- Reconfigure: the address, username and password can be changed with **Reconfigure** without removing the integration; the new settings are saved only after a successful login.

## 1.11.12 - 2026-11-07
### Fixes
- The full lists of proxy rules, redirections and certificates (attributes of the *Proxy rules* and *TLS certificates* sensors) are no longer written to the recorder at every change; the card still reads them from the state.
- A certificate removed in Zoraxy now loses its sensor, binary sensor and renew button at the next update, instead of keeping stale entities until a reload.

## 1.11.11 (2026-11-04)

### Documentation
- README: images and links use absolute URLs, so the screenshots, icons, badges and links display in HACS (relative paths broke there).
- README: screenshots get a display size, so cards no longer show oversized in HACS and on GitHub.

## 1.11.10 (2026-11-04)
### What's new
- Added Romanian, Danish, Swedish, Bulgarian, Russian, Ukrainian, Hungarian, Slovak, Czech, Slovenian, Latvian and Greek translations: the configuration and options flows, the entity names, the action, the error messages and both cards (full and mini, with their visual editors) follow Home Assistant in `ro`, `da`, `sv`, `bg`, `ru`, `uk`, `hu`, `sk`, `cs`, `sl`, `lv` and `el`; the card's `language` option offers all twelve.

## 1.11.9 - 2026-11-02
### Fixes
- Mini card: the Zoraxy logo keeps its full size (40 px) in the compact view, like the full card. It still gets smaller, then hides, on very narrow cards.

## 1.11.8 (2026-11-01)
### Fixes
- Cards: at their narrowest (the mini card at 4 columns of a Sections view, the full card at 6), the *Zoraxy* title no longer disappears and the detail button no longer sticks out of the card; the status pill gives way first and, on a very narrow card, shows only its coloured dot (its text stays in the tooltip and for screen readers).
- Card: long control labels (*Reindirizzamento HTTPS*, *Przekierowanie HTTPS*, *HTTPS преусмеравање*…) now break at a hyphen instead of in the middle of a word, and the On / Off lines of the three tiles stay aligned; on a very narrow card the controls go one per line.
- Card: in a proxy rule or redirect row, the target now gives way before the domain, which shows in full whenever there is room, while the target keeps at least a few characters; on a phone-width card the domain gets a line of its own, with the target and buttons under it.
- Card: turning the port 80 listener off (which also stops the ACME HTTP challenges) or disabling a proxy rule now asks for confirmation in a small popup at the top of the card; turning them back on, the HTTPS redirect, the development mode and the renewal stay one click. Confirming always turns port 80 off, even if it was switched off meanwhile (it can no longer turn it back on), and a control tile sends the action decided at the click.
- Cards: on a very narrow card (the mini card's full view at 4 columns on a phone, the full card at 6), each control tile shows its state under its label, so a long state such as *Niedostępny* no longer cuts the label in the middle of words or sticks out of the tile; proxy rule, redirect and certificate rows keep their domain readable, with the expiry, target and buttons under it.
- Cards: the cards keep a normal width in a container that sizes to its content (an inline-block, a grid `auto` column) instead of falling to a few pixels, and still shrink to their column in a two-column grid (layout-card, grid or horizontal stack).
- Cards: an unavailable or unknown entity is no longer shown as a value: the status pill says *Unavailable* instead of *Inactive*, a control tile says *Unavailable* and is disabled instead of showing *Off*, the proxy rules and redirects say *Unavailable* instead of *No rule configured*, the mini card no longer reports *HTTPS redirect Off*, and the renewal button of an unavailable certificate is disabled.
- Cards: a state update no longer takes the keyboard focus away from the control, popup or mini card detail button that had it, and giving it back never scrolls the page.

## 1.11.7 (2026-11-01)
### What's new
- Added Italian, Dutch, European Portuguese and Polish translations: the configuration and options flows, the entity names, the action, the error messages and both cards (full and mini, with their visual editors) follow Home Assistant in `it`, `nl`, `pt` and `pl` (pt-BR uses the European Portuguese texts, in the integration and in the cards); the card's `language` option offers all four.

## 1.11.6 (2026-11-01)
### What's new
- Added Serbian (Cyrillic and Latin) translations: the configuration and options flows, the entity names, the action, the error messages and both cards (full and mini, with their visual editors) follow Home Assistant in `sr` and `sr-Latn`; the card's `language` option offers both.

## 1.11.5
### Fixes
- Card: the text of the coloured chips (status, certificate expiry, proxy rule On / Off, switch states) is darker in the light theme and lighter in the dark theme, so it is readable on its tinted background; the chips keep their state colour.
- Card: the section arrow and button transitions are turned off when the system asks for reduced motion.

## 1.11.4
### Maintenance
- Card: removed three unused translations (domain, target, status) from the four languages; nothing changes on screen.

## 1.11.3
### Fixes
- A wildcard certificate (`*.example.org`, which Zoraxy lists as `_.example.org`) now shows its expiry date, so its expiring alert works; certificates imported under a name that is not one of their domains get their expiry date too.
- The renew button of a wildcard certificate now explains that it needs a DNS challenge and must be renewed in Zoraxy, instead of sending a renewal that cannot succeed.

## 1.11.2
### Fixes
- The *Proxy running* binary sensor (and the status chip of both cards) turns off when the proxy service is stopped in Zoraxy; it used to stay on as long as Zoraxy answered.

## 1.11.1
### Fixes
- A certificate whose name is also a secondary name of another certificate (for example a `www.example.org` certificate next to an `example.org` certificate that also covers `www.example.org`) shows its own expiry date again, so its expiring alert is no longer hidden by the other certificate.

## 1.11.0
### What's new
- Card: new `language` option (also in the visual editors of both cards) to force English, French, German or Spanish instead of the Home Assistant language.

### Fixes
- Certificate renewal no longer fails with "ACME email not available" for an hour when Zoraxy could not answer at startup: the ACME settings are read again at the next update, and a renewal reads them itself when they are still missing.
- The integration no longer becomes unavailable when Zoraxy reports a certificate without data (`"Cert": null`), and the sensors and binary sensors keep working when the proxy options are missing (`"Option": null`).
- A certificate whose file is named after another name of the certificate (for example `www.example.org` on a certificate for `example.org` and `www.example.org`) now shows its expiry date.
- A certificate added in Zoraxy gets its expiry sensor, expiring binary sensor and renew button at the next update, without reloading the integration.
- The `zoraxy.toggle_proxy_rule` action and the error messages are translated in French, German and Spanish; German "Lauscht auf Port 80" instead of "Listener auf Port 80".
- Card: an unknown or unavailable value shows as `–` instead of the raw `unknown` / `unavailable` (port, rule and certificate counts); French "Redirection HTTPS" and "Mode dev" labels; the card and its editor pick the language the same way.

### Maintenance
- Screenshots workflow: fork-safe checkout, pinned Playwright, time-boxed and retried Chromium download, explicit failure after three apt attempts. HACS validation no longer runs twice for the same branch. When the screenshots workflow pushes refreshed screenshots to a pull request, it re-runs Lint, Validate and HACS validation on that commit.

## 1.10.1
### Fixes
- Card (Spanish): the on/off labels of the rule buttons and mini card chips are back to the short `On` / `Off`, so they keep their width.

## 1.10.0
### What's new
- German and Spanish translations: the configuration and options flows, the entity names, and both cards (full and mini, with their visual editors) follow Home Assistant in `de` and `es`, in addition to English and French. Any other language still falls back to English.

## 1.9.1
### Fixes
- The integration no longer becomes unavailable when Zoraxy reports no TLS manager (`"TlsManager": null` in its status): the certificate entities fall back to no certificate.
- A login or command response that merely contains the word "error" is no longer treated as a failure (no more spurious re-authentication); only a JSON object with an `error` key counts.
- Certificate entities no longer fail on an expiry date without a time zone.
- The count sensors no longer carry French units (`règles`, `actives`, `certificats`), and the inbound port sensor is unknown instead of `?` when the port cannot be read.
- Card: wildcard rule domains (`*.example.org`) are no longer clickable links; on the mini card, a certificate with an unknown expiry is listed last instead of as expiring today.
- The integration loads on Python builds in FIPS mode.

### Performance
- The ACME auto-renew settings are read on the first refresh, then at most hourly instead of at every update (2 requests saved per cycle).

### Maintenance
- README: how to point a card at a second Zoraxy instance (`entity_prefix`).
- Card tests (`node --test`), daily validation, a screenshots workflow; the release zip excludes `AGENT.md`.

## 1.9.0
### Fixes
- Card: a certificate sensor with an unparsable date no longer shows "D-NaN" with a green pill suggesting a healthy certificate. `new Date("...")` returns an *Invalid Date* instead of throwing, so the `try/catch` in `_daysUntil()` was unreachable and an unparsable value produced `NaN` (both `NaN < 7` and `NaN < 30` are false, giving the `ok` class). The method now returns `null` on an invalid date, the case already handled everywhere (a "?" label, a neutral `idle` pill, and exclusion from the mini card chips).

## 1.8.0
### Changes
- Full card: the Zoraxy logo in the header is 40 px, like the header icon of the other cards (32 px on the mini card, unchanged).
- Mini card: the title uses the full card's size (16 px, line height 1.25) instead of 14 px; a long title still ends with an ellipsis.
- Full card: the section title icons (Controls, Certificates, Proxy rules, Redirections) are 16 px, like the other cards; a closed section takes no extra space below its title.
- Full card: the certificate renew buttons use the neutral tile colour, and a proxy rule's On / Off button is tinted with its state colour, instead of an outlined button.
- Full card: 8 px between the header and the figures (was 4 px). Mini card: 12 px around the content (was 8 px at the top and 10 px on the sides), the logo at the top.

## 1.7.1

### Fixes
- `custom:zoraxy-mini-card` is registered on its own: on a page that had already loaded an older copy of the card (a cached file or a leftover resource), the mini card was never defined and Home Assistant reported "Custom element not found: zoraxy-mini-card".

## 1.7.0

### What's new
- Mini card `custom:zoraxy-mini-card`, in the same file as the full card (no extra resource): the logo, title and status pill on one line, then chips for the active and total proxy rules, the certificates (one orange or red chip per certificate expiring within 30 days, the closest first), the inbound port, and an orange chip when the HTTPS redirect is off or the development mode on. A chip opens its entity.
- Detail button at the top right of the mini card: it switches to the full card, with the same configuration, and back; a click anywhere else on the page brings the compact view back, but not a click in a dialog opened from the card. `zoom: false` removes the button.
- Visual editor for the mini card: the full card's fields plus the detail button, in English and French.

### Maintenance
- `scripts/screenshots.py` also renders the mini card and its zoomed view, and takes `CHROMIUM_PATH` to use an installed Chromium.

## 1.6.1

### Fixes
- On Home Assistant versions before 2025.4, the card is added to the dashboard resources again instead of being loaded as an extra script.
- A re-authentication reloads the integration once instead of twice.
- The root rule is no longer requested at every update: Zoraxy never returned it in the expected form, so the request was wasted. The entities are unchanged.
- Card: a failed switch or certificate renewal no longer leaves an uncaught error in the browser console (Home Assistant still shows the error).

### Maintenance
- Tests run on Home Assistant 2026.10 and on the minimum version (2024.12), and fail on any deprecated Home Assistant call; new tests for the fixes.

## 1.6.0

### Changes
- Requires Home Assistant 2024.12 or later.
- The TLS certificate is checked, with a new **Verify the TLS certificate** option, on by default for new entries. Existing entries are migrated with it off, as before, so an HTTPS Zoraxy with a self-signed certificate keeps working: turn it on in **Configure** if your certificate is valid.
- **Configure** on the integration sets the refresh interval (10 s minimum) and the TLS verification. When Zoraxy refuses the password, Home Assistant asks for the new one.
- The entities become unavailable when Zoraxy's status cannot be read, instead of showing the proxy as stopped.
- `zoraxy.toggle_proxy_rule`: `enable` is optional (the rule is toggled when it is left out), and an unknown domain or a Zoraxy error now fails the action, so the card undoes its change.
- Card: section headers and domain links work with the keyboard (Enter, Space), and an invalid configuration shows an error on the card.

### Fixes
- The HTTPS redirect, port 80 and development mode switches show their real state and can be turned on and off: they always showed off, and the HTTPS redirect and development mode changes were ignored by Zoraxy.
- `zoraxy.toggle_proxy_rule` works again after the integration is reloaded.
- Card: rule domains, targets, redirects and certificate names are escaped, and `zoraxy_url` becomes a link only for an `http(s)://` address.
- Certificate entities are no longer deleted when the certificate list cannot be read once. The README now says to reload the integration after adding a certificate in Zoraxy.
- **Renew** logs in again when the session has expired, and reports a failure instead of only logging it.
- Requests that see an expired session together log in only once, and no connection is left open when the setup fails.
- The card redraws only when its entities change instead of every 15 s, and its height follows the open sections.

### Maintenance
- Test suite (pytest) with a test job in CI; shared `ZoraxyClient` for the coordinator and the config flow, coordinator stored on the entry.
- CI hardening: actions pinned by commit SHA, read-only token, Dependabot for actions, duplication check with PR annotations.

## 1.5.0

### Changes
- Entity names are translated (English or French, following Home Assistant) and shown under the Zoraxy Reverse Proxy device: *Proxy running* / *Proxy actif* instead of *Zoraxy - Proxy actif*. Names set by hand in Home Assistant are kept.
- Entity ids do not change. On a new install they now start with `zoraxy_reverse_proxy_zoraxy_`, the card's default `entity_prefix`, so the card works without setting it.
- Icons come from `icons.json`; the proxy icon turns off when the proxy is down.

### Maintenance
- Shared `ZoraxyEntity` base class (`entity.py`), `integration_type: hub` in the manifest.
- Removed the unused `icon.png`, `images/` and `strings.json` from the integration folder (the icons are in `brand/`, the texts in `translations/`).

## 1.4.1

### Maintenance
- Tooling only, no functional change: ruff/Biome/pre-commit, a Lint CI with duplication and dead-code checks, and internal modernizations.

## 1.4.0

### Changes
- More compact layout with the same information, like the other ha-* cards: 12 px card padding, 36 px header icon, 16 px name and 12 px subtitle, 11 px pills, tighter tiles and sections.
- 36 px logo, lower metric tiles (16 px figures), controls and certificate rows.

## 1.3.1

### Changes
- The status pill is back on the right of the header: moving it under the title in 1.3.0 is undone.

## 1.3.0

### Changes
- The card is served by the integration at `/zoraxy/zoraxy-card.js`, like the cards of ha-parcel, ha-iptv and ha-carburants-france: nothing is copied to `/config/www/` any more. At the first start, the copy left in `/config/www/zoraxy-card.js` by the previous versions is deleted and the `/local/zoraxy-card.js` dashboard resource is replaced. If you added that resource by hand in a YAML dashboard configuration, remove it: the card is loaded anyway.
- The status pill sits under the title, as in the other ha-* cards.
- Requires Home Assistant 2024.11 or later.

### Maintenance
- Logs and code comments in English.
- The release asset is `zoraxy.zip`, holding the content of `custom_components/zoraxy/` like the other ha-* integrations.

## 1.2.1

### Changes
- Card sections fold like the other ha-* cards: the chevron turns from right (folded) to down (unfolded), and a click anywhere else on the page folds the sections back to their defaults, as in ha-carburants-france.

## 1.2.0

### Changes
- The card now follows the look of the other ha-* cards: header with logo, name, Zoraxy address and status pill; metrics and controls as theme-colored tiles; uppercase section titles with an icon.
- Status colors come from the Home Assistant theme (`--success-color`, `--warning-color`, `--error-color`) instead of fixed Tailwind colors, and the dark tiles are gone in light mode.
- Card size in the Sections view (`getGridOptions`).
- Labels that were always in French ("Règles", "Aucune règle configurée"…) now follow the language; the certificate countdown reads "12 d" in English.
- README in English, with screenshots generated by `scripts/screenshots.py`.

### Fixes
- Removed a compiled `__pycache__` file from the repository.

## 1.1.1

### Fixes
- After an update, dashboards now load the new card right away: the Lovelace resource is updated through Home Assistant instead of its storage file, which Home Assistant only read at the next restart. This is why the visual editor from 1.1.0 did not show up.

## 1.1.0

### What's new
- Visual editor for the card: Zoraxy URL and entity prefix, no YAML needed. Labels in English and French.

### Maintenance
- Releases are now published automatically from this changelog when the version is bumped.
- MIT license added.

## 1.0.11

### Maintenance
- Fixed the release workflow that builds `zoraxy-integration.zip`.

## 1.0.10

### Fixes
- Section header arrows now use MDI chevron icons, as Unicode arrows did not render on some mobile devices.

## 1.0.9

### Fixes
- Proxy rule domains now open in a new tab, which links did not do inside Home Assistant's shadow DOM.

## 1.0.8

### Changes
- Removed the proxy rules table header, so the section looks like the certificates and redirects sections.

## 1.0.7

### What's new
- Proxy rule domain names are clickable and open the service in a new tab.

## 1.0.6

### Fixes
- The certificate renewal button now works: the ACME request was sent without the CSRF token and silently redirected to the login page.

## 1.0.5

### Fixes
- The Lovelace resource gets a new ID when the card is updated, so browsers reload it instead of keeping the cached version.

## 1.0.4

### Changes
- The card now ships only inside the integration (`custom_components/zoraxy/www`); the duplicate copy at the repository root is removed.
- README updated.

## 1.0.3

### Changes
- The proxy rule toggle button shows a status dot only, without text.

## 1.0.2

### What's new
- Enable or disable a proxy rule from the card.
- `zoraxy.toggle_proxy_rule` action.

## 1.0.1

### Maintenance
- Removed the example Lovelace dashboard file.

## 1.0.0

First public release.

### What's new
- Configuration from the UI: Zoraxy address, username, password and refresh interval, with automatic re-login when the session expires.
- Sensors for proxy rules, active rules, TLS certificates, access rules and listening port.
- Per-certificate expiry sensor, "expiring within 30 days" binary sensor and ACME renewal button.
- Switches for HTTPS redirect, port 80 listener and development mode.
- `zoraxy-card` Lovelace card, deployed and registered automatically.
- English and French translations.
