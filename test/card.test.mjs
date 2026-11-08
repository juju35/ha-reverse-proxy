// Unit tests for the card: the card file is evaluated with stubs, no browser needed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(
  new URL('../custom_components/zoraxy/frontend/zoraxy-card.js', import.meta.url),
  'utf8',
);
const context = {
  HTMLElement: class {
    attachShadow() {
      this.shadowRoot = {
        innerHTML: '',
        querySelector: () => null,
        querySelectorAll: () => [],
        getElementById: () => null,
        addEventListener() {},
      };
      return this.shadowRoot;
    }
  },
  // get() returning true: the define() calls at the bottom of the file are skipped.
  customElements: { get: () => true, define() {} },
  window: { customCards: [] },
  document: { createElement: () => ({}), addEventListener() {}, removeEventListener() {} },
  navigator: { language: 'en' },
  CustomEvent: class {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  },
  console,
  Date,
  Infinity,
  setTimeout,
  clearTimeout,
};
vm.createContext(context);
vm.runInContext(
  `${source}\nthis.zx = { ZoraxyCard, ZoraxyMiniCard, ZoraxyCardEditor, ZoraxyMiniCardEditor, zoraxyEsc, zoraxySafeUrl, ZORAXY_CARD_VERSION };`,
  context,
);
const { ZoraxyCard, ZoraxyMiniCard, ZoraxyCardEditor, ZoraxyMiniCardEditor, zoraxyEsc, zoraxySafeUrl, ZORAXY_CARD_VERSION } = context.zx;

const PREFIX = 'zoraxy_reverse_proxy_zoraxy';
const isoInDays = (n) => new Date(Date.now() + n * 86400000 + 3600000).toISOString();

// A card wired to a fake hass, enough for the HTML builders.
function makeCard(states = {}, Cls = ZoraxyCard, config = {}) {
  const card = new Cls();
  card._config = config;
  card._hass = { states, locale: { language: 'en' }, entities: undefined };
  return card;
}

test('zoraxyEsc escapes HTML and attribute characters', () => {
  assert.equal(zoraxyEsc(`<img src=x onerror="a">&'`), '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;');
  assert.equal(zoraxyEsc(null), '');
  assert.equal(zoraxyEsc(0), '0');
});

test('zoraxySafeUrl only keeps http(s) URLs', () => {
  assert.equal(zoraxySafeUrl('https://zoraxy.local:8000'), 'https://zoraxy.local:8000');
  assert.equal(zoraxySafeUrl('  http://a '), 'http://a');
  assert.equal(zoraxySafeUrl('javascript:alert(1)'), '');
  assert.equal(zoraxySafeUrl('data:text/html,x'), '');
  assert.equal(zoraxySafeUrl(undefined), '');
});

test('card version is the manifest version', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../custom_components/zoraxy/manifest.json', import.meta.url), 'utf8'),
  );
  assert.equal(ZORAXY_CARD_VERSION, manifest.version);
});

test('I18N locales all carry the same keys', () => {
  const langs = Object.keys(ZoraxyCard.I18N);
  for (const lang of ['en', 'fr', 'de', 'es', 'sr', 'sr-Latn', 'it', 'nl', 'pt', 'pl', 'ro', 'da', 'sv', 'bg', 'ru', 'uk', 'hu', 'sk', 'cs', 'sl', 'lv', 'el']) assert.ok(langs.includes(lang), `missing ${lang}`);
  const reference = Object.keys(ZoraxyCard.I18N.en).sort();
  for (const lang of langs) {
    assert.deepEqual(Object.keys(ZoraxyCard.I18N[lang]).sort(), reference, `keys of ${lang}`);
  }
});

test('I18N parity: every language has exactly the English keys and placeholders, none empty', () => {
  const en = ZoraxyCard.I18N.en;
  const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
  for (const lang of ['fr', 'de', 'es', 'sr', 'sr-Latn', 'it', 'nl', 'pt', 'pl', 'ro', 'da', 'sv', 'bg', 'ru', 'uk', 'hu', 'sk', 'cs', 'sl', 'lv', 'el']) {
    const strings = ZoraxyCard.I18N[lang];
    assert.ok(strings, `missing ${lang}`);
    assert.deepEqual(Object.keys(strings).sort(), Object.keys(en).sort(), `${lang}: keys`);
    for (const key of Object.keys(en)) {
      assert.equal(typeof strings[key], typeof en[key], `${lang}.${key}: type`);
      if (Array.isArray(en[key])) assert.equal(strings[key].length, en[key].length, `${lang}.${key}: length`);
      assert.equal(placeholders(String(strings[key])), placeholders(String(en[key])), `${lang}.${key}: placeholders`);
      assert.ok(String(strings[key]).trim(), `${lang}.${key}: empty`);
    }
  }
});

test('I18N Serbian: the Cyrillic and Latin cards say the same thing, letter for letter', () => {
  const cyr = 'абвгдђежзијклљмнњопрстћуфхцчџш';
  const lat = ['a', 'b', 'v', 'g', 'd', 'đ', 'e', 'ž', 'z', 'i', 'j', 'k', 'l', 'lj', 'm', 'n', 'nj', 'o', 'p', 'r', 's', 't', 'ć', 'u', 'f', 'h', 'c', 'č', 'dž', 'š'];
  const map = new Map();
  [...cyr].forEach((c, i) => {
    map.set(c, lat[i]);
    map.set(c.toUpperCase(), lat[i][0].toUpperCase() + lat[i].slice(1));
  });
  for (const [key, text] of Object.entries(ZoraxyCard.I18N.sr)) {
    assert.equal([...text].map((c) => map.get(c) ?? c).join(''), ZoraxyCard.I18N['sr-Latn'][key], key);
  }
});

test('I18N Serbian: no Latin letter in sr, no Cyrillic letter in sr-Latn (names and acronyms aside)', () => {
  const kept = /Zoraxy|HTTPS|HTTP|ACME|URL|Home Assistant|zoraxy_reverse_proxy_zoraxy|\{\w+\}/g;
  for (const [key, text] of Object.entries(ZoraxyCard.I18N.sr)) {
    assert.ok(!/[A-Za-z]/.test(text.replace(kept, '')), `sr.${key}: ${text}`);
  }
  for (const [key, text] of Object.entries(ZoraxyCard.I18N['sr-Latn'])) {
    assert.ok(!/[Ѐ-ӿ]/.test(text), `sr-Latn.${key}: ${text}`);
  }
});

