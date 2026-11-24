// ── Illustration and banner ──────────────────────────────────────────────────
// The header's illustration, on the right of the banner: the Internet (a globe) → the reverse proxy (with its
// certificate padlock) → three backend servers. `st` is the proxy's state: "ok" (running, every upstream up: green
// links with packets flowing), "down" (running, `down` upstreams down: their links dashed red, their LED red),
// "off" (stopped: red proxy, no traffic) or "idle" (unavailable: all grey). `cert` tints the padlock (ok, warn, crit).
// The picture has no ids, so several cards on a page never clash.
export const RP_SERVERS = [
  [184, 18],
  [184, 40],
  [184, 62],
];
export function rpSceneSvg({ st, down = 0, cert = "ok" }) {
  const live = st === "ok" || st === "down";
  const bad = st === "down" ? Math.min(Math.max(down, 1), 2) : 0;
  const gw = st === "off" ? "crit" : live ? "ok" : "idle";
  const servers = RP_SERVERS.map(([x, y], i) => {
    const up = live && i < RP_SERVERS.length - bad;
    const cls = !live ? "off" : up ? "ok" : "crit";
    const d = `M148 40 Q164 40 ${x - 10} ${y}`;
    const packet = up ? `<circle class="rp-pk" r="1.6" style="offset-path:path('${d}');animation-delay:-${(i * 0.6).toFixed(1)}s"/>` : "";
    return `<path class="rp-link ${cls}" d="${d}"/>${packet}<rect class="rp-srv" x="${x - 10}" y="${y - 7}" width="20" height="14" rx="2"/><circle class="rp-led ${cls}" cx="${x - 5}" cy="${y}" r="1.3"/><path class="rp-slot" d="M${x - 1} ${y}h6"/>`;
  }).join("");
  return `<svg class="rp-scene ${st}" viewBox="89 6 110 68" preserveAspectRatio="xMaxYMax meet" aria-hidden="true">
    <g transform="translate(104 40)"><circle class="rp-globe" r="12"/><path class="rp-meridian" d="M-12 0H12M0-12Q8 0 0 12Q-8 0 0-12"/></g>
    <path class="rp-in${live ? "" : " off"}" d="M116 40H132"/>${live ? `<circle class="rp-pk in" r="1.6" style="offset-path:path('M116 40 H132')"/>` : ""}
    ${servers}
    <g transform="translate(140 40)"><rect class="rp-gw ${gw}" x="-8" y="-16" width="16" height="32" rx="3"/><path class="rp-vent" d="M-4 -6h8M-4 0h8M-4 6h8"/></g>
    <g class="rp-lock ${live ? cert : "idle"}" transform="translate(140 18)"><rect x="-4" y="-2" width="8" height="6" rx="1"/><path d="M-2.6 -2v-2a2.6 2.6 0 0 1 5.2 0v2"/></g>
  </svg>`;
}

