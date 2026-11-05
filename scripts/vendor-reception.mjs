// Vendors Reception for the public site. ask-the-record is Harry's own (MIT): its two built element
// files go into public/vendor/ask-the-record/ with its LICENSE and SOURCE.json, like the radio. They must
// be what its committed HEAD builds, so this clones that commit into a temporary folder, installs it from
// its lockfile, builds it, and refuses unless the result is byte for byte what ask-the-record's own dist/
// holds (the files the site uses locally). Its working tree may have uncommitted edits; the clone has none.
//
// transformers.js and ONNX Runtime Web (about 40 MB, mostly WebAssembly) are not committed: their exact
// files are pinned by version, npm integrity and SHA-256 in src/hosting/reception.json, the clone's fresh
// install must match ask-the-record's own, and the hosted build copies them from there only if they still do.
//
//   node scripts/vendor-reception.mjs [--clone <a clean clone of ask-the-record at its HEAD, already built>]

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(homedir(), 'Personal/oss/ask-the-record');
const ELEMENT = ['ask-the-record.min.js', 'ask-the-record-explain.min.js'];
/** Runtime files, by package, and where the hosted build puts them under dist/. */
const RUNTIME = [
  { pkg: '@huggingface/transformers', to: 'vendor/transformers', files: ['dist/transformers.min.js', 'LICENSE'] },
  {
    pkg: 'onnxruntime-web',
    to: 'vendor/ort',
    files: [
      'dist/ort-wasm-simd-threaded.asyncify.mjs',
      'dist/ort-wasm-simd-threaded.asyncify.wasm',
      'dist/ort-wasm-simd-threaded.mjs',
      'dist/ort-wasm-simd-threaded.wasm',
    ],
  },
];

const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
const run = (cwd, cmd, args) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'ignore', 'inherit'] });

const head = git(repo, 'rev-parse', 'HEAD');
const given = process.argv.indexOf('--clone');
let clone = given > 0 ? process.argv[given + 1] : null;
let temporary = null;
if (clone) {
  if (git(clone, 'rev-parse', 'HEAD') !== head) throw new Error(`${clone} is not at ask-the-record's HEAD (${head.slice(0, 7)})`);
  if (git(clone, 'status', '--porcelain', '--untracked-files=no') !== '') throw new Error(`${clone} has uncommitted changes`);
} else {
  temporary = mkdtempSync(join(tmpdir(), 'ask-the-record-'));
  clone = join(temporary, 'ask-the-record');
  console.log(`cloning ask-the-record at ${head.slice(0, 7)}, installing from its lockfile and building (a few minutes)…`);
  execFileSync('git', ['clone', '--quiet', '--no-hardlinks', repo, clone]);
  run(clone, 'npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
  run(clone, 'npm', ['run', 'build']);
}

try {
  const problems = [];
  for (const f of ELEMENT)
    if (sha(join(clone, 'dist', f)) !== sha(join(repo, 'dist', f)))
      problems.push(`dist/${f} differs from what ${head.slice(0, 7)} builds: rebuild ask-the-record from a clean commit`);
  const lock = JSON.parse(readFileSync(join(clone, 'package-lock.json'), 'utf8'));
  const runtime = RUNTIME.map(({ pkg, to, files }) => {
    const entry = lock.packages[`node_modules/${pkg}`];
    if (!entry) throw new Error(`${pkg} is not in ask-the-record's lockfile`);
    const pinned = {};
    for (const f of files) {
      const fresh = join(clone, 'node_modules', pkg, f);
      const used = join(repo, 'node_modules', pkg, f);
      if (!existsSync(used) || sha(fresh) !== sha(used)) problems.push(`${pkg}/${f} in ask-the-record's install is not its locked version`);
      pinned[f] = sha(fresh);
    }
    return { package: pkg, version: entry.version, integrity: entry.integrity, licence: entry.license, to, files: pinned };
  });
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }

  const out = join(root, 'public/vendor/ask-the-record');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const f of ELEMENT) cpSync(join(clone, 'dist', f), join(out, f));
  cpSync(join(clone, 'LICENSE'), join(out, 'LICENSE'));
  const source = {
    from: 'Personal/oss/ask-the-record/dist',
    commit: head,
    committed: git(repo, 'log', '-1', '--format=%cI'),
    build: 'npm ci && npm run build in a clean clone at the commit; byte for byte its dist/',
    files: Object.fromEntries([...ELEMENT, 'LICENSE'].map((f) => [f, sha(join(out, f))])),
  };
  writeFileSync(join(out, 'SOURCE.json'), `${JSON.stringify(source, null, 2)}\n`);

  const pins = {
    $comment:
      'Reception’s runtime on the public site, from ask-the-record’s install: written by scripts/vendor-reception.mjs, checked by the hosted build before it copies each file.',
    from: 'Personal/oss/ask-the-record/node_modules',
    commit: head,
    runtime,
  };
  writeFileSync(join(root, 'src/hosting/reception.json'), `${JSON.stringify(pins, null, 2)}\n`);
  console.log(
    `vendored ask-the-record ${head.slice(0, 7)}: ${ELEMENT.join(', ')}; pinned ${runtime.map((r) => `${r.package}@${r.version}`).join(', ')}`,
  );
} finally {
  if (temporary) rmSync(temporary, { recursive: true, force: true });
}
