// The flat office: phones, reduced motion, no WebGL. Without script it is already the directory, the
// folders in full and every link; this adds the cabinet's drawers, the folder card and the floor plan
// replay. The 3D room (room/main.ts) is the same content, drawn in three.js.

import { drawerOf } from '../content/drawers';
import { isPieceId, type PieceId } from '../content/pieces';
import { fillFolder, loopSource, scrollToMark, trapTab } from '../folder';
import { parseTimeline } from '../timeline/schema';
import { startPlanReplay } from './plan-replay';

export interface OfficeControl {
  answer(pieces: readonly PieceId[], mark: () => Range | null, result?: unknown): void;
  source(piece: PieceId): void;
}

const root = document.documentElement;
const reduced = () => root.dataset.motion === 'reduce';
const wait = (ms: number) => new Promise((r) => setTimeout(r, reduced() ? 0 : ms));

export function startOffice(): OfficeControl {
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
  const cardVideo = card?.querySelector<HTMLVideoElement>('.folder-card__video') ?? null;
  let openPiece: PieceId | null = null;
  let returnFocus: HTMLElement | null = null;
  let busy = false;
  /** The folder still opening, so a close asked for meanwhile waits for it rather than being lost. */
  let opening: Promise<void> | null = null;

  const folderFor = (piece: PieceId) => document.querySelector<HTMLElement>(`.folder[data-piece="${piece}"]`);

  /** The transform that shrinks the open folder back onto the folder in the drawer. */
  function onto(rect: DOMRect | null): string {
    if (!cardOpen || !rect || rect.width === 0) return 'scale(0.96)';
    cardOpen.style.transform = 'none';
    const full = cardOpen.getBoundingClientRect();
    const scale = rect.width / full.width;
    return `translate(${rect.left - full.left}px, ${rect.top - full.top}px) scale(${scale}, ${rect.height / full.height})`;
  }

  function openFolder(piece: PieceId, from: HTMLElement | null, mark?: () => Range | null): Promise<void> {
    if (busy || !card || !cardOpen) return opening ?? Promise.resolve();
    busy = true;
    opening = pull(piece, from, mark).finally(() => {
      opening = null;
      busy = false;
    });
    return opening;
  }

  async function pull(piece: PieceId, from: HTMLElement | null, mark?: () => Range | null): Promise<void> {
    if (!card || !cardOpen || !cardVideo) return;
    if (openPiece) await close();
    openPiece = piece;
    returnFocus = from;
    await openDrawer(drawerOf(piece).id);
    const folder = folderFor(piece);
    folder?.classList.add('folder--lifted');
    fillFolder(piece);
    cardVideo.poster = `/loops/${piece}.webp`;
    cardVideo.src = loopSource(cardVideo, piece);
    if (!reduced()) void cardVideo.play().catch(() => undefined);
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
    if (mark) scrollToMark(mark());
  }

  async function close(): Promise<void> {
    if (!card || !cardOpen || !openPiece) return;
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
  }

  async function closeFolder(): Promise<void> {
    if (opening) await opening;
    if (busy || !openPiece) return;
    busy = true;
    await close();
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
    trapTab(card, event);
  });

  // Folders, directory rows, list links and desks all pull the same folder.
  document.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest<HTMLElement>(
      '.folder, .board__row a[data-piece], .plan-desk, .work__elsewhere a[data-piece]',
    );
    const piece = link?.dataset.piece ?? '';
    if (!link || !isPieceId(piece)) return;
    event.preventDefault();
    void openFolder(piece, link);
  });

  // A deep link, /#folder-<id>, pulls that folder.
  function followHash(): void {
    const piece = /^#folder-(.+)$/.exec(location.hash)?.[1] ?? '';
    if (isPieceId(piece)) {
      document.getElementById('archive')?.scrollIntoView({ block: 'start' });
      void openFolder(piece, folderFor(piece));
    }
  }
  window.addEventListener('hashchange', followHash);
  followHash();

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

  return {
    answer(pieces, mark) {
      const first = pieces[0];
      // A refusal, or an answer from the CV, opens nothing.
      if (!first) return;
      // Closing the folder returns to the question.
      const asked = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      void openDrawer(drawerOf(first).id).then(() => openFolder(first, asked, mark));
    },
    source(piece) {
      void openFolder(piece, folderFor(piece));
    },
  };
}
