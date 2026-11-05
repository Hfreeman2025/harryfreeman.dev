// The pre-deploy gate's rules (scripts/predeploy-check.mjs runs them over dist/). Pure, so the unit tests
// prove each rule fires and each exception stays as narrow as it is written.

import { cspOf, inlineScriptHashes } from './headers';

export interface Finding {
  readonly file: string;
  readonly what: string;
}

// ---------- Names that must never be public ----------

/**
 * The denylist: one name per line, # comments, from a file outside every repository (README, Hosting).
 * Throws when it has no names: an empty list would pass everything.
 */
export function parseDenylist(text: string): string[] {
  const names = text
    .split('\n')
    .map((l) => l.replace(/#.*/, '').trim())
    .filter(Boolean);
  if (names.length === 0) throw new Error('the denylist has no names');
  return names;
}

/** Case-insensitive, whole words, any run of spaces between the words of a name. */
export function denyMatchers(names: readonly string[]): RegExp[] {
  return names.map((name) => {
    const body = name
      .split(/\s+/)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join(String.raw`[\s _-]+`);
    return new RegExp(String.raw`(?<![\p{L}\p{N}])${body}(?![\p{L}\p{N}])`, 'iu');
  });
}

/** Which denylist entries (by number, never by name) a text contains. */
export function deniedIn(text: string, matchers: readonly RegExp[]): number[] {
  return matchers.flatMap((re, i) => (re.test(text) ? [i + 1] : []));
}

/**
 * The text in a binary file: runs of six or more printable characters, as `strings` reads metadata
 * (titles, encoders, paths). Compressed pixels and WebAssembly are not text, and a short name read
 * straight out of them matches random bytes.
 */
export function printableRuns(bytes: Uint8Array): string {
  return (
    Buffer.from(bytes)
      .toString('latin1')
      .match(/[\x20-\x7e]{6,}/g)
      ?.join('\n') ?? ''
  );
}

// ---------- What must not leave Harry's machine ----------

export const PATTERNS: ReadonlyArray<readonly [what: string, re: RegExp]> = [
  ['a home path', /\/Users\/[A-Za-z0-9._-]+|\/home\/[a-z][a-z0-9_-]*|~\/(?:Personal|Projects|Documents|Desktop|Downloads)\b/g],
  ['a local address', /(?<![\w.])(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?!\w)|\[::1\]/g],
  ['a source map reference', /sourceMappingURL=/g],
  ['a private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ['an AWS key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['a GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/g],
  [
    'an API key',
    /\b(?:sk-[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{35}|xox[abprs]-[A-Za-z0-9-]{10,}|hf_[A-Za-z0-9]{30,})\b/g,
  ],
  ['a JSON web token', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
];
const PLAIN_HTTP = /http:\/\/[^\s"'`)<>\\]+/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
/** XML and SVG namespace names are identifiers, never fetched. */
const NAMESPACE = /^http:\/\/(?:www\.w3\.org|ns\.adobe\.com|purl\.org|xmlns\.com)\//;
/** Licence texts name their own (old, plain http) addresses: SIL's OFL, the Apache licence. */
const LICENCE_FILE = /(?:^|\/)(?:LICEN[CS]E|OFL)(?:\.txt)?$/;

/**
 * Exact strings allowed in exact files, each reviewed: the gate drops a match only when the file and
 * the matched text are both listed. Anything else of the same kind still fails.
 */
export const EXCEPTIONS: ReadonlyArray<{ file: RegExp; what: string; match: RegExp; why: string }> = [
  {
    file: /^vendor\/radio\/listen-to-the-grid-radio\.js$/,
    what: 'a plain http:// URL',
    match: /^http:\/\/(?:json-schema\.org\/draft-0[47]\/schema#|\[\$\{e\}\])$/,
    why: 'JSON Schema identifiers inside the bundled zod, and a template literal that builds an IPv6 URL; neither is fetched',
  },
  {
    file: /^vendor\/stamps\/(?:captures\/dreaming\.json|history\/dreaming-first-capture\.json)$/,
    what: 'a home path',
    match: /^~\/Personal$/,
    why: 'the capture directory ~/Personal/oss/receipts/.cache/stamps/dreaming/.capture-tmp/ inside signed captures; reviewed by Harry’s coordinator, and redacting it would break the signatures',
  },
  {
    file: /^(?:vendor\/ort\/ort-wasm-simd-threaded(?:\.asyncify)?\.mjs|vendor\/transformers\/transformers\.min\.js)$/,
    what: 'a home path',
    match: /^\/home\/web_user$/,
    why: 'Emscripten’s virtual file system: the HOME it gives WebAssembly, not a path on any machine',
  },
  {
    file: /^casts\/dreaming\.cast$/,
    what: 'a home path',
    match: /^\/home\/sam$/,
    why: 'dreaming’s demo runs on synthetic data for a made-up user, sam (its title says so)',
  },
];

/** The signed captures' path must be exactly the reviewed one, not anything else under ~/Personal. */
const STAMPS_PATH = '~/Personal/oss/receipts/.cache/stamps/dreaming/.capture-tmp/';

function excepted(file: string, what: string, match: string, text: string, index: number): boolean {
  for (const e of EXCEPTIONS) {
    if (e.what !== what || !e.file.test(file) || !e.match.test(match)) continue;
    if (match === '~/Personal' && text.slice(index, index + STAMPS_PATH.length) !== STAMPS_PATH) return false;
    return true;
  }
  return false;
}

/** Every problem in one text file of dist/ (its path relative to dist/). */
export function scanText(file: string, text: string, personalEmail: string): Finding[] {
  const found: Finding[] = [];
  for (const [what, re] of PATTERNS)
    for (const m of text.matchAll(re))
      if (!excepted(file, what, m[0], text, m.index)) found.push({ file, what: `${what} (“${m[0].slice(0, 40)}”)` });
  if (!LICENCE_FILE.test(file))
    for (const m of text.matchAll(PLAIN_HTTP))
      if (!NAMESPACE.test(m[0]) && !excepted(file, 'a plain http:// URL', m[0], text, m.index))
        found.push({ file, what: `a plain http:// URL (“${m[0].slice(0, 60)}”)` });
  for (const m of text.matchAll(EMAIL))
    if (m[0].toLowerCase() !== personalEmail.toLowerCase())
      found.push({ file, what: `an email that is not Harry’s personal one (“${m[0]}”)` });
  return found;
}

// ---------- The headers ----------

export const REQUIRED_HEADERS: ReadonlyArray<readonly [name: string, value: RegExp]> = [
  ['Referrer-Policy', /^strict-origin-when-cross-origin$/],
  ['X-Content-Type-Options', /^nosniff$/],
  [
    'Permissions-Policy',
    /^(?=.*\bcamera=\(\))(?=.*\bmicrophone=\(\))(?=.*\bgeolocation=\(\))(?=.*\baccelerometer=\(self\))(?=.*\bgyroscope=\(self\))/,
  ],
];

/** The filled _headers and robots.txt, checked against the indexing switch and the pages' inline scripts. */
export function checkHeaders(
  headers: string,
  robots: string | null,
  pages: ReadonlyArray<{ file: string; html: string }>,
  indexable: boolean,
): Finding[] {
  const found: Finding[] = [];
  const bad = (what: string) => found.push({ file: '_headers', what });
  if (/__[A-Z_]+__|ORT_BUILDS/.test(headers)) bad('a placeholder was never filled');
  const csp = cspOf(headers);
  if (!csp) bad('no Content-Security-Policy');
  else {
    const directives = new Map(
      csp
        .split(';')
        .map((d) => d.trim().split(/\s+/))
        .filter((d) => d[0])
        .map((d) => [d[0] ?? '', d.slice(1)]),
    );
    if (directives.get('default-src')?.join(' ') !== "'none'") bad("the CSP's default-src is not 'none'");
    if (directives.get('frame-ancestors')?.join(' ') !== "'none'") bad("the CSP's frame-ancestors is not 'none'");
    for (const [name, sources] of directives) {
      if (sources.includes("'unsafe-inline'") || sources.includes("'unsafe-eval'") || sources.includes('*'))
        bad(`the CSP's ${name} allows ${sources.filter((s) => ["'unsafe-inline'", "'unsafe-eval'", '*'].includes(s)).join(' ')}`);
      for (const s of sources) if (/^http:/.test(s)) bad(`the CSP's ${name} allows plain http (${s})`);
    }
    const scripts = directives.get('script-src') ?? [];
    for (const p of pages)
      for (const h of inlineScriptHashes(p.html))
        if (!scripts.includes(h)) found.push({ file: p.file, what: `an inline script the CSP does not allow (${h})` });
  }
  for (const [name, value] of REQUIRED_HEADERS) {
    const line = new RegExp(`^\\s*${name}:\\s*(.+)$`, 'im').exec(headers)?.[1]?.trim();
    if (!line || !value.test(line)) bad(`${name} is ${line ? `“${line}”` : 'missing'}`);
  }
  const noindex = /^\s*X-Robots-Tag:\s*noindex,\s*nofollow\s*$/im.test(headers);
  if (indexable && noindex) bad('X-Robots-Tag noindex is sent, but SITE_INDEXABLE is true');
  if (!indexable && !noindex) bad('X-Robots-Tag: noindex, nofollow is missing, and SITE_INDEXABLE is false');
  if (robots === null) found.push({ file: 'robots.txt', what: 'missing' });
  else {
    const disallowAll = /^Disallow:\s*\/\s*$/m.test(robots);
    if (indexable === disallowAll)
      found.push({
        file: 'robots.txt',
        what: indexable ? 'disallows everything, but SITE_INDEXABLE is true' : 'does not disallow everything',
      });
  }
  return found;
}
