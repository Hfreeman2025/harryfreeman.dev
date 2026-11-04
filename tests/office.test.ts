import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DRAWERS, drawerOf } from '../src/content/drawers';
import { PIECE_IDS } from '../src/content/pieces';
import { renderCabinet, renderDirectory, renderPlan } from '../src/office/render';
import { DESKS } from '../src/scene/layout';

describe('the filing', () => {
  it('files every tool exactly once, in one of four drawers', () => {
    const filed = DRAWERS.flatMap((d) => d.pieces);
    expect(filed.sort()).toEqual([...PIECE_IDS].sort());
    expect(new Set(filed).size).toBe(PIECE_IDS.length);
    expect(DRAWERS).toHaveLength(4);
    expect(drawerOf('receipts').id).toBe('agents');
    expect(drawerOf('sourced').position).toBe('Bottom drawer');
  });
});

describe('the directory board', () => {
  it('lists every tool as a real link with where to find it', () => {
    const html = renderDirectory();
    for (const id of PIECE_IDS) expect(html).toContain(`href="#work-${id}" data-piece="${id}"`);
    expect(html.match(/class="board__where"/g)).toHaveLength(PIECE_IDS.length);
    expect(html).toContain('Top drawer');
  });
});

describe('the cabinet', () => {
  const html = renderCabinet();

  it('has a button per drawer, closed, controlling an inert tray', () => {
    expect(html.match(/class="drawer__front" aria-expanded="false" aria-controls="tray-/g)).toHaveLength(4);
    expect(html.match(/class="drawer__tray" id="tray-\w+" inert/g)).toHaveLength(4);
  });

  it('holds a folder per tool, out of the tab order until its drawer opens, tabs cut left, centre and right', () => {
    expect(html.match(/class="folder"/g)).toHaveLength(PIECE_IDS.length);
    expect(html.match(/tabindex="-1"/g)).toHaveLength(PIECE_IDS.length);
    expect(html).toContain('data-cut="left"');
    expect(html).toContain('data-cut="centre"');
    expect(html).toContain('data-cut="right"');
  });
});

describe('the floor plan', () => {
  const svg = renderPlan();

  it('draws every desk as a link with its prop, the builders and the reviewer', () => {
    expect(svg.match(/class="plan-desk" href="#work-/g)).toHaveLength(PIECE_IDS.length);
    expect(svg.match(/class="prop"/g)).toHaveLength(PIECE_IDS.length);
    expect(svg.match(/class="plan-figure"/g)).toHaveLength(PIECE_IDS.length);
    expect(svg).toContain('plan-figure--reviewer');
    expect(svg).toContain('You are here');
  });

  it('puts each desk name above its desk, clear of the chair and the builder', () => {
    for (const d of DESKS) {
      const label = new RegExp(`data-piece="${d.piece}"[\\s\\S]*?<text class="plan-label" x="[^"]+" y="([^"]+)"`).exec(svg);
      const y = Number(label?.[1]);
      // The baseline sits above the desk's back edge, so the text clears desk, chair and dot.
      expect(y).toBeLessThan(d.z - 0.4);
      expect(y).toBeGreaterThan(d.z - 1.2);
    }
  });
});

describe('the office page', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  it('labels recorded and live, and names no employer or client', () => {
    expect(html).toContain('recorded loop');
    expect(html).toContain('open it live');
    expect(html).not.toMatch(/Simply\s*(Sustainable|Carbon)|redacted-term|redacted-term|redacted-term/);
  });

  it('carries both timeline notes, placeholder and reconstructed', () => {
    expect(html).toContain('replay__note--placeholder');
    expect(html).toContain('every time is inferred');
  });
});
