// Server-side HTML for the office: the directory (the quiet index), the filing cabinet and the floor
// plan. Rendered into index.html at build time, so every tool is a real link before any script.

import { DRAWERS } from '../content/drawers';
import { type PieceId, pieceById } from '../content/pieces';
import { esc } from '../content/render';
import { BOARD, BRIEF, CABINET, DESKS, deskFor, RECEPTION, REVIEW, ROOM, SHELF, SIGN } from '../scene/layout';

/** The directory: the ten tools in drawer order, as plain links (the quiet index along the desk's foot). */
export function renderDirectory(): string {
  const tools = DRAWERS.flatMap((d) =>
    d.pieces.map((p) => `<li><a href="#work-${p}" data-piece="${p}">${esc(pieceById(p).title)}</a></li>`),
  ).join('');
  return `<ul class="index__tools">${tools}</ul>`;
}

export function renderCabinet(): string {
  const drawers = DRAWERS.map((d, i) => {
    const folders = d.pieces
      .map(
        (p, f) =>
          `<a class="folder" href="#work-${p}" data-piece="${p}" data-cut="${['left', 'centre', 'right'][f] ?? 'left'}" style="--f:${f}" tabindex="-1"><span class="folder__tab">${esc(pieceById(p).title)}</span><span class="folder__edge" aria-hidden="true"></span></a>`,
      )
      .join('');
    return `<div class="drawer" id="drawer-${d.id}" data-drawer="${d.id}" style="--i:${i}">
  <button type="button" class="drawer__front" aria-expanded="false" aria-controls="tray-${d.id}">
    <span class="drawer__holder"><span class="drawer__label">${esc(d.label)}</span><span class="drawer__contents">${d.pieces.map((p) => esc(pieceById(p).title)).join(', ')}</span></span>
    <span class="drawer__handle" aria-hidden="true"></span>
  </button>
  <div class="drawer__tray" id="tray-${d.id}" inert>${folders}</div>
</div>`;
  }).join('\n');
  return `<div class="cabinet" style="--drawers:${DRAWERS.length}">
  <div class="cabinet__top" aria-hidden="true"></div>
  <div class="cabinet__side" aria-hidden="true"></div>
  <div class="cabinet__face" aria-hidden="true"></div>
  ${drawers}
  <div class="cabinet__plinth" aria-hidden="true"></div>
</div>`;
}

// --- the floor plan -------------------------------------------------------------------------------
// Drawn in metres from the same plan as the light bake and the 3D room.

const VIEW = { x0: -7.6, z0: -5.5, x1: 7.6, z1: 5.9 } as const;

const r = (n: number) => Math.round(n * 1000) / 1000;

