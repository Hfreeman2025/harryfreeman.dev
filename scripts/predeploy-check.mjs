// The gate before anything is hosted. It reads the built dist/ and fails closed on anything that should
// not leave Harry's machine, then runs the typecheck, the lint and the unit tests. `npm run deploy` runs it
// after the hosted build; on its own:
//
//   npm run check:predeploy [-- dist]
//
// Over every file in dist/ it refuses:
//   - names that must never be public (the employer, clients), from a denylist kept OUTSIDE every
//     repository, ~/Personal/.site-gate/denylist.txt (or SITE_GATE_DENYLIST): one name per line,
//     # comments, case-insensitive, whole words. A missing or empty list, or one inside a repository,
//     stops the gate. It reports how many names it checked and which files hit, never the names;
//   - home paths (/Users/…, /home/…, ~/Personal…), localhost and 127.0.0.1, plain http:// URLs, source
//     maps, .env files and strings shaped like keys or tokens;
//   - any email but the personal one in site.config.json;
//   - a file over Cloudflare Pages' 25 MiB, or more files than its 20,000;
//   - _headers missing, unfilled or out of step with the indexing switch, a page script the CSP would
//     block, robots.txt out of step, or a build that is not the hosted one.
// The reviewed exceptions are in src/hosting/gate.ts (EXCEPTIONS), each an exact string in an exact file.
// The rules themselves are unit-tested (tests/hosting.test.ts).

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readHostingConfig } from '../src/hosting/config.ts';
import { checkHeaders, deniedIn, denyMatchers, parseDenylist, printableRuns, scanText } from '../src/hosting/gate.ts';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = process.argv[2] ?? join(site, 'dist');
const MIB = 1024 * 1024;
const LIMITS = { file: 25 * MIB, files: 20000 };
const BINARY = new Set([
  '.png',
  '.webp',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.webm',
  '.mp4',
  '.m4a',
  '.wasm',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.glb',
  '.bin',
  '.ktx2',
  '.hdr',
  '.exr',
]);

const findings = [];
const fail = (file, what) => findings.push({ file, what });

function denylist() {
  const path = process.env.SITE_GATE_DENYLIST ?? join(homedir(), 'Personal/.site-gate/denylist.txt');
  if (!existsSync(path)) throw new Error(`the denylist is missing (${path}); the gate does not run without it`);
  const inRepo = spawnSync('git', ['-C', dirname(path), 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
  if (inRepo.status === 0 && inRepo.stdout.trim() === 'true')
    throw new Error('the denylist is inside a git repository; keep it outside every repository');
  return parseDenylist(readFileSync(path, 'utf8'));
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? walk(path)
      : [{ path, rel: relative(dist, path).split('\\').join('/'), size: statSync(path).size }];
  });
}

