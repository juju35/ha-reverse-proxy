// ── Editors ───────────────────────────────────────────────────────────────────
import { REVERSE_PROXY_CARD_VERSION, pickerDefine } from "./card-picker.js";
import { ReverseProxyCard } from "./reverse-proxy-card-2.js";
import { ReverseProxyMiniCard } from "./reverse-proxy-mini.js";

export class ReverseProxyCardEditor extends HTMLElement {
  static SCHEMA = [
    // Which proxy, with several instances; left empty, the one of the entity prefix (or the first one).
    { name: "device", selector: { device: { integration: "reverse_proxy" } } },
    { name: "proxy_url", selector: { text: { type: "url" } } },
    { name: "entity_prefix", selector: { text: {} } },
    { name: "show_title", selector: { boolean: {} } },
    { name: "show_subtitle", selector: { boolean: {} } },
    // The illustrated header (false: the classic header) and its day / night picture (auto: the dark mode).
    { name: "illustration", selector: { boolean: {} } },
    { name: "illustration_theme", selector: { select: { mode: "dropdown", options: ["auto", "day", "night"] } } },
  ];

  // The fields, then the language picker (its "Auto" label in the editor's language).
  static schema(t) {
    const options = [
      { value: "", label: t("lang_auto") },
      { value: "en", label: "English" },
      { value: "fr", label: "Français" },
      { value: "de", label: "Deutsch" },
      { value: "es", label: "Español" },
      { value: "sr", label: "Српски" },
      { value: "sr-Latn", label: "Srpski (latinica)" },
      { value: "it", label: "Italiano" },
      { value: "nl", label: "Nederlands" },
      { value: "pt", label: "Português (Portugal)" },
      { value: "pl", label: "Polski" },
      { value: "ro", label: "Română" },
      { value: "da", label: "Dansk" },
      { value: "sv", label: "Svenska" },
      { value: "bg", label: "Български" },
      { value: "ru", label: "Русский" },
      { value: "uk", label: "Українська" },
      { value: "hu", label: "Magyar" },
      { value: "sk", label: "Slovenčina" },
      { value: "cs", label: "Čeština" },
      { value: "sl", label: "Slovenščina" },
      { value: "lv", label: "Latviešu" },
      { value: "el", label: "Ελληνικά" },
    ];
    const themes = [
      { value: "auto", label: t("theme_auto") },
      { value: "day", label: t("theme_day") },
      { value: "night", label: t("theme_night") },
    ];
    const fields = this.SCHEMA.map((f) => (f.name === "illustration_theme" ? { ...f, selector: { select: { mode: "dropdown", options: themes } } } : f));
    return [...fields, { name: "language", selector: { select: { mode: "dropdown", options } } }];
  }

  static DEFAULTS = { entity_prefix: "zoraxy_reverse_proxy_zoraxy", show_title: true, show_subtitle: true, illustration: true, illustration_theme: "auto" };

  setConfig(config) {
    this._config = Object.assign({}, config);
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    else this._render();
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.addEventListener("value-changed", this._valueChanged.bind(this));
      this.appendChild(this._form);
    }
    // The labels follow the language picked in the editor: rebuilt only when it changes.
    const lang = ReverseProxyCard.langOfHass(this._hass, this._config);
    if (lang !== this._lang) {
      this._lang = lang;
      const t = (key) => ReverseProxyCard.I18N[lang][key]?.replaceAll("{proxy}", "Zoraxy / Traefik / Nginx Proxy Manager");
      this._form.schema = this.constructor.schema(t);
      this._form.computeLabel = (field) => t(`ed_${field.name}`) || field.name;
      this._form.computeHelper = (field) => t(`ed_${field.name}_helper`);
    }
    this._form.hass = this._hass;
    // Show the defaults as set, so the fields match what the card does; `zoraxy_url` (up to 1.14.x) shows as `proxy_url`.
    const { zoraxy_url: legacyUrl, ...config } = this._config;
    this._form.data = Object.assign({}, this.constructor.DEFAULTS, legacyUrl ? { proxy_url: legacyUrl } : {}, config);
  }

  _valueChanged(ev) {
    ev.stopPropagation();
    const value = Object.assign({}, ev.detail.value);
    // Keep the YAML short: drop options left empty or at their default.
    const defaults = this.constructor.DEFAULTS;
    Object.keys(defaults).forEach((key) => {
      if (value[key] === defaults[key]) delete value[key];
    });
    ["device", "proxy_url", "entity_prefix", "language"].forEach((key) => { if (!value[key]) delete value[key]; });
    delete value.zoraxy_url;
    this._config = value;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: value }, bubbles: true, composed: true }));
  }
}

// The mini card's editor: the full card's fields, plus the detail button.
export class ReverseProxyMiniCardEditor extends ReverseProxyCardEditor {
  static SCHEMA = [...ReverseProxyCardEditor.SCHEMA, { name: "zoom", selector: { boolean: {} } }];
  static DEFAULTS = { ...ReverseProxyCardEditor.DEFAULTS, zoom: true };
}

// The names of the cards up to 1.14.x (zoraxy-card, zoraxy-mini-card) stay as aliases: a custom element class is
// registered once, so each alias is a subclass of its card.
export class ZoraxyCard extends ReverseProxyCard {}
export class ZoraxyMiniCard extends ReverseProxyMiniCard {}
export class ZoraxyCardEditor extends ReverseProxyCardEditor {}
export class ZoraxyMiniCardEditor extends ReverseProxyMiniCardEditor {}

export const DOC_URL = "https://github.com/juju35/ha-reverse-proxy";
for (const [tag, cls] of [
  ["reverse-proxy-card-editor", ReverseProxyCardEditor],
  ["reverse-proxy-mini-card-editor", ReverseProxyMiniCardEditor],
  ["zoraxy-card-editor", ZoraxyCardEditor],
  ["zoraxy-mini-card-editor", ZoraxyMiniCardEditor],
  ["zoraxy-card", ZoraxyCard],
  ["zoraxy-mini-card", ZoraxyMiniCard],
]) {
  if (!customElements.get(tag)) pickerDefine(tag, cls);
}

// Each card is registered on its own: a page that already loaded an older copy of this file (a stale resource
// or a cached version without the mini card) still gets the mini card from this one.
window.customCards = window.customCards || [];
if (!customElements.get("reverse-proxy-card")) {
  pickerDefine("reverse-proxy-card", ReverseProxyCard);
  window.customCards.push({ type: "reverse-proxy-card", name: "Reverse Proxy Card", description: "Status, controls, certificates and proxy rules of a Zoraxy, Traefik or Nginx Proxy Manager reverse proxy", preview: true, documentationURL: DOC_URL });
  console.info(`%c REVERSE-PROXY-CARD %c v${REVERSE_PROXY_CARD_VERSION} `, "color:#bfdbfe;background:#0f172a;font-weight:700", "color:#0f172a;background:#bfdbfe");
}
if (!customElements.get("reverse-proxy-mini-card")) {
  pickerDefine("reverse-proxy-mini-card", ReverseProxyMiniCard);
  window.customCards.push({ type: "reverse-proxy-mini-card", name: "Reverse Proxy Mini Card", description: "Zoraxy, Traefik or Nginx Proxy Manager status, rules and alerts on two lines, with a detail button showing the full card", preview: true, documentationURL: DOC_URL });
}
