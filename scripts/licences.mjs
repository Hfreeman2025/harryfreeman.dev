// Every installed package must be MIT, Apache-2.0, BSD or ISC (or a combination of those). The one
// exception is the self-hosted typeface, Jost, under the SIL Open Font Licence: a font, not code.
import { readFileSync } from 'node:fs';

const ALLOWED = /^(MIT|ISC|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|0BSD|BlueOak-1\.0\.0)$/;
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const bad = [];
const seen = new Map();
for (const [path, pkg] of Object.entries(lock.packages)) {
  if (!path) continue;
  const licence = String(pkg.license ?? 'UNKNOWN');
  const parts = licence.replace(/[()]/g, '').split(/\s+(?:OR|AND)\s+/);
  const font = path.startsWith('node_modules/@fontsource') && licence === 'OFL-1.1';
  const ok = font || (licence.includes(' OR ') ? parts.some((p) => ALLOWED.test(p)) : parts.every((p) => ALLOWED.test(p)));
  seen.set(licence, (seen.get(licence) ?? 0) + 1);
  if (!ok) bad.push(`${path}: ${licence}`);
}
console.log([...seen].map(([l, n]) => `${l}: ${n}`).join('\n'));
if (bad.length) {
  console.error(`\nNot allowed:\n${bad.join('\n')}`);
  process.exit(1);
}
console.log(`\n${Object.keys(lock.packages).length - 1} packages, all allowed.`);