function staticChecks() {
  if (!existsSync(dist)) throw new Error(`${dist} does not exist: run npm run build:hosted first`);
  const config = JSON.parse(readFileSync(join(site, 'site.config.json'), 'utf8'));
  const hosting = readHostingConfig(site);
  const names = denylist();
  const matchers = denyMatchers(names);
  const files = walk(dist);
  let hits = 0;
  let total = 0;
  let scanned = 0;
  for (const f of files) {
    total += f.size;
    const ext = extname(f.rel).toLowerCase();
    const base = f.rel.split('/').pop() ?? '';
    if (f.size > LIMITS.file) fail(f.rel, `${(f.size / MIB).toFixed(1)} MiB, over Cloudflare Pages' 25 MiB a file`);
    if (ext === '.map') fail(f.rel, 'a source map');
    if (/^\.env|^\.dev\.vars|^\.npmrc$|^\.wrangler/.test(base)) fail(f.rel, 'a local secrets or tooling file');
    const bytes = readFileSync(f.path);
    // Every file for the names: text files whole, binary files as the text in them (their metadata).
    const binary = BINARY.has(ext);
    const asText = binary ? printableRuns(bytes) : bytes.toString('utf8');
    for (const n of deniedIn(asText, matchers)) {
      hits++;
      fail(f.rel, `a name on the denylist (entry ${n} of ${names.length})`);
    }
    if (binary) {
      if (/\/Users\/[A-Za-z0-9._-]+|~\/Personal\b/.test(asText)) fail(f.rel, 'a home path in a binary file');
      continue;
    }
    scanned++;
    for (const x of scanText(f.rel, asText, config.email)) fail(x.file, x.what);
  }
  if (files.length > LIMITS.files) fail('dist', `${files.length} files, over Cloudflare Pages' ${LIMITS.files}`);

  // The hosted build, not the local one.
  const read = (rel) => (existsSync(join(dist, rel)) ? readFileSync(join(dist, rel), 'utf8') : null);
  const index = read('index.html') ?? '';
  if (!index.includes(`<link rel="canonical" href="${hosting.origin}/">`))
    fail('index.html', `no canonical link to ${hosting.origin}/: not the hosted build`);
  if (/\smodel-host=/.test(index)) fail('index.html', 'Reception still names a local model host');
  if (existsSync(join(dist, 'models'))) fail('models/', 'a local copy of the model; the public site loads it from Hugging Face');
  const runtime = read('vendor/transformers/runtime-hosted.js');
  if (!runtime || runtime.includes('ORT_BUILDS')) fail('vendor/transformers/runtime-hosted.js', 'missing or unfilled');
  const headers = read('_headers');
  if (headers === null) fail('_headers', 'missing');
  else {
    const pages = files.filter((f) => f.rel.endsWith('.html')).map((f) => ({ file: f.rel, html: readFileSync(f.path, 'utf8') }));
    for (const x of checkHeaders(headers, read('robots.txt'), pages, hosting.SITE_INDEXABLE)) fail(x.file, x.what);
  }
  return {
    files: files.length,
    total,
    scanned,
    names: names.length,
    hits,
    largest: Math.max(...files.map((f) => f.size)),
    indexable: hosting.SITE_INDEXABLE,
  };
}

function codeChecks() {
  const results = [];
  for (const [label, args] of [
    ['typecheck', ['run', 'typecheck']],
    ['lint', ['run', 'lint']],
    ['unit tests', ['test']],
  ]) {
    const r = spawnSync('npm', args, { cwd: site, encoding: 'utf8' });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    const summary = label === 'unit tests' ? (/Tests\s+(.+)/.exec(out)?.[1]?.trim() ?? '') : '';
    results.push({ label, ok: r.status === 0, summary, out });
  }
  return results;
}

try {
  const s = staticChecks();
  console.log(
    `predeploy: ${s.files} files, ${(s.total / MIB).toFixed(1)} MiB in all, largest ${(s.largest / MIB).toFixed(1)} MiB; ${s.scanned} text files scanned`,
  );
  console.log(`predeploy: denylist: ${s.names} names checked, ${s.hits} hit${s.hits === 1 ? '' : 's'}`);
  console.log(`predeploy: indexing ${s.indexable ? 'ON (SITE_INDEXABLE true)' : 'off (noindex, nofollow; robots.txt disallows all)'}`);
  for (const c of codeChecks()) {
    console.log(`predeploy: ${c.label} ${c.ok ? 'passed' : 'FAILED'}${c.summary ? ` (${c.summary})` : ''}`);
    if (!c.ok) {
      fail(c.label, 'failed');
      console.log(c.out.split('\n').slice(-40).join('\n'));
    }
  }
  if (findings.length) {
    const unique = [...new Set(findings.map((f) => `${f.file}: ${f.what}`))];
    console.log(`predeploy: ${unique.length} problem${unique.length === 1 ? '' : 's'}; nothing may be deployed`);
    for (const p of unique.slice(0, 200)) console.log(`  ${p}`);
    process.exit(1);
  }
  console.log(`predeploy: clean (${execFileSync('git', ['-C', site, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()})`);
} catch (error) {
  console.error(`predeploy: stopped, nothing may be deployed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
