// Style frames (branch design/sim-cartoon): three treatments of the real room, chosen with
// ?style=A|B|C, for Harry to pick from. The room, its replay, the cabinet, Reception, the grid sign
// and the radio are the real ones; a style swaps the people for CC0 animated characters (Kenney Mini
// Characters) posed at work, dresses the desks with CC0 props (Kenney Furniture Kit, KayKit
// Furniture Bits), and changes palette, light, shading and line.
//
//   A, Sims warm: warm light, cutaway walls, a status gem over each builder, varied characters and
//      desk props.
//   B, Two Point comic: bold colour, toon ramps, thick ink outlines, chunkier characters, bigger
//      gestures.
//   C, Clean isometric: pastel, flat light, crisp thin edges, a near-orthographic camera.

import {
  type AnimationClip,
  AnimationMixer,
  Box3,
  Color,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  Group,
  type HemisphereLight,
  type InstancedMesh,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type MeshStandardMaterial,
  MeshToonMaterial,
  NearestFilter,
  type Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  RedFormat,
  type Scene,
  type SpotLight,
  TorusGeometry,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PIECE_IDS, type PieceId } from '../content/pieces';
import type { Phase, Replay } from '../timeline/replay';
import { EdgePass } from './edges';
import { BOARD, BRIEF, DESK, DESKS, deskFor, RADIO, RECEPTION, REVIEW, ROOM, SHELF } from './layout';
import { PALETTE } from './light';
import type { Model } from './model';

export type StyleId = 'A' | 'B' | 'C';

export function styleFromUrl(): StyleId | null {
  const s = new URLSearchParams(location.search).get('style');
  return s === 'A' || s === 'B' || s === 'C' ? s : null;
}

/** The same view from the door for every frame; C looks through a long lens, nearly orthographic. */
export function doorFor(id: StyleId): { fov: number; elevation: number; azimuth: number; target: Vector3 } {
  const target = new Vector3(-0.3, 0.55, 0.2);
  // From the front left, as from the door: the cabinet nearest, the room running back to the right.
  const az = -30;
  const el = 42;
  return id === 'C' ? { fov: 9, elevation: el, azimuth: az, target } : { fov: 30, elevation: el, azimuth: az, target };
}

/** A style swaps the box desks and chairs for models of them (C keeps the crisp boxes). */
export function swapsFurniture(id: StyleId): boolean {
  return id !== 'C';
}

export interface StyleContext {
  readonly scene: Scene;
  readonly model: Model;
  readonly renderer: WebGLRenderer;
  readonly lamps: readonly SpotLight[];
  readonly fill: HemisphereLight;
  readonly replay: Replay;
  /** The replay's clock, read each frame. */
  readonly now: () => number;
  /** Multiplies the baked floor and paper, under the grid's tint. */
  readonly setBaseTint: (c: Color) => void;
  /** Hides the stone figures' sheet for a piece whose builder is holding it. */
  readonly holdSheet: (piece: PieceId | null) => void;
}

export interface StyleHandle {
  update(dt: number, t: number): void;
  render?(scene: Scene, camera: import('three').PerspectiveCamera): void;
  resize?(width: number, height: number): void;
}

const ASSETS = '/assets/3d/';
const loader = new GLTFLoader();
const load = (path: string): Promise<GLTF> => loader.loadAsync(ASSETS + path);

/** Characters at 1:50: chibi Mini Characters, about 1.45 m tall standing. */
const CHAR_SCALE = 1.85;
const CAST = [
  'character-female-a',
  'character-male-b',
  'character-female-c',
  'character-male-d',
  'character-female-e',
  'character-male-a',
  'character-female-b',
  'character-male-c',
  'character-female-d',
  'character-male-e',
] as const;
const REVIEWER = 'character-female-f';
/** One builder works from a wheelchair. */
const WHEELCHAIR_DESK = 6;

