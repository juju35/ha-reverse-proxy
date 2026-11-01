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
  for (const lang of ['en', 'fr', 'de', 'es', 'sr', 'sr-Latn', 'it', 'nl', 'pt', 'pl']) assert.ok(langs.includes(lang), `missing ${lang}`);
  const reference = Object.keys(ZoraxyCard.I18N.en).sort();
  for (const lang of langs) {
    assert.deepEqual(Object.keys(ZoraxyCard.I18N[lang]).sort(), reference, `keys of ${lang}`);
  }
});

test('I18N parity: every language has exactly the English keys and placeholders, none empty', () => {
  const en = ZoraxyCard.I18N.en;
  const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
  for (const lang of ['fr', 'de', 'es', 'sr', 'sr-Latn', 'it', 'nl', 'pt', 'pl']) {
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
  const kept = /Zoraxy|HTTPS|URL|Home Assistant|zoraxy_reverse_proxy_zoraxy|\{\w+\}/g;
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
    assert.deepEqual([...picker.map((o) => o.value)], ['', 'en', 'fr', 'de', 'es', 'sr', 'sr-Latn', 'it', 'nl', 'pt', 'pl']);
    assert.deepEqual(
      ['it', 'nl', 'pt', 'pl'].map((v) => picker.find((o) => o.value === v).label),
      ['Italiano', 'Nederlands', 'Português (Portugal)', 'Polski'],
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
