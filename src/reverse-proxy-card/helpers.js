// ── Helpers ──────────────────────────────────────────────────────────────────
// Escapes a value interpolated into innerHTML, as text or inside a quoted attribute (as parcelEsc in ha-parcel).
export function rpEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

// Only http(s) URLs become links: anything else (javascript:, data:…) is dropped.
export function rpSafeUrl(url) {
  const value = String(url || "").trim();
  return /^https?:\/\//i.test(value) ? value : "";
}

// Night picture: forced by `illustration_theme`, else Home Assistant's dark mode alone (a light theme keeps the day
// picture after sunset).
export function rpIsNight(hass, config) {
  const theme = config?.illustration_theme;
  if (theme === "night") return true;
  if (theme === "day") return false;
  return !!hass?.themes?.darkMode;
}
