// Harry's desk at real scale, with his team as a living miniature office on it (branch
// design/desk-miniature). The engine draws and places: the desk and its objects, the model in the
// management-sim style, the sun, the camera's stations and the glides between them (the dive into the
// office is the main one), the tilt-shift focus pull, the DOM tags laid over the scene, and picking.
// What a choice does is the controller's business (desk/main.ts).
//
// Stations: the desk itself ('door', as you arrive); 'office', inside the model at the team's scale;
// 'cabinet', the index-card box; 'notebook'; 'reception', the keyboard; and `desk:<tool>`.

import {
  AdditiveBlending,
  BasicShadowMap,
  Box3,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  NoToneMapping,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  type SkinnedMesh,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  Vector2,
  Vector3,
  VideoTexture,
  WebGLRenderer,
} from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { drawerOf } from '../content/drawers';
import { isPieceId, PIECE_IDS, PIECES, type PieceId } from '../content/pieces';
import { wholeMedia } from '../folder';
import { NEUTRAL_LIGHT, type RoomLight, type SignText, signFor } from '../room/grid';
import { Crew } from '../scene/crew';
import { BASE, CABINET, DESKS, deskFor, RECEPTION, ROOM, SCREEN, WALL } from '../scene/layout';
import { atlasRect, buildModel } from '../scene/model';
import { fitView, fromAngles, loadGltf, type View } from '../scene/style';
import type { Timeline } from '../timeline/schema';
import { daylightAt, furnish } from './furnish';
import { doorWords } from './lettering';
import { Monitor } from './monitor';
import {
  BusinessCard,
  coffee,
  creditSlip,
  DESK_Y,
  deskTop,
  IndexBox,
  Keyboard,
  Microphone,
  Nameplate,
  Notebook,
  PRINTOUT,
  pencil,
  type Round,
  SourcePrintout,
  stampAndPad,
  sticky,
} from './objects';
import { buildOffice, CABINET_AT, standAt, ZONES } from './office';
import { CREAM } from './palette';
import { DeskPass } from './pass';
import { buildRoom, DOOR, DRAWN, drawn, FLOOR, M, ROOM as OFFICE, OUTSIDE, TABLE, toWorld } from './room';

/** 'entrance' is outside the office door; 'door' is seated at the desk (the desk's own first view); 'room' is
 * standing back by the chair, looking round the office. */
export type Station = 'entrance' | 'door' | 'room' | 'office' | 'cabinet' | 'notebook' | 'reception' | `desk:${PieceId}`;

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
  /** From outside the door: it swings open and the camera walks in and sits, ending on the desk's own view. */
  walkIn(): Promise<void>;
  /** Straight in from the door to the seated view, without the walk (Skip, Esc, reduced motion). */
  cutIn(): void;
  /** Whether a click at this page point lands on the door (outside it). */
  hitsDoor(x: number, y: number): boolean;
  /** A knock: the door jolts on its hinge, briefly. */
  knock(): void;
  /** The pointer over the door (outside it): the door a touch brighter. */
  hoverDoor(on: boolean): void;
  /** The door on screen, in page pixels, outside it. */
  doorRect(): { x: number; y: number; width: number; height: number } | null;
  /** The grid's generation mix, for the window's turbines and panels; null keeps them still. */
  setMix(mix: { wind: number; solar: number } | null): void;
  /** Which source's spine is at this page point, looking round the room; null if none. */
  pickBook(x: number, y: number): number | null;
  /** The mic's ON AIR lamp, on while its contact card is open. */
  onAir(on: boolean): void;
  /** The top of the mic's head on screen, in page pixels, for the speech bubble's tail. */
  micHead(): { x: number; y: number } | null;
  /** The things on the desk, each as its box on screen in page pixels, for the bubble to keep clear of. */
  objectRects(): Array<{ name: string; x: number; y: number; width: number; height: number }>;
  /** Presses the 3D key a typed character falls on. */
  press(key: string): void;
  /** The printer on the model's Reception counter, on screen, in page pixels. */
  printerPoint(): { x: number; y: number } | null;
  togglePause(): boolean;
  onPick(fn: (action: string) => void): void;
  readonly debug: Record<string, (...args: never[]) => unknown>;
}

interface MountOptions {
  readonly stage: HTMLElement;
  /** Everything laid over the scene: elements under it with a `data-desk-target`. */
  readonly labels: HTMLElement;
  /**
   * The page's own words for what is printed on things in the scene (desk/lettering.ts): the header
   * (#masthead: the nameplate and the card), the door's plate and the grid's credit. They stay in the
   * HTML, visually hidden; the scene prints them, rings them while they have focus, and passes clicks on
   * the printed links to the real ones.
   */
  readonly lettering?: {
    readonly masthead: HTMLElement | null;
    readonly door: HTMLElement | null;
    readonly credit: HTMLElement | null;
    /** The Source list (#source): the printout prints where the code is and the repositories' names. */
    readonly source?: HTMLElement | null;
  };
  readonly timeline: Timeline;
  readonly startAt?: number;
  readonly paused?: boolean;
  readonly reduced?: boolean;
  /** Start outside the office door rather than seated at the desk. */
  readonly entrance?: boolean;
}

/**
 * The desk's layout: where each thing stands, around the office model at the origin. Everything on the
 * desk is real-scale (74 units to the metre, 13.5 mm a unit) but the model, a 21 × 14 cm miniature.
 */
const PLACES = {
  box: { x: -18.3, z: 2.4, turn: 0.32 },
  stamp: { x: -12.5, z: 12.4, turn: 0.12 },
  sticky: { x: -4.0, z: 11.6, turn: 0.1 },
  notebook: { x: 17.0, z: -1.6, turn: -0.18 },
  keyboard: { x: 10.4, z: 14.8, turn: -0.1 },
  cup: { x: 17.0, z: -14.0 },
  // Resting on the source printout.
  pencil: { x: 29.4, z: 14.4, turn: 2.2 },
  // The card turned square to the door camera (its azimuth, -12°), so its lines read level; the mic
  // between it and the nameplate.
  nameplate: { x: -25.6, z: -17.8, turn: -0.04 },
  mic: { x: -12.6, z: -13.2, turn: 0.15 },
  // The ultrawide at the back of the desk: seated, only its lower edge shows, along the top of the view.
  monitor: { x: 7.5, z: -23.2 },
  // The source printout, at the desk's front right, beside the keyboard.
  source: { x: 30.2, z: 12.2, turn: 0.04 },
  card: { x: 3.8, z: -14.0, turn: -0.2 },
} as const;
/** How much bigger than first drawn each thing is, to be its real size (the keyboard and notebook were). */
const REAL = { box: 1.3, nameplate: 1.5, cup: 1.55, sticky: 1.28, stamp: 1.15, pencil: 1.5, mic: 1.6 } as const;

/**
 * The office lands low and flat, looking across the room at the monitors, whose screens face the front.
 * From a sim's three-quarter angle each seated builder sits beside their screen in the picture, not in
 * front of it, and the front row's monitors stay below the back row's screens.
 */
const OFFICE_ANGLE = { elevation: 24, azimuth: -38 } as const;
/**
 * A card pull leans in square to the builder's monitor, as if looking at their screen: the camera at the
 * screen's height, looking straight along its normal, and whatever stands more than this far in front of
 * the screen (the front row, for a back-row desk) cut away by the near plane.
 */
const LEAN_IN = { ahead: 1.4 } as const;

/**
 * How sharp each station is: tilt-shift strength, and where its band of focus sits. `cut` is whether the
 * camera clears what would stand between it and the subject, as a sim's camera does with walls: in a card
 * view the model's near side wall and the giant things on the desk go (from halfway through the glide), so
 * the monitor is in the clear; the desk itself stays.
 */
const FOCUS: Record<string, { strength: number; focus: number; band: number; cut: number }> = {
  entrance: { strength: 0, focus: 0.5, band: 0.5, cut: 0 },
  door: { strength: 0.8, focus: 0.48, band: 0.16, cut: 0 },
  room: { strength: 0, focus: 0.5, band: 0.5, cut: 0 },
  cabinet: { strength: 0.55, focus: 0.55, band: 0.22, cut: 0 },
  notebook: { strength: 0.4, focus: 0.5, band: 0.26, cut: 0 },
  reception: { strength: 0.5, focus: 0.5, band: 0.22, cut: 0 },
  office: { strength: 0, focus: 0.5, band: 0.5, cut: 0 },
  desk: { strength: 0, focus: 0.5, band: 0.5, cut: 1 },
};

