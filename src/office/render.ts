// Server-side HTML for the office: the lobby directory board, the filing cabinet and the floor
// plan. Rendered into office.html at build time, so every tool is a real link before any script.

import { DRAWERS } from '../content/drawers';
import { type PieceId, pieceById } from '../content/pieces';
import { esc } from '../content/render';
import { BRIEF, DESKS, deskFor, REVIEW, ROOM } from '../scene/layout';

export function renderDirectory(): string {
  const groups = DRAWERS.map(
    (d) => `<li class="board__group">
  <p class="board__place">${esc(d.label)}</p>
  <ul>${d.pieces
    .map(
      (p) =>
        `<li class="board__row"><a href="#work-${p}" data-piece="${p}">${esc(pieceById(p).title)}</a><span class="board__leader" aria-hidden="true"></span><span class="board__where">${esc(d.position)}</span></li>`,
    )
    .join('')}</ul>
</li>`,
  ).join('');
  return `<ol class="board__groups">${groups}</ol>`;
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
// Drawn in metres from the same plan as the light bake. The lobby below the studio is drawing only.

const LOBBY = { z0: ROOM.z1, z1: 7.6 } as const;
const VIEW = { x0: -7.6, z0: -5.5, x1: 7.6, z1: 8.2 } as const;

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
  const walls = [
    // Studio
    `M${ROOM.x0} ${ROOM.z0} H${ROOM.x1} V${ROOM.z1} H0.8 M-0.8 ${ROOM.z1} H${ROOM.x0} Z`,
    // Lobby, with the street door at the bottom
    `M${ROOM.x0} ${LOBBY.z0} V${LOBBY.z1} H-0.9 M0.9 ${LOBBY.z1} H${ROOM.x1} V${LOBBY.z0}`,
  ];
  const rt = REVIEW.table;
  const sheets = BRIEF.sheets
    .map((s) => `<rect class="plan-brief" x="${r(s.x - 0.32)}" y="${ROOM.z0 + 0.04}" width="0.64" height="0.1"/>`)
    .join('');
  return `<svg class="plan" viewBox="${VIEW.x0} ${VIEW.z0} ${r(VIEW.x1 - VIEW.x0)} ${r(VIEW.z1 - VIEW.z0)}" role="group" aria-labelledby="floor-title">
  <rect class="plan-floor" x="${ROOM.x0}" y="${ROOM.z0}" width="${ROOM.x1 - ROOM.x0}" height="${ROOM.z1 - ROOM.z0}"/>
  <rect class="plan-floor plan-floor--lobby" x="${ROOM.x0}" y="${LOBBY.z0}" width="${ROOM.x1 - ROOM.x0}" height="${LOBBY.z1 - LOBBY.z0}"/>
  ${walls.map((w) => `<path class="plan-wall" d="${w}" stroke-width="${t}"/>`).join('')}
  <path class="plan-door" d="M-0.8 ${ROOM.z1} A1.6 1.6 0 0 1 0.8 ${ROOM.z1}"/>
  ${sheets}
  <text class="plan-room" x="0" y="${ROOM.z0 + 0.62}" text-anchor="middle">The briefs</text>
  <a class="plan-place" href="/studio.html"><text class="plan-room plan-room--big" x="${ROOM.x0 + 0.35}" y="${ROOM.z0 - 0.3}">Studio floor, in 3D</text></a>
  ${DESKS.map((d) => deskPlan(d.piece)).join('\n')}
  <rect class="plan-review" x="${r(rt.x - rt.width / 2)}" y="${r(rt.z - rt.depth / 2)}" width="${rt.width}" height="${rt.depth}"/>
  <circle class="plan-desk__chair" cx="${REVIEW.reviewer[0]}" cy="${REVIEW.reviewer[1]}" r="0.24"/>
  <text class="plan-room" x="${r(rt.x + rt.width / 2 + 0.2)}" y="${r(rt.z + 0.1)}">Review table</text>
  <a class="plan-place" href="#archive"><rect class="plan-cabinet" x="-6.6" y="${LOBBY.z0 + 0.5}" width="1.4" height="0.62"/><path class="plan-drawers" d="M-6.25 ${LOBBY.z0 + 0.5} V${LOBBY.z0 + 1.12} M-5.9 ${LOBBY.z0 + 0.5} V${LOBBY.z0 + 1.12} M-5.55 ${LOBBY.z0 + 0.5} V${LOBBY.z0 + 1.12}"/><text class="plan-room" x="-5.9" y="${LOBBY.z0 + 1.6}" text-anchor="middle">Archive</text></a>
  <a class="plan-place" href="#directory"><rect class="plan-board" x="-3.4" y="${LOBBY.z1 - 0.18}" width="2" height="0.1"/><text class="plan-room" x="-2.4" y="${LOBBY.z1 - 0.45}" text-anchor="middle">Directory</text></a>
  <a class="plan-place" href="#ask"><path class="plan-reception" d="M3 ${LOBBY.z0 + 1.6} Q4.4 ${LOBBY.z0 + 0.7} 5.8 ${LOBBY.z0 + 1.6}"/><text class="plan-room" x="4.4" y="${LOBBY.z0 + 2.2}" text-anchor="middle">Reception</text></a>
  <g class="plan-here" transform="translate(0 ${LOBBY.z1 - 0.55})"><circle r="0.2"/><text x="0.34" y="0.1">You are here</text></g>
  <g class="plan-figures" id="plan-figures" aria-hidden="true">${DESKS.map((d) => `<circle class="plan-figure" data-piece="${d.piece}" cx="${d.seat[0]}" cy="${d.seat[1]}" r="0.17"/><rect class="plan-sheet" data-sheet="${d.piece}" x="-0.11" y="-0.14" width="0.22" height="0.28" visibility="hidden"/>`).join('')}<circle class="plan-figure plan-figure--reviewer" cx="${REVIEW.reviewer[0]}" cy="${REVIEW.reviewer[1]}" r="0.17"/></g>
</svg>`;
}
