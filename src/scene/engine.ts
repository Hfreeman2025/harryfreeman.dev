// The room, rendered: renderer and camera, the lamp (which follows the grid), the cabinet, the
// radio's lamp, the crew replaying the build, labels placed over what they name, and pointer picking.
// What happens when something is chosen is the controller's business (room/controller.ts).

import {
  Box3,
  CanvasTexture,
  CircleGeometry,
  Color,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  NoToneMapping,
  PerspectiveCamera,
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
import { drawerOf } from '../content/drawers';
import { isPieceId, PIECE_IDS, PIECES, type PieceId } from '../content/pieces';
import { NEUTRAL_LIGHT, type RoomLight } from '../room/grid';
import type { Timeline } from '../timeline/schema';
import { Cabinet } from './cabinet';
import { Crew } from './crew';
import { BOARD, BRIEF, CABINET, DESKS, deskFor, LAMP, RADIO, RECEPTION, REVIEW, ROOM, SCREEN, SHELF, SIGN, WALL } from './layout';
import { BOUNCE, PALETTE } from './light';
import { atlasRect, buildModel } from './model';

export type Station = 'door' | 'cabinet' | 'reception' | `desk:${PieceId}`;

export interface RoomEngine {
  station(): Station;
  go(station: Station): Promise<void>;
  openDrawer(id: string | null): void;
  drawerOpen(): string | null;
  liftFolder(piece: PieceId | null): void;
  hover(target: string | null): void;
  answering(pieces: readonly PieceId[]): void;
  setLight(light: RoomLight, animate: boolean): void;
  setRadio(on: boolean): void;
  monitorRect(piece: PieceId): DOMRect;
  togglePause(): boolean;
  onPick(fn: (target: string) => void): void;
}

interface MountOptions {
  readonly stage: HTMLElement;
  /** Everything placed over the room: elements under it with a `data-target`. */
  readonly labels: HTMLElement;
  readonly timeline: Timeline;
  readonly startAt?: number;
  readonly paused?: boolean;
  readonly reduced?: boolean;
}

interface View {
  readonly pos: Vector3;
  readonly look: Vector3;
  /** Vertical field of view in degrees: a wider lens at a desk, where the camera stands close. */
  readonly fov: number;
}

const FOV = 24;
const DOOR_ELEVATION = (31 * Math.PI) / 180;
const DOOR_TARGET = new Vector3(0, 0.35, 0.55);
const TAN = Math.tan(((FOV / 2) * Math.PI) / 180);

const smooth = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

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

export async function mountRoom({
  stage,
  labels,
  timeline,
  startAt = 0,
  paused: startPaused = false,
  reduced = false,
}: MountOptions): Promise<RoomEngine> {
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

  await document.fonts.load('600 22px "IBM Plex Sans Condensed"').catch(() => undefined);
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
  const cabinet = new Cabinet();
  scene.add(cabinet.group);

  // The lamp, live for everything that is not baked, matched to the bake's units; the grid tints it.
  const lamp = new Vector3(...LAMP.position);
  const aim = new Vector3(...LAMP.target);
  const toAim = aim.clone().sub(lamp);
  const baseSpot = (Math.PI * toAim.lengthSq()) / -toAim.clone().normalize().y;
  const spot = new SpotLight(PALETTE.lamp, baseSpot, 0, LAMP.cone + LAMP.edge, (LAMP.edge / (LAMP.cone + LAMP.edge)) * 2, 2);
  spot.position.copy(lamp);
  spot.target.position.copy(aim);
  const fill = new HemisphereLight(PALETTE.lamp, PALETTE.bench, BOUNCE * Math.PI);
  const baseFill = fill.intensity;
  scene.add(spot, spot.target, fill);
  const lampColour = new Color(PALETTE.lamp);
  let light = { ...NEUTRAL_LIGHT, colour: [...NEUTRAL_LIGHT.colour] as [number, number, number] };
  let lightTarget: RoomLight = NEUTRAL_LIGHT;
  const applyLight = () => {
    const [r, g, b] = light.colour;
    const [nr, ng, nb] = NEUTRAL_LIGHT.colour;
    const tint = new Color(r / nr, g / ng, b / nb).multiplyScalar(light.level / NEUTRAL_LIGHT.level);
    spot.color.copy(lampColour).multiply(tint);
    fill.color.copy(lampColour).multiply(tint);
    spot.intensity = baseSpot;
    fill.intensity = baseFill;
    for (const m of model.baked) m.color.copy(tint);
  };

  // The radio's on/off lamp, on its front.
  const radioLamp = new Mesh(new CircleGeometry(0.03, 16), new MeshBasicMaterial({ color: '#3b3f3a', toneMapped: false }));
  radioLamp.position.set(RADIO.x + RADIO.width / 2 - 0.08, SHELF.y + RADIO.height - 0.08, ROOM.z0 + 0.04 + RADIO.depth + 0.003);
  const grille = new Mesh(new CircleGeometry(0.11, 24), new MeshBasicMaterial({ color: '#2a1c18' }));
  grille.position.set(RADIO.x - 0.1, SHELF.y + RADIO.height / 2, ROOM.z0 + 0.04 + RADIO.depth + 0.002);
  scene.add(radioLamp, grille);

  // Labels: real links and buttons placed over what they name.
  const labelEls = [...labels.querySelectorAll<HTMLElement>('[data-target]')];
  const deskLabel = (piece: PieceId) => labelEls.find((el) => el.dataset.target === `desk:${piece}`);
  const crew = new Crew({ scene, model, timeline, startAt, labelFor: deskLabel });

  const camera = new PerspectiveCamera(FOV, 1, 0.1, 200);
  const corners: Vector3[] = [];
  for (const x of [ROOM.x0 - 0.2, ROOM.x1 + 0.2]) corners.push(new Vector3(x, 0, ROOM.z1 + 0.2), new Vector3(x, WALL.back + 0.3, ROOM.z0));

  function doorView(aspect: number): View {
    const dir = new Vector3(0, Math.sin(DOOR_ELEVATION), Math.cos(DOOR_ELEVATION));
    camera.aspect = aspect;
    camera.fov = FOV;
    camera.updateProjectionMatrix();
    let lo = 6;
    let hi = 120;
    const p = new Vector3();
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      camera.position.copy(DOOR_TARGET).addScaledVector(dir, mid);
      camera.lookAt(DOOR_TARGET);
      camera.updateMatrixWorld();
      const fits = corners.every((c) => {
        p.copy(c).project(camera);
        // A band is kept clear above the back wall for the sign's and the radio's cards.
        return Math.abs(p.x) <= 0.96 && p.y <= 0.62 && p.y >= -0.84;
      });
      if (fits) hi = mid;
      else lo = mid;
    }
    // The next frame puts back the lens of wherever the camera is (applyCamera).
    return { pos: DOOR_TARGET.clone().addScaledVector(dir, hi), look: DOOR_TARGET.clone(), fov: FOV };
  }
  const fitDistance = (height: number) => height / 2 / TAN;
  function viewOf(s: Station): View {
    if (s === 'door') return door;
    if (s === 'cabinet') {
      const d = fitDistance(CABINET.height + 0.5);
      return {
        pos: new Vector3(CABINET.x + 0.45, 1.05 + d * 0.42, CABINET.z + d * 0.9),
        look: new Vector3(CABINET.x + 0.15, 0.72, CABINET.z + 0.35),
        fov: FOV,
      };
    }
    if (s === 'reception') {
      const d = fitDistance(1.9);
      return {
        pos: new Vector3(RECEPTION.x - 0.9, 1.2 + d * 0.38, RECEPTION.z + d * 0.92),
        look: new Vector3(RECEPTION.x - 0.9, 0.85, RECEPTION.z),
        fov: FOV,
      };
    }
    const desk = deskFor(s.slice(5) as PieceId);
    const screen = new Vector3(...desk.screen);
    // The folder takes the right of the room (room.css: .folder-card, min(560px, 46%) plus margins);
    // the screen fills most of what is left, centred in it. The camera stays between the rows (a
    // back-row screen is never seen past a front-row monitor) and just above the builder's head, so
    // the lens widens to fit the screen to the space.
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    const free = Math.max(w * 0.4, w - (Math.min(560, 0.46 * w) + 48));
    const px = Math.min(free * 0.84, (h * 0.6 * SCREEN.width) / SCREEN.height);
    const d = 2.3;
    const tanHalf = (SCREEN.width * h) / (2 * d * px);
    const ndc = free / w - 1;
    const dx = -ndc * d * tanHalf * (w / h);
    const look = screen.clone().add(new Vector3(dx, 0, 0));
    return { pos: new Vector3(look.x, screen.y + 0.42, screen.z + d), look, fov: (2 * Math.atan(tanHalf) * 180) / Math.PI };
  }

  let door = doorView(1);
  let station: Station = 'door';
  const current = { pos: door.pos.clone(), look: door.look.clone(), fov: FOV };
  let glide: { from: View; to: View; start: number; ms: number; done: () => void } | null = null;
  let labelsDirty = true;

  function resize(): void {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    door = doorView(w / h);
    if (!glide) {
      const v = viewOf(station);
      current.pos.copy(v.pos);
      current.look.copy(v.look);
      current.fov = v.fov;
    }
    labelsDirty = true;
  }
  new ResizeObserver(resize).observe(stage);

  const anchorOf = (target: string): Vector3 | null => {
    const [kind, id] = target.split(':');
    if (kind === 'desk' && id && isPieceId(id)) {
      const d = deskFor(id);
      return new Vector3(d.x, SCREEN.bottom + SCREEN.height + 0.08, d.screen[2]);
    }
    if (kind === 'reception') return new Vector3(RECEPTION.x, RECEPTION.height + 0.1, RECEPTION.z);
    if (kind === 'radio') return new Vector3(RADIO.x, SHELF.y + RADIO.height, ROOM.z0 + 0.15);
    if (kind === 'sign') return new Vector3(SIGN.x, SIGN.y + SIGN.height / 2, ROOM.z0 + 0.03);
    // On the wall just above the three briefs, below the band the sign and the radio hang in.
    if (kind === 'brief') return new Vector3(BRIEF.table.x, BRIEF.sheetY + BRIEF.sheetSize[1] / 2 + 0.1, ROOM.z0);
    if (kind === 'reviewer') return new Vector3(REVIEW.reviewer[0], 1.75, REVIEW.reviewer[1]);
    if (kind === 'board') return new Vector3(BOARD.x, BOARD.bottom + BOARD.height + 0.12, BOARD.z);
    return cabinet.anchor(target);
  };
  const projected = new Vector3();
  const widths = new Map<HTMLElement, number>();
  const standing = (): string => (station.startsWith('desk:') ? 'desk' : station);
  function shownAt(el: HTMLElement): boolean {
    if ((el.dataset.at ?? 'door') !== standing()) return false;
    const target = el.dataset.target ?? '';
    if (target.startsWith('folder:')) {
      const piece = target.slice(7);
      return isPieceId(piece) && cabinet.isOpen(drawerOf(piece).id);
    }
    return true;
  }
  function placeLabels(): void {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const at = new Map<HTMLElement, { x: number; y: number }>();
    for (const el of labelEls) {
      const a = shownAt(el) && !glide ? anchorOf(el.dataset.target ?? '') : null;
      if (a) projected.copy(a).project(camera);
      const onScreen = a !== null && projected.z < 1 && Math.abs(projected.x) < 1.02 && Math.abs(projected.y) < 1.02;
      if (el.hidden === onScreen) el.hidden = !onScreen;
      if (onScreen) at.set(el, { x: (projected.x * 0.5 + 0.5) * w, y: (-projected.y * 0.5 + 0.5) * h });
    }
    // When neighbouring desks are closer on screen than their labels are wide, every other label in
    // the row stands on a longer leader, as labels do on a crowded map.
    const staggered = new Set<HTMLElement>();
    for (const row of [PIECE_IDS.slice(0, 5), PIECE_IDS.slice(5)]) {
      const els = row.map(deskLabel).filter((el): el is HTMLElement => el !== undefined && at.has(el));
      let crowded = false;
      for (let i = 1; i < els.length; i++) {
        const a = els[i - 1];
        const b = els[i];
        if (!a || !b) continue;
        for (const el of [a, b]) if (!widths.has(el)) widths.set(el, el.offsetWidth);
        const gap = Math.abs((at.get(b)?.x ?? 0) - (at.get(a)?.x ?? 0));
        if (gap < ((widths.get(a) ?? 0) + (widths.get(b) ?? 0)) / 2 + 8) crowded = true;
      }
      if (crowded) for (const [i, el] of els.entries()) if (i % 2 === 1) staggered.add(el);
    }
    const top = new Vector3();
    for (const [el, { x, y }] of at) {
      const place = el.dataset.place ?? 'above';
      if (place === 'cover') {
        // A drawer's button lies over its front, so the 3D label is the one you read.
        const corners = cabinet.frontCorners((el.dataset.target ?? '').slice(7)).map((c) => c.project(camera));
        const xs = corners.map((c) => (c.x * 0.5 + 0.5) * w);
        const ys = corners.map((c) => (-c.y * 0.5 + 0.5) * h);
        const left = Math.min(...xs);
        const topY = Math.min(...ys);
        el.style.width = `${(Math.max(...xs) - left).toFixed(1)}px`;
        el.style.height = `${(Math.max(...ys) - topY).toFixed(1)}px`;
        el.style.transform = `translate(${left.toFixed(1)}px, ${topY.toFixed(1)}px)`;
        continue;
      }
      if (place === 'wall') {
        // The sign and the radio hang their cards above the back wall, on a line down to the thing itself.
        const a = anchorOf(el.dataset.target ?? '');
        if (!a) continue;
        top.set(a.x, WALL.back + 0.08, ROOM.z0).project(camera);
        const ty = (-top.y * 0.5 + 0.5) * h;
        el.style.setProperty('--leader', `${Math.max(6, y - ty).toFixed(1)}px`);
        el.style.transform = `translate(${x.toFixed(1)}px, ${ty.toFixed(1)}px) translate(-50%, -100%)`;
        continue;
      }
      const leader =
        place !== 'above'
          ? 0
          : el.classList.contains('desk-label') && !el.classList.contains('desk-label--room')
            ? staggered.has(el)
              ? 42
              : 16
            : 10;
      el.style.setProperty('--leader', `${leader}px`);
      const shift = place === 'centre' ? 'translate(-50%, -50%)' : place === 'right' ? 'translate(0, -50%)' : 'translate(-50%, -100%)';
      el.style.transform = `translate(${x.toFixed(1)}px, ${(y - leader).toFixed(1)}px) ${shift}`;
    }
    labelsDirty = false;
  }

  function applyCamera(): void {
    if (camera.fov !== current.fov) {
      camera.fov = current.fov;
      camera.updateProjectionMatrix();
    }
    camera.position.copy(current.pos);
    camera.lookAt(current.look);
    camera.updateMatrixWorld();
  }

  // The loop: replay, cabinet, light, camera, labels.
  let paused = startPaused;
  let running = false;
  let last = performance.now();
  function frame(now: number): void {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused) crew.s = (crew.s + dt) % crew.replay.duration;
    crew.update(dt, now / 1000);
    if (cabinet.update(dt, reduced)) labelsDirty = true;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 1.8);
    for (let i = 0; i < 3; i++) light.colour[i] = (light.colour[i] ?? 1) + ((lightTarget.colour[i] ?? 1) - (light.colour[i] ?? 1)) * k;
    light.level += (lightTarget.level - light.level) * k;
    applyLight();
    // At a desk the camera stands among the builders; anyone right in front of it steps aside.
    crew.near = station.startsWith('desk:') && !glide ? { x: current.pos.x, z: current.pos.z, r: 1.7 } : null;
    if (glide) {
      const t = Math.min(1, (now - glide.start) / glide.ms);
      current.pos.lerpVectors(glide.from.pos, glide.to.pos, easeInOut(t));
      current.look.lerpVectors(glide.from.look, glide.to.look, smooth(Math.min(1, t * 1.35)));
      current.fov = glide.from.fov + (glide.to.fov - glide.from.fov) * easeInOut(t);
      labelsDirty = true;
      if (t >= 1) {
        const done = glide.done;
        glide = null;
        done();
      }
    }
    applyCamera();
    renderer.render(scene, camera);
    if (labelsDirty) placeLabels();
    requestAnimationFrame(frame);
  }
  let visible = true;
  function setRunning(on: boolean): void {
    if (on === running) return;
    running = on;
    if (on) {
      last = performance.now();
      requestAnimationFrame(frame);
    }
  }
  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    setRunning(visible);
  }).observe(stage);
  resize();
  setRunning(true);

  // One video holds all ten screens' loops.
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
    void video.play().catch(() => undefined);
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(startLoops, { timeout: 2500 });
  else setTimeout(startLoops, 1200);

  // Picking: what is under the pointer depends on where you stand.
  const boxes: Array<{ target: string; box: Box3; at: 'door' }> = [
    ...DESKS.map((d) => ({
      target: `desk:${d.piece}`,
      box: new Box3(new Vector3(d.x - 0.85, 0, d.z - 0.45), new Vector3(d.x + 0.85, SCREEN.bottom + SCREEN.height + 0.1, d.seat[1] + 0.3)),
      at: 'door' as const,
    })),
    {
      target: 'cabinet',
      box: new Box3(
        new Vector3(CABINET.x - 0.55, 0, CABINET.z - 0.4),
        new Vector3(CABINET.x + 0.55, CABINET.height + 0.05, CABINET.z + 0.4),
      ),
      at: 'door',
    },
    {
      target: 'reception',
      box: new Box3(
        new Vector3(RECEPTION.x - RECEPTION.width / 2, 0, RECEPTION.z - 0.45),
        new Vector3(RECEPTION.x + RECEPTION.width / 2, RECEPTION.height + 0.1, RECEPTION.z + 0.45),
      ),
      at: 'door',
    },
    {
      target: 'radio',
      box: new Box3(
        new Vector3(RADIO.x - RADIO.width / 2, SHELF.y, ROOM.z0),
        new Vector3(RADIO.x + RADIO.width / 2, SHELF.y + RADIO.height, ROOM.z0 + 0.3),
      ),
      at: 'door',
    },
  ];
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const hit = new Vector3();
  function pick(event: PointerEvent): string | null {
    if (glide) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    if (station === 'cabinet') {
      const hits = raycaster.intersectObjects(
        cabinet.pickables.filter((m) => m.visible && m.parent?.visible !== false),
        false,
      );
      return (hits[0]?.object.userData.target as string | undefined) ?? null;
    }
    if (station !== 'door') return null;
    let best: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const { target, box } of boxes) {
      if (raycaster.ray.intersectBox(box, hit)) {
        const distance = hit.distanceTo(raycaster.ray.origin);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = target;
        }
      }
    }
    return best;
  }
  const pickHandlers: Array<(target: string) => void> = [];
  const canvas = renderer.domElement;
  canvas.addEventListener('pointermove', (event) => {
    const target = pick(event);
    api.hover(target);
    canvas.style.cursor = target ? 'pointer' : '';
  });
  canvas.addEventListener('pointerleave', () => api.hover(null));
  canvas.addEventListener('click', (event) => {
    const target = pick(event);
    if (target) for (const fn of pickHandlers) fn(target);
  });

  const api: RoomEngine = {
    station: () => station,
    go(next) {
      station = next;
      labelsDirty = true;
      const to = viewOf(next);
      if (reduced) {
        current.pos.copy(to.pos);
        current.look.copy(to.look);
        current.fov = to.fov;
        applyCamera();
        placeLabels();
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        glide = {
          from: { pos: current.pos.clone(), look: current.look.clone(), fov: current.fov },
          to,
          start: performance.now(),
          ms: next === 'door' ? 1100 : 1300,
          done: resolve,
        };
        setRunning(true);
      });
    },
    openDrawer(id) {
      cabinet.open(id);
      labelsDirty = true;
    },
    drawerOpen: () => cabinet.drawers.find((d) => d.outTarget > 0)?.id ?? null,
    liftFolder(piece) {
      cabinet.lift(piece);
    },
    hover(target) {
      crew.hovered = target?.startsWith('desk:') ? (target.slice(5) as PieceId) : null;
      for (const el of labelEls) {
        if (el.dataset.target === target) el.dataset.hot = 'true';
        else delete el.dataset.hot;
      }
    },
    answering(pieces) {
      crew.answering.clear();
      for (const p of pieces) crew.answering.add(p);
    },
    setLight(next, animate) {
      lightTarget = next;
      if (!animate || reduced) {
        light = { colour: [...next.colour] as [number, number, number], level: next.level };
        applyLight();
      }
    },
    setRadio(on) {
      radioLamp.material.color.set(on ? '#5fd38a' : '#3b3f3a');
    },
    monitorRect(piece) {
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
        projected.set(d.screen[0] + (dx * SCREEN.width) / 2, d.screen[1] + (dy * SCREEN.height) / 2, d.screen[2] + 0.013).project(camera);
        xs.push(rect.left + (projected.x * 0.5 + 0.5) * rect.width);
        ys.push(rect.top + (-projected.y * 0.5 + 0.5) * rect.height);
      }
      const left = Math.min(...xs);
      const top = Math.min(...ys);
      return new DOMRect(left, top, Math.max(...xs) - left, Math.max(...ys) - top);
    },
    togglePause() {
      paused = !paused;
      return paused;
    },
    onPick(fn) {
      pickHandlers.push(fn);
    },
  };
  return api;
}
