// Server-side HTML for the room's labels and the full list of folders. Rendered into index.html at
// build time, so every tool is a real link before any script runs.

import { hostedOpenLine } from '../hosting/open';
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
 * The tags over the room: real buttons and links, placed by the engine on what they name, like the
 * printed tags on an architect's model. `data-target` says what each names, `data-at` where you must
 * stand to see it, `data-place` how it sits (a tag hanging from an edge, a name on a folder's tab, or a
 * button laid over a drawer, the sign or the radio). At rest only the cabinet and Reception are
 * named; a desk's tag shows on hover and focus (`data-reveal`), and the directory board is the
 * always-visible index.
 */
export function renderRoomLabels(): string {
  const tag = (target: string, html: string, extra = '') =>
    `<button type="button" class="tag tag--place" data-target="${target}" data-at="door" data-place="tag"${extra}>${html}</button>`;
  const objects = [
    tag('cabinet', '<span class="tag__name">Filing cabinet</span><span class="tag__note">ten tools in four drawers</span>'),
    tag('reception', '<span class="tag__name">Reception</span><span class="tag__note">ask about Harry or any tool</span>'),
    `<button type="button" class="obj obj--cover" data-target="sign" data-at="door" data-place="cover" aria-expanded="false" aria-controls="grid-sign" aria-describedby="grid-credit"><span class="obj__name">The grid sign: the current carbon intensity of Great Britain’s grid</span></button>`,
    `<button type="button" class="obj obj--cover" data-target="radio" data-at="door" data-place="cover" aria-expanded="false" aria-controls="radio"><span class="obj__name">The radio: Listen to the Grid</span></button>`,
  ];
  const desks = PIECES.map(
    (p) =>
      `<a class="tag tag--desk" href="#folder-${p.id}" data-target="desk:${p.id}" data-at="door" data-place="corner" data-reveal="hover" data-piece="${p.id}">${esc(p.title)}</a>`,
  );
  const furniture = [
    ['brief', '#brief', 'The briefs'],
    ['reviewer', '#brief', 'The reviewer'],
    ['board', '#files', 'Accepted'],
  ].map(
    ([key, href, name]) =>
      `<a class="tag tag--desk" href="${href}" data-target="${key}" data-at="door" data-place="tag" data-reveal="hover">${name}</a>`,
  );
  // Each drawer, then the folders in it, so Tab goes from a drawer into its folders.
  const filed = DRAWERS.flatMap((d) => [
    `<button type="button" class="obj obj--drawer" data-target="drawer:${d.id}" data-at="cabinet" data-place="cover" aria-expanded="false"><span class="obj__name">${esc(d.label)}</span><span class="obj__note">${esc(d.position)}</span></button>`,
    ...d.pieces.map(
      (id) =>
        `<a class="obj obj--folder" href="#folder-${id}" data-target="folder:${id}" data-at="cabinet" data-place="centre" data-piece="${id}"><span class="obj__name">${esc(pieceById(id).title)}</span></a>`,
    ),
  ]);
  // The grid's credit, always shown beside the sign and the radio.
  const credit =
    '<p class="tag tag--credit" id="grid-credit" hidden data-target="credit" data-at="door" data-place="over">Data: Carbon Intensity API, © NESO, CC BY 4.0</p>';
  // Hidden until the engine places them, so nothing shows or takes focus before the room is up. An
  // explicit tabindex puts them in Safari's Tab order too, which by default skips links and buttons.
  const controls = [...objects, ...desks, ...furniture, ...filed].map((html) => html.replace(/^<(a|button) /, '<$1 hidden tabindex="0" '));
  return [...controls, credit].join('\n');
}

function crossLink(piece: Piece): string {
  return `<p class="work__elsewhere"><a href="#folder-${piece.id}" data-piece="${piece.id}">Pull its folder from the cabinet</a></p>`;
}

function renderPiece(piece: Piece, config: SiteConfig, timeline: Timeline, hosted: boolean): string {
  const url = config.pieces[piece.id];
  // Hosted: a tool on a local port has no link, and says it is a recording (src/hosting/open.ts).
  const recording = hosted ? hostedOpenLine(url) : null;
  const record = recordLine(timeline, piece);
  const placeholder = timeline.placeholder
    ? '<p class="work__placeholder">Builder, reviewer and rounds come from the placeholder timeline, not the real record.</p>'
    : '<p class="work__inferred">Builder, reviewer and rounds are reconstructed from file times and the builders’ reports; the times are inferred.</p>';
  const citation = piece.citation ? ` <a class="cite" href="${esc(piece.citation.href)}">${esc(piece.citation.label)}</a>.` : '';
  const run = piece.run ? `<p class="work__run">Run it: <code>${esc(piece.run)}</code></p>` : '';
  return `<li class="work" id="work-${piece.id}" data-piece="${piece.id}">
  <figure class="work__still"><img src="/loops/${piece.id}.webp" width="640" height="400" alt="${esc(piece.title)}, a frame from its loop" loading="lazy" decoding="async"></figure>
  <div class="work__text">
    <h3 class="work__title">${recording ? esc(piece.title) : `<a href="${esc(url)}">${esc(piece.title)}</a>`}</h3>
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
    ${recording ?? `<p class="work__open"><a class="open" href="${esc(url)}">Open ${esc(piece.title)}</a><span class="work__where">${esc(openLabel(piece, url))}</span></p>`}
    ${crossLink(piece)}
  </div>
</li>`;
}

