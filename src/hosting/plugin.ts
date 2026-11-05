// The hosted build (VITE_HOSTED=1, `npm run build:hosted`): the public site as Cloudflare Pages serves it.
// On top of the ordinary build it
//   - rewrites the pages for the public origin and for Reception off Harry's machine (html.ts);
//   - puts Reception's runtime in the build: the vendored element (public/vendor/ask-the-record/,
//     checked against its SOURCE.json), and transformers.js and ONNX Runtime's WebAssembly copied from
//     ask-the-record's install only if they match src/hosting/reception.json, a build over 25 MiB in parts;
//   - replaces dist/record/ with the redacted hosted record, after comparing it with the committed one;
//   - strips the local addresses the loops were recorded from out of loops/report.json;
//   - writes a 404 page, so a missing path is a 404 and not the studio (Pages' default without one);
//   - fills _headers (inline-script hashes, the indexing switch) and writes robots.txt to match.
// Anything it cannot do exactly fails the build.

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import * as v from 'valibot';
import type { Plugin } from 'vite';
import { readHostingConfig } from './config';
import { fillHeaders, inlineScriptHashes, robotsTxt, styleAttributeHashes } from './headers';
import { hostedHtml, pageOf } from './html';
import { checkHostedRecord, HOSTED_RECORD_DIR, RECORD_FILES } from './record';

const MIB = 1024 * 1024;
/** Each part of a split file stays well under Cloudflare Pages' 25 MiB a file. */
export const PART_BYTES = 20 * MIB;

const Pins = v.object({
  runtime: v.array(
    v.object({
      package: v.string(),
      version: v.string(),
      to: v.string(),
      files: v.record(v.string(), v.pipe(v.string(), v.hexadecimal())),
    }),
  ),
});
const Source = v.object({ commit: v.string(), files: v.record(v.string(), v.string()) });

const sha256 = (bytes: Buffer | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

interface OrtBuild {
  wasm: string;
  mjs: string;
  parts: string[];
  bytes: number;
  sha256: string;
}

/** Copies the pinned runtime into dist/, splitting what is too large; returns the ONNX Runtime builds. */
function copyRuntime(root: string, atr: string, outDir: string): Record<string, OrtBuild> {
  const pins = v.parse(Pins, JSON.parse(readFileSync(join(root, 'src/hosting/reception.json'), 'utf8')));
  const builds: Record<string, OrtBuild> = {};
  for (const r of pins.runtime) {
    const dir = join(outDir, r.to);
    mkdirSync(dir, { recursive: true });
    for (const [file, pinned] of Object.entries(r.files)) {
      const from = join(atr, 'node_modules', r.package, file);
      if (!existsSync(from)) throw new Error(`hosted build: ${r.package}/${file} is missing from ask-the-record's install`);
      const bytes = readFileSync(from);
      if (sha256(bytes) !== pinned)
        throw new Error(`hosted build: ${r.package}/${file} is not the pinned ${r.version}; run node scripts/vendor-reception.mjs`);
      const name = basename(file);
      if (name.endsWith('.wasm')) {
        const parts: string[] = [];
        if (bytes.length <= PART_BYTES) {
          writeFileSync(join(dir, name), bytes);
          parts.push(name);
        } else {
          for (let at = 0, i = 1; at < bytes.length; at += PART_BYTES, i++) {
            const part = name.replace(/\.wasm$/, `.part${i}.wasm`);
            writeFileSync(join(dir, part), bytes.subarray(at, at + PART_BYTES));
            parts.push(part);
          }
        }
        builds[name] = { wasm: name, mjs: name.replace(/\.wasm$/, '.mjs'), parts, bytes: bytes.length, sha256: pinned };
      } else {
        writeFileSync(join(dir, name), bytes);
      }
    }
  }
  for (const b of Object.values(builds))
    if (!existsSync(join(outDir, 'vendor/ort', b.mjs))) throw new Error(`hosted build: ${b.wasm} has no ${b.mjs} beside it`);
  copyFileSync(join(root, 'src/hosting/licences/onnxruntime-web.LICENSE'), join(outDir, 'vendor/ort/LICENSE'));
  return builds;
}

function writeRuntime(root: string, outDir: string, builds: Record<string, OrtBuild>): void {
  const template = readFileSync(join(root, 'src/hosting/runtime-hosted.js'), 'utf8');
  const token = '{} /* ORT_BUILDS */';
  if (!template.includes(token)) throw new Error('hosted build: runtime-hosted.js has no ORT_BUILDS to fill');
  writeFileSync(join(outDir, 'vendor/transformers/runtime-hosted.js'), template.replace(token, JSON.stringify(builds)));
  // The local runtime (ONNX Runtime from a folder on Harry's machine) is not part of the public site.
  rmSync(join(outDir, 'vendor/transformers/runtime.js'), { force: true });
}

/** The vendored element in dist/ must be exactly what its SOURCE.json records. */
function checkElement(outDir: string): void {
  const dir = join(outDir, 'vendor/ask-the-record');
  const source = v.parse(Source, JSON.parse(readFileSync(join(dir, 'SOURCE.json'), 'utf8')));
  for (const [file, pinned] of Object.entries(source.files))
    if (sha256(readFileSync(join(dir, file))) !== pinned)
      throw new Error(`hosted build: vendor/ask-the-record/${file} does not match its SOURCE.json`);
}

function copyRecord(root: string, outDir: string): void {
  const hosted = join(root, HOSTED_RECORD_DIR);
  const problems = checkHostedRecord(join(root, 'public/record'), hosted);
  if (problems.length)
    throw new Error(
      `hosted build: the hosted record is not the committed one redacted (run npm run record:hosted):\n  ${problems.join('\n  ')}`,
    );
  for (const f of RECORD_FILES) copyFileSync(join(hosted, f), join(outDir, 'record', f));
}

/** The loops' report keeps when each was recorded, not the local address it was recorded from. */
function stripReport(outDir: string): void {
  const path = join(outDir, 'loops/report.json');
  const report = v.parse(v.record(v.string(), v.looseObject({})), JSON.parse(readFileSync(path, 'utf8')));
  const out = Object.fromEntries(
    Object.entries(report).map(([k, entry]) => [k, Object.fromEntries(Object.entries(entry).filter(([f]) => f !== 'url'))]),
  );
  writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
}

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return htmlFiles(p);
    return f.endsWith('.html') ? [p] : [];
  });
}

