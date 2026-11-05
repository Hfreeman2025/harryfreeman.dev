// Names that must never appear on the site (the employer, clients) are kept outside every repository, at
// ~/Personal/.site-gate/denylist.txt (one per line, # comments), so no test spells them out. A test that
// needs them skips where the file is absent; a hit is reported by its line in that file, never by name.

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DENYLIST = join(homedir(), 'Personal', '.site-gate', 'denylist.txt');
export const haveDenylist = existsSync(DENYLIST);

/** The denylist lines whose names appear in the text, ignoring case. */
export function denylisted(text: string): number[] {
  const lower = text.toLowerCase();
  const found: number[] = [];
  for (const [i, raw] of readFileSync(DENYLIST, 'utf8').split('\n').entries()) {
    const entry = raw.trim().toLowerCase();
    if (entry && !entry.startsWith('#') && lower.includes(entry)) found.push(i + 1);
  }
  return found;
}
