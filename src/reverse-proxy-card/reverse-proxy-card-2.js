// ── reverse-proxy-card ───────────────────────────────────────────────────────
import { rpEsc, rpIsNight, rpSafeUrl } from "./helpers.js";
import { RP_BANNER_CSS, rpSceneSvg } from "./illustration-banner.js";
import { rpPatchChildren, textWidth, watchOutside } from "./dom-patching.js";
import { RP_I18N } from "./i18n/rp-i18n.js";

export class ReverseProxyCard extends HTMLElement {

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

  // The proxy's state for the header: its icon colour (`cls`) and its picture (`st`). Running with every upstream up
  // is green, running with upstreams down amber, stopped red, unavailable grey.
  _headerState() {
    const state = this._state(this._eid("binary_sensor.proxy_running"));
    if (state === "off") return { st: "off", cls: "crit", down: 0 };
    if (state !== "on") return { st: "idle", cls: "idle", down: 0 };
    const down = this._many("binary_sensor.upstream_problem").filter((id) => this._isOn(id)).length;
    return down ? { st: "down", cls: "warn", down } : { st: "ok", cls: "ok", down: 0 };
  }

  // The padlock over the proxy: the closest certificate expiry (red under 7 days, amber under 30 or flagged expiring).
  _certLevel() {
    if (!this._has("certificates")) return "ok";
    let level = "ok";
    for (const { expiring, days } of this._certSensors()) {
      if (days !== null && days < 7) return "crit";
      if ((days !== null && days < 30) || this._isOn(expiring)) level = "warn";
    }
    return level;
  }

  // The header's state and status pill, for both cards.
  // The banner's pill takes the icon's colour: amber with the upstreams down while the proxy runs.
  _headParts() {
    const head = this._headerState();
    const status = this._illustrated() && head.cls === "warn"
      ? this._statusChip("on", "warn", this._t("upstreamsDown").replace("{n}", head.down))
      : this._statusChip(this._state(this._eid("binary_sensor.proxy_running")));
    return { head, status };
  }

  _illustrated() { return this._config?.illustration !== false; }
  _night() { return this._illustrated() && rpIsNight(this._hass, this._config); }
  // The mini card's detail button sits at the banner's top right: the picture moves left to leave it room.
  _hasZoom() { return false; }

  // The illustrated header: the round status icon (brand badge) and `titles` on the background at the left, the
  // picture on the right, the network strip at the bottom.
  _banner(head, titles) {
    const cls = `banner${this._night() ? " night" : ""}${this._hasZoom() ? " zoomable" : ""}`;
    return `<div class="${cls}">${rpSceneSvg({ ...head, cert: this._certLevel() })}<div class="rp-ground"></div><div class="header">${this._headerIcon(head.cls)}<div class="titles">${titles}</div></div></div>`;
  }