export function renderList(config: SiteConfig, timeline: Timeline, hosted = false): string {
  return PIECES.map((p) => renderPiece(p, config, timeline, hosted)).join('\n');
}

/** The timeline goes into the page as inert JSON for the replay; the page re-validates it. */
export function renderTimelineJson(timeline: Timeline): string {
  return `<script type="application/json" id="timeline-data">${JSON.stringify(timeline).replace(/</g, '\\u003c')}</script>`;
}

/**
 * The tags over the desk (branch design/desk-miniature): real buttons and links laid over the desk's
 * objects, the builders' name tags in the office, and the index box's dividers and cards. They use
 * `data-desk-target` (where it sits) and `data-action` (what choosing it does), so the classic room
 * ignores them; `data-at` is the station they show at.
 */
export function renderDeskLabels(): string {
  const tag = (key: string, name: string, note: string) =>
    `<button type="button" class="dtag dtag--place" data-desk-target="${key}" data-action="${key}" data-at="door"><span class="dtag__name">${name}</span><span class="dtag__note">${note}</span></button>`;
  const door = [
    tag('office', 'The office', 'dive in: ten builders at work'),
    tag('cabinet', 'Filing cabinet', 'ten tools, one card each'),
    tag('notebook', 'The briefs', 'three rounds, turn a page'),
    tag('reception', 'Reception', 'type a question'),
    tag('stamp', 'Receipts', 'stamp a card to check it'),
    `<button type="button" class="obj obj--cover" data-desk-target="sign" data-action="sign" data-at="door" data-place="cover" aria-expanded="false" aria-controls="grid-sign" aria-describedby="desk-credit"><span class="obj__name">The sticky note: the current carbon intensity of Great Britain’s grid</span></button>`,
    `<button type="button" class="obj obj--cover obj--mic" data-desk-target="mic" data-action="mic" data-at="door" data-place="cover" aria-expanded="false" aria-controls="speak"><span class="obj__name">Speak to me: Harry’s email, LinkedIn and CV</span></button>`,
  ];
  const office = [
    ...PIECES.map(
      (p) =>
        `<a class="dtag dtag--name" href="#folder-${p.id}" data-desk-target="desk:${p.id}" data-action="desk:${p.id}" data-at="office" data-place="nametag" data-piece="${p.id}" data-status="idle"><span class="dtag__dot" aria-hidden="true"></span>${esc(p.title)}</a>`,
    ),
    `<button type="button" class="dtag" data-desk-target="office-reception" data-action="reception" data-at="office" data-place="centre">Reception</button>`,
    `<button type="button" class="dtag" data-desk-target="office-cabinet" data-action="cabinet" data-at="office" data-place="centre">Filing</button>`,
    `<button type="button" class="obj obj--cover" data-desk-target="radio" data-action="radio" data-at="office" data-place="cover" aria-expanded="false" aria-controls="radio"><span class="obj__name">The radio: Listen to the Grid</span></button>`,
  ];
  // Each divider, then its cards, so Tab goes from a divider into its cards.
  const filed = DRAWERS.flatMap((d) => [
    `<button type="button" class="obj obj--drawer" data-desk-target="drawer:${d.id}" data-action="drawer:${d.id}" data-at="cabinet" data-place="cover" aria-expanded="false"><span class="obj__name">${esc(d.label)}</span><span class="obj__note">${esc(d.position)} divider</span></button>`,
    ...d.pieces.map(
      (id) =>
        `<a class="obj obj--cover obj--card" href="#folder-${id}" data-desk-target="folder:${id}" data-action="folder:${id}" data-at="cabinet" data-place="cover" data-piece="${id}"><span class="obj__name">${esc(pieceById(id).title)}</span></a>`,
    ),
  ]);
  const controls = [...door, ...office, ...filed].map((html) => html.replace(/^<(a|button) /, '<$1 hidden tabindex="0" '));
  const credit =
    '<p class="dtag dtag--credit" id="desk-credit" hidden data-desk-target="credit" data-at="door" data-place="tag">Data: Carbon Intensity API, © NESO, CC BY 4.0</p>' +
    // Leaning in to a builder's monitor: the tool's recorded loop, crisp, laid exactly over the screen, and
    // under the bezel how to open the live tool and when the loop was recorded.
    '<div class="desk__screen" id="desk-screen" hidden data-desk-target="screen" data-at="desk" data-place="screen">' +
    '<video class="desk__loop" id="desk-loop" muted loop playsinline preload="none" aria-hidden="true"></video>' +
    '<div class="desk__under" id="desk-under"></div></div>';
  return [...controls, credit].join('\n');
}