const smooth = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/**
 * The walk in, in seconds, paced like a person: the door swings open; a step to the threshold and a pause
 * there to take the room in; then an unhurried walk across the room, slowest while looking at the shelf
 * and the whiteboard, easing gently down into the seat.
 */
const WALK = { swing: 1.3, step: [0.5, 2.7], pause: [2.7, 3.1], roam: [3.1, 6.9] } as const;
const WALK_MS = WALK.roam[1] * 1000;
/** Where along the room's walk (0 to 1) the gaze is on the shelf, and on the whiteboard. */
const LOOK_AT = { shelf: 0.25, board: 0.5 } as const;

/** The pace along the room's walk at u: setting off from the threshold, slowing at the shelf and the
 *  whiteboard, and slowing right down as it sits. */
function pace(u: number): number {
  const setOff = 0.12 + 0.88 * smooth(u / 0.16);
  const sitDown = 1 - 0.94 * smooth((u - 0.7) / 0.3);
  const look = 1 - 0.5 * Math.exp(-(((u - LOOK_AT.shelf) / 0.08) ** 2)) - 0.45 * Math.exp(-(((u - LOOK_AT.board) / 0.08) ** 2));
  return setOff * sitDown * look;
}
/** Time (0 to 1) to place along the walk (0 to 1), from the pace: a table of how long each step takes. */
const ROAM_TABLE = (() => {
  const n = 240;
  const times = [0];
  for (let i = 0; i < n; i++) times.push((times[i] ?? 0) + 1 / n / pace((i + 0.5) / n));
  const total = times[n] ?? 1;
  return times.map((t) => t / total);
})();
function roamAt(time: number): number {
  const t = clamp01(time);
  let lo = 0;
  let hi = ROAM_TABLE.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((ROAM_TABLE[mid] ?? 0) <= t) lo = mid;
    else hi = mid;
  }
  const a = ROAM_TABLE[lo] ?? 0;
  const b = ROAM_TABLE[hi] ?? 1;
  return (lo + (b > a ? (t - a) / (b - a) : 0)) / (ROAM_TABLE.length - 1);
}

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

const fromA = new Vector3();
const toA = new Vector3();
/**
 * Where the camera sits from what it looks at, part way through a glide, in angles and distance rather
 * than a straight line. Going down, it keeps its height and levels out late: a swoop that starts high over
 * the desk and flattens out into the low view. Going up, it lifts first and then pulls back.
 */
