// Style directions (branch design/sim-cartoon): three genuinely different treatments of the real
// room, chosen with ?style=1|2|3, for Harry to pick from. Each differs from the others in camera and
// composition, the scale of the people, the concept of the space, the light and time of day, the
// palette and materials, and how the characters are treated:
//
//   1, Dollhouse cutaway, up close: eye level, evening, faces at laptops, the cabinet huge in front.
//   2, Management sim, top-down: a game floor plan in daylight, name tags, status gems, work on paths.
//   3, Miniature on your desk: a tilt-shift diorama beside a real-size index-card box, cup and notes.
//
// The room's replay, cabinet, Reception, grid sign and radio are the real ones; characters and props
// are CC0 (Kenney Mini and Blocky Characters, Kenney Furniture Kit, KayKit Furniture Bits).

import {
  type AnimationClip,
  AnimationMixer,
  Box3,
  CanvasTexture,
  type Color,
  DoubleSide,
  type Group,
  type HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  type Scene,
  type SpotLight,
  SRGBColorSpace,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PIECE_IDS, type PieceId } from '../content/pieces';
import type { SignText } from '../room/grid';
import type { Phase, Replay } from '../timeline/replay';
import type { Cabinet } from './cabinet';
import type { Box } from './layout';
import type { Model } from './model';

export type StyleId = '1' | '2' | '3';

export function styleFromUrl(): StyleId | null {
  const s = new URLSearchParams(location.search).get('style');
  return s === '1' || s === '2' || s === '3' ? s : null;
}

/** Which baked boxes a direction draws its own way (the cabinet's carcass is always drawn live). */
export function skipBox(id: StyleId, box: Box): boolean {
  if (box.material === 'steel' || box.material === 'radio' || box.part === 'sign' || box.part === 'shelf') return true;
  if (id === '1') return box.part === 'desk' || box.part === 'chair' || box.part === 'monitor';
  if (id === '2') return box.part === 'chair';
  return false;
}

export interface View {
  readonly pos: Vector3;
  readonly look: Vector3;
  readonly fov: number;
}

export interface StyleContext {
  readonly scene: Scene;
  readonly model: Model;
  readonly renderer: WebGLRenderer;
  /** The work lamp and the cabinet's key light, with the strength the engine restores each frame. */
  readonly lamps: ReadonlyArray<{ readonly light: SpotLight; intensity: number }>;
  readonly fill: HemisphereLight;
  readonly cabinet: Cabinet;
  /** The grid sign's printed face (a canvas texture the engine redraws with each reading). */
  readonly signFace: Mesh;
  readonly replay: Replay;
  /** The replay's clock, read each frame. */
  readonly now: () => number;
  /** Multiplies the baked paper (ground) and floor, under the grid's tint. */
  readonly setBaseTint: (ground: Color, floor: Color) => void;
  /** The stone figures and their loose sheets: a direction brings its own people, and may move the work itself. */
  readonly crew: { people: boolean; sheets: boolean; held: string | null };
  /** Which still is being taken (?close=desk:<tool> or cabinet), if any. */
  readonly close: 'desk' | 'cabinet' | null;
}

export interface StyleHandle {
  readonly views: {
    door(aspect: number): View;
    desk(aspect: number): View;
    cabinet(aspect: number): View;
  };
  update(dt: number, t: number): void;
  render?(scene: Scene, camera: PerspectiveCamera): void;
  resize?(width: number, height: number): void;
  sign?(text: SignText): void;
}

export async function applyStyle(id: StyleId, ctx: StyleContext): Promise<StyleHandle> {
  document.documentElement.dataset.style = id;
  if (id === '1') return (await import('./directions/dollhouse')).dollhouse(ctx);
  if (id === '2') return (await import('./directions/management')).management(ctx);
  return (await import('./directions/miniature')).miniature(ctx);
}

// ---------- Loading ----------
const ASSETS = '/assets/3d/';
const loader = new GLTFLoader();
const loads = new Map<string, Promise<GLTF>>();
/** Loads a model once however many ask for it; the result is shared, so each use takes a copy of its scene. */
export const loadGltf = (path: string): Promise<GLTF> => {
  let load = loads.get(path);
  if (!load) {
    load = loader.loadAsync(ASSETS + path);
    // A failed load can be asked for again.
    load.catch(() => loads.delete(path));
    loads.set(path, load);
  }
  return load;
};

/** Loads named models once; each use takes a fresh copy, and a missing one fails loudly. */
export async function kit(names: readonly string[], path: (name: string) => string): Promise<(name: string) => Object3D> {
  const loaded = new Map(await Promise.all(names.map(async (n) => [n, await loadGltf(path(n))] as const)));
  return (n) => {
    const g = loaded.get(n);
    if (!g) throw new Error(`model ${n} was not loaded`);
    return g.scene.clone(true);
  };
}

