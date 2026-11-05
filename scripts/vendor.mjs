// Copies a sibling project's built package into public/vendor/<name>/, as it is, and records where it
// came from: the source folder, its git commit (which must be clean) and each file's SHA-256. Nothing
// here is edited by hand; to update, rebuild in the source folder and run this again.
//
//   node scripts/vendor.mjs radio
//   node scripts/vendor.mjs stamps

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = {
  radio: {
    repo: join(homedir(), 'Personal/lab/listen-to-the-grid'),
    dir: 'dist-radio',
    build: 'npm run build:radio',
    files: ['listen-to-the-grid-radio.js', 'listen-to-the-grid-radio.d.ts', 'README.md', 'LICENSE'],
    folders: ['assets'],
  },
  stamps: {
    repo: join(homedir(), 'Personal/oss/receipts'),
    dir: 'exports/site-stamps',
    build: 'the receipts signer (see its docs/site-stamps.md)',
    files: ['verify-stamp.mjs', 'public-key.json', 'index.json', 'tampered.dsse.json', 'tamper-vector.json', 'README.md'],
    folders: ['stamps', 'history', 'captures'],
    /** Files from elsewhere in the repository, copied beside the packet: [from repo root, to]. */
    extra: [
      ['docs/site-stamps.md', 'site-stamps.md'],
      ['LICENSE', 'LICENSE'],
    ],
  },
};

const name = process.argv[2] ?? '';
const pkg = PACKAGES[name];
if (!pkg) {
  console.error(`usage: node scripts/vendor.mjs <${Object.keys(PACKAGES).join('|')}>`);
  process.exit(2);
}
const git = (...args) => execFileSync('git', ['-C', pkg.repo, ...args], { encoding: 'utf8' }).trim();
if (git('status', '--porcelain') !== '') {
  console.error(`${pkg.repo} has uncommitted changes; vendor only from a clean commit.`);
  process.exit(1);
}
const from = join(pkg.repo, pkg.dir);
const to = join(root, 'public', 'vendor', name);
for (const f of pkg.files) if (!existsSync(join(from, f))) throw new Error(`missing ${f} in ${from}: run ${pkg.build} there`);

rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
for (const f of pkg.files) cpSync(join(from, f), join(to, f));
for (const d of pkg.folders) cpSync(join(from, d), join(to, d), { recursive: true });
for (const [src, dest] of pkg.extra ?? []) cpSync(join(pkg.repo, src), join(to, dest));

const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
const files = Object.fromEntries(
  walk(to)
    .filter((f) => !f.endsWith('SOURCE.json'))
    .map((f) => [relative(to, f), createHash('sha256').update(readFileSync(f)).digest('hex')])
    .sort(([a], [b]) => a.localeCompare(b)),
);
const source = {
  from: `${relative(homedir(), pkg.repo)}/${pkg.dir}`,
  commit: git('rev-parse', 'HEAD'),
  committed: git('log', '-1', '--format=%cI'),
  build: pkg.build,
  files,
};
writeFileSync(join(to, 'SOURCE.json'), `${JSON.stringify(source, null, 2)}\n`);
console.log(`vendored ${name} from ${source.from} at ${source.commit.slice(0, 7)}: ${Object.keys(files).length} files`);
