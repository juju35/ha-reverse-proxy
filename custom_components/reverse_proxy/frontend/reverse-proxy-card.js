const REVERSE_PROXY_CARD_VERSION = '2.4.2';

// Escapes a value interpolated into innerHTML, as text or inside a quoted attribute (as parcelEsc in ha-parcel).
function rpEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

// Only http(s) URLs become links: anything else (javascript:, data:…) is dropped.
function rpSafeUrl(url) {
  const value = String(url || "").trim();
  return /^https?:\/\//i.test(value) ? value : "";
}

// "A click elsewhere" is caught on the pointer, not only on the click event: on iOS (Safari and the companion app)
// a tap on something that is not clickable (the background, an empty spot, a card with no action) sends no click to
// the page. The handler runs when the press and the release are both outside the card (a slider dragged out of the
// card does not count), and a scroll does not count (the browser cancels the pointer); keyboard clicks still go
// through the click event. The handler keeps its own checks (outside of the card, not in a dialog).
const watchOutside = (card, handler) => {
  let downOutside = false;
  const onDown = (ev) => {
    downOutside = !ev.composedPath().includes(card);
  };
  const onUp = (ev) => {
    if (downOutside) handler(ev);
    downOutside = false;
  };
  const onClick = (ev) => {
    if (ev.detail === 0) handler(ev);
  };
  return {
    on() {
      document.addEventListener("pointerdown", onDown, true);
      document.addEventListener("pointerup", onUp, true);
      document.addEventListener("click", onClick, true);
    },
    off() {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("click", onClick, true);
    },
    // A tap (press and release at the same spot), for the tests.
    tap(ev) {
      onDown(ev);
      onUp(ev);
    },
  };
};

class ReverseProxyCard extends HTMLElement {

  // ── Statics ────────────────────────────────────────────────────────────────

  static ICONS = {
    router:  "M10.59,13.41C11,13.8 11,14.44 10.59,14.83C10.2,15.22 9.56,15.22 9.17,14.83C7.22,12.88 7.22,9.71 9.17,7.76L12.76,4.17C14.71,2.22 17.88,2.22 19.83,4.17C21.78,6.12 21.78,9.29 19.83,11.24L18.29,12.78C18.3,12.03 18.17,11.27 17.89,10.56L18.71,9.76C19.9,8.56 19.9,6.56 18.71,5.36C17.5,4.17 15.5,4.17 14.29,5.36L10.7,8.95C9.5,10.15 9.5,12.15 10.59,13.41M13.41,9.17C13.8,8.78 14.44,8.78 14.83,9.17C16.78,11.12 16.78,14.29 14.83,16.24L11.24,19.83C9.29,21.78 6.12,21.78 4.17,19.83C2.22,17.88 2.22,14.71 4.17,12.76L5.71,11.22C5.7,11.97 5.83,12.73 6.11,13.44L5.29,14.24C4.1,15.44 4.1,17.44 5.29,18.64C6.5,19.83 8.5,19.83 9.71,18.64L13.3,15.05C14.5,13.85 14.5,11.85 13.41,10.59C13,10.2 13,9.56 13.41,9.17Z",
    lock:    "M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6C4.89,22 4,21.1 4,20V10C4,8.89 4.89,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3M12,17A2,2 0 0,0 14,15A2,2 0 0,0 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17Z",
    web:     "M16.36,14C16.44,13.34 16.5,12.68 16.5,12C16.5,11.32 16.44,10.66 16.36,10H19.74C19.9,10.64 20,11.31 20,12C20,12.69 19.9,13.36 19.74,14M14.59,19.56C15.19,18.45 15.65,17.25 15.97,16H18.92C17.96,17.65 16.43,18.93 14.59,19.56M14.34,14H9.66C9.56,13.34 9.5,12.68 9.5,12C9.5,11.32 9.56,10.65 9.66,10H14.34C14.43,10.65 14.5,11.32 14.5,12C14.5,12.68 14.43,13.34 14.34,14M12,19.96C11.17,18.76 10.5,17.43 10.09,16H13.91C13.5,17.43 12.83,18.76 12,19.96M8,8H5.08C6.03,6.34 7.57,5.06 9.4,4.44C8.8,5.55 8.35,6.75 8,8M5.08,16H8C8.35,17.25 8.8,18.45 9.4,19.56C7.57,18.93 6.03,17.65 5.08,16M4.26,14C4.1,13.36 4,12.69 4,12C4,11.31 4.1,10.64 4.26,10H7.64C7.56,10.66 7.5,11.32 7.5,12C7.5,12.68 7.56,13.34 7.64,14M12,4.03C12.83,5.23 13.5,6.57 13.91,8H10.09C10.5,6.57 11.17,5.23 12,4.03M18.92,8H15.97C15.65,6.75 15.19,5.55 14.59,4.44C16.43,5.07 17.96,6.34 18.92,8M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",
    code:    "M14.6,16.6L19.2,12L14.6,7.4L16,6L22,12L16,18L14.6,16.6M9.4,16.6L4.8,12L9.4,7.4L8,6L2,12L8,18L9.4,16.6Z",
    cert:    "M13,21L15,20L17,21V14H13M17,9V7H15V9H13V11H15V13H17V11H19V9M11,9H3V11H11M11,13H3V15H11M3,7V9H11V7",
    refresh: "M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4",
    server:  "M4,1H20A1,1 0 0,1 21,2V6A1,1 0 0,1 20,7H4A1,1 0 0,1 3,6V2A1,1 0 0,1 4,1M4,9H20A1,1 0 0,1 21,10V14A1,1 0 0,1 20,15H4A1,1 0 0,1 3,14V10A1,1 0 0,1 4,9M4,17H20A1,1 0 0,1 21,18V22A1,1 0 0,1 20,23H4A1,1 0 0,1 3,22V18A1,1 0 0,1 4,17M9,5H10V3H9V5M9,13H10V11H9V13M9,21H10V19H9V21M6,3V5H7V3H6M6,11V13H7V11H6M6,19V21H7V19H6Z",
    redirect:"M14,3L17,6H14.5C12,6 10,8 10,10.5V14.5C8.86,14.18 8,13.19 8,12V10.5C8,6.91 10.91,4 14.5,4L17,3.97L14,1M10,21L7,18H9.5C12,18 14,16 14,13.5V9.5C15.14,9.82 16,10.81 16,12V13.5C16,17.09 13.09,20 9.5,20L7,20.03L10,23",
    chevronDown: "M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z",
    arrowExpand: "M10,21V19H6.41L10.91,14.5L9.5,13.09L5,17.59V14H3V21H10M14.5,10.91L19,6.41V10H21V3H14V5H17.59L13.09,9.5L14.5,10.91Z",
    arrowCollapse: "M19.5,3.09L15,7.59V4H13V11H20V9H16.41L20.91,4.5L19.5,3.09M4,13V15H7.59L3.09,19.5L4.5,20.91L9,16.41V20H11V13H4Z",
    layers:  "M12,16L19.36,10.27L21,9L12,2L3,9L4.63,10.27M12,18.54L4.62,12.81L3,14.07L12,21.07L21,14.07L19.37,12.8L12,18.54Z",
    tag:     "M21.41,11.58L12.41,2.58C12.05,2.22 11.55,2 11,2H4C2.9,2 2,2.9 2,4V11C2,11.55 2.22,12.05 2.59,12.42L11.59,21.42C11.95,21.78 12.45,22 13,22C13.55,22 14.05,21.78 14.41,21.41L21.41,14.41C21.78,14.05 22,13.55 22,13C22,12.45 21.77,11.94 21.41,11.58M13,20L4,11V4H11L20,13M6.5,5C7.33,5 8,5.67 8,6.5C8,7.33 7.33,8 6.5,8C5.67,8 5,7.33 5,6.5C5,5.67 5.67,5 6.5,5Z",
  };

  // mdi:server-network, the project's icon on the showcase site.
  static SERVER_NETWORK = "M13,19H14A1,1 0 0,1 15,20H22V22H15A1,1 0 0,1 14,23H10A1,1 0 0,1 9,22H2V20H9A1,1 0 0,1 10,19H11V17H4A1,1 0 0,1 3,16V12A1,1 0 0,1 4,11H20A1,1 0 0,1 21,12V16A1,1 0 0,1 20,17H13V19M4,3H20A1,1 0 0,1 21,4V8A1,1 0 0,1 20,9H4A1,1 0 0,1 3,8V4A1,1 0 0,1 4,3M9,7H10V5H9V7M9,15H10V13H9V15M5,5V7H7V5H5M5,13V15H7V13H5Z";

