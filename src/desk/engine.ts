// Harry's desk at real scale, with his team as a living miniature office on it (branch
// design/desk-miniature). The engine draws and places: the desk and its objects, the model in the
// management-sim style, the sun, the camera's stations and the glides between them (the dive into the
// office is the main one), the tilt-shift focus pull, the DOM tags laid over the scene, and picking.
// What a choice does is the controller's business (desk/main.ts).
//
// Stations: the desk itself ('door', as you arrive); 'office', inside the model at the team's scale;
// 'cabinet', the index-card box; 'notebook'; 'reception', the keyboard; and `desk:<tool>`.

import {
  BasicShadowMap,
  Box3,
  CanvasTexture,
  Color,
  DirectionalLight,
  HemisphereLight,
  type Mesh,
  NoToneMapping,
  type Object3D,
  PerspectiveCamera,
  Raycaster,
  Scene,
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
import { NEUTRAL_LIGHT, type RoomLight, type SignText, signFor } from '../room/grid';
import { Crew } from '../scene/crew';
import { BASE, DESKS, deskFor, RECEPTION, ROOM, SCREEN, WALL } from '../scene/layout';
import { atlasRect, buildModel } from '../scene/model';
import { fitView, fromAngles, type View } from '../scene/style';
import type { Timeline } from '../timeline/schema';
import { coffee, DESK_Y, deskTop, IndexBox, Keyboard, Notebook, pencil, type Round, stampAndPad, sticky, stickyTexture } from './objects';
import { buildOffice } from './office';
import { CREAM } from './palette';
import { DeskPass } from './pass';

export type Station = 'door' | 'office' | 'cabinet' | 'notebook' | 'reception' | `desk:${PieceId}`;

export interface DeskEngine {
  station(): Station;
  go(station: Station): Promise<void>;
  openDrawer(id: string | null): void;
  drawerOpen(): string | null;
  liftFolder(piece: PieceId | null): void;
  /** A builder stands (and waves); null sits them down. */
  stand(piece: PieceId | null, wave: boolean): void;
  hover(target: string | null): void;
  answering(pieces: readonly PieceId[]): void;
  setLight(light: RoomLight, animate: boolean): void;
  setRadio(on: boolean): void;
  setSign(text: SignText): void;
  /** Turns the notebook to a round, and replays that round in the office. */
  turnTo(round: Round): void;
  /** Presses the 3D key a typed character falls on. */
  press(key: string): void;
  /** The printer on the model's Reception counter, on screen, in page pixels. */
  printerPoint(): { x: number; y: number } | null;
  togglePause(): boolean;
  onPick(fn: (action: string) => void): void;
  readonly debug: Record<string, () => unknown>;
}

interface MountOptions {
  readonly stage: HTMLElement;
  /** Everything laid over the scene: elements under it with a `data-desk-target`. */
  readonly labels: HTMLElement;
  readonly timeline: Timeline;
  readonly startAt?: number;
  readonly paused?: boolean;
  readonly reduced?: boolean;
}

/** The desk's layout: where each real-size thing stands, around the model at the origin. */
const PLACES = {
  box: { x: -14.2, z: 0.6, turn: 0.32 },
  stamp: { x: -10.8, z: 10.6, turn: 0.12 },
  sticky: { x: -3.6, z: 10.3, turn: 0.1 },
  notebook: { x: 15.4, z: -2.4, turn: -0.18 },
  keyboard: { x: 7.6, z: 13.4, turn: -0.1 },
  cup: { x: 9.5, z: -11.2 },
  pencil: { x: 13.6, z: 6.6, turn: -0.5 },
} as const;

/** How sharp each station is: tilt-shift strength, and where its band of focus sits. */
const FOCUS: Record<string, { strength: number; focus: number; band: number }> = {
  door: { strength: 1, focus: 0.5, band: 0.13 },
  cabinet: { strength: 0.55, focus: 0.55, band: 0.22 },
  notebook: { strength: 0.4, focus: 0.5, band: 0.26 },
  reception: { strength: 0.5, focus: 0.5, band: 0.22 },
  office: { strength: 0, focus: 0.5, band: 0.5 },
  desk: { strength: 0, focus: 0.5, band: 0.5 },
};

const smooth = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

async function loadTexture(url: string): Promise<Texture | null> {
  try {
    return await new TextureLoader().loadAsync(url);
  } catch {
    return null;
  }
}

function colourAtlas(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  if (ctx)
    for (const piece of PIECES) {
      const r = atlasRect(piece.id);
      ctx.fillStyle = piece.screen;
      ctx.fillRect(r.u0 * 1280, (1 - r.v1) * 400, 256, 200);
    }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A view that frames points and then slides them sideways, to leave room for a panel. */
function framed(
  direction: Vector3,
  fov: number,
  aspect: number,
  points: readonly Vector3[],
  centreX: number,
  margins?: Parameters<typeof fitView>[4],
): View {
  const v = fitView(direction, fov, aspect, points, margins);
  if (centreX === 0) return v;
  const camera = new PerspectiveCamera(fov, aspect, 0.1, 2000);
  camera.position.copy(v.pos);
  camera.lookAt(v.look);
  camera.updateMatrixWorld();
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const distance = v.pos.distanceTo(v.look);
  const shift = -centreX * distance * Math.tan(((fov / 2) * Math.PI) / 180) * aspect;
  return { pos: v.pos.clone().addScaledVector(right, shift), look: v.look.clone().addScaledVector(right, shift), fov };
}

export async function mountDesk({
  stage,
  labels,
  timeline,
  startAt = 0,
  paused: startPaused = false,
  reduced = false,
}: MountOptions): Promise<DeskEngine> {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  } catch {
    throw new Error('WebGL is unavailable');
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.shadowMap.enabled = true;
  // Hard-edged daylight shadows, sampled nearest: crisp, and the same in every browser.
  renderer.shadowMap.type = BasicShadowMap;
  renderer.setClearColor(CREAM);
  stage.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  await Promise.all(
    [
      '700 22px "IBM Plex Sans Condensed"',
      '600 22px "IBM Plex Sans Condensed"',
      '500 22px "IBM Plex Mono"',
      '700 22px "Caveat"',
      '500 22px "Caveat"',
    ].map((f) => document.fonts.load(f).catch(() => undefined)),
  );
  const [floor, ground, poster] = await Promise.all([
    loadTexture('/bake/floor.webp'),
    loadTexture('/bake/ground.webp'),
    loadTexture('/loops/atlas.webp'),
  ]);
  if (!floor || !ground) throw new Error('the baked lighting did not load');

  const scene = new Scene();
  scene.background = new Color(CREAM);
  // The model, its box desks and chairs, cabinet carcass, sign, shelf and radio drawn the office's own way.
  const model = buildModel(
    floor,
    ground,
    poster ?? colourAtlas(),
    (b) => ['steel', 'radio'].includes(b.material) || ['desk', 'chair', 'sign', 'shelf'].includes(b.part ?? ''),
  );
  scene.add(model.group);
  // The paper under the model gives way to the desk.
  for (const o of model.group.children) if ((o as Mesh).material === model.baked[0]) o.visible = false;
  scene.add(deskTop());

  // ---------- Daylight: a sun with crisp shadows, and a soft fill ----------
  const sun = new DirectionalLight('#fff6e6', 2.5);
  sun.position.set(-22, 42, 26);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 26, bottom: -26, near: 10, far: 110 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  const fill = new HemisphereLight('#ffffff', '#c9a77c', 1.35);
  scene.add(sun, sun.target, fill);
  const sunColour = new Color('#fff6e6');
  const fillColour = new Color('#ffffff');
  let light = { ...NEUTRAL_LIGHT, colour: [...NEUTRAL_LIGHT.colour] as [number, number, number] };
  let lightTarget: RoomLight = NEUTRAL_LIGHT;
  const applyLight = () => {
    const [r, g, b] = light.colour;
    const [nr, ng, nb] = NEUTRAL_LIGHT.colour;
    const tint = new Color(r / nr, g / ng, b / nb).multiplyScalar(light.level / NEUTRAL_LIGHT.level);
    sun.color.copy(sunColour).multiply(tint);
    fill.color.copy(fillColour).multiply(tint);
    for (const m of model.baked) m.color.copy(tint);
  };

  // ---------- The replay and the office ----------
  const crew = new Crew({ scene, model, timeline, startAt });
  crew.people = false;
  crew.sheets = false;
  if (reduced) crew.s = Math.max(0, crew.replay.duration - 0.01);
  const office = await buildOffice(scene, model, crew.replay, () => crew.s);

  // ---------- The desk's objects ----------
  const box = new IndexBox();
  box.group.position.set(PLACES.box.x, DESK_Y, PLACES.box.z);
  box.group.rotation.y = PLACES.box.turn;
  const notebook = new Notebook();
  notebook.group.position.set(PLACES.notebook.x, 0, PLACES.notebook.z);
  notebook.group.rotation.y = PLACES.notebook.turn;
  const keyboard = new Keyboard();
  keyboard.group.position.set(PLACES.keyboard.x, 0, PLACES.keyboard.z);
  keyboard.group.rotation.y = PLACES.keyboard.turn;
  const stamp = stampAndPad();
  stamp.position.set(PLACES.stamp.x, 0, PLACES.stamp.z);
  stamp.rotation.y = PLACES.stamp.turn;
  const cup = coffee();
  cup.position.set(PLACES.cup.x, DESK_Y, PLACES.cup.z);
  const pen = pencil();
  pen.position.set(PLACES.pencil.x, DESK_Y + 0.2, PLACES.pencil.z);
  pen.rotation.y = PLACES.pencil.turn;
  let note = sticky(signFor(null));
  note.position.set(PLACES.sticky.x, DESK_Y + 0.02, PLACES.sticky.z);
  note.rotation.z = PLACES.sticky.turn;
  scene.add(box.group, notebook.group, keyboard.group, stamp, cup, pen, note);

  // Labels: real buttons and links laid over what they name.
  const labelEls = [...labels.querySelectorAll<HTMLElement>('[data-desk-target]')];
  const nameTags = labelEls.filter((el) => el.dataset.place === 'nametag');

  // ---------- Views ----------
  const camera = new PerspectiveCamera(24, 1, 0.1, 400);
  const v3 = (x: number, y: number, z: number) => new Vector3(x, y, z);
  const modelCorners = [
    v3(BASE.x0, 0, BASE.z0),
    v3(BASE.x1, 0, BASE.z0),
    v3(BASE.x0, 0, BASE.z1),
    v3(BASE.x1, 0, BASE.z1),
    v3(ROOM.x0, WALL.back, ROOM.z0),
    v3(ROOM.x1, WALL.back, ROOM.z0),
  ];
  const worldOf = (o: Object3D, points: Array<[number, number, number]>) => {
    o.updateMatrixWorld(true);
    return points.map((p) => o.localToWorld(new Vector3(...p)));
  };
  const deskScene = () => [
    ...modelCorners,
    ...box.corners(),
    ...notebook.corners(),
    ...keyboard.corners(),
    v3(PLACES.cup.x + 3, 4.5, PLACES.cup.z - 3),
    ...worldOf(stamp, [
      [-7, 0, -2],
      [3, 0, 2.5],
    ]),
  ];
  const viewOf = (s: Station, aspect: number): View => {
    if (s === 'door') return framed(fromAngles(52, -12), 26, aspect, deskScene(), 0, { top: 0.92, bottom: -0.9, side: 0.96 });
    if (s === 'office') return framed(fromAngles(64, -18), 15, aspect, modelCorners, 0, { top: 0.9, bottom: -0.86, side: 0.97 });
    if (s === 'cabinet') return framed(fromAngles(40, 18), 26, aspect, box.corners(), 0, { top: 0.88, bottom: -0.9, side: 0.86 });
    if (s === 'notebook') return framed(fromAngles(66, -12), 26, aspect, notebook.corners(), 0.3, { top: 0.9, bottom: -0.9, side: 0.62 });
    if (s === 'reception') {
      const printerAt = office.printer.getWorldPosition(new Vector3());
      return framed(
        fromAngles(46, 12),
        26,
        aspect,
        [...keyboard.corners(), printerAt, v3(RECEPTION.x - 1.2, 0, RECEPTION.z - 0.5), v3(RECEPTION.x + 1.2, 1.4, RECEPTION.z + 0.5)],
        0.36,
        {
          top: 0.92,
          bottom: -0.92,
          side: 0.6,
        },
      );
    }
    const d = deskFor(s.slice(5) as PieceId);
    const points = [
      v3(d.x - 1.1, 0, d.z - 0.6),
      v3(d.x + 1.1, 0, d.z - 0.6),
      v3(d.x - 1.1, 0, d.seat[1] + 0.9),
      v3(d.x + 1.1, 2.6, d.seat[1] + 0.9),
    ];
    return framed(fromAngles(58, -18), 15, aspect, points, -0.42, { top: 0.85, bottom: -0.85, side: 0.5 });
  };

  let station: Station = 'door';
  const aspectNow = () => Math.max(1, stage.clientWidth) / Math.max(1, stage.clientHeight);
  let target = viewOf('door', aspectNow());
  const current = { pos: target.pos.clone(), look: target.look.clone(), fov: target.fov };
  let glide: {
    from: View;
    to: View;
    fromFocus: (typeof FOCUS)[string];
    toFocus: (typeof FOCUS)[string];
    start: number;
    ms: number;
    done: () => void;
  } | null = null;
  const focusOf = (s: Station) => FOCUS[s.startsWith('desk:') ? 'desk' : s] ?? FOCUS.door;
  let focusNow = { ...(focusOf('door') ?? { strength: 1, focus: 0.5, band: 0.13 }) };
  let labelsDirty = true;

  const pass = new DeskPass(renderer);
  function resize(): void {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    const buffer = renderer.getDrawingBufferSize(new Vector2());
    pass.setSize(buffer.x, buffer.y);
    target = viewOf(station, w / h);
    if (!glide) {
      current.pos.copy(target.pos);
      current.look.copy(target.look);
      current.fov = target.fov;
    }
    labelsDirty = true;
  }
  new ResizeObserver(resize).observe(stage);

  // ---------- Labels ----------
  const projected = new Vector3();
  const standing = (): string => (station.startsWith('desk:') ? 'desk' : station);
  const anchorOf = (key: string): Vector3 | null => {
    if (key === 'office') return v3(0, 0, BASE.z1 + 0.2);
    if (key === 'cabinet') return box.world(v3(0, 0, 4.9));
    if (key === 'notebook') return notebook.group.localToWorld(v3(0, DESK_Y, 5.9));
    if (key === 'reception') return keyboard.group.localToWorld(v3(0, DESK_Y, 4.4));
    if (key === 'stamp') return stamp.localToWorld(v3(-2, DESK_Y, 2.4));
    if (key === 'credit') return v3(PLACES.sticky.x, DESK_Y, PLACES.sticky.z + 2.5);
    if (key === 'office-reception') return v3(RECEPTION.x, RECEPTION.height, RECEPTION.z + RECEPTION.depth / 2 + 0.05);
    if (key === 'office-cabinet') return v3(-2.5, 0, ROOM.z1 - 0.1);
    return box.anchor(key);
  };
  const quad = (o: Object3D, x0: number, z0: number, x1: number, z1: number, y: number) =>
    worldOf(o, [
      [x0, y, z0],
      [x1, y, z0],
      [x1, y, z1],
      [x0, y, z1],
    ]);
  const coverOf = (key: string): Vector3[] => {
    if (key.startsWith('drawer:')) return box.frontCorners(key.slice(7));
    if (key.startsWith('folder:') && isPieceId(key.slice(7))) return box.cardCorners(key.slice(7) as PieceId);
    if (key === 'sign') return quad(note, -2.2, -2.2, 2.2, 2.2, 0);
    if (key === 'radio')
      return quad(scene, RECEPTION.x - 0.85, RECEPTION.z - 0.12, RECEPTION.x - 0.35, RECEPTION.z + 0.12, RECEPTION.height + 0.2);
    return [];
  };
  function shownAt(el: HTMLElement): boolean {
    if ((el.dataset.at ?? 'door') !== standing()) return false;
    const key = el.dataset.deskTarget ?? '';
    if (key.startsWith('folder:')) {
      const piece = key.slice(7);
      return isPieceId(piece) && box.isOpen(drawerOf(piece).id);
    }
    return true;
  }
  /** Every monitor's box on screen, so a name tag can keep clear of all of them. */
  function monitorBoxes(w: number, h: number) {
    return DESKS.map((d) => {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const)
        for (const dz of [-0.06, 0.06]) {
          projected
            .set(d.screen[0] + (dx * (SCREEN.width + 0.06)) / 2, d.screen[1] + (dy * (SCREEN.height + 0.06)) / 2, d.screen[2] + dz)
            .project(camera);
          xs.push((projected.x * 0.5 + 0.5) * w);
          ys.push((-projected.y * 0.5 + 0.5) * h);
        }
      return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    });
  }
  /** Where a builder's name tag may go, in order: on the floor before the chair, then beside the desk. */
  function tagSpots(piece: PieceId) {
    const d = deskFor(piece);
    return [v3(d.x, 0, d.seat[1] + 0.62), v3(d.x - 1.05, 0, d.z + 0.3), v3(d.x + 1.05, 0, d.z + 0.3), v3(d.x, 0, d.seat[1] + 1.0)];
  }
  type Rect = { x0: number; y0: number; x1: number; y1: number };
  const overlap = (a: Rect, b: Rect, pad = 2) => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;
  let placedTags: Rect[] = [];
  function placeLabels(): void {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const monitors = standing() === 'office' ? monitorBoxes(w, h) : [];
    placedTags = [];
    for (const el of labelEls) {
      const key = el.dataset.deskTarget ?? '';
      const place = el.dataset.place ?? 'tag';
      const show = shownAt(el) && !glide;
      if (place === 'cover') {
        const corners = show ? coverOf(key).map((c) => c.clone().project(camera)) : [];
        const onScreen = corners.length > 0 && corners.every((c) => c.z < 1);
        if (el.hidden === onScreen) el.hidden = !onScreen;
        if (!onScreen) continue;
        const xs = corners.map((c) => (c.x * 0.5 + 0.5) * w);
        const ys = corners.map((c) => (-c.y * 0.5 + 0.5) * h);
        const left = Math.min(...xs);
        const top = Math.min(...ys);
        el.style.width = `${(Math.max(...xs) - left).toFixed(1)}px`;
        el.style.height = `${(Math.max(...ys) - top).toFixed(1)}px`;
        el.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
        continue;
      }
      if (place === 'nametag') {
        const piece = key.slice(5);
        if (!show || !isPieceId(piece)) {
          if (!el.hidden) el.hidden = true;
          continue;
        }
        if (el.hidden) el.hidden = false;
        const tw = el.offsetWidth || 90;
        const th = el.offsetHeight || 22;
        let chosen: Rect | null = null;
        for (const spot of tagSpots(piece)) {
          projected.copy(spot).project(camera);
          const x = (projected.x * 0.5 + 0.5) * w - tw / 2;
          const y = (-projected.y * 0.5 + 0.5) * h - th / 2;
          const r = { x0: x, y0: y, x1: x + tw, y1: y + th };
          chosen ??= r;
          if (!monitors.some((m) => overlap(r, m)) && !placedTags.some((t) => overlap(r, t))) {
            chosen = r;
            break;
          }
        }
        if (!chosen) continue;
        placedTags.push(chosen);
        el.style.transform = `translate(${chosen.x0.toFixed(1)}px, ${chosen.y0.toFixed(1)}px)`;
        continue;
      }
      const a = show ? anchorOf(key) : null;
      if (a) projected.copy(a).project(camera);
      const onScreen = a !== null && projected.z < 1 && Math.abs(projected.x) < 1.02 && Math.abs(projected.y) < 1.02;
      if (el.hidden === onScreen) el.hidden = !onScreen;
      if (!onScreen) continue;
      const x = (projected.x * 0.5 + 0.5) * w;
      const y = (-projected.y * 0.5 + 0.5) * h;
      const shift =
        place === 'centre' ? 'translate(-50%, -50%)' : place === 'over' ? 'translate(-50%, calc(-100% - 4px))' : 'translate(-50%, 4px)';
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) ${shift}`;
    }
    labelsDirty = false;
  }

  function applyCamera(): void {
    const reach = current.pos.distanceTo(current.look);
    const near = Math.max(0.1, reach * 0.4 - 12);
    const far = reach + 120;
    if (camera.fov !== current.fov || camera.near !== near || camera.far !== far) {
      camera.fov = current.fov;
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
    camera.aspect = aspectNow();
    camera.updateProjectionMatrix();
    camera.position.copy(current.pos);
    camera.lookAt(current.look);
    camera.updateMatrixWorld();
  }

  // ---------- The loop ----------
  let paused = startPaused;
  let running = false;
  let last = performance.now();
  function frame(now: number): void {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused && !reduced) crew.s = (crew.s + dt) % crew.replay.duration;
    crew.update(dt, now / 1000);
    office.update(dt, now / 1000);
    // Each name tag's dot shows its builder's state, as the gem does.
    for (const el of nameTags) {
      const piece = el.dataset.piece;
      if (!piece || !isPieceId(piece)) continue;
      const phase = crew.replay.phase(piece, crew.s);
      const status =
        phase.kind === 'idle'
          ? 'idle'
          : phase.kind === 'done' || (phase.kind === 'back' && phase.outcome === 'accepted')
            ? 'accepted'
            : (phase.kind === 'building' && phase.returned) || (phase.kind === 'back' && phase.outcome === 'returned')
              ? 'returned'
              : 'building';
      if (el.dataset.status !== status) el.dataset.status = status;
    }
    keyboard.update(dt);
    if (notebook.update(reduced ? 1 : dt)) labelsDirty = true;
    if (box.update(dt, reduced)) labelsDirty = true;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 1.8);
    for (let i = 0; i < 3; i++) light.colour[i] = (light.colour[i] ?? 1) + ((lightTarget.colour[i] ?? 1) - (light.colour[i] ?? 1)) * k;
    light.level += (lightTarget.level - light.level) * k;
    applyLight();
    if (glide) {
      const t = Math.min(1, (now - glide.start) / glide.ms);
      const e = easeInOut(t);
      current.pos.lerpVectors(glide.from.pos, glide.to.pos, e);
      current.look.lerpVectors(glide.from.look, glide.to.look, smooth(Math.min(1, t * 1.3)));
      current.fov = glide.from.fov + (glide.to.fov - glide.from.fov) * e;
      // The focus pulls as the camera travels: sharp on arriving in the office, soft again rising out.
      focusNow = {
        strength: glide.fromFocus.strength + (glide.toFocus.strength - glide.fromFocus.strength) * e,
        focus: glide.fromFocus.focus + (glide.toFocus.focus - glide.fromFocus.focus) * e,
        band: glide.fromFocus.band + (glide.toFocus.band - glide.fromFocus.band) * e,
      };
      labelsDirty = true;
      if (t >= 1) {
        const done = glide.done;
        glide = null;
        done();
      }
    }
    pass.strength = focusNow.strength;
    pass.setFocus(focusNow.focus, focusNow.band);
    applyCamera();
    pass.render(scene, camera);
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
  new IntersectionObserver((entries) => setRunning(entries.some((e) => e.isIntersecting))).observe(stage);
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

  // ---------- Picking ----------
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const hit = new Vector3();
  const modelBox = new Box3(v3(BASE.x0, -0.2, BASE.z0), v3(BASE.x1, WALL.back, BASE.z1));
  const deskBoxes = DESKS.map((d) => ({
    action: `desk:${d.piece}`,
    box: new Box3(v3(d.x - 0.85, 0, d.z - 0.45), v3(d.x + 0.85, 2.6, d.seat[1] + 0.35)),
  }));
  const officeBoxes = [
    ...deskBoxes,
    { action: 'reception', box: new Box3(v3(RECEPTION.x - 1.05, 0, RECEPTION.z - 0.4), v3(RECEPTION.x + 1.05, 1.3, RECEPTION.z + 0.4)) },
    { action: 'cabinet', box: new Box3(v3(-3.3, 0, 2.8), v3(-1.7, 2.0, 3.6)) },
  ];
  const deskObjects: Array<[Object3D, string]> = [
    [box.group, 'cabinet'],
    [notebook.group, 'notebook'],
    [keyboard.group, 'reception'],
    [stamp, 'stamp'],
  ];
  function pick(event: PointerEvent): string | null {
    if (glide) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    if (station === 'cabinet') {
      const hits = raycaster.intersectObjects(box.pickables, false);
      const t = hits[0]?.object.userData.target as string | undefined;
      if (!t) return null;
      if (t.startsWith('folder:'))
        return box.isOpen(drawerOf(t.slice(7) as PieceId).id) ? t : `drawer:${drawerOf(t.slice(7) as PieceId).id}`;
      return t === 'cabinet' ? null : t;
    }
    if (station === 'office') {
      let best: string | null = null;
      let distance = Number.POSITIVE_INFINITY;
      for (const { action, box: b } of officeBoxes)
        if (raycaster.ray.intersectBox(b, hit)) {
          const d = hit.distanceTo(raycaster.ray.origin);
          if (d < distance) {
            distance = d;
            best = action;
          }
        }
      return best;
    }
    if (station !== 'door') return null;
    const hits = raycaster.intersectObjects(
      deskObjects.map(([o]) => o),
      true,
    );
    const first = hits[0];
    const modelHit = raycaster.ray.intersectBox(modelBox, hit) ? hit.distanceTo(raycaster.ray.origin) : Number.POSITIVE_INFINITY;
    if (first && first.distance < modelHit) {
      for (const [o, action] of deskObjects) {
        let n: Object3D | null = first.object;
        while (n) {
          if (n === o) return action;
          n = n.parent;
        }
      }
    }
    if (Number.isFinite(modelHit)) return 'office';
    if (raycaster.intersectObject(note, false).length) return 'sign';
    return null;
  }
  const pickHandlers: Array<(action: string) => void> = [];
  const canvas = renderer.domElement;
  canvas.addEventListener('pointermove', (event) => {
    const action = pick(event);
    api.hover(action);
    canvas.style.cursor = action ? 'pointer' : '';
  });
  canvas.addEventListener('pointerleave', () => api.hover(null));
  canvas.addEventListener('click', (event) => {
    const action = pick(event);
    if (action) for (const fn of pickHandlers) fn(action);
  });

  const api: DeskEngine = {
    station: () => station,
    go(next) {
      const from = station;
      station = next;
      labelsDirty = true;
      const to = viewOf(next, aspectNow());
      target = to;
      if (reduced) {
        // Cuts, not camera moves.
        current.pos.copy(to.pos);
        current.look.copy(to.look);
        current.fov = to.fov;
        focusNow = { ...(focusOf(next) ?? focusNow) };
        applyCamera();
        placeLabels();
        return Promise.resolve();
      }
      const dive = (from === 'door' && next !== 'door') || next === 'door';
      return new Promise((resolve) => {
        glide = {
          from: { pos: current.pos.clone(), look: current.look.clone(), fov: current.fov },
          to,
          fromFocus: { ...focusNow },
          toFocus: focusOf(next) ?? focusNow,
          start: performance.now(),
          ms: dive ? 1700 : 1300,
          done: resolve,
        };
        setRunning(true);
      });
    },
    openDrawer(id) {
      box.open(id);
      labelsDirty = true;
    },
    drawerOpen: () => box.drawers.find((d) => d.outTarget > 0)?.id ?? null,
    liftFolder(piece) {
      box.lift(piece);
    },
    stand(piece, wave) {
      office.stand(piece, wave && !reduced);
    },
    hover(action) {
      crew.hovered = action?.startsWith('desk:') ? (action.slice(5) as PieceId) : null;
      for (const el of labelEls) {
        if (el.dataset.action === action) el.dataset.hot = 'true';
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
      document.documentElement.dataset.radio = on ? 'on' : 'off';
    },
    setSign(text) {
      const next = sticky(text);
      next.position.copy(note.position);
      next.rotation.copy(note.rotation);
      scene.remove(note);
      scene.add(next);
      note = next;
      void stickyTexture;
    },
    turnTo(round) {
      notebook.turnTo(round, reduced);
      const beat = crew.replay.beats.find((b) => b.kind === 'briefed' && b.brief === round);
      if (beat) crew.s = Math.max(0, beat.scene - 0.5);
      document.documentElement.dataset.round = round;
    },
    press(key) {
      keyboard.press(key);
    },
    printerPoint() {
      const at = office.printer.getWorldPosition(new Vector3()).project(camera);
      if (at.z >= 1) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      return { x: rect.left + (at.x * 0.5 + 0.5) * rect.width, y: rect.top + (-at.y * 0.5 + 0.5) * rect.height };
    },
    togglePause() {
      paused = !paused;
      return paused;
    },
    onPick(fn) {
      pickHandlers.push(fn);
    },
    debug: {
      station: () => station,
      replayTime: () => crew.s,
      strength: () => pass.strength,
      keysDown: () => keyboard.down,
      monitorRects: () => {
        const w = stage.clientWidth;
        const h = stage.clientHeight;
        const r = stage.getBoundingClientRect();
        return monitorBoxes(w, h).map((m) => ({ x: r.left + m.x0, y: r.top + m.y0, width: m.x1 - m.x0, height: m.y1 - m.y0 }));
      },
      pieces: () => [...PIECE_IDS],
      standing: () => office.standing(),
      round: () => notebook.round,
      // When each round was first briefed, in replay seconds.
      briefAt: () => {
        const first: Record<string, number> = {};
        for (const b of crew.replay.beats) if (b.kind === 'briefed' && b.brief && !(b.brief in first)) first[b.brief] = b.scene;
        return first;
      },
    },
  };
  return api;
}
