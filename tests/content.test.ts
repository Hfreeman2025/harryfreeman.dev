import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { piecesQuoted, sourceOf } from '../src/ask';
import { parseConfig } from '../src/content/config';
import { DRAWERS } from '../src/content/drawers';
import { PIECE_IDS, PIECES } from '../src/content/pieces';
import { esc, openLabel, renderList, renderRoomLabels } from '../src/content/render';
import { parseCast } from '../src/terminal-cast';
import placeholder from '../src/timeline/placeholder.json' with { type: 'json' };
import { parseTimeline } from '../src/timeline/schema';

const config = parseConfig(JSON.parse(readFileSync(new URL('../site.config.json', import.meta.url), 'utf8')));

describe('content', () => {
  it('has ten pieces, each with a line, checks and the three briefs', () => {
    expect(PIECES.map((p) => p.id)).toEqual([...PIECE_IDS]);
    for (const p of PIECES) {
      expect(p.line.length).toBeGreaterThan(20);
      expect(p.checks.length).toBeGreaterThanOrEqual(3);
      expect(p.brief.map((b) => b.doc)).toEqual(['BRIEF.md', 'V2.md', 'V3.md']);
    }
  });

  it('names no employer and no client anywhere a visitor reads', () => {
    const text = [
      readFileSync(new URL('../src/content/cv.md', import.meta.url), 'utf8'),
      JSON.stringify(PIECES),
      readFileSync(new URL('../index.html', import.meta.url), 'utf8'),
    ].join('\n');
    expect(text).not.toMatch(/Simply\s*(Sustainable|Carbon)/i);
    expect(text).not.toMatch(/redacted-term|redacted-term|redacted-term|redacted-term/);
  });

  it('carries the CV’s once-unconfirmed claims, made generic, with nothing that identifies a client', () => {
    const cv = readFileSync(new URL('../src/content/cv.md', import.meta.url), 'utf8');
    for (const generic of [
      'a large listed company',
      'A capacity forecast is shared with the CEO',
      'from project-based consulting to a platform product',
      'approved by the CEO in May 2026',
      'gated Claude Code programme',
      'and a Teams assistant',
      'first AI policy in July 2025',
      'IEMA since 2022',
      'RICS since 2019',
    ]) {
      expect(cv).toContain(generic);
    }
    for (const identifying of ['redacted-term', 'redacted-term', 'Simply', 'redacted-term']) expect(cv).not.toContain(identifying);
  });

  it('validates the config and rejects a dead URL', () => {
    expect(config.pieces.gridtop).toBe('/terminal.html?piece=gridtop');
    expect(() => parseConfig({ ...config, pieces: { ...config.pieces, sourced: 'not a url' } })).toThrow(/pieces.sourced/);
    expect(() => parseConfig({ ...config, pieces: { ...config.pieces, extra: '/x' } })).toThrow();
  });
});

