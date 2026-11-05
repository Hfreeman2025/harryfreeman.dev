// The hosted record. `VITE_HOSTED=1 npm run record:ask` rebuilds Reception's record from exactly the
// sources the committed record (public/record/) was built from, each found by the SHA-256 recorded in
// its sources.json: the file as it is now, or else the version in its repository's history. Local
// addresses and paths are redacted (redact.ts) and the result goes to .cache/hosted-record/, which the
// hosted build copies over dist/record/ only after checkHostedRecord has compared it with the committed one.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import * as v from 'valibot';
import { hasLocal, LOCAL_MARKER, redactLocal } from './redact';

export const HOSTED_RECORD_DIR = '.cache/hosted-record';
export const RECORD_FILES = ['studio.json', 'lines.json', 'sources.json', 'suggestions.json'] as const;

const Sources = v.object({
  sources: v.array(
    v.object({ section: v.string(), piece: v.nullable(v.string()), path: v.string(), sha256: v.string(), bytes: v.number() }),
  ),
});
const Studio = v.object({
  sections: v.array(v.object({ title: v.string() })),
  facts: v.array(v.object({ text: v.string(), section: v.nullable(v.number()), line: v.number() })),
  embeddings: v.object({ model: v.string(), dims: v.number() }),
});
const Lines = v.object({
  lines: v.number(),
  sections: v.array(v.object({ key: v.string(), title: v.string(), from: v.number(), to: v.number(), html: v.string() })),
});

const sha256 = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex');
const readJson = <T extends v.GenericSchema>(schema: T, path: string): v.InferOutput<T> =>
  v.parse(schema, JSON.parse(readFileSync(path, 'utf8')));

/** The version of `abs` whose SHA-256 is `expected`: the file itself, or a commit of it in its repository. */
export function exactVersion(abs: string, expected: string): string {
  if (existsSync(abs)) {
    const now = readFileSync(abs);
    if (sha256(now) === expected) return now.toString('utf8');
  }
  const repo = execFileSync('git', ['-C', dirname(abs), 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const path = relative(repo, abs);
  const revs = execFileSync('git', ['-C', repo, 'rev-list', '--all', '--', path], { encoding: 'utf8' }).split('\n').filter(Boolean);
  for (const rev of revs) {
    const blob = execFileSync('git', ['-C', repo, 'show', `${rev}:${path}`], { maxBuffer: 64 * 1024 * 1024 });
    if (sha256(blob) === expected) return blob.toString('utf8');
  }
  throw new Error(`no version of ${path} in ${repo} has SHA-256 ${expected.slice(0, 12)}…, the one the committed record was built from`);
}

export interface HostedSources {
  /** Where the hosted record is written. */
  readonly out: string;
  /** The exact text the committed record used for the source it lists as `key`. */
  read(key: string, abs: string): string;
  /** The same text with local addresses and paths replaced by the marker. */
  redact(text: string): string;
  /** How a source is named in the hosted sources.json: its tool and file, no machine path. */
  path(key: string, piece: string | null): string;
  /** Spans redacted so far. */
  readonly spans: number;
}

export function hostedSources(site: string): HostedSources {
  const committed = readJson(Sources, join(site, 'public/record/sources.json')).sources;
  let spans = 0;
  return {
    out: join(site, HOSTED_RECORD_DIR),
    read(key, abs) {
      const source = committed.find((s) => s.path === key);
      if (!source) throw new Error(`${key} is not among the committed record's sources`);
      return exactVersion(abs, source.sha256);
    },
    redact(text) {
      const r = redactLocal(text);
      spans += r.spans;
      return r.text;
    },
    path: (key, piece) => (piece ? `${piece}/README.md` : key),
    get spans() {
      return spans;
    },
  };
}

/**
 * Compares the hosted record with the committed one and returns every difference that is not a
 * redaction: the same sources (by SHA-256), the same sections and source lines, every fact on the
 * same section and line, any fact whose text changed carrying the marker, and nothing local left.
 */
export function checkHostedRecord(committedDir: string, hostedDir: string): string[] {
  const problems: string[] = [];
  for (const f of RECORD_FILES) if (!existsSync(join(hostedDir, f))) problems.push(`${f} is missing from ${hostedDir}`);
  if (problems.length) return problems;

  const shas = (dir: string) => readJson(Sources, join(dir, 'sources.json')).sources.map((s) => `${s.section}:${s.sha256}`);
  if (shas(committedDir).join('\n') !== shas(hostedDir).join('\n')) problems.push('the hosted record was built from other sources');

  const a = readJson(Studio, join(committedDir, 'studio.json'));
  const b = readJson(Studio, join(hostedDir, 'studio.json'));
  if (a.embeddings.model !== b.embeddings.model || a.embeddings.dims !== b.embeddings.dims) problems.push('the embedding model differs');
  if (a.sections.map((s) => s.title).join('\n') !== b.sections.map((s) => s.title).join('\n')) problems.push('the sections differ');
  const place = (f: { section: number | null; line: number }) => `${f.section}:${f.line}`;
  const tally = (facts: ReadonlyArray<{ section: number | null; line: number }>) => {
    const m = new Map<string, number>();
    for (const f of facts) m.set(place(f), (m.get(place(f)) ?? 0) + 1);
    return m;
  };
  const ta = tally(a.facts);
  const tb = tally(b.facts);
  for (const k of new Set([...ta.keys(), ...tb.keys()]))
    if (ta.get(k) !== tb.get(k)) problems.push(`facts at section:line ${k}: ${ta.get(k) ?? 0} committed, ${tb.get(k) ?? 0} hosted`);
  // Facts at the same place, in order: unchanged, or redacted.
  const byPlace = (facts: typeof a.facts) => {
    const m = new Map<string, Array<(typeof facts)[number]>>();
    for (const f of facts) m.set(place(f), [...(m.get(place(f)) ?? []), f]);
    return m;
  };
  const pa = byPlace(a.facts);
  for (const [k, hostedFacts] of byPlace(b.facts)) {
    hostedFacts.forEach((f, i) => {
      const before = pa.get(k)?.[i]?.text;
      if (before !== undefined && before !== f.text && !f.text.includes(LOCAL_MARKER))
        problems.push(`the fact at ${k} changed without a redaction`);
    });
  }

  const la = readJson(Lines, join(committedDir, 'lines.json'));
  const lb = readJson(Lines, join(hostedDir, 'lines.json'));
  if (la.lines !== lb.lines) problems.push(`source lines: ${la.lines} committed, ${lb.lines} hosted`);
  const spans = (l: typeof la) => l.sections.map((s) => `${s.key}:${s.from}-${s.to}`).join(' ');
  if (spans(la) !== spans(lb)) problems.push('the README sections sit on other lines');

  for (const f of RECORD_FILES) {
    const text = readFileSync(join(hostedDir, f), 'utf8');
    if (hasLocal(text)) problems.push(`${f} still carries a local address or path`);
  }
  return problems;
}
