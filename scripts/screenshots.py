"""Render the reverse proxy card and mini card (Zoraxy, Traefik, Nginx Proxy Manager) with mock entities and save the README screenshots.

Usage: python scripts/screenshots.py  (needs `pip install playwright pillow` and `playwright install chromium`)
The clock is frozen so certificate countdowns stay the same. A file is rewritten only when its decoded pixels
change (PNG bytes can differ for the same picture), so an unchanged render commits nothing. Every shot is in English, with 16 px of
theme background around the card (full card 460 px wide, mini card 380 px, 460 px zoomed in).
"""

import io
import os
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CARD_JS = (ROOT / "custom_components/reverse_proxy/frontend/reverse-proxy-card.js").read_text()
NOW = "2026-10-20T08:30:00+02:00"
WIDTH = 460  # full card, and the mini card zoomed in
MINI_WIDTH = 380
P = "zoraxy_reverse_proxy_zoraxy"
T = "traefik_reverse_proxy"
N = "nginx_proxy_manager"

THEMES = {
    "light": {
        "--primary-background-color": "#e8eaed",
        "--secondary-background-color": "#ececec",
        "--card-background-color": "#ffffff",
        "--primary-text-color": "#212121",
        "--secondary-text-color": "#727272",
        "--divider-color": "rgba(0,0,0,.12)",
    },
    "dark": {
        "--primary-background-color": "#111111",
        "--secondary-background-color": "#282828",
        "--card-background-color": "#1c1c1c",
        "--primary-text-color": "#e1e1e1",
        "--secondary-text-color": "#9b9b9b",
        "--divider-color": "rgba(225,225,225,.12)",
    },
}
COMMON = {
    "--primary-color": "#03a9f4",
    "--info-color": "#039be5",
    "--success-color": "#43a047",
    "--warning-color": "#ffa600",
    "--error-color": "#db4437",
}

# Minimal stand-in for Home Assistant's <ha-card>.
HA_CARD = """customElements.define("ha-card", class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML =
      "<style>:host{display:block;background:var(--card-background-color);border-radius:12px;" +
      "border:1px solid var(--divider-color);color:var(--primary-text-color);overflow:hidden}</style><slot></slot>";
  }
});"""

RULES = [
    {"domain": "ha.example.org", "target": "192.168.1.10:8123", "enabled": True},
    {"domain": "nas.example.org", "target": "192.168.1.20:9999", "enabled": True},
    {"domain": "photos.example.org", "target": "192.168.1.20:2342", "enabled": False},
]
REDIRECTS = [{"RedirectURL": "example.org", "TargetURL": "https://www.example.org", "StatusCode": 301}]
CERTS = {
    "ha_example_org": "2026-12-31T00:00:00Z",
    "nas_example_org": "2026-11-08T00:00:00Z",
    "photos_example_org": "2026-10-24T00:00:00Z",
}


def state(entity_id, value, **attributes):
    return entity_id, {"entity_id": entity_id, "state": value, "attributes": attributes}


ZORAXY_FEATURES = ["access_rules", "certificates", "controls", "redirects", "toggle_rules"]
TRAEFIK_FEATURES = ["middlewares", "redirects", "version"]
NPM_FEATURES = ["access_rules", "certificates", "redirects", "toggle_rules", "version"]