describe('render', () => {
  const timeline = parseTimeline(placeholder);

  it('escapes HTML', () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('renders every object in the room as a real link or button, hidden until the room places it', () => {
    const labels = renderRoomLabels();
    for (const id of PIECE_IDS) {
      expect(labels).toContain(`data-target="desk:${id}" data-at="door"`);
      expect(labels).toContain(`href="#folder-${id}" data-target="folder:${id}" data-at="cabinet" data-place="centre"`);
    }
    for (const d of DRAWERS)
      expect(labels).toContain(`data-target="drawer:${d.id}" data-at="cabinet" data-place="cover" aria-expanded="false"`);
    for (const target of ['cabinet', 'reception', 'brief', 'reviewer', 'board']) expect(labels).toContain(`data-target="${target}"`);
    const tags = labels.match(/<(a|button) [^>]*>/g) ?? [];
    expect(tags.length).toBe(2 + 10 + 3 + 4 + 10);
    for (const tag of tags) expect(tag).toMatch(/^<(a|button) hidden tabindex="0" /);
  });

  it('files each drawer’s folders straight after it, so Tab goes from a drawer into its folders', () => {
    const order = [...renderRoomLabels().matchAll(/data-target="((drawer|folder):[^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(DRAWERS.flatMap((d) => [`drawer:${d.id}`, ...d.pieces.map((p) => `folder:${p}`)]));
  });

  it('renders the list with open links from the config and labels the placeholder', () => {
    const list = renderList(config, timeline);
    for (const id of PIECE_IDS) expect(list).toContain(`id="work-${id}"`);
    expect(list).toContain('href="http://127.0.0.1:4317/"');
    expect(list.match(/placeholder timeline, not the real record/g)?.length).toBe(10);
    expect(openLabel(PIECES[0]!, 'http://127.0.0.1:4180/')).toContain('port 4180');
    expect(openLabel(PIECES.find((p) => p.kind === 'terminal')!, '/terminal.html?piece=gridtop')).toContain('recorded terminal session');
  });

  it('does not label a real timeline as a placeholder', () => {
    const list = renderList(config, { ...timeline, placeholder: false });
    expect(list).not.toContain('placeholder timeline');
    expect(list).toContain('the times are inferred');
  });

  it('links each entry in the list back to its folder in the cabinet', () => {
    expect(renderList(config, timeline)).toContain('<a href="#folder-gridtop" data-piece="gridtop">Pull its folder from the cabinet</a>');
  });
});

describe('ask', () => {
  const quote = (title: string) => ({ sections: [{ title: 'Ask the studio' }, { title }] });

  it('lights the desks whose READMEs an answer quoted, not the CV', () => {
    expect(
      piecesQuoted({ kind: 'answer', quotes: [quote('gridtop'), quote('Harry Freeman’s CV'), quote('gridtop'), quote('Agent Race')] }),
    ).toEqual(['gridtop', 'agent-race']);
  });

  it('lights nothing for a refusal or a malformed result', () => {
    expect(piecesQuoted({ kind: 'refusal', quotes: [quote('gridtop')] })).toEqual([]);
    expect(piecesQuoted(null)).toEqual([]);
    expect(piecesQuoted({ kind: 'answer', quotes: [{ sections: 'nope' }] })).toEqual([]);
  });
});

describe('quote sources', () => {
  it('sends a README quote to its desk and a CV quote to the CV at its words', () => {
    expect(sourceOf({ sections: [{ title: 'Ask the studio' }, { title: 'Sourced' }], fact: { text: 'x' } })).toEqual({ piece: 'sourced' });
    expect(
      sourceOf({
        sections: [{ title: 'Ask the studio' }, { title: 'Harry Freeman’s CV' }],
        fact: { text: 'He led EU AI Act readiness: he briefed leadership, audited 24 AI products' },
      }),
    ).toEqual({
      cv: `/cv.html#:~:text=${encodeURIComponent('He led EU AI Act readiness: he briefed')}`,
    });
    expect(
      sourceOf({ sections: [{ title: 'Ask the studio' }, { title: 'Harry Freeman’s CV' }], fact: { text: 'Build, buy and retire-ready' } }),
    ).toEqual({
      cv: '/cv.html#:~:text=Build%2C%20buy%20and%20retire%2Dready',
    });
    expect(sourceOf(null)).toBeNull();
  });
});

describe('terminal recordings', () => {
  it('parses an asciicast, shortens long idle gaps and stops before leaving the alternate screen', () => {
    const cast = [
      JSON.stringify({ version: 2, width: 80, height: 24 }),
      JSON.stringify([0.5, 'o', '\u001b[?1049hhello']),
      JSON.stringify([1, 'i', 'typed']),
      JSON.stringify([10, 'o', 'world']),
      JSON.stringify([10.2, 'o', '\u001b[?1049l']),
    ].join('\n');
    const parsed = parseCast(cast);
    expect(parsed.width).toBe(80);
    expect(parsed.events.map((e) => e[1])).toEqual(['\u001b[?1049hhello', 'world']);
    expect(parsed.events[1]?.[0]).toBeCloseTo(3, 5);
  });

  it('rejects a recording that is not asciicast v2', () => {
    expect(() => parseCast(JSON.stringify({ version: 1, width: 80, height: 24 }))).toThrow();
    expect(() => parseCast('')).toThrow(/empty/);
  });

  it('parses both bundled recordings', () => {
    for (const id of ['gridtop', 'dreaming']) {
      const cast = parseCast(readFileSync(new URL(`../public/casts/${id}.cast`, import.meta.url), 'utf8'));
      expect(cast.events.length).toBeGreaterThan(10);
    }
  });
});