// ---------- Characters ----------
/** A base clip with some bones taken from other clips: a seated body with typing arms. */
function blend(name: string, base: AnimationClip, overlays: ReadonlyArray<readonly [AnimationClip, string]>): AnimationClip {
  const boneOf = (track: { name: string }) => track.name.split('.')[0] ?? '';
  const taken = new Set(overlays.map(([, bone]) => bone));
  const clip = base.clone();
  clip.name = name;
  clip.tracks = [
    ...base.tracks.filter((t) => !taken.has(boneOf(t))).map((t) => t.clone()),
    ...overlays.flatMap(([source, bone]) => source.tracks.filter((t) => boneOf(t) === bone).map((t) => t.clone())),
  ];
  clip.resetDuration();
  return clip;
}

function clipNamed(gltf: GLTF, name: string): AnimationClip {
  const clip = gltf.animations.find((a) => a.name === name);
  if (!clip) throw new Error(`no ${name} animation`);
  return clip;
}

export type Clip = 'sit' | 'typing' | 'holding' | 'cheer' | 'no' | 'idle' | 'wheelchair' | 'wheelchairTyping';

export interface Person {
  readonly root: Group;
  readonly mixer: AnimationMixer;
  readonly clips: Record<Clip, AnimationClip>;
  current: Clip | '';
  /** A sheet in the hands, shown while carrying or reading one. */
  readonly sheet: Mesh;
}

/** A posable person from a CC0 character, scaled to a standing height in metres. */
export function person(gltf: GLTF, height: number): Person {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(root);
  root.scale.setScalar(height / Math.max(0.01, box.max.y - box.min.y));
  const sit = clipNamed(gltf, 'sit');
  const interact = clipNamed(gltf, 'interact-right');
  const holding = clipNamed(gltf, 'holding-both');
  // Typing: the right hand reaching to the keys, the left forward on them.
  const hands = [
    [interact, 'arm-right'],
    [holding, 'arm-left'],
  ] as const;
  const clips: Record<Clip, AnimationClip> = {
    sit,
    typing: blend('typing', sit, hands),
    holding,
    cheer: clipNamed(gltf, 'emote-yes'),
    no: clipNamed(gltf, 'emote-no'),
    idle: clipNamed(gltf, 'idle'),
    wheelchair: clipNamed(gltf, 'wheelchair-sit'),
    wheelchairTyping: blend('wheelchair-typing', clipNamed(gltf, 'wheelchair-sit'), hands),
  };
  const mixer = new AnimationMixer(root);
  const sheet = new Mesh(new PlaneGeometry(0.22, 0.29), new MeshLambertMaterial({ color: '#faf8f3', side: DoubleSide }));
  sheet.visible = false;
  sheet.position.set(0, 0.55 / root.scale.y, 0.3 / root.scale.y);
  sheet.scale.setScalar(1 / root.scale.y);
  sheet.rotation.x = -0.9;
  root.add(sheet);
  return { root, mixer, clips, current: '', sheet };
}

export function play(p: Person, name: Clip, offset: number): void {
  if (p.current === name) return;
  p.current = name;
  p.mixer.stopAllAction();
  const clip = p.clips[name];
  p.mixer.clipAction(clip).play();
  p.mixer.setTime(offset % Math.max(0.01, clip.duration));
}

// ---------- Placing models ----------
/** Scales and places a model so its own bounding box fills a target box standing on y = base. */
export function fitBox(
  object: Object3D,
  cx: number,
  cz: number,
  size: { x: number; y: number; z: number },
  rotate = 0,
  base = 0,
): Object3D {
  object.rotation.y = rotate;
  object.scale.setScalar(1);
  object.position.set(0, 0, 0);
  object.updateMatrixWorld(true);
  const box = new Box3().setFromObject(object);
  object.scale.set(size.x / (box.max.x - box.min.x), size.y / (box.max.y - box.min.y), size.z / (box.max.z - box.min.z));
  object.updateMatrixWorld(true);
  const fitted = new Box3().setFromObject(object);
  object.position.set(cx - (fitted.min.x + fitted.max.x) / 2, base - fitted.min.y, cz - (fitted.min.z + fitted.max.z) / 2);
  return object;
}

/** Places a prop at its own size times a factor, standing on a surface. */
export function place(object: Object3D, x: number, y: number, z: number, scale: number, rotate = 0): Object3D {
  object.scale.setScalar(scale);
  object.rotation.y = rotate;
  object.position.set(x, y, z);
  return object;
}

// ---------- Canvas labels and surfaces ----------
export function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Fits a line of text to a width by shrinking the font. */
export function fitFont(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, px: number, max: number): number {
  let size = px;
  ctx.font = font(size);
  while (size > 8 && ctx.measureText(text).width > max) ctx.font = font(--size);
  return size;
}