interface Palette {
  readonly lamp: string;
  readonly fill: [string, string, number];
  readonly baseTint: string;
  readonly boxes: Partial<Record<string, string>>;
  readonly background: string;
}
const PALETTES: Record<StyleId, Palette> = {
  A: {
    lamp: '#ffd8a6',
    fill: ['#fff1de', '#c79a6a', 1.15],
    baseTint: '#ffe1bd',
    boxes: { card: '#f3e3cc', wood: '#c98e55', grey: '#8a7f73', cork: '#c08a55', steel: '#a9b3a0', dark: '#2c2722' },
    background: '#efe2d0',
  },
  B: {
    lamp: '#fff6e8',
    fill: ['#ffffff', '#5a8fd1', 1.35],
    baseTint: '#ffd9a0',
    boxes: { card: '#6cc4b8', wood: '#f2a03d', grey: '#36475e', cork: '#e07b39', steel: '#ffc845', dark: '#1d2536' },
    background: '#f6d9a8',
  },
  C: {
    lamp: '#ffffff',
    fill: ['#ffffff', '#e8e2f0', 2.1],
    baseTint: '#ffffff',
    boxes: { card: '#f2ece6', wood: '#e9d2c3', grey: '#c9d4e3', cork: '#e5c3b3', steel: '#cfe1dc', dark: '#5d6475' },
    background: '#f1ece7',
  },
};

/** A three-step light ramp, so lit faces fall into bands as in a comic. */
function toonRamp(): DataTexture {
  const data = new Uint8Array([90, 170, 255]);
  const t = new DataTexture(data, 3, 1, RedFormat);
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.needsUpdate = true;
  return t;
}

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

interface Person {
  readonly root: Group;
  readonly mixer: AnimationMixer;
  readonly clips: Record<string, AnimationClip>;
  current: string;
  readonly sheet: Mesh;
}

function person(gltf: GLTF, scale: number, sheetColour: string): Person {
  const root = gltf.scene;
  root.scale.setScalar(scale);
  root.traverse((o) => {
    if ((o as Mesh).isMesh) o.castShadow = false;
  });
  const sit = clipNamed(gltf, 'sit');
  const interact = clipNamed(gltf, 'interact-right');
  const holding = clipNamed(gltf, 'holding-both');
  // Typing: the right hand reaching to the keys, the left forward on them.
  const hands = [
    [interact, 'arm-right'],
    [holding, 'arm-left'],
  ] as const;
  const clips: Record<string, AnimationClip> = {
    sit,
    typing: blend('typing', sit, hands),
    holding,
    yes: clipNamed(gltf, 'emote-yes'),
    no: clipNamed(gltf, 'emote-no'),
    idle: clipNamed(gltf, 'idle'),
    wheelchair: clipNamed(gltf, 'wheelchair-sit'),
    wheelchairTyping: blend('wheelchair-typing', clipNamed(gltf, 'wheelchair-sit'), hands),
  };
  const mixer = new AnimationMixer(root);
  // A sheet in the hands, shown while carrying or reading one.
  const sheet = new Mesh(new PlaneGeometry(0.16, 0.21), new MeshLambertMaterial({ color: sheetColour, side: DoubleSide }));
  sheet.visible = false;
  sheet.position.set(0, 0.24, 0.16);
  sheet.rotation.x = -0.9;
  root.add(sheet);
  return { root, mixer, clips, current: '', sheet };
}

function play(p: Person, name: string, offset: number): void {
  if (p.current === name) return;
  p.current = name;
  p.mixer.stopAllAction();
  const clip = p.clips[name];
  if (!clip) return;
  const action = p.mixer.clipAction(clip);
  action.play();
  p.mixer.setTime(offset % Math.max(0.01, clip.duration));
}

