// public/_headers is a template: the hosted build fills in the hashes of the pages' inline scripts and
// style attributes, derives the terminal page's policy from the main one, applies the indexing switch,
// and writes robots.txt to match. Pure functions, so the gate and the tests use exactly what the build does.

import { createHash } from 'node:crypto';

export const HASHES_TOKEN = '__INLINE_SCRIPT_HASHES__';
export const STYLE_HASHES_TOKEN = '__INLINE_STYLE_HASHES__';
export const TERMINAL_TOKEN = '__TERMINAL_CSP__';
/** Cloudflare Pages reads at most 2,000 characters a line of _headers. */
export const MAX_HEADER_LINE = 2000;
const ROBOTS_LINE = /^\s*X-Robots-Tag:.*$/im;

/**
 * The one difference the terminal page's policy may have: xterm.js writes its theme and cell sizes
 * into <style> elements it creates, from fonts measured in the browser, so they cannot be hashed ahead.
 */
export const TERMINAL_STYLE_ELEM = "style-src-elem 'self' 'unsafe-inline'";

const sha = (text: string): string => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

/** Script types the browser runs, so a Content-Security-Policy must allow them; data blocks are not. */
const RUNNABLE = new Set(['', 'module', 'text/javascript', 'application/javascript', 'importmap']);

/** The CSP source for each inline script in a page: 'sha256-…' over its exact text. */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script\s*>/gi)) {
    const attrs = m[1] ?? '';
    if (/\ssrc\s*=/i.test(attrs)) continue;
    const type = /\stype\s*=\s*["']?([^"'\s>]*)/i.exec(attrs)?.[1]?.toLowerCase() ?? '';
    if (!RUNNABLE.has(type)) continue;
    hashes.push(sha(m[2] ?? ''));
  }
  return hashes;
}

/** The CSP source for each style attribute in a page's markup (style-src-attr 'unsafe-hashes'). */
export function styleAttributeHashes(html: string): string[] {
  const markup = html.replace(/<script[\s\S]*?<\/script\s*>/gi, '');
  return [...markup.matchAll(/<[a-z][^>]*?\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => sha(m[1] ?? m[2] ?? ''));
}

export interface HeaderOptions {
  readonly hashes: readonly string[];
  readonly styleHashes: readonly string[];
  readonly indexable: boolean;
}

/** One policy's directives, by name. */
export function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter((d) => d[0])
      .map((d) => [(d[0] ?? '').toLowerCase(), d.slice(1)]),
  );
}

/** The terminal page's policy: the main one with only style-src-elem widened. */
export function terminalPolicy(csp: string): string {
  if (!/(^|;\s*)style-src-elem\s/.test(csp)) throw new Error('the policy has no style-src-elem to widen for the terminal page');
  return csp.replace(/style-src-elem [^;]*/, TERMINAL_STYLE_ELEM);
}

const list = (sources: readonly string[]) => [...new Set(sources)].sort().join(' ');

/** _headers for Cloudflare Pages from the template. Throws if the template is not one it can fill. */
export function fillHeaders(template: string, { hashes, styleHashes, indexable }: HeaderOptions): string {
  for (const token of [HASHES_TOKEN, STYLE_HASHES_TOKEN, TERMINAL_TOKEN])
    if (!template.includes(token)) throw new Error(`_headers has no ${token} to fill`);
  if (!ROBOTS_LINE.test(template)) throw new Error('_headers has no X-Robots-Tag line for the indexing switch');
  // Tokens are filled in rule lines only; comments may name them.
  const fill = (text: string, token: string, value: string) =>
    text
      .split('\n')
      .map((line) => (/^\s*#/.test(line) ? line : line.replaceAll(token, value)))
      .join('\n');
  let out = fill(fill(template, HASHES_TOKEN, list(hashes)), STYLE_HASHES_TOKEN, list(styleHashes));
  const main = cspOf(out);
  if (!main || main.includes(TERMINAL_TOKEN)) throw new Error('_headers has no main Content-Security-Policy before the terminal one');
  out = fill(out, TERMINAL_TOKEN, terminalPolicy(main));
  if (indexable) out = out.replace(new RegExp(ROBOTS_LINE.source, 'gim'), '').replace(/\n{3,}/g, '\n\n');
  for (const line of out.split('\n'))
    if (line.length > MAX_HEADER_LINE) throw new Error(`a _headers line is ${line.length} characters, over Pages' ${MAX_HEADER_LINE}`);
  return out;
}

export function robotsTxt(indexable: boolean): string {
  return indexable ? 'User-agent: *\nAllow: /\n' : 'User-agent: *\nDisallow: /\n';
}

export interface HeaderRule {
  readonly path: string;
  readonly set: ReadonlyArray<readonly [name: string, value: string]>;
  readonly detach: readonly string[];
}

/** _headers as Pages reads it: a path, then its indented headers; "! Name" detaches a header. */
export function parseHeaders(text: string): HeaderRule[] {
  const rules: Array<{ path: string; set: Array<[string, string]>; detach: string[] }> = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    if (!/^\s/.test(line)) {
      rules.push({ path: line.trim(), set: [], detach: [] });
      continue;
    }
    const rule = rules.at(-1);
    if (!rule) continue;
    const detach = /^\s*!\s*([\w-]+)\s*$/.exec(line);
    if (detach?.[1]) rule.detach.push(detach[1].toLowerCase());
    else {
      const m = /^\s*([\w-]+):\s*(.*)$/.exec(line);
      if (m?.[1]) rule.set.push([m[1].toLowerCase(), (m[2] ?? '').trim()]);
    }
  }
  return rules;
}

/** The main Content-Security-Policy (the first one) in a filled _headers file. */
export function cspOf(headers: string): string | null {
  return /^\s*Content-Security-Policy:\s*(.+)$/im.exec(headers)?.[1]?.trim() ?? null;
}