  static I18N = RP_I18N;

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
    :host([hide-title]) .titles .name, :host([hide-subtitle]) .titles > .sub { display: none; }
    #status { display: flex; flex: 0 1 auto; min-width: 0; }
    /* The status pill right after the title, centred on it, while the title stays whole and the pill's whole label fits
       beside it; otherwise (measured by the card, see _fitPill) the pill on its own line under a one-line subtitle, and
       if even that would not fit in the header, its dot alone (the label stays in title and aria-label). */
    .titles { display: flex; flex-direction: column; }
    .trow { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .trow .name { flex: 0 1 auto; min-width: 0; }
    .trow #status { flex: none; max-width: none; }
    .titles.below { display: grid; grid-template-columns: minmax(0, 1fr); justify-items: start; }
    .titles.below .trow { display: contents; }
    .titles.below .name { max-width: 100%; }
    .titles.below > .sub { justify-self: stretch; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .titles.below #status { grid-row: 3; max-width: 100%; }
    .titles.pill-dot #status .ct { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
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
      /* The header's picture stands still: no packets, steady LEDs. */
      .rp-pk, .rp-led.ok, .rp-led.crit { animation: none; transition: none; }
      .rp-pk { display: none; }
    }
    ${RP_BANNER_CSS}
  `;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._sectionOpen = { ...ReverseProxyCard.SECTION_DEFAULTS };
    this._states = null;
    this._renderKey = null;
    // No rewrite of the card between a press and the end of its click: Home Assistant updates the card several times
    // a second, and a rewrite under the pointer replaces the element pressed, so that the click lands on the card
    // itself and does nothing. The pending update is drawn once released (after the click).
    this._onPressStart = () => {
      this._byPointer = true;
      this._pressing = true;
      window.addEventListener("pointerup", this._onPressEnd, true);
      window.addEventListener("pointercancel", this._onPressEnd, true);
    };
    this._onPressEnd = () => {
      window.removeEventListener("pointerup", this._onPressEnd, true);
      window.removeEventListener("pointercancel", this._onPressEnd, true);
      setTimeout(() => {
        this._pressing = false;
        if (!this._dirty) return;
        this._dirty = false;
        this._render();
      }, 0);
    };
    this.shadowRoot.addEventListener("pointerdown", this._onPressStart);
    // The focus is kept across rewrites for the keyboard only (no focus ring after a mouse click or a tap).
    this.shadowRoot.addEventListener("keydown", () => {
      this._byPointer = false;
    });
    // The click ends the press (after the element's own listeners, which draw what they change at once).
    this.shadowRoot.addEventListener("click", (ev) => {
      this._pressing = false;
      if (ev.detail === 0) this._byPointer = false;
    });
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
    // A new width (or the web font loaded): the status pill is fitted again (in the next frame, and only for a new width).
    document.fonts?.ready?.then(() => this._fitPill());
    if (typeof ResizeObserver !== "function") return;
    this._resize ??= new ResizeObserver((entries) => {
      const w = Math.round(entries.at(-1).contentRect.width);
      if (w === this._fitWidth) return;
      this._fitWidth = w;
      cancelAnimationFrame(this._fitFrame);
      this._fitFrame = requestAnimationFrame(() => this._fitPill());
    });
    this._resize.observe(this);
  }

  disconnectedCallback() {
    this._outside?.off();
    this._resize?.disconnect();
    this._fitWidth = undefined;
    this._pressing = false;
    window.removeEventListener("pointerup", this._onPressEnd, true);
    window.removeEventListener("pointercancel", this._onPressEnd, true);
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
    if (config.illustration != null && typeof config.illustration !== "boolean") throw new Error("illustration must be true or false");
    if (config.illustration_theme != null && !["auto", "day", "night"].includes(config.illustration_theme)) {
      throw new Error("illustration_theme must be auto, day or night");
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
    // A press in progress: drawn once released (see the constructor).
    if (this._pressing) {
      this._dirty = true;
      return;
    }
    this._render();
  }

  // What else re-renders the card: the language, the hour (certificate countdowns) and the user's admin flag.
  _key() {
    return `${this._lang()}|${Math.floor(Date.now() / 3600000)}|${this._isAdmin()}|${this._night()}`;
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

  _statusChip(state, cls = this._statusCls(state), label = null) {
    const text = rpEsc(label ?? (state === "on" ? this._t("active") : state === "off" ? this._t("inactive") : this._t("unavailable")));
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
    const focus = this._byPointer ? null : this._focusKey();
    this._draw();
    this._fitPill();
    this._restoreFocus(focus);
  }

  // The status pill stays right after the title only while the whole title and the pill's whole label fit on that
  // row; otherwise it takes a line of its own under the subtitle (.below), and when even then the title, the subtitle
  // and the pill would not fit above the banner's network strip, it keeps its dot alone (.pill-dot). Measured in the
  // real fonts, so that every language and title length gets its own answer.
  _fitPill() {
    // Home Assistant's <ha-card> (a Lit element) shows its content only from its first update, a microtask after it
    // is connected: measured before, everything is 0 px wide and the pill lands on the wrong line. Fitted then.
    const haCard = this.shadowRoot?.querySelector?.("ha-card");
    if (haCard && haCard.hasUpdated === false) {
      this._pillWait ??= (haCard.updateComplete?.then ? haCard.updateComplete : new Promise((r) => requestAnimationFrame(r))).then(() => {
        this._pillWait = null;
        this._fitPill();
      });
      return;
    }
    for (const t of this.shadowRoot?.querySelectorAll?.(".titles") || []) {
      const row = t.querySelector(":scope > .trow");
      const chip = row?.querySelector(":scope > #status");
      if (!chip?.getBoundingClientRect) continue;
      t.classList.remove("below", "pill-dot");
      const name = row.querySelector(":scope > .name");
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const title = name?.getClientRects().length ? textWidth(name) + gap : 0;
      const pill = chip.getBoundingClientRect().width;
      if (title + pill <= row.getBoundingClientRect().width) continue;
      t.classList.add("below");
      const r = t.getBoundingClientRect();
      const banner = t.closest(".banner");
      const box = banner?.getBoundingClientRect();
      const floor = banner?.querySelector(".rp-ground")?.getBoundingClientRect().top ?? box?.bottom;
      const tall = box && (r.bottom > floor + 0.5 || r.top < box.top - 0.5);
      if (tall || pill > r.width + 0.5) t.classList.add("pill-dot");
    }
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

  // The card's HTML, as a fragment to bind the listeners to before _commit puts it on the page: the first render
  // (and the unit tests, without a DOM) write it as innerHTML; the next ones patch the page in place (rpPatchChildren),
  // so a state update keeps every node that did not change. A kept node keeps its listeners; only the new nodes,
  // bound here, bring theirs.
  _paint(html) {
    const root = this.shadowRoot;
    const tpl = root.firstChild ? document.createElement("template") : null;
    if (!tpl?.content) {
      root.innerHTML = html;
      return root;
    }
    tpl.innerHTML = html;
    return tpl.content;
  }

  _commit(fragment) {
    if (fragment !== this.shadowRoot) rpPatchChildren(this.shadowRoot, fragment);
  }

  // What a subclass adds to the fragment before it goes on the page (the mini card's detail button).
  _decorate() {}

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

    const { head, status } = this._headParts();
    const root = this._paint(`
      <style>${this.constructor.CSS}</style>
      <ha-card lang="${this._lang()}">
        ${this._illustrated()
          ? this._banner(head, `<div class="trow">${this._nameLink()}<span id="status">${status}</span></div><div class="sub" title="${rpEsc(sub)}">${rpEsc(sub)}</div>`)
          : `<div class="header">
          ${this._headerIcon(head.cls)}
          <div class="titles">
            <div class="trow">${this._nameLink()}<span id="status">${status}</span></div>
            <div class="sub" title="${rpEsc(sub)}">${rpEsc(sub)}</div>
          </div>
        </div>`}

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
      </ha-card>`);

    // Sections collapse/expand
    // Header and domain links are not buttons/anchors: Enter and Space activate them from the keyboard too.
    const onKey = (el, action) => el.addEventListener("keydown", (e) => {
      if (e.target !== el || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      action(e);
    });
    root.querySelectorAll(".sec-header").forEach(h => {
      const toggle = () => this._setSection(h.dataset.id, !this._sectionOpen[h.dataset.id]);
      h.addEventListener("click", toggle);
      onKey(h, toggle);
    });

    // Switches
    for (const { id } of ReverseProxyCard.CONTROLS) {
      root.getElementById(id)?.addEventListener("click", () => this._onCtrl(id));
    }

    // Certificate renewal buttons
    root.querySelectorAll(".renew-btn").forEach(btn => {
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
    root.querySelectorAll(".domain-link").forEach(el => {
      const open = (e) => {
        e.stopPropagation();
        window.open(el.dataset.href, "_blank", "noopener,noreferrer");
      };
      el.addEventListener("click", open);
      onKey(el, open);
    });

    // Proxy rule enable/disable buttons
    root.querySelectorAll(".rule-btn").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        this._onRule(btn);
      });
    });

    this._decorate(root);
    this._commit(root);
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