test('langOf: full locale, then the part before the dash, then English', () => {
  assert.equal(ZoraxyCard.langOf('fr-FR'), 'fr');
  assert.equal(ZoraxyCard.langOf('sr-Latn'), 'sr-Latn');
  assert.equal(ZoraxyCard.langOf('sr'), 'sr');
  assert.equal(ZoraxyCard.langOf('sr-Cyrl'), 'sr');
  assert.equal(ZoraxyCard.langOf('ja'), 'en');
  assert.equal(ZoraxyCard.langOf('it-IT'), 'it');
  assert.equal(ZoraxyCard.langOf('nl-BE'), 'nl');
  assert.equal(ZoraxyCard.langOf('pt'), 'pt');
  // Brazilian Portuguese falls back to European Portuguese, the only Portuguese the card has.
  assert.equal(ZoraxyCard.langOf('pt-BR'), 'pt');
  assert.equal(ZoraxyCard.langOf('pl-PL'), 'pl');
  for (const lang of ['ro', 'da', 'sv', 'bg', 'ru', 'uk', 'hu', 'sk', 'cs', 'sl', 'lv', 'el']) {
    assert.equal(ZoraxyCard.langOf(lang), lang);
    assert.equal(ZoraxyCard.langOf(`${lang}-${lang.toUpperCase()}`), lang);
  }
  assert.equal(ZoraxyCard.langOf('sv-FI'), 'sv');
  assert.equal(ZoraxyCard.langOf(undefined), 'en');
  // Home Assistant in sr-Latn picks the Latin script, unless the card option says otherwise.
  assert.equal(ZoraxyCard.langOfHass({ locale: { language: 'sr-Latn' }, language: 'sr-Latn' }), 'sr-Latn');
  assert.equal(ZoraxyCard.langOfHass({ language: 'sr-Latn' }), 'sr-Latn');
  assert.equal(ZoraxyCard.langOfHass({ locale: { language: 'sr-Latn' } }, { language: 'sr' }), 'sr');
  const card = makeCard();
  card._hass.locale.language = 'sr-Latn';
  assert.equal(card._t('certsSection'), 'Sertifikati');
  card._hass.locale.language = 'sr';
  assert.equal(card._t('certsSection'), 'Сертификати');
});

