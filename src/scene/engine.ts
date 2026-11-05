// The room, rendered: an architect's study model on a sheet of paper. Renderer and camera, the lamp
// and the cabinet's key light (both following the grid), the cabinet, the grid sign printed in the
// scene, the radio, the crew, the tags placed over what they name, and pointer picking. What happens
// when something is chosen is the controller's business (room/main.ts).

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
import { drawerOf } from '../content/drawers';
import { isPieceId, PIECES, type PieceId } from '../content/pieces';
import { NEUTRAL_LIGHT, type RoomLight, type SignText, signFor } from '../room/grid';
import type { Timeline } from '../timeline/schema';
import { Cabinet } from './cabinet';
import { Crew } from './crew';
import { BOARD, BRIEF, CABINET, DESK, DESKS, deskFor, KEY, LAMP, RADIO, RECEPTION, REVIEW, ROOM, SCREEN, SHELF, SIGN } from './layout';
import { BOUNCE, PALETTE } from './light';
import { atlasRect, buildModel } from './model';
import { applyStyle, type StyleHandle, skipBox, styleFromUrl } from './style';

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
  setSign(text: SignText): void;
  monitorRect(piece: PieceId): DOMRect;
  /** The monitor's corners on screen (top-left, top-right, bottom-right, bottom-left), in page pixels. */
  monitorQuad(piece: PieceId): [[number, number], [number, number], [number, number], [number, number]];
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
const TAN = Math.tan(((FOV / 2) * Math.PI) / 180);
/**
 * The view from the door: low and a little to the right of the doorway, as you would look into a
 * model on a table, so the cabinet is near and large in the left third and the room runs back.
 */