/** Places a model so its own bounding box sits on a target box: centred, on the floor, scaled to fit. */
function fitBox(object: Object3D, cx: number, cz: number, size: { x: number; y: number; z: number }, rotate = 0): void {
  object.rotation.y = rotate;
  object.updateMatrixWorld(true);
  const box = new Box3();
  object.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.computeBoundingBox();
    const b = mesh.geometry.boundingBox;
    if (!b) return;
    for (const x of [b.min.x, b.max.x])
      for (const y of [b.min.y, b.max.y])
        for (const z of [b.min.z, b.max.z]) {
          box.expandByPoint(new Vector3(x, y, z).applyMatrix4(mesh.matrixWorld));
        }
  });
  const w = box.max.x - box.min.x;
  const h = box.max.y - box.min.y;
  const d = box.max.z - box.min.z;
  object.scale.multiply(new Vector3(size.x / w, size.y / h, size.z / d));
  object.updateMatrixWorld(true);
  object.position.set(
    cx - ((box.min.x + box.max.x) / 2) * (size.x / w),
    -box.min.y * (size.y / h),
    cz - ((box.min.z + box.max.z) / 2) * (size.z / d),
  );
}

/** Places a prop at its natural size times a factor, standing on a surface. */
function place(object: Object3D, x: number, y: number, z: number, scale: number, rotate = 0): Object3D {
  object.scale.setScalar(scale);
  object.rotation.y = rotate;
  object.position.set(x, y, z);
  return object;
}

/** A desk mug: not in the packs, so turned here from two primitives. */
function mug(colour: string): Group {
  const group = new Group();
  const cup = new Mesh(new CylinderGeometry(0.045, 0.04, 0.1, 14), new MeshLambertMaterial({ color: colour }));
  cup.position.y = 0.05;
  const handle = new Mesh(new TorusGeometry(0.028, 0.009, 6, 12), new MeshLambertMaterial({ color: colour }));
  handle.position.set(0.05, 0.055, 0);
  group.add(cup, handle);
  return group;
}

