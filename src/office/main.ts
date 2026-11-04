// The office works without this script: the directory, every folder in full and every link are
// HTML. This adds the cabinet's drawers, the folder card, Reception and the floor plan replay.

import * as v from 'valibot';
import { setupAsk } from '../ask';
import { drawerOf } from '../content/drawers';
import { isPieceId, type PieceId } from '../content/pieces';
import { parseTimeline } from '../timeline/schema';
import { startPlanReplay } from './plan-replay';

const root = document.documentElement;
const reduced = () => root.dataset.motion === 'reduce';
const wait = (ms: number) => new Promise((r) => setTimeout(r, reduced() ? 0 : ms));

// ---------- Drawers ----------
const drawers = [...document.querySelectorAll<HTMLElement>('.drawer')];

function setDrawer(drawer: HTMLElement, open: boolean): void {
  const front = drawer.querySelector<HTMLButtonElement>('.drawer__front');
  const tray = drawer.querySelector<HTMLElement>('.drawer__tray');
  drawer.dataset.open = String(open);
  front?.setAttribute('aria-expanded', String(open));
  if (tray) tray.inert = !open;
  for (const folder of drawer.querySelectorAll<HTMLAnchorElement>('.folder')) folder.tabIndex = open ? 0 : -1;
}

/** Opens one drawer and closes the rest. Resolves once it has slid out. */
async function openDrawer(id: string): Promise<void> {
  const target = drawers.find((d) => d.dataset.drawer === id);
  if (!target) return;
  const already = target.dataset.open === 'true';
  for (const d of drawers) if (d !== target && d.dataset.open === 'true') setDrawer(d, false);
  if (!already) {
    setDrawer(target, true);
    await wait(640);
  }
}

for (const drawer of drawers) {
  drawer.querySelector('.drawer__front')?.addEventListener('click', () => {
    if (drawer.dataset.open === 'true') setDrawer(drawer, false);
    else void openDrawer(drawer.dataset.drawer ?? '');
  });
}

// ---------- The folder card ----------
const card = document.getElementById('card');
const cardOpen = card?.querySelector<HTMLElement>('.folder-card__open') ?? null;
const cardBody = document.getElementById('card-body');
const cardVideo = card?.querySelector<HTMLVideoElement>('.folder-card__video') ?? null;
const cardRecorded = document.getElementById('card-recorded');
let openPiece: PieceId | null = null;
let returnFocus: HTMLElement | null = null;
let busy = false;
/** The folder still opening, so a close asked for meanwhile waits for it rather than being lost. */
let opening: Promise<void> | null = null;

const Report = v.record(v.string(), v.looseObject({ recordedAt: v.optional(v.string()), url: v.optional(v.string()) }));
let report: v.InferOutput<typeof Report> = {};
void fetch('/loops/report.json')
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
  .then((json: unknown) => {
    report = v.parse(Report, json);
  })
  .catch(() => {
    report = {};
  });

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/London',
});

function recordedLine(piece: PieceId): string {
  const at = report[piece]?.recordedAt;
  const when = at && Number.isFinite(Date.parse(at)) ? `on ${dateFormat.format(Date.parse(at))}` : '';
  return `Recorded ${when} from the real tool, in a silent headless browser: 8 seconds, looped. Open it to use it live.`.replace('  ', ' ');
}

function folderFor(piece: PieceId): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.folder[data-piece="${piece}"]`);
}

function fill(piece: PieceId): void {
  if (!cardBody || !cardVideo || !cardRecorded) return;
  const clone = document.querySelector(`#work-${piece} .work__text`)?.cloneNode(true);
  cardBody.replaceChildren();
  if (clone instanceof HTMLElement) {
    for (const el of clone.querySelectorAll('[id]')) el.removeAttribute('id');
    const title = clone.querySelector('.work__title');
    if (title) {
      title.id = 'card-title';
      title.setAttribute('tabindex', '-1');
    }
    // The left leaf, under the loop: how to open it and who made it. The right leaf: what it is.
    const actions = document.getElementById('card-actions');
    if (actions) {
      actions.replaceChildren();
      for (const selector of ['.work__open', '.work__run', '.work__record', '.work__placeholder', '.work__inferred']) {
        const part = clone.querySelector(selector);
        if (part) actions.append(part);
      }
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'work';
    wrapper.append(clone);
    cardBody.append(wrapper);
  }
  cardRecorded.textContent = recordedLine(piece);
  cardVideo.poster = `/loops/${piece}.webp`;
  cardVideo.src = cardVideo.canPlayType('video/webm; codecs="vp9"') ? `/loops/${piece}.webm` : `/loops/${piece}.mp4`;
  if (!reduced()) void cardVideo.play().catch(() => undefined);
}