  // The supported reverse proxies: brand name, and the brand mark shown as a badge on the header icon (the Zoraxy
  // logo: two dark arcs, a blue disc and its two arrows; the Traefik Proxy logo: its blue node; the Nginx Proxy
  // Manager logo: its coloured hexagons). What the proxy's
  // API allows (`features` attribute of the running binary sensor) decides which controls the card shows.
  static BRANDS = {
    zoraxy: {
      name: "Zoraxy",
      mark: `<svg viewBox="0 0 512 512" aria-hidden="true">
    <path fill="#213040" d="M427.1 65.6 369 130.3c34.4 30.9 56 75.8 56 125.7s-21.6 94.8-56 125.7l58.1 64.7C479.2 399.5 512 331.6 512 256s-32.8-143.5-84.9-190.4M84.9 446.4l58.1-64.7c-34.4-30.9-56-75.8-56-125.7s21.6-94.8 56-125.7L84.9 65.6C32.8 112.5 0 180.4 0 256s32.8 143.5 84.9 190.4"/>
    <path fill="#a9d1f3" d="M310.7 32.8 256 98.5l-54.7-65.7zm0 380.7L256 479.2l-54.7-65.7z"/>
    <circle cx="256" cy="256" r="81.2" fill="#a9d1f3"/>
  </svg>`,
      features: ["access_rules", "certificates", "controls", "redirects", "toggle_rules"],
    },
    traefik: {
      name: "Traefik",
      mark: `<svg viewBox="2.67 10.17 123.05 110.77" aria-hidden="true"><path fill="#24a1c1" d="M64.188 10.172c5.582 0 10.542 3.937 10.542 8.785s-4.722 8.785-10.543 8.785q-.995 0-2.601-.328a3.5 3.5 0 0 0-2.438.39L21.355 49.298a1.76 1.76 0 0 0 .008 3.062l40.969 22.996a3.52 3.52 0 0 0 3.426.012l41.187-22.898a1.752 1.752 0 0 0 .016-3.063l-12.852-7.293a3.52 3.52 0 0 0-3.441-.02l-13.563 7.524a1.21 1.21 0 0 0-.613.918l-.004.13c0 4.85-4.722 8.784-10.543 8.784-5.816 0-10.539-3.933-10.539-8.785 0-4.848 4.723-8.785 10.54-8.785.218 0 .464.016.745.035l.446.047.492.059c.75.101 1.512-.04 2.176-.407l20.065-11.13a5.27 5.27 0 0 1 4.945-.086l.215.11 28.016 15.906c3.512 1.992 3.55 7.012.144 9.082l-.187.11-18.746 10.417a1.76 1.76 0 0 0-.899 1.559c.012.645.371 1.23.938 1.531l18.562 9.766c3.688 1.937 3.774 7.183.16 9.242L66.642 120.25a5.28 5.28 0 0 1-5.227 0L5.36 88.254c-3.62-2.067-3.52-7.324.176-9.25l18.766-9.79a1.761 1.761 0 0 0 .047-3.093L5.355 55.461c-3.511-1.973-3.585-6.969-.21-9.066l.187-.114 46.645-26.523a3.53 3.53 0 0 0 1.578-1.89l.058-.188c1.64-4.875 5.364-7.508 10.575-7.508m26.027 64.715L67.184 88.129l-.215.117a5.25 5.25 0 0 1-4.98-.094L39.03 75.207a3.5 3.5 0 0 0-3.343-.05l-13.235 6.917a1.759 1.759 0 0 0-.055 3.086l40.434 23.137a3.52 3.52 0 0 0 3.477 0l40.78-23.3c.56-.317.9-.915.891-1.556a1.76 1.76 0 0 0-.94-1.527L93.593 74.82a3.51 3.51 0 0 0-3.38.067Zm0 0"/></svg>`,
      features: ["middlewares", "redirects", "version"],
    },
    nginx_proxy_manager: {
      name: "Nginx Proxy Manager",
      mark: `<svg viewBox="0 0 512 512" aria-hidden="true"><style>.nginx-proxy-manager_svg__st0{fill:#ef3839}.nginx-proxy-manager_svg__st7{fill:#6b297a}</style><path d="M173.7 440.4c-12.7-5.6-24.8-12.5-36-20.7l-20.9 12.2 56.8 32.5" class="nginx-proxy-manager_svg__st0"/><path d="M229.2 436.4c-15.1-2.2-29.7-6.1-43.8-12.1l16.1-9.4 27.7 16zm.1 26.3v-6.4c-19.5-2.7-38.2-7.9-55.6-15.9l-.1 22.2v1.8l26 15 1.8-1z" style="fill:#ee438d"/><path d="m185.4 424.3 16.1-9.4V383l-27.8-16-27.5 16.2v18.6c12 9.1 25.2 16.7 39.2 22.5" style="fill:#bd2025"/><path d="m201.5 383 24.7-14.2-52.5-30.2V367z" style="fill:#d31f26"/><path d="m284.5 462.6-27.7 15.8V512l56.3-33" style="fill:#73206a"/><path d="m339.8 463.8 56-32.5-20.9-12c-11 7.9-22.9 14.8-35.2 20.4z" style="fill:#8f4f9f"/><path d="m312 383.1 27.8-16.1v-29.3l-53.1 30.5z" style="fill:#d24b9b"/><path d="M422.8 414.8v-25.3l-33.2-19.1-22.3 12.8v17.2c3.7-2.4 6.7-5 10.1-7.7l17.7 10.1c-6.4 5.8-13.2 11.4-20.2 16.6l20.2 11.6.7.4 26.9-15.4z" class="nginx-proxy-manager_svg__st7"/><path d="m455.8 370.3-33 19.2-.1 26.5 55.4-32.9" style="fill:#782a8f"/><path d="M339.8 143.9 312 128l-26.3 15.2 54.1 31.2z" style="fill:#c02026"/><path d="M428.5 316.4c4.4-12.3 7-24.5 8.6-37.5l-14.3 8.5V313zm27.3 15.5 22.3-12.8v-31.7l-20.8-11.9c-1.7 17.5-5.6 34.1-11.7 50.6z" style="fill:#9051a0"/><path d="m367.3 128-27.5 15.9v30.5l28.7 16.8 26.5-15.3V144z" style="fill:#b01b4a"/><path d="M312 32.3 256.1 0l.6 25.9L290 45.1z" style="fill:#c54627"/><path d="m422.7 223.7.1-31.9-27.8-15.9-26.5 15.3.3 33.1v62.3l26.3-15v-32.1z" style="fill:#a41768"/><path d="m457.3 275.5 20.8 11.9v-63.7L457 235.6q1.35 10.2 1.2 20.4c0 6.7-.3 13.1-.9 19.5" class="nginx-proxy-manager_svg__st7"/><path d="M256.2 457.7c9.5 0 18.9-.6 28.3-1.8v6.7l-27.7 15.8V512l-57.2-32.6 29.7-16.7v-6.4c9 .9 17.9 1.4 26.9 1.4m30.5-89.5-30.6 17.6.7 29.1-27.6 16v5.5c8.9 1.2 17.9 1.8 26.9 1.8 9.5.1 19-.6 28.4-2.1v-5.2l.1.1 27.4-16.2v-31.7zM395 175.9l27.8 15.9 3.3-1.8c-6.6-17.3-16-33.5-27.8-47.8L395 144zm55.3 0v-32L422.8 128l-7.3 4c11.3 14.6 20.7 30.7 27.8 47.8" style="fill:#cc3192"/><path d="m312 414.8 15.6 9.1c14.2-6 27.6-13.9 39.7-23.5v-17.2L339.8 367 312 383.1zm110.7-191.1 14.4 8.2c-2-14.4-5.7-28.4-11-42l-3.3 1.9zm34.3 11.9 21.1-11.9v-31.9l-27.8-15.9-7 3.9c7 17.7 11.9 36.3 13.7 55.8" style="fill:#b263a7"/><path d="m450.3 143.9 27.8-15.9-55.3-32v32z" style="fill:#d1499a"/><path d="M327.6 423.9c-13.5 5.8-28.1 9.8-43.1 12.2v-5.2l27.5-16.1zM313.1 479l26.7-15.2v-24.1c-17.6 8-36.2 13.4-55.3 16.2v6.7M438.6 256c0 7.7-.5 15.3-1.5 22.9l-14.3 8.5V313l-33.3 18.9.1 38.5-22.3 12.8-27.5-16.2v-29.3l29-16.8v-34.5l26.2-14.9.1.1v-32.1l27.6-15.8 14.4 8.2c.9 8 1.5 16.1 1.5 24.1m39.5-128v63.8l-27.8-15.9v-32z" style="fill:#9b3995"/><path d="M455.8 331.9v38.4l22.3 12.8v-64" style="fill:#85459a"/><path d="M256.7 322.6 313 288l-28.5-16.5-27.7 15.9" style="fill:#ee3f8a"/><path d="M226.2 368.7 201.5 383v31.9l27.7 16 27.6-16-.7-29.1M367.3 128l27.7 16 3.3-1.8c-4-5.3-8.3-10.3-13-15-5.7-5.5-11.7-10.7-18-15.5zm48.2 4 7.3-4V96L395 80.1l-20.7 12.2c8.8 6.3 17.1 13.4 24.7 21 5.8 6 11.3 12.2 16.5 18.7M313 288l.2-64.9-28.6 16.4-.1 32" style="fill:#e22574"/><path d="M113 398.6c7.7 7.7 15.9 14.8 24.7 21.1l-20.9 12.2-25.8-15v-27.4l8.9-5.2c4.2 5.1 8.7 9.8 13.1 14.3m30.2-77.7-19.2 11v38.5l-7 3.9c3.1 3.8 6.5 7.4 10.1 10.7q8.85 9.3 19.2 16.8v-18.5l27.5-16.3v-28.4zM314.1 62.8v20.4c4.3 1.2 8.5 2.8 12.5 4.6L312 96v32l-26.3 15.2-29.6-17 .6-23.8L290 83.5V45.1l22-12.8 27.8 15.9-.1 24c-8.3-3.8-16.8-6.8-25.6-9.4M198.8 289l30.5-17.5v-32l27.5-15.8v-33.2l-58 32.6z" style="fill:#f15933"/><path d="m312 128 27.8 15.9 27.5-15.9v-16.3c-12.4-9.8-26.1-17.9-40.7-23.9L312 96zm62.3-35.7L395 80.1l-55.2-31.9-.1 24c12.2 5.5 23.8 12.3 34.6 20.1m-61.1 130.8-28.6 16.4-.1 32-27.7 15.9v31.8l-.1 3.4-57.9-33.6 2.7-1.6 27.8-15.9v-32l27.5-15.8v-33.2" class="nginx-proxy-manager_svg__st0"/><path d="m441.8 340.1-18.9-11-19.2 11V362l19.2 11 18.9-11z" style="fill:#552263"/><path d="M143.2 285.6v-60.4l-24.7 14.3v32.1z" style="fill:#f7975f"/><path d="m256.7 102.4-.6 23.8-28.9 16.4-53.6 30.8.1-29.5 27.8-15.9V96l22.2-12.5zM33.9 384c7.9-4.6 15.9-9.1 23.8-13.7L91 389.5v27.4M275.7 75.2l-18.9 11-18.9-11V53.3l18.9-11 18.9 11zM118.5 271.5 91 287.4V313l33 18.9 19.2-11v-35.3zm-46.4 68.6v22L91 373l18.9-11v-21.9l-18.9-11z" style="fill:#f37132"/><path d="m146.2 128 27.5 15.9 27.8-15.9V96l-15-8.5c-14.7 5.8-28.1 13.7-40.3 22.9z" style="fill:#d98a26"/><path d="M54.9 276.5c.7 8.6 2.1 17.2 4.3 25.6l17.7-10.4c-.8-4.6-1.6-9.2-2.1-13.7-1-7.2-1.5-14.6-1.5-21.9 0-7.8.5-15.5 1.5-23.2l16.2-9.1v-32l27.5-15.8-.1-32.1 27.8-15.9 27.5 15.9-.1 29.5-29.6 17.1-.8.6v34.1l-24.7 14.3v32L91 287.4V313l-33.3 18.9-22-12.8-1.8-1v-29.8M201.5 96l22.2-12.5.1-7.1c-13.2 2.3-24.9 5.9-37.3 11.1zm-27.9-48.5 27.9-16.1L256.1 0l.6 25.9-32.9 19.2-.2 11.7c-17.2 2.9-33.9 7.8-49.9 14.8" style="fill:#faa42f"/><path d="m33.9 384 23.8-13.7v-38.4l-22-12.8-1.8-1" style="fill:#c47728"/><path d="M54.9 234.7c2.1-19 6.9-37.8 14.1-55.5l-5.8-3.3-29.3 16.8v30m40.9 10.2 16.2-9.1v-32l-4.9-2.9c-5.6 14.1-9.4 28.9-11.3 43.9zm71.4-122.5V128l-27.8 15.9-4.5-2.4c4.2-5.2 8.5-9.8 13.2-14.4 5.9-6.2 12.2-11.7 19.1-16.7m-27.7-31.2L91 96v32l5.8 3.3c5.2-6.4 10.7-12.2 16.2-18 7.9-7.9 16.5-15.2 25.6-21.6 11-7.9 22.8-14.6 35.1-20.1V47.5z" style="fill:#ffcf29"/><path d="M33.9 222.7v65.6l21-11.8c-.9-6.8-.1-35 0-41.8m8.3-58.8 5.8 3.3c7-17.4 16.5-33.2 27.8-47.9L91 128l-27.8 15.9zm22.9 13 4.9 2.9 27.5-15.8-.1-32.1-4.5-2.4c-11.6 14.3-20.9 30.3-27.8 47.4" style="fill:#fcea3b"/><path d="M63.2 143.9 91 128V96l-57.1 31.1" style="fill:#f1eb59"/><path d="m33.9 192.7 29.3-16.8v-32l-29.3-16.8" style="fill:#d6e042"/></svg>`,
      features: ["access_rules", "certificates", "redirects", "toggle_rules", "version"],
    },
  };

  // The proxy behind the card's device (its running binary sensor says so); Zoraxy for the entities of 1.x.
  _proxyType() {
    const type = this._attr(this._eid("binary_sensor.proxy_running"), "proxy_type");
    return ReverseProxyCard.BRANDS[type] ? type : "zoraxy";
  }
  _brand() { return ReverseProxyCard.BRANDS[this._proxyType()]; }
  // What the proxy's API allows, from the running binary sensor; the brand's defaults when it does not say.
  _has(feature) {
    const features = this._attr(this._eid("binary_sensor.proxy_running"), "features");
    return (Array.isArray(features) ? features : this._brand().features).includes(feature);
  }
  // The proxy's web interface: `proxy_url`, or `zoraxy_url` as the option was called up to 1.14.x.
  _url() { return rpSafeUrl(this._config?.proxy_url ?? this._config?.zoraxy_url); }

  // Header icon: the round server-network icon in the proxy's status colour (green running, red stopped, grey
  // unavailable), the brand mark as a badge; a link to the proxy's web interface when `proxy_url` is set.
  _headerIcon(statusCls) {
    const url = this._url();
    const icon = `<span class="logo ${statusCls}" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${ReverseProxyCard.SERVER_NETWORK}"/></svg><span class="badge">${this._brand().mark}</span></span>`;
    return url
      ? `<a class="brand-link" href="${rpEsc(url)}" target="_blank" rel="noopener noreferrer" title="${this._t("openProxy")}" aria-label="${this._t("openProxy")}">${icon}</a>`
      : icon;
  }