# A Zoraxy instance: the 1.x entity ids (French suffixes), every feature.
STATES = dict(
    [
        state(f"binary_sensor.{P}_proxy_actif", "on", proxy_type="zoraxy", features=ZORAXY_FEATURES),
        state(f"binary_sensor.{P}_redirection_https", "on"),
        state(f"binary_sensor.{P}_ecoute_port_80", "on"),
        state(f"binary_sensor.{P}_mode_developpement", "off"),
        # The control tiles need the switch too, or they show Unavailable.
        state(f"switch.{P}_redirection_https", "on"),
        state(f"switch.{P}_ecoute_port_80", "on"),
        state(f"switch.{P}_mode_developpement", "off"),
        state(f"sensor.{P}_regles_proxy", str(len(RULES)), rules=RULES, redirects=REDIRECTS),
        state(f"sensor.{P}_regles_actives", "2"),
        state(f"sensor.{P}_certificats_tls", str(len(CERTS))),
        state(f"sensor.{P}_port_entrant", "443"),
        *[state(f"sensor.{P}_cert_{k}", v, domain=k.replace("_", ".")) for k, v in CERTS.items()],
        *[state(f"binary_sensor.{P}_cert_expirant_{k}", "on" if k.startswith("photos") else "off") for k in CERTS],
        # Upstream health from Zoraxy's uptime monitor: the NAS is down, the disabled rule is not checked.
        state(f"binary_sensor.{P}_upstream_ha_example_org", "off", domain="ha.example.org"),
        state(f"binary_sensor.{P}_upstream_nas_example_org", "on", domain="nas.example.org"),
        state(f"binary_sensor.{P}_upstream_photos_example_org", "unknown", domain="photos.example.org"),
    ]
)

# A Traefik instance: Home Assistant's default entity ids, read-only API (no controls, no certificates), the
# health check of the NAS service found a server down.
TRAEFIK_RULES = [
    {"domain": "ha.example.org", "target": "http://192.168.1.10:8123", "enabled": True, "tls": True},
    {"domain": "nas.example.org", "target": "http://192.168.1.20:9999", "enabled": True, "tls": True},
    {"domain": "photos.example.org", "target": "http://192.168.1.20:2342", "enabled": False, "tls": True},
]
TRAEFIK_REDIRECTS = [{"RedirectURL": "redirect-to-https", "TargetURL": "https://…", "StatusCode": 301}]
TRAEFIK_STATES = dict(
    [
        state(f"binary_sensor.{T}_proxy_running", "on", proxy_type="traefik", features=TRAEFIK_FEATURES),
        state(f"binary_sensor.{T}_tls_enabled", "on"),
        state(f"sensor.{T}_proxy_rules", str(len(TRAEFIK_RULES)), rules=TRAEFIK_RULES, redirects=TRAEFIK_REDIRECTS),
        state(f"sensor.{T}_active_rules", "2"),
        state(f"sensor.{T}_middlewares", "4"),
        state(f"sensor.{T}_inbound_port", "443"),
        state(f"sensor.{T}_version", "3.3.6"),
        state(f"binary_sensor.{T}_ha_example_org_upstream", "off", domain="ha.example.org"),
        state(f"binary_sensor.{T}_nas_example_org_upstream", "on", domain="nas.example.org"),
        state(f"binary_sensor.{T}_photos_example_org_upstream", "unknown", domain="photos.example.org"),
    ]
)


# A Nginx Proxy Manager instance: Home Assistant's default entity ids, proxy hosts with their on/off button,
# Let's Encrypt certificates; NPM does not check the upstreams, so their health is unknown.
NPM_RULES = [
    {"domain": "ha.example.org", "target": "http://192.168.1.10:8123", "enabled": True, "tls": True},
    {"domain": "nas.example.org", "target": "https://192.168.1.20:5001", "enabled": True, "tls": True},
    {"domain": "photos.example.org", "target": "http://192.168.1.20:2342", "enabled": False, "tls": True},
]
NPM_REDIRECTS = [{"RedirectURL": "example.org", "TargetURL": "https://www.example.org", "StatusCode": 301}]
NPM_STATES = dict(
    [
        state(f"binary_sensor.{N}_proxy_running", "on", proxy_type="nginx_proxy_manager", features=NPM_FEATURES),
        state(f"binary_sensor.{N}_tls_enabled", "on"),
        state(f"sensor.{N}_proxy_rules", str(len(NPM_RULES)), rules=NPM_RULES, redirects=NPM_REDIRECTS),
        state(f"sensor.{N}_active_rules", "2"),
        state(f"sensor.{N}_tls_certificates", str(len(CERTS))),
        state(f"sensor.{N}_access_rules", "1"),
        state(f"sensor.{N}_inbound_port", "443"),
        state(f"sensor.{N}_version", "2.12.3"),
        *[state(f"sensor.{N}_{k}_certificate", v, domain=k.replace("_", ".")) for k, v in CERTS.items()],
        *[
            state(
                f"binary_sensor.{N}_{k}_certificate_expiring",
                "on" if k.startswith("photos") else "off",
                domain=k.replace("_", "."),
            )
            for k in CERTS
        ],
        *[state(f"button.{N}_renew_{k}", "unknown", domain=k.replace("_", ".")) for k in CERTS],
        *[
            state(f"binary_sensor.{N}_{r['domain'].replace('.', '_')}_upstream", "unknown", domain=r["domain"])
            for r in NPM_RULES
        ],
    ]
)


