// Builds the record Ask the studio answers from: Harry's CV (src/content/cv.md, the confirmed
// parts only) and the ten projects' READMEs, read from their folders. Uses ask-the-record's own
// build and embedding code from its local path, read-only; the embedding model comes from that
// project's existing cache, so nothing is downloaded.
//
//   npm run record:ask
//
// Writes public/record/studio.json, public/record/suggestions.json and public/record/sources.json.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PIECES } from '../src/content/pieces';

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..');
const personal = join(site, '..');
const atr = join(personal, 'oss', 'ask-the-record');
const out = join(site, 'public', 'record');
const tmp = join(site, '.tmp');
mkdirSync(out, { recursive: true });
mkdirSync(tmp, { recursive: true });

export const CV_SECTION = 'Harry Freeman’s CV';

export const SUGGESTED = [
  'What did Harry do about the EU AI Act?',
  'How does gridtop choose when to run?',
  'What happens if you change one byte?',
];

/** Demote a README's headings under its desk's heading, and drop what reads badly as a quote. */
function adapt(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const kept: string[] = [];
  let inFence = false;
  let skippedTitle = false;
  for (const line of lines) {
    if (/^(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence) {
      if (!skippedTitle && /^#\s/.test(line)) {
        skippedTitle = true;
        continue;
      }
      if (/^!\[/.test(line.trim())) continue; // images
      if (/^<\/?sub>|^<!--/.test(line.trim())) continue; // captions and markers
      const heading = /^(#{1,6})\s+(.*)$/.exec(line);
      if (heading?.[1] && heading[2]) {
        kept.push(`${'#'.repeat(Math.min(6, heading[1].length + 1))} ${heading[2]}`);
        continue;
      }
    }
    kept.push(line);
  }
  return kept.join('\n');
}

const sources: Array<{ section: string; piece: string | null; path: string; sha256: string; bytes: number }> = [];
const parts: string[] = ['# Ask the studio', ''];

const cvPath = join(site, 'src', 'content', 'cv.md');
const cv = readFileSync(cvPath, 'utf8');
parts.push(`## ${CV_SECTION}`, '', adapt(cv), '');
sources.push({ section: CV_SECTION, piece: null, path: 'src/content/cv.md', sha256: sha(cv), bytes: Buffer.byteLength(cv) });

for (const piece of PIECES) {
  const rel = `${piece.folder}/${piece.id}/README.md`;
  const text = readFileSync(join(personal, rel), 'utf8');
  parts.push(`## ${piece.title}`, '', adapt(text), '');
  sources.push({ section: piece.title, piece: piece.id, path: `~/Personal/${rel}`, sha256: sha(text), bytes: Buffer.byteLength(text) });
}

function sha(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

const markdown = parts.join('\n');
const mdPath = join(tmp, 'studio.md');
writeFileSync(mdPath, markdown);

type Build = typeof import('../../oss/ask-the-record/src/cli/build');
type Embed = typeof import('../../oss/ask-the-record/src/cli/embed');
type Vector = typeof import('../../oss/ask-the-record/src/core/vector');
const { build } = (await import(pathToFileURL(join(atr, 'src/cli/build.ts')).href)) as Build;
const { DEFAULT_MODEL, loadEmbedder } = (await import(pathToFileURL(join(atr, 'src/cli/embed.ts')).href)) as Embed;
const { encodeBase64 } = (await import(pathToFileURL(join(atr, 'src/core/vector.ts')).href)) as Vector;

const record = await build({
  input: mdPath,
  output: join(out, 'studio.json'),
  title: 'Ask the studio',
  language: 'en',
  embed: true,
  model: DEFAULT_MODEL,
  dtype: 'q8',
  pooling: 'mean',
  queryPrefix: '',
  passagePrefix: '',
  map: false,
  log: (line) => console.log(line),
});

const e = record.embeddings;
if (!e) throw new Error('the record was built without embeddings');
const embedder = await loadEmbedder({ model: e.model, dtype: 'q8', pooling: e.pooling });
try {
  const vectors = await embedder.embed(SUGGESTED.map((q) => e.queryPrefix + q));
  const suggestions = {
    about: 'Suggested questions, embedded at build time with the record’s own model, so their answers need no download.',
    model: e.model,
    questions: SUGGESTED.map((question, i) => {
      const v = vectors[i] ?? new Float32Array();
      return { question, vector: encodeBase64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
    }),
  };
  writeFileSync(join(out, 'suggestions.json'), `${JSON.stringify(suggestions)}\n`);
} finally {
  await embedder.dispose();
}

writeFileSync(join(out, 'sources.json'), `${JSON.stringify({ builtAt: new Date().toISOString(), sources }, null, 2)}\n`);
console.log(`record: ${record.facts.length} facts from ${sources.length} sources`);