  static I18N = {
    fr: {
      active: "Actif", inactive: "Inactif",
      rules: "Règles", activeRules: "Actives", certs: "Certs", port: "Port", middlewares: "Middlewares",
      controls: "Contrôles", httpsRedirect: "Redirection HTTPS", port80: "Port 80", devMode: "Mode dev",
      certsSection: "Certificats", proxyRules: "Règles proxy", redirections: "Redirections",
      noCerts: "Aucun certificat trouvé.", noRules: "Aucune règle configurée.", noRedirects: "Aucune redirection configurée.",
      expired: "Expiré", renew: "Renouveler", daysLeft: "J-{n}",
      on: "On", off: "Off",
      enableRule: "Activer", disableRule: "Désactiver",
      ed_proxy_url: "URL de {proxy}", ed_entity_prefix: "Préfixe des entités",
      ed_proxy_url_helper: "Ouverte au clic sur l'icône d'en-tête",
      openProxy: "Ouvrir l'interface web de {proxy}",
      ed_entity_prefix_helper: "Partie commune des entités, par exemple zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Afficher la carte complète", zoomOut: "Revenir à la vue compacte",
      ruleCount: "{a}/{n} règles", certCount: "{n} certs",
      ed_zoom: "Bouton détail", ed_zoom_helper: "Bascule vers la carte complète et revient",
      ed_show_title: "Afficher le titre",
      ed_show_subtitle: "Afficher le sous-titre",
      ed_language: "Langue", lang_auto: "Auto (langue de Home Assistant)",
      unavailable: "Indisponible", cancel: "Annuler",
      confirmPort80Off: "Arrêter l'écoute du port 80 ? Les requêtes HTTP et les challenges ACME HTTP n'atteindront plus {proxy}.",
      confirmRuleOff: "Désactiver la règle proxy de {domain} ? Le service ne sera plus joignable via {proxy}.",
      down: "Hors ligne", upstreamDown: "Serveur cible hors ligne (moniteur de disponibilité de {proxy})", upstreamsDown: "Serveurs cibles hors ligne : {n}",
      ed_device: "Appareil {proxy}", ed_device_helper: "Avec plusieurs instances de {proxy}, celle à afficher (vide : la première)",
    },
    en: {
      active: "Active", inactive: "Inactive",
      rules: "Rules", activeRules: "Active", certs: "Certs", port: "Port", middlewares: "Middlewares",
      controls: "Controls", httpsRedirect: "HTTPS redirect", port80: "Port 80", devMode: "Dev mode",
      certsSection: "Certificates", proxyRules: "Proxy rules", redirections: "Redirections",
      noCerts: "No certificate found.", noRules: "No rule configured.", noRedirects: "No redirect configured.",
      expired: "Expired", renew: "Renew", daysLeft: "{n} d",
      on: "On", off: "Off",
      enableRule: "Enable", disableRule: "Disable",
      ed_proxy_url: "{proxy} URL", ed_entity_prefix: "Entity prefix",
      ed_proxy_url_helper: "Opened when clicking the header icon",
      openProxy: "Open the {proxy} web interface",
      ed_entity_prefix_helper: "Common part of the entity IDs, for example zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Show the full card", zoomOut: "Back to the compact view",
      ruleCount: "{a}/{n} rules", certCount: "{n} certs",
      ed_zoom: "Detail button", ed_zoom_helper: "Switches to the full card and back",
      ed_show_title: "Show title",
      ed_show_subtitle: "Show subtitle",
      ed_language: "Language", lang_auto: "Auto (Home Assistant language)",
      unavailable: "Unavailable", cancel: "Cancel",
      confirmPort80Off: "Stop listening on port 80? Plain HTTP requests and ACME HTTP challenges will no longer reach {proxy}.",
      confirmRuleOff: "Disable the proxy rule for {domain}? The service will no longer be reachable through {proxy}.",
      down: "Down", upstreamDown: "Upstream down ({proxy} uptime monitor)", upstreamsDown: "Upstreams down: {n}",
      ed_device: "{proxy} device", ed_device_helper: "With several {proxy} instances, the one to show (empty: the first one)",
    },
    de: {
      active: "Aktiv", inactive: "Inaktiv",
      rules: "Regeln", activeRules: "Aktiv", certs: "Zert.", port: "Port", middlewares: "Middlewares",
      controls: "Steuerung", httpsRedirect: "HTTPS-Umleitung", port80: "Port 80", devMode: "Dev-Modus",
      certsSection: "Zertifikate", proxyRules: "Proxy-Regeln", redirections: "Weiterleitungen",
      noCerts: "Kein Zertifikat gefunden.", noRules: "Keine Regel konfiguriert.", noRedirects: "Keine Weiterleitung konfiguriert.",
      expired: "Abgelaufen", renew: "Erneuern", daysLeft: "{n} T",
      on: "An", off: "Aus",
      enableRule: "Aktivieren", disableRule: "Deaktivieren",
      ed_proxy_url: "{proxy}-URL", ed_entity_prefix: "Entitätspräfix",
      ed_proxy_url_helper: "Wird beim Klick auf das Kopfzeilensymbol geöffnet",
      openProxy: "{proxy}-Weboberfläche öffnen",
      ed_entity_prefix_helper: "Gemeinsamer Teil der Entitäts-IDs, zum Beispiel zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Vollständige Karte anzeigen", zoomOut: "Zurück zur kompakten Ansicht",
      ruleCount: "{a}/{n} Regeln", certCount: "{n} Zert.",
      ed_zoom: "Detail-Schaltfläche", ed_zoom_helper: "Wechselt zur vollständigen Karte und zurück",
      ed_show_title: "Titel anzeigen",
      ed_show_subtitle: "Untertitel anzeigen",
      ed_language: "Sprache", lang_auto: "Auto (Sprache von Home Assistant)",
      unavailable: "Nicht verfügbar", cancel: "Abbrechen",
      confirmPort80Off: "Port 80 nicht mehr abhören? HTTP-Anfragen und ACME-HTTP-Challenges erreichen {proxy} dann nicht mehr.",
      confirmRuleOff: "Proxy-Regel für {domain} deaktivieren? Der Dienst ist dann über {proxy} nicht mehr erreichbar.",
      down: "Offline", upstreamDown: "Zielserver offline (Uptime-Monitor von {proxy})", upstreamsDown: "Zielserver offline: {n}",
      ed_device: "{proxy}-Gerät", ed_device_helper: "Bei mehreren {proxy}-Instanzen die anzuzeigende (leer: die erste)",
    },
    es: {
      active: "Activo", inactive: "Inactivo",
      rules: "Reglas", activeRules: "Activas", certs: "Cert.", port: "Puerto", middlewares: "Middlewares",
      controls: "Controles", httpsRedirect: "Redirección HTTPS", port80: "Puerto 80", devMode: "Modo dev",
      certsSection: "Certificados", proxyRules: "Reglas de proxy", redirections: "Redirecciones",
      noCerts: "No se encontró ningún certificado.", noRules: "Ninguna regla configurada.", noRedirects: "Ninguna redirección configurada.",
      expired: "Caducado", renew: "Renovar", daysLeft: "{n} d",
      on: "On", off: "Off",
      enableRule: "Activar", disableRule: "Desactivar",
      ed_proxy_url: "URL de {proxy}", ed_entity_prefix: "Prefijo de las entidades",
      ed_proxy_url_helper: "Se abre al hacer clic en el icono de la cabecera",
      openProxy: "Abrir la interfaz web de {proxy}",
      ed_entity_prefix_helper: "Parte común de los ID de entidad, por ejemplo zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Mostrar la tarjeta completa", zoomOut: "Volver a la vista compacta",
      ruleCount: "{a}/{n} reglas", certCount: "{n} cert.",
      ed_zoom: "Botón de detalle", ed_zoom_helper: "Cambia a la tarjeta completa y vuelve",
      ed_show_title: "Mostrar el título",
      ed_show_subtitle: "Mostrar el subtítulo",
      ed_language: "Idioma", lang_auto: "Auto (idioma de Home Assistant)",
      unavailable: "No disponible", cancel: "Cancelar",
      confirmPort80Off: "¿Dejar de escuchar en el puerto 80? Las peticiones HTTP y los desafíos ACME HTTP ya no llegarán a {proxy}.",
      confirmRuleOff: "¿Desactivar la regla de proxy de {domain}? El servicio dejará de ser accesible a través de {proxy}.",
      down: "Caído", upstreamDown: "Servidor de destino caído (monitor de disponibilidad de {proxy})", upstreamsDown: "Servidores de destino caídos: {n}",
      ed_device: "Dispositivo {proxy}", ed_device_helper: "Con varias instancias de {proxy}, la que se muestra (vacío: la primera)",
    },
    sr: {
      active: "Активан", inactive: "Неактиван",
      rules: "Правила", activeRules: "Активна", certs: "Серт.", port: "Порт", middlewares: "Међуслојеви",
      controls: "Контроле", httpsRedirect: "HTTPS преусме\u00adравање", port80: "Порт 80", devMode: "Развојни режим",
      certsSection: "Сертификати", proxyRules: "Прокси правила", redirections: "Преусмеравања",
      noCerts: "Није пронађен ниједан сертификат.", noRules: "Ниједно правило није подешено.", noRedirects: "Ниједно преусмеравање није подешено.",
      expired: "Истекао", renew: "Обнови", daysLeft: "{n} д",
      on: "Укљ.", off: "Искљ.",
      enableRule: "Омогући", disableRule: "Онемогући",
      ed_proxy_url: "URL адреса за {proxy}", ed_entity_prefix: "Префикс ентитета",
      ed_proxy_url_helper: "Отвара се кликом на икону заглавља",
      openProxy: "Отвори веб интерфејс {proxy}-ја",
      ed_entity_prefix_helper: "Заједнички део идентификатора ентитета, на пример zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Прикажи целу картицу", zoomOut: "Назад на компактни приказ",
      ruleCount: "Правила: {a}/{n}", certCount: "Серт.: {n}",
      ed_zoom: "Дугме за детаље", ed_zoom_helper: "Пребацује картицу на пун приказ и назад",
      ed_show_title: "Прикажи наслов",
      ed_show_subtitle: "Прикажи поднаслов",
      ed_language: "Језик", lang_auto: "Аутоматски (језик Home Assistant-а)",
      unavailable: "Недоступно", cancel: "Откажи",
      confirmPort80Off: "Престати са ослушкивањем порта 80? HTTP захтеви и ACME HTTP провере више неће стизати до {proxy}-ја.",
      confirmRuleOff: "Онемогућити прокси правило за {domain}? Услуга више неће бити доступна преко {proxy}-ја.",
      down: "Не ради", upstreamDown: "Циљни сервер не ради ({proxy} надзор доступности)", upstreamsDown: "Циљни сервери који не раде: {n}",
      ed_device: "{proxy} уређај", ed_device_helper: "Са више {proxy} инстанци, она која се приказује (празно: прва)",
    },
    "sr-Latn": {
      active: "Aktivan", inactive: "Neaktivan",
      rules: "Pravila", activeRules: "Aktivna", certs: "Sert.", port: "Port", middlewares: "Međuslojevi",
      controls: "Kontrole", httpsRedirect: "HTTPS preusme\u00adravanje", port80: "Port 80", devMode: "Razvojni režim",
      certsSection: "Sertifikati", proxyRules: "Proksi pravila", redirections: "Preusmeravanja",
      noCerts: "Nije pronađen nijedan sertifikat.", noRules: "Nijedno pravilo nije podešeno.", noRedirects: "Nijedno preusmeravanje nije podešeno.",
      expired: "Istekao", renew: "Obnovi", daysLeft: "{n} d",
      on: "Uklj.", off: "Isklj.",
      enableRule: "Omogući", disableRule: "Onemogući",
      ed_proxy_url: "URL adresa za {proxy}", ed_entity_prefix: "Prefiks entiteta",
      ed_proxy_url_helper: "Otvara se klikom na ikonu zaglavlja",
      openProxy: "Otvori veb interfejs {proxy}-ja",
      ed_entity_prefix_helper: "Zajednički deo identifikatora entiteta, na primer zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Prikaži celu karticu", zoomOut: "Nazad na kompaktni prikaz",
      ruleCount: "Pravila: {a}/{n}", certCount: "Sert.: {n}",
      ed_zoom: "Dugme za detalje", ed_zoom_helper: "Prebacuje karticu na pun prikaz i nazad",
      ed_show_title: "Prikaži naslov",
      ed_show_subtitle: "Prikaži podnaslov",
      ed_language: "Jezik", lang_auto: "Automatski (jezik Home Assistant-a)",
      unavailable: "Nedostupno", cancel: "Otkaži",
      confirmPort80Off: "Prestati sa osluškivanjem porta 80? HTTP zahtevi i ACME HTTP provere više neće stizati do {proxy}-ja.",
      confirmRuleOff: "Onemogućiti proksi pravilo za {domain}? Usluga više neće biti dostupna preko {proxy}-ja.",
      down: "Ne radi", upstreamDown: "Ciljni server ne radi ({proxy} nadzor dostupnosti)", upstreamsDown: "Ciljni serveri koji ne rade: {n}",
      ed_device: "{proxy} uređaj", ed_device_helper: "Sa više {proxy} instanci, ona koja se prikazuje (prazno: prva)",
    },
    it: {
      active: "Attivo", inactive: "Inattivo",
      rules: "Regole", activeRules: "Attive", certs: "Cert.", port: "Porta", middlewares: "Middleware",
      controls: "Controlli", httpsRedirect: "Reindiriz\u00adzamento HTTPS", port80: "Porta 80", devMode: "Modalità dev",
      certsSection: "Certificati", proxyRules: "Regole proxy", redirections: "Reindirizzamenti",
      noCerts: "Nessun certificato trovato.", noRules: "Nessuna regola configurata.", noRedirects: "Nessun reindirizzamento configurato.",
      expired: "Scaduto", renew: "Rinnova", daysLeft: "{n} g",
      on: "On", off: "Off",
      enableRule: "Abilita", disableRule: "Disabilita",
      ed_proxy_url: "URL di {proxy}", ed_entity_prefix: "Prefisso delle entità",
      ed_proxy_url_helper: "Aperto facendo clic sull'icona dell'intestazione",
      openProxy: "Apri l'interfaccia web di {proxy}",
      ed_entity_prefix_helper: "Parte comune degli ID entità, ad esempio zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Mostra la scheda completa", zoomOut: "Torna alla vista compatta",
      ruleCount: "Regole: {a}/{n}", certCount: "Cert.: {n}",
      ed_zoom: "Pulsante dettagli", ed_zoom_helper: "Passa alla scheda completa e ritorna",
      ed_show_title: "Mostra il titolo",
      ed_show_subtitle: "Mostra il sottotitolo",
      ed_language: "Lingua", lang_auto: "Auto (lingua di Home Assistant)",
      unavailable: "Non disponibile", cancel: "Annulla",
      confirmPort80Off: "Smettere di ascoltare sulla porta 80? Le richieste HTTP e le verifiche ACME HTTP non raggiungeranno più {proxy}.",
      confirmRuleOff: "Disabilitare la regola proxy di {domain}? Il servizio non sarà più raggiungibile tramite {proxy}.",
      down: "Offline", upstreamDown: "Server di destinazione offline (monitor di disponibilità di {proxy})", upstreamsDown: "Server di destinazione offline: {n}",
      ed_device: "Dispositivo {proxy}", ed_device_helper: "Con più istanze di {proxy}, quella da mostrare (vuoto: la prima)",
    },
    nl: {
      active: "Actief", inactive: "Inactief",
      rules: "Regels", activeRules: "Actief", certs: "Cert.", port: "Poort", middlewares: "Middlewares",
      controls: "Bediening", httpsRedirect: "HTTPS-omleiding", port80: "Poort 80", devMode: "Dev-modus",
      certsSection: "Certificaten", proxyRules: "Proxyregels", redirections: "Omleidingen",
      noCerts: "Geen certificaat gevonden.", noRules: "Geen regel geconfigureerd.", noRedirects: "Geen omleiding geconfigureerd.",
      expired: "Verlopen", renew: "Vernieuwen", daysLeft: "{n} d",
      on: "Aan", off: "Uit",
      enableRule: "Inschakelen", disableRule: "Uitschakelen",
      ed_proxy_url: "{proxy}-URL", ed_entity_prefix: "Entiteitsprefix",
      ed_proxy_url_helper: "Wordt geopend bij een klik op het koppictogram",
      openProxy: "Webinterface van {proxy} openen",
      ed_entity_prefix_helper: "Gemeenschappelijk deel van de entiteits-ID's, bijvoorbeeld zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Volledige kaart tonen", zoomOut: "Terug naar de compacte weergave",
      ruleCount: "Regels: {a}/{n}", certCount: "Cert.: {n}",
      ed_zoom: "Detailknop", ed_zoom_helper: "Schakelt naar de volledige kaart en terug",
      ed_show_title: "Titel tonen",
      ed_show_subtitle: "Ondertitel tonen",
      ed_language: "Taal", lang_auto: "Auto (taal van Home Assistant)",
      unavailable: "Niet beschikbaar", cancel: "Annuleren",
      confirmPort80Off: "Niet meer luisteren op poort 80? HTTP-verzoeken en ACME HTTP-challenges bereiken {proxy} dan niet meer.",
      confirmRuleOff: "Proxyregel voor {domain} uitschakelen? De dienst is dan niet meer bereikbaar via {proxy}.",
      down: "Offline", upstreamDown: "Doelserver offline (uptime-monitor van {proxy})", upstreamsDown: "Doelservers offline: {n}",
      ed_device: "{proxy}-apparaat", ed_device_helper: "Bij meerdere {proxy}-instanties de te tonen instantie (leeg: de eerste)",
    },
    pt: {
      active: "Ativo", inactive: "Inativo",
      rules: "Regras", activeRules: "Ativas", certs: "Cert.", port: "Porta", middlewares: "Middlewares",
      controls: "Controlos", httpsRedirect: "Redireciona\u00admento HTTPS", port80: "Porta 80", devMode: "Modo dev",
      certsSection: "Certificados", proxyRules: "Regras de proxy", redirections: "Redirecionamentos",
      noCerts: "Nenhum certificado encontrado.", noRules: "Nenhuma regra configurada.", noRedirects: "Nenhum redirecionamento configurado.",
      expired: "Expirado", renew: "Renovar", daysLeft: "{n} d",
      on: "On", off: "Off",
      enableRule: "Ativar", disableRule: "Desativar",
      ed_proxy_url: "URL do {proxy}", ed_entity_prefix: "Prefixo das entidades",
      ed_proxy_url_helper: "Aberto ao clicar no ícone do cabeçalho",
      openProxy: "Abrir a interface web do {proxy}",
      ed_entity_prefix_helper: "Parte comum dos IDs de entidade, por exemplo zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Mostrar o cartão completo", zoomOut: "Voltar à vista compacta",
      ruleCount: "Regras: {a}/{n}", certCount: "Cert.: {n}",
      ed_zoom: "Botão de detalhe", ed_zoom_helper: "Muda para o cartão completo e volta",
      ed_show_title: "Mostrar o título",
      ed_show_subtitle: "Mostrar o subtítulo",
      ed_language: "Idioma", lang_auto: "Auto (idioma do Home Assistant)",
      unavailable: "Indisponível", cancel: "Cancelar",
      confirmPort80Off: "Deixar de escutar na porta 80? Os pedidos HTTP e os desafios ACME HTTP deixarão de chegar ao {proxy}.",
      confirmRuleOff: "Desativar a regra de proxy de {domain}? O serviço deixará de estar acessível através do {proxy}.",
      down: "Em baixo", upstreamDown: "Servidor de destino em baixo (monitor de disponibilidade do {proxy})", upstreamsDown: "Servidores de destino em baixo: {n}",
      ed_device: "Dispositivo {proxy}", ed_device_helper: "Com várias instâncias do {proxy}, a que é mostrada (vazio: a primeira)",
    },
    pl: {
      active: "Aktywny", inactive: "Nieaktywny",
      rules: "Reguły", activeRules: "Aktywne", certs: "Cert.", port: "Port", middlewares: "Middleware",
      controls: "Sterowanie", httpsRedirect: "Przekiero\u00adwanie HTTPS", port80: "Port 80", devMode: "Tryb dev",
      certsSection: "Certyfikaty", proxyRules: "Reguły proxy", redirections: "Przekierowania",
      noCerts: "Nie znaleziono certyfikatu.", noRules: "Brak skonfigurowanych reguł.", noRedirects: "Brak skonfigurowanych przekierowań.",
      expired: "Wygasł", renew: "Odnów", daysLeft: "{n} d",
      on: "Wł.", off: "Wył.",
      enableRule: "Włącz", disableRule: "Wyłącz",
      ed_proxy_url: "Adres URL {proxy}", ed_entity_prefix: "Prefiks encji",
      ed_proxy_url_helper: "Otwierany po kliknięciu ikony nagłówka",
      openProxy: "Otwórz interfejs webowy {proxy}",
      ed_entity_prefix_helper: "Wspólna część identyfikatorów encji, na przykład zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Pokaż pełną kartę", zoomOut: "Wróć do widoku kompaktowego",
      ruleCount: "Reguły: {a}/{n}", certCount: "Cert.: {n}",
      ed_zoom: "Przycisk szczegółów", ed_zoom_helper: "Przełącza na pełną kartę i z powrotem",
      ed_show_title: "Pokaż tytuł",
      ed_show_subtitle: "Pokaż podtytuł",
      ed_language: "Język", lang_auto: "Auto (język Home Assistant)",
      unavailable: "Niedostępny", cancel: "Anuluj",
      confirmPort80Off: "Przestać nasłuchiwać na porcie 80? Żądania HTTP i wyzwania ACME HTTP nie będą już docierać do {proxy}.",
      confirmRuleOff: "Wyłączyć regułę proxy dla {domain}? Usługa przestanie być dostępna przez {proxy}.",
      down: "Offline", upstreamDown: "Serwer docelowy offline (monitor dostępności {proxy})", upstreamsDown: "Serwery docelowe offline: {n}",
      ed_device: "Urządzenie {proxy}", ed_device_helper: "Przy kilku instancjach {proxy} ta, którą pokazać (puste: pierwsza)",
    },
    ro: {
      active: "Activ", inactive: "Inactiv",
      rules: "Reguli", activeRules: "Active", certs: "Cert.", port: "Port", middlewares: "Middleware",
      controls: "Comenzi", httpsRedirect: "Redirecțio­nare HTTPS", port80: "Port 80", devMode: "Mod dev",
      certsSection: "Certificate", proxyRules: "Reguli proxy", redirections: "Redirecționări",
      noCerts: "Niciun certificat găsit.", noRules: "Nicio regulă configurată.", noRedirects: "Nicio redirecționare configurată.",
      expired: "Expirat", renew: "Reînnoiește", daysLeft: "{n} z",
      on: "Pornit", off: "Oprit",
      enableRule: "Activează", disableRule: "Dezactivează",
      ed_proxy_url: "URL {proxy}", ed_entity_prefix: "Prefixul entităților",
      ed_proxy_url_helper: "Se deschide la clic pe pictograma antetului",
      openProxy: "Deschide interfața web {proxy}",
      ed_entity_prefix_helper: "Partea comună a ID-urilor entităților, de exemplu zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Afișează cardul complet", zoomOut: "Înapoi la vizualizarea compactă",
      ruleCount: "Reguli: {a}/{n}", certCount: "Cert.: {n}",
      ed_zoom: "Buton de detalii", ed_zoom_helper: "Comută la cardul complet și înapoi",
      ed_show_title: "Afișează titlul",
      ed_show_subtitle: "Afișează subtitlul",
      ed_language: "Limbă", lang_auto: "Automat (limba Home Assistant)",
      unavailable: "Indisponibil", cancel: "Anulează",
      confirmPort80Off: "Opriți ascultarea pe portul 80? Cererile HTTP și verificările ACME HTTP nu vor mai ajunge la {proxy}.",
      confirmRuleOff: "Dezactivați regula proxy pentru {domain}? Serviciul nu va mai fi accesibil prin {proxy}.",
      down: "Offline", upstreamDown: "Server țintă offline (monitorul de disponibilitate {proxy})", upstreamsDown: "Servere țintă offline: {n}",
      ed_device: "Dispozitiv {proxy}", ed_device_helper: "Cu mai multe instanțe {proxy}, cea afișată (gol: prima)",
    },
    da: {
      active: "Aktiv", inactive: "Inaktiv",
      rules: "Regler", activeRules: "Aktive", certs: "Cert.", port: "Port", middlewares: "Middlewares",
      controls: "Styring", httpsRedirect: "HTTPS-omdiri­gering", port80: "Port 80", devMode: "Dev-tilstand",
      certsSection: "Certifikater", proxyRules: "Proxyregler", redirections: "Omdirigeringer",
      noCerts: "Intet certifikat fundet.", noRules: "Ingen regel konfigureret.", noRedirects: "Ingen omdirigering konfigureret.",
      expired: "Udløbet", renew: "Forny", daysLeft: "{n} d",
      on: "Til", off: "Fra",
      enableRule: "Aktivér", disableRule: "Deaktiver",
      ed_proxy_url: "{proxy}-URL", ed_entity_prefix: "Entitetspræfiks",
      ed_proxy_url_helper: "Åbnes ved klik på ikonet i overskriften",
      openProxy: "Åbn {proxy}s webgrænseflade",
      ed_entity_prefix_helper: "Fælles del af entitets-id'erne, for eksempel zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Vis hele kortet", zoomOut: "Tilbage til kompakt visning",
      ruleCount: "Regler: {a}/{n}", certCount: "Cert.: {n}",
      ed_zoom: "Detaljeknap", ed_zoom_helper: "Skifter til hele kortet og tilbage",
      ed_show_title: "Vis titel",
      ed_show_subtitle: "Vis undertitel",
      ed_language: "Sprog", lang_auto: "Auto (Home Assistant-sprog)",
      unavailable: "Utilgængelig", cancel: "Annuller",
      confirmPort80Off: "Stop med at lytte på port 80? HTTP-anmodninger og ACME HTTP-udfordringer når ikke længere frem til {proxy}.",
      confirmRuleOff: "Deaktiver proxyreglen for {domain}? Tjenesten vil ikke længere kunne nås via {proxy}.",
      down: "Nede", upstreamDown: "Målserver nede ({proxy}s oppetidsovervågning)", upstreamsDown: "Målservere nede: {n}",
      ed_device: "{proxy}-enhed", ed_device_helper: "Med flere {proxy}-instanser den, der vises (tom: den første)",
    },
    sv: {
      active: "Aktiv", inactive: "Inaktiv",
      rules: "Regler", activeRules: "Aktiva", certs: "Cert.", port: "Port", middlewares: "Middlewares",
      controls: "Kontroller", httpsRedirect: "HTTPS-omdiri­gering", port80: "Port 80", devMode: "Dev-läge",
      certsSection: "Certifikat", proxyRules: "Proxyregler", redirections: "Omdirigeringar",
      noCerts: "Inget certifikat hittades.", noRules: "Ingen regel konfigurerad.", noRedirects: "Ingen omdirigering konfigurerad.",
      expired: "Utgånget", renew: "Förnya", daysLeft: "{n} d",
      on: "På", off: "Av",
      enableRule: "Aktivera", disableRule: "Inaktivera",
      ed_proxy_url: "{proxy}-URL", ed_entity_prefix: "Entitetsprefix",
      ed_proxy_url_helper: "Öppnas vid klick på rubrikikonen",
      openProxy: "Öppna {proxy}s webbgränssnitt",
      ed_entity_prefix_helper: "Gemensam del av entitets-ID:na, till exempel zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Visa hela kortet", zoomOut: "Tillbaka till kompakt vy",
      ruleCount: "Regler: {a}/{n}", certCount: "Cert.: {n}",
      ed_zoom: "Detaljknapp", ed_zoom_helper: "Växlar till hela kortet och tillbaka",
      ed_show_title: "Visa rubrik",
      ed_show_subtitle: "Visa underrubrik",
      ed_language: "Språk", lang_auto: "Auto (Home Assistant-språk)",
      unavailable: "Ej tillgänglig", cancel: "Avbryt",
      confirmPort80Off: "Sluta lyssna på port 80? HTTP-förfrågningar och ACME HTTP-utmaningar når inte längre {proxy}.",
      confirmRuleOff: "Inaktivera proxyregeln för {domain}? Tjänsten kan inte längre nås via {proxy}.",
      down: "Nere", upstreamDown: "Målserver nere ({proxy}s drifttidsövervakning)", upstreamsDown: "Målservrar nere: {n}",
      ed_device: "{proxy}-enhet", ed_device_helper: "Med flera {proxy}-instanser den som visas (tom: den första)",
    },
    bg: {
      active: "Активен", inactive: "Неактивен",
      rules: "Правила", activeRules: "Активни", certs: "Серт.", port: "Порт", middlewares: "Middleware-и",
      controls: "Управление", httpsRedirect: "HTTPS прена­сочване", port80: "Порт 80", devMode: "Режим dev",
      certsSection: "Сертификати", proxyRules: "Прокси правила", redirections: "Пренасочвания",
      noCerts: "Не е намерен сертификат.", noRules: "Няма конфигурирано правило.", noRedirects: "Няма конфигурирано пренасочване.",
      expired: "Изтекъл", renew: "Поднови", daysLeft: "{n} д",
      on: "Вкл.", off: "Изкл.",
      enableRule: "Активирай", disableRule: "Деактивирай",
      ed_proxy_url: "URL адрес на {proxy}", ed_entity_prefix: "Префикс на обектите",
      ed_proxy_url_helper: "Отваря се при клик върху иконата в заглавието",
      openProxy: "Отвори уеб интерфейса на {proxy}",
      ed_entity_prefix_helper: "Общата част от ID на обектите, например zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Покажи цялата карта", zoomOut: "Обратно към компактния изглед",
      ruleCount: "Правила: {a}/{n}", certCount: "Серт.: {n}",
      ed_zoom: "Бутон за детайли", ed_zoom_helper: "Превключва към цялата карта и обратно",
      ed_show_title: "Показване на заглавието",
      ed_show_subtitle: "Показване на подзаглавието",
      ed_language: "Език", lang_auto: "Автоматично (езикът на Home Assistant)",
      unavailable: "Недостъпно", cancel: "Отказ",
      confirmPort80Off: "Да се спре ли слушането на порт 80? HTTP заявките и ACME HTTP проверките вече няма да достигат до {proxy}.",
      confirmRuleOff: "Да се деактивира ли прокси правилото за {domain}? Услугата вече няма да е достъпна чрез {proxy}.",
      down: "Недостъпен", upstreamDown: "Целевият сървър е недостъпен (мониторинг на {proxy})", upstreamsDown: "Недостъпни целеви сървъри: {n}",
      ed_device: "Устройство {proxy}", ed_device_helper: "При няколко инстанции на {proxy} – тази за показване (празно: първата)",
    },
    ru: {
      active: "Активен", inactive: "Неактивен",
      rules: "Правила", activeRules: "Активные", certs: "Серт.", port: "Порт", middlewares: "Middleware",
      controls: "Управление", httpsRedirect: "Перена­правление HTTPS", port80: "Порт 80", devMode: "Режим dev",
      certsSection: "Сертификаты", proxyRules: "Правила прокси", redirections: "Перенаправления",
      noCerts: "Сертификаты не найдены.", noRules: "Правила не настроены.", noRedirects: "Перенаправления не настроены.",
      expired: "Истёк", renew: "Обновить", daysLeft: "{n} д.",
      on: "Вкл.", off: "Выкл.",
      enableRule: "Включить", disableRule: "Отключить",
      ed_proxy_url: "URL-адрес {proxy}", ed_entity_prefix: "Префикс объектов",
      ed_proxy_url_helper: "Открывается при нажатии на значок в заголовке",
      openProxy: "Открыть веб-интерфейс {proxy}",
      ed_entity_prefix_helper: "Общая часть идентификаторов объектов, например zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Показать полную карточку", zoomOut: "Вернуться к компактному виду",
      ruleCount: "Правила: {a}/{n}", certCount: "Серт.: {n}",
      ed_zoom: "Кнопка подробностей", ed_zoom_helper: "Переключает на полную карточку и обратно",
      ed_show_title: "Показывать заголовок",
      ed_show_subtitle: "Показывать подзаголовок",
      ed_language: "Язык", lang_auto: "Авто (язык Home Assistant)",
      unavailable: "Недоступно", cancel: "Отмена",
      confirmPort80Off: "Прекратить прослушивание порта 80? HTTP-запросы и проверки ACME HTTP больше не будут доходить до {proxy}.",
      confirmRuleOff: "Отключить правило прокси для {domain}? Сервис больше не будет доступен через {proxy}.",
      down: "Недоступен", upstreamDown: "Целевой сервер недоступен (мониторинг доступности {proxy})", upstreamsDown: "Недоступные целевые серверы: {n}",
      ed_device: "Устройство {proxy}", ed_device_helper: "При нескольких экземплярах {proxy} — какой показывать (пусто: первый)",
    },
    uk: {
      active: "Активний", inactive: "Неактивний",
      rules: "Правила", activeRules: "Активні", certs: "Серт.", port: "Порт", middlewares: "Middleware",
      controls: "Керування", httpsRedirect: "Перена­правлення HTTPS", port80: "Порт 80", devMode: "Режим dev",
      certsSection: "Сертифікати", proxyRules: "Правила проксі", redirections: "Перенаправлення",
      noCerts: "Сертифікатів не знайдено.", noRules: "Правила не налаштовано.", noRedirects: "Перенаправлення не налаштовано.",
      expired: "Минув", renew: "Оновити", daysLeft: "{n} д.",
      on: "Увімк.", off: "Вимк.",
      enableRule: "Увімкнути", disableRule: "Вимкнути",
      ed_proxy_url: "URL-адреса {proxy}", ed_entity_prefix: "Префікс сутностей",
      ed_proxy_url_helper: "Відкривається при натисканні на значок у заголовку",
      openProxy: "Відкрити вебінтерфейс {proxy}",
      ed_entity_prefix_helper: "Спільна частина ідентифікаторів сутностей, наприклад zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Показати повну картку", zoomOut: "Повернутися до компактного вигляду",
      ruleCount: "Правила: {a}/{n}", certCount: "Серт.: {n}",
      ed_zoom: "Кнопка деталей", ed_zoom_helper: "Перемикає на повну картку і назад",
      ed_show_title: "Показувати заголовок",
      ed_show_subtitle: "Показувати підзаголовок",
      ed_language: "Мова", lang_auto: "Авто (мова Home Assistant)",
      unavailable: "Недоступно", cancel: "Скасувати",
      confirmPort80Off: "Припинити прослуховування порту 80? HTTP-запити та перевірки ACME HTTP більше не надходитимуть до {proxy}.",
      confirmRuleOff: "Вимкнути правило проксі для {domain}? Сервіс більше не буде доступний через {proxy}.",
      down: "Недоступний", upstreamDown: "Цільовий сервер недоступний (моніторинг доступності {proxy})", upstreamsDown: "Недоступні цільові сервери: {n}",
      ed_device: "Пристрій {proxy}", ed_device_helper: "За кількох екземплярів {proxy} — який показувати (порожньо: перший)",
    },
    hu: {
      active: "Aktív", inactive: "Inaktív",
      rules: "Szabályok", activeRules: "Aktív", certs: "Tan.", port: "Port", middlewares: "Middleware-ek",
      controls: "Vezérlők", httpsRedirect: "HTTPS-átirá­nyítás", port80: "80-as port", devMode: "Dev mód",
      certsSection: "Tanúsítványok", proxyRules: "Proxyszabályok", redirections: "Átirányítások",
      noCerts: "Nem található tanúsítvány.", noRules: "Nincs beállított szabály.", noRedirects: "Nincs beállított átirányítás.",
      expired: "Lejárt", renew: "Megújítás", daysLeft: "{n} nap",
      on: "Be", off: "Ki",
      enableRule: "Engedélyezés", disableRule: "Letiltás",
      ed_proxy_url: "{proxy} URL", ed_entity_prefix: "Entitás-előtag",
      ed_proxy_url_helper: "A fejléc ikonjára kattintva nyílik meg",
      openProxy: "A {proxy} webes felületének megnyitása",
      ed_entity_prefix_helper: "Az entitásazonosítók közös része, például zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Teljes kártya megjelenítése", zoomOut: "Vissza a kompakt nézethez",
      ruleCount: "Szabályok: {a}/{n}", certCount: "Tan.: {n}",
      ed_zoom: "Részletek gomb", ed_zoom_helper: "Átvált a teljes kártyára és vissza",
      ed_show_title: "Cím megjelenítése",
      ed_show_subtitle: "Alcím megjelenítése",
      ed_language: "Nyelv", lang_auto: "Automatikus (Home Assistant nyelve)",
      unavailable: "Nem elérhető", cancel: "Mégse",
      confirmPort80Off: "Leállítja a figyelést a 80-as porton? A HTTP-kérések és az ACME HTTP-kihívások többé nem jutnak el a {proxy}hoz.",
      confirmRuleOff: "Letiltja a(z) {domain} proxyszabályát? A szolgáltatás többé nem lesz elérhető a {proxy}n keresztül.",
      down: "Nem elérhető", upstreamDown: "A célszerver nem elérhető ({proxy} rendelkezésre-állás figyelő)", upstreamsDown: "Nem elérhető célszerverek: {n}",
      ed_device: "{proxy} eszköz", ed_device_helper: "Több {proxy} példány esetén a megjelenítendő (üres: az első)",
    },
    sk: {
      active: "Aktívny", inactive: "Neaktívny",
      rules: "Pravidlá", activeRules: "Aktívne", certs: "Cert.", port: "Port", middlewares: "Middleware",
      controls: "Ovládanie", httpsRedirect: "Presmero­vanie HTTPS", port80: "Port 80", devMode: "Režim dev",
      certsSection: "Certifikáty", proxyRules: "Pravidlá proxy", redirections: "Presmerovania",
      noCerts: "Nenašiel sa žiadny certifikát.", noRules: "Nie je nastavené žiadne pravidlo.", noRedirects: "Nie je nastavené žiadne presmerovanie.",
      expired: "Vypršal", renew: "Obnoviť", daysLeft: "{n} d",
      on: "Zap.", off: "Vyp.",
      enableRule: "Povoliť", disableRule: "Zakázať",
      ed_proxy_url: "URL adresa {proxy}", ed_entity_prefix: "Predpona entít",
      ed_proxy_url_helper: "Otvorí sa po kliknutí na ikonu hlavičky",
      openProxy: "Otvoriť webové rozhranie {proxy}",
      ed_entity_prefix_helper: "Spoločná časť ID entít, napríklad zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Zobraziť celú kartu", zoomOut: "Späť na kompaktné zobrazenie",
      ruleCount: "Pravidlá: {a}/{n}", certCount: "Cert.: {n}",
      ed_zoom: "Tlačidlo podrobností", ed_zoom_helper: "Prepne na celú kartu a späť",
      ed_show_title: "Zobraziť názov",
      ed_show_subtitle: "Zobraziť podnázov",
      ed_language: "Jazyk", lang_auto: "Automaticky (jazyk Home Assistant)",
      unavailable: "Nedostupné", cancel: "Zrušiť",
      confirmPort80Off: "Prestať počúvať na porte 80? Požiadavky HTTP a overenia ACME HTTP sa už nedostanú k {proxy}.",
      confirmRuleOff: "Zakázať pravidlo proxy pre {domain}? Služba už nebude dostupná cez {proxy}.",
      down: "Nedostupný", upstreamDown: "Cieľový server je nedostupný (monitor dostupnosti {proxy})", upstreamsDown: "Nedostupné cieľové servery: {n}",
      ed_device: "Zariadenie {proxy}", ed_device_helper: "Pri viacerých inštanciách {proxy} tá, ktorá sa zobrazí (prázdne: prvá)",
    },
    cs: {
      active: "Aktivní", inactive: "Neaktivní",
      rules: "Pravidla", activeRules: "Aktivní", certs: "Cert.", port: "Port", middlewares: "Middleware",
      controls: "Ovládání", httpsRedirect: "Přesměro­vání HTTPS", port80: "Port 80", devMode: "Režim dev",
      certsSection: "Certifikáty", proxyRules: "Pravidla proxy", redirections: "Přesměrování",
      noCerts: "Nebyl nalezen žádný certifikát.", noRules: "Není nastaveno žádné pravidlo.", noRedirects: "Není nastaveno žádné přesměrování.",
      expired: "Vypršel", renew: "Obnovit", daysLeft: "{n} d",
      on: "Zap.", off: "Vyp.",
      enableRule: "Povolit", disableRule: "Zakázat",
      ed_proxy_url: "URL adresa {proxy}", ed_entity_prefix: "Předpona entit",
      ed_proxy_url_helper: "Otevře se po kliknutí na ikonu záhlaví",
      openProxy: "Otevřít webové rozhraní {proxy}",
      ed_entity_prefix_helper: "Společná část ID entit, například zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Zobrazit celou kartu", zoomOut: "Zpět na kompaktní zobrazení",
      ruleCount: "Pravidla: {a}/{n}", certCount: "Cert.: {n}",
      ed_zoom: "Tlačítko podrobností", ed_zoom_helper: "Přepne na celou kartu a zpět",
      ed_show_title: "Zobrazit název",
      ed_show_subtitle: "Zobrazit podnázev",
      ed_language: "Jazyk", lang_auto: "Automaticky (jazyk Home Assistant)",
      unavailable: "Nedostupné", cancel: "Zrušit",
      confirmPort80Off: "Přestat naslouchat na portu 80? Požadavky HTTP a ověření ACME HTTP se už k {proxy} nedostanou.",
      confirmRuleOff: "Zakázat pravidlo proxy pro {domain}? Služba už nebude dostupná přes {proxy}.",
      down: "Nedostupný", upstreamDown: "Cílový server je nedostupný (monitor dostupnosti {proxy})", upstreamsDown: "Nedostupné cílové servery: {n}",
      ed_device: "Zařízení {proxy}", ed_device_helper: "Při více instancích {proxy} ta, která se zobrazí (prázdné: první)",
    },
    sl: {
      active: "Aktiven", inactive: "Neaktiven",
      rules: "Pravila", activeRules: "Aktivna", certs: "Potr.", port: "Vrata", middlewares: "Vmesna oprema",
      controls: "Kontrolniki", httpsRedirect: "Preusme\u00adritev HTTPS", port80: "Vrata 80", devMode: "Način dev",
      certsSection: "Potrdila", proxyRules: "Pravila proxy", redirections: "Preusmeritve",
      noCerts: "Ni najdenih potrdil.", noRules: "Ni nastavljenih pravil.", noRedirects: "Ni nastavljenih preusmeritev.",
      expired: "Poteklo", renew: "Obnovi", daysLeft: "{n} d",
      on: "Vklop", off: "Izklop",
      enableRule: "Omogoči", disableRule: "Onemogoči",
      ed_proxy_url: "URL {proxy}", ed_entity_prefix: "Predpona entitet",
      ed_proxy_url_helper: "Odpre se s klikom na ikono v glavi",
      openProxy: "Odpri spletni vmesnik {proxy}",
      ed_entity_prefix_helper: "Skupni del ID-jev entitet, na primer zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Prikaži celotno kartico", zoomOut: "Nazaj na strnjeni pogled",
      ruleCount: "Pravila: {a}/{n}", certCount: "Potr.: {n}",
      ed_zoom: "Gumb za podrobnosti", ed_zoom_helper: "Preklopi na celotno kartico in nazaj",
      ed_show_title: "Prikaži naslov",
      ed_show_subtitle: "Prikaži podnaslov",
      ed_language: "Jezik", lang_auto: "Samodejno (jezik Home Assistanta)",
      unavailable: "Ni na voljo", cancel: "Prekliči",
      confirmPort80Off: "Prenehati poslušati na vratih 80? Zahteve HTTP in preverjanja ACME HTTP ne bodo več dosegla {proxy}ja.",
      confirmRuleOff: "Onemogočiti pravilo proxy za {domain}? Storitev prek {proxy}ja ne bo več dosegljiva.",
      down: "Nedosegljiv", upstreamDown: "Ciljni strežnik je nedosegljiv (nadzor razpoložljivosti {proxy})", upstreamsDown: "Nedosegljivi ciljni strežniki: {n}",
      ed_device: "Naprava {proxy}", ed_device_helper: "Pri več primerkih {proxy} tisti, ki se prikaže (prazno: prvi)",
    },
    lv: {
      active: "Aktīvs", inactive: "Neaktīvs",
      rules: "Kārtulas", activeRules: "Aktīvās", certs: "Sert.", port: "Ports", middlewares: "Starpprogr.",
      controls: "Vadīklas", httpsRedirect: "HTTPS pāradre­sācija", port80: "Ports 80", devMode: "Dev režīms",
      certsSection: "Sertifikāti", proxyRules: "Proxy kārtulas", redirections: "Pāradresācijas",
      noCerts: "Nav atrasts neviens sertifikāts.", noRules: "Nav konfigurēta neviena kārtula.", noRedirects: "Nav konfigurēta neviena pāradresācija.",
      expired: "Beidzies", renew: "Atjaunot", daysLeft: "{n} d.",
      on: "Iesl.", off: "Izsl.",
      enableRule: "Iespējot", disableRule: "Atspējot",
      ed_proxy_url: "{proxy} URL", ed_entity_prefix: "Entītiju prefikss",
      ed_proxy_url_helper: "Atveras, noklikšķinot uz galvenes ikonas",
      openProxy: "Atvērt {proxy} tīmekļa saskarni",
      ed_entity_prefix_helper: "Entītiju ID kopīgā daļa, piemēram, zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Rādīt pilno kartīti", zoomOut: "Atpakaļ uz kompakto skatu",
      ruleCount: "Kārtulas: {a}/{n}", certCount: "Sert.: {n}",
      ed_zoom: "Detaļu poga", ed_zoom_helper: "Pārslēdz uz pilno kartīti un atpakaļ",
      ed_show_title: "Rādīt virsrakstu",
      ed_show_subtitle: "Rādīt apakšvirsrakstu",
      ed_language: "Valoda", lang_auto: "Automātiski (Home Assistant valoda)",
      unavailable: "Nav pieejams", cancel: "Atcelt",
      confirmPort80Off: "Pārtraukt klausīšanos portā 80? HTTP pieprasījumi un ACME HTTP pārbaudes vairs nesasniegs {proxy}.",
      confirmRuleOff: "Atspējot starpniekservera kārtulu domēnam {domain}? Pakalpojums vairs nebūs pieejams caur {proxy}.",
      down: "Nepieejams", upstreamDown: "Mērķa serveris nav pieejams ({proxy} pieejamības uzraudzība)", upstreamsDown: "Nepieejami mērķa serveri: {n}",
      ed_device: "{proxy} ierīce", ed_device_helper: "Ja ir vairākas {proxy} instances, rādāmā (tukšs: pirmā)",
    },
    el: {
      active: "Ενεργό", inactive: "Ανενεργό",
      rules: "Κανόνες", activeRules: "Ενεργοί", certs: "Πιστ.", port: "Θύρα", middlewares: "Middleware",
      controls: "Χειριστήρια", httpsRedirect: "Ανακατεύ­θυνση HTTPS", port80: "Θύρα 80", devMode: "Λειτ. dev",
      certsSection: "Πιστοποιητικά", proxyRules: "Κανόνες proxy", redirections: "Ανακατευθύνσεις",
      noCerts: "Δεν βρέθηκε πιστοποιητικό.", noRules: "Δεν έχει ρυθμιστεί κανόνας.", noRedirects: "Δεν έχει ρυθμιστεί ανακατεύθυνση.",
      expired: "Έληξε", renew: "Ανανέωση", daysLeft: "{n} η",
      on: "Ενεργ.", off: "Απενεργ.",
      enableRule: "Ενεργοποίηση", disableRule: "Απενεργοποίηση",
      ed_proxy_url: "URL του {proxy}", ed_entity_prefix: "Πρόθεμα οντοτήτων",
      ed_proxy_url_helper: "Ανοίγει με κλικ στο εικονίδιο της κεφαλίδας",
      openProxy: "Άνοιγμα της διεπαφής ιστού του {proxy}",
      ed_entity_prefix_helper: "Κοινό τμήμα των αναγνωριστικών οντοτήτων, για παράδειγμα zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Εμφάνιση πλήρους κάρτας", zoomOut: "Επιστροφή στη συμπαγή προβολή",
      ruleCount: "Κανόνες: {a}/{n}", certCount: "Πιστ.: {n}",
      ed_zoom: "Κουμπί λεπτομερειών", ed_zoom_helper: "Εναλλάσσει στην πλήρη κάρτα και πίσω",
      ed_show_title: "Εμφάνιση τίτλου",
      ed_show_subtitle: "Εμφάνιση υπότιτλου",
      ed_language: "Γλώσσα", lang_auto: "Αυτόματα (γλώσσα του Home Assistant)",
      unavailable: "Μη διαθέσιμο", cancel: "Ακύρωση",
      confirmPort80Off: "Διακοπή ακρόασης στη θύρα 80; Τα αιτήματα HTTP και οι έλεγχοι ACME HTTP δεν θα φτάνουν πλέον στο {proxy}.",
      confirmRuleOff: "Απενεργοποίηση του κανόνα proxy για το {domain}; Η υπηρεσία δεν θα είναι πλέον προσβάσιμη μέσω του {proxy}.",
      down: "Εκτός", upstreamDown: "Ο διακομιστής προορισμού είναι εκτός λειτουργίας (παρακολούθηση διαθεσιμότητας {proxy})", upstreamsDown: "Διακομιστές προορισμού εκτός: {n}",
      ed_device: "Συσκευή {proxy}", ed_device_helper: "Με πολλές εγκαταστάσεις {proxy}, αυτή που εμφανίζεται (κενό: η πρώτη)",
    },
  };