def registry(states, platform="reverse_proxy", device="dev-1"):
    """The entity registry the card reads: every state under one device of the integration."""
    entities = {}
    for entity_id in states:
        object_id = entity_id.split(".", 1)[1]
        key = object_id.removeprefix(f"{T}_").removeprefix(f"{N}_")
        # Translation keys of the Traefik ids (device name + translated name); the Zoraxy ids use the prefix fallback.
        translation_key = {
            "proxy_running": "proxy_running",
            "tls_enabled": "tls_enabled",
            "proxy_rules": "proxy_rules",
            "active_rules": "active_rules",
            "middlewares": "middlewares",
            "inbound_port": "inbound_port",
            "version": "version",
            "tls_certificates": "tls_certificates",
            "access_rules": "access_rules",
        }.get(key) or (
            "upstream_problem"
            if key.endswith("_upstream")
            else "certificate_expiring"
            if key.endswith("_certificate_expiring")
            else "certificate"
            if key.endswith("_certificate")
            else "renew"
            if key.startswith("renew_")
            else key
        )
        entities[entity_id] = {
            "entity_id": entity_id,
            "platform": platform,
            "device_id": device,
            "translation_key": translation_key,
        }
    return entities


SHOTS = [
    # Each light/dark pair shows exactly the same state: only the theme changes.
    {"file": "card", "theme": "light", "open": ["certs", "rules"]},
    {"file": "card-dark", "theme": "dark", "open": ["certs", "rules"]},
    # The mini card, and the same card zoomed in (its detail button clicked).
    {"file": "mini", "theme": "light", "tag": "reverse-proxy-mini-card", "width": MINI_WIDTH},
    {"file": "mini-dark", "theme": "dark", "tag": "reverse-proxy-mini-card", "width": MINI_WIDTH},
    {"file": "mini-zoom", "theme": "light", "tag": "reverse-proxy-mini-card", "zoom": True},
    {"file": "mini-zoom-dark", "theme": "dark", "tag": "reverse-proxy-mini-card", "zoom": True},
    # The same cards for a Traefik instance (found through the entity registry).
    {
        "file": "card-traefik",
        "theme": "light",
        "open": ["rules"],
        "states": TRAEFIK_STATES,
        "url": "https://traefik.example.org",
    },
    {
        "file": "card-traefik-dark",
        "theme": "dark",
        "open": ["rules"],
        "states": TRAEFIK_STATES,
        "url": "https://traefik.example.org",
    },
    {
        "file": "mini-traefik",
        "theme": "light",
        "tag": "reverse-proxy-mini-card",
        "width": MINI_WIDTH,
        "states": TRAEFIK_STATES,
        "url": "https://traefik.example.org",
    },
    {
        "file": "mini-traefik-dark",
        "theme": "dark",
        "tag": "reverse-proxy-mini-card",
        "width": MINI_WIDTH,
        "states": TRAEFIK_STATES,
        "url": "https://traefik.example.org",
    },  # And for a Nginx Proxy Manager instance.
    *[
        {
            "file": f"card-npm{suffix}",
            "theme": theme,
            "open": ["certs", "rules"],
            "states": NPM_STATES,
            "url": "http://npm.example.org:81",
        }
        for theme, suffix in (("light", ""), ("dark", "-dark"))
    ],
    *[
        {
            "file": f"mini-npm{suffix}",
            "theme": theme,
            "tag": "reverse-proxy-mini-card",
            "width": MINI_WIDTH,
            "states": NPM_STATES,
            "url": "http://npm.example.org:81",
        }
        for theme, suffix in (("light", ""), ("dark", "-dark"))
    ],
]


