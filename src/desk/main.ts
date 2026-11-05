// The desk's controller (branch design/desk-miniature): where you are (the desk, the office, the
// index box, the notebook, Reception or a builder's desk), what a click, Enter, Esc and the scroll
// wheel do there, the card beside a builder's desk, the notebook's rounds and Reception's printout.
// The engine draws; this decides.
//
// Esc, or scrolling up, always rises one step: from a builder's desk to where you came from (the
// office, the index box with that card's divider open, or Reception), from an open divider to the
// closed box, and from anywhere else back up to the desk.

import { DRAWERS, drawerOf } from '../content/drawers';
import { isPieceId, PIECES, type PieceId, pieceById } from '../content/pieces';
import { fillFolder, loopSource, scrollToMark } from '../folder';
import type { GridMix, RoomLight, SignText } from '../room/grid';
import { popovers } from '../room/popover';
import type { Timeline } from '../timeline/schema';
import type { DeskEngine, Station } from './engine';
import { SOURCES } from './furnish';
import { ROUNDS, type Round } from './objects';
import { placeSlip, printResult } from './printout';
import { speakCard } from './speak';

export interface DeskControl {
  answer(pieces: readonly PieceId[], mark: () => Range | null, result?: unknown): void;
  /** In through the door: the walk, the cut, and whether a click is on the door. */
  walkIn(): Promise<void>;
  cutIn(): void;
  hitsDoor(x: number, y: number): boolean;
  knock(): void;
  hoverDoor(on: boolean): void;
  doorRect(): { x: number; y: number; width: number; height: number } | null;
  source(piece: PieceId): void;
  setLight(light: RoomLight): void;
  setSign(text: SignText): void;
  /** The grid's wind and solar shares, for the window's turbines and panels; null keeps them still. */
  setMix(mix: GridMix | null): void;
  pull(piece: PieceId): void;
}

const root = document.documentElement;
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** What the back button says, by where you are and where you came from. */
const BACK: Record<string, string> = {
  office: 'Rise to the desk',
  room: 'Sit back down',
  cabinet: 'Back to the desk',
  notebook: 'Back to the desk',
  reception: 'Back to the desk',
};

