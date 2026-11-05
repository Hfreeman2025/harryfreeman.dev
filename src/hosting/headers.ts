// public/_headers is a template: the hosted build fills in the hashes of the pages' inline scripts and
// applies the indexing switch, and writes robots.txt to match. Pure functions, so the gate and the
// tests use exactly what the build does.

import { createHash } from 'node:crypto';

export const HASHES_TOKEN = '__INLINE_SCRIPT_HASHES__';
/** Cloudflare Pages reads at most 2,000 characters a line of _headers. */
export const MAX_HEADER_LINE = 2000;
const ROBOTS_LINE = /^\s*X-Robots-Tag:.*$/im;

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
    hashes.push(
      `'sha256-${createHash('sha256')
        .update(m[2] ?? '', 'utf8')
        .digest('base64')}'`,
    );
  }
  return hashes;
}

export interface HeaderOptions {
  readonly hashes: readonly string[];
  readonly indexable: boolean;
}

/** _headers for Cloudflare Pages from the template. Throws if the template is not one it can fill. */
export function fillHeaders(template: string, { hashes, indexable }: HeaderOptions): string {
  if (!template.includes(HASHES_TOKEN)) throw new Error(`_headers has no ${HASHES_TOKEN} to fill`);
  if (!ROBOTS_LINE.test(template)) throw new Error('_headers has no X-Robots-Tag line for the indexing switch');
  let out = template.replaceAll(HASHES_TOKEN, [...new Set(hashes)].sort().join(' '));
  if (indexable) out = out.replace(new RegExp(ROBOTS_LINE.source, 'gim'), '').replace(/\n{3,}/g, '\n\n');
  for (const line of out.split('\n'))
    if (line.length > MAX_HEADER_LINE) throw new Error(`a _headers line is ${line.length} characters, over Pages' ${MAX_HEADER_LINE}`);
  return out;
}

export function robotsTxt(indexable: boolean): string {
  return indexable ? 'User-agent: *\nAllow: /\n' : 'User-agent: *\nDisallow: /\n';
}

/** The Content-Security-Policy value in a filled _headers file (for the gate and the checks). */
export function cspOf(headers: string): string | null {
  return /^\s*Content-Security-Policy:\s*(.+)$/im.exec(headers)?.[1]?.trim() ?? null;
}
