// The studio: renderer, camera, the replay driving the figures, and the glide from the whole model
// down to one desk's screen, where the DOM card takes over.

import {
  Box3,
  CanvasTexture,
  Color,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  NoToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SpotLight,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  Vector2,
  Vector3,
  VideoTexture,
  WebGLRenderer,
} from 'three';
import { PIECE_IDS, PIECES, type PieceId, pieceById } from '../content/pieces';
import { type Phase, Replay } from '../timeline/replay';
import type { Timeline } from '../timeline/schema';
import { along, approachAngle, Figure, makeRoute, type Route } from './figures';
import { BASE, BOARD, DESKS, deskFor, LAMP, REVIEW, ROOM, routeToReview, SCREEN, WALL } from './layout';
import { BOUNCE, PALETTE } from './light';
import { atlasRect, buildModel } from './model';

export interface Studio {
  open(piece: PieceId, from: HTMLElement): Promise<void>;
  close(): Promise<void>;
  hover(piece: PieceId | null): void;
  answering(pieces: readonly PieceId[]): void;
  togglePause(): boolean;
}

interface MountOptions {
  readonly stage: HTMLElement;
  readonly labels: HTMLElement;
  readonly timeline: Timeline;
  /** Replay seconds to start at, and whether to hold there (photo mode). */
  readonly startAt?: number;
  readonly paused?: boolean;
}

interface View {
  readonly pos: Vector3;
  readonly look: Vector3;
}

const FOV = 24;
const ELEVATION = (43 * Math.PI) / 180;
const MODEL_TARGET = new Vector3(0, 0.3, 0.45);

const smooth = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** A stand-in atlas of each piece's own screen colour, until the recorded loops are present. */
function colourAtlas(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    for (const piece of PIECES) {
      const r = atlasRect(piece.id);
      ctx.fillStyle = piece.screen;
      ctx.fillRect(r.u0 * 1280, (1 - r.v1) * 400, 256, 200);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

async function loadTexture(url: string): Promise<Texture | null> {
  try {
    return await new TextureLoader().loadAsync(url);
  } catch {
    return null;
  }
}

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/London',
});

function describe(kind: string, round: number, brief: string | undefined): string {
  switch (kind) {
    case 'briefed':
      return brief ? `briefed with ${brief}` : 'briefed';
    case 'started':
      return 'starts building';
    case 'submitted':
      return `hands in for review, round ${round}`;
    case 'returned':
      return 'sent back by the reviewer';
    case 'accepted':
      return 'accepted';
    default:
      return kind;
  }
}

