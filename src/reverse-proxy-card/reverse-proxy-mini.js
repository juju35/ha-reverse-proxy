// ── reverse-proxy-mini-card ──────────────────────────────────────────────────────────
// What the full card shows, on two lines: the logo, title and status pill, then one chip per key figure or alert.
// Its detail button (top right, `zoom: false` removes it) switches it to the full card and back; a click anywhere
// else brings it back too, unless it lands in a dialog opened from the card (more-info).
import { rpEsc } from "./helpers.js";
import { watchOutside } from "./dom-patching.js";
import { ReverseProxyCard } from "./reverse-proxy-card-2.js";

export class ReverseProxyMiniCard extends ReverseProxyCard {
  static CSS = `${ReverseProxyCard.CSS}
    ha-card:has(.mini) { padding: 12px; }
    .mini { display: flex; align-items: center; gap: 10px; }
    /* Full-size logo (40 px, as on the full card), top-aligned: 12 px from the card's top edge (the two lines are
       a little taller than the logo). */
    .mini .logo, .mini .brand-link { align-self: flex-start; }
    .body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .head { display: flex; align-items: center; gap: 8px; min-width: 0; }
    /* Natural width in a parent that sizes to its content (see :host::before in the full card). */
    :host { --zx-natural-width: 300px; }
    .rs { display: flex; flex-wrap: wrap; gap: 2px 4px; margin-left: -4px; }
    .rs:empty { display: none; }
    .r { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 3px; padding: 0 6px 0 4px; border-radius: 999px;
         font-size: 12px; font-weight: 500; line-height: 18px; white-space: nowrap; color: var(--primary-text-color); }
    .r .icon { width: 13px; height: 13px; color: var(--c); }
    /* A chip never gets wider than the card: its text ends in an ellipsis (full text in the tooltip). */
    .r { box-sizing: border-box; max-width: 100%; min-width: 0; }
    .r .rt { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .r.pill { color: color-mix(in srgb, var(--c) 50%, var(--primary-text-color)); background: color-mix(in srgb, var(--c) 14%, transparent); }
    .r:hover { background: color-mix(in srgb, var(--c) 20%, var(--secondary-background-color, transparent)); }
    /* A pill keeps a light tint on hover, so its darkened text stays readable. */
    .r.pill:hover { background: color-mix(in srgb, var(--c) 20%, transparent); }
    .r:focus-visible { outline: 2px solid var(--zx-accent); outline-offset: 2px; }
    .zoom { all: unset; flex: none; cursor: pointer; width: 24px; height: 24px; margin: -4px -4px -4px 0; border-radius: 50%;
            display: grid; place-items: center; color: var(--secondary-text-color); }
    .zoom .icon { width: 16px; height: 16px; }
    .zoom:hover { background: color-mix(in srgb, var(--secondary-text-color) 16%, transparent); color: var(--primary-text-color); }
    .zoom:focus-visible { outline: 2px solid var(--zx-accent); outline-offset: 1px; }
    .header .zoom { align-self: flex-start; margin: -4px -4px 0 0; }
    @container (max-width: 200px) {
      .mini { gap: 8px; }
      .head { gap: 6px; }
      .mini .logo { width: 28px; height: 28px; }
      .mini .logo svg { width: 18px; height: 18px; }
      .mini .logo .badge { width: 14px; height: 14px; right: -3px; bottom: -3px; }
    }
    @container (max-width: 150px) {
      .mini .logo, .mini .brand-link { display: none; }
    }
    /* Illustrated mini card: the banner, then the chips under it. */
    .rs-wrap { padding: 8px 12px 12px; }
    .rs-wrap:has(> .rs:empty) { display: none; }
  `;

  static getConfigElement() { return document.createElement("reverse-proxy-mini-card-editor"); }