/** The transform that shrinks the open folder back onto the folder in the drawer. */
function onto(rect: DOMRect | null): string {
  if (!cardOpen || !rect || rect.width === 0) return 'scale(0.96)';
  cardOpen.style.transform = 'none';
  const full = cardOpen.getBoundingClientRect();
  const scale = rect.width / full.width;
  return `translate(${rect.left - full.left}px, ${rect.top - full.top}px) scale(${scale}, ${rect.height / full.height})`;
}

function openFolder(piece: PieceId, from: HTMLElement | null): Promise<void> {
  if (busy || !card || !cardOpen) return opening ?? Promise.resolve();
  busy = true;
  opening = pull(piece, from).finally(() => {
    opening = null;
    busy = false;
  });
  return opening;
}

async function pull(piece: PieceId, from: HTMLElement | null): Promise<void> {
  if (!card || !cardOpen) return;
  openPiece = piece;
  returnFocus = from;
  await openDrawer(drawerOf(piece).id);
  const folder = folderFor(piece);
  folder?.classList.add('folder--lifted');
  fill(piece);
  card.hidden = false;
  const start = onto(folder?.getBoundingClientRect() ?? null);
  cardOpen.style.transition = 'none';
  cardOpen.style.transform = start;
  void cardOpen.offsetWidth;
  cardOpen.style.transition = reduced() ? 'none' : 'transform 480ms cubic-bezier(0.2, 0.75, 0.2, 1)';
  cardOpen.style.transform = 'none';
  card.dataset.open = 'true';
  await wait(500);
  document.getElementById('card-title')?.focus();
}

async function closeFolder(): Promise<void> {
  if (opening) await opening;
  if (busy || !card || !cardOpen || !openPiece) return;
  busy = true;
  const folder = folderFor(openPiece);
  cardOpen.style.transition = reduced() ? 'none' : 'transform 380ms cubic-bezier(0.5, 0, 0.7, 0.4)';
  cardOpen.style.transform = onto(folder?.getBoundingClientRect() ?? null);
  card.dataset.open = 'false';
  await wait(390);
  card.hidden = true;
  cardVideo?.pause();
  cardVideo?.removeAttribute('src');
  folder?.classList.remove('folder--lifted');
  openPiece = null;
  busy = false;
  returnFocus?.focus();
}

document.getElementById('card-back')?.addEventListener('click', () => void closeFolder());
card?.addEventListener('click', (e) => {
  if (e.target === card) void closeFolder();
});
document.addEventListener('keydown', (event) => {
  if (!card || card.hidden) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    void closeFolder();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = [...card.querySelectorAll<HTMLElement>('a[href], button, [tabindex="-1"]')].filter((el) => el.offsetParent !== null);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

// Folders, directory rows and desks all pull the same folder.
document.addEventListener('click', (event) => {
  const link = (event.target as Element | null)?.closest<HTMLElement>('.folder, .board__row a[data-piece], .plan-desk');
  const piece = link?.dataset.piece ?? '';
  if (!link || !isPieceId(piece)) return;
  event.preventDefault();
  void openFolder(piece, link);
});

// Arriving from the studio floor: /#folder-<id> pulls that folder.
function followHash(): void {
  const piece = /^#folder-(.+)$/.exec(location.hash)?.[1] ?? '';
  if (isPieceId(piece)) {
    document.getElementById('archive')?.scrollIntoView({ block: 'start' });
    void openFolder(piece, folderFor(piece));
  }
}
window.addEventListener('hashchange', followHash);
followHash();

// ---------- Reception ----------
function markAnswering(pieces: readonly PieceId[]): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-answering]')) el.removeAttribute('data-answering');
  for (const piece of pieces) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-piece="${piece}"], #work-${piece}`)) el.dataset.answering = 'true';
  }
  const first = pieces[0];
  if (first) void openDrawer(drawerOf(first).id);
}
setupAsk({ onAnswer: markAnswering, onSource: (piece) => void openFolder(piece, folderFor(piece)) });

// ---------- The floor ----------
const timelineNode = document.getElementById('timeline-data');
try {
  const timeline = parseTimeline(JSON.parse(timelineNode?.textContent ?? 'null'));
  const plan = document.querySelector<SVGSVGElement>('.plan');
  if (plan) {
    const replay = startPlanReplay(plan, timeline, { paused: reduced() });
    const toggle = document.getElementById('replay-toggle');
    toggle?.addEventListener('click', () => {
      const paused = replay.togglePause();
      toggle.textContent = paused ? 'Play' : 'Pause';
      toggle.setAttribute('aria-pressed', String(paused));
    });
    if (reduced() && toggle) {
      toggle.textContent = 'Play';
      toggle.setAttribute('aria-pressed', 'true');
    }
  }
} catch (error) {
  const note = document.getElementById('replay-event');
  if (note) note.textContent = `The build timeline could not be read: ${error instanceof Error ? error.message : String(error)}`;
}
