// ── DOM patching, outside clicks ─────────────────────────────────────────────
// "A click elsewhere" is caught on the pointer, not only on the click event: on iOS (Safari and the companion app)
// a tap on something that is not clickable (the background, an empty spot, a card with no action) sends no click to
// the page. The handler runs when the press and the release are both outside the card (a slider dragged out of the
// card does not count), and a scroll does not count (the browser cancels the pointer); keyboard clicks still go
// through the click event. The handler keeps its own checks (outside of the card, not in a dialog).
// The whole width of an element's text in its own font, an ellipsised one included.
export const textWidth = (el) => {
  const range = document.createRange();
  range.selectNodeContents(el);
  return range.getBoundingClientRect().width;
};

// Patch the shadow DOM in place from the new HTML (as ha-flight-board-card's morph): the nodes that did not change
// are kept (the illustration's SVG and its animations, the icons, the focus), only the changed text and
// attributes are written, so a state update never rebuilds the card nor changes its height for a frame (which
// made the dashboard scroll by itself). Nodes are matched by position when they are the same element with the same
// id and the same first class (their role): a node of another role is replaced, so the listener bound to a kept
// node is always the one of its role (the listeners read their data from the node when they run).
export const rpPatchAttrs = (cur, next) => {
  for (const { name } of [...cur.attributes]) if (!next.hasAttribute(name)) cur.removeAttribute(name);
  for (const { name, value } of next.attributes) if (cur.getAttribute(name) !== value) cur.setAttribute(name, value);
};
export const rpRole = (n) => `${n.id || ""}|${n.getAttribute("class")?.trim().split(/\s+/)[0] || ""}`;
export const rpSameNode = (a, b) => !!a && a.nodeType === b.nodeType && a.nodeName === b.nodeName && (a.nodeType !== 1 || rpRole(a) === rpRole(b));
export const rpPatchChildren = (cur, next) => {
  const old = [...cur.childNodes];
  const fresh = [...next.childNodes];
  fresh.forEach((n, i) => {
    const o = old[i];
    if (!rpSameNode(o, n)) {
      if (o) cur.replaceChild(n, o);
      else cur.appendChild(n);
      return;
    }
    if (n.nodeType === 1) {
      rpPatchAttrs(o, n);
      rpPatchChildren(o, n);
    } else if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue;
  });
  while (cur.childNodes.length > fresh.length) cur.removeChild(cur.lastChild);
};

export const watchOutside = (card, handler) => {
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
