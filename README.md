# ha-zoraxy

[![Marketplace](https://img.shields.io/badge/Marketplace-Custom-41BDF5.svg)](https://www.home-assistant.io/integrations/marketplace/)
[![HACS Validation](https://github.com/juju35/ha-zoraxy/actions/workflows/hacs.yml/badge.svg)](https://github.com/juju35/ha-zoraxy/actions/workflows/hacs.yml)
[![Validate](https://github.com/juju35/ha-zoraxy/actions/workflows/validate.yml/badge.svg)](https://github.com/juju35/ha-zoraxy/actions/workflows/validate.yml)
[![Lint](https://github.com/juju35/ha-zoraxy/actions/workflows/lint.yml/badge.svg)](https://github.com/juju35/ha-zoraxy/actions/workflows/lint.yml)
[![Release](https://img.shields.io/github/v/release/juju35/ha-zoraxy)](https://github.com/juju35/ha-zoraxy/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/juju35/ha-zoraxy/blob/main/LICENSE)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/julienstep9)

Home Assistant integration and Lovelace card for the [Zoraxy](https://github.com/tobychui/zoraxy) reverse proxy (v3.3.2+): proxy status, controls, TLS certificates with ACME renewal, and proxy rules you can switch on and off from the dashboard.

[![Open your Home Assistant instance and open a repository inside the Marketplace.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/marketplace_repository/?owner=juju35&repository=ha-zoraxy&category=integration)

<img src="https://raw.githubusercontent.com/juju35/ha-zoraxy/main/screenshots/card.png" alt="zoraxy-card" width="400">

## Features

- Sensors for proxy rules, active rules, TLS certificates, access rules and the inbound port
- One expiry sensor, one "expiring soon" binary sensor and one ACME renewal button per certificate (a certificate added later in Zoraxy gets its entities at the next update)
- Switches for the HTTPS redirect, the port 80 listener and the development mode
- One upstream health binary sensor per proxy rule, from Zoraxy's uptime monitor
- A `zoraxy.toggle_proxy_rule` service (administrators only) to enable or disable a proxy rule from an automation
- A Lovelace card, shipped with the integration and registered automatically:
  - proxy status and key metrics
  - direct controls (HTTPS redirect, port 80, dev mode); turning port 80 off asks for confirmation first, as it also stops the ACME HTTP challenges
  - certificates with days left and a renewal button
  - proxy rules with an on/off button per rule (disabling a rule asks for confirmation first) and a *Down* badge when the uptime monitor finds the rule's upstream offline, and HTTP redirects
  - an unavailable entity shows as *Unavailable* (its control disabled), never as *Off* or *Inactive*
- A mini card in the same file: status and key figures on two lines, certificates expiring soon highlighted, and a detail button showing the full card; at its narrowest (4 columns of a Sections view) the status pill shows its coloured dot only
- Visual editors for both cards, light and dark mode, English, French, German, Spanish, Serbian (Cyrillic and Latin), Italian, Dutch, European Portuguese, Polish, Romanian, Danish, Swedish, Bulgarian, Russian, Ukrainian, Hungarian, Slovak, Czech, Slovenian, Latvian and Greek
- Automatic reconnection when the Zoraxy session expires (about one hour)

## Prerequisites

- Home Assistant **2024.12** or later
- Zoraxy **v3.3.2** or later, and an account on its web interface

## Installation

### Via the Marketplace (recommended)

Click the button below to add the repository directly:

[![Add to the Marketplace](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/marketplace_repository/?owner=juju35&repository=ha-zoraxy&category=integration)

Then click **Install** and restart Home Assistant.

Or manually:

1. Open **Settings → Marketplace → Add from link** (top right; this needs a GitHub account connected)
2. Add `https://github.com/juju35/ha-zoraxy` — Type: **Integration**
3. Open **Zoraxy** and click **Install**
4. Restart Home Assistant

### Manual

1. Copy `custom_components/zoraxy/` from the [latest release](https://github.com/juju35/ha-zoraxy/releases/latest) to `/config/custom_components/zoraxy/`
2. Restart Home Assistant

The card file `zoraxy-card.js` (full card and mini card) is part of the integration: it is served at `/zoraxy/zoraxy-card.js` and added to the dashboard resources at startup (nothing is written to `/config/www/`). If the automatic registration fails, add it in **Settings → Dashboards → ⋮ → Resources**:
- URL: `/zoraxy/zoraxy-card.js`
- Type: **JavaScript Module**

## Configuration

### Integration

**Settings → Devices & services → Add integration → Zoraxy**, then fill in:

| Field | Example |
|---|---|
| Address | `http://zoraxy.local:8000` |
| Username / Password | Your Zoraxy credentials |
| Refresh interval | `30` seconds (10 minimum) |
| Verify the TLS certificate | On by default; turn it off only for an `https://` address with a self-signed certificate |

The refresh interval and the TLS verification can be changed later with **Configure** on the integration. To change the address, the username or the password without removing the integration, use **⋮ → Reconfigure** on it: the new settings are saved only once Zoraxy accepts the login. When Zoraxy refuses the password, Home Assistant asks for the new one in **Settings → Devices & services**. Entries created with version 1.5.0 or earlier keep the TLS verification off, as before; turn it on in the options if your certificate is valid.

### Card

Edit a dashboard, click **Add card** and search for **Zoraxy Card**. Set the Zoraxy URL (opened when clicking the card title) and, with several Zoraxy instances, the device. Or in YAML:

```yaml
type: custom:zoraxy-card
zoraxy_url: http://zoraxy.local:8000
```

| Option | Default | Description |
|---|---|---|
| `device` | — | Device id of the Zoraxy instance to show, picked in the visual editor; left out, the instance whose entity ids start with `entity_prefix`, else the first one |
| `zoraxy_url` | — | Zoraxy web interface (`http://` or `https://`), opened from the card title and shown under it |
| `entity_prefix` | `zoraxy_reverse_proxy_zoraxy` | Common part of the entity ids: picks the instance when `device` is left out, and finds the entities when the entity registry is not available |
| `language` | Auto | Force the card language: `en`, `fr`, `de`, `es`, `sr`, `sr-Latn`, `it`, `nl`, `pt`, `pl`, `ro`, `da`, `sv`, `bg`, `ru`, `uk`, `hu`, `sk`, `cs`, `sl`, `lv` or `el` (by default, the Home Assistant language) |

The card finds its entities in the entity registry, by their Zoraxy device and their kind, so renamed entity ids keep working. With two Zoraxy instances, pick the device of each card in the visual editor (or set `device`).

### Mini card

`custom:zoraxy-mini-card` shows the full card's essentials on two lines, for a compact dashboard: the logo, title and status pill, then a chip per key figure:

- active / total proxy rules
- the number of rules whose upstream is down, in red, only when there are some
- the number of certificates, or one chip per certificate expiring within 30 days (orange, red under 7 days), the closest first
- the inbound port
- *HTTPS redirect Off* and *Dev mode On*, in orange, only when they apply

Chips needing attention are tinted; a click on a chip opens its entity. The **detail** button (top right) switches the card to the full [card](#card), with the same configuration, and back, as does a click anywhere else on the page (`zoom: false` removes it). Search for **Zoraxy Mini Card** when adding a card, or in YAML:

```yaml
type: custom:zoraxy-mini-card
zoraxy_url: http://zoraxy.local:8000
zoom: true
```

Same options as the full card, plus:

| Option | Default | Description |
|---|---|---|
| `zoom` | `true` | Detail button switching to the full card and back |

<img src="https://raw.githubusercontent.com/juju35/ha-zoraxy/main/screenshots/mini.png" alt="zoraxy-mini-card" width="400">

### Entities

| Entity | Description |
|---|---|
| `sensor.*_regles_proxy` | Number of proxy rules (rules and redirects as attributes) |
| `sensor.*_regles_actives` | Active proxy rules |
| `sensor.*_certificats_tls` | Number of TLS certificates |
| `sensor.*_regles_d_acces` | Number of access rules |
| `sensor.*_port_entrant` | Proxy listening port |
| `sensor.*_cert_{domain}` | Certificate expiry date |
| `binary_sensor.*_cert_expirant_{domain}` | `on` when the certificate expires in less than 30 days |
| `button.*_renouveler_{domain}` | Triggers the ACME renewal (HTTP challenge). A wildcard certificate (listed by Zoraxy as `_.example.org`) needs a DNS challenge: renew it in Zoraxy, the button only explains it |
| `binary_sensor.*_proxy_actif` | Proxy running |
| `binary_sensor.*_tls_active` | TLS enabled |
| `binary_sensor.*_redirection_https` | HTTP → HTTPS redirect |
| `binary_sensor.*_ecoute_port_80` | Listening on port 80 |
| `binary_sensor.*_mode_developpement` | Development mode (no cache) |
| `binary_sensor.*_upstream_{domain}` | Upstream health of a proxy rule (problem): `on` when Zoraxy's uptime monitor found an upstream of the rule offline at its last check, `unknown` when it has no check of the rule (rule disabled, monitoring turned off) or when the uptime monitor log could not be read for 3 minutes; `upstreams` attribute with each upstream's URL, online flag, status code, latency and check time |
| `switch.*_redirection_https` | Turns the HTTPS redirect on or off |
| `switch.*_ecoute_port_80` | Turns the port 80 listener on or off |
| `switch.*_mode_developpement` | Turns the development mode on or off |

Names follow the Home Assistant language (English, French, German, Spanish, Serbian in Cyrillic or Latin, Italian, Dutch, European Portuguese, Polish, Romanian, Danish, Swedish, Bulgarian, Russian, Ukrainian, Hungarian, Slovak, Czech, Slovenian, Latvian or Greek) under the **Zoraxy Reverse Proxy** device. The entity ids keep their historical French suffixes so existing dashboards and automations keep working; on a new install they start with `zoraxy_reverse_proxy_zoraxy_`, the card's default prefix.

### Service `zoraxy.toggle_proxy_rule`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `domain` | `string` | yes | Domain of the rule (e.g. `myapp.example.com`) |
| `enable` | `boolean` | no | `true` to enable, `false` to disable; left out, the rule is toggled |
| `config_entry_id` | `string` | no | The Zoraxy instance (config entry) the rule belongs to; left out, the instance that lists the domain |

The action is reserved to administrators. It fails (and the card's button goes back) when the rule is not found or Zoraxy refuses the change. With several Zoraxy instances, the rule is looked up in all of them, unless `config_entry_id` names one.

```yaml
action: zoraxy.toggle_proxy_rule
data:
  domain: myapp.example.com
  enable: false
```

## Screenshots

| Full card (certificates and proxy rules open) | Full card, dark (certificates and proxy rules open) |
|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-zoraxy/main/screenshots/card.png" alt="card" width="400"> | <img src="https://raw.githubusercontent.com/juju35/ha-zoraxy/main/screenshots/card-dark.png" alt="card dark" width="400"> |

| Mini card | Mini card (dark) |
|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-zoraxy/main/screenshots/mini.png" alt="mini" width="400"> | <img src="https://raw.githubusercontent.com/juju35/ha-zoraxy/main/screenshots/mini-dark.png" alt="mini dark" width="400"> |

| Mini card zoomed in | Mini card zoomed in (dark) |
|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-zoraxy/main/screenshots/mini-zoom.png" alt="mini zoomed" width="400"> | <img src="https://raw.githubusercontent.com/juju35/ha-zoraxy/main/screenshots/mini-zoom-dark.png" alt="mini zoomed dark" width="400"> |

## How it works

The integration logs in to the Zoraxy web API, polls it at the refresh interval and logs in again when the session expires. The entities of a certificate or proxy rule added in Zoraxy appear at the next update, without reloading the integration, and those of a removed one are deleted. The uptime monitor's results (`/api/utm/list`) are read at most once a minute; Zoraxy itself checks each upstream every 5 minutes, every 30 seconds while it is down.

On the card, the button next to each proxy rule calls `zoraxy.toggle_proxy_rule` for the card's own instance; for users who are not administrators the button only shows the rule's state and is disabled, and a failed change shows its error in a toast; the button updates at once and the card refreshes when the integration has polled Zoraxy again. Certificates turn orange under 30 days and red under 7 days.

To debug:

```yaml
logger:
  logs:
    custom_components.zoraxy: debug
```

**⋮ → Download diagnostics** on the integration gives its settings and the last data read from Zoraxy, with the address, usernames, passwords, tokens, secrets, cookies and email addresses replaced by `**REDACTED**`.

## Development

```bash
pip install playwright && playwright install chromium
python scripts/screenshots.py   # renders both cards with mock entities into screenshots/ (CHROMIUM_PATH: an installed Chromium)
```

### Releasing

1. Bump the version in `custom_components/zoraxy/manifest.json` and `ZORAXY_CARD_VERSION` in the card
2. Add a `## <version>` section at the top of [CHANGELOG.md](https://github.com/juju35/ha-zoraxy/blob/main/CHANGELOG.md)
3. Push to `main`: the **Release** workflow creates the tag and the GitHub release with the changelog section as notes

## Translations

The integration and the card follow the language of Home Assistant (the card's `language` option can force another one). Currently supported:

| Language | Code |
|---|---|
| English | `en` |
| Français | `fr` |
| Deutsch | `de` |
| Español | `es` |
| Српски | `sr` |
| Srpski (latinica) | `sr-Latn` |
| Italiano | `it` |
| Nederlands | `nl` |
| Português (Portugal) | `pt` |
| Polski | `pl` |
| Română | `ro` |
| Dansk | `da` |
| Svenska | `sv` |
| Български | `bg` |
| Русский | `ru` |
| Українська | `uk` |
| Magyar | `hu` |
| Slovenčina | `sk` |
| Čeština | `cs` |
| Slovenščina | `sl` |
| Latviešu | `lv` |
| Ελληνικά | `el` |

Brazilian Portuguese (`pt-BR`): pt-BR uses the European Portuguese texts, in the integration (`pt-BR.json` is a copy of `pt.json`) and in the card. Contributions for additional languages are welcome!

## License

[MIT](https://github.com/juju35/ha-zoraxy/blob/main/LICENSE)

## Support

If you find this project useful, you can support its development:

<a href="https://buymeacoffee.com/julienstep9"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" height="50"></a>
