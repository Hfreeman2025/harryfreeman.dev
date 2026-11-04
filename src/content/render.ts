// Server-side HTML for the room's labels and the full list of folders. Rendered into index.html at
// build time, so every tool is a real link before any script runs.

import type { Timeline } from '../timeline/schema';
import { pieceRecord } from '../timeline/schema';
import type { SiteConfig } from './config';
import { DRAWERS } from './drawers';
import { PIECES, type Piece, pieceById } from './pieces';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

export function openLabel(piece: Piece, url: string): string {
  if (piece.kind === 'terminal') return 'Watch its recorded terminal session';
  const port = /^https?:\/\/127\.0\.0\.1:(\d+)/.exec(url)?.[1];
  return port ? `Runs locally on port ${port}; start it from its folder first` : 'Opens the piece';
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function recordLine(timeline: Timeline, piece: Piece): { builder: string; reviewer: string; rounds: string } {
  const record = pieceRecord(timeline, piece.id);
  if (!record) return { builder: 'Not in the timeline', reviewer: 'Not in the timeline', rounds: 'Not in the timeline' };
  const rounds =
    record.returned > 0
      ? `${plural(record.rounds, 'round', 'rounds')}; sent back ${plural(record.returned, 'time', 'times')}`
      : plural(record.rounds, 'round', 'rounds');
  return { builder: record.builder.label, reviewer: record.reviewer.label, rounds };
}

/**
 * The labels over the room: real buttons and links, placed over what they name by the engine.
 * `data-target` says what each names, `data-at` where you must stand to see it.
 */
export function renderRoomLabels(): string {
  const objects = [
    `<button type="button" class="obj obj--place" data-target="cabinet" data-at="door"><span class="obj__name">Filing cabinet</span><span class="obj__note">ten tools in four drawers</span></button>`,
    `<button type="button" class="obj obj--place" data-target="reception" data-at="door"><span class="obj__name">Reception</span><span class="obj__note">ask about Harry or any tool</span></button>`,
  ];
  const desks = PIECES.map(
    (p) =>
      `<a class="desk-label" href="#folder-${p.id}" data-target="desk:${p.id}" data-at="door" data-piece="${p.id}"><span class="desk-label__name">${esc(p.title)}</span><span class="desk-label__state" aria-hidden="true"></span></a>`,
  );
  const furniture = [
    ['brief', '#brief', 'The brief'],
    ['reviewer', '#brief', 'The reviewer'],
    ['board', '#files', 'Accepted'],
  ].map(
    ([key, href, name]) =>
      `<a class="desk-label desk-label--room" href="${href}" data-target="${key}" data-at="door"><span class="desk-label__name">${name}</span></a>`,
  );
  // Each drawer, then the folders in it, so Tab goes from a drawer into its folders.
  const filed = DRAWERS.flatMap((d) => [
    `<button type="button" class="obj obj--drawer" data-target="drawer:${d.id}" data-at="cabinet" data-place="cover" aria-expanded="false"><span class="obj__name">${esc(d.label)}</span><span class="obj__note">${esc(d.position)}</span></button>`,
    ...d.pieces.map(
      (id) =>
        `<a class="obj obj--folder" href="#folder-${id}" data-target="folder:${id}" data-at="cabinet" data-place="centre" data-piece="${id}"><span class="obj__name">${esc(pieceById(id).title)}</span></a>`,
    ),
  ]);
  // Hidden until the engine places them, so nothing shows or takes focus before the room is up. An
  // explicit tabindex puts them in Safari's Tab order too, which by default skips links and buttons.
  return [...objects, ...desks, ...furniture, ...filed].map((html) => html.replace(/^<(a|button) /, '<$1 hidden tabindex="0" ')).join('\n');
}

function crossLink(piece: Piece): string {
  return `<p class="work__elsewhere"><a href="#folder-${piece.id}" data-piece="${piece.id}">Pull its folder from the cabinet</a></p>`;
}

function renderPiece(piece: Piece, config: SiteConfig, timeline: Timeline): string {
  const url = config.pieces[piece.id];
  const record = recordLine(timeline, piece);
  const placeholder = timeline.placeholder
    ? '<p class="work__placeholder">Builder, reviewer and rounds come from the placeholder timeline, not the real record.</p>'
    : '<p class="work__inferred">Builder, reviewer and rounds are reconstructed from file times and the builders’ reports; the times are inferred.</p>';
  const citation = piece.citation ? ` <a class="cite" href="${esc(piece.citation.href)}">${esc(piece.citation.label)}</a>.` : '';
  const run = piece.run ? `<p class="work__run">Run it: <code>${esc(piece.run)}</code></p>` : '';
  return `<li class="work" id="work-${piece.id}" data-piece="${piece.id}">
  <figure class="work__still"><img src="/loops/${piece.id}.webp" width="640" height="400" alt="${esc(piece.title)}, a frame from its loop" loading="lazy" decoding="async"></figure>
  <div class="work__text">
    <h3 class="work__title"><a href="${esc(url)}">${esc(piece.title)}</a></h3>
    <p class="work__line">${esc(piece.line)}</p>
    <p class="work__technique">${esc(piece.technique)}${citation}</p>
    <dl class="work__record">
      <div><dt>Built by</dt><dd data-field="builder">${esc(record.builder)}</dd></div>
      <div><dt>Reviewed by</dt><dd data-field="reviewer">${esc(record.reviewer)}</dd></div>
      <div><dt>Review</dt><dd data-field="rounds">${esc(record.rounds)}</dd></div>
    </dl>
    ${placeholder}
    <div class="work__columns">
      <div><h4>The brief it worked to</h4><ul class="work__brief">${piece.brief.map((b) => `<li><span class="doc">${esc(b.doc)}</span> ${esc(b.ask)}</li>`).join('')}</ul></div>
      <div><h4>Checks, as its README reports them</h4><ul class="work__checks">${piece.checks.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>
    </div>
    ${run}
    <p class="work__open"><a class="open" href="${esc(url)}">Open ${esc(piece.title)}</a><span class="work__where">${esc(openLabel(piece, url))}</span></p>
    ${crossLink(piece)}
  </div>
</li>`;
}

export function renderList(config: SiteConfig, timeline: Timeline): string {
  return PIECES.map((p) => renderPiece(p, config, timeline)).join('\n');
}

/** The timeline goes into the page as inert JSON for the replay; the page re-validates it. */
export function renderTimelineJson(timeline: Timeline): string {
  return `<script type="application/json" id="timeline-data">${JSON.stringify(timeline).replace(/</g, '\\u003c')}</script>`;
}
