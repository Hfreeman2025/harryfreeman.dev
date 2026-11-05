// The desk's controller (branch design/desk-miniature): where you are (the desk, the office, the
// index box, the notebook, Reception or a builder's desk), what a click, Enter, Esc and the scroll
// wheel do there, the card beside a builder's desk, the notebook's rounds and Reception's printout.
// The engine draws; this decides.
//
// Esc, or scrolling up, always rises one step: from a builder's desk to where you came from (the
// office, the index box with that card's divider open, or Reception), from an open divider to the
// closed box, and from anywhere else back up to the desk.

import { DRAWERS, drawerOf } from '../content/drawers';
import { isPieceId, PIECES, type PieceId } from '../content/pieces';
import { fillFolder, loopSource, scrollToMark, trapTab } from '../folder';
import type { RoomLight, SignText } from '../room/grid';
import { popovers } from '../room/popover';
import type { Timeline } from '../timeline/schema';
import type { DeskEngine, Station } from './engine';
import { ROUNDS, type Round } from './objects';

export interface DeskControl {
  answer(pieces: readonly PieceId[], mark: () => Range | null, result?: unknown): void;
  source(piece: PieceId): void;
  setLight(light: RoomLight): void;
  setSign(text: SignText): void;
  pull(piece: PieceId): void;
}

const root = document.documentElement;
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** What the back button says, by where you are and where you came from. */
const BACK: Record<string, string> = {
  office: 'Rise to the desk',
  cabinet: 'Back to the desk',
  notebook: 'Back to the desk',
  reception: 'Back to the desk',
};