/** A small top-view prop on each desk that says what the tool does. */
function prop(piece: PieceId, x: number, z: number): string {
  const g = (body: string) => `<g class="prop" transform="translate(${r(x + 0.38)} ${r(z + 0.05)})">${body}</g>`;
  switch (piece) {
    case 'gpt-in-a-tab': // an oscilloscope, its trace falling as the loss does
      return g(
        '<rect x="-0.24" y="-0.18" width="0.48" height="0.34" class="p-dark"/><path d="M-0.2 -0.1 C -0.12 -0.1 -0.1 0.02 0 0.04 S 0.12 0.1 0.2 0.1" class="p-trace"/>',
      );
    case 'real-or-hallucinated': // a news page with a red correction
      return g(
        '<rect x="-0.2" y="-0.2" width="0.4" height="0.36" class="p-paper"/><path d="M-0.14 -0.1 H0.14 M-0.14 -0.02 H0.14 M-0.14 0.06 H0.06" class="p-ink"/><path d="M-0.16 -0.02 H0.16" class="p-red"/>',
      );
    case 'agent-race': // a stopwatch
      return g(
        '<circle r="0.17" class="p-paper"/><path d="M0 -0.17 V-0.23 M0 0 L0.09 -0.08" class="p-ink"/><circle r="0.025" class="p-fill"/>',
      );
    case 'grid-weather': // a weather chart with isobars
      return g(
        '<rect x="-0.22" y="-0.2" width="0.44" height="0.38" class="p-sea"/><path d="M-0.18 0.1 C -0.1 -0.12 0.08 -0.12 0.18 0.06 M-0.12 0.14 C -0.04 -0.02 0.06 -0.02 0.13 0.12" class="p-isobar"/>',
      );
    case 'gridtop': // a terminal and a clock
      return g(
        '<rect x="-0.24" y="-0.16" width="0.32" height="0.26" class="p-dark"/><path d="M-0.2 -0.08 L-0.15 -0.04 L-0.2 0 M-0.13 0.02 H-0.06" class="p-term"/><circle cx="0.17" cy="0.02" r="0.08" class="p-paper"/><path d="M0.17 0.02 V-0.03 M0.17 0.02 H0.21" class="p-ink"/>',
      );
    case 'listen-to-the-grid': // a score on a music stand
      return g(
        '<rect x="-0.22" y="-0.18" width="0.44" height="0.32" class="p-paper"/><path d="M-0.18 -0.12 H0.18 M-0.18 -0.08 H0.18 M-0.18 -0.04 H0.18 M-0.18 0 H0.18 M-0.18 0.04 H0.18" class="p-staff"/><circle cx="-0.08" cy="-0.06" r="0.025" class="p-fill"/><circle cx="0.04" cy="-0.02" r="0.025" class="p-fill"/><circle cx="0.13" cy="-0.1" r="0.025" class="p-fill"/>',
      );
    case 'sourced': // a calculator and a rule
      return g(
        '<rect x="-0.22" y="-0.16" width="0.2" height="0.3" class="p-dark"/><path d="M-0.19 -0.07 H-0.05 M-0.19 -0.01 H-0.05 M-0.19 0.05 H-0.05 M-0.15 -0.1 V0.1 M-0.09 -0.1 V0.1" class="p-keys"/><rect x="0.02" y="-0.2" width="0.08" height="0.38" class="p-wood"/><path d="M0.02 -0.14 H0.05 M0.02 -0.07 H0.05 M0.02 0 H0.05 M0.02 0.07 H0.05" class="p-ink"/>',
      );
    case 'ask-the-record': // a card index
      return g(
        '<rect x="-0.2" y="-0.18" width="0.4" height="0.34" class="p-wood"/><path d="M-0.16 -0.1 H0.16 M-0.16 -0.04 H0.16 M-0.16 0.02 H0.16 M-0.16 0.08 H0.16" class="p-ink"/><rect x="0.04" y="-0.15" width="0.08" height="0.05" class="p-paper"/>',
      );
    case 'dreaming': // the morning review: a coffee and a diff
      return g(
        '<circle cx="-0.13" cy="0" r="0.08" class="p-paper"/><circle cx="-0.13" cy="0" r="0.05" class="p-coffee"/><rect x="-0.02" y="-0.18" width="0.24" height="0.34" class="p-paper"/><path d="M0.02 -0.1 H0.16" class="p-add"/><path d="M0.02 -0.03 H0.12" class="p-del"/><path d="M0.02 0.04 H0.17" class="p-add"/>',
      );
    case 'receipts': // a receipt spike
      return g(
        '<circle r="0.12" class="p-dark"/><rect x="-0.09" y="-0.16" width="0.18" height="0.24" class="p-paper" transform="rotate(-8)"/><path d="M-0.05 -0.1 H0.05 M-0.05 -0.05 H0.05 M-0.05 0 H0.03" class="p-ink"/><circle r="0.02" class="p-fill"/>',
      );
  }
}

function deskPlan(piece: PieceId): string {
  const d = deskFor(piece);
  const title = pieceById(piece).title;
  return `<a class="plan-desk" href="#work-${piece}" data-piece="${piece}" aria-label="${esc(title)}, desk on the studio floor">
  <rect class="plan-desk__top" x="${r(d.x - 0.8)}" y="${r(d.z - 0.4)}" width="1.6" height="0.8"/>
  <rect class="plan-desk__screen" x="${r(d.x - 0.46)}" y="${r(d.z - 0.36)}" width="0.92" height="0.08"/>
  <circle class="plan-desk__chair" cx="${r(d.seat[0])}" cy="${r(d.seat[1])}" r="0.24"/>
  ${prop(piece, d.x - 0.38, d.z)}
  <text class="plan-label" x="${r(d.x)}" y="${r(d.z - 0.55)}" text-anchor="middle">${esc(title)}</text>
</a>`;
}