function swoop(from: View, to: View, t: number, out: Vector3): Vector3 {
  fromA.subVectors(from.pos, from.look);
  toA.subVectors(to.pos, to.look);
  const r0 = fromA.length();
  const r1 = toA.length();
  const el0 = Math.asin(fromA.y / r0);
  const el1 = Math.asin(toA.y / r1);
  const az0 = Math.atan2(fromA.x, fromA.z);
  let turn = Math.atan2(toA.x, toA.z) - az0;
  if (turn > Math.PI) turn -= 2 * Math.PI;
  if (turn < -Math.PI) turn += 2 * Math.PI;
  const e = easeInOut(t);
  const level = el1 < el0 ? e * e : 1 - (1 - e) * (1 - e);
  const r = r0 * (r1 / r0) ** e;
  const el = el0 + (el1 - el0) * level;
  const az = az0 + turn * e;
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(r);
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
  lettering = { masthead: null, door: null, credit: null },
  timeline,
  startAt = 0,
  paused: startPaused = false,
  reduced = false,
  entrance: startOutside = false,
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
  scene.add(deskTop(TABLE.x1 - TABLE.x0, TABLE.z1 - TABLE.z0));
  // The office round the desk, and the door into it: one space, so the walk in ends on the desk's view.
  // The room around the desk, drawn in its own units and set into the world at its real size.
  const room = buildRoom(doorWords(lettering.door));
  toWorld(room.group);
  scene.add(room.group);
  // The office, furnished (desk/furnish.ts): the window and the grid outside it, the shelf of sources,
  // the whiteboard, the rug, the lamp; and the kit's CC0 models: the radio on the shelf, a coat stand by
  // the door with a jacket on it, a plant in the corner and a small one on the shelf.
  const furniture = furnish();
  toWorld(furniture.group);
  scene.add(furniture.group);
  let mixNow: { wind: number; solar: number } | null = null;
  let hourShown = -1;
  const showWindow = () => {
    hourShown = new Date().getHours();
    furniture.setWindow(daylightAt(hourShown), mixNow);
  };
  showWindow();
  const kitModel = (name: string): Promise<GLTF | null> => loadGltf(`kenney-furniture-kit/${name}.glb`).catch(() => null);
  const [radioGltf, coatGltf, plantGltf, smallGltf] = await Promise.all(
    ['radio', 'coatRackStanding', 'pottedPlant', 'plantSmall2'].map(kitModel),
  );
  /** A kit model, a copy, stood on a place (centred on it) at a height, turned, in a group's own units. */
  const placeModel = (gltf: GLTF | null | undefined, at: Vector3, height: number, turn = 0, parent: Object3D = scene): Object3D | null => {
    if (!gltf) return null;
    const o = gltf.scene.clone(true);
    o.rotation.y = turn;
    o.updateMatrixWorld(true);
    const size = new Box3().setFromObject(o).getSize(new Vector3());
    o.scale.setScalar(height / Math.max(0.001, size.y));
    o.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(o);
    const centre = bounds.getCenter(new Vector3());
    o.position.set(at.x - centre.x, at.y - bounds.min.y, at.z - centre.z);
    parent.add(o);
    return o;
  };
  // In the room's drawing (its own units), set into the world with it.
  const shelfRadio = placeModel(radioGltf, furniture.places.radio, 0.22 * drawn.M, 0.3, furniture.group);
  placeModel(coatGltf, furniture.places.coatStand, 1.8 * drawn.M, -0.5, furniture.group);
  placeModel(plantGltf, furniture.places.plant, 1.1 * drawn.M, 0.7, furniture.group);
  placeModel(smallGltf, furniture.places.shelfPlant, 0.3 * drawn.M, 0, furniture.group);
  // The corridor's potted plant, by the door: there from the first frame.
  placeModel(plantGltf, room.plantAt, room.plantHeight, 0, room.group);

  // ---------- Daylight: a sun with crisp shadows, and a soft fill ----------
  const sun = new DirectionalLight('#fff6e6', 2.5);
  sun.position.set(-22, 42, 26);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  // Wide enough for the whole desk's things at their real size (about 90 × 63 cm).
  Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 36, bottom: -36, near: 10, far: 130 });
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
  box.group.scale.setScalar(REAL.box);
  const notebook = new Notebook();
  notebook.group.position.set(PLACES.notebook.x, 0, PLACES.notebook.z);
  notebook.group.rotation.y = PLACES.notebook.turn;
  const keyboard = new Keyboard();
  keyboard.group.position.set(PLACES.keyboard.x, 0, PLACES.keyboard.z);
  keyboard.group.rotation.y = PLACES.keyboard.turn;
  const stamp = stampAndPad();
  stamp.position.set(PLACES.stamp.x, 0, PLACES.stamp.z);
  stamp.rotation.y = PLACES.stamp.turn;
  // Built on the desk top (its parts at DESK_Y), so scaled about it.
  stamp.scale.setScalar(REAL.stamp);
  stamp.position.y = DESK_Y * (1 - REAL.stamp);
  const cup = coffee();
  cup.position.set(PLACES.cup.x, DESK_Y, PLACES.cup.z);
  cup.scale.setScalar(REAL.cup);
  const pen = pencil();
  pen.position.set(PLACES.pencil.x, DESK_Y + PRINTOUT.height + 0.2 * REAL.pencil, PLACES.pencil.z);
  pen.rotation.y = PLACES.pencil.turn;
  pen.scale.setScalar(REAL.pencil);
  let note = sticky(signFor(null));
  note.position.set(PLACES.sticky.x, DESK_Y + 0.02, PLACES.sticky.z);
  note.rotation.z = PLACES.sticky.turn;
  note.scale.setScalar(REAL.sticky);
  const plate = new Nameplate();
  plate.group.position.set(PLACES.nameplate.x, DESK_Y, PLACES.nameplate.z);
  plate.group.rotation.y = PLACES.nameplate.turn;
  plate.group.scale.setScalar(REAL.nameplate);
  const card = new BusinessCard();
  card.group.position.set(PLACES.card.x, DESK_Y, PLACES.card.z);
  card.group.rotation.y = PLACES.card.turn;
  const mic = new Microphone();
  mic.group.position.set(PLACES.mic.x, DESK_Y, PLACES.mic.z);
  mic.group.rotation.y = PLACES.mic.turn;
  mic.group.scale.setScalar(REAL.mic);
  // The monitor is drawn at 125 units to the metre, like the room: set at its real size.
  const monitor = new Monitor();
  monitor.group.scale.setScalar(M / DRAWN);
  monitor.group.position.set(PLACES.monitor.x, DESK_Y, PLACES.monitor.z);
  const printout = new SourcePrintout(
    lettering.source
      ?.querySelector('.source-card__profile a')
      ?.getAttribute('href')
      ?.replace(/^https:\/\//, '') ?? '',
    [...(lettering.source?.querySelectorAll('.source-card__repo') ?? [])].map((r) => r.textContent?.trim() ?? ''),
  );
  printout.group.position.set(PLACES.source.x, DESK_Y, PLACES.source.z);
  printout.group.rotation.y = PLACES.source.turn;
  scene.add(
    box.group,
    notebook.group,
    keyboard.group,
    stamp,
    cup,
    pen,
    note,
    plate.group,
    card.group,
    mic.group,
    monitor.group,
    printout.group,
  );

  // ---------- Printed: the nameplate, the card, the credit slip (the door plate is the room's) ----------
  const words = (selector: string) => lettering.masthead?.querySelector(selector)?.textContent?.trim() ?? '';
  const nameEl = lettering.masthead?.querySelector<HTMLElement>('.masthead__name') ?? null;
  const cardLinks = [...(lettering.masthead?.querySelectorAll<HTMLAnchorElement>('.masthead__links a:not(.masthead__speak)') ?? [])];
  plate.print(words('.masthead__name'), words('.masthead__role'));
  card.print(
    words('.masthead__line'),
    cardLinks.map((a) => ({ text: a.textContent?.trim() ?? '', href: a.href })),
  );
  const creditText = lettering.credit?.textContent?.trim() ?? '';
  creditSlip(note, creditText);
  // Keyboard focus on the hidden words rings the printed ones.
  lettering.masthead?.addEventListener('focusin', (event) => {
    const el = event.target as HTMLElement;
    const visible = el.matches(':focus-visible');
    plate.ring(visible && el === nameEl);
    const i = cardLinks.indexOf(el as HTMLAnchorElement);
    card.focus(visible && i !== -1 ? i : null);
  });
  lettering.masthead?.addEventListener('focusout', () => {
    plate.ring(false);
    card.focus(null);
  });

  // Labels: real buttons and links laid over what they name.
  const labelEls = [...labels.querySelectorAll<HTMLElement>('[data-desk-target]')];
  const nameTags = labelEls.filter((el) => el.dataset.place === 'nametag');
  const placementOrder = [...labelEls.filter((el) => el.dataset.place !== 'nametag'), ...nameTags];

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
    ...(() => {
      const b = new Box3().setFromObject(cup);
      return [b.min, b.max];
    })(),
    ...plate.corners(),
    ...card.corners(),
    ...mic.corners(),
    // The monitor's lower edge: the dock and the session's last lines, along the top of the view.
    ...monitor.lowerStrip(),
    // The printout at the desk's right edge: the seated view takes in its tag and its inner side.
    ...printout.innerEdge(),
    ...worldOf(stamp, [
      [-7, 0, -2],
      [3, 0, 2.5],
    ]),
  ];
  /** Outside the door: the door and its frame fill the height; held upright, a phone keeps its width too. */
  const outsideView = (aspect: number): View => {
    const distance = OUTSIDE.pos.distanceTo(OUTSIDE.look);
    const byHeight = 2 * Math.atan((DOOR.height + DOOR.frame + 0.5 * M) / 2 / distance);
    const byWidth = 2 * Math.atan((DOOR.width + 0.9 * M) / 2 / distance / aspect);
    return { pos: OUTSIDE.pos.clone(), look: OUTSIDE.look.clone(), fov: (Math.max(byHeight, byWidth) * 180) / Math.PI };
  };
  const viewOf = (s: Station, aspect: number): View => {
    if (s === 'entrance') return outsideView(aspect);
    if (s === 'room') {
      // Standing back near the door, the whole back wall: the shelf, the window, the whiteboard.
      const pos = v3(0, FLOOR + 1.6 * M, OFFICE.z1 - 0.6 * M);
      const look = v3(0, FLOOR + 1.12 * M, OFFICE.z0);
      const half = Math.atan((2.55 * M) / pos.distanceTo(look));
      return { pos, look, fov: Math.max(46, (2 * Math.atan(Math.tan(half) / aspect) * 180) / Math.PI) };
    }
    // The foot of the window is kept for the index.
    // Seated: a wider eye and a lower angle than a camera on a stand, so with the desk's things at their real
    // size it sits about 1.4 m above the floor, a person at the desk (the walk in lowers into it).
    if (s === 'door') return framed(fromAngles(47, -12), 34, aspect, deskScene(), 0, { top: 0.92, bottom: -0.8, side: 0.96 });
    if (s === 'office')
      return framed(fromAngles(OFFICE_ANGLE.elevation, OFFICE_ANGLE.azimuth), 15, aspect, modelCorners, 0, {
        top: 0.9,
        bottom: -0.86,
        side: 0.97,
      });
    if (s === 'cabinet') return framed(fromAngles(40, 18), 26, aspect, box.corners(), 0, { top: 0.88, bottom: -0.9, side: 0.86 });
    if (s === 'notebook') return framed(fromAngles(66, -12), 26, aspect, notebook.corners(), 0.3, { top: 0.9, bottom: -0.9, side: 0.62 });
    if (s === 'reception') {
      // The keyboard and the model's counter, clear of the Reception panel on the left, with headroom over
      // the tiny printer for the slip it prints.
      const printerAt = office.printer.getWorldPosition(new Vector3());
      return framed(
        fromAngles(46, 12),
        26,
        aspect,
        [
          ...keyboard.corners(),
          printerAt,
          v3(printerAt.x, printerAt.y + 5, printerAt.z),
          v3(RECEPTION.x - 1.2, 0, RECEPTION.z - 0.5),
          v3(RECEPTION.x + 1.2, 1.4, RECEPTION.z + 0.5),
        ],
        0.47,
        { top: 0.94, bottom: -0.92, side: 0.48 },
      );
    }
    // A card leans in square to its builder's monitor: the screen fills the space beside the card, with
    // room under the bezel for Open; the builder stands at the frame's edge. The screen faces +z, so the
    // camera looks straight down -z; the sideways slide keeps the view perpendicular.
    const d = deskFor(s.slice(5) as PieceId);
    const [sx, sy, sz] = d.screen;
    const half = SCREEN.width / 2 + 0.1;
    const points = [v3(sx - half, sy + SCREEN.height / 2 + 0.12, sz), v3(sx + half, sy - SCREEN.height / 2 - 0.75, sz)];
    return framed(new Vector3(0, 0, 1), 15, aspect, points, -0.45, { top: 0.9, bottom: -0.9, side: 0.47 });
  };

  let station: Station = startOutside ? 'entrance' : 'door';
  const aspectNow = () => Math.max(1, stage.clientWidth) / Math.max(1, stage.clientHeight);
  let target = viewOf(station, aspectNow());
  const current = { pos: target.pos.clone(), look: target.look.clone(), fov: target.fov };
  const offset = new Vector3();
  let presses = 0;
  let cleared = false;
  let glide: {
    from: View;
    to: View;
    fromFocus: (typeof FOCUS)[string];
    toFocus: (typeof FOCUS)[string];
    start: number;
    ms: number;
    done: () => void;
    /** Standing up from the desk to look round the room (and back): a plain eased move, not a swoop. */
    straight?: boolean;
  } | null = null;
  const focusOf = (s: Station) => FOCUS[s.startsWith('desk:') ? 'desk' : s] ?? FOCUS.door;
  let focusNow = { ...(focusOf(station) ?? { strength: 1, focus: 0.5, band: 0.13, cut: 0 }) };
  /** The walk in from the door, while it lasts: when it started, and what to call when seated. */
  let walk: {
    start: number;
    done: () => void;
    /** Outside to the threshold. */
    step: { path: CatmullRomCurve3; gaze: CatmullRomCurve3 };
    /** The threshold, across the room and into the seat. */
    roam: { path: CatmullRomCurve3; gaze: CatmullRomCurve3 };
    from: View;
    to: View;
  } | null = null;
  let walked = startOutside ? 0 : 1;
  let knockedAt = -1;
  let knocks = 0;
  const pickRay = new Raycaster();
  const pickNdc = new Vector2();
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
    if (key === 'credit') return note.localToWorld(v3(0.5, -2.2, 0));
    // Up at the top of the seated view, where the room is: always in the same place on the screen.
    // On the monitor's stand, under the screen: up past it is the room.
    if (key === 'room') return monitor.group.localToWorld(v3(0, 3.2, 1.4));
    if (key === 'shelf') return furniture.group.localToWorld(furniture.shelfFoot.clone());
    if (key === 'window') return v3(0, FLOOR + 2.3 * M + 12, OFFICE.z0);
    if (key === 'office-reception') return v3(RECEPTION.x, RECEPTION.height * 0.55, RECEPTION.z + RECEPTION.depth / 2 + 0.02);
    if (key === 'office-cabinet')
      return v3(CABINET_AT.x, CABINET.height * CABINET_AT.scale * 0.55, CABINET_AT.z + (CABINET.depth * CABINET_AT.scale) / 2 + 0.02);
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
    if (key === 'mic') return mic.corners();
    if (key === 'source') return printout.corners();
    if (key === 'sign')
      return worldOf(note, [
        [-2.2, -2.2, 0],
        [2.2, -2.2, 0],
        [2.2, 2.2, 0],
        [-2.2, 2.2, 0],
      ]);
    if (key === 'room-radio' && shelfRadio) {
      const b = new Box3().setFromObject(shelfRadio);
      return [b.min, b.max, v3(b.min.x, b.max.y, b.min.z), v3(b.max.x, b.min.y, b.max.z)];
    }
    if (key === 'radio')
      return quad(scene, RECEPTION.x - 0.85, RECEPTION.z - 0.12, RECEPTION.x - 0.35, RECEPTION.z + 0.12, RECEPTION.height + 0.2);
    return [];
  };
  /** The current desk's screen, its four corners in the room. */
  function screenCorners(): Vector3[] {
    if (!station.startsWith('desk:')) return [];
    const [x, y, z] = deskFor(station.slice(5) as PieceId).screen;
    const w = SCREEN.width / 2;
    const hh = SCREEN.height / 2;
    return [v3(x - w, y - hh, z), v3(x + w, y - hh, z), v3(x + w, y + hh, z), v3(x - w, y + hh, z)];
  }
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
  /**
   * Where a builder's name tag may go, in order of preference: on the floor before the chair (the front
   * row; the back row's floor is behind the front row's desks), over the status gem, in the gaps between
   * the desks, beside the monitor, further out in front.
   */
  function tagSpots(piece: PieceId) {
    const d = deskFor(piece);
    return [
      ...(d.row === 1 ? [v3(d.x, 0, d.seat[1] + 0.62)] : []),
      v3(d.seat[0], 2.95, d.seat[1]),
      v3(d.x - 1.3, 0.5, d.z),
      v3(d.x + 1.3, 0.5, d.z),
      v3(d.x - 1.0, 1.2, d.z - 0.1),
      v3(d.x + 1.0, 1.2, d.z - 0.1),
      v3(d.x, 0, d.seat[1] + 1.0),
    ];
  }
  type Rect = { x0: number; y0: number; x1: number; y1: number };
  const overlap = (a: Rect, b: Rect, pad = 2) => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;
  /** The screen box of a box in the room, from two opposite corners. */
  function boxRect(a: Vector3, b: Vector3, w: number, h: number): Rect {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const x of [a.x, b.x])
      for (const y of [a.y, b.y])
        for (const z of [a.z, b.z]) {
          projected.set(x, y, z).project(camera);
          xs.push((projected.x * 0.5 + 0.5) * w);
          ys.push((-projected.y * 0.5 + 0.5) * h);
        }
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }
  /** What a name tag keeps clear of, and how much each matters: screens never, then names and furniture, then people. */
  function tagObstacles(w: number, h: number): Array<{ rect: Rect; weight: number }> {
    const c = CABINET_AT;
    const cw = (CABINET.width * c.scale) / 2;
    const cd = (CABINET.depth * c.scale) / 2;
    return [
      ...monitorBoxes(w, h).map((rect) => ({ rect, weight: 100 })),
      { rect: boxRect(v3(c.x - cw, 0, c.z - cd), v3(c.x + cw, CABINET.height * c.scale, c.z + cd), w, h), weight: 20 },
      {
        rect: boxRect(
          v3(RECEPTION.x - RECEPTION.width / 2, 0, RECEPTION.z - RECEPTION.depth / 2),
          v3(RECEPTION.x + RECEPTION.width / 2, RECEPTION.height + 0.3, RECEPTION.z + RECEPTION.depth / 2),
          w,
          h,
        ),
        weight: 20,
      },
      ...ZONES.map((z) => ({
        rect: boxRect(v3(z.x - z.width / 2, 0, z.z - z.width * 0.11), v3(z.x + z.width / 2, 0, z.z + z.width * 0.11), w, h),
        weight: 20,
      })),
      ...DESKS.map((d) => ({
        rect: boxRect(v3(d.seat[0] - 0.25, 0.25, d.seat[1] - 0.2), v3(d.seat[0] + 0.25, 1.25, d.seat[1] + 0.2), w, h),
        weight: 5,
      })),
    ];
  }
  let blocker: Mesh | null = null;
  /** The credit slip on the current sticky note. */
  const creditOf = (on: Object3D) => on.children.find((c) => c.userData.lettering === 'credit') as Mesh;

  // ---------- Sight lines: a tag (or a hit area) goes when what it names is hidden behind something ----------
  const sightRay = new Raycaster();
  let solids: Mesh[] | null = null;
  /** Everything solid that can stand in front of a thing: not the people, glows, shadows or printed faces. */
  function solid(): Mesh[] {
    if (solids) return solids;
    const out: Mesh[] = [];
    scene.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh || (m as SkinnedMesh).isSkinnedMesh || m.userData.noEdge) return;
      const materials = Array.isArray(m.material) ? m.material : [m.material];
      if (materials.some((x) => x.transparent || x.blending === AdditiveBlending)) return;
      out.push(m);
    });
    solids = out;
    return out;
  }
  const seen = (o: Object3D) => {
    for (let n: Object3D | null = o; n; n = n.parent) if (!n.visible) return false;
    return true;
  };
  const within = (o: Object3D, own: Object3D) => {
    for (let n: Object3D | null = o; n; n = n.parent) if (n === own) return true;
    return false;
  };
  /** Whether something solid stands between the camera and this point (the thing it is on aside). */
  function hidden(p: Vector3, own: Object3D | null = null): boolean {
    const dir = p.clone().sub(camera.position);
    const dist = dir.length();
    sightRay.set(camera.position, dir.normalize());
    sightRay.near = camera.near;
    sightRay.far = dist - Math.max(0.05, dist * 0.02);
    return sightRay.intersectObjects(solid(), false).some((h) => seen(h.object) && !(own && within(h.object, own)));
  }
  /** The thing a tag or hit area is on, so its own surfaces never count as standing in front of it. */
  function ownOf(key: string): Object3D | null {
    if (key === 'cabinet' || key.startsWith('drawer:') || key.startsWith('folder:')) return box.group;
    if (key === 'notebook') return notebook.group;
    if (key === 'reception') return keyboard.group;
    if (key === 'stamp') return stamp;
    if (key === 'sign') return note;
    if (key === 'mic') return mic.group;
    if (key === 'source') return printout.group;
    if (key === 'room-radio') return shelfRadio;
    if (key === 'shelf') return furniture.group;
    if (key === 'window') return room.group;
    if (key === 'room') return monitor.group;
    if (key === 'office' || key === 'radio' || key.startsWith('office-')) return model.group;
    return null;
  }
  const centreOf = (pts: Vector3[]) => pts.reduce((sum, p) => sum.add(p), new Vector3()).multiplyScalar(1 / Math.max(1, pts.length));
  let placedTags: Rect[] = [];
  function placeLabels(): void {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const obstacles = standing() === 'office' ? tagObstacles(w, h) : [];
    placedTags = [];
    // The room's own tags first, so the builders' name tags keep clear of them too.
    for (const el of placementOrder) {
      const key = el.dataset.deskTarget ?? '';
      const place = el.dataset.place ?? 'tag';
      const show = shownAt(el) && !glide;
      if (place === 'cover' || place === 'screen') {
        const world = show ? (place === 'screen' ? screenCorners() : coverOf(key)) : [];
        const corners = world.map((c) => c.clone().project(camera));
        // A screen is leaned in to square-on with what stood in front cut away; anything else must be in sight.
        const onScreen =
          corners.length > 0 && corners.every((c) => c.z < 1) && (place === 'screen' || !hidden(centreOf(world), ownOf(key)));
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
        // The least-bad spot: a tag never covers a screen or another tag if any spot avoids them.
        let chosen: Rect | null = null;
        let best = Number.POSITIVE_INFINITY;
        for (const spot of tagSpots(piece)) {
          projected.copy(spot).project(camera);
          const x = (projected.x * 0.5 + 0.5) * w - tw / 2;
          const y = (-projected.y * 0.5 + 0.5) * h - th / 2;
          const r = { x0: x, y0: y, x1: x + tw, y1: y + th };
          let cost = r.x0 < 4 || r.y0 < 4 || r.x1 > w - 4 || r.y1 > h - 4 ? 1000 : 0;
          // A spot behind something is a tag floating over the wrong thing: worse than covering a painted zone
          // name, not as bad as covering a screen or another tag. (Tested a little above the spot: those on
          // the floor sit on its painted zones.)
          if (hidden(spot.clone().setY(spot.y + 0.15))) cost += 60;
          for (const o of obstacles) if (overlap(r, o.rect)) cost += o.weight;
          for (const t of placedTags) if (overlap(r, t)) cost += 100;
          if (cost < best) {
            best = cost;
            chosen = r;
          }
          if (cost === 0) break;
        }
        if (!chosen) continue;
        placedTags.push(chosen);
        el.style.transform = `translate(${chosen.x0.toFixed(1)}px, ${chosen.y0.toFixed(1)}px)`;
        continue;
      }
      const a = show ? anchorOf(key) : null;
      if (a) projected.copy(a).project(camera);
      const onScreen =
        a !== null && projected.z < 1 && Math.abs(projected.x) < 1.02 && Math.abs(projected.y) < 1.02 && !hidden(a, ownOf(key));
      if (el.hidden === onScreen) el.hidden = !onScreen;
      if (!onScreen) continue;
      const x = (projected.x * 0.5 + 0.5) * w;
      const y = (-projected.y * 0.5 + 0.5) * h;
      const shift =
        place === 'centre' ? 'translate(-50%, -50%)' : place === 'over' ? 'translate(-50%, calc(-100% - 4px))' : 'translate(-50%, 4px)';
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) ${shift}`;
      if (standing() === 'office') {
        const tw = el.offsetWidth;
        const th = el.offsetHeight;
        const x0 = place === 'centre' || place === 'over' || place === 'tag' ? x - tw / 2 : x;
        const y0 = place === 'centre' ? y - th / 2 : place === 'over' ? y - th - 4 : y + 4;
        placedTags.push({ x0, y0, x1: x0 + tw, y1: y0 + th });
      }
    }
    labelsDirty = false;
  }

  function applyCamera(): void {
    const reach = current.pos.distanceTo(current.look);
    // Leaning in to a screen, the near plane cuts away what stands between: the look point is on the
    // screen's plane, so nothing more than LEAN_IN.ahead in front of it is drawn.
    const open = station === 'entrance' || station === 'room' || walk || glide?.straight ? 1 : Math.max(0.1, reach * 0.4 - 12);
    const near = open + (Math.max(open, reach - LEAN_IN.ahead) - open) * focusNow.cut;
    const clear = focusNow.cut > 0.5;
    if (clear !== cleared) {
      cleared = clear;
      for (const thing of [
        box.group,
        notebook.group,
        keyboard.group,
        stamp,
        cup,
        pen,
        plate.group,
        card.group,
        mic.group,
        monitor.group,
        printout.group,
      ])
        thing.visible = !clear;
      office.openSide(clear);
      office.solo(clear && station.startsWith('desk:') ? (station.slice(5) as PieceId) : null);
    }
    const far = reach + 1600;
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
    // The monitor's session follows the replay, redrawn only when a new line arrives.
    monitor.update(crew.replay, crew.s);
    office.update(dt, now / 1000);
    furniture.update(dt, now / 1000);
    if (new Date().getHours() !== hourShown) showWindow();
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
    if (knockedAt >= 0 && !walk && station === 'entrance') {
      // A knock: a small shudder on the hinge, gone in a sixth of a second.
      const k = (now - knockedAt) / 160;
      room.hinge.rotation.y = k < 1 ? 0.012 * Math.sin(k * Math.PI * 3) * (1 - k) : 0;
      if (k >= 1) knockedAt = -1;
      labelsDirty = true;
    }
    if (walk) {
      const t = Math.min(1, (now - walk.start) / WALK_MS);
      walked = t;
      poseWalk(t, walk);
      labelsDirty = true;
      if (t >= 1) {
        const done = walk.done;
        walk = null;
        station = 'door';
        target = viewOf('door', aspectNow());
        current.pos.copy(target.pos);
        current.look.copy(target.look);
        current.fov = target.fov;
        focusNow = { ...(focusOf('door') ?? focusNow) };
        done();
      }
    }
    if (glide) {
      const t = Math.min(1, (now - glide.start) / glide.ms);
      const e = easeInOut(t);
      current.look.lerpVectors(glide.from.look, glide.to.look, smooth(Math.min(1, t * 1.3)));
      if (glide.straight) current.pos.lerpVectors(glide.from.pos, glide.to.pos, e);
      else current.pos.copy(current.look).add(swoop(glide.from, glide.to, t, offset));
      current.fov = glide.from.fov + (glide.to.fov - glide.from.fov) * e;
      // The focus pulls as the camera travels: sharp on arriving in the office, soft again rising out.
      focusNow = {
        strength: glide.fromFocus.strength + (glide.toFocus.strength - glide.fromFocus.strength) * e,
        focus: glide.fromFocus.focus + (glide.toFocus.focus - glide.fromFocus.focus) * e,
        band: glide.fromFocus.band + (glide.toFocus.band - glide.fromFocus.band) * e,
        cut: glide.fromFocus.cut + (glide.toFocus.cut - glide.fromFocus.cut) * e,
      };
      labelsDirty = true;
      if (t >= 1) {
        const done = glide.done;
        glide = null;
        done();
      }
    }
    // Bolder ink outside the door, where the door fills the view; the desk's own weight once seated.
    pass.setInk(station === 'entrance' ? 2.6 : walk ? 2.6 + (1.5 - 2.6) * Math.min(1, walked / 0.6) : 1.5);
    pass.strength = focusNow.strength;
    pass.setFocus(focusNow.focus, focusNow.band);
    applyCamera();
    pass.render(scene, camera);
    if (labelsDirty) placeLabels();
    requestAnimationFrame(frame);
  }
  /**
   * Where the walk is at t (0 outside, 1 seated), on the timetable in WALK: the door swings open; the camera
   * steps to the threshold and pauses, its gaze drifting into the room; then walks across it at a person's
   * pace and lowers into the seat, ending exactly on the desk's own view, its focus pulling in as it sits.
   */
  function poseWalk(t: number, w: NonNullable<typeof walk>): void {
    const s = t * (WALK_MS / 1000);
    room.hinge.rotation.y = 1.85 * easeInOut(clamp01(s / WALK.swing));
    let roam = 0;
    if (s < WALK.pause[0]) {
      const a = smooth((s - WALK.step[0]) / (WALK.step[1] - WALK.step[0]));
      current.pos.copy(w.step.path.getPointAt(a));
      current.look.copy(w.step.gaze.getPoint(a));
    } else if (s < WALK.roam[0]) {
      // On the threshold, still, looking in.
      current.pos.copy(w.roam.path.getPointAt(0));
      current.look.lerpVectors(
        w.step.gaze.getPoint(1),
        w.roam.gaze.getPoint(0),
        smooth((s - WALK.pause[0]) / (WALK.pause[1] - WALK.pause[0])),
      );
    } else {
      roam = (s - WALK.roam[0]) / (WALK.roam[1] - WALK.roam[0]);
      const u = roamAt(roam);
      current.pos.copy(w.roam.path.getPointAt(u));
      current.look.copy(w.roam.gaze.getPoint(u));
    }
    current.fov = w.from.fov + (w.to.fov - w.from.fov) * smooth((roam - 0.35) / 0.65);
    const sit = smooth((roam - 0.7) / 0.3);
    const to = focusOf('door') ?? focusNow;
    focusNow = { strength: to.strength * sit, focus: to.focus, band: 0.5 + (to.band - 0.5) * sit, cut: 0 };
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
  const startLoops = async (): Promise<void> => {
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    const mp4 = video.canPlayType('video/mp4; codecs="avc1.640028"');
    const path = video.canPlayType('video/webm; codecs="vp9"') ? '/loops/atlas.webm' : mp4 ? '/loops/atlas.mp4' : '';
    if (!path) return;
    // Fetched whole, so it plays where the host ignores byte ranges (folder.ts, wholeMedia); without it the
    // screens keep their poster atlas.
    video.dataset.loop = path;
    const url = await wholeMedia(path).catch(() => null);
    if (!url) return;
    video.src = url;
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
  if ('requestIdleCallback' in window) window.requestIdleCallback(() => void startLoops(), { timeout: 2500 });
  else setTimeout(() => void startLoops(), 1200);

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
    [printout.group, 'source'],
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
    const hits = raycaster.intersectObjects([...deskObjects.map(([o]) => o), plate.group, card.group, mic.group], true);
    const first = hits[0];
    // A printed link on the card, if nothing stands in front of it.
    if (first?.object === card.faceMesh && first.uv) {
      const i = card.linkAt(first.uv.x, first.uv.y);
      if (i !== null) return `link:${i}`;
    }
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
    const link = action?.startsWith('link:') ? Number(action.slice(5)) : null;
    card.hover(link);
    api.hover(link === null ? action : null);
    canvas.style.cursor = action ? 'pointer' : '';
  });
  canvas.addEventListener('pointerleave', () => {
    api.hover(null);
    card.hover(null);
  });
  canvas.addEventListener('click', (event) => {
    const action = pick(event);
    // The printed link is the page's link: a click on it is a click on that.
    if (action?.startsWith('link:')) {
      cardLinks[Number(action.slice(5))]?.click();
      return;
    }
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
      const dive = ((from === 'door' && next !== 'door') || next === 'door') && from !== 'room' && next !== 'room';
      return new Promise((resolve) => {
        glide = {
          from: { pos: current.pos.clone(), look: current.look.clone(), fov: current.fov },
          to,
          fromFocus: { ...focusNow },
          toFocus: focusOf(next) ?? focusNow,
          start: performance.now(),
          ms: dive ? 1700 : 1300,
          done: resolve,
          straight: from === 'room' || next === 'room',
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
      next.scale.copy(note.scale);
      scene.remove(note);
      scene.add(next);
      creditSlip(next, creditText);
      note = next;
      solids = null;
    },
    walkIn() {
      if (station !== 'entrance' || walk) return Promise.resolve();
      const from = viewOf('entrance', aspectNow());
      const to = viewOf('door', aspectNow());
      if (reduced) {
        this.cutIn();
        return Promise.resolve();
      }
      // Through the doorway at standing height to the threshold; then across the room, a glance left at the
      // shelf of sources and right at the whiteboard, and down into the seat. The last point is the desk's
      // own camera, so sitting down lands on its frame.
      const stand = FLOOR + 1.62 * M;
      const threshold = v3(0, stand, OFFICE.z1 - 0.2 * M);
      const intoRoom = v3(0, FLOOR + 1.25 * M, OFFICE.z0);
      const step = {
        path: new CatmullRomCurve3([from.pos.clone(), v3(0, stand, OFFICE.z1 + 1.1 * M), threshold]),
        gaze: new CatmullRomCurve3([from.look.clone(), v3(0, FLOOR + 1.3 * M, OFFICE.z1 - 2.2 * M), intoRoom]),
      };
      // The gaze is read by parameter (each point a quarter of the way), so LOOK_AT marks where it is on
      // the shelf and the whiteboard, and the pace slows there.
      const roam = {
        path: new CatmullRomCurve3([
          threshold.clone(),
          v3(-0.45 * M, stand, OFFICE.z1 - 2.0 * M),
          v3(0.3 * M, stand - 0.04 * M, to.pos.z + 1.1 * M),
          to.pos.clone(),
        ]),
        gaze: new CatmullRomCurve3([
          v3(-0.35 * M, FLOOR + 1.22 * M, OFFICE.z0),
          v3(-1.8 * M, FLOOR + 1.3 * M, OFFICE.z0),
          v3(1.8 * M, FLOOR + 1.45 * M, OFFICE.z0),
          v3(0, FLOOR + 0.95 * M, 0.4 * M),
          to.look.clone(),
        ]),
      };
      return new Promise((resolve) => {
        walk = { start: performance.now(), done: resolve, step, roam, from, to };
        setRunning(true);
      });
    },
    hoverDoor(on) {
      room.brighten(on && station === 'entrance');
    },
    knock() {
      if (station !== 'entrance' || reduced) return;
      knockedAt = performance.now();
      knocks++;
      setRunning(true);
    },
    doorRect() {
      if (station !== 'entrance') return null;
      const r = renderer.domElement.getBoundingClientRect();
      const b = new Box3().setFromObject(room.hinge);
      const xs: number[] = [];
      const ys: number[] = [];
      for (const x of [b.min.x, b.max.x])
        for (const y of [b.min.y, b.max.y])
          for (const z of [b.min.z, b.max.z]) {
            projected.set(x, y, z).project(camera);
            xs.push(r.left + (projected.x * 0.5 + 0.5) * r.width);
            ys.push(r.top + (-projected.y * 0.5 + 0.5) * r.height);
          }
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
    },
    hitsDoor(x, y) {
      if (station !== 'entrance') return false;
      const r = renderer.domElement.getBoundingClientRect();
      pickNdc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      pickRay.setFromCamera(pickNdc, camera);
      return pickRay.intersectObject(room.hinge, true).length > 0;
    },
    cutIn() {
      const pending = walk?.done;
      walk = null;
      walked = 1;
      room.hinge.rotation.y = 1.85;
      station = 'door';
      target = viewOf('door', aspectNow());
      current.pos.copy(target.pos);
      current.look.copy(target.look);
      current.fov = target.fov;
      focusNow = { ...(focusOf('door') ?? focusNow) };
      labelsDirty = true;
      pending?.();
    },
    turnTo(round) {
      notebook.turnTo(round, reduced);
      const beat = crew.replay.beats.find((b) => b.kind === 'briefed' && b.brief === round);
      if (beat) crew.s = Math.max(0, beat.scene - 0.5);
      document.documentElement.dataset.round = round;
    },
    setMix(mix) {
      mixNow = mix ? { wind: mix.wind, solar: mix.solar } : null;
      showWindow();
    },
    pickBook(x, y) {
      if (station !== 'room' || glide) return null;
      const r = renderer.domElement.getBoundingClientRect();
      pickNdc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      pickRay.setFromCamera(pickNdc, camera);
      const hit = pickRay.intersectObjects(furniture.books as Mesh[], false)[0];
      return hit ? (hit.object.userData.source as number) : null;
    },
    onAir(on) {
      mic.onAir(on);
    },
    micHead() {
      const at = mic.group.localToWorld(v3(0, 8.6, 0)).project(camera);
      if (at.z >= 1) return null;
      const r = renderer.domElement.getBoundingClientRect();
      return { x: r.left + (at.x * 0.5 + 0.5) * r.width, y: r.top + (-at.y * 0.5 + 0.5) * r.height };
    },
    objectRects() {
      const r = renderer.domElement.getBoundingClientRect();
      const bounds = new Box3();
      const things: Array<[string, Object3D | Vector3[]]> = [
        ['nameplate', plate.group],
        ['card', card.group],
        ['mic', mic.group],
        ['source printout', printout.group],
        ['index box', box.group],
        ['notebook', notebook.group],
        ['keyboard', keyboard.group],
        ['cup', cup],
        ['stamp', stamp],
        ['sticky note', note],
        ['pencil', pen],
        // The model by its base and walls (it holds a hidden paper sheet larger than itself).
        ['office', modelCorners],
      ];
      return things.map(([name, o]) => {
        // Each visible part's own box, projected, so the rect hugs the thing rather than its whole box.
        const xs: number[] = [];
        const ys: number[] = [];
        const take = (b: Box3) => {
          for (const x of [b.min.x, b.max.x])
            for (const y of [b.min.y, b.max.y])
              for (const z of [b.min.z, b.max.z]) {
                projected.set(x, y, z).project(camera);
                xs.push(r.left + (projected.x * 0.5 + 0.5) * r.width);
                ys.push(r.top + (-projected.y * 0.5 + 0.5) * r.height);
              }
        };
        if (Array.isArray(o)) take(bounds.setFromPoints(o));
        else
          o.traverseVisible((part) => {
            const mesh = part as Mesh;
            if (!mesh.isMesh) return;
            mesh.geometry.computeBoundingBox();
            if (mesh.geometry.boundingBox) take(bounds.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld));
          });
        return {
          name,
          x: Math.min(...xs),
          y: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
        };
      });
    },
    press(key) {
      if (keyboard.press(key)) presses++;
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
      walked: () => walked,
      doorAngle: () => room.hinge.rotation.y,
      knocks: () => knocks,
      windowState: () => furniture.state(),
      /** For each spot a desk's name tag may take in the office: whether it is in sight, and if not, what is in the way. */
      tagSight: (piece: string) =>
        isPieceId(piece)
          ? tagSpots(piece).map((spot) => {
              const p = spot.clone().setY(spot.y + 0.15);
              const dir = p.clone().sub(camera.position);
              const dist = dir.length();
              sightRay.set(camera.position, dir.normalize());
              sightRay.near = camera.near;
              sightRay.far = dist - Math.max(0.05, dist * 0.02);
              const hit = sightRay.intersectObjects(solid(), false).find((h) => seen(h.object));
              if (!hit) return null;
              const chain: string[] = [];
              for (let n: Object3D | null = hit.object; n && chain.length < 4; n = n.parent) chain.push(n.name || n.type);
              return `${chain.join(' < ')} at ${hit.distance.toFixed(2)} of ${dist.toFixed(2)}`;
            })
          : null,
      /** Each of the desk's things, measured in the world: its widest side across the desk and its height, in cm. */
      sizes: () => {
        const cm = (o: Object3D) => {
          // Measured square on: its turn on the desk taken off for the measure, then put back.
          const turn = o.rotation.y;
          o.rotation.y = 0;
          o.updateMatrixWorld(true);
          const size = new Box3().setFromObject(o).getSize(new Vector3());
          o.rotation.y = turn;
          o.updateMatrixWorld(true);
          return { across: Math.round((Math.max(size.x, size.z) / M) * 1000) / 10, tall: Math.round((size.y / M) * 1000) / 10 };
        };
        return {
          keyboard: cm(keyboard.group),
          notebook: cm(notebook.group),
          card: cm(card.group),
          nameplate: cm(plate.group),
          cup: cm(cup),
          // The note itself, not the credit slip stuck under it.
          sticky: { across: Math.round((((note.geometry as PlaneGeometry).parameters.width * note.scale.x) / M) * 1000) / 10, tall: 0 },
          mic: cm(mic.group),
          box: cm(box.group),
          // The printout, by its sheet (the clip and tag aside).
          source: { across: Math.round(((PRINTOUT.depth * printout.group.scale.x) / M) * 1000) / 10, tall: 0 },
          monitor: cm(monitor.group),
          model: { across: Math.round(((BASE.x1 - BASE.x0) / M) * 1000) / 10, tall: 0 },
        };
      },
      /** Which of the desk's things stand on each other's ground (their footprints overlapping on the desk). */
      deskOverlaps: () => {
        const things: Array<[string, Object3D]> = [
          ['index box', box.group],
          ['notebook', notebook.group],
          ['keyboard', keyboard.group],
          ['stamp', stamp],
          ['cup', cup],
          ['pencil', pen],
          ['sticky note', note],
          ['nameplate', plate.group],
          ['card', card.group],
          ['mic', mic.group],
          ['model', model.group],
          ['monitor', monitor.group],
        ];
        const boxes = things.map(([name, o]) => [name, new Box3().setFromObject(o)] as const);
        const out: string[] = [];
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++) {
            const [an, a] = boxes[i] ?? ['', new Box3()];
            const [bn, b] = boxes[j] ?? ['', new Box3()];
            const x = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
            const z = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
            if (x > 0.2 && z > 0.2) out.push(`${an} × ${bn} (${x.toFixed(1)} × ${z.toFixed(1)})`);
          }
        return out;
      },
      /** The ultrawide moved on the desk (for finding its place). */
      moveMonitor: (x: number, z: number, tilt = 0) => {
        monitor.group.position.set(x, DESK_Y, z);
        monitor.head.rotation.x = -tilt;
        solids = null;
        labelsDirty = true;
      },
      /** The ultrawide's session: how often it has been drawn, and its lines now. */
      monitor: () => {
        const r = stage.getBoundingClientRect();
        const page = (p: Vector3) => {
          projected.copy(p).project(camera);
          return { x: r.left + (projected.x * 0.5 + 0.5) * r.width, y: r.top + (-projected.y * 0.5 + 0.5) * r.height, z: projected.z };
        };
        const { corners, row, bottomCentre } = monitor.screenCorners();
        const at = corners.map(page);
        const [a, b] = row.map(page);
        return {
          draws: monitor.draws,
          lines: monitor.lines(),
          // On the page: the screen's bottom edge and its top edge, and how tall one session row is.
          bottom: page(bottomCentre).y,
          top: Math.min(at[2]?.y ?? 0, at[3]?.y ?? 0),
          row: a && b ? Math.abs(a.y - b.y) : 0,
          // The whole screen in the frame and in sight: its four corners on the page, none behind a wall or the door.
          whole:
            at.every((c) => c.z < 1 && c.x >= r.left && c.x <= r.right && c.y >= r.top && c.y <= r.bottom) &&
            corners.every((c) => !hidden(c, monitor.group)),
        };
      },
      /**
       * The printed faces on screen, in page pixels: the nameplate, the card (with its links' boxes and which
       * is ringed) and the credit slip.
       */
      printed: () => {
        const r = stage.getBoundingClientRect();
        const onPage = (mesh: Mesh) => {
          mesh.updateMatrixWorld(true);
          const geometry = mesh.geometry as PlaneGeometry;
          const { width: w, height: h } = geometry.parameters;
          const xs: number[] = [];
          const ys: number[] = [];
          for (const [x, y] of [
            [-w / 2, -h / 2],
            [w / 2, -h / 2],
            [w / 2, h / 2],
            [-w / 2, h / 2],
          ] as const) {
            projected.set(x, y, 0).applyMatrix4(mesh.matrixWorld).project(camera);
            xs.push(r.left + (projected.x * 0.5 + 0.5) * r.width);
            ys.push(r.top + (-projected.y * 0.5 + 0.5) * r.height);
          }
          return {
            x: Math.min(...xs),
            y: Math.min(...ys),
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys),
          };
        };
        const cardRect = onPage(card.faceMesh);
        return {
          nameplate: { ...onPage(plate.faceMesh), ringed: plate.ringed() },
          card: {
            ...cardRect,
            ringed: card.focused(),
            // The intro's type as it lands on screen, in pixels.
            introPx: (cardRect.width * card.introPx) / 1300,
            // Each link's middle, on the page (the card lies nearly square to the camera).
            links: card.links.map((b) => ({
              x: cardRect.x + (b.x + b.w / 2) * cardRect.width,
              y: cardRect.y + (b.y + b.h / 2) * cardRect.height,
            })),
          },
          credit: onPage(creditOf(note)),
          source: onPage(printout.sheetMesh),
          door: (() => {
            const xs: number[] = [];
            const ys: number[] = [];
            for (const c of room.plateFace()) {
              projected.copy(c).project(camera);
              xs.push(r.left + (projected.x * 0.5 + 0.5) * r.width);
              ys.push(r.top + (-projected.y * 0.5 + 0.5) * r.height);
            }
            return {
              x: Math.min(...xs),
              y: Math.min(...ys),
              width: Math.max(...xs) - Math.min(...xs),
              height: Math.max(...ys) - Math.min(...ys),
            };
          })(),
        };
      },
      /** How much of each printed face is in sight from the camera (sight lines to a 7 × 4 grid on it). */
      printedInSight: () => {
        const share = (mesh: Mesh) => {
          mesh.updateMatrixWorld(true);
          const { width: w, height: h } = (mesh.geometry as PlaneGeometry).parameters;
          let seenPoints = 0;
          for (let i = 0; i < 7; i++)
            for (let j = 0; j < 4; j++) {
              const point = v3((i / 6 - 0.5) * w * 0.96, (j / 3 - 0.5) * h * 0.92, 0).applyMatrix4(mesh.matrixWorld);
              if (!hidden(point, mesh.parent)) seenPoints++;
            }
          return seenPoints / 28;
        };
        return {
          nameplate: share(plate.faceMesh),
          card: share(card.faceMesh),
          credit: share(creditOf(note)),
          source: share(printout.sheetMesh),
        };
      },
      /** A plain green board stood between the camera and the nameplate (true), or taken away (false). */
      blockNameplate: (on: boolean) => {
        if (!on) {
          if (blocker) scene.remove(blocker);
          blocker = null;
          return;
        }
        plate.faceMesh.updateMatrixWorld(true);
        const face = plate.faceMesh.getWorldPosition(new Vector3());
        const at = face.clone().lerp(camera.position, 0.3);
        blocker = new Mesh(new PlaneGeometry(11, 7), new MeshBasicMaterial({ color: '#2fbf71' }));
        blocker.userData.noEdge = true;
        blocker.position.copy(at);
        blocker.lookAt(camera.position);
        scene.add(blocker);
      },
      /** The camera now: where it is, in desk units. */
      cameraAt: () => current.pos.toArray(),
      /** Where a book's spine is on screen, looking round the room (for the checks). */
      bookAt: (i: number) => {
        const book = furniture.books[i];
        if (!book) return null;
        const r = renderer.domElement.getBoundingClientRect();
        // The middle of its spine: the front face of its box.
        const b = new Box3().setFromObject(book);
        projected.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, b.max.z).project(camera);
        return { x: r.left + (projected.x * 0.5 + 0.5) * r.width, y: r.top + (-projected.y * 0.5 + 0.5) * r.height };
      },
      /** A still camera anywhere, for close-up shots (the window's turbines). */
      pose: (px: number, py: number, pz: number, lx: number, ly: number, lz: number, fov: number) => {
        current.pos.set(px, py, pz);
        current.look.set(lx, ly, lz);
        current.fov = fov;
        labelsDirty = true;
      },
      /** A point in the room on screen, in page pixels (for measuring what a view takes in). */
      project: (x: number, y: number, z: number) => {
        const r = renderer.domElement.getBoundingClientRect();
        projected.set(x, y, z).project(camera);
        return {
          x: r.left + (projected.x * 0.5 + 0.5) * r.width,
          y: r.top + (-projected.y * 0.5 + 0.5) * r.height,
          behind: projected.z > 1,
        };
      },
      /** Everything in the scene graph, and anything that is a stand-in rather than the real thing. */
      sceneSummary: () => {
        let meshes = 0;
        let placeholders = 0;
        scene.traverse((o) => {
          if (!(o as Mesh).isMesh) return;
          meshes++;
          if (o.userData.placeholder || /\b(?:placeholder|proxy|stand-?in)\b/i.test(o.name)) placeholders++;
        });
        const real = {
          box: box.group,
          notebook: notebook.group,
          keyboard: keyboard.group,
          stamp,
          cup,
          nameplate: plate.group,
          card: card.group,
          mic: mic.group,
          note,
        };
        return {
          meshes,
          placeholders,
          desk: Object.fromEntries(Object.entries(real).map(([k, o]) => [k, o.parent === scene])),
          model: model.group.parent === scene,
        };
      },
      replayTime: () => crew.s,
      strength: () => pass.strength,
      keysDown: () => keyboard.down,
      presses: () => presses,
      onAir: () => mic.lit,
      monitorRects: () => {
        const w = stage.clientWidth;
        const h = stage.clientHeight;
        const r = stage.getBoundingClientRect();
        return monitorBoxes(w, h).map((m) => ({ x: r.left + m.x0, y: r.top + m.y0, width: m.x1 - m.x0, height: m.y1 - m.y0 }));
      },
      /** The camera's angle above the floor and around the room, in degrees, where it is now. */
      cameraAngle: () => {
        const d = offset.subVectors(current.pos, current.look).normalize();
        return { elevation: (Math.asin(d.y) * 180) / Math.PI, azimuth: (Math.atan2(d.x, d.z) * 180) / Math.PI };
      },
      /** In a card view: the builder's screen and the builder standing beside it, on screen. */
      deskShot: () => {
        if (!station.startsWith('desk:')) return null;
        const d = deskFor(station.slice(5) as PieceId);
        const w = stage.clientWidth;
        const h = stage.clientHeight;
        const r = stage.getBoundingClientRect();
        const page = (b: Rect) => ({ x: r.left + b.x0, y: r.top + b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 });
        const [sx, sy, sz] = d.screen;
        const [bx, bz] = standAt(d);
        return {
          screen: page(
            boxRect(v3(sx - SCREEN.width / 2, sy - SCREEN.height / 2, sz), v3(sx + SCREEN.width / 2, sy + SCREEN.height / 2, sz), w, h),
          ),
          builder: page(boxRect(v3(bx - 0.22, 0.1, bz - 0.15), v3(bx + 0.22, 1.5, bz + 0.15), w, h)),
          // How square the camera is to the screen: the angle between where it looks and the screen's normal.
          facing: (Math.acos(Math.min(1, Math.max(-1, -camera.getWorldDirection(new Vector3()).z))) * 180) / Math.PI,
        };
      },
      /** The nameplate's and the card's faces on screen, in page pixels, for checking the text laid onto them. */
      faces: () => {
        const r = stage.getBoundingClientRect();
        const box = (pts: Vector3[]) => {
          const xs: number[] = [];
          const ys: number[] = [];
          for (const p of pts) {
            projected.copy(p).project(camera);
            xs.push(r.left + (projected.x * 0.5 + 0.5) * stage.clientWidth);
            ys.push(r.top + (-projected.y * 0.5 + 0.5) * stage.clientHeight);
          }
          return {
            x: Math.min(...xs),
            y: Math.min(...ys),
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys),
          };
        };
        return { nameplate: box(plate.face()), card: box(card.face()) };
      },
      /** The painted zone names' boxes on screen, so a check can see nothing covers them. */
      zoneRects: () => {
        const r = stage.getBoundingClientRect();
        return ZONES.map((z) => {
          const b = boxRect(
            v3(z.x - z.width / 2, 0, z.z - z.width * 0.11),
            v3(z.x + z.width / 2, 0, z.z + z.width * 0.11),
            stage.clientWidth,
            stage.clientHeight,
          );
          return { text: z.text, x: r.left + b.x0, y: r.top + b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 };
        });
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