export async function startDesk(timeline: Timeline): Promise<DeskControl> {
  const hall = document.getElementById('hall');
  const stage = document.querySelector<HTMLElement>('.room__stage');
  const card = document.getElementById('card');
  const video = card?.querySelector<HTMLVideoElement>('.folder-card__video') ?? null;
  const labelsRoot = document.querySelector<HTMLElement>('.desk__labels');
  if (!hall || !stage || !card || !labelsRoot) throw new Error('the desk’s markup is missing');
  const reduced = root.dataset.motion === 'reduce';
  const params = new URLSearchParams(location.search);
  const at = Number(params.get('t'));
  const photo = root.dataset.photo !== undefined || params.has('hold');

  const { mountDesk } = await import('./engine');
  const engine: DeskEngine = await mountDesk({
    stage,
    labels: labelsRoot,
    timeline,
    ...(Number.isFinite(at) && at > 0 ? { startAt: at } : {}),
    paused: photo,
    reduced,
  });

  const replay = document.getElementById('replay');
  const caption = document.querySelector('.room__caption');
  if (replay && caption) caption.append(replay);

  const label = (action: string, at?: string) =>
    labelsRoot.querySelector<HTMLElement>(`[data-action="${action}"]${at ? `[data-at="${at}"]` : ''}`);
  let openPiece: PieceId | null = null;
  let cameFrom: Station = 'cabinet';
  let chain: Promise<void> = Promise.resolve();
  const run = (move: () => Promise<void>): Promise<void> => {
    chain = chain.then(move, move);
    return chain;
  };
  const backButton = document.getElementById('room-back');
  const setStation = (s: Station) => {
    root.dataset.station = s.startsWith('desk:') ? 'desk' : s;
    if (backButton) backButton.textContent = BACK[s] ?? 'Back to the desk';
    const notebookPanel = document.getElementById('notebook-panel');
    if (notebookPanel) notebookPanel.hidden = s !== 'notebook';
  };
  setStation('door');

  function syncDrawers(): void {
    const open = engine.drawerOpen();
    for (const el of labelsRoot?.querySelectorAll<HTMLElement>('[data-action^="drawer:"]') ?? [])
      el.setAttribute('aria-expanded', String(el.dataset.action === `drawer:${open ?? ''}`));
  }

  // ---------- The card beside a builder's desk ----------
  const back = document.getElementById('card-back');
  const toReception = document.getElementById('card-reception');
  function showFolder(piece: PieceId): void {
    if (!card) return;
    openPiece = piece;
    card.hidden = false;
    card.dataset.open = 'true';
    card.setAttribute('aria-modal', 'false');
    if (back) back.textContent = cameFrom === 'office' ? 'Back to the office' : 'Back to the cabinet';
    if (toReception) toReception.hidden = cameFrom !== 'reception';
    if (video) {
      // The card shows the tool's own loop.
      video.poster = `/loops/${piece}.webp`;
      video.src = loopSource(video, piece);
      if (!reduced) void video.play().catch(() => undefined);
    }
    document.getElementById('card-title')?.focus();
  }
  function hideFolder(): void {
    if (!card) return;
    card.hidden = true;
    card.dataset.open = 'false';
    video?.pause();
    video?.removeAttribute('src');
    if (openPiece) engine.stand(null, false);
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
    if (focus) label(focus, 'door')?.focus();
  }

  async function toOffice(focus: string | null): Promise<void> {
    hideFolder();
    setStation('office');
    await engine.go('office');
    await nextFrame();
    (focus ? label(focus, 'office') : label(`desk:${PIECES[0]?.id ?? ''}`, 'office'))?.focus();
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
    label(focus ?? 'drawer:inside', 'cabinet')?.focus();
  }

  async function toNotebook(): Promise<void> {
    hideFolder();
    setStation('notebook');
    await engine.go('notebook');
    document.querySelector<HTMLElement>('.desk__rounds [aria-selected="true"]')?.focus();
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

  /** To a builder's desk: from the index box the card comes out first; the builder stands and waves. */
  async function toDesk(piece: PieceId, from: Station, mark?: () => Range | null): Promise<void> {
    const now = engine.station();
    if (now.startsWith('desk:')) hideFolder();
    else cameFrom = from === 'reception' ? 'reception' : from === 'office' ? 'office' : 'cabinet';
    if (now === 'cabinet') {
      engine.openDrawer(drawerOf(piece).id);
      syncDrawers();
      engine.liftFolder(piece);
      if (!reduced) await new Promise((r) => setTimeout(r, 450));
    }
    fillFolder(piece);
    engine.stand(piece, true);
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
      if (cameFrom === 'office') return toOffice(`desk:${piece}`);
      return toCabinet(drawerOf(piece).id, `folder:${piece}`);
    }
    if (s === 'cabinet') {
      const open = engine.drawerOpen();
      if (open) {
        engine.openDrawer(null);
        syncDrawers();
        label(`drawer:${open}`, 'cabinet')?.focus();
        return;
      }
      return toDoor('cabinet');
    }
    if (s === 'office') return toDoor('office');
    if (s === 'notebook') return toDoor('notebook');
    if (s === 'reception') return toDoor('reception');
  }

  function choose(action: string): void {
    const [kind, id] = action.split(':');
    const from = engine.station();
    if (kind === 'office') void run(() => toOffice(null));
    else if (kind === 'cabinet' || kind === 'stamp') void run(() => toCabinet(null, null));
    else if (kind === 'notebook') void run(toNotebook);
    else if (kind === 'reception') void run(toReceptionDesk);
    else if (kind === 'radio') document.getElementById('radio-button')?.click();
    else if ((kind === 'desk' || kind === 'folder') && id && isPieceId(id)) void run(() => toDesk(id, from));
    else if (kind === 'drawer' && id) {
      void run(async () => {
        const open = engine.drawerOpen() === id;
        engine.openDrawer(open ? null : id);
        syncDrawers();
        if (open) return;
        await nextFrame();
        await nextFrame();
        const first = DRAWERS.find((d) => d.id === id)?.pieces[0];
        if (first) label(`folder:${first}`, 'cabinet')?.focus();
      });
    }
  }

  engine.onPick(choose);
  labelsRoot.addEventListener('click', (event) => {
    const el = (event.target as Element | null)?.closest<HTMLElement>('[data-action]');
    const action = el?.dataset.action ?? '';
    if (!el || action === 'sign' || action === 'radio' || !action) return;
    event.preventDefault();
    choose(action);
  });
  for (const el of labelsRoot.querySelectorAll<HTMLElement>('[data-action]')) {
    const action = el.dataset.action ?? '';
    el.addEventListener('pointerenter', () => engine.hover(action));
    el.addEventListener('pointerleave', () => engine.hover(null));
    el.addEventListener('focus', () => engine.hover(action));
    el.addEventListener('blur', () => engine.hover(null));
  }
  backButton?.addEventListener('click', () => void run(stepBack));
  back?.addEventListener('click', () => void run(stepBack));
  toReception?.addEventListener('click', () => void run(toReceptionDesk));

  // Directory rows, list links and deep links pull the card from wherever you are.
  document.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('.board a[data-piece], .work__elsewhere a[data-piece]');
    const piece = link?.dataset.piece ?? '';
    if (link && isPieceId(piece)) {
      event.preventDefault();
      hall.scrollIntoView({ block: 'start' });
      void run(() => toDesk(piece, 'cabinet'));
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
  // Scrolling up over the scene rises a step, as Esc does; scrolling down over the desk dives in.
  let wheelAt = 0;
  stage.addEventListener(
    'wheel',
    (event) => {
      const now = performance.now();
      if (now - wheelAt < 900 || Math.abs(event.deltaY) < 4) return;
      if (event.deltaY < 0 && engine.station() !== 'door') {
        wheelAt = now;
        event.preventDefault();
        void run(stepBack);
      } else if (event.deltaY > 0 && engine.station() === 'door') {
        wheelAt = now;
        event.preventDefault();
        void run(() => toOffice(null));
      }
    },
    { passive: false },
  );

  // ---------- The notebook: a page a round ----------
  const asks = document.getElementById('notebook-asks');
  const showRound = (round: Round) => {
    for (const tab of document.querySelectorAll<HTMLElement>('.desk__rounds [data-round]'))
      tab.setAttribute('aria-selected', String(tab.dataset.round === round));
    if (asks)
      asks.replaceChildren(
        ...PIECES.flatMap((p) => {
          const ask = p.brief.find((b) => b.doc === round)?.ask;
          if (!ask) return [];
          const li = document.createElement('li');
          const name = document.createElement('strong');
          name.textContent = p.title;
          li.append(name, document.createTextNode(` ${ask}`));
          return [li];
        }),
      );
  };
  showRound('BRIEF.md');
  for (const tab of document.querySelectorAll<HTMLElement>('.desk__rounds [data-round]')) {
    tab.addEventListener('click', () => {
      const round = tab.dataset.round as Round;
      if (!ROUNDS.includes(round)) return;
      showRound(round);
      engine.turnTo(round);
    });
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      const tabs = [...document.querySelectorAll<HTMLElement>('.desk__rounds [data-round]')];
      const i = tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : -1);
      const next = tabs[(i + tabs.length) % tabs.length];
      next?.focus();
      next?.click();
    });
  }

  // ---------- The grid's and the radio's cards ----------
  popovers(hall, [
    [label('sign', 'door'), document.getElementById('grid-sign')],
    [label('radio', 'office'), document.getElementById('radio')],
  ]);
  document.addEventListener('radio:state', (event) => engine.setRadio((event as CustomEvent<{ on: boolean }>).detail.on));

  if (params.has('debug')) Object.assign(window, { deskDebug: engine.debug });

  const toggle = document.getElementById('replay-toggle');
  toggle?.addEventListener('click', () => {
    const paused = engine.togglePause();
    toggle.textContent = paused ? 'Play' : 'Pause';
    toggle.setAttribute('aria-pressed', String(paused));
  });

  return {
    answer(pieces, mark) {
      engine.answering(pieces);
      const first = pieces[0];
      if (!first || engine.station() !== 'reception') return;
      void run(async () => {
        if (!reduced) await new Promise((r) => setTimeout(r, 700));
        if (engine.station() === 'reception') await toDesk(first, 'reception', mark);
      });
    },
    source(piece) {
      void run(() => toDesk(piece, engine.station()));
    },
    setLight(light) {
      engine.setLight(light, !reduced);
    },
    setSign(text) {
      engine.setSign(text);
    },
    pull(piece) {
      void run(() => toDesk(piece, 'cabinet'));
    },
  };
}