test('every I18N key is read by the card or an editor', () => {
  // Source outside the I18N table: keys passed to _t() / t() as string literals.
  const code = source.replace(/static I18N = \{[\s\S]*?\n {2}\};\n/, '');
  const used = new Set();
  for (const call of code.matchAll(/\b_?t\(([^()]*)\)/g)) {
    for (const lit of call[1].matchAll(/["']([A-Za-z0-9_]+)["']/g)) used.add(lit[1]);
  }
  // The control tiles name their label and confirmation keys in ZoraxyCard.CONTROLS.
  for (const c of ZoraxyCard.CONTROLS) for (const key of [c.label, c.confirm].filter(Boolean)) used.add(key);
  // Editor labels are built as ed_<field> and ed_<field>_helper.
  const fields = new Set(
    [ZoraxyCardEditor, ZoraxyMiniCardEditor].flatMap((E) => E.schema(() => '').map((f) => f.name)),
  );
  const unused = Object.keys(ZoraxyCard.I18N.en).filter((key) => {
    const ed = key.match(/^ed_(.+?)(_helper)?$/);
    return ed ? !fields.has(ed[1]) : !used.has(key);
  });
  assert.deepEqual(unused, []);
});

test('_t falls back to English, then to the key', () => {
  const card = makeCard();
  card._hass.locale.language = 'ja';
  assert.equal(card._t('rules'), ZoraxyCard.I18N.en.rules);
  assert.equal(card._t('no_such_key'), 'no_such_key');
  card._hass.locale.language = 'fr-CA';
  assert.equal(card._t('rules'), ZoraxyCard.I18N.fr.rules);
  card._hass.locale.language = 'de-AT';
  assert.equal(card._t('rules'), ZoraxyCard.I18N.de.rules);
  card._hass.locale.language = 'es-419';
  assert.equal(card._t('rules'), ZoraxyCard.I18N.es.rules);
});

test('setConfig validates the option types', () => {
  const card = new ZoraxyCard();
  assert.throws(() => card.setConfig(null), /Invalid configuration/);
  assert.throws(() => card.setConfig({ zoraxy_url: 42 }), /zoraxy_url/);
  assert.throws(() => card.setConfig({ entity_prefix: {} }), /entity_prefix/);
  card.setConfig({ zoraxy_url: 'http://zoraxy.local:8000' });
  assert.equal(card._prefix(), PREFIX);
  card.setConfig({ entity_prefix: 'zoraxy_b' });
  assert.equal(card._prefix(), 'zoraxy_b');
  const mini = new ZoraxyMiniCard();
  assert.throws(() => mini.setConfig({ zoom: 'yes' }), /zoom/);
});

test('_daysUntil handles unknown and invalid dates', () => {
  const card = makeCard();
  assert.equal(card._daysUntil(null), null);
  assert.equal(card._daysUntil('unavailable'), null);
  assert.equal(card._daysUntil('unknown'), null);
  assert.equal(card._daysUntil('garbage'), null);
  assert.equal(card._daysUntil(isoInDays(3)), 3);
  assert.equal(card._daysUntil(isoInDays(-2)), -2);
});

test('_buildRules links plain domains but not wildcard ones', () => {
  const card = makeCard();
  const html = card._buildRules([
    { domain: 'app.example.org', target: '10.0.0.2:80', enabled: true },
    { domain: '*.example.org', target: '10.0.0.3:80', enabled: false },
  ]);
  assert.match(html, /data-href="https:\/\/app\.example\.org"/);
  assert.ok(!html.includes('data-href="https://*.example.org"'), 'wildcard domain must not be a link');
  const wildcardRow = html.split('<div class="row">').find((part) => part.includes('*.example.org'));
  assert.ok(!wildcardRow.includes('domain-link'), 'wildcard domain must not look clickable');
});

test('_buildRules escapes hostile values and says when there is nothing', () => {
  const card = makeCard();
  const html = card._buildRules([{ domain: '<img src=x>', target: '"><script>', enabled: true }]);
  assert.ok(!html.includes('<img'), 'domain must be escaped');
  assert.ok(!html.includes('<script'), 'target must be escaped');
  assert.equal(card._buildRules([]), `<p class="empty">${ZoraxyCard.I18N.en.noRules}</p>`);
});

test('mini chips sort unknown-expiry certificates last', () => {
  const states = {
    [`sensor.${PREFIX}_regles_proxy`]: { state: '5', attributes: {} },
    [`sensor.${PREFIX}_regles_actives`]: { state: '4', attributes: {} },
    [`sensor.${PREFIX}_certificats_tls`]: { state: '3', attributes: {} },
    [`sensor.${PREFIX}_port_entrant`]: { state: '443', attributes: {} },
    [`binary_sensor.${PREFIX}_redirection_https`]: { state: 'on', attributes: {} },
    [`binary_sensor.${PREFIX}_mode_developpement`]: { state: 'off', attributes: {} },
    // soon.example expires first, later.example after; nodate.example has no readable date
    // but its "expiring" binary sensor is on: it must come last, not first.
    [`sensor.${PREFIX}_cert_soon_example`]: { state: isoInDays(3), attributes: { domain: 'soon.example' } },
    [`sensor.${PREFIX}_cert_later_example`]: { state: isoInDays(10), attributes: { domain: 'later.example' } },
    [`sensor.${PREFIX}_cert_nodate_example`]: { state: 'unknown', attributes: { domain: 'nodate.example' } },
    [`binary_sensor.${PREFIX}_cert_expirant_nodate_example`]: { state: 'on', attributes: {} },
  };
  const html = makeCard(states, ZoraxyMiniCard)._miniChips();
  const order = ['soon.example', 'later.example', 'nodate.example'].map((d) => html.indexOf(d));
  assert.ok(order.every((i) => i >= 0), 'every expiring certificate gets a chip');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'closest expiry first, unknown last');
});

test('the mini card editor adds zoom to the full editor schema', () => {
  const base = ZoraxyCardEditor.SCHEMA.map((f) => f.name);
  const mini = ZoraxyMiniCardEditor.SCHEMA.map((f) => f.name);
  // joined: the vm realm's arrays are not deepStrictEqual to this realm's.
  assert.equal(mini.join(), [...base, 'zoom'].join());
  assert.equal(ZoraxyMiniCardEditor.DEFAULTS.zoom, true);
});

test('mini chips show a dash, not the raw state, for unknown or unavailable values', () => {
  const states = {
    [`sensor.${PREFIX}_regles_proxy`]: { state: 'unavailable', attributes: {} },
    [`sensor.${PREFIX}_regles_actives`]: { state: 'unavailable', attributes: {} },
    [`sensor.${PREFIX}_certificats_tls`]: { state: '2', attributes: {} },
    [`sensor.${PREFIX}_port_entrant`]: { state: 'unknown', attributes: {} },
  };
  const html = makeCard(states, ZoraxyMiniCard)._miniChips();
  assert.ok(!/unknown|unavailable/.test(html), html);
  assert.match(html, /Port –/);
  assert.match(html, /–\/– rules/);
  assert.match(html, /2 certs/);
});

test('the card and the editors resolve the language the same way', () => {
  assert.equal(ZoraxyCard.langOfHass({ locale: { language: 'de-AT' }, language: 'fr' }), 'de');
  assert.equal(ZoraxyCard.langOfHass({ language: 'fr' }), 'fr');
  assert.equal(ZoraxyCard.langOfHass(undefined), 'en');
});

test('the language option wins over the Home Assistant language', () => {
  const card = makeCard({}, ZoraxyCard, { language: 'es' });
  card._hass.locale.language = 'fr';
  assert.equal(card._lang(), 'es');
  assert.equal(card._t('certsSection'), 'Certificados');
  card._config = { language: '' };
  assert.equal(card._lang(), 'fr');
  assert.equal(ZoraxyCard.langOfHass({ language: 'fr' }, { language: 'de' }), 'de');
  assert.throws(() => new ZoraxyCard().setConfig({ language: 3 }), /language must be a string/);
});

test('the editors offer the language picker, labelled in the picked language', () => {
  for (const Editor of [ZoraxyCardEditor, ZoraxyMiniCardEditor]) {
    const editor = new Editor();
    editor.appendChild = () => {};
    context.document.createElement = () => ({ addEventListener() {} });
    editor._hass = { locale: { language: 'en' } };
    editor.setConfig({ language: 'de' });
    const names = editor._form.schema.map((f) => f.name);
    assert.equal(names.at(-1), 'language');
    const picker = editor._form.schema.at(-1).selector.select.options;
    assert.deepEqual([...picker.map((o) => o.value)], [
      '', 'en', 'fr', 'de', 'es', 'sr', 'sr-Latn', 'it', 'nl', 'pt', 'pl',
      'ro', 'da', 'sv', 'bg', 'ru', 'uk', 'hu', 'sk', 'cs', 'sl', 'lv', 'el',
    ]);
    assert.deepEqual(
      ['it', 'nl', 'pt', 'pl'].map((v) => picker.find((o) => o.value === v).label),
      ['Italiano', 'Nederlands', 'Português (Portugal)', 'Polski'],
    );
    assert.deepEqual(
      ['ro', 'da', 'sv', 'bg', 'ru', 'uk', 'hu', 'sk', 'cs', 'sl', 'lv', 'el'].map((v) => picker.find((o) => o.value === v).label),
      ['Română', 'Dansk', 'Svenska', 'Български', 'Русский', 'Українська', 'Magyar', 'Slovenčina', 'Čeština', 'Slovenščina', 'Latviešu', 'Ελληνικά'],
    );
    assert.equal(picker.find((o) => o.value === 'sr').label, 'Српски');
    assert.equal(picker.find((o) => o.value === 'sr-Latn').label, 'Srpski (latinica)');
    assert.equal(picker[0].label, ZoraxyCard.I18N.de.lang_auto);
    assert.equal(editor._form.computeLabel({ name: 'language' }), 'Sprache');
    editor.setConfig({});
    assert.equal(editor._form.computeLabel({ name: 'language' }), 'Language');
    let sent;
    editor.dispatchEvent = (ev) => { sent = ev.detail.config; };
    editor._valueChanged({ stopPropagation() {}, detail: { value: { zoraxy_url: 'http://z', language: '' } } });
    assert.deepEqual({ ...sent }, { zoraxy_url: 'http://z' });
  }
});

test('French control labels are translated', () => {
  assert.equal(ZoraxyCard.I18N.fr.httpsRedirect, 'Redirection HTTPS');
  assert.equal(ZoraxyCard.I18N.fr.devMode, 'Mode dev');
});

// ── Colour contrast of the state-coloured text (WCAG 2.x) ─────────────────────
// A tiny evaluator for the colour syntax the card uses: hex, transparent, var() with fallback and
// color-mix(in srgb, …). The themes are Home Assistant's default light and dark palettes.
const THEMES = {
  light: {
    '--primary-text-color': '#212121', '--secondary-text-color': '#727272', '--card-background-color': '#ffffff',
    '--secondary-background-color': '#e5e5e5', '--primary-color': '#03a9f4',
    '--success-color': '#43a047', '--warning-color': '#ffa600', '--error-color': '#db4437',
  },
  dark: {
    '--primary-text-color': '#e1e1e1', '--secondary-text-color': '#9b9b9b', '--card-background-color': '#1c1c1c',
    '--secondary-background-color': '#282828', '--primary-color': '#03a9f4',
    '--success-color': '#43a047', '--warning-color': '#ffa600', '--error-color': '#db4437',
  },
};
const STATE_VARS = { ok: 'var(--zx-ok)', warn: 'var(--zx-warn)', crit: 'var(--zx-crit)', idle: 'var(--secondary-text-color)' };

function splitTop(s, sep = ',') {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === sep && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// → [r, g, b, a] with r, g, b in 0..255 (not premultiplied).
function evalColor(expr, vars) {
  const e = expr.trim();
  if (e === 'transparent') return [0, 0, 0, 0];
  if (/^#[0-9a-f]{6}$/i.test(e)) return [1, 3, 5].map((i) => Number.parseInt(e.slice(i, i + 2), 16)).concat(1);
  let m = e.match(/^var\((--[\w-]+)\s*(?:,(.*))?\)$/s);
  if (m) {
    if (vars[m[1]] !== undefined) return evalColor(vars[m[1]], vars);
    if (m[2] === undefined) throw new Error(`undefined ${m[1]}`);
    return evalColor(m[2], vars);
  }
  m = e.match(/^color-mix\(in srgb,(.*)\)$/s);
  if (m) {
    const [a, b] = splitTop(m[1]).map((part) => {
      const pm = part.match(/^(.*?)\s+([\d.]+)%$/s);
      return pm ? { c: evalColor(pm[1], vars), p: Number(pm[2]) / 100 } : { c: evalColor(part, vars), p: null };
    });
    const pa = a.p ?? 1 - b.p;
    const pb = b.p ?? 1 - pa;
    // Premultiplied interpolation, as CSS Color 5 specifies.
    const alpha = a.c[3] * pa + b.c[3] * pb;
    const rgb = [0, 1, 2].map((i) => (alpha ? (a.c[i] * a.c[3] * pa + b.c[i] * b.c[3] * pb) / alpha : 0));
    return [...rgb, alpha];
  }
  throw new Error(`cannot evaluate ${e}`);
}

const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
const luminance = (c) =>
  c.slice(0, 3).reduce((sum, v, i) => {
    const s = v / 255;
    const lin = s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    return sum + lin * [0.2126, 0.7152, 0.0722][i];
  }, 0);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// The declaration `prop` of the rule whose selector list contains exactly `selector`.
function decl(css, selector, prop) {
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(',').map((s) => s.trim()).includes(selector)) continue;
    const d = m[2].split(';').map((s) => s.trim()).find((s) => s.startsWith(`${prop}:`));
    if (d) return d.slice(prop.length + 1).trim();
  }
  return undefined;
}

function cardVars(theme, state) {
  const vars = { ...THEMES[theme] };
  for (const [k, v] of Object.entries({
    '--zx-accent': 'var(--primary-color, #03a9f4)', '--zx-ok': 'var(--success-color, #43a047)',
    '--zx-warn': 'var(--warning-color, #ffa600)', '--zx-crit': 'var(--error-color, #db4437)',
  })) vars[k] = v;
  if (state !== 'none') vars['--c'] = STATE_VARS[state];
  return vars;
}

// [css, text selector, background selector (null: the card itself), states]
const TEXT_ON_STATE = [
  ['card', '.chip', '.chip', ['ok', 'warn', 'crit']],
  ['card', '.icon-btn.rule-btn', '.icon-btn.rule-btn', ['ok', 'crit']],
  ['card', '.cs', '.ctrl', ['ok', 'idle']],
  ['mini', '.r.pill', '.r.pill', ['ok', 'warn', 'crit']],
  // Edge cases: a chip without a state class (its colour falls back to --zx-ok), and the hovered pills.
  ['card', '.chip', '.chip', ['none']],
  ['card', '.icon-btn.rule-btn', '.icon-btn.rule-btn:hover', ['ok', 'crit']],
  ['mini', '.r.pill', '.r.pill:hover', ['ok', 'warn', 'crit']],
  // The confirmation's main button (its --c is set by the rule itself, on the popup's card-coloured background).
  ['card', '.modal-actions .btn.primary', '.modal-actions .btn.primary', ['crit']],
];

function textContrast(cssName, textSel, bgSel, theme, state) {
  const css = cssName === 'card' ? ZoraxyCard.CSS : ZoraxyMiniCard.CSS;
  const vars = cardVars(theme, state);
  const card = evalColor('var(--card-background-color)', vars);
  const bgDecl = decl(css, bgSel, 'background');
  const bg = bgDecl ? over(evalColor(bgDecl, vars), card) : card;
  const fg = over(evalColor(decl(css, textSel, 'color'), vars), bg);
  return contrast(fg, bg);
}

test('state-coloured text reaches 4.5:1 in the light and dark themes', () => {
  const failures = [];
  for (const [cssName, textSel, bgSel, states] of TEXT_ON_STATE) {
    for (const theme of ['light', 'dark']) {
      for (const state of states) {
        const ratio = textContrast(cssName, textSel, bgSel, theme, state);
        if (ratio < 4.5) failures.push(`${textSel} ${state} ${theme}: ${ratio.toFixed(2)}:1`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('the dot and the icons keep the plain state colour', () => {
  assert.equal(decl(ZoraxyCard.CSS, '.dot', 'background'), 'var(--c, var(--zx-ok))');
  assert.equal(decl(ZoraxyCard.CSS, '.ctrl .icon', 'color'), 'var(--c, var(--secondary-text-color))');
  assert.equal(decl(ZoraxyMiniCard.CSS, '.r .icon', 'color'), 'var(--c)');
});

test('every transition is switched off under prefers-reduced-motion', () => {
  for (const raw of [ZoraxyCard.CSS, ZoraxyMiniCard.CSS]) {
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
    const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?\})\s*\}/);
    assert.ok(block, 'no prefers-reduced-motion media query');
    const reduced = [...block[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((m) => /transition:\s*none/.test(m[2]))
      .flatMap((m) => m[1].split(',').map((s) => s.trim()));
    const animated = [...css.replace(block[0], '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((m) => /(^|;)\s*(transition|animation)\s*:/.test(m[2]))
      .flatMap((m) => m[1].split(',').map((s) => s.trim()));
    assert.ok(animated.length > 0);
    assert.deepEqual(animated.filter((s) => !reduced.includes(s)), []);
  }
});

test('rule and generic rows give the full domain as a title, for the ellipsis', () => {
  const card = makeCard();
  const html = card._buildRules([
    { domain: 'photos.example.org', target: '192.168.1.20:2342', enabled: true },
    { domain: '*.example.org', target: '192.168.1.30:80', enabled: false },
  ]);
  assert.match(html, /class="row-label domain-link" title="photos\.example\.org"/);
  assert.match(html, /class="row-label" title="\*\.example\.org"/);
  assert.match(card._row(true, 'nas.example.org', ''), /class="row-label" title="nas\.example\.org"/);
});

// ── Review pass 9: narrow header, control labels, rule rows, confirmation, unavailable states ──────────────

// Every declaration of the rules whose selector list contains `selector`, inside `@container (max-width: …)`
// blocks when `container` is true, outside them otherwise.
// `container` may also be a width: only the `@container (max-width: <width>px)` blocks.
function rules(css, selector, container = false) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = [...clean.matchAll(/@container \(max-width: (\d+)px\)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)];
  const inside = blocks
    .filter((b) => typeof container !== 'number' || Number(b[1]) === container)
    .map((b) => b[2])
    .join('\n');
  const outside = blocks.reduce((rest, b) => rest.replace(b[0], ''), clean);
  const out = {};
  for (const m of (container ? inside : outside).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(',').map((s) => s.trim()).includes(selector)) continue;
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');
      if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    }
  }
  return out;
}

test('narrow header: the title keeps about four letters, the status pill gives way, the icon buttons never shrink', () => {
  for (const css of [ZoraxyCard.CSS, ZoraxyMiniCard.CSS]) {
    assert.equal(rules(css, 'ha-card')['container-type'], 'inline-size');
    // The title block takes what the pill leaves (zero basis): the pill is cut only when space really lacks.
    const titles = rules(css, '.titles');
    assert.equal(titles.flex, '1 1 0');
    assert.match(titles['min-width'], /^[4-6](\.\d+)?ch$/);
    const status = rules(css, '#status');
    assert.equal(status.flex, '0 1 auto');
    assert.equal(status['min-width'], '0');
    assert.equal(status['max-width'], undefined, 'no cap: "Active" is not cut at 245-500 px');
    const chip = rules(css, '.chip');
    assert.equal(chip['min-width'], '0');
    assert.equal(chip['max-width'], '100%');
    const text = rules(css, '.chip .ct');
    assert.equal(text['text-overflow'], 'ellipsis');
    assert.equal(text.overflow, 'hidden');
    // Under the threshold the pill shows its dot only, its text hidden visually but still read out.
    const narrow = rules(css, '#status .ct', true);
    assert.equal(narrow.position, 'absolute');
    assert.equal(narrow['clip-path'], 'inset(50%)');
    assert.notEqual(narrow.display, 'none');
  }
  const mini = ZoraxyMiniCard.CSS;
  const name = rules(mini, '.mini .name');
  assert.equal(name.flex, '1 1 0');
  assert.match(name['min-width'], /^[4-6](\.\d+)?ch$/);
  assert.equal(rules(mini, '.head #status').flex, undefined, 'the mini pill keeps the shrinkable flex of #status');
  assert.match(rules(mini, '.zoom').flex, /^none$/);
});

test('the mini card keeps the full card\'s 40 px logo; only a narrow card makes it smaller', () => {
  const mini = ZoraxyMiniCard.CSS;
  assert.equal(rules(mini, '.logo').width, '40px');
  assert.equal(rules(mini, '.mini .logo').width, undefined, 'no mini-only logo size');
  assert.equal(rules(mini, '.mini .logo').height, undefined, 'no mini-only logo size');
  assert.equal(rules(mini, '.mini .logo', 200).width, '28px', 'the narrow breakpoint still shrinks it');
});

test('the status pill carries its text as a title, and says unavailable rather than inactive', () => {
  const card = makeCard();
  assert.match(card._statusChip('on'), /class="chip ok" title="Active"><span class="dot"><\/span><span class="ct">Active<\/span>/);
  assert.match(card._statusChip('off'), /class="chip crit" title="Inactive"/);
  for (const state of ['unavailable', 'unknown', undefined]) {
    const html = card._statusChip(state);
    assert.match(html, /class="chip idle" title="Unavailable"/);
    assert.doesNotMatch(html, /Inactive/);
  }
  card._hass.locale.language = 'pl';
  assert.match(card._statusChip('unavailable'), /title="Niedostępny"/);
});

test('control tile labels break at a soft hyphen, never in the middle of a word', () => {
  assert.notEqual(rules(ZoraxyCard.CSS, '.cl')['overflow-wrap'], 'anywhere');
  // The label takes the free height: the On / Off lines of the three tiles line up.
  assert.equal(rules(ZoraxyCard.CSS, '.cl').flex, '1 0 auto');
  // A 245 px card leaves about 60 px of text per tile: 11 letters at 11 px. Longer words need a break point.
  for (const [lang, strings] of Object.entries(ZoraxyCard.I18N)) {
    for (const key of ['httpsRedirect', 'port80', 'devMode']) {
      for (const word of strings[key].split(/[\s-]/)) {
        const parts = word.split('­');
        assert.ok(parts.every((p) => [...p].length <= 11), `${lang}.${key}: "${word}" needs a soft hyphen`);
      }
    }
  }
  // The soft hyphen never shows in a single-line text (mini chip, tooltip).
  assert.equal(ZoraxyCard.I18N.it.httpsRedirect.replace('­', ''), 'Reindirizzamento HTTPS');
});

test('a rule row gives way on its target first, down to about four characters, before the domain', () => {
  const right = rules(ZoraxyCard.CSS, '.row-right:has(> .row-sub)');
  assert.equal(right.flex, '1 1 auto');
  assert.equal(right['min-width'], undefined, 'the row end keeps its automatic minimum (target 4ch + button)');
  const sub = rules(ZoraxyCard.CSS, '.row-sub');
  assert.equal(sub.width, '0');
  assert.equal(sub['flex-grow'], '1');
  assert.equal(sub['min-width'], '4ch');
  assert.equal(sub['max-width'], 'max-content');
  // The redirect code (→ 301) keeps its own width.
  const code = rules(ZoraxyCard.CSS, '.row-sub.row-code');
  assert.equal(code.width, 'auto');
  assert.equal(code['flex-grow'], '0');
});

// A card with the three controls and a fake callService recording the calls.
function controlCard(over = {}) {
  const states = {};
  for (const suffix of ['redirection_https', 'ecoute_port_80', 'mode_developpement']) {
    const on = suffix !== 'mode_developpement';
    states[`binary_sensor.${PREFIX}_${suffix}`] = { state: on ? 'on' : 'off', attributes: {} };
    states[`switch.${PREFIX}_${suffix}`] = { state: on ? 'on' : 'off', attributes: {} };
  }
  for (const [id, state] of Object.entries(over)) states[id] = { state, attributes: {} };
  const card = makeCard(states);
  card.calls = [];
  card._hass.callService = (domain, service, data) => {
    card.calls.push(`${domain}.${service} ${data.entity_id ?? `${data.domain}=${data.enable}`}`);
    return Promise.resolve();
  };
  return card;
}

test('turning port 80 off asks first; turning it on, and the other controls, act at once', () => {
  const card = controlCard();
  card._onCtrl('ctrl-port80');
  assert.deepEqual(card.calls, [], 'no call before the confirmation');
  assert.equal(card._confirm.text, ZoraxyCard.I18N.en.confirmPort80Off);
  assert.deepEqual({ ...card._confirm.from }, { id: 'ctrl-port80' });
  const { run } = card._confirm;
  card._closeConfirm();
  run();
  assert.deepEqual(card.calls, [`homeassistant.turn_off switch.${PREFIX}_ecoute_port_80`]);

  // Turning on, HTTPS redirect off and dev mode on: one click, no popup.
  const other = controlCard({ [`switch.${PREFIX}_ecoute_port_80`]: 'off', [`binary_sensor.${PREFIX}_ecoute_port_80`]: 'off' });
  for (const id of ['ctrl-port80', 'ctrl-https', 'ctrl-devmode']) other._onCtrl(id);
  assert.equal(other._confirm, undefined);
  assert.deepEqual(other.calls, [
    `homeassistant.turn_on switch.${PREFIX}_ecoute_port_80`,
    `homeassistant.turn_off switch.${PREFIX}_redirection_https`,
    `homeassistant.turn_on switch.${PREFIX}_mode_developpement`,
  ]);
});

test('the confirmed "turn port 80 off" never turns it on, even if it went off meanwhile (action frozen at the request)', () => {
  const card = controlCard();
  card._onCtrl('ctrl-port80');
  // An automation or the Zoraxy UI turns port 80 off while the popup is open.
  for (const id of [`switch.${PREFIX}_ecoute_port_80`, `binary_sensor.${PREFIX}_ecoute_port_80`]) {
    card._hass.states[id] = { state: 'off', attributes: {} };
  }
  const { run } = card._confirm;
  card._closeConfirm();
  run();
  assert.deepEqual(card.calls, [`homeassistant.turn_off switch.${PREFIX}_ecoute_port_80`]);
  assert.ok(!card.calls.some((c) => c.includes('turn_on')), 'never turn_on');
});

test('a direct control click sends the service decided at the click (turn_on / turn_off, never a re-read toggle)', async () => {
  const card = controlCard();
  card._onCtrl('ctrl-https');
  card._onCtrl('ctrl-devmode');
  // Even if the state flips before the call resolves, the decided service is kept.
  assert.deepEqual(card.calls, [
    `homeassistant.turn_off switch.${PREFIX}_redirection_https`,
    `homeassistant.turn_on switch.${PREFIX}_mode_developpement`,
  ]);
  // A failing call is only logged (HA shows the toast).
  card._hass.callService = () => Promise.reject(new Error('boom'));
  const warn = console.warn;
  console.warn = () => {};
  try {
    await card._setSwitch(`switch.${PREFIX}_redirection_https`, true);
  } finally {
    console.warn = warn;
  }
});

test('cancelling the confirmation does nothing, and a double click on its button does not act twice', () => {
  const card = controlCard();
  card._onCtrl('ctrl-port80');
  card._closeConfirm();
  assert.equal(card._confirm, null);
  // The second click of a double click lands on the tile under the popup: ignored.
  card._onCtrl('ctrl-port80');
  assert.equal(card._confirm, null);
  assert.deepEqual(card.calls, []);
  card._confirmClosedAt = Date.now() - ZoraxyCard.CONFIRM_GUARD_MS - 1;
  card._onCtrl('ctrl-port80');
  assert.ok(card._confirm, 'a later click asks again');
});

test('a click outside the card closes the confirmation without acting', () => {
  const card = controlCard();
  card._onCtrl('ctrl-port80');
  card.connectedCallback();
  card._onOutside({ composedPath: () => [] });
  assert.equal(card._confirm, null);
  assert.deepEqual(card.calls, []);
});

test('disabling a proxy rule asks first; enabling it acts at once', async () => {
  const card = controlCard();
  const btn = (domain, enabled) => ({ dataset: { ruleDomain: domain, ruleEnabled: String(enabled) }, disabled: false, focus() {} });
  const on = btn('nas.example.org', true);
  card.shadowRoot.querySelectorAll = (sel) => (sel === '.rule-btn' ? [on] : []);
  card._onRule(on);
  assert.deepEqual(card.calls, []);
  assert.equal(card._confirm.text, 'Disable the proxy rule for nas.example.org? The service will no longer be reachable through Zoraxy.');
  const { run } = card._confirm;
  card._closeConfirm();
  await run();
  assert.deepEqual(card.calls, ['zoraxy.toggle_proxy_rule nas.example.org=false']);
  clearTimeout(card._refreshTimer);

  card._confirmClosedAt = 0;
  card.calls = [];
  await card._onRule(btn('off.example.org', false));
  assert.equal(card._confirm, null);
  assert.deepEqual(card.calls, ['zoraxy.toggle_proxy_rule off.example.org=true']);
  clearTimeout(card._refreshTimer);
});

test('a rule toggle targets the card\'s instance and shows a failure in a toast', async () => {
  const card = registryCard();
  card._hass.devices = { dev1: { id: 'dev1', primary_config_entry: 'entry1', config_entries: ['entry1'] } };
  const sent = [];
  card._hass.callService = (domain, service, data, _target, notify) => {
    sent.push({ domain, service, data: { ...data }, notify });
    return Promise.resolve();
  };
  const btn = { dataset: {}, disabled: false };
  await card._toggleRule('app.proxy_one.org', false, btn);
  clearTimeout(card._refreshTimer);
  assert.deepEqual(sent[0].data, { domain: 'app.proxy_one.org', enable: true, config_entry_id: 'entry1' });
  assert.equal(sent[0].notify, false, 'the card shows the error, not a second toast');

  const toasts = [];
  card.dispatchEvent = (ev) => toasts.push(ev);
  card._render = () => {};
  card._hass.callService = () => Promise.reject(new Error('Zoraxy: could not change the rule'));
  const error = console.error;
  console.error = () => assert.fail('no console.error');
  try {
    await card._toggleRule('app.proxy_one.org', false, btn);
  } finally {
    console.error = error;
  }
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].type, 'hass-notification');
  assert.equal(toasts[0].detail.message, 'Zoraxy: could not change the rule');
  assert.equal(btn.disabled, false);
});

test('non-admin users see the rules\' state on disabled buttons and cannot toggle them', () => {
  const card = registryCard();
  card._sectionOpen.rules = true;
  card._render();
  assert.match(card.shadowRoot.innerHTML, /class="icon-btn rule-btn[^"]*"[^>]*title=/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /rule-btn[^>]*\sdisabled/);

  card._hass = { ...card._hass, user: { is_admin: false } };
  card._render();
  const html = card.shadowRoot.innerHTML;
  assert.match(html, /rule-btn[^>]*\sdisabled>/);
  assert.doesNotMatch(html, /title="(Disable|Enable)"/);
  card._onRule({ dataset: { ruleDomain: 'app.proxy_one.org', ruleEnabled: 'false' }, disabled: true });
  assert.deepEqual(card.calls, []);
  assert.equal(card._confirm ?? null, null);
  const key = card._key();
  card._hass.user.is_admin = true;
  assert.notEqual(card._key(), key, 'the admin flag re-renders');
});

test('the confirmation text is escaped (a rule domain comes from Zoraxy)', () => {
  const card = controlCard();
  card._confirm = { text: '<img src=x onerror=alert(1)>', ok: 'OK' };
  const html = card._confirmHtml();
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(html, /data-action="confirm_cancel">Cancel</);
});

test('unavailable or unknown controls say so, are disabled and do nothing', () => {
  for (const [id, state] of [
    [`switch.${PREFIX}_ecoute_port_80`, 'unavailable'],
    [`binary_sensor.${PREFIX}_ecoute_port_80`, 'unknown'],
  ]) {
    const card = controlCard({ [id]: state });
    assert.equal(card._ctrlState('ctrl-port80'), null);
    card._onCtrl('ctrl-port80');
    assert.equal(card._confirm, undefined);
    assert.deepEqual(card.calls, []);
    card._render();
    const tile = card.shadowRoot.innerHTML.match(/<button class="ctrl[^"]*" id="ctrl-port80"[\s\S]*?<\/button>/)[0];
    assert.match(tile, / disabled>/);
    assert.match(tile, /<span class="cs">Unavailable<\/span>/);
    assert.doesNotMatch(tile, />Off</);
  }
  // A missing switch entity (older install, wrong prefix) is unavailable too.
  const card = controlCard();
  delete card._hass.states[`switch.${PREFIX}_mode_developpement`];
  assert.equal(card._ctrlState('ctrl-devmode'), null);
  // The others still work.
  assert.equal(card._ctrlState('ctrl-https'), 'on');
});

test('an unavailable rules sensor is not shown as "no rule"', () => {
  const card = makeCard({ [`sensor.${PREFIX}_regles_proxy`]: { state: 'unavailable', attributes: {} } });
  card._render();
  const html = card.shadowRoot.innerHTML;
  assert.match(html, /Proxy rules \(–\)/);
  assert.match(html, /Redirections \(–\)/);
  assert.doesNotMatch(html, /No rule configured|No redirect configured|\(0\)/);
  // Known and empty: "no rule" again.
  const empty = makeCard({ [`sensor.${PREFIX}_regles_proxy`]: { state: '0', attributes: { rules: [], redirects: [] } } });
  empty._render();
  assert.match(empty.shadowRoot.innerHTML, /Proxy rules \(0\)[\s\S]*No rule configured/);
});

test('the mini card does not report "HTTPS redirect off" when the sensor is unavailable', () => {
  for (const state of ['unavailable', 'unknown']) {
    const html = makeCard({ [`binary_sensor.${PREFIX}_redirection_https`]: { state, attributes: {} } }, ZoraxyMiniCard)._miniChips();
    assert.doesNotMatch(html, /HTTPS redirect/);
  }
  const off = makeCard({ [`binary_sensor.${PREFIX}_redirection_https`]: { state: 'off', attributes: {} } }, ZoraxyMiniCard)._miniChips();
  assert.match(off, /HTTPS redirect Off/);
});

test('the renew button of an unavailable certificate button entity is disabled', () => {
  const states = {
    [`sensor.${PREFIX}_cert_a_example`]: { state: isoInDays(40), attributes: { domain: 'a.example' } },
    [`sensor.${PREFIX}_cert_b_example`]: { state: isoInDays(40), attributes: { domain: 'b.example' } },
    // Never pressed: "unknown", still usable.
    [`button.${PREFIX}_renouveler_a_example`]: { state: 'unknown', attributes: {} },
    [`button.${PREFIX}_renouveler_b_example`]: { state: 'unavailable', attributes: {} },
  };
  const html = makeCard(states)._buildCerts();
  assert.match(html, /data-entity="button\.zoraxy_reverse_proxy_zoraxy_renouveler_a_example" title="Renew">/);
  assert.match(html, /data-entity="button\.zoraxy_reverse_proxy_zoraxy_renouveler_b_example" title="Renew" disabled>/);
});

test('both cards set their language on ha-card (hyphenation, screen readers)', () => {
  for (const Cls of [ZoraxyCard, ZoraxyMiniCard]) {
    const card = makeCard({}, Cls);
    card._hass.locale.language = 'sr-Latn';
    card._render();
    assert.match(card.shadowRoot.innerHTML, /<ha-card lang="sr-Latn">/);
  }
});

test('the card keeps a natural width in an inline-block, without a minimum width in a "1fr 1fr" grid', () => {
  // A size container (container-type: inline-size) ignores its content's width: without help it falls to its
  // padding (~24 px) in an inline-block or a grid "auto" column. contain-intrinsic-inline-size or a min-width in
  // px would fix that but become a minimum: in a "1fr 1fr" grid (layout-card, grid or horizontal stack), wrapped
  // or not, the card then refuses to shrink and overflows (measured 316-500 px).
  for (const css of [ZoraxyCard.CSS, ZoraxyMiniCard.CSS]) {
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(clean, /contain-intrinsic/);
    assert.equal(rules(css, 'ha-card')['container-type'], 'inline-size');
    assert.equal(rules(css, ':host')['min-width'], '0');
    // An empty, zero-height grid whose only column is minmax(0, W): max-content W, min-content 0.
    const before = rules(css, ':host::before');
    assert.equal(before.display, 'grid');
    assert.equal(before.height, '0');
    assert.equal(before['grid-template-columns'], 'minmax(0, var(--zx-natural-width))');
  }
  assert.equal(rules(ZoraxyCard.CSS, ':host')['--zx-natural-width'], '360px');
  assert.equal(rules(ZoraxyMiniCard.CSS, ':host')['--zx-natural-width'], '300px');
});

test('narrow card (4 columns on a phone): the controls stack label and state, a row keeps its domain', () => {
  const css = ZoraxyCard.CSS;
  // ≤ 200 px: icon, then the label with its state under it; the state never squeezes the label.
  const ctrl = rules(css, '.ctrl', 200);
  assert.equal(ctrl.display, 'grid');
  assert.equal(ctrl['grid-template-columns'], 'auto minmax(0, 1fr)');
  assert.equal(rules(css, '.ctrl .icon', 200)['grid-row'], 'span 2');
  assert.equal(rules(css, '.ctrl .cs', 200)['max-width'], '100%');
  assert.equal(rules(css, '.ctrl .cs', 200).overflow, undefined, 'the state is never cut');
  // Under its domain (see the next test), the rule's target gives way completely to the buttons.
  assert.equal(rules(css, '.row-sub', 200)['min-width'], '0');
  // ≤ 150 px: label and state take the whole tile.
  assert.equal(rules(css, '.ctrl', 150)['grid-template-columns'], 'minmax(0, 1fr)');
  assert.equal(rules(css, '.ctrl .icon', 150).display, 'none');
  // ≤ 260 px: tighter header gaps, so a long status keeps its whole text beside the title and detail button.
  assert.equal(rules(css, '.header', 260).gap, '6px');
});

test('a rule or redirect row wraps up to 200 px, so its target keeps a visible width on a phone', () => {
  const css = ZoraxyCard.CSS;
  // 151-200 px (the full card at 6 columns on a phone, the zoomed mini card at 160 px): without the wrap the
  // domain took the whole line and the target fell to 0 px. The domain gets its own line, the target and the
  // buttons go under it, exactly as at 150 px and below.
  assert.equal(rules(css, '.row', 200)['flex-wrap'], 'wrap');
  assert.equal(rules(css, '.row-left', 200).flex, '1 0 100%');
  assert.equal(rules(css, '.row-right', 200)['margin-left'], 'auto');
  // Above 200 px the row stays on one line.
  assert.equal(rules(css, '.row')['flex-wrap'], undefined);
});

test('every focus given back by the card does not scroll the page (preventScroll)', () => {
  const calls = [...source.matchAll(/\.focus\(([^)]*)\)/g)].map((m) => m[1]);
  assert.ok(calls.length >= 4);
  for (const arg of calls) assert.match(arg, /^\{ preventScroll: true \}$/, `.focus(${arg})`);
});

test('the mini card detail button keeps the focus through a state update, without scrolling', () => {
  const made = [];
  const createElement = context.document.createElement;
  context.document.createElement = () => {
    const b = { dataset: {}, attrs: {}, listeners: {}, setAttribute(a, v) { this.attrs[a] = v; },
      addEventListener(t, f) { this.listeners[t] = f; } };
    made.push(b);
    return b;
  };
  try {
    const card = makeCard({}, ZoraxyMiniCard, {});
    const head = { appendChild() {} };
    card.shadowRoot.querySelector = (sel) => (sel === '.head, .header' ? head : null);
    card._addZoom();
    const [button] = made;
    assert.equal(button.className, 'zoom');
    assert.equal(button.dataset.action, 'zoom');
    assert.ok(ZoraxyCard.FOCUS_ATTRS.includes('data-action'));
    // A hass update redraws the card: the new detail button gets the focus back, without scrolling.
    const el = (attrs) => ({ classList: ['zoom'], getAttribute: (a) => attrs[a] ?? null, args: null, focus(arg) { this.args = arg; } });
    card.shadowRoot.activeElement = el({ 'data-action': 'zoom' });
    const key = card._focusKey();
    assert.deepEqual({ ...key }, { cls: 'zoom', attr: 'data-action', value: 'zoom' });
    card.shadowRoot.activeElement = null;
    const fresh = el({ 'data-action': 'zoom' });
    card.shadowRoot.querySelectorAll = (sel) => (sel === '[data-action]' ? [fresh] : []);
    card._restoreFocus(key);
    assert.deepEqual({ ...fresh.args }, { preventScroll: true });
    // Keyboard use of the button (no click count): the focus goes to the new button, without scrolling.
    card._render = () => {};
    const next = el({});
    card.shadowRoot.querySelector = (sel) => (sel === '.zoom' ? next : null);
    button.listeners.click({ detail: 0, stopPropagation() {} });
    assert.deepEqual({ ...next.args }, { preventScroll: true });
  } finally {
    context.document.createElement = createElement;
  }
});

test('a redraw gives the focus back to the same control', () => {
  const card = makeCard();
  const el = (cls, attrs) => ({ classList: cls.split(' '), getAttribute: (a) => attrs[a] ?? null, focused: false, focus() { this.focused = true; } });
  card.shadowRoot.activeElement = el('ctrl ok', { id: 'ctrl-port80' });
  const key = card._focusKey();
  // After the redraw nothing has the focus; the tile is now "idle" (its state changed).
  card.shadowRoot.activeElement = null;
  const header = el('sec-header', { 'data-id': 'controls' });
  const tile = el('ctrl idle', { id: 'ctrl-port80' });
  card.shadowRoot.querySelectorAll = (sel) => (sel === '[id]' ? [tile] : [header]);
  card._restoreFocus(key);
  assert.equal(tile.focused, true);
  // Nothing focused before: nothing to restore.
  assert.equal(card._focusKey(), null);
});

// ── Entities from the registry, several instances, upstream health ───────────

// Two Zoraxy devices whose entities were renamed: only the registry (platform, device, translation key) finds them.
function registryCard(config = {}, Cls = ZoraxyCard) {
  const entities = {};
  const states = {};
  const add = (id, device, key, state, attributes = {}) => {
    entities[id] = { entity_id: id, platform: 'zoraxy', device_id: device, translation_key: key };
    states[id] = { entity_id: id, state, attributes };
  };
  for (const [dev, name, rules, port] of [['dev1', 'proxy_one', '3', '443'], ['dev2', 'proxy_two', '7', '8443']]) {
    add(`sensor.${name}_rules`, dev, 'proxy_rules', rules, {
      rules: [{ domain: `app.${name}.org`, target: '10.0.0.2:80', enabled: true }, { domain: `ok.${name}.org`, target: '10.0.0.3:80', enabled: true }],
      redirects: [],
    });
    add(`sensor.${name}_active`, dev, 'active_rules', rules);
    add(`sensor.${name}_certs`, dev, 'tls_certificates', '1');
    add(`sensor.${name}_port`, dev, 'inbound_port', port);
    add(`binary_sensor.${name}_running`, dev, 'proxy_running', 'on');
    add(`binary_sensor.${name}_https`, dev, 'https_redirect', 'on');
    add(`switch.${name}_https`, dev, 'https_redirect', 'on');
    add(`binary_sensor.${name}_port80`, dev, 'port_80', 'on');
    add(`switch.${name}_port80`, dev, 'port_80', 'on');
    add(`binary_sensor.${name}_dev`, dev, 'development_mode', 'off');
    add(`switch.${name}_dev`, dev, 'development_mode', 'off');
    add(`sensor.${name}_cert_a`, dev, 'certificate', isoInDays(3), { domain: `a.${name}.org` });
    add(`binary_sensor.${name}_cert_a_expiring`, dev, 'certificate_expiring', 'on', { domain: `a.${name}.org` });
    add(`button.${name}_renew_a`, dev, 'renew', 'unknown', { domain: `a.${name}.org` });
    add(`binary_sensor.${name}_up_app`, dev, 'upstream_problem', 'on', { domain: `app.${name}.org` });
    add(`binary_sensor.${name}_up_ok`, dev, 'upstream_problem', 'off', { domain: `ok.${name}.org` });
  }
  // Another integration's entity on the page is ignored.
  entities['sensor.other'] = { entity_id: 'sensor.other', platform: 'other', device_id: 'dev3', translation_key: 'proxy_rules' };
  const card = new Cls();
  card._config = config;
  card._hass = { states, entities, locale: { language: 'en' } };
  card.calls = [];
  card._hass.callService = (domain, service, data) => {
    card.calls.push(`${domain}.${service} ${data.entity_id}`);
    return Promise.resolve();
  };
  return card;
}

test('entities are found in the registry by device and translation key, whatever their ids', () => {
  const card = registryCard();
  assert.equal(card._eid('sensor.proxy_rules'), 'sensor.proxy_one_rules');
  assert.equal(card._eid('switch.port_80'), 'switch.proxy_one_port80');
  assert.ok(card._entityIds().every((id) => id.includes('proxy_one')));
  card._render();
  const html = card.shadowRoot.innerHTML;
  assert.match(html, /<div class="mv">443<\/div>/);
  assert.match(html, /Proxy rules \(2\)/);
  // The certificate row finds its renew button and expiring sensor by their domain attribute.
  assert.match(html, /a\.proxy_one\.org/);
  assert.match(html, /data-entity="button\.proxy_one_renew_a"/);
  card._onCtrl('ctrl-devmode');
  assert.deepEqual(card.calls, ['homeassistant.turn_on switch.proxy_one_dev']);
});

test('the device option picks another Zoraxy instance', () => {
  const card = registryCard({ device: 'dev2' });
  assert.equal(card._eid('sensor.inbound_port'), 'sensor.proxy_two_port');
  card._render();
  assert.match(card.shadowRoot.innerHTML, /<div class="mv">8443<\/div>/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /proxy_one/);
  // The default picks the device of the entity named after the prefix (the first install keeps its 1.4.x ids).
  const named = registryCard();
  named._hass.entities[`sensor.${PREFIX}_regles_proxy`] = { entity_id: `sensor.${PREFIX}_regles_proxy`, platform: 'zoraxy', device_id: 'dev2', translation_key: 'x' };
  assert.equal(named._eid('sensor.inbound_port'), 'sensor.proxy_two_port');
  assert.throws(() => new ZoraxyCard().setConfig({ device: 3 }), /device/);
});

test('without the registry (or without any Zoraxy entity in it) the ids come from the prefix', () => {
  const card = makeCard();
  assert.equal(card._eid('sensor.proxy_rules'), `sensor.${PREFIX}_regles_proxy`);
  assert.equal(card._eid('binary_sensor.port_80'), `binary_sensor.${PREFIX}_ecoute_port_80`);
  card._hass.entities = { 'sensor.x': { entity_id: 'sensor.x', platform: 'other', device_id: 'd' } };
  assert.equal(card._eid('switch.development_mode'), `switch.${PREFIX}_mode_developpement`);
});

test('a rule whose upstream is down gets a badge; the mini card counts them', () => {
  const card = registryCard();
  const rows = card._buildRules(card._attr('sensor.proxy_one_rules', 'rules')).split('<div class="row">');
  assert.match(rows.find((r) => r.includes('app.proxy_one.org')), /up-badge[^>]*title="Upstream down \(Zoraxy uptime monitor\)"[\s\S]*>Down</);
  assert.doesNotMatch(rows.find((r) => r.includes('ok.proxy_one.org')), /up-badge/);
  const mini = registryCard({}, ZoraxyMiniCard)._miniChips();
  assert.match(mini, /data-entity="binary_sensor\.proxy_one_up_app"[^>]*>[\s\S]*Upstreams down: 1/);
  // Found from the prefix too.
  const legacy = makeCard({
    [`sensor.${PREFIX}_regles_proxy`]: { state: '1', attributes: { rules: [{ domain: 'x.org', target: 't', enabled: true }] } },
    [`binary_sensor.${PREFIX}_upstream_x_org`]: { state: 'on', attributes: { domain: 'x.org' } },
  });
  assert.match(legacy._buildRules(legacy._attr(`sensor.${PREFIX}_regles_proxy`, 'rules')), /up-badge/);
});

test('the editors offer the Zoraxy device picker', () => {
  const field = ZoraxyCardEditor.SCHEMA.find((f) => f.name === 'device');
  assert.equal(field.selector.device.integration, 'zoraxy');
  assert.ok(ZoraxyMiniCardEditor.SCHEMA.some((f) => f.name === 'device'));
});