export function renderPlan(): string {
  const t = 0.12;
  const wall = `M${ROOM.x0} ${ROOM.z0} H${ROOM.x1} V${ROOM.z1} H0.8 M-0.8 ${ROOM.z1} H${ROOM.x0} Z`;
  const rt = REVIEW.table;
  const c = CABINET;
  const rc = RECEPTION;
  const sheets = BRIEF.sheets
    .map((s) => `<rect class="plan-brief" x="${r(s.x - 0.32)}" y="${ROOM.z0 + 0.04}" width="0.64" height="0.1"/>`)
    .join('');
  const drawers = Array.from({ length: c.drawers - 1 }, (_, i) => r(c.x - c.width / 2 + ((i + 1) * c.width) / c.drawers))
    .map((x) => `M${x} ${r(c.z - c.depth / 2)} V${r(c.z + c.depth / 2)}`)
    .join(' ');
  return `<svg class="plan" viewBox="${VIEW.x0} ${VIEW.z0} ${r(VIEW.x1 - VIEW.x0)} ${r(VIEW.z1 - VIEW.z0)}" role="group" aria-labelledby="floor-title">
  <rect class="plan-floor" x="${ROOM.x0}" y="${ROOM.z0}" width="${ROOM.x1 - ROOM.x0}" height="${ROOM.z1 - ROOM.z0}"/>
  <path class="plan-wall" d="${wall}" stroke-width="${t}"/>
  <path class="plan-door" d="M-0.8 ${ROOM.z1} A1.6 1.6 0 0 1 0.8 ${ROOM.z1}"/>
  ${sheets}
  <text class="plan-room" x="0" y="${ROOM.z0 + 0.62}" text-anchor="middle">The briefs</text>
  <rect class="plan-board" x="${r(BOARD.x - BOARD.width / 2)}" y="${ROOM.z0 + 0.04}" width="${BOARD.width}" height="0.1"/>
  <text class="plan-room" x="${BOARD.x}" y="${ROOM.z0 + 0.62}" text-anchor="middle">Accepted</text>
  <rect class="plan-board" x="${r(SIGN.x - SIGN.width / 2)}" y="${ROOM.z0 + 0.04}" width="${SIGN.width}" height="0.1"/>
  <text class="plan-room" x="${SIGN.x}" y="${ROOM.z0 + 0.62}" text-anchor="middle">Grid sign</text>
  <rect class="plan-reception" x="${r(SHELF.x - SHELF.width / 2)}" y="${ROOM.z0 + 0.04}" width="${SHELF.width}" height="${SHELF.depth}"/>
  <text class="plan-room" x="${SHELF.x}" y="${ROOM.z0 + 0.8}" text-anchor="middle">Radio</text>
  ${DESKS.map((d) => deskPlan(d.piece)).join('\n')}
  <rect class="plan-review" x="${r(rt.x - rt.width / 2)}" y="${r(rt.z - rt.depth / 2)}" width="${rt.width}" height="${rt.depth}"/>
  <text class="plan-room" x="${r(rt.x + rt.width / 2 + 0.2)}" y="${r(rt.z + 0.1)}">Review table</text>
  <a class="plan-place" href="#archive"><rect class="plan-cabinet" x="${r(c.x - c.width / 2)}" y="${r(c.z - c.depth / 2)}" width="${c.width}" height="${c.depth}"/><path class="plan-drawers" d="${drawers}"/><text class="plan-room" x="${c.x}" y="${r(c.z + c.depth / 2 + 0.5)}" text-anchor="middle">Filing cabinet</text></a>
  <a class="plan-place" href="#ask"><rect class="plan-reception" x="${r(rc.x - rc.width / 2)}" y="${r(rc.z - rc.depth / 2)}" width="${rc.width}" height="${rc.depth}"/><text class="plan-room" x="${rc.x}" y="${r(rc.z + rc.depth / 2 + 0.5)}" text-anchor="middle">Reception</text></a>
  <g class="plan-here" transform="translate(0 ${r(ROOM.z1 + 0.62)})"><circle r="0.2"/><text x="0.34" y="0.1">You are here, at the door</text></g>
  <g class="plan-figures" id="plan-figures" aria-hidden="true">${DESKS.map((d) => `<circle class="plan-figure" data-piece="${d.piece}" cx="${d.seat[0]}" cy="${d.seat[1]}" r="0.17"/>`).join('')}<circle class="plan-figure plan-figure--reviewer" cx="${REVIEW.reviewer[0]}" cy="${REVIEW.reviewer[1]}" r="0.17"/>${DESKS.map((d) => `<rect class="plan-sheet" data-sheet="${d.piece}" x="-0.13" y="-0.17" width="0.26" height="0.34" visibility="hidden"/>`).join('')}</g>
</svg>`;
}