const STYLE = styleFromUrl();
const DOOR = { fov: 40, elevation: 17, azimuth: 5, target: new Vector3(0.5, 0.8, -0.4) };

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
  renderer.setClearColor(PALETTE.surround);
  stage.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  await Promise.all(
    ['600 22px "IBM Plex Sans Condensed"', '500 22px "IBM Plex Sans Condensed"', '600 22px "IBM Plex Mono"'].map((f) =>
      document.fonts.load(f).catch(() => undefined),
    ),
  );
  const [floor, ground, poster] = await Promise.all([
    loadTexture('/bake/floor.webp'),
    loadTexture('/bake/ground.webp'),
    loadTexture('/loops/atlas.webp'),
  ]);
  if (!floor || !ground) throw new Error('the baked lighting did not load');

  const scene = new Scene();
  scene.background = new Color(PALETTE.surround);
  // A style frame may swap the box desks and chairs for models of them.
  const model = buildModel(
    floor,
    ground,
    poster ?? colourAtlas(),
    // A style direction draws some of the room its own way: the cabinet's carcass live, its own desks.
    STYLE ? (b) => skipBox(STYLE, b) : undefined,
  );
  scene.add(model.group);
  const cabinet = STYLE ? new Cabinet(0, true) : new Cabinet();
  scene.add(cabinet.group);

  // The lamps, live for everything that is not baked, matched to the bake's units: the work lamp over
  // the model and the soft key light on the cabinet. The grid tints both, and the baked floor with them.
  const spotOf = (def: typeof LAMP | typeof KEY, strength: number) => {
    const from = new Vector3(...def.position);
    const aim = new Vector3(...def.target);
    const to = aim.clone().sub(from);
    const intensity = ((Math.PI * to.lengthSq()) / -to.clone().normalize().y) * strength;
    const light = new SpotLight(PALETTE.lamp, intensity, 0, def.cone + def.edge, (def.edge / (def.cone + def.edge)) * 2, 2);
    light.position.copy(from);
    light.target.position.copy(aim);
    scene.add(light, light.target);
    return { light, intensity };
  };
  const lamps = [spotOf(LAMP, 1), spotOf(KEY, KEY.strength)];
  const fill = new HemisphereLight(PALETTE.lamp, PALETTE.paper, BOUNCE * Math.PI);
  let baseFillOverride: number | null = null;
  const baseFill = () => baseFillOverride ?? BOUNCE * Math.PI;
  scene.add(fill);
  const lampColour = new Color(PALETTE.lamp);
  let light = { ...NEUTRAL_LIGHT, colour: [...NEUTRAL_LIGHT.colour] as [number, number, number] };
  let lightTarget: RoomLight = NEUTRAL_LIGHT;
  /** A style frame's own colour for the baked floor and paper, under the grid's tint. */
  const baseTint = [new Color(1, 1, 1), new Color(1, 1, 1)] as const;
  const applyLight = () => {
    const [r, g, b] = light.colour;
    const [nr, ng, nb] = NEUTRAL_LIGHT.colour;
    const tint = new Color(r / nr, g / ng, b / nb).multiplyScalar(light.level / NEUTRAL_LIGHT.level);
    for (const { light: l, intensity } of lamps) {
      l.color.copy(lampColour).multiply(tint);
      l.intensity = intensity;
    }
    fill.color.copy(lampColour).multiply(tint);
    fill.intensity = baseFill();
    for (const [i, m] of model.baked.entries()) m.color.copy(tint).multiply(baseTint[i] ?? baseTint[0]);
  };

  // The radio on its shelf: a grille, and a small lamp that is green while it plays.
  const radioFront = ROOM.z0 + 0.04 + RADIO.depth;
  const radioLamp = new Mesh(new CircleGeometry(0.025, 16), new MeshBasicMaterial({ color: '#4a4740', toneMapped: false }));
  radioLamp.position.set(RADIO.x + RADIO.width / 2 - 0.07, SHELF.y + RADIO.height - 0.07, radioFront + 0.003);
  const grille = new Mesh(new CircleGeometry(0.1, 24), new MeshBasicMaterial({ color: '#4a4136' }));
  grille.position.set(RADIO.x - 0.09, SHELF.y + RADIO.height / 2, radioFront + 0.002);
  scene.add(radioLamp, grille);

  // The grid sign, printed: the reading set in Plex on the board on the back wall.
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 1024;
  signCanvas.height = Math.round((1024 * SIGN.height) / SIGN.width);
  const signTexture = new CanvasTexture(signCanvas);
  signTexture.colorSpace = SRGBColorSpace;
  signTexture.anisotropy = 8;
  const signFace = new Mesh(
    new PlaneGeometry(SIGN.width - 0.05, SIGN.height - 0.05),
    new MeshBasicMaterial({ map: signTexture, toneMapped: false }),
  );
  signFace.position.set(SIGN.x, SIGN.y, ROOM.z0 + 0.027);
  scene.add(signFace);
  const drawSign = (text: SignText) => {
    const ctx = signCanvas.getContext('2d');
    if (!ctx) return;
    const w = signCanvas.width;
    const h = signCanvas.height;
    const fitText = (str: string, font: (px: number) => string, px: number, max: number) => {
      let size = px;
      ctx.font = font(size);
      while (size > 12 && ctx.measureText(str).width > max) ctx.font = font(--size);
      return size;
    };
    ctx.fillStyle = '#f7f4ee';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1d5a44';
    ctx.fillRect(0, 0, w, 96);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 60px "IBM Plex Sans Condensed", "Arial Narrow", sans-serif';
    ctx.fillText('The grid, now', 44, 70);
    ctx.fillStyle = '#1e2225';
    if (text.state === 'live') {
      const [value = '', band = ''] = text.headline.split(', ');
      const number = value.replace(' gCO₂/kWh', '');
      const size = fitText(number, (px) => `600 ${px}px "IBM Plex Mono", ui-monospace, monospace`, 190, w * 0.48);
      ctx.fillText(number, 44, 96 + 40 + size * 0.78);
      const numberWidth = ctx.measureText(number).width;
      ctx.font = '500 58px "IBM Plex Sans Condensed", "Arial Narrow", sans-serif';
      ctx.fillText('gCO₂/kWh', 44 + numberWidth + 24, 96 + 40 + size * 0.42);
      ctx.font = '600 58px "IBM Plex Sans Condensed", "Arial Narrow", sans-serif';
      ctx.fillText(band, 44 + numberWidth + 24, 96 + 40 + size * 0.78);
    } else {
      fitText(text.headline, (px) => `600 ${px}px "IBM Plex Sans Condensed", "Arial Narrow", sans-serif`, 104, w - 88);
      ctx.fillText(text.headline, 44, 96 + 150);
    }
    ctx.fillStyle = '#464c51';
    fitText(text.detail, (px) => `500 ${px}px "IBM Plex Sans Condensed", "Arial Narrow", sans-serif`, 42, w - 88);
    ctx.fillText(text.detail, 44, h - 92);
    ctx.fillStyle = '#62686d';
    fitText(`Source: ${text.source}`, (px) => `500 ${px}px "IBM Plex Sans Condensed", "Arial Narrow", sans-serif`, 36, w - 88);
    ctx.fillText(`Source: ${text.source}`, 44, h - 38);
    signTexture.needsUpdate = true;
  };
  // Until the first reading arrives (and in stills, which never wait for one).
  drawSign(signFor(null));

  // Labels: real links and buttons placed over what they name.
  const labelEls = [...labels.querySelectorAll<HTMLElement>('[data-target]')];
  // With reduced motion nothing travels: the replay holds at its end, each desk showing its state.
  const crew = new Crew({ scene, model, timeline, startAt });
  if (reduced) crew.s = Math.max(0, crew.replay.duration - 0.01);
  // A style frame brings its own people, props, palette and line.
  let look: StyleHandle | null = null;
  // Stills only (?close=desk:<tool> or ?close=cabinet): a close view of a desk at work, or the cabinet
  // with a drawer out, for the style directions.
  const close = new URLSearchParams(location.search).get('close') ?? '';
  if (STYLE) {
    look = await applyStyle(STYLE, {
      scene,
      model,
      renderer,
      lamps,
      fill,
      cabinet,
      signFace,
      replay: crew.replay,
      now: () => crew.s,
      setBaseTint: (ground, floor) => {
        baseTint[0].copy(ground);
        baseTint[1].copy(floor);
      },
      crew,
      close: close.startsWith('desk') ? 'desk' : close === 'cabinet' ? 'cabinet' : null,
    });
    lampColour.copy(lamps[0]?.light.color ?? lampColour);
    baseFillOverride = fill.intensity;
  }

  const camera = new PerspectiveCamera(FOV, 1, 0.1, 200);
  // What the view from the door must hold: the back wall's top corners, the cabinet and Reception
  // whole, and every desk. The room's front corners may fall outside: the front wall is low and bare.
  const keep: Vector3[] = [
    new Vector3(SIGN.x - SIGN.width / 2 - 0.2, SIGN.y + SIGN.height / 2 + 0.15, ROOM.z0),
    new Vector3(BOARD.x + BOARD.width / 2 + 0.2, BOARD.bottom + BOARD.height + 0.15, ROOM.z0),
    new Vector3(CABINET.x - CABINET.width / 2 - 0.15, 0, CABINET.z + CABINET.depth / 2 + 0.25),
    new Vector3(CABINET.x - CABINET.width / 2 - 0.15, CABINET.height + 0.25, CABINET.z - CABINET.depth / 2),
    new Vector3(RECEPTION.x + RECEPTION.width / 2 + 0.15, 0, RECEPTION.z + RECEPTION.depth / 2 + 0.2),
    ...DESKS.flatMap((d) => [new Vector3(d.x - 0.3, DESK.height, d.z), new Vector3(d.x + 0.3, DESK.height, d.z)]),
  ];

  function doorView(aspect: number): View {
    if (look) return look.views.door(aspect);
    const el = (DOOR.elevation * Math.PI) / 180;
    const az = (DOOR.azimuth * Math.PI) / 180;
    const dir = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    camera.aspect = aspect;
    camera.fov = DOOR.fov;
    camera.updateProjectionMatrix();
    let lo = 4;
    let hi = 120;
    const p = new Vector3();
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      camera.position.copy(DOOR.target).addScaledVector(dir, mid);
      camera.lookAt(DOOR.target);
      camera.updateMatrixWorld();
      const fits = keep.every((c) => {
        p.copy(c).project(camera);
        // Clear of the room's own controls: the caption below and a margin above.
        return Math.abs(p.x) <= 0.97 && p.y <= 0.9 && p.y >= -0.72;
      });
      if (fits) hi = mid;
      else lo = mid;
    }
    // The next frame puts back the lens of wherever the camera is (applyCamera).
    return { pos: DOOR.target.clone().addScaledVector(dir, hi), look: DOOR.target.clone(), fov: DOOR.fov };
  }
  const fitDistance = (height: number) => height / 2 / TAN;
  function viewOf(s: Station): View {
    if (s === 'door') return door;
    if (s === 'cabinet') {
      const d = fitDistance(CABINET.height + 0.5);
      return {
        pos: cabinet.world(new Vector3(CABINET.x + 0.45, 1.05 + d * 0.42, CABINET.z + d * 0.9)),
        look: cabinet.world(new Vector3(CABINET.x + 0.15, 0.72, CABINET.z + 0.35)),
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
    // High enough to look over the seated builder's head (1.39 m) at the whole screen.
    const d = 2.3;
    const rise = 0.92;
    const range = Math.hypot(d, rise);
    const tanHalf = (SCREEN.width * h) / (2 * range * px);
    const ndc = free / w - 1;
    const dx = -ndc * range * tanHalf * (w / h);
    const look = screen.clone().add(new Vector3(dx, 0, 0));
    return { pos: new Vector3(look.x, screen.y + rise, screen.z + d), look, fov: (2 * Math.atan(tanHalf) * 180) / Math.PI };
  }

  let door = doorView(1);
  let station: Station = 'door';
  const closeView = (aspect: number): View | null =>
    look && close ? (close === 'cabinet' ? look.views.cabinet(aspect) : look.views.desk(aspect)) : null;
  if (close === 'cabinet') cabinet.open('grid');
  const current = { pos: door.pos.clone(), look: door.look.clone(), fov: DOOR.fov };
  let glide: { from: View; to: View; start: number; ms: number; done: () => void } | null = null;
  let labelsDirty = true;

  function resize(): void {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    const buffer = renderer.getDrawingBufferSize(new Vector2());
    look?.resize?.(buffer.x, buffer.y);
    door = doorView(w / h);
    if (!glide) {
      const v = closeView(w / h) ?? viewOf(station);
      current.pos.copy(v.pos);
      current.look.copy(v.look);
      current.fov = v.fov;
    }
    labelsDirty = true;
  }
  new ResizeObserver(resize).observe(stage);

  // Where each tag sits: printed on the counter's front, the floor before the cabinet, a table's edge,
  // the wall under the board or above the sign; never at monitor height. Desks choose their own spot.
  const anchorOf = (target: string): Vector3 | null => {
    const [kind] = target.split(':');
    if (kind === 'cabinet') return cabinet.world(new Vector3(CABINET.x, 0, CABINET.z + CABINET.depth / 2 + 0.1));
    if (kind === 'reception') return new Vector3(RECEPTION.x, RECEPTION.height - 0.06, RECEPTION.z + RECEPTION.depth / 2 + 0.035);
    // On the wall just above the sign, clear of the monitors below it.
    if (kind === 'credit') return new Vector3(SIGN.x, SIGN.y + SIGN.height / 2 + 0.03, ROOM.z0 + 0.03);
    if (kind === 'brief') return new Vector3(BRIEF.table.x, BRIEF.table.height, BRIEF.table.z + BRIEF.table.depth / 2 + 0.005);
    if (kind === 'reviewer') return new Vector3(REVIEW.table.x, REVIEW.table.height, REVIEW.table.z + REVIEW.table.depth / 2 + 0.005);
    if (kind === 'board') return new Vector3(BOARD.x, BOARD.bottom - 0.03, BOARD.z + 0.02);
    return cabinet.anchor(target);
  };
  /** The corners of what a covering button lies over: a drawer's front, the sign, the radio. */
  const coverOf = (target: string): Vector3[] => {
    if (target.startsWith('drawer:')) return cabinet.frontCorners(target.slice(7));
    const box = (x0: number, y0: number, x1: number, y1: number, z: number) => [
      new Vector3(x0, y0, z),
      new Vector3(x1, y0, z),
      new Vector3(x1, y1, z),
      new Vector3(x0, y1, z),
    ];
    if (target === 'sign')
      return box(SIGN.x - SIGN.width / 2, SIGN.y - SIGN.height / 2, SIGN.x + SIGN.width / 2, SIGN.y + SIGN.height / 2, ROOM.z0 + 0.03);
    if (target === 'radio') return box(RADIO.x - RADIO.width / 2, SHELF.y, RADIO.x + RADIO.width / 2, SHELF.y + RADIO.height, radioFront);
    return [];
  };
  const projected = new Vector3();
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
  /** Every monitor's box on the stage, so a desk's tag can keep clear of all of them. */
  function monitorBoxes(w: number, h: number): Array<{ x0: number; y0: number; x1: number; y1: number }> {
    return DESKS.map((d) => {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        projected
          .set(d.screen[0] + (dx * (SCREEN.width + 0.05)) / 2, d.screen[1] + (dy * (SCREEN.height + 0.05)) / 2, d.screen[2])
          .project(camera);
        xs.push((projected.x * 0.5 + 0.5) * w);
        ys.push((-projected.y * 0.5 + 0.5) * h);
      }
      return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    });
  }
  /**
   * Where a desk's tag may go, in order: its outer front corners reading outward, the middle of its
   * front edge, the floor before its chair. The first that covers no monitor wins.
   */
  function deskSpots(piece: PieceId): Array<{ at: Vector3; align: 'left' | 'right' | 'centre' }> {
    const d = deskFor(piece);
    const front = d.z + DESK.depth / 2 + 0.005;
    return [
      { at: new Vector3(d.x + DESK.width / 2 - 0.06, DESK.height, front), align: 'left' },
      { at: new Vector3(d.x - DESK.width / 2 + 0.06, DESK.height, front), align: 'right' },
      { at: new Vector3(d.x + 0.42, DESK.height, front), align: 'centre' },
      { at: new Vector3(d.x, 0, d.seat[1] + 0.32), align: 'centre' },
    ];
  }
  function placeLabels(): void {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    let monitors: ReturnType<typeof monitorBoxes> | null = null;
    for (const el of labelEls) {
      const target = el.dataset.target ?? '';
      const place = el.dataset.place ?? 'tag';
      const show = shownAt(el) && !glide;
      if (place === 'cover') {
        const corners = show ? coverOf(target).map((c) => c.project(camera)) : [];
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
      if (place === 'corner') {
        const piece = target.slice(5);
        if (!show || !isPieceId(piece)) {
          if (!el.hidden) el.hidden = true;
          continue;
        }
        monitors ??= monitorBoxes(w, h);
        const tw = el.offsetWidth || 90;
        const th = el.offsetHeight || 18;
        let chosen: { x: number; y: number; align: string } | null = null;
        for (const spot of deskSpots(piece)) {
          projected.copy(spot.at).project(camera);
          if (projected.z >= 1) continue;
          const x = (projected.x * 0.5 + 0.5) * w;
          const y = (-projected.y * 0.5 + 0.5) * h + 2;
          const x0 = spot.align === 'left' ? x : spot.align === 'right' ? x - tw : x - tw / 2;
          const clear = monitors.every((m) => x0 + tw < m.x0 - 2 || x0 > m.x1 + 2 || y + th < m.y0 - 2 || y > m.y1 + 2);
          chosen ??= { x: x0, y, align: spot.align };
          if (clear) {
            chosen = { x: x0, y, align: spot.align };
            break;
          }
        }
        if (el.hidden !== !chosen) el.hidden = !chosen;
        if (chosen) el.style.transform = `translate(${chosen.x.toFixed(1)}px, ${chosen.y.toFixed(1)}px)`;
        continue;
      }
      const a = show ? anchorOf(target) : null;
      if (a) projected.copy(a).project(camera);
      const onScreen = a !== null && projected.z < 1 && Math.abs(projected.x) < 1.02 && Math.abs(projected.y) < 1.02;
      if (el.hidden === onScreen) el.hidden = !onScreen;
      if (!onScreen) continue;
      const x = (projected.x * 0.5 + 0.5) * w;
      const y = (-projected.y * 0.5 + 0.5) * h;
      // A tag hangs from its anchor, its top edge on the edge it is printed on; a folder's name sits on its tab.
      const shift =
        place === 'centre' ? 'translate(-50%, -50%)' : place === 'over' ? 'translate(-50%, calc(-100% - 2px))' : 'translate(-50%, 2px)';
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) ${shift}`;
    }
    labelsDirty = false;
  }

  function applyCamera(): void {
    // Depth range follows the camera: a long lens stands far back, and a near plane of 0.1 m there
    // would leave too little depth precision for the sign's face and the screens.
    const reach = current.pos.distanceTo(current.look);
    const near = Math.max(0.1, reach * 0.5 - 10);
    const far = reach + 60;
    if (camera.fov !== current.fov || camera.near !== near || camera.far !== far) {
      camera.fov = current.fov;
      camera.near = near;
      camera.far = far;
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
    look?.update(dt, now / 1000);
    if (cabinet.update(dt, reduced)) labelsDirty = true;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 1.8);
    for (let i = 0; i < 3; i++) light.colour[i] = (light.colour[i] ?? 1) + ((lightTarget.colour[i] ?? 1) - (light.colour[i] ?? 1)) * k;
    light.level += (lightTarget.level - light.level) * k;
    applyLight();
    // At a desk the camera takes the builder's place, so that builder steps out of the picture.
    crew.away = station.startsWith('desk:') && !glide ? (station.slice(5) as PieceId) : null;
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
    if (look?.render) look.render(scene, camera);
    else renderer.render(scene, camera);
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
      target: 'reviewer',
      box: new Box3(
        new Vector3(REVIEW.table.x - REVIEW.table.width / 2, 0, REVIEW.table.z - REVIEW.table.depth / 2),
        new Vector3(REVIEW.table.x + REVIEW.table.width / 2, 1.8, REVIEW.reviewer[1] + 0.25),
      ),
      at: 'door',
    },
    {
      target: 'brief',
      box: new Box3(
        new Vector3(-1.4, 0, ROOM.z0),
        new Vector3(1.4, BRIEF.sheetY + BRIEF.sheetSize[1] / 2, BRIEF.table.z + BRIEF.table.depth / 2),
      ),
      at: 'door',
    },
    {
      target: 'board',
      box: new Box3(
        new Vector3(BOARD.x - BOARD.width / 2, BOARD.bottom, ROOM.z0),
        new Vector3(BOARD.x + BOARD.width / 2, BOARD.bottom + BOARD.height, ROOM.z0 + 0.1),
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
  /** What a click on the model opens; the brief, the reviewer and the board only name themselves. */
  const opens = (target: string | null) => target !== null && !['brief', 'reviewer', 'board'].includes(target);
  canvas.addEventListener('pointermove', (event) => {
    const target = pick(event);
    api.hover(target);
    canvas.style.cursor = opens(target) ? 'pointer' : '';
  });
  canvas.addEventListener('pointerleave', () => api.hover(null));
  canvas.addEventListener('click', (event) => {
    const target = pick(event);
    if (target && opens(target)) for (const fn of pickHandlers) fn(target);
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
      radioLamp.material.color.set(on ? '#5fd38a' : '#4a4740');
    },
    setSign(text) {
      drawSign(text);
      look?.sign?.(text);
    },
    monitorQuad(piece) {
      const d = deskFor(piece);
      const rect = renderer.domElement.getBoundingClientRect();
      const corner = (dx: number, dy: number): [number, number] => {
        projected.set(d.screen[0] + (dx * SCREEN.width) / 2, d.screen[1] + (dy * SCREEN.height) / 2, d.screen[2] + 0.013).project(camera);
        return [rect.left + (projected.x * 0.5 + 0.5) * rect.width, rect.top + (-projected.y * 0.5 + 0.5) * rect.height];
      };
      return [corner(-1, 1), corner(1, 1), corner(1, -1), corner(-1, -1)];
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