  static CSS = `
    :host {
      display: block;
      min-width: 0;
      --zx-natural-width: 360px;
      --zx-accent: var(--primary-color, #03a9f4);
      --zx-ok: var(--success-color, #43a047);
      --zx-warn: var(--warning-color, #ffa600);
      --zx-crit: var(--error-color, #db4437);
    }
    /* The card is a size container: the header and the controls adapt to the card's width, not the window's. */
    ha-card { overflow: hidden; container-type: inline-size; }
    /* A size container has no width of its own content: in a parent that sizes to its content (an inline-block,
       a grid "auto" column) the card would fall to a few pixels. This empty, zero-height grid gives the card a
       natural (max-content) width without any minimum (its min-content width is 0): in a "1fr 1fr" grid
       (layout-card, a grid or horizontal stack), wrapped or not, the card still shrinks to its track.
       contain-intrinsic-inline-size or a min-width on the host would be a minimum and overflow there. */
    :host::before { content: ""; display: grid; grid-template-columns: minmax(0, var(--zx-natural-width)); height: 0; }
    .icon { width: 18px; height: 18px; fill: currentColor; flex: none; }
    .ok { --c: var(--zx-ok); } .warn { --c: var(--zx-warn); } .crit { --c: var(--zx-crit); } .idle { --c: var(--secondary-text-color); }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--c, var(--zx-ok)); flex: none; display: inline-block; }
    .chip { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border-radius: 12px; font-size: 11px; font-weight: 500;
            background: color-mix(in srgb, var(--c, var(--zx-ok)) 15%, transparent); white-space: nowrap;
            color: color-mix(in srgb, var(--c, var(--zx-ok)) 50%, var(--primary-text-color));
            box-sizing: border-box; max-width: 100%; min-width: 0; }
    .chip .ct { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .header { display: flex; align-items: center; gap: 10px; padding: 12px 12px 8px; }
    .logo { width: 40px; height: 40px; flex: none; border-radius: 50%; display: grid; place-items: center; position: relative;
            color: var(--c, var(--zx-ok)); background: color-mix(in srgb, var(--c, var(--zx-ok)) 16%, transparent); }
    .logo svg { width: 24px; height: 24px; fill: currentColor; }
    .logo .badge { position: absolute; right: -4px; bottom: -4px; width: 18px; height: 18px; border-radius: 5px; padding: 2px; box-sizing: border-box;
                   display: grid; place-items: center; background: #fff;
                   box-shadow: 0 0 0 1px var(--divider-color, rgba(0,0,0,.12)), 0 0 0 3px var(--card-background-color, #fff); }
    .logo .badge svg { width: 100%; height: 100%; }
    .brand-link { display: flex; flex: none; border-radius: 50%; }
    .brand-link:focus-visible { outline: 2px solid var(--zx-accent); outline-offset: 2px; }
    /* Narrow header: the title block takes what the status pill leaves (from a zero basis) and keeps about four
       letters (5ch of the 16 px title); the pill keeps its whole text and only gives way (ellipsis) when even
       that minimum title does not fit; the icon buttons never shrink. */
    .titles { flex: 1 1 0; min-width: 5ch; font-size: 16px; }
    :host([hide-title]) .titles > .name, :host([hide-subtitle]) .titles > .sub { display: none; }
    #status { display: flex; flex: 0 1 auto; min-width: 0; }
    .name { font-size: 16px; font-weight: 500; line-height: 1.25; color: var(--primary-text-color); text-decoration: none;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
    .sub { font-size: 12px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .content { padding: 0 12px 12px; display: flex; flex-direction: column; gap: 12px; }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(72px, 1fr)); gap: 6px; }
    .tile { display: flex; flex-direction: column; align-items: center; gap: 0; padding: 6px 8px; border-radius: 10px; min-width: 0;
            background: var(--secondary-background-color, rgba(127,127,127,.08)); }
    .mv { font-size: 16px; font-weight: 500; color: var(--primary-text-color); }
    .ml { font-size: 11px; color: var(--secondary-text-color); }
    .sec-header { display: flex; justify-content: space-between; align-items: center; cursor: pointer; margin-bottom: 6px; }
    .sec-header[aria-expanded="false"] { margin-bottom: 0; }
    .section-title { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; text-transform: uppercase;
                     letter-spacing: .04em; color: var(--secondary-text-color); }
    .section-title { min-width: 0; }
    .section-title > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .section-title .icon { width: 16px; height: 16px; }
    .sec-arrow { color: var(--secondary-text-color); display: flex; flex: none; transition: transform .2s ease; }
    .sec-arrow.closed { transform: rotate(-90deg); }
    .controls { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
    .ctrl { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 4px; border-radius: 10px; cursor: pointer;
            box-sizing: border-box; height: 100%;
            border: none; width: 100%; font-family: inherit; color: var(--primary-text-color);
            background: var(--secondary-background-color, rgba(127,127,127,.08)); transition: background .15s; }
    .ctrl .icon { color: var(--c, var(--secondary-text-color)); }
    .ctrl:hover { background: color-mix(in srgb, var(--zx-accent) 15%, var(--secondary-background-color, transparent)); }
    .ctrl:disabled { cursor: not-allowed; }
    .ctrl:disabled:hover { background: var(--secondary-background-color, rgba(127,127,127,.08)); }
    /* Long words break at their soft hyphens (in the translations), a word is cut only as a last resort;
       the label takes the free height, so the On / Off lines of the three tiles stay aligned. */
    .cl { font-size: 11px; color: var(--secondary-text-color); text-align: center; overflow-wrap: break-word; max-width: 100%; flex: 1 0 auto; }
    .cs { font-size: 11px; font-weight: 500; color: color-mix(in srgb, var(--c) 50%, var(--primary-text-color)); text-align: center; }
    .row { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; gap: 8px; font-size: 13px; }
    .row + .row { border-top: 1px solid var(--divider-color); }
    .row-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .row-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    /* A row with a target (rules, redirects): the domain keeps its width, the target takes what is left (from a
       zero basis up to its own width) and gives way first, down to about four characters; only then does the
       domain shrink. Both end in an ellipsis, with the full text in their title. */
    .row-right:has(> .row-sub) { flex: 1 1 auto; justify-content: flex-end; }
    .row-right > :not(.row-sub), .row-sub.row-code { flex-shrink: 0; }
    .row-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row-sub { font-size: 11px; color: var(--secondary-text-color); width: 0; flex-grow: 1; min-width: 4ch; max-width: max-content;
               overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row-sub.row-code { width: auto; flex-grow: 0; min-width: 0; }
    .domain-link { cursor: pointer; }
    .domain-link:hover { text-decoration: underline; }
    .sec-header:focus-visible, .domain-link:focus-visible { outline: 2px solid var(--zx-accent); outline-offset: 2px; border-radius: 4px; }
    .empty { color: var(--secondary-text-color); font-size: 13px; padding: 4px 0; margin: 0; }
    /* Neutral button (renew); a proxy rule's On / Off button is tinted with its state colour. */
    .icon-btn { display: inline-flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer;
                border: 1px solid transparent; border-radius: 10px; padding: 4px 8px; font-family: inherit;
                font-size: 12px; font-weight: 500; color: var(--primary-text-color); transition: background .15s;
                background: var(--secondary-background-color, rgba(127,127,127,.12)); }
    .icon-btn:hover { background: color-mix(in srgb, var(--primary-text-color) 8%, var(--secondary-background-color, transparent)); }
    .icon-btn.rule-btn { color: color-mix(in srgb, var(--c) 50%, var(--primary-text-color)); background: color-mix(in srgb, var(--c) 16%, transparent); }
    .icon-btn.rule-btn:hover { background: color-mix(in srgb, var(--c) 24%, transparent); }
    .icon-btn:disabled { opacity: .5; cursor: not-allowed; }
    .icon-btn.busy { color: var(--zx-warn); }
    /* In-card confirmation (turning port 80 or a proxy rule off), as in the other ha-* cards: a backdrop over the
       card with a small dialog at its top, so it stays in view on a long card. */
    ha-card.dialog-open { position: relative; min-height: 150px; }
    .backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: flex-start; justify-content: center;
                padding-top: 12px; box-sizing: border-box; z-index: 9; border-radius: inherit; }
    .modal { background: var(--card-background-color, #1c1c1c); color: var(--primary-text-color); width: min(92%, 340px); max-height: calc(100% - 24px);
             overflow: auto; box-sizing: border-box; border-radius: 14px; padding: 16px; box-shadow: 0 8px 30px rgba(0,0,0,.4);
             display: flex; flex-direction: column; gap: 12px; }
    .modal .msg { font-size: 14px; line-height: 1.4; overflow-wrap: break-word; }
    .modal-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
    .modal-actions .btn { border: none; border-radius: 8px; padding: 8px 14px; font: inherit; font-size: 13px; font-weight: 500; cursor: pointer;
                          background: var(--secondary-background-color, rgba(127,127,127,.12)); color: var(--primary-text-color); }
    .modal-actions .btn.primary { --c: var(--zx-crit); background: color-mix(in srgb, var(--c) 15%, transparent);
                                  color: color-mix(in srgb, var(--c) 50%, var(--primary-text-color)); }
    .modal-actions .btn:focus-visible { outline: 2px solid var(--zx-accent); outline-offset: 2px; }
    /* Narrow card (the mini card's full view at 4 columns): smaller logo and gaps, the status pill shows its dot
       only (its text stays in its title and for screen readers), the controls go one per line. */
    /* Up to ~260 px (a phone's half-width section, with the mini card's detail button): tighter header gaps, so
       a long status ("Niedostępny", "Nicht verfügbar") keeps its whole text next to the title. */
    @container (max-width: 260px) {
      .header { gap: 6px; }
    }
    @container (max-width: 200px) {
      .header .logo { width: 28px; height: 28px; }
      .header .logo svg { width: 18px; height: 18px; }
      .header .logo .badge { width: 14px; height: 14px; right: -3px; bottom: -3px; }
      #status .ct { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
      #status .chip { padding: 1px 8px; }
      .controls { grid-template-columns: minmax(0, 1fr); }
      /* One tile per line: the icon, then the label with its state under it (a long state such as
         "Niedostępny" no longer squeezes the label down to a few letters per line). */
      .ctrl { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 6px; align-items: center;
              justify-items: start; padding: 6px 8px; }
      .ctrl .icon { grid-row: span 2; }
      .ctrl .cl, .ctrl .cs { min-width: 0; max-width: 100%; text-align: start; }
      .ctrl .cl { flex: none; }
      /* A certificate, rule or redirect row puts its domain on a line of its own (the whole width), its expiry,
         target and buttons under it: on one line the domain would leave the target no room at all. */
      .row { flex-wrap: wrap; row-gap: 2px; }
      .row-left { flex: 1 0 100%; }
      .row-right { margin-left: auto; }
      /* Under its domain, the target takes what the buttons leave, down to nothing on the narrowest card. */
      .row-sub { min-width: 0; }
    }
    @container (max-width: 150px) {
      .header .logo, .header .brand-link { display: none; }
      /* Phone width at 4 columns: the label and its state take the whole tile. */
      .ctrl { grid-template-columns: minmax(0, 1fr); }
      .ctrl .icon { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .sec-arrow, .ctrl, .icon-btn { transition: none; }
    }
  `;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._sectionOpen = { ...ReverseProxyCard.SECTION_DEFAULTS };
    this._states = null;
    this._renderKey = null;
  }

  static SECTION_DEFAULTS = { controls: true, certs: false, rules: false, redirects: false };

  // A click elsewhere on the page folds the sections back to their defaults (as in ha-carburants-france).
  // On the release, not the press: folding on press would shift the layout under the pointer before the release
  // (the target of the click is settled by then).
  connectedCallback() {
    this._onOutside ??= (ev) => {
      if (ev.composedPath().includes(this)) return;
      // Closed by a click elsewhere on the page: the focus goes where that click put it.
      if (this._confirm) this._closeConfirm(false);
      for (const [id, open] of Object.entries(ReverseProxyCard.SECTION_DEFAULTS)) {
        if (this._sectionOpen[id] !== open) this._setSection(id, open);
      }
    };
    this._outside ??= watchOutside(this, (ev) => this._onOutside(ev));
    this._outside.on();
  }

  disconnectedCallback() {
    this._outside?.off();
    // Left (another dashboard view, a conditional card hidden): folded back as by a click elsewhere, so that the card
    // does not come back unfolded or with its popup open.
    this._onOutside?.({ composedPath: () => [] });
    if (this._onConfirmKey) document.removeEventListener("keydown", this._onConfirmKey, true);
    clearTimeout(this._refreshTimer);
  }

  _setSection(id, open) {
    this._sectionOpen[id] = open;
    const header = this.shadowRoot.querySelector(`.sec-header[data-id="${id}"]`);
    const content = this.shadowRoot.querySelector(`.sec-content[data-id="${id}"]`);
    const arrow = this.shadowRoot.querySelector(`.sec-arrow[data-id="${id}"]`);
    if (header) header.setAttribute("aria-expanded", String(open));
    if (content) content.style.display = open ? "block" : "none";
    if (arrow) arrow.classList.toggle("closed", !open);
  }

  setConfig(config) {
    if (!config || typeof config !== "object") throw new Error("Invalid configuration");
    for (const key of ["proxy_url", "zoraxy_url", "entity_prefix", "language", "device"]) {
      if (config[key] != null && typeof config[key] !== "string") throw new Error(`${key} must be a string`);
    }
    this._config = config;
    // show_title / show_subtitle: the header's title / subtitle, hidden by the stylesheet
    this.toggleAttribute?.("hide-title", config.show_title === false);
    this.toggleAttribute?.("hide-subtitle", config.show_subtitle === false);
    this._states = null;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    // Re-render only when a state the card shows changed (Home Assistant keeps the same state object while it
    // doesn't change), the language changed, or the hour changed (certificate countdowns).
    const states = this._entityIds().map((id) => hass.states[id]);
    const key = this._key();
    if (this._states && key === this._renderKey && states.length === this._states.length && states.every((st, i) => st === this._states[i])) return;
    this._render();
  }

  // What else re-renders the card: the language, the hour (certificate countdowns) and the user's admin flag.
  _key() {
    return `${this._lang()}|${Math.floor(Date.now() / 3600000)}|${this._isAdmin()}`;
  }

  // Enabling or disabling a proxy rule is an admin-only action: other users see the rules' state, not the toggles.
  // A frontend that does not say who the user is (older versions, tests) keeps them; the service still checks.
  _isAdmin() {
    return this._hass?.user?.is_admin !== false;
  }

  // The config entry of the card's proxy device, so that a rule toggle reaches this instance (null: unknown).
  _entryId() {
    const device = this._hass?.devices?.[this._registry()?.device];
    return device?.primary_config_entry || device?.config_entries?.[0] || null;
  }

  // Entities of this card: those of its proxy device in the entity registry, else those found from the prefix.
  // The list is cached on hass.entities (the entity registry), which only changes when entities are added or
  // removed, not on every state change.
  _entityIds() {
    const reg = this._registry();
    if (reg) return reg.ids;
    const registry = this._hass?.entities;
    const prefix = this._prefix();
    if (registry && this._idsFor === registry && this._idsPrefix === prefix) return this._ids;
    const marker = `.${prefix}_`;
    // Without the registry (older frontends, tests), the states are scanned each time.
    const ids = Object.keys(registry || this._hass?.states || {}).filter((id) => id.includes(marker)).sort();
    if (!registry) return ids;
    this._ids = ids;
    this._idsFor = registry;
    this._idsPrefix = prefix;
    return this._ids;
  }

  // The object ids (after the prefix) of the device's entities up to 1.4.x, by entity domain and translation key:
  // the fallback when the entity registry is not available.
  static LEGACY = {
    "sensor.proxy_rules": "regles_proxy",
    "sensor.active_rules": "regles_actives",
    "sensor.tls_certificates": "certificats_tls",
    "sensor.inbound_port": "port_entrant",
    "sensor.certificate": "cert_",
    "binary_sensor.proxy_running": "proxy_actif",
    "binary_sensor.https_redirect": "redirection_https",
    "binary_sensor.port_80": "ecoute_port_80",
    "binary_sensor.development_mode": "mode_developpement",
    "binary_sensor.certificate_expiring": "cert_expirant_",
    "binary_sensor.upstream_problem": "upstream_",
    "switch.https_redirect": "redirection_https",
    "switch.port_80": "ecoute_port_80",
    "switch.development_mode": "mode_developpement",
    "button.renew": "renouveler_",
  };

  // The reverse proxy entities of the card's device, found in the entity registry by platform, device and
  // translation key, whatever their entity ids: { ids, one: {"sensor.proxy_rules": id…}, many: {"button.renew": [ids]…} }.
  // The device is the `device` option, else the one of the entity named after the prefix (the first Zoraxy
  // install keeps its 1.4.x ids), else the first proxy device. null without the registry or any proxy entity in
  // it: the ids are then built from the prefix.
  _registry() {
    const entities = this._hass?.entities;
    const device = this._config?.device || "";
    const prefix = this._prefix();
    if (this._regFor === entities && this._regDevice === device && this._regPrefix === prefix) return this._reg;
    this._regFor = entities;
    this._regDevice = device;
    this._regPrefix = prefix;
    const all = Object.values(entities || {})
      .filter((e) => e?.platform === "reverse_proxy" && e.entity_id && e.device_id)
      .sort((a, b) => (a.entity_id < b.entity_id ? -1 : 1));
    const named = all.find((e) => e.entity_id === `sensor.${prefix}_regles_proxy`) ?? all.find((e) => e.entity_id.includes(`.${prefix}_`));
    const dev = device || named?.device_id || all.map((e) => e.device_id).sort()[0];
    const mine = all.filter((e) => e.device_id === dev);
    if (!mine.length) return (this._reg = null);
    const one = {};
    const many = {};
    for (const e of mine) {
      const key = `${e.entity_id.split(".")[0]}.${e.translation_key}`;
      one[key] ??= e.entity_id;
      (many[key] ??= []).push(e.entity_id);
    }
    return (this._reg = { ids: mine.map((e) => e.entity_id), one, many, device: dev });
  }

  // The entity id of one of the device's entities ("sensor.proxy_rules"), by translation key or from the prefix.
  _eid(key) {
    return this._registry()?.one[key] ?? `${key.split(".")[0]}.${this._prefix()}_${ReverseProxyCard.LEGACY[key]}`;
  }

  // The per-domain entities of a kind ("button.renew"): registry first, else those whose id starts as in 1.4.x.
  _many(key) {
    const reg = this._registry();
    if (reg) return reg.many[key] || [];
    const start = `${key.split(".")[0]}.${this._prefix()}_${ReverseProxyCard.LEGACY[key]}`;
    return this._entityIds().filter((id) => id.startsWith(start));
  }

  // The entity of a kind whose `domain` attribute is this domain (certificate, rule).
  _byDomain(key, domain) {
    return this._many(key).find((id) => this._attr(id, "domain") === domain);
  }

  // Header and metrics, one line per section header, and the controls when that section is open (7 by default).
  getCardSize() {
    const open = this._sectionOpen;
    const rows = (n) => Math.ceil(n / 2);
    const rules = this._hass ? this._attr(this._eid("sensor.proxy_rules"), "rules") || [] : [];
    const redirects = this._hass ? this._attr(this._eid("sensor.proxy_rules"), "redirects") || [] : [];
    const certs = this._hass ? this._certSensors().length : 0;
    const has = (f) => (this._hass ? this._has(f) : true);
    const sections = 1 + (has("controls") ? 1 : 0) + (has("certificates") ? 1 : 0) + (has("redirects") ? 1 : 0);
    return 2 + sections + (has("controls") && open.controls ? 1 : 0) + (has("certificates") && open.certs ? rows(certs) : 0) + (open.rules ? rows(rules.length) : 0) + (has("redirects") && open.redirects ? rows(redirects.length) : 0);
  }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }
  static getConfigElement() { return document.createElement("reverse-proxy-card-editor"); }
  static getStubConfig() { return { proxy_url: "http://zoraxy.local:8000" }; }

  // ── Helpers ────────────────────────────────────────────────────────────────


  _lang() {
    return ReverseProxyCard.langOfHass(this._hass, this._config);
  }

  // The card and its editors resolve the language the same way: the card's `language` option, then the user's
  // locale, then the server language.
  static langOfHass(hass, config) {
    return ReverseProxyCard.langOf(config?.language || hass?.locale?.language || hass?.language);
  }

  // The supported language matching a locale: the whole locale when the card has it ("sr-Latn"), else the part
  // before the dash ("de-AT" → "de"), English otherwise.
  static langOf(locale) {
    const value = String(locale || "en").toLowerCase();
    const langs = Object.keys(ReverseProxyCard.I18N);
    return langs.find((l) => l.toLowerCase() === value) ?? langs.find((l) => l === value.split("-")[0]) ?? "en";
  }

  // A text, with the brand name of the card's proxy where it says {proxy}.
  _t(key) {
    const text = ReverseProxyCard.I18N[this._lang()]?.[key] ?? ReverseProxyCard.I18N.en[key] ?? key;
    return text.replaceAll("{proxy}", this._brand().name);
  }

  _prefix() { return this._config?.entity_prefix || "zoraxy_reverse_proxy_zoraxy"; }
  _state(id) { return this._hass?.states[id]?.state ?? "unavailable"; }
  // A state meant to be read: "unknown" / "unavailable" (or a missing entity) shows as "–", never as the raw word.
  _value(id) {
    const state = this._state(id);
    return state === "unknown" || state === "unavailable" ? "–" : state;
  }
  _attr(id, attr) { return this._hass?.states[id]?.attributes?.[attr]; }
  _isOn(id) { return this._state(id) === "on"; }

  // The service is decided by the caller (at the click or when the popup opens), never re-read from the state:
  // a confirmed "turn off" must not turn the switch on if it went off meanwhile.
  async _setSwitch(id, on) {
    // Home Assistant already shows the error (HomeAssistantError) in a toast.
    await this._hass
      .callService("homeassistant", on ? "turn_on" : "turn_off", { entity_id: id })
      .catch((e) => console.warn("reverse-proxy-card:", e?.message ?? e));
  }
  async _pressButton(id) {
    await this._hass.callService("button", "press", { entity_id: id });
  }

  async _toggleRule(domain, currentlyEnabled, btn) {
    btn.disabled = true;

    // Optimistic update of the button
    const newEnabled = !currentlyEnabled;
    btn.className = `icon-btn rule-btn ${newEnabled ? "ok" : "crit"}`;
    btn.dataset.ruleEnabled = String(newEnabled);
    btn.title = newEnabled ? this._t("disableRule") : this._t("enableRule");
    btn.innerHTML = this._ruleBtnContent(newEnabled);

    try {
      const entryId = this._entryId();
      // notifyOnError false: the card shows the error itself (one toast, with the translated message).
      await this._hass.callService(
        "reverse_proxy",
        "toggle_proxy_rule",
        { domain, enable: newEnabled, ...(entryId ? { config_entry_id: entryId } : {}) },
        undefined,
        false,
      );
      // Full re-render once the Home Assistant coordinator has refreshed the data
      clearTimeout(this._refreshTimer);
      this._refreshTimer = setTimeout(() => {
        if (this._hass) this._render();
      }, 3000);
    } catch (e) {
      this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message: e?.message ?? String(e) }, bubbles: true, composed: true }));
      // Roll back the optimistic update
      if (this._hass) this._render();
    } finally {
      btn.disabled = false;
    }
  }

  _dot(on) {
    return `<span class="dot ${on ? "ok" : "crit"}"></span>`;
  }

  _chip(text, cls) {
    return `<span class="chip ${cls}">${text}</span>`;
  }

  // The proxy's status: on, off, or unavailable / unknown (grey, never shown as "Inactive"). The text is also the
  // pill's title and label, for the narrow card where only the dot shows.
  _statusCls(state) {
    return state === "on" ? "ok" : state === "off" ? "crit" : "idle";
  }

  _statusChip(state) {
    const cls = this._statusCls(state);
    const label = state === "on" ? this._t("active") : state === "off" ? this._t("inactive") : this._t("unavailable");
    const text = rpEsc(label);
    return `<span class="chip ${cls}" title="${text}"><span class="dot"></span><span class="ct">${text}</span></span>`;
  }

  _ruleBtnContent(on) {
    return `<span class="dot"></span>${on ? this._t("on") : this._t("off")}`;
  }

  _daysUntil(dateStr) {
    if (!dateStr || dateStr === "unavailable" || dateStr === "unknown") return null;
    // new Date("garbage") gives an Invalid Date, not an exception: NaN would show as "J-NaN" with a green pill.
    const days = Math.floor((new Date(dateStr) - Date.now()) / 86400000);
    return Number.isNaN(days) ? null : days;
  }

  _mdi(path) {
    return `<svg class="icon" viewBox="0 0 24 24"><path d="${path}"/></svg>`;
  }

  // Generic row: dot + label on the left, content on the right
  _row(dotOn, label, right) {
    return `<div class="row">
      <div class="row-left">${this._dot(dotOn)}<span class="row-label" title="${rpEsc(label)}">${rpEsc(label)}</span></div>
      <div class="row-right">${right}</div>
    </div>`;
  }

  _section(id, title, icon, content) {
    const open = this._sectionOpen[id] === true;
    return `<div class="section">
      <div class="sec-header" data-id="${id}" role="button" tabindex="0" aria-expanded="${open}">
        <div class="section-title">${this._mdi(icon)}<span title="${rpEsc(title)}">${rpEsc(title)}</span></div>
        <span class="sec-arrow${open ? "" : " closed"}" data-id="${id}">${this._mdi(ReverseProxyCard.ICONS.chevronDown)}</span>
      </div>
      <div class="sec-content" data-id="${id}" style="display:${open ? "block" : "none"};">${content}</div>
    </div>`;
  }

  // ── Builders ───────────────────────────────────────────────────────────────

  // `available` false: the rules sensor is unavailable or unknown, its (missing) list is not "no rule".
  _buildRules(rules, available = true) {
    if (!available) return `<p class="empty">${this._t("unavailable")}</p>`;
    if (!rules?.length) return `<p class="empty">${this._t("noRules")}</p>`;
    return rules.map((r) => {
      const target = rpEsc(r.target);
      const domain = rpEsc(r.domain);
      // The proxy found an upstream of the rule down at its last check (Zoraxy's uptime monitor, Traefik's health checks).
      const down = this._isOn(this._byDomain("binary_sensor.upstream_problem", r.domain))
        ? `<span class="chip crit up-badge" title="${rpEsc(this._t("upstreamDown"))}"><span class="dot"></span><span class="ct">${rpEsc(this._t("down"))}</span></span>`
        : "";
      // A wildcard rule (*.example.org) is not a valid URL: plain label, no link.
      const left = String(r.domain ?? "").includes("*")
        ? `<span class="row-label" title="${domain}">${domain}</span>`
        : `<span class="row-label domain-link" title="${domain}" role="link" tabindex="0" data-href="https://${domain}">${domain}</span>`;
      // Non-admins see the rule's state on a disabled button: the toggle service is admin-only. A proxy whose
      // API is read-only (Traefik) shows the state as a plain chip.
      const action = this._isAdmin() ? `title="${r.enabled ? this._t("disableRule") : this._t("enableRule")}"` : "disabled";
      const state = this._has("toggle_rules")
        ? `<button class="icon-btn rule-btn ${r.enabled ? "ok" : "crit"}"
          data-rule-domain="${domain}"
          data-rule-enabled="${r.enabled ? "true" : "false"}"
          ${action}>${this._ruleBtnContent(r.enabled)}</button>`
        : `<span class="chip rule-state ${r.enabled ? "ok" : "crit"}">${this._ruleBtnContent(r.enabled)}</span>`;
      const right = `${down}<span class="row-sub" title="${target}">${target}</span>
        ${state}`;
      return `<div class="row">
        <div class="row-left">${left}</div>
        <div class="row-right">${right}</div>
      </div>`;
    }).join("");
  }

  // Certificate expiry sensors, with their domain, days left (null when unknown), expiring binary sensor and renew
  // button. Found by their `domain` attribute in the registry; from the prefix, by the 1.4.x id suffix.
  _certSensors() {
    const legacy = !this._registry();
    const prefix = `sensor.${this._prefix()}_cert_`;
    return this._many("sensor.certificate")
      .filter((id) => this._hass.states[id])
      .map((id) => {
        const suffix = id.slice(prefix.length);
        const domain = this._attr(id, "domain") || (legacy ? suffix.replace(/_/g, ".") : id);
        const [expiring, button] = legacy
          ? [`binary_sensor.${this._prefix()}_cert_expirant_${suffix}`, `button.${this._prefix()}_renouveler_${suffix}`]
          : [this._byDomain("binary_sensor.certificate_expiring", domain), this._byDomain("button.renew", domain)];
        return { id, domain, expiring, button, days: this._daysUntil(this._state(id)) };
      });
  }

  // Chip class for a certificate countdown: red under 7 days, orange under 30.
  _daysCls(days) {
    return days === null ? "idle" : days < 7 ? "crit" : days < 30 ? "warn" : "ok";
  }

  _daysLabel(days) {
    if (days === null) return "?";
    return days < 0 ? this._t("expired") : this._t("daysLeft").replace("{n}", days);
  }

  _buildCerts() {
    const sensors = this._certSensors();
    if (!sensors.length) return `<p class="empty">${this._t("noCerts")}</p>`;
    return sensors.map(({ domain, expiring, button: btnId, days }) => {
      const isExpiring = this._isOn(expiring);
      // A button entity is "unknown" until first pressed, which does not block it; unavailable (or missing) does.
      const off = this._state(btnId) === "unavailable" ? " disabled" : "";
      const right = `${this._chip(this._daysLabel(days), this._daysCls(days))}
        <button class="icon-btn renew-btn" data-entity="${rpEsc(btnId ?? "")}" title="${this._t("renew")}"${off}>
          ${this._mdi(ReverseProxyCard.ICONS.refresh)}
        </button>`;
      return this._row(!isExpiring, domain, right);
    }).join("");
  }

  _buildRedirects(redirects, available = true) {
    if (!available) return `<p class="empty">${this._t("unavailable")}</p>`;
    if (!redirects?.length) return `<p class="empty">${this._t("noRedirects")}</p>`;
    return redirects.map(r => {
      const src   = r.RedirectURL || "?";
      const dst   = r.TargetURL || "?";
      const code  = r.StatusCode ? `${r.StatusCode}` : "";
      const https = dst.startsWith("https");
      const right = `<span class="row-sub row-code">→ ${rpEsc(code)}</span>
        <span class="row-sub" title="${rpEsc(dst)}">${rpEsc(dst)}</span>
        ${https ? this._mdi(ReverseProxyCard.ICONS.lock) : ""}`;
      return this._row(true, src, right);
    }).join("");
  }

  // ── Full render ────────────────────────────────────────────────────────────

  // Remembers what this render shows, so that `set hass` skips the next ones until something changes.
  _snapshot() {
    this._states = this._entityIds().map((id) => this._hass.states[id]);
    this._renderKey = this._key();
  }

  // Card title: the proxy's brand name (the header icon carries the link to its web interface).
  _nameLink() {
    return `<span class="name">${rpEsc(this._brand().name)}</span>`;
  }

  _render() {
    if (!this._hass || !this._config) return;
    const focus = this._focusKey();
    this._draw();
    this._restoreFocus(focus);
  }

  // The card is redrawn with innerHTML: the focused control (a tile, a section header, a popup button…) is
  // found again by what identifies it, so a state change does not take the keyboard focus away.
  static FOCUS_ATTRS = ["id", "data-action", "data-rule-domain", "data-entity", "data-id"];

  _focusKey() {
    const el = this.shadowRoot.activeElement;
    if (!el?.getAttribute) return null;
    const attr = ReverseProxyCard.FOCUS_ATTRS.find((a) => el.getAttribute(a));
    // The first class only: the state classes (ok, idle…) may change with the render.
    return attr ? { cls: el.classList?.[0], attr, value: el.getAttribute(attr) } : null;
  }

  _restoreFocus(key) {
    if (!key || this.shadowRoot.activeElement) return;
    [...(this.shadowRoot.querySelectorAll?.(`[${key.attr}]`) || [])]
      .find((el) => el.classList?.[0] === key.cls && el.getAttribute(key.attr) === key.value)
      ?.focus({ preventScroll: true });
  }

  _draw() {
    this._snapshot();

    const metric = (value, label) => `<div class="tile"><div class="mv">${rpEsc(value)}</div><div class="ml">${label}</div></div>`;
    const rulesId       = this._eid("sensor.proxy_rules");
    const rulesCount    = this._value(rulesId);
    const activeCount   = this._value(this._eid("sensor.active_rules"));
    const certCount     = this._value(this._eid("sensor.tls_certificates"));
    const port          = this._value(this._eid("sensor.inbound_port"));
    const rules         = this._attr(rulesId, "rules") || [];
    const redirects     = this._attr(rulesId, "redirects") || [];
    // Rules sensor unavailable or unknown: its lists are not known, not empty.
    const listed        = rulesCount !== "–";
    const sub           = this._url().replace(/^https?:\/\//i, "").replace(/\/$/, "") || "Reverse proxy";
    // The third key figure: the certificates when the proxy exposes them (Zoraxy, Nginx Proxy Manager), else its
    // middlewares (Traefik).
    const third         = this._has("certificates")
      ? metric(certCount, this._t("certs"))
      : this._has("middlewares") ? metric(this._value(this._eid("sensor.middlewares")), this._t("middlewares")) : "";

    // A control shows its binary sensor and toggles its switch: either unavailable or unknown, the tile says so
    // (never "Off") and is disabled.
    const ctrl = ({ id, icon, label }) => {
      const state = this._ctrlState(id);
      const [cls, text] = state === "on" ? ["ok", this._t("on")] : state === "off" ? ["idle", this._t("off")] : ["idle", this._t("unavailable")];
      return `
      <button class="ctrl ${cls}" id="${id}"${state ? "" : " disabled"}>
        ${this._mdi(ReverseProxyCard.ICONS[icon])}
        <span class="cl">${this._t(label)}</span>
        <span class="cs">${text}</span>
      </button>`;
    };

    this.shadowRoot.innerHTML = `
      <style>${this.constructor.CSS}</style>
      <ha-card lang="${this._lang()}">
        <div class="header">
          ${this._headerIcon(this._statusCls(this._state(this._eid("binary_sensor.proxy_running"))))}
          <div class="titles">
            ${this._nameLink()}
            <div class="sub">${rpEsc(sub)}</div>
          </div>
          <span id="status">${this._statusChip(this._state(this._eid("binary_sensor.proxy_running")))}</span>
        </div>

        <div class="content">
          <div class="metrics">
            ${metric(rulesCount, this._t("rules"))}
            ${metric(activeCount, this._t("activeRules"))}
            ${third}
            ${metric(port, this._t("port"))}
          </div>

          ${this._has("controls") ? this._section("controls", this._t("controls"), ReverseProxyCard.ICONS.server, `<div class="controls">
            ${ReverseProxyCard.CONTROLS.map(ctrl).join("")}
          </div>`) : ""}

          ${this._has("certificates") ? this._section("certs", `${this._t("certsSection")} (${certCount})`, ReverseProxyCard.ICONS.cert, this._buildCerts()) : ""}
          ${this._section("rules",     `${this._t("proxyRules")} (${listed ? rules.length : "–"})`,   ReverseProxyCard.ICONS.router,   this._buildRules(rules, listed))}
          ${this._has("redirects") ? this._section("redirects", `${this._t("redirections")} (${listed ? redirects.length : "–"})`, ReverseProxyCard.ICONS.redirect, this._buildRedirects(redirects, listed)) : ""}
        </div>
      </ha-card>`;

    // Sections collapse/expand
    // Header and domain links are not buttons/anchors: Enter and Space activate them from the keyboard too.
    const onKey = (el, action) => el.addEventListener("keydown", (e) => {
      if (e.target !== el || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      action(e);
    });
    this.shadowRoot.querySelectorAll(".sec-header").forEach(h => {
      const toggle = () => this._setSection(h.dataset.id, !this._sectionOpen[h.dataset.id]);
      h.addEventListener("click", toggle);
      onKey(h, toggle);
    });

    // Switches
    for (const { id } of ReverseProxyCard.CONTROLS) {
      this.shadowRoot.getElementById(id)?.addEventListener("click", () => this._onCtrl(id));
    }

    // Certificate renewal buttons
    this.shadowRoot.querySelectorAll(".renew-btn").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.stopPropagation();
        btn.classList.add("busy");
        btn.disabled = true;
        try {
          await this._pressButton(btn.dataset.entity);
        } catch (err) {
          console.warn("reverse-proxy-card:", err?.message ?? err);
        } finally {
          setTimeout(() => { btn.classList.remove("busy"); btn.disabled = false; }, 3000);
        }
      });
    });

    // Proxy rule domain links
    this.shadowRoot.querySelectorAll(".domain-link").forEach(el => {
      const open = (e) => {
        e.stopPropagation();
        window.open(el.dataset.href, "_blank", "noopener,noreferrer");
      };
      el.addEventListener("click", open);
      onKey(el, open);
    });

    // Proxy rule enable/disable buttons
    this.shadowRoot.querySelectorAll(".rule-btn").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        this._onRule(btn);
      });
    });

    this._renderConfirm();
  }

  // ── Actions and their confirmation ────────────────────────────────────────

  // The three control tiles: the binary sensor shown and the switch toggled share the translation key.
  // `confirm`: turning it off asks first (port 80 off also stops the ACME HTTP challenges).
  static CONTROLS = [
    { id: "ctrl-https", key: "https_redirect", icon: "lock", label: "httpsRedirect" },
    { id: "ctrl-port80", key: "port_80", icon: "web", label: "port80", confirm: "confirmPort80Off" },
    { id: "ctrl-devmode", key: "development_mode", icon: "code", label: "devMode" },
  ];

  // "on" / "off" when both the binary sensor and the switch of a control are known, null otherwise.
  _ctrlState(id) {
    const { key } = ReverseProxyCard.CONTROLS.find((c) => c.id === id);
    const shown = this._state(this._eid(`binary_sensor.${key}`));
    const sw = this._state(this._eid(`switch.${key}`));
    return ["on", "off"].includes(shown) && ["on", "off"].includes(sw) ? shown : null;
  }

  // Right after the popup closes, a click is the rest of a double click on its button: ignored.
  _justConfirmed() {
    return Date.now() - (this._confirmClosedAt ?? 0) < ReverseProxyCard.CONFIRM_GUARD_MS;
  }

  _onCtrl(id) {
    if (this._justConfirmed()) return;
    const { key, confirm } = ReverseProxyCard.CONTROLS.find((c) => c.id === id);
    const entity = this._eid(`switch.${key}`);
    // Unavailable or unknown: nothing to toggle (the tile is disabled, keyboard included).
    if (!this._ctrlState(id)) return;
    const on = !this._isOn(entity);
    if (confirm && !on) {
      // The confirmed action is frozen now: "turn off", whatever the state when OK is pressed.
      this._openConfirm({ text: this._t(confirm), ok: this._t("disableRule"), run: () => this._setSwitch(entity, false), from: { id } });
    } else {
      this._setSwitch(entity, on);
    }
  }

  _onRule(btn) {
    if (this._justConfirmed() || !this._isAdmin()) return;
    const domain = btn.dataset.ruleDomain;
    if (btn.dataset.ruleEnabled !== "true") return this._toggleRule(domain, false, btn);
    this._openConfirm({
      text: this._t("confirmRuleOff").replace("{domain}", domain),
      ok: this._t("disableRule"),
      // The card may have been redrawn meanwhile: the rule's current button.
      run: () => {
        const current = this._ruleBtn(domain);
        if (current) return this._toggleRule(domain, true, current);
      },
      from: { domain },
    });
  }

  _ruleBtn(domain) {
    return [...(this.shadowRoot.querySelectorAll?.(".rule-btn") || [])].find((b) => b.dataset.ruleDomain === domain);
  }

  static CONFIRM_GUARD_MS = 400;

  // Cancel, Escape, the backdrop and a click outside the card close the popup without acting; the focus then
  // goes back to the button that opened it.
  _openConfirm(confirm) {
    this._confirm = confirm;
    this._onConfirmKey ??= (ev) => {
      if (!this._confirm) return;
      if (ev.key === "Escape") {
        ev.stopPropagation();
        this._closeConfirm();
      } else if (ev.key === "Tab") {
        // Tab and Shift+Tab stay on the popup's two buttons.
        const btns = [...(this.shadowRoot.querySelectorAll?.(".modal .btn") || [])];
        if (!btns.length) return;
        ev.preventDefault();
        const i = btns.indexOf(this.shadowRoot.activeElement);
        btns[(i + (ev.shiftKey ? -1 : 1) + btns.length) % btns.length].focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", this._onConfirmKey, true);
    this._renderConfirm();
    this.shadowRoot.querySelector?.(".modal .primary")?.focus({ preventScroll: true });
  }

  _closeConfirm(restoreFocus = true) {
    const from = this._confirm?.from;
    this._confirm = null;
    this._confirmClosedAt = Date.now();
    document.removeEventListener("keydown", this._onConfirmKey, true);
    this._renderConfirm();
    if (!restoreFocus || !from) return;
    const opener = from.id ? this.shadowRoot.getElementById?.(from.id) : this._ruleBtn(from.domain);
    opener?.focus({ preventScroll: true });
  }

  // Adds the popup to the card (or removes it), after each render too: a state change redraws the card.
  _renderConfirm() {
    const card = this.shadowRoot.querySelector?.("ha-card");
    if (!card) return;
    card.querySelector(".backdrop")?.remove();
    card.classList.toggle("dialog-open", !!this._confirm);
    if (!this._confirm) return;
    card.insertAdjacentHTML("beforeend", this._confirmHtml());
    const backdrop = card.querySelector(".backdrop");
    backdrop.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const action = ev.composedPath().find((n) => n.dataset?.action)?.dataset.action;
      if (action === "confirm_ok") {
        const { run } = this._confirm;
        this._closeConfirm();
        run();
      } else if (action === "confirm_cancel" || ev.target === backdrop) {
        this._closeConfirm();
      }
    });
  }

  _confirmHtml() {
    const c = this._confirm;
    return `<div class="backdrop" data-action="confirm_backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="zx-confirm-msg">
        <div class="msg" id="zx-confirm-msg">${rpEsc(c.text)}</div>
        <div class="modal-actions">
          <button type="button" class="btn" data-action="confirm_cancel">${rpEsc(this._t("cancel"))}</button>
          <button type="button" class="btn primary" data-action="confirm_ok">${rpEsc(c.ok)}</button>
        </div>
      </div>
    </div>`;
  }
}

