// The 3D room's controller: where you stand (the door, the cabinet, Reception or a desk), what Enter,
// a click and Esc do there, and the folder beside a desk's screen. The engine draws; this decides.
//
// Esc always steps back: from a desk to where you came from (Reception, or the cabinet with that
// folder's drawer open), from an open drawer to the closed cabinet, from the cabinet or Reception to
// the door.

import { DRAWERS, drawerOf } from '../content/drawers';
import { isPieceId, type PieceId } from '../content/pieces';
import { fillFolder, loopSource, scrollToMark, trapTab } from '../folder';
import type { RoomEngine, Station } from '../scene/engine';
import type { Timeline } from '../timeline/schema';
import type { RoomLight } from './grid';

export interface RoomControl {
  /** A Reception answer quoted these tools' READMEs (empty for the CV or a refusal). */
  answer(pieces: readonly PieceId[], mark: () => Range | null): void;
  /** A quote's source link was followed. */
  source(piece: PieceId): void;
  setLight(light: RoomLight): void;
  /** Pull a tool's folder from wherever you stand (directory rows, deep links). */
  pull(piece: PieceId): void;
}

const root = document.documentElement;
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export async function startRoom(timeline: Timeline): Promise<RoomControl> {
  const hall = document.getElementById('hall');
  const stage = document.querySelector<HTMLElement>('.room__stage');
  const card = document.getElementById('card');
  const screen = document.getElementById('room-screen') as HTMLVideoElement | null;
  if (!hall || !stage || !card || !screen) throw new Error('the room’s markup is missing');
  const reduced = root.dataset.motion === 'reduce';
  const params = new URLSearchParams(location.search);
  const at = Number(params.get('t'));
  // Photo mode and ?hold keep the replay still, for the poster and the social image.
  const photo = root.dataset.photo !== undefined || params.has('hold');

  const { mountRoom } = await import('../scene/engine');
  const engine: RoomEngine = await mountRoom({
    stage,
    labels: hall,
    timeline,
    ...(Number.isFinite(at) && at > 0 ? { startAt: at } : {}),
    paused: photo,
    reduced,
  });

  // The replay's caption sits under the room.
  const replay = document.getElementById('replay');
  const caption = document.querySelector('.room__caption');
  if (replay && caption) caption.append(replay);

  const label = (target: string) => hall.querySelector<HTMLElement>(`[data-target="${target}"]`);
  let openPiece: PieceId | null = null;
  /** Where you were before each desk, so Esc goes back there. */
  let cameFrom: Station = 'cabinet';
  let chain: Promise<void> = Promise.resolve();
  /** Moves run one after another, so an Esc pressed mid-glide waits its turn rather than being lost. */
  const run = (move: () => Promise<void>): Promise<void> => {
    chain = chain.then(move, move);
    return chain;
  };
  const setStation = (s: Station) => {
    root.dataset.station = s.startsWith('desk:') ? 'desk' : s;
  };
  setStation('door');

  function syncDrawers(): void {
    const open = engine.drawerOpen();
    for (const el of hall?.querySelectorAll<HTMLElement>('[data-target^="drawer:"]') ?? []) {
      el.setAttribute('aria-expanded', String(el.dataset.target === `drawer:${open ?? ''}`));
    }
  }

  // ---------- The folder beside the desk ----------
  const back = document.getElementById('card-back');
  const toReception = document.getElementById('card-reception');
  if (back) back.textContent = 'Back to the cabinet';

  function placeScreen(): void {
    if (!openPiece || !hall) return;
    const r = engine.monitorRect(openPiece);
    const h = hall.getBoundingClientRect();
    screen?.style.setProperty('left', `${(r.left - h.left).toFixed(1)}px`);
    screen?.style.setProperty('top', `${(r.top - h.top).toFixed(1)}px`);
    screen?.style.setProperty('width', `${r.width.toFixed(1)}px`);
    screen?.style.setProperty('height', `${r.height.toFixed(1)}px`);
  }
  new ResizeObserver(() => placeScreen()).observe(stage);

  function showFolder(piece: PieceId): void {
    if (!card || !screen) return;
    openPiece = piece;
    card.hidden = false;
    card.dataset.open = 'true';
    card.setAttribute('aria-modal', 'false');
    if (toReception) toReception.hidden = cameFrom !== 'reception';
    // The desk's screen, in full: the tool's own loop over the monitor.
    screen.poster = `/loops/${piece}.webp`;
    screen.src = loopSource(screen, piece);
    placeScreen();
    screen.hidden = false;
    if (!reduced) void screen.play().catch(() => undefined);
    document.getElementById('card-title')?.focus();
  }

  function hideFolder(): void {
    if (!card || !screen) return;
    card.hidden = true;
    card.dataset.open = 'false';
    screen.pause();
    screen.removeAttribute('src');
    screen.hidden = true;
    openPiece = null;
  }

  // ---------- Moves ----------
  async function toDoor(focus: string | null): Promise<void> {
    hideFolder();
    engine.openDrawer(null);
    engine.liftFolder(null);
    syncDrawers();
    setStation('door');
    await engine.go('door');
    if (focus) label(focus)?.focus();
  }

  async function toCabinet(drawer: string | null, focus: string | null): Promise<void> {
    hideFolder();
    engine.liftFolder(null);
    setStation('cabinet');
    await engine.go('cabinet');
    engine.openDrawer(drawer);
    syncDrawers();
    await nextFrame();
    await nextFrame();
    label(focus ?? 'drawer:inside')?.focus();
  }

  async function toReceptionDesk(): Promise<void> {
    hideFolder();
    engine.openDrawer(null);
    syncDrawers();
    setStation('reception');
    await engine.go('reception');
    const box = document.getElementById('ask-box');
    const real = box?.shadowRoot?.querySelector<HTMLInputElement>('[part="input"]');
    (real ?? document.getElementById('ask-standin'))?.focus();
  }

  async function toDesk(piece: PieceId, mark?: () => Range | null): Promise<void> {
    const from = engine.station();
    if (from.startsWith('desk:')) hideFolder();
    else cameFrom = from === 'reception' ? 'reception' : 'cabinet';
    if (from === 'cabinet') {
      // Pull it out of its drawer first.
      engine.openDrawer(drawerOf(piece).id);
      syncDrawers();
      engine.liftFolder(piece);
      if (!reduced) await new Promise((r) => setTimeout(r, 420));
    }
    fillFolder(piece);
    setStation(`desk:${piece}`);
    await engine.go(`desk:${piece}`);
    showFolder(piece);
    if (mark) scrollToMark(mark());
  }

  async function stepBack(): Promise<void> {
    const s = engine.station();
    if (s.startsWith('desk:')) {
      const piece = s.slice(5) as PieceId;
      if (cameFrom === 'reception') return toReceptionDesk();
      return toCabinet(drawerOf(piece).id, `folder:${piece}`);
    }
    if (s === 'cabinet') {
      const open = engine.drawerOpen();
      if (open) {
        engine.openDrawer(null);
        syncDrawers();
        label(`drawer:${open}`)?.focus();
        return;
      }
      return toDoor('cabinet');
    }
    if (s === 'reception') return toDoor('reception');
  }

  function choose(target: string): void {
    const [kind, id] = target.split(':');
    if (kind === 'cabinet') void run(() => toCabinet(null, null));
    else if (kind === 'reception') void run(toReceptionDesk);
    else if (kind === 'radio') document.getElementById('radio-button')?.click();
    else if ((kind === 'desk' || kind === 'folder') && id && isPieceId(id)) void run(() => toDesk(id));
    else if (kind === 'drawer' && id) {
      void run(async () => {
        const open = engine.drawerOpen() === id;
        engine.openDrawer(open ? null : id);
        syncDrawers();
        if (open) return;
        await nextFrame();
        await nextFrame();
        // Into the drawer: its front folder.
        const first = DRAWERS.find((d) => d.id === id)?.pieces[0];
        if (first) label(`folder:${first}`)?.focus();
      });
    }
  }

  engine.onPick(choose);
  hall.addEventListener('click', (event) => {
    const el = (event.target as Element | null)?.closest<HTMLElement>('.room [data-target]');
    const target = el?.dataset.target ?? '';
    if (!el || !/^(cabinet|reception|desk:|folder:|drawer:)/.test(target)) return;
    event.preventDefault();
    choose(target);
  });
  for (const el of hall.querySelectorAll<HTMLElement>('.room [data-target]')) {
    const target = el.dataset.target ?? '';
    el.addEventListener('pointerenter', () => engine.hover(target));
    el.addEventListener('pointerleave', () => engine.hover(null));
    el.addEventListener('focus', () => engine.hover(target));
    el.addEventListener('blur', () => engine.hover(null));
  }
  document.getElementById('room-back')?.addEventListener('click', () => void run(stepBack));
  back?.addEventListener('click', () => {
    const s = engine.station();
    const piece = s.startsWith('desk:') ? (s.slice(5) as PieceId) : null;
    void run(() => toCabinet(piece ? drawerOf(piece).id : null, piece ? `folder:${piece}` : null));
  });
  toReception?.addEventListener('click', () => void run(toReceptionDesk));

  // Directory rows, list links and deep links pull the folder from wherever you stand.
  document.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('.board a[data-piece], .work__elsewhere a[data-piece]');
    const piece = link?.dataset.piece ?? '';
    if (link && isPieceId(piece)) {
      event.preventDefault();
      hall.scrollIntoView({ block: 'start' });
      void run(() => toDesk(piece));
      return;
    }
    const ask = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href="#ask"]');
    if (ask) {
      event.preventDefault();
      hall.scrollIntoView({ block: 'start' });
      void run(toReceptionDesk);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && engine.station() !== 'door') {
      event.preventDefault();
      void run(stepBack);
      return;
    }
    if (card && !card.hidden) trapTab(card, event);
  });

  const toggle = document.getElementById('replay-toggle');
  toggle?.addEventListener('click', () => {
    const paused = engine.togglePause();
    toggle.textContent = paused ? 'Play' : 'Pause';
    toggle.setAttribute('aria-pressed', String(paused));
  });

  const control: RoomControl = {
    answer(pieces, mark) {
      engine.answering(pieces);
      const first = pieces[0];
      // A refusal, or an answer from the CV, moves nothing.
      if (!first || engine.station() !== 'reception') return;
      void run(async () => {
        // A beat to read the answer, then the turn to the desk it came from.
        if (!reduced) await new Promise((r) => setTimeout(r, 700));
        if (engine.station() === 'reception') await toDesk(first, mark);
      });
    },
    source(piece) {
      void run(() => toDesk(piece));
    },
    setLight(light) {
      engine.setLight(light, !reduced);
    },
    pull(piece) {
      void run(() => toDesk(piece));
    },
  };
  return control;
}