/** A page for a path that does not exist, so Pages answers 404 rather than the studio (its default with no 404.html). */
function writeNotFound(outDir: string): void {
  const cv = readFileSync(join(outDir, 'cv.html'), 'utf8');
  const style = /<link rel="stylesheet"[^>]*href="(\/assets\/cv-[^"]+\.css)"/.exec(cv)?.[1];
  if (!style) throw new Error('hosted build: cv.html has no stylesheet for the 404 page');
  const html = `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Not here: Harry Freeman</title>
  <meta name="robots" content="noindex">
  <meta name="theme-color" content="#f0efea">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${style}">
</head>
<body>
  <nav class="cv-bar" aria-label="Site"><a href="/">The lobby</a></nav>
  <main class="cv">
    <h1>Nothing here</h1>
    <p>There is no page at this address. <a href="/">Go in at the door</a>, or read the <a href="/cv">CV</a>.</p>
  </main>
</body>
</html>
`;
  writeFileSync(join(outDir, '404.html'), html);
}

function writeHeaders(root: string, outDir: string, indexable: boolean): void {
  const pages = htmlFiles(outDir).map((f) => readFileSync(f, 'utf8'));
  const hashes = pages.flatMap(inlineScriptHashes);
  const styleHashes = pages.flatMap(styleAttributeHashes);
  const template = readFileSync(join(root, 'public/_headers'), 'utf8');
  writeFileSync(join(outDir, '_headers'), fillHeaders(template, { hashes, styleHashes, indexable }));
  writeFileSync(join(outDir, 'robots.txt'), robotsTxt(indexable));
}

export function hosting(options: { root: string; atr: string }): Plugin {
  const config = readHostingConfig(options.root);
  let outDir = '';
  return {
    name: 'hosting',
    apply: 'build',
    enforce: 'post',
    configResolved(resolved) {
      outDir = join(options.root, resolved.build.outDir);
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const page = pageOf(ctx.filename);
        if (!page) throw new Error(`hosted build: no hosting rules for ${ctx.filename}`);
        return hostedHtml(html, page, config.origin);
      },
    },
    closeBundle() {
      checkElement(outDir);
      writeRuntime(options.root, outDir, copyRuntime(options.root, options.atr, outDir));
      copyRecord(options.root, outDir);
      stripReport(outDir);
      writeNotFound(outDir);
      writeHeaders(options.root, outDir, config.SITE_INDEXABLE);
    },
  };
}