/** Tab and Shift+Tab go round the screen's Open line and the card, as one place. */
function cycleTab(places: readonly HTMLElement[], event: KeyboardEvent): void {
  if (event.key !== 'Tab') return;
  const focusable = places
    .flatMap((place) => [...place.querySelectorAll<HTMLElement>('a[href], button, summary, [tabindex="-1"], [tabindex="0"]')])
    .filter((el) => el.offsetParent !== null && !el.closest('[hidden], [inert]'));
  const at = focusable.indexOf(document.activeElement as HTMLElement);
  if (at === -1) return;
  event.preventDefault();
  focusable[(at + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length]?.focus();
}

export async function startDesk(timeline: Timeline): Promise<DeskControl> {
  const hall = document.getElementById('hall');
  const stage = document.querySelector<HTMLElement>('.room__stage');
  const card = document.getElementById('card');
  // The loop plays on the builder's own screen (#desk-loop), not in the card.
  const video = document.querySelector<HTMLVideoElement>('#desk-loop');
  const screen = document.getElementById('desk-screen');
  const under = document.getElementById('desk-under');
  const labelsRoot = document.querySelector<HTMLElement>('.desk__labels');
  if (!hall || !stage || !card || !labelsRoot || !screen || !under) throw new Error('the desk’s markup is missing');
  // When the loop was recorded belongs with the loop, under the screen.
  const recorded = document.getElementById('card-recorded');
  if (recorded) under.append(recorded);
  const reduced = root.dataset.motion === 'reduce';
  const params = new URLSearchParams(location.search);
  const at = Number(params.get('t'));
  const photo = root.dataset.photo !== undefined || params.has('hold');

  const { mountDesk } = await import('./engine');
  const engine: DeskEngine = await mountDesk({
    stage,
    labels: labelsRoot,
    // What is printed on things in the scene, from the page's own words (kept in the HTML, visually hidden):
    // the name and role on the nameplate, the intro and links on the card, the door's plate, the credit.
    lettering: {
      masthead: document.querySelector<HTMLElement>('.masthead'),
      door: document.getElementById('entrance-plate'),
      credit: document.getElementById('desk-credit'),
    },
    // Outside the office door on a fresh visit or a reload (the head script's call).
    entrance: root.dataset.entrance === 'door',
    timeline,
    ...(Number.isFinite(at) && at > 0 ? { startAt: at } : {}),
    paused: photo,
    reduced,
  });

  // Skipped in (or came back) while the desk was loading: straight to the seat.
  if (engine.station() === 'entrance' && root.dataset.entrance !== 'door') engine.cutIn();

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
  const printout = document.getElementById('printout');
  const paper = document.getElementById('printout-paper');
  const setStation = (s: Station) => {
    root.dataset.station = s.startsWith('desk:') ? 'desk' : s;
    if (backButton) backButton.textContent = BACK[s] ?? 'Back to the desk';
    const notebookPanel = document.getElementById('notebook-panel');
    if (notebookPanel) notebookPanel.hidden = s !== 'notebook';
    if (s !== 'reception' && printout) printout.hidden = true;
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
    // One label, Back, wherever the card was opened from; under it, where Back (and Esc) goes.
    if (back) {
      const where = document.createElement('span');
      where.className = 'folder-card__where';
      where.textContent = cameFrom === 'office' ? ' to the office' : ' to the cabinet';
      back.replaceChildren('Back', where);
    }
    if (toReception) toReception.hidden = cameFrom !== 'reception';
    // The live tool opens from its screen: its Open line moves from the card to under the bezel.
    under?.querySelector('.work__open')?.remove();
    const open = card.querySelector('#card-actions .work__open');
    if (open) under?.prepend(open);
    if (video) {
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
    under?.querySelector('.work__open')?.remove();
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

  /** Up from the desk, standing back to look round the room. */
  async function toRoom(): Promise<void> {
    hideFolder();
    engine.openDrawer(null);
    syncDrawers();
    setStation('room');
    await engine.go('room');
    backButton?.focus({ preventScroll: true });
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
    if (s === 'room') return toDoor('room');
  }

  function choose(action: string): void {
    const [kind, id] = action.split(':');
    const from = engine.station();
    if (kind === 'office') void run(() => toOffice(null));
    else if (kind === 'cabinet' || kind === 'stamp') void run(() => toCabinet(null, null));
    else if (kind === 'notebook') void run(toNotebook);
    else if (kind === 'room') void run(toRoom);
    else if (kind === 'reception') void run(toReceptionDesk);
    else if (kind === 'radio') document.getElementById('radio-button')?.click();
    else if (kind === 'mic') speak?.toggle();
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
    if (!el || action === 'sign' || action === 'radio' || action === 'shelf' || action === 'mic' || !action) return;
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
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('.index a[data-piece], .work__elsewhere a[data-piece]');
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
    // At Reception, what is typed into the question box presses the giant keyboard's keys.
    if (engine.station() === 'reception' && !event.metaKey && !event.ctrlKey && !event.altKey) engine.press(event.key);
    if (event.key === 'Escape' && engine.station() !== 'door') {
      event.preventDefault();
      void run(stepBack);
      return;
    }
    if (card && !card.hidden) cycleTab([screen, card], event);
  });
  // Scrolling over the scene: at the desk, down dives into the office and up looks up at the room; looking
  // round the room, down sits back down; anywhere else, up rises a step, as Esc does.
  let wheelAt = 0;
  stage.addEventListener(
    'wheel',
    (event) => {
      const now = performance.now();
      if (now - wheelAt < 900 || Math.abs(event.deltaY) < 4) return;
      const s = engine.station();
      const up = event.deltaY < 0;
      const move = s === 'room' ? (up ? null : stepBack) : s === 'door' ? (up ? toRoom : () => toOffice(null)) : up ? stepBack : null;
      if (!move) return;
      wheelAt = now;
      event.preventDefault();
      void run(move);
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

  // ---------- Speak to me: the mic's contact card (it never listens) ----------
  const micCover = label('mic', 'door');
  const speakEl = document.getElementById('speak');
  const speak =
    micCover && speakEl
      ? speakCard({
          trigger: micCover,
          card: speakEl,
          hall,
          reduced,
          onAir: (on) => engine.onAir(on),
          head: () => engine.micHead(),
          // Every thing on the desk, and every label shown over it.
          avoid: () => [
            ...engine.objectRects(),
            ...[...document.querySelectorAll<HTMLElement>('.desk__labels > :not([hidden])')]
              .filter((el) => el !== micCover)
              .map((el) => el.getBoundingClientRect()),
          ],
        })
      : null;

  // ---------- The grid's, the radio's and the shelf's cards ----------
  /** What a source fed, in the tools' own names. */
  const fedBy = (fed: readonly PieceId[]) => fed.map((id) => pieceById(id).title).join(', ');
  const shelf = document.getElementById('shelf');
  const shelfList = shelf?.querySelector('.shelf-card__list');
  if (shelf && shelfList) {
    shelfList.replaceChildren(
      ...SOURCES.map((source) => {
        const item = document.createElement('li');
        const title = document.createElement('span');
        title.className = 'shelf-card__book';
        title.textContent = source.title;
        const by = document.createElement('span');
        by.className = 'shelf-card__by';
        by.textContent = `${source.by} · fed ${fedBy(source.fed)}`;
        item.append(title, by);
        return item;
      }),
    );
    shelf.hidden = false;
  }
  popovers(hall, [
    [label('sign', 'door'), document.getElementById('grid-sign')],
    [label('radio', 'office'), document.getElementById('radio')],
    [label('radio', 'room'), document.getElementById('radio')],
    [label('shelf', 'room'), shelf],
  ]);

  // Looking round the room, the shelf's spines say what they are and which tool they fed. A new book is new
  // lines (made afresh, so nothing in the tip moves), and the tip follows the pointer by transform.
  const spine = document.getElementById('desk-spine');
  let spineAt: number | null = null;
  const line = (className: string, text: string) => {
    const el = document.createElement('span');
    el.className = className;
    el.textContent = text;
    return el;
  };
  stage.addEventListener('pointermove', (event) => {
    if (!spine) return;
    const i = engine.station() === 'room' ? engine.pickBook(event.clientX, event.clientY) : null;
    const source = i === null ? undefined : SOURCES[i];
    if (!source) {
      spine.hidden = true;
      spineAt = null;
      return;
    }
    if (i !== spineAt) {
      spineAt = i;
      spine.replaceChildren(
        line('desk-spine__title', source.title),
        line('desk-spine__by', source.by),
        line('desk-spine__fed', `fed ${fedBy(source.fed)}`),
      );
    }
    spine.hidden = false;
    const r = hall.getBoundingClientRect();
    spine.style.transform = `translate(${(event.clientX - r.left + 14).toFixed(0)}px, ${(event.clientY - r.top + 16).toFixed(0)}px)`;
  });
  stage.addEventListener('pointerleave', () => {
    if (spine) spine.hidden = true;
    spineAt = null;
  });
  document.addEventListener('radio:state', (event) => engine.setRadio((event as CustomEvent<{ on: boolean }>).detail.on));

  if (params.has('debug')) Object.assign(window, { deskDebug: { ...engine.debug, objectRects: () => engine.objectRects() } });

  const toggle = document.getElementById('replay-toggle');
  toggle?.addEventListener('click', () => {
    const paused = engine.togglePause();
    toggle.textContent = paused ? 'Play' : 'Pause';
    toggle.setAttribute('aria-pressed', String(paused));
  });

  return {
    answer(pieces, mark, result) {
      engine.answering(pieces);
      if (engine.station() !== 'reception') return;
      // The answer prints out of the tiny printer on the counter, a refusal as a refusal; then the builder
      // whose README answered stands, and the camera goes to their desk with the quoted line marked.
      const printed = printout && paper && result !== undefined ? printResult(paper, result) : null;
      if (printout && printed) {
        printout.hidden = false;
        delete printout.dataset.printing;
        void printout.offsetWidth;
        printout.dataset.printing = 'true';
        placeSlip(printout, hall, engine.printerPoint());
        paper?.addEventListener('animationend', () => delete printout.dataset.printing, { once: true });
      }
      const first = pieces[0];
      if (!first || printed === 'refusal') return;
      engine.stand(first, false);
      void run(async () => {
        if (!reduced) await new Promise((r) => setTimeout(r, printed ? 2400 : 700));
        if (engine.station() === 'reception') await toDesk(first, 'reception', mark);
      });
    },
    walkIn: () => engine.walkIn(),
    cutIn: () => engine.cutIn(),
    hitsDoor: (x, y) => engine.hitsDoor(x, y),
    knock: () => engine.knock(),
    hoverDoor: (on) => engine.hoverDoor(on),
    doorRect: () => engine.doorRect(),
    source(piece) {
      void run(() => toDesk(piece, engine.station()));
    },
    setLight(light) {
      engine.setLight(light, !reduced);
    },
    setSign(text) {
      engine.setSign(text);
    },
    setMix(mix) {
      engine.setMix(mix);
      const now = document.getElementById('window-now');
      if (now)
        now.textContent = mix
          ? `Outside: wind ${Math.round(mix.wind)}% and solar ${Math.round(mix.solar)}% of Great Britain’s power this half-hour`
          : 'Outside: the grid’s wind and sun are unavailable, so the turbines stand still';
    },
    pull(piece) {
      void run(() => toDesk(piece, 'cabinet'));
    },
  };
}