export async function mountStudio({ stage, labels, timeline, startAt = 0, paused: startPaused = false }: MountOptions): Promise<Studio> {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch {
    throw new Error('WebGL is unavailable');
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(PALETTE.room);
  stage.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const [floor, ground, poster] = await Promise.all([
    loadTexture('/bake/floor.webp'),
    loadTexture('/bake/ground.webp'),
    loadTexture('/loops/atlas.webp'),
  ]);
  if (!floor || !ground) throw new Error('the baked lighting did not load');

  const scene = new Scene();
  scene.background = new Color(PALETTE.room);
  const model = buildModel(floor, ground, poster ?? colourAtlas());
  scene.add(model.group);

  // The lamp, live, for everything that is not baked: matched to the bake's units.
  const lamp = new Vector3(...LAMP.position);
  const aim = new Vector3(...LAMP.target);
  const toAim = aim.clone().sub(lamp);
  const d2 = toAim.lengthSq();
  const cosAtAim = -toAim.clone().normalize().y;
  const spot = new SpotLight(
    PALETTE.lamp,
    (Math.PI * d2) / cosAtAim,
    0,
    LAMP.cone + LAMP.edge,
    (LAMP.edge / (LAMP.cone + LAMP.edge)) * 2,
    2,
  );
  spot.position.copy(lamp);
  spot.target.position.copy(aim);
  scene.add(spot, spot.target);
  scene.add(new HemisphereLight(PALETTE.lamp, PALETTE.bench, BOUNCE * Math.PI));

  // Figures: one builder per desk, and the reviewer.
  const replay = new Replay(timeline);
  const builders = new Map<PieceId, Figure>();
  const routes = new Map<PieceId, Route>();
  for (const d of DESKS) {
    const figure = new Figure();
    figure.x = d.seat[0];
    figure.z = d.seat[1];
    figure.facing = Math.PI;
    scene.add(figure.group);
    builders.set(d.piece, figure);
    routes.set(d.piece, makeRoute(routeToReview(d.piece, REVIEW.slots[0])));
  }
  const reviewer = new Figure();
  reviewer.x = REVIEW.reviewer[0];
  reviewer.z = REVIEW.reviewer[1];
  reviewer.facing = Math.PI;
  scene.add(reviewer.group);
  const tableSheet = new Mesh(new PlaneGeometry(0.27, 0.36), new MeshLambertMaterial({ color: '#f7f3ea' }));
  tableSheet.rotation.x = -Math.PI / 2;
  tableSheet.position.set(REVIEW.table.x - 0.1, 0.765, REVIEW.table.z - 0.05);
  tableSheet.visible = false;
  scene.add(tableSheet);

  // Camera and framing.
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 200);
  const corners: Vector3[] = [];
  // Frame the room and its back wall; the baseboard's margin may fall outside.
  for (const x of [ROOM.x0 - 0.25, ROOM.x1 + 0.25]) {
    corners.push(new Vector3(x, 0, ROOM.z1 + 0.3), new Vector3(x, WALL.back + 0.35, ROOM.z0));
  }
  void BASE;

  function overviewFor(aspect: number): View {
    const dir = new Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION));
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    let lo = 6;
    let hi = 120;
    const p = new Vector3();
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      camera.position.copy(MODEL_TARGET).addScaledVector(dir, mid);
      camera.lookAt(MODEL_TARGET);
      camera.updateMatrixWorld();
      const fits = corners.every((c) => {
        p.copy(c).project(camera);
        return Math.abs(p.x) <= 0.95 && p.y <= 0.84 && p.y >= -0.74;
      });
      if (fits) hi = mid;
      else lo = mid;
    }
    return { pos: MODEL_TARGET.clone().addScaledVector(dir, hi), look: MODEL_TARGET.clone() };
  }

  function deskView(piece: PieceId): View {
    const d = deskFor(piece);
    const screen = new Vector3(...d.screen);
    // Far enough back that the screen fills about 60% of the height, over the builder's shoulder.
    const dist = SCREEN.height / 0.6 / 2 / Math.tan(((FOV / 2) * Math.PI) / 180);
    return { pos: new Vector3(screen.x + 0.3, screen.y + 0.22, screen.z + dist), look: screen.clone().add(new Vector3(0, -0.03, 0)) };
  }

  let overview = overviewFor(1);
  const current: { pos: Vector3; look: Vector3 } = { pos: overview.pos.clone(), look: overview.look.clone() };
  let glide: { from: View; to: View; start: number; ms: number; done: () => void } | null = null;
  let labelsDirty = true;

  function resize(): void {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    overview = overviewFor(width / height);
    if (!zoomed && !glide) {
      current.pos.copy(overview.pos);
      current.look.copy(overview.look);
    }
    labelsDirty = true;
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);

  // Labels: real links, placed over their desks.
  const labelEls = new Map<string, HTMLAnchorElement>();
  for (const el of labels.querySelectorAll<HTMLAnchorElement>('.desk-label')) labelEls.set(el.dataset.piece ?? '', el);
  const anchorFor = (key: string): Vector3 => {
    if (key === 'brief') return new Vector3(0, WALL.back + 0.45, ROOM.z0);
    if (key === 'reviewer') return new Vector3(REVIEW.reviewer[0], 1.75, REVIEW.reviewer[1]);
    if (key === 'board') return new Vector3(BOARD.x, BOARD.bottom + BOARD.height + 0.12, BOARD.z);
    const d = deskFor(key as PieceId);
    return new Vector3(d.x, SCREEN.bottom + SCREEN.height + 0.08, d.screen[2]);
  };
  const anchors = new Map([...labelEls.keys()].map((k) => [k, anchorFor(k)]));
  const projected = new Vector3();
  const labelWidths = new Map<string, number>();
  function placeLabels(): void {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const screen = new Map<string, { x: number; y: number }>();
    for (const [key] of labelEls) {
      const a = anchors.get(key);
      if (!a) continue;
      projected.copy(a).project(camera);
      screen.set(key, { x: (projected.x * 0.5 + 0.5) * w, y: (-projected.y * 0.5 + 0.5) * h });
    }
    // When neighbouring desks are closer on screen than their labels are wide, every other label in
    // the row stands on a longer leader, as labels do on a crowded map.
    const staggered = new Set<string>();
    for (const row of [PIECE_IDS.slice(0, 5), PIECE_IDS.slice(5)]) {
      let crowded = false;
      for (let i = 1; i < row.length; i++) {
        const a = row[i - 1];
        const b = row[i];
        if (!a || !b) continue;
        for (const k of [a, b]) if (!labelWidths.has(k)) labelWidths.set(k, labelEls.get(k)?.offsetWidth ?? 0);
        const gap = Math.abs((screen.get(b)?.x ?? 0) - (screen.get(a)?.x ?? 0));
        if (gap < ((labelWidths.get(a) ?? 0) + (labelWidths.get(b) ?? 0)) / 2 + 8) crowded = true;
      }
      if (crowded) for (const [i, p] of row.entries()) if (i % 2 === 1) staggered.add(p);
    }
    for (const [key, el] of labelEls) {
      const at = screen.get(key);
      if (!at) continue;
      const { x, y } = at;
      const leader = key === 'brief' || key === 'board' || key === 'reviewer' ? 10 : staggered.has(key as PieceId) ? 42 : 16;
      el.style.setProperty('--leader', `${leader}px`);
      el.style.transform = `translate(${x.toFixed(1)}px, ${(y - leader).toFixed(1)}px) translate(-50%, -100%)`;
    }
    labelsDirty = false;
  }

  // State the loop reads.
  let s = startAt;
  let paused = startPaused;
  let zoomed = false;
  let hovered: PieceId | null = null;
  const answeringSet = new Set<PieceId>();
  const lastPhase = new Map<PieceId, Phase['kind']>();
  const flashUntil = new Map<PieceId, number>();
  const screenLevel = new Map<PieceId, number>(PIECE_IDS.map((p) => [p, 0.07]));
  const poolLevel = new Map<PieceId, number>(PIECE_IDS.map((p) => [p, 0]));
  const timeEl = document.getElementById('replay-time');
  const eventEl = document.getElementById('replay-event');
  const evidenceEl = document.getElementById('replay-evidence');
  let lastCaption = '';

  function update(dt: number, t: number): void {
    const k = 1 - Math.exp(-dt * 7);
    const phases = new Map<PieceId, Phase>(PIECE_IDS.map((p) => [p, replay.phase(p, s)]));
    const queue = [...phases.entries()]
      .filter(([, ph]) => ph.kind === 'at-review')
      .sort((a, b) => (a[1].kind === 'at-review' && b[1].kind === 'at-review' ? a[1].due - b[1].due : 0))
      .map(([p]) => p);
    let reviewing = false;

    for (const piece of PIECE_IDS) {
      const figure = builders.get(piece);
      const route = routes.get(piece);
      const phase = phases.get(piece);
      if (!figure || !route || !phase) continue;
      const d = deskFor(piece);
      const i = PIECE_IDS.indexOf(piece);
      let seated = 1;
      let lean = 0;
      let bob = 0;
      let carrying = false;
      let marked = false;
      const answering = answeringSet.has(piece);
      figure.answer += ((answering ? 1 : 0) - figure.answer) * k;

      switch (phase.kind) {
        case 'idle':
        case 'done':
        case 'building': {
          figure.x += (d.seat[0] - figure.x) * k;
          figure.z += (d.seat[1] - figure.z) * k;
          figure.facing = approachAngle(figure.facing, answering ? 0 : Math.PI, k);
          seated = 1 - figure.answer;
          lean = phase.kind === 'building' ? 0.1 + Math.sin(t * 2.1 + i) * 0.025 : phase.kind === 'done' ? -0.05 : 0;
          break;
        }
        case 'to-review': {
          const at = along(route, phase.progress);
          figure.x = at.x;
          figure.z = at.z;
          figure.facing = at.facing;
          seated = 1 - smooth(phase.progress / 0.14);
          bob = Math.abs(Math.sin(phase.progress * route.total * 3.2)) * 0.035;
          carrying = true;
          break;
        }
        case 'at-review': {
          const slot = REVIEW.slots[Math.min(queue.indexOf(piece), REVIEW.slots.length - 1)] ?? REVIEW.slots[0];
          figure.x += (slot[0] - figure.x) * k;
          figure.z += (slot[1] - figure.z) * k;
          figure.facing = approachAngle(figure.facing, 0, k);
          seated = 0;
          carrying = !phase.reviewing;
          if (phase.reviewing) reviewing = true;
          break;
        }
        case 'back': {
          const at = along(route, phase.progress, true);
          figure.x = at.x;
          figure.z = at.z;
          figure.facing = at.facing;
          seated = smooth((phase.progress - 0.86) / 0.14);
          bob = Math.abs(Math.sin(phase.progress * route.total * 3.2)) * 0.035;
          carrying = phase.outcome === 'returned';
          marked = carrying;
          break;
        }
      }
      figure.seated = seated;
      figure.sheet.visible = carrying;
      figure.mark.visible = marked;
      figure.pose(seated, lean, bob);

      // Screens: dark until the work starts, lit from then on.
      const target = phase.kind === 'idle' ? 0.07 : 1;
      const level = (screenLevel.get(piece) ?? 0) + (target - (screenLevel.get(piece) ?? 0)) * k;
      screenLevel.set(piece, level);
      model.screens.meshes.get(piece)?.material.color.setScalar(level);

      // The accepted board shows each piece once it has been accepted.
      const sheet = model.boardSheets.get(piece);
      if (sheet) sheet.visible = replay.beats.some((b) => b.piece === piece && b.kind === 'accepted' && b.scene <= s);

      // Lamp pools: hover and answers.
      const poolTarget = answering ? 0.85 : hovered === piece ? 0.5 : 0;
      const pool = (poolLevel.get(piece) ?? 0) + (poolTarget - (poolLevel.get(piece) ?? 0)) * k;
      poolLevel.set(piece, pool);
      const poolMesh = model.pools.get(piece);
      if (poolMesh) poolMesh.material.opacity = pool * 0.55;

      // Labels: a moment of red pencil when work is sent back, amber when it is accepted.
      const before = lastPhase.get(piece);
      if (before !== phase.kind) {
        lastPhase.set(piece, phase.kind);
        const label = labelEls.get(piece);
        if (label && phase.kind === 'back') {
          label.dataset.flash = phase.outcome;
          label.dataset.state = phase.outcome;
          const state = label.querySelector('.desk-label__state');
          if (state)
            state.textContent = phase.outcome === 'returned' ? `sent back, round ${phase.round}` : `accepted, round ${phase.round}`;
          flashUntil.set(piece, t + 2.6);
        }
      }
      const until = flashUntil.get(piece);
      if (until !== undefined && t > until) {
        flashUntil.delete(piece);
        const label = labelEls.get(piece);
        if (label) {
          delete label.dataset.flash;
          label.dataset.state = '';
        }
      }
    }

    // The reviewer leans in while reading, and the work lies on the table.
    reviewer.pose(1, reviewing ? 0.22 : 0.02, 0);
    tableSheet.visible = reviewing;

    // The brief in force glows on the wall.
    let currentBrief: string | undefined;
    let briefAt = -Infinity;
    for (const b of replay.beats) {
      if (b.scene > s) break;
      if (b.kind === 'briefed' && b.brief) {
        currentBrief = b.brief;
        briefAt = b.scene;
      }
    }
    for (const [doc, frame] of model.briefGlow) {
      const fresh = doc === currentBrief ? Math.max(0, 1 - (s - briefAt) / 3) : 0;
      frame.material.opacity = doc === currentBrief ? 0.35 + 0.55 * fresh : 0;
    }

    // Caption: the real time being replayed, and the latest hand-off.
    const real = replay.realAt(s);
    const latest = replay.latest(s);
    if (timeEl && eventEl) {
      const time = real === null ? 'No events' : dateFormat.format(real);
      let event = '';
      if (latest) {
        const phase = replay.phase(latest.piece, latest.scene + 0.001);
        const round = 'round' in phase ? phase.round : 0;
        event = `${pieceById(latest.piece).title} ${describe(latest.kind, round, latest.brief)}`;
      }
      const evidence = latest?.note ?? '';
      const caption = `${time}|${event}|${evidence}`;
      if (caption !== lastCaption) {
        lastCaption = caption;
        timeEl.textContent = time;
        eventEl.textContent = event;
        if (evidenceEl) evidenceEl.textContent = evidence;
      }
    }
  }

  // The render loop runs while the studio is on screen.
  let running = false;
  let visible = true;
  let last = performance.now();
  let cardOpen = false;
  function frame(now: number): void {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused && !zoomed) s = (s + dt) % replay.duration;
    update(dt, now / 1000);
    if (glide) {
      const t = Math.min(1, (now - glide.start) / glide.ms);
      const e = easeInOut(t);
      const look = smooth(Math.min(1, t * 1.35));
      current.pos.lerpVectors(glide.from.pos, glide.to.pos, e);
      current.look.lerpVectors(glide.from.look, glide.to.look, look);
      labelsDirty = true;
      if (t >= 1) {
        const done = glide.done;
        glide = null;
        done();
      }
    }
    camera.position.copy(current.pos);
    camera.lookAt(current.look);
    camera.updateMatrixWorld();
    renderer.render(scene, camera);
    if (labelsDirty) placeLabels();
    requestAnimationFrame(frame);
  }
  function setRunning(on: boolean): void {
    if (on === running) return;
    running = on;
    if (on) {
      last = performance.now();
      requestAnimationFrame(frame);
    }
  }
  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    setRunning(visible && !cardOpen);
  });
  io.observe(stage);

  resize();
  setRunning(true);

  // The recorded loops, once the studio is up: one video holds all ten screens.
  const startLoops = (): void => {
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    const mp4 = video.canPlayType('video/mp4; codecs="avc1.640028"');
    video.src = video.canPlayType('video/webm; codecs="vp9"') ? '/loops/atlas.webm' : mp4 ? '/loops/atlas.mp4' : '';
    if (!video.src) return;
    video.addEventListener(
      'playing',
      () => {
        const texture = new VideoTexture(video);
        texture.colorSpace = SRGBColorSpace;
        model.screens.setTexture(texture);
        document.documentElement.dataset.screens = 'video';
      },
      { once: true },
    );
    void video.play().catch(() => {
      // Autoplay refused: the screens keep their still frames.
    });
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(startLoops, { timeout: 2500 });
  else setTimeout(startLoops, 1200);

  // Pointer picking against each desk's bounds.
  const deskBounds = DESKS.map((d) => ({
    piece: d.piece,
    box: new Box3(new Vector3(d.x - 0.85, 0, d.z - 0.45), new Vector3(d.x + 0.85, SCREEN.bottom + SCREEN.height + 0.1, d.seat[1] + 0.3)),
  }));
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const hit = new Vector3();
  function pick(event: PointerEvent): PieceId | null {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    let best: PieceId | null = null;
    let bestDistance = Infinity;
    for (const { piece, box } of deskBounds) {
      if (raycaster.ray.intersectBox(box, hit)) {
        const distance = hit.distanceTo(raycaster.ray.origin);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = piece;
        }
      }
    }
    return best;
  }
  const canvas = renderer.domElement;
  canvas.addEventListener('pointermove', (event) => {
    if (zoomed) return;
    const piece = pick(event);
    if (piece !== hovered) api.hover(piece);
    canvas.style.cursor = piece ? 'pointer' : '';
  });
  canvas.addEventListener('pointerleave', () => !zoomed && api.hover(null));
  canvas.addEventListener('click', (event) => {
    if (zoomed) return;
    const piece = pick(event);
    const label = piece ? labelEls.get(piece) : undefined;
    if (piece && label) void api.open(piece, label);
  });

  function glideTo(to: View, ms: number): Promise<void> {
    return new Promise((resolve) => {
      glide = { from: { pos: current.pos.clone(), look: current.look.clone() }, to, start: performance.now(), ms, done: resolve };
      setRunning(true);
    });
  }

  // The card: the DOM takes over from the monitor.
  const card = document.getElementById('card');
  const cardFrame = card?.querySelector<HTMLElement>('.card__frame') ?? null;
  const cardScreen = card?.querySelector<HTMLElement>('.card__screen') ?? null;
  const cardBody = document.getElementById('card-body');
  const cardVideo = card?.querySelector<HTMLVideoElement>('.card__video') ?? null;
  const backButton = document.getElementById('card-back');
  let returnFocus: HTMLElement | null = null;
  let openPiece: PieceId | null = null;

  function monitorRect(piece: PieceId): DOMRect {
    const d = deskFor(piece);
    const rect = renderer.domElement.getBoundingClientRect();
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [dx, dy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      projected.set(d.screen[0] + (dx * SCREEN.width) / 2, d.screen[1] + (dy * SCREEN.height) / 2, d.screen[2]).project(camera);
      xs.push(rect.left + (projected.x * 0.5 + 0.5) * rect.width);
      ys.push(rect.top + (-projected.y * 0.5 + 0.5) * rect.height);
    }
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return new DOMRect(left, top, Math.max(...xs) - left, Math.max(...ys) - top);
  }

  /** The transform that puts the card's screen exactly over the monitor. */
  function frameOnMonitor(piece: PieceId): string {
    if (!cardFrame || !cardScreen) return 'none';
    cardFrame.style.transform = 'none';
    const frameRect = cardFrame.getBoundingClientRect();
    const screenRect = cardScreen.getBoundingClientRect();
    const target = monitorRect(piece);
    const scale = target.width / screenRect.width;
    const tx = target.left - (frameRect.left + (screenRect.left - frameRect.left) * scale);
    const ty = target.top - (frameRect.top + (screenRect.top - frameRect.top) * scale);
    return `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  function fillCard(piece: PieceId): void {
    if (!cardBody || !cardVideo) return;
    const source = document.querySelector(`#work-${piece} .work__text`);
    const clone = source?.cloneNode(true);
    cardBody.replaceChildren();
    if (clone instanceof HTMLElement) {
      for (const el of clone.querySelectorAll('[id]')) el.removeAttribute('id');
      const title = clone.querySelector('.work__title');
      if (title) {
        title.id = 'card-title';
        title.setAttribute('tabindex', '-1');
      }
      const wrapper = document.createElement('div');
      wrapper.className = 'work';
      wrapper.append(clone);
      cardBody.append(wrapper);
    }
    const webm = cardVideo.canPlayType('video/webm; codecs="vp9"');
    cardVideo.poster = `/loops/${piece}.webp`;
    cardVideo.src = webm ? `/loops/${piece}.webm` : `/loops/${piece}.mp4`;
    void cardVideo.play().catch(() => {
      // Autoplay refused: the poster stays.
    });
  }

  function trapFocus(event: KeyboardEvent): void {
    if (!card || card.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      void api.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...card.querySelectorAll<HTMLElement>('a[href], button, [tabindex="-1"]')].filter((el) => el.offsetParent !== null);
    const first = focusable[0];
    const lastEl = focusable.at(-1);
    if (!first || !lastEl) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      lastEl.focus();
    } else if (!event.shiftKey && document.activeElement === lastEl) {
      event.preventDefault();
      first.focus();
    }
  }
  document.addEventListener('keydown', trapFocus);
  backButton?.addEventListener('click', () => void api.close());
  card?.addEventListener('click', (event) => {
    if (event.target === card) void api.close();
  });

  const root = document.documentElement;
  let busy = false;

  const api: Studio = {
    async open(piece, from) {
      if (busy || zoomed || !card || !cardFrame) return;
      busy = true;
      zoomed = true;
      openPiece = piece;
      returnFocus = from;
      root.dataset.zoom = 'in';
      api.hover(piece);
      await glideTo(deskView(piece), 1300);
      fillCard(piece);
      card.hidden = false;
      const start = frameOnMonitor(piece);
      cardFrame.style.transition = 'none';
      cardFrame.style.transform = start;
      cardBody?.style.setProperty('opacity', '0');
      void cardFrame.offsetWidth;
      cardFrame.style.transition = 'transform 520ms cubic-bezier(0.2, 0.7, 0.2, 1)';
      cardFrame.style.transform = 'none';
      card.dataset.open = 'true';
      if (cardBody) {
        cardBody.style.transition = 'opacity 320ms ease 240ms';
        cardBody.style.opacity = '1';
      }
      await new Promise((r) => setTimeout(r, 560));
      cardOpen = true;
      setRunning(false);
      document.getElementById('card-title')?.focus();
      busy = false;
    },
    async close() {
      if (busy || !zoomed || !card || !cardFrame || !openPiece) return;
      busy = true;
      cardOpen = false;
      setRunning(visible);
      cardFrame.style.transition = 'transform 420ms cubic-bezier(0.5, 0, 0.7, 0.4)';
      cardFrame.style.transform = frameOnMonitor(openPiece);
      if (cardBody) {
        cardBody.style.transition = 'opacity 160ms ease';
        cardBody.style.opacity = '0';
      }
      card.dataset.open = 'false';
      await new Promise((r) => setTimeout(r, 430));
      card.hidden = true;
      cardVideo?.pause();
      cardVideo?.removeAttribute('src');
      await glideTo(overview, 1100);
      zoomed = false;
      delete root.dataset.zoom;
      api.hover(null);
      openPiece = null;
      busy = false;
      returnFocus?.focus();
    },
    hover(piece) {
      hovered = piece;
      for (const [key, el] of labelEls) {
        if (key === piece) el.dataset.hot = 'true';
        else delete el.dataset.hot;
      }
    },
    answering(pieces) {
      answeringSet.clear();
      for (const p of pieces) answeringSet.add(p);
    },
    togglePause() {
      paused = !paused;
      return paused;
    },
  };
  return api;
}