export async function applyStyle(id: StyleId, ctx: StyleContext): Promise<StyleHandle> {
  const palette = PALETTES[id];
  const { scene, model } = ctx;
  // The page around the model is the paper it sits on, carried on to the horizon.
  const paper = new Color(PALETTE.surround).multiply(new Color(palette.baseTint)).multiplyScalar(id === 'C' ? 1.04 : 1);
  scene.background = paper;
  ctx.renderer.setClearColor(paper);
  for (const material of model.baked) {
    scene.traverse((o) => {
      if ((o as Mesh).isMesh && (o as Mesh).material === material && material === model.baked[0]) o.userData.noEdge = true;
    });
  }
  for (const lamp of ctx.lamps) lamp.color.set(palette.lamp);
  ctx.fill.color.set(palette.fill[0]);
  ctx.fill.groundColor.set(palette.fill[1]);
  ctx.fill.intensity *= palette.fill[2];
  // C lifts the paper towards white: quiet and bright, whatever the grid's light does to it.
  ctx.setBaseTint(new Color(palette.baseTint).multiplyScalar(id === 'C' ? 1.14 : 1));
  for (const [material, colour] of Object.entries(palette.boxes)) {
    const mesh = model.boxes.get(material as never) as InstancedMesh | undefined;
    if (mesh && colour) (mesh.material as MeshLambertMaterial).color.set(colour);
  }
  model.boxes.get('radio')?.removeFromParent();

  // ---------- Loading: characters and props, all CC0 ----------
  const mini = (name: string) => load(`kenney-mini-characters/${name}.glb`);
  const furniture = (name: string) => load(`kenney-furniture-kit/${name}.glb`);
  const kay = (name: string) => load(`kaykit-furniture-bits/${name}.gltf`);
  const [cast, reviewerGltf, wheelchair, desk, chair, keyboard, radio] = await Promise.all([
    Promise.all(CAST.map(mini)),
    mini(REVIEWER),
    mini('wheelchair'),
    furniture('desk'),
    furniture('chairDesk'),
    furniture('computerKeyboard'),
    furniture('radio'),
  ]);

  const scale = id === 'B' ? CHAR_SCALE * 1.06 : CHAR_SCALE;
  const builders = new Map<PieceId, Person>();
  DESKS.forEach((d, i) => {
    const gltf = cast[i];
    if (!gltf) return;
    const p = person(gltf, scale, '#faf8f3');
    if (id === 'B') p.root.scale.x *= 1.1;
    builders.set(d.piece, p);
    scene.add(p.root);
  });
  const reviewer = person(reviewerGltf, scale, '#faf8f3');
  if (id === 'B') reviewer.root.scale.x *= 1.1;
  reviewer.root.position.set(REVIEW.reviewer[0], 0, REVIEW.reviewer[1] - 0.08);
  reviewer.root.rotation.y = Math.PI;
  reviewer.sheet.visible = true;
  play(reviewer, 'holding', 0.4);
  scene.add(reviewer.root);

  // Desks, chairs and keyboards as models (A and B); the radio as a model in every frame.
  const wheelchairDesk = DESKS[WHEELCHAIR_DESK]?.piece;
  for (const [i, d] of DESKS.entries()) {
    if (swapsFurniture(id)) {
      const deskModel = desk.scene.clone(true);
      fitBox(deskModel, d.x, d.z, { x: DESK.width, y: DESK.height, z: DESK.depth }, Math.PI);
      scene.add(deskModel);
      if (d.piece !== wheelchairDesk) {
        const chairModel = chair.scene.clone(true);
        fitBox(chairModel, d.seat[0], d.seat[1] + 0.05, { x: 0.5, y: 0.95, z: 0.5 }, Math.PI);
        scene.add(chairModel);
      }
    }
    const kb = keyboard.scene.clone(true);
    fitBox(kb, d.x - 0.05, d.z + 0.2, { x: 0.46, y: 0.025, z: 0.15 });
    kb.position.y += DESK.height;
    scene.add(kb);
    void i;
  }
  if (wheelchairDesk) {
    const d = deskFor(wheelchairDesk);
    const w = wheelchair.scene;
    w.scale.setScalar(scale);
    w.rotation.y = Math.PI;
    w.position.set(d.seat[0], 0, d.seat[1] + 0.02);
    scene.add(w);
  }
  const radioModel = radio.scene;
  fitBox(radioModel, RADIO.x, ROOM.z0 + 0.04 + RADIO.depth / 2, { x: RADIO.width, y: RADIO.height, z: RADIO.depth });
  radioModel.position.y += SHELF.y;
  scene.add(radioModel);

  // ---------- Props, per frame ----------
  /** Loads named props once; each use takes a fresh copy, and a missing file fails loudly. */
  const kit = async (names: readonly string[], from: (n: string) => Promise<GLTF>) => {
    const loaded = new Map(await Promise.all(names.map(async (n) => [n, await from(n)] as const)));
    return (n: string): Object3D => {
      const g = loaded.get(n);
      if (!g) throw new Error(`prop ${n} was not loaded`);
      return g.scene.clone(true);
    };
  };
  if (id === 'A' || id === 'C') {
    const prop = await kit(
      [
        'plantSmall1',
        'plantSmall2',
        'plantSmall3',
        'lampRoundTable',
        'books',
        'pottedPlant',
        'rugRectangle',
        'trashcan',
        'coatRackStanding',
      ],
      furniture,
    );
    for (const [i, d] of DESKS.entries()) {
      if (id === 'C' && i % 3 !== 0) continue;
      scene.add(
        place(prop(['plantSmall1', 'plantSmall2', 'plantSmall3'][i % 3] ?? 'plantSmall1'), d.x - 0.6, DESK.height, d.z - 0.15, 1.6),
      );
      if (id === 'A') {
        if (i % 2 === 0) scene.add(place(prop('lampRoundTable'), d.x + 0.62, DESK.height, d.z - 0.2, 1.7, -0.4));
        else scene.add(place(prop('books'), d.x + 0.58, DESK.height, d.z - 0.12, 1.8, 0.3));
        scene.add(place(mug(['#d9534f', '#3e7cb1', '#f0c419', '#5cb85c'][i % 4] ?? '#d9534f'), d.x + 0.42, DESK.height, d.z + 0.18, 1));
      }
    }
    if (id === 'A') {
      const r = prop('rugRectangle');
      fitBox(r, REVIEW.table.x, REVIEW.table.z + 0.2, { x: 3.2, y: 0.01, z: 2.1 });
      scene.add(r);
      scene.add(place(prop('pottedPlant'), ROOM.x1 - 0.5, 0, ROOM.z0 + 0.5, 2.4));
      scene.add(place(prop('pottedPlant'), ROOM.x0 + 0.5, 0, ROOM.z0 + 0.5, 2.4));
      scene.add(place(prop('coatRackStanding'), RECEPTION.x + RECEPTION.width / 2 + 0.6, 0, RECEPTION.z + 0.6, 2.2));
      scene.add(place(prop('trashcan'), -1.4, 0, 3.7, 1.8));
    } else {
      scene.add(place(prop('pottedPlant'), ROOM.x1 - 0.5, 0, ROOM.z0 + 0.5, 2.2));
    }
  }
  if (id === 'B') {
    const prop = await kit(
      [
        'cactus_small_A',
        'cactus_small_B',
        'cactus_medium_A',
        'lamp_table',
        'book_set',
        'pictureframe_large_A',
        'pictureframe_large_B',
        'rug_rectangle_stripes_A',
      ],
      kay,
    );
    for (const [i, d] of DESKS.entries()) {
      scene.add(place(prop(i % 2 ? 'cactus_small_B' : 'cactus_small_A'), d.x - 0.6, DESK.height, d.z - 0.15, 0.55));
      if (i % 2 === 0) scene.add(place(prop('lamp_table'), d.x + 0.6, DESK.height, d.z - 0.18, 0.6, -0.3));
      else scene.add(place(prop('book_set'), d.x + 0.58, DESK.height, d.z - 0.1, 0.6, 0.2));
    }
    const r = prop('rug_rectangle_stripes_A');
    fitBox(r, REVIEW.table.x, REVIEW.table.z + 0.2, { x: 3.4, y: 0.01, z: 2.2 });
    scene.add(r);
    scene.add(place(prop('cactus_medium_A'), ROOM.x1 - 0.5, 0, ROOM.z0 + 0.5, 1.4));
    // Pictures on the back wall, either side of the briefs.
    scene.add(place(prop('pictureframe_large_A'), BRIEF.table.x - 2.2, 1.45, ROOM.z0 + 0.03, 0.9));
    scene.add(place(prop('pictureframe_large_B'), BOARD.x - 1.9, 1.45, ROOM.z0 + 0.03, 0.9));
  }

  // ---------- Status gems over the builders (A) ----------
  const gems = new Map<PieceId, Mesh<OctahedronGeometry, MeshBasicMaterial>>();
  if (id === 'A') {
    for (const d of DESKS) {
      const gem = new Mesh(new OctahedronGeometry(0.15, 0), new MeshBasicMaterial({ color: '#4aa8ff' }));
      gem.scale.set(0.75, 1.6, 0.75);
      gem.position.set(d.seat[0], 1.75, d.seat[1] - 0.05);
      gem.userData.noEdge = true;
      scene.add(gem);
      gems.set(d.piece, gem);
    }
  }

  // ---------- Shading and line ----------
  let edges: EdgePass | null = null;
  if (id === 'B' || id === 'C') {
    if (id === 'B') {
      const ramp = toonRamp();
      scene.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        const swap = (m: Material): Material => {
          const lit = m as MeshStandardMaterial;
          if (!('isMeshStandardMaterial' in lit || 'isMeshLambertMaterial' in lit)) return m;
          return new MeshToonMaterial({ color: lit.color, map: lit.map ?? null, gradientMap: ramp, side: lit.side });
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
      });
    }
    edges =
      id === 'B'
        ? new EdgePass(ctx.renderer, { color: '#1b1a24', width: 2.2, strength: 1, normalThreshold: 0.35, depthThreshold: 0.02 })
        : new EdgePass(ctx.renderer, { color: '#7b8091', width: 1.1, strength: 0.7, normalThreshold: 0.25, depthThreshold: 0.012 });
    for (const pool of model.pools.values()) pool.userData.noEdge = true;
    scene.traverse((o) => {
      if ((o as Mesh).isMesh && ((o as Mesh).material as MeshBasicMaterial).transparent) o.userData.noEdge = true;
    });
  }

  // ---------- Each frame: poses from the replay ----------
  const placeSeated = (p: Person, d: (typeof DESKS)[number], wheel: boolean) => {
    p.root.position.set(d.seat[0], wheel ? 0.12 : 0.47 - 0.2, d.seat[1] - 0.06);
    p.root.rotation.y = Math.PI;
  };
  const standAt = (p: Person) => {
    p.root.position.set(REVIEW.table.x + 0.55, 0, REVIEW.table.z - REVIEW.table.depth / 2 - 0.45);
    p.root.rotation.y = 0;
  };
  let lastHeld: PieceId | null | undefined;
  return {
    update(dt, t) {
      const s = ctx.now();
      const phases = new Map<PieceId, Phase>(PIECE_IDS.map((p) => [p, ctx.replay.phase(p, s)]));
      // The work waiting longest at the table is carried there by its builder: one standing figure at most.
      const waiting = [...phases.entries()]
        .filter(([, ph]) => ph.kind === 'at-review' && !ph.reviewing)
        .sort((a, b) => (a[1].kind === 'at-review' && b[1].kind === 'at-review' ? a[1].due - b[1].due : 0))[0]?.[0];
      const reviewing = [...phases.values()].some((ph) => ph.kind === 'at-review' && ph.reviewing);
      const held = waiting ?? null;
      if (held !== lastHeld) {
        ctx.holdSheet(held);
        lastHeld = held;
      }
      DESKS.forEach((d, i) => {
        const p = builders.get(d.piece);
        const phase = phases.get(d.piece);
        if (!p || !phase) return;
        const wheel = d.piece === wheelchairDesk;
        if (d.piece === held && !wheel) {
          standAt(p);
          p.sheet.visible = true;
          play(p, 'holding', i * 0.3);
        } else {
          placeSeated(p, d, wheel);
          p.sheet.visible = false;
          const back = phase.kind === 'back' ? phase.outcome : null;
          const gesture = id === 'B' && back ? (back === 'accepted' ? 'yes' : 'no') : null;
          const busy = phase.kind === 'building';
          play(p, gesture ?? (wheel ? (busy ? 'wheelchairTyping' : 'wheelchair') : busy ? 'typing' : 'sit'), i * 0.37);
        }
        p.mixer.update(dt);
        const gem = gems.get(d.piece);
        if (gem) {
          const returned = (phase.kind === 'building' && phase.returned) || (phase.kind === 'back' && phase.outcome === 'returned');
          const accepted = phase.kind === 'done' || (phase.kind === 'back' && phase.outcome === 'accepted');
          gem.material.color.set(accepted ? '#3ccf6e' : returned ? '#ff5a4f' : '#4aa8ff');
          gem.visible = phase.kind !== 'idle' && d.piece !== held;
          gem.rotation.y = t * 1.2 + i;
          gem.position.y = 1.85 + Math.sin(t * 2 + i) * 0.03;
        }
      });
      play(reviewer, reviewing ? (id === 'B' ? 'no' : 'holding') : 'holding', 0.4);
      reviewer.mixer.update(dt);
    },
    ...(edges
      ? {
          render: (sc: Scene, camera: import('three').PerspectiveCamera) => edges?.render(sc, camera),
          resize: (w: number, h: number) => edges?.setSize(w, h),
        }
      : {}),
  };
}
