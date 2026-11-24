// Assembles the frontend's ES modules: every src/<stem>/index.js becomes custom_components/<domain>/frontend/<stem>.js,
// the classic script Home Assistant serves (scripts/bundle.mjs: modules concatenated in the order of the entry file,
// import lines removed, `export` keywords dropped, translation tables rebuilt as one literal). The assembled files are
// not committed: run this before the tests, the screenshots, scripts/split-frontend.mjs and the release zip.
// Usage: node scripts/build-frontend.mjs
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bundle } from "./bundle.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const [domain] = readdirSync(`${root}custom_components`);
const out = `${root}custom_components/${domain}/frontend`;
mkdirSync(out, { recursive: true }); // a fresh checkout has no frontend/ folder when every file in it is assembled

for (const stem of readdirSync(`${root}src`).sort()) {
  if (!existsSync(`${root}src/${stem}/index.js`)) continue;
  const code = bundle(`src/${stem}/index.js`);
  writeFileSync(`${out}/${stem}.js`, code);
  console.log(`src/${stem}/ → custom_components/${domain}/frontend/${stem}.js (${(code.length / 1024).toFixed(1)} KB)`);
}