export const cond = (weight: number) => (px: number) => `${weight} ${px}px "IBM Plex Sans Condensed", "Arial Narrow", sans-serif`;
export const mono = (weight: number) => (px: number) => `${weight} ${px}px "IBM Plex Mono", ui-monospace, monospace`;
export const italic = (px: number) => `italic 400 ${px}px "IBM Plex Sans", "Helvetica Neue", sans-serif`;

/** The view that frames a set of points from a direction, centred, filling the frame between margins. */
export function fitView(
  direction: Vector3,
  fov: number,
  aspect: number,
  points: readonly Vector3[],
  margins: { top: number; bottom: number; side: number } = { top: 0.96, bottom: -0.96, side: 0.98 },
): View {
  const camera = new PerspectiveCamera(fov, aspect, 0.1, 2000);
  const dir = direction.clone().normalize();
  const target = points.reduce((a, p) => a.add(p), new Vector3()).multiplyScalar(1 / Math.max(1, points.length));
  const tan = Math.tan(((fov / 2) * Math.PI) / 180);
  const p = new Vector3();
  const right = new Vector3();
  const up = new Vector3();
  let distance = 40;
  for (let pass = 0; pass < 24; pass++) {
    camera.position.copy(target).addScaledVector(dir, distance);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    let x0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let y0 = Number.POSITIVE_INFINITY;
    let y1 = Number.NEGATIVE_INFINITY;
    for (const c of points) {
      p.copy(c).project(camera);
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    }
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2 - (margins.top + margins.bottom) / 2;
    target.addScaledVector(right, cx * distance * tan * aspect).addScaledVector(up, cy * distance * tan);
    distance *= Math.max((x1 - x0) / (2 * margins.side), (y1 - y0) / (margins.top - margins.bottom));
  }
  return { pos: target.clone().addScaledVector(dir, distance), look: target.clone(), fov };
}

/** A direction from the camera's elevation and azimuth, in degrees (azimuth 0 looks from the front). */
export function fromAngles(elevation: number, azimuth: number): Vector3 {
  const el = (elevation * Math.PI) / 180;
  const az = (azimuth * Math.PI) / 180;
  return new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

/** A view from a position to a target. */
export const lookFrom = (pos: [number, number, number], look: [number, number, number], fov: number): View => ({
  pos: new Vector3(...pos),
  look: new Vector3(...look),
  fov,
});

// ---------- The replay, as poses ----------

export interface Moment {
  readonly phases: ReadonlyMap<PieceId, Phase>;
  /** The work waiting longest at the table is carried there by its builder: one standing figure at most. */
  readonly held: PieceId | null;
  readonly reviewing: boolean;
}

export function moment(replay: Replay, s: number): Moment {
  const phases = new Map<PieceId, Phase>(PIECE_IDS.map((p) => [p, replay.phase(p, s)]));
  const held =
    [...phases.entries()]
      .filter(([, ph]) => ph.kind === 'at-review' && !ph.reviewing)
      .sort((a, b) => (a[1].kind === 'at-review' && b[1].kind === 'at-review' ? a[1].due - b[1].due : 0))[0]?.[0] ?? null;
  return { phases, held, reviewing: [...phases.values()].some((ph) => ph.kind === 'at-review' && ph.reviewing) };
}

/** What a seated builder is doing: typing while building, a cheer when work comes back accepted, a shake when sent back. */
export function seatedClip(phase: Phase, wheel: boolean): Clip {
  if (phase.kind === 'back') return phase.outcome === 'accepted' ? 'cheer' : 'no';
  if (phase.kind === 'building') return wheel ? 'wheelchairTyping' : 'typing';
  return wheel ? 'wheelchair' : 'sit';
}

/** The status gem's colour: blue while building, red when sent back, green once accepted. */
export function gemColour(phase: Phase): string | null {
  if (phase.kind === 'idle') return null;
  if (phase.kind === 'done' || (phase.kind === 'back' && phase.outcome === 'accepted')) return '#35c46a';
  if ((phase.kind === 'building' && phase.returned) || (phase.kind === 'back' && phase.outcome === 'returned')) return '#ff5a4f';
  return '#3d9bff';
}

/** A flat label on a plate: dark text on a light ground, or the reverse. */
export function plate(
  text: string,
  o: { width: number; height: number; bg: string; ink: string; font?: (px: number) => string; border?: string },
): CanvasTexture {
  return canvasTexture(o.width, o.height, (ctx) => {
    ctx.fillStyle = o.bg;
    ctx.fillRect(0, 0, o.width, o.height);
    if (o.border) {
      ctx.strokeStyle = o.border;
      ctx.lineWidth = Math.max(4, o.height * 0.06);
      ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, o.width - ctx.lineWidth, o.height - ctx.lineWidth);
    }
    ctx.fillStyle = o.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFont(ctx, text, o.font ?? cond(600), Math.round(o.height * 0.62), o.width * 0.88);
    ctx.fillText(text, o.width / 2, o.height * 0.54);
  });
}