  constructor() {
    super();
    this._zoomed = false;
    this._onUnzoom = (ev) => {
      const path = ev.composedPath();
      if (!this._zoomed || path.includes(this)) return;
      if (path.some((n) => ["ha-more-info-dialog", "ha-dialog", "dialog"].includes(n.localName))) return;
      this._zoomed = false;
      this._render();
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this._unzoom ??= watchOutside(this, this._onUnzoom);
    this._unzoom.on();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unzoom?.off();
    // Back to the compact view once off the screen.
    this._onUnzoom({ composedPath: () => [] });
  }

  setConfig(config) {
    if (config?.zoom != null && typeof config.zoom !== "boolean") throw new Error("zoom must be true or false");
    super.setConfig(config);
  }

  getCardSize() { return this._zoomed ? super.getCardSize() : this._illustrated() ? 3 : 2; }
  _hasZoom() { return this._config?.zoom !== false; }
  getGridOptions() { return { columns: 12, min_columns: 4, rows: "auto" }; }

  // A chip: plain (tinted icon) while all is well, a tinted pill when it needs a look. It opens the entity's more-info.
  _miniChip(entity, icon, text, cls, pill) {
    return `<button class="r ${cls}${pill ? " pill" : ""}" data-entity="${rpEsc(entity)}" title="${rpEsc(text)}">${this._mdi(
      ReverseProxyCard.ICONS[icon],
    )}<span class="rt">${rpEsc(text)}</span></button>`;
  }

  _miniChips() {
    const chips = [];
    const rulesId = this._eid("sensor.proxy_rules");
    const certsId = this._eid("sensor.tls_certificates");
    const portId = this._eid("sensor.inbound_port");
    const httpsId = this._eid("binary_sensor.https_redirect");
    const devId = this._eid("binary_sensor.development_mode");
    const total = this._value(rulesId);
    const active = this._value(this._eid("sensor.active_rules"));
    chips.push(this._miniChip(rulesId, "router", this._t("ruleCount").replace("{a}", active).replace("{n}", total), "ok"));
    // Rules whose upstream the uptime monitor found down: one chip with their count, opening the first one.
    const down = this._many("binary_sensor.upstream_problem").filter((id) => this._isOn(id));
    if (down.length) {
      chips.push(this._miniChip(down[0], "server", this._t("upstreamsDown").replace("{n}", down.length), "crit", true));
    }
    // Certificates expiring within 30 days get a chip each, the closest first; otherwise one chip with their count.
    if (this._has("certificates")) {
      const expiring = this._certSensors()
        .filter(({ expiring, days }) => (days !== null && days < 30) || this._isOn(expiring))
        .sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity));
      for (const { id, domain, days } of expiring) {
        const cls = days !== null && days < 7 ? "crit" : "warn";
        chips.push(this._miniChip(id, "cert", `${domain} · ${this._daysLabel(days)}`, cls, true));
      }
      if (!expiring.length) {
        chips.push(this._miniChip(certsId, "cert", this._t("certCount").replace("{n}", this._value(certsId)), "ok"));
      }
    } else if (this._has("middlewares")) {
      const mwId = this._eid("sensor.middlewares");
      chips.push(this._miniChip(mwId, "layers", `${this._value(mwId)} ${this._t("middlewares")}`, "ok"));
    }
    chips.push(this._miniChip(portId, "web", `${this._t("port")} ${this._value(portId)}`, "idle"));
    if (this._has("controls")) {
      // Controls only show when they need a look: HTTPS redirect off, development mode (no cache) on.
      // Exactly "off": unavailable or unknown is not "HTTPS redirect off".
      if (this._state(httpsId) === "off") {
        chips.push(this._miniChip(httpsId, "lock", `${this._t("httpsRedirect")} ${this._t("off")}`, "warn", true));
      }
      if (this._isOn(devId)) {
        chips.push(this._miniChip(devId, "code", `${this._t("devMode")} ${this._t("on")}`, "warn", true));
      }
    }
    if (this._has("version")) {
      const versionId = this._eid("sensor.version");
      if (this._value(versionId) !== "–") chips.push(this._miniChip(versionId, "tag", `v${this._value(versionId)}`, "idle"));
    }
    return chips.join("");
  }

  _render() {
    if (!this._hass || !this._config) return;
    const focus = this._byPointer ? null : this._focusKey();
    if (this._zoomed) this._draw();
    else this._renderMini();
    this._fitPill();
    this._restoreFocus(focus);
  }

  _renderMini() {
    this._snapshot();
    const { head, status } = this._headParts();
    const root = this._paint(`
      <style>${this.constructor.CSS}</style>
      <ha-card lang="${this._lang()}">
        ${this._illustrated()
          ? `${this._banner(head, `<div class="trow">${this._nameLink()}<span id="status">${status}</span></div>`)}
        <div class="rs-wrap"><div class="rs">${this._miniChips()}</div></div>`
          : `<div class="mini">
          ${this._headerIcon(head.cls)}
          <div class="body">
            <div class="titles"><div class="trow head">${this._nameLink()}<span id="status">${status}</span></div></div>
            <div class="rs">${this._miniChips()}</div>
          </div>
        </div>`}
      </ha-card>`);
    root.querySelectorAll(".r").forEach((el) => {
      el.addEventListener("click", () => {
        this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: el.dataset.entity }, bubbles: true, composed: true }));
      });
    });
    this._decorate(root);
    this._commit(root);
  }

  _decorate(root) {
    this._addZoom(root);
  }

  // Detail button at the end of the header, top right in both views.
  _addZoom(root = this.shadowRoot) {
    // On the illustrated header the button sits at the banner's top right (the picture leaves it room).
    const head = this._config.zoom !== false && (root.querySelector(".banner") || root.querySelector(".head, .header"));
    if (!head) return;
    const button = document.createElement("button");
    button.className = "zoom";
    // Found again by _restoreFocus after a state update redraws the card (ReverseProxyCard.FOCUS_ATTRS).
    button.dataset.action = "zoom";
    button.title = this._t(this._zoomed ? "zoomOut" : "zoomIn");
    button.setAttribute("aria-label", button.title);
    button.innerHTML = this._mdi(ReverseProxyCard.ICONS[this._zoomed ? "arrowCollapse" : "arrowExpand"]);
    button.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this._zoomed = !this._zoomed;
      this._render();
      // Keyboard use (Enter / Space: no click count) keeps the focus on the button that replaced this one.
      if (ev.detail === 0) this.shadowRoot.querySelector(".zoom")?.focus({ preventScroll: true });
    });
    head.appendChild(button);
  }
}