def page_html(theme, width):
    variables = "".join(f"{k}:{v};" for k, v in {**THEMES[theme], **COMMON}.items())
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
  :root {{ {variables} }}
  body {{ margin: 0; padding: 16px; background: var(--primary-background-color); color: var(--primary-text-color);
         font-family: Roboto, "Segoe UI", Helvetica, Arial, sans-serif; width: {width}px; }}
</style></head><body><div id="root"></div></body></html>"""


def same_pixels(png: bytes, path: Path) -> bool:
    """True when the file at path decodes to exactly the same image (size and RGBA pixels) as png."""
    if not path.exists():
        return False
    with Image.open(io.BytesIO(png)) as new, Image.open(path) as old:
        return new.size == old.size and new.convert("RGBA").tobytes() == old.convert("RGBA").tobytes()


def save_if_changed(png: bytes, path: Path) -> bool:
    """Write png to path unless the file already holds the same pixels; True when written."""
    if same_pixels(png, path):
        return False
    path.write_bytes(png)
    return True


def main():
    from playwright.sync_api import sync_playwright  # noqa: PLC0415 - the pixel helpers above import without it

    out_dir = ROOT / "screenshots"
    out_dir.mkdir(exist_ok=True)
    with sync_playwright() as p:
        # CHROMIUM_PATH: an already installed Chromium, instead of the one `playwright install` downloads.
        browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None)
        context = browser.new_context(
            device_scale_factor=2,
            viewport={"width": 1000, "height": 2400},
            timezone_id="Europe/Paris",
        )
        for shot in SHOTS:
            # A new page per capture: the card's top-level declarations would clash in a reused page.
            page = context.new_page()
            page.on("pageerror", lambda err: print(f"page error: {err}"))
            page.clock.set_fixed_time(NOW)
            width = shot.get("width", WIDTH)
            page.set_content(page_html(shot["theme"], width))
            page.add_script_tag(content=HA_CARD)
            page.add_script_tag(content=CARD_JS)
            page.evaluate(
                """({states, entities, dark, open, tag, zoom, url}) => {
                  const el = document.createElement(tag);
                  el.setConfig({type: `custom:${tag}`, proxy_url: url});
                  el.hass = {states, entities, language: "en", locale: {language: "en"}, themes: {darkMode: dark}, callService: () => Promise.resolve()};
                  document.getElementById("root").appendChild(el);
                  // A mouse click (detail: 1), so that no focus ring shows on the new button.
                  const click = (node) => node.dispatchEvent(new MouseEvent("click", {bubbles: true, composed: true, detail: 1}));
                  if (zoom) click(el.shadowRoot.querySelector(".zoom"));
                  for (const id of open) click(el.shadowRoot.querySelector(`.sec-header[data-id="${id}"]`));
                }""",
                {
                    "states": shot.get("states", STATES),
                    # The Zoraxy shots use the prefix fallback (no registry), as a 1.x dashboard did.
                    "entities": registry(shot["states"]) if "states" in shot else None,
                    "dark": shot["theme"] == "dark",
                    "open": shot.get("open", []),
                    "tag": shot.get("tag", "reverse-proxy-card"),
                    "zoom": shot.get("zoom", False),
                    "url": shot.get("url", "https://proxy.example.org"),
                },
            )
            page.wait_for_timeout(300)
            # The card with 16 px of theme background around it
            box = page.locator("#root").bounding_box()
            png = page.screenshot(
                clip={"x": 0, "y": 0, "width": width + 32, "height": int(box["height"] + 0.999) + 32},
                animations="disabled",
            )
            written = save_if_changed(png, out_dir / f"{shot['file']}.png")
            print(f"screenshots/{shot['file']}.png{'' if written else ' (unchanged)'}")
            page.close()
        browser.close()


if __name__ == "__main__":
    main()