// The banner: a server-room background, the illustration on the right and a 10 px "network" strip edge to edge at
// the bottom (a patch panel: ports and link LEDs), day and night.
export const RP_BANNER_CSS = `
  .banner { position: relative; overflow: hidden; height: 90px; --rp-scene-w: 129px; --rp-scene-r: 0px;
            background: #e3e8ef; color: #0d2a45; }
  .banner.night { background: #161c28; color: #fff; }
  .banner.zoomable { --rp-scene-r: 30px; }
  .rp-scene { position: absolute; right: var(--rp-scene-r); bottom: 10px; height: 80px; width: var(--rp-scene-w); overflow: visible; }
  .rp-ground { position: absolute; left: 0; right: 0; bottom: 0; height: 10px; box-shadow: inset 0 2px 0 #b5bbc2;
               background:
                 repeating-linear-gradient(90deg, transparent 0 7px, #43c463 7px 8px, transparent 8px 54px) 0 3px / 100% 1px no-repeat,
                 repeating-linear-gradient(90deg, transparent 0 6px, #6f7780 6px 12px, transparent 12px 18px) 0 4px / 100% 4px no-repeat,
                 #9aa1a9; }
  .night .rp-ground { box-shadow: inset 0 2px 0 #3a414c;
                      background:
                        repeating-linear-gradient(90deg, transparent 0 7px, #2fa24f 7px 8px, transparent 8px 54px) 0 3px / 100% 1px no-repeat,
                        repeating-linear-gradient(90deg, transparent 0 6px, #1c2027 6px 12px, transparent 12px 18px) 0 4px / 100% 4px no-repeat,
                        #2c323b; }
  .banner .header { position: absolute; left: 0; top: 0; bottom: 10px; right: calc(var(--rp-scene-w) + var(--rp-scene-r) + 4px);
                    padding: 0 4px 0 12px; box-sizing: border-box; }
  .banner .titles { gap: 2px; }
  .banner .name { color: inherit; }
  .banner .sub { color: #3b5b78; }
  .banner.night .sub { color: rgba(255,255,255,.78); }
  .banner .logo { background: rgba(255,255,255,.62); box-shadow: inset 0 0 0 1px rgba(47,128,237,.18); }
  .banner.night .logo { background: rgba(255,255,255,.12); box-shadow: inset 0 0 0 1px rgba(255,255,255,.14); }
  .banner .logo .badge { box-shadow: 0 0 0 1px rgba(13,42,69,.16), 0 1px 3px rgba(13,42,69,.18); }
  .banner .chip .dot { background: var(--c, var(--zx-ok)); }
  /* The status pill (#status) on the title row, right after the title, in the colour of the icon (see .trow). */
  .banner #status .chip { min-width: 0; max-width: 100%; box-sizing: border-box; overflow: hidden; }
  .banner #status .ct { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .banner .chip { background: color-mix(in srgb, var(--c, var(--zx-ok)) 18%, rgba(255,255,255,.78)); color: color-mix(in srgb, var(--c, var(--zx-ok)) 45%, #0d2a45); }
  .banner.night .chip { background: color-mix(in srgb, var(--c, var(--zx-ok)) 30%, rgba(8,18,38,.55)); color: color-mix(in srgb, var(--c, var(--zx-ok)) 35%, #ffffff); }
  /* The mini card's detail button: a 24 px frosted round in the banner's top right corner. */
  .banner .zoom { position: absolute; z-index: 2; top: 5px; right: 5px; margin: 0; color: #33506b; background: rgba(255,255,255,.55);
                  box-shadow: inset 0 0 0 1px rgba(255,255,255,.7); backdrop-filter: blur(4px); }
  .banner .zoom:hover { background: rgba(255,255,255,.75); color: #33506b; }
  .banner.night .zoom { color: #fff; background: rgba(255,255,255,.12); box-shadow: inset 0 0 0 1px rgba(255,255,255,.2); }
  .banner.night .zoom:hover { background: rgba(255,255,255,.22); color: #fff; }
  .banner + .content { padding-top: 12px; }
  .rp-globe { fill: #dbeafe; stroke: #2f80ed; } .night .rp-globe { fill: #1d3a5e; }
  .rp-meridian { fill: none; stroke: #2f80ed; stroke-width: 1; }
  .rp-scene.idle .rp-globe, .rp-scene.idle .rp-meridian { stroke: #9aa3ae; } .rp-scene.idle .rp-globe { fill: #eef1f4; }
  .night .rp-scene.idle .rp-globe { fill: #2a3038; }
  .rp-gw { fill: #fff; stroke-width: 1.6; } .night .rp-gw { fill: #3d475c; }
  .rp-gw.ok { stroke: #43a047; } .rp-gw.crit { stroke: #e5484d; } .rp-gw.idle { stroke: #9aa3ae; }
  .rp-vent { stroke: #9aa3ae; }
  .rp-in { stroke: #2f80ed; stroke-width: 1.4; } .rp-in.off { stroke: #9aa3ae; stroke-dasharray: 2 2; }
  .rp-link { fill: none; stroke-width: 1.2; } .rp-link.ok { stroke: #43a047; }
  .rp-link.crit { stroke: #e5484d; stroke-dasharray: 2 2; } .rp-link.off { stroke: #9aa3ae; stroke-dasharray: 2 2; }
  .rp-srv { fill: #2a3038; } .night .rp-srv { stroke: #3d4757; stroke-width: .6; }
  .rp-slot { stroke: #5c6678; stroke-width: 1.4; stroke-linecap: round; }
  .rp-led.ok { fill: #43c463; } .rp-led.crit { fill: #e5484d; } .rp-led.off { fill: #5c6678; }
  .rp-led.ok, .rp-led.crit { animation: rp-blink 1.2s steps(2) infinite; }
  .rp-pk { fill: #43a047; animation: rp-pk 2s linear infinite; } .rp-pk.in { fill: #2f80ed; animation-duration: 1.2s; }
  .rp-lock { --lc: #43a047; } .rp-lock.warn { --lc: #f5a623; } .rp-lock.crit { --lc: #e5484d; } .rp-lock.idle { --lc: #9aa3ae; }
  .rp-lock rect { fill: var(--lc); } .rp-lock path { fill: none; stroke: var(--lc); }
  @keyframes rp-pk { from { offset-distance: 0%; opacity: 0; } 15%, 85% { opacity: 1; } to { offset-distance: 100%; opacity: 0; } }
  @keyframes rp-blink { 50% { opacity: .25; } }
  /* Narrow card: no room for the picture beside the title, the background and the strip stay. */
  @container (max-width: 300px) {
    .rp-scene { display: none; }
    .banner .header { right: var(--rp-scene-r); }
  }
`;