// ── reverse-proxy-mini-card ──────────────────────────────────────────────────────────
// What the full card shows, on two lines: the logo, title and status pill, then one chip per key figure or alert.
// Its detail button (top right, `zoom: false` removes it) switches it to the full card and back; a click anywhere
// else brings it back too, unless it lands in a dialog opened from the card (more-info).
class ReverseProxyMiniCard extends ReverseProxyCard {
  static CSS = `${ReverseProxyCard.CSS}
    ha-card:has(.mini) { padding: 12px; }
    .mini { display: flex; align-items: center; gap: 10px; }
    /* Full-size logo (40 px, as on the full card), top-aligned: 12 px from the card's top edge (the two lines are
       a little taller than the logo). */
    .mini .logo, .mini .brand-link { align-self: flex-start; }
    .body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .head { display: flex; align-items: center; gap: 8px; min-width: 0; }
    /* The title gives way but keeps about four letters; the link stays the size of its text. */
    .mini .name { flex: 1 1 0; min-width: 5ch; max-width: max-content; }
    /* Natural width in a parent that sizes to its content (see :host::before in the full card). */
    :host { --zx-natural-width: 300px; }
    .head #status { margin-left: auto; }
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

  getCardSize() { return this._zoomed ? super.getCardSize() : 2; }
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
    const focus = this._focusKey();
    if (this._zoomed) this._draw();
    else this._renderMini();
    this._addZoom();
    this._restoreFocus(focus);
  }

  _renderMini() {
    this._snapshot();
    this.shadowRoot.innerHTML = `
      <style>${this.constructor.CSS}</style>
      <ha-card lang="${this._lang()}">
        <div class="mini">
          ${this._headerIcon(this._statusCls(this._state(this._eid("binary_sensor.proxy_running"))))}
          <div class="body">
            <div class="head">
              ${this._nameLink()}
              <span id="status">${this._statusChip(this._state(this._eid("binary_sensor.proxy_running")))}</span>
            </div>
            <div class="rs">${this._miniChips()}</div>
          </div>
        </div>
      </ha-card>`;
    this.shadowRoot.querySelectorAll(".r").forEach((el) => {
      el.addEventListener("click", () => {
        this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: el.dataset.entity }, bubbles: true, composed: true }));
      });
    });
  }

  // Detail button at the end of the header, top right in both views.
  _addZoom() {
    const head = this._config.zoom !== false && this.shadowRoot.querySelector(".head, .header");
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

// ── Editors ───────────────────────────────────────────────────────────────────
class ReverseProxyCardEditor extends HTMLElement {
  static SCHEMA = [
    // Which proxy, with several instances; left empty, the one of the entity prefix (or the first one).
    { name: "device", selector: { device: { integration: "reverse_proxy" } } },
    { name: "proxy_url", selector: { text: { type: "url" } } },
    { name: "entity_prefix", selector: { text: {} } },
    { name: "show_title", selector: { boolean: {} } },
    { name: "show_subtitle", selector: { boolean: {} } },
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
    return [...this.SCHEMA, { name: "language", selector: { select: { mode: "dropdown", options } } }];
  }

  static DEFAULTS = { entity_prefix: "zoraxy_reverse_proxy_zoraxy", show_title: true, show_subtitle: true };

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
class ReverseProxyMiniCardEditor extends ReverseProxyCardEditor {
  static SCHEMA = [...ReverseProxyCardEditor.SCHEMA, { name: "zoom", selector: { boolean: {} } }];
  static DEFAULTS = { ...ReverseProxyCardEditor.DEFAULTS, zoom: true };
}

// The names of the cards up to 1.14.x (zoraxy-card, zoraxy-mini-card) stay as aliases: a custom element class is
// registered once, so each alias is a subclass of its card.
class ZoraxyCard extends ReverseProxyCard {}
class ZoraxyMiniCard extends ReverseProxyMiniCard {}
class ZoraxyCardEditor extends ReverseProxyCardEditor {}
class ZoraxyMiniCardEditor extends ReverseProxyMiniCardEditor {}

const DOC_URL = "https://github.com/juju35/ha-reverse-proxy";
for (const [tag, cls] of [
  ["reverse-proxy-card-editor", ReverseProxyCardEditor],
  ["reverse-proxy-mini-card-editor", ReverseProxyMiniCardEditor],
  ["zoraxy-card-editor", ZoraxyCardEditor],
  ["zoraxy-mini-card-editor", ZoraxyMiniCardEditor],
  ["zoraxy-card", ZoraxyCard],
  ["zoraxy-mini-card", ZoraxyMiniCard],
]) {
  if (!customElements.get(tag)) customElements.define(tag, cls);
}

// Each card is registered on its own: a page that already loaded an older copy of this file (a stale resource
// or a cached version without the mini card) still gets the mini card from this one.
window.customCards = window.customCards || [];
if (!customElements.get("reverse-proxy-card")) {
  customElements.define("reverse-proxy-card", ReverseProxyCard);
  window.customCards.push({ type: "reverse-proxy-card", name: "Reverse Proxy Card", description: "Status, controls, certificates and proxy rules of a Zoraxy, Traefik or Nginx Proxy Manager reverse proxy", preview: true, documentationURL: DOC_URL });
  console.info(`%c REVERSE-PROXY-CARD %c v${REVERSE_PROXY_CARD_VERSION} `, "color:#bfdbfe;background:#0f172a;font-weight:700", "color:#0f172a;background:#bfdbfe");
}
if (!customElements.get("reverse-proxy-mini-card")) {
  customElements.define("reverse-proxy-mini-card", ReverseProxyMiniCard);
  window.customCards.push({ type: "reverse-proxy-mini-card", name: "Reverse Proxy Mini Card", description: "Zoraxy, Traefik or Nginx Proxy Manager status, rules and alerts on two lines, with a detail button showing the full card", preview: true, documentationURL: DOC_URL });
}
