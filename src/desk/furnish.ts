// Harry's office, furnished: what you pass walking in from the door, and see standing back from the desk.
// Every piece tied to the work where it can be:
//   - the window looks over a calm UK roofline, lit for the visitor's local time of day; wind turbines on
//     the horizon turn as fast as the grid's wind share says, and the solar panels on a roof glint when
//     its solar share is high (the same NESO data as the sticky note; still and neutral without it);
//   - a reference bookshelf, its spines the real sources the tools' READMEs cite, as plain titles;
//   - a whiteboard sketch of the lab: the ten tools round "the briefs", arrows to "review";
//   - the radio's place on the shelf, a rug under the desk, a desk lamp, a radiator under the window, a
//     print, a cable run. The scene adds the kit's CC0 models (the radio, a coat stand, plants).
// Units are the desk's: 125 to the metre. Nothing here casts a shadow; contact shading is painted.

import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { PIECES, type PieceId } from '../content/pieces';
import { BLUE, CORAL, CREAM, INK, OAK, PAPER, SLATE, SUN } from './palette';
import { FLOOR, M, ROOM } from './room';

export type Daylight = 'morning' | 'day' | 'evening' | 'night';

/**
 * What the grid outside the window does: the turbines turn faster the more of the grid's power is wind
 * (from a slow turn to full pace at 60% and over), and the panels glint while solar is a fifth or more,
 * in daylight. Without a reading the scene is still: no turning, no glint.
 */
export function windowMotion(daylight: Daylight, mix: { wind: number; solar: number } | null): { spin: number; glint: boolean } {
  if (!mix) return { spin: 0, glint: false };
  return { spin: 0.4 + (Math.max(0, Math.min(60, mix.wind)) / 60) * 3.2, glint: mix.solar >= 20 && daylight !== 'night' };
}
/** The visitor's local hour, as the window shows it. */
export function daylightAt(hour: number): Daylight {
  if (hour >= 6 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'day';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/** The sources on the shelf: what each tool's README cites, as it names them. */
export const SOURCES: ReadonlyArray<{ title: string; by: string; fed: readonly PieceId[] }> = [
  {
    title: 'Detecting hallucinations using semantic entropy',
    by: 'Farquhar, Kossen, Kuhn, Gal · Nature 2024',
    fed: ['real-or-hallucinated'],
  },
  { title: 'In-context Learning and Induction Heads', by: 'Olsson et al. 2022', fed: ['gpt-in-a-tab'] },
  { title: 'Towards Monosemanticity', by: 'Bricken et al. 2023', fed: ['gpt-in-a-tab'] },
  { title: 'Sparse Autoencoders Find Highly Interpretable Features', by: 'Cunningham et al. 2023', fed: ['gpt-in-a-tab'] },
  { title: 'nanoGPT and llm.c', by: 'Karpathy', fed: ['gpt-in-a-tab'] },
  { title: 'SummaC', by: 'Laban et al. 2022', fed: ['ask-the-record'] },
  { title: 'RARR', by: 'Gao et al. 2023', fed: ['ask-the-record'] },
  { title: 'FActScore', by: 'Min et al. 2023', fed: ['ask-the-record'] },
  { title: 'Attributed QA', by: 'Bohnet et al. 2022', fed: ['ask-the-record'] },
  { title: 'BM25', by: 'Okapi ranking', fed: ['ask-the-record'] },
  { title: 'all-MiniLM-L6-v2', by: 'sentence embeddings', fed: ['ask-the-record'] },
  { title: 'in-toto Attestation Framework', by: 'Statement v1', fed: ['receipts', 'agent-race'] },
  { title: 'DSSE', by: 'Dead Simple Signing Envelope', fed: ['receipts', 'agent-race'] },
  { title: 'JCGM 100:2008 (GUM)', by: 'uncertainty in measurement', fed: ['sourced'] },
  { title: 'JCGM 101:2008', by: 'Monte Carlo propagation', fed: ['sourced'] },
  { title: 'Variance-based sensitivity', by: 'Saltelli et al. 2010', fed: ['sourced'] },
  { title: 'IPCC 2006 Guidelines', by: 'national greenhouse gas inventories', fed: ['sourced'] },
  { title: 'Carbon Intensity API', by: 'NESO', fed: ['grid-weather', 'gridtop', 'listen-to-the-grid'] },
];

const SPINES = [INK, CORAL, BLUE, '#2f6f63', SUN, SLATE, OAK, '#7a3b5a', CREAM];
const hand = (weight: number, px: number) => `${weight} ${px}px "Caveat", "Comic Sans MS", cursive`;

function canvas(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): CanvasTexture {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  const ctx = el.getContext('2d');
  if (ctx) draw(ctx);
  const t = new CanvasTexture(el);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const lambert = (color: string) => new MeshLambertMaterial({ color });
function box(w: number, h: number, d: number, material: Material, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}
/** A soft dark pool under something standing on the floor. */
function contact(w: number, d: number, x: number, z: number, strength = 0.24): Mesh {
  const mesh = new Mesh(
    new PlaneGeometry(w, d),
    new MeshBasicMaterial({
      map: canvas(128, 128, (c) => {
        const r = c.createRadialGradient(64, 64, 10, 64, 64, 64);
        r.addColorStop(0, `rgba(50, 30, 15, ${strength})`);
        r.addColorStop(1, 'rgba(50, 30, 15, 0)');
        c.fillStyle = r;
        c.fillRect(0, 0, 128, 128);
      }),
      transparent: true,
      depthWrite: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, FLOOR + 0.9, z);
  mesh.userData.noEdge = true;
  return mesh;
}

/** The roofline through the window, for a time of day. */
function rooftops(daylight: Daylight): (c: CanvasRenderingContext2D) => void {
  const sky = {
    morning: ['#f6d9a8', '#cfe2f0'],
    day: ['#a9d4f5', '#e8f3fb'],
    evening: ['#f39b6d', '#f6d3a4'],
    night: ['#141a33', '#2a3358'],
  }[daylight];
  const lit = daylight === 'night' || daylight === 'evening';
  return (c) => {
    const W = 2048;
    const H = 1024;
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky[0] ?? '#a9d4f5');
    g.addColorStop(0.75, sky[1] ?? '#e8f3fb');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    if (daylight === 'night') {
      c.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 70; i++) c.fillRect((i * 733) % W, (i * 389) % (H * 0.45), 2, 2);
      c.fillStyle = '#f2ecd6';
      c.beginPath();
      c.arc(1520, 170, 34, 0, Math.PI * 2);
      c.fill();
    }
    // Far hills, then the town: roofs, chimneys, a spire, trees.
    c.fillStyle = daylight === 'night' ? '#26304f' : '#9bb3a5';
    c.beginPath();
    c.moveTo(0, 560);
    for (let x = 0; x <= W; x += 64) c.lineTo(x, 540 - Math.sin(x / 300) * 30 - Math.sin(x / 97) * 8);
    c.lineTo(W, H);
    c.lineTo(0, H);
    c.fill();
    const roof = daylight === 'night' ? '#1b2238' : '#5d6577';
    const wall = daylight === 'night' ? '#2b3150' : '#c98f6a';
    for (let i = 0; i < 18; i++) {
      const x = i * 120 - 40;
      const top = 640 + ((i * 37) % 60);
      c.fillStyle = wall;
      c.fillRect(x, top + 50, 118, H - top);
      c.fillStyle = roof;
      c.beginPath();
      c.moveTo(x - 6, top + 54);
      c.lineTo(x + 59, top);
      c.lineTo(x + 124, top + 54);
      c.fill();
      c.fillStyle = wall;
      c.fillRect(x + 84, top + 4, 16, 34);
      c.fillStyle = roof;
      c.fillRect(x + 82, top, 20, 6);
      c.fillStyle = lit && (i * 7) % 3 !== 0 ? '#ffd27a' : daylight === 'night' ? '#151a2c' : '#e6eef3';
      c.fillRect(x + 22, top + 80, 22, 28);
      c.fillRect(x + 72, top + 80, 22, 28);
    }
    // The spire.
    c.fillStyle = roof;
    c.beginPath();
    c.moveTo(1180, 470);
    c.lineTo(1205, 620);
    c.lineTo(1155, 620);
    c.fill();
    c.fillStyle = wall;
    c.fillRect(1160, 618, 40, 120);
    // Solar panels on a near roof's sunny slope, in view through the window.
    c.save();
    c.translate(SOLAR.x, SOLAR.y);
    c.rotate(-0.69);
    c.fillStyle = '#23336a';
    c.fillRect(-30, -10, 60, 20);
    c.strokeStyle = 'rgba(200, 220, 255, 0.5)';
    c.lineWidth = 2;
    for (let k = 1; k < 4; k++) {
      c.beginPath();
      c.moveTo(-30 + k * 15, -10);
      c.lineTo(-30 + k * 15, 10);
      c.stroke();
    }
    c.restore();
    // Trees.
    c.fillStyle = daylight === 'night' ? '#1c2a2a' : '#5e8a6a';
    for (const [x, r] of [
      [80, 70],
      [700, 90],
      [1480, 80],
      [1900, 100],
    ] as const) {
      c.beginPath();
      c.arc(x, 760, r, 0, Math.PI * 2);
      c.fill();
    }
  };
}

/** Where the solar panels sit in the window's view (canvas pixels): on the left slope of a near roof. */
const SOLAR = { x: 834, y: 693 };

/** The whiteboard: the lab as Harry would sketch it in marker. */
function sketch(c: CanvasRenderingContext2D): void {
  c.fillStyle = '#fbfbf7';
  c.fillRect(0, 0, 1024, 700);
  c.fillStyle = 'rgba(0,0,0,0.03)';
  for (let i = 0; i < 8; i++) c.fillRect(i * 140, 0, 60, 700);
  const marker = (colour: string, width = 6) => {
    c.strokeStyle = colour;
    c.fillStyle = colour;
    c.lineWidth = width;
    c.lineCap = 'round';
    c.lineJoin = 'round';
  };
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  // The briefs in the middle; review below; the ten tools round them.
  marker(INK);
  c.strokeRect(392, 270, 240, 100);
  c.font = hand(700, 54);
  c.fillText('the briefs', 512, 322);
  marker(CORAL);
  c.strokeRect(422, 560, 180, 80);
  c.font = hand(700, 50);
  c.fillText('review', 512, 602);
  // The tools on an arc over the top and down the sides, clear of review at the foot.
  const tools = PIECES.map((p) => p.title);
  const from = Math.PI / 2 + 0.8;
  const span = Math.PI * 2 - 1.6;
  tools.forEach((title, i) => {
    const a = from + (i / (tools.length - 1)) * span;
    const x = 512 + Math.cos(a) * 395;
    const y = 318 + Math.sin(a) * 245;
    marker(BLUE, 4);
    c.font = hand(700, title.length > 14 ? 30 : 36);
    const w = Math.min(230, c.measureText(title).width + 24);
    c.strokeRect(x - w / 2, y - 24, w, 48);
    c.fillText(title, x, y + 2);
    // An arrow from the tool, bowing past the briefs, to review.
    marker('rgba(239, 111, 108, 0.8)', 3);
    const sx = x + (512 - x) * 0.18;
    const sy = y + 26;
    const ex = 512 + (x - 512) * 0.16;
    const ey = 556;
    const bow = x < 512 ? -1 : 1;
    c.beginPath();
    c.moveTo(sx, sy);
    c.quadraticCurveTo(512 + bow * 250, 470, ex, ey);
    c.stroke();
    const tip = Math.atan2(ey - 470, ex - (512 + bow * 250));
    c.beginPath();
    c.moveTo(ex, ey);
    c.lineTo(ex - Math.cos(tip - 0.45) * 16, ey - Math.sin(tip - 0.45) * 16);
    c.moveTo(ex, ey);
    c.lineTo(ex - Math.cos(tip + 0.45) * 16, ey - Math.sin(tip + 0.45) * 16);
    c.stroke();
  });
  marker(INK, 3);
  c.font = hand(600, 34);
  c.fillText('sent back until it meets the brief', 512, 670);
}

export interface Furnishing {
  readonly group: Group;
  /** The books on the shelf, one mesh each; userData.source is the index in SOURCES. */
  readonly books: readonly Mesh[];
  /** Where the scene stands the kit's models, in the room. */
  readonly places: {
    readonly radio: Vector3;
    readonly coatStand: Vector3;
    readonly plant: Vector3;
    readonly shelfPlant: Vector3;
  };
  /** The foot of the shelf, at the front, where its tag hangs. */
  readonly shelfFoot: Vector3;
  /** The window's time of day, and the grid outside it (null: still and neutral). */
  setWindow(daylight: Daylight, mix: { wind: number; solar: number } | null): void;
  update(dt: number, t: number): void;
  /** How fast the turbines turn (radians a second) and whether the panels glint, for the checks. */
  state(): { daylight: Daylight; spin: number; glint: boolean };
}

export function furnish(): Furnishing {
  const group = new Group();
  const ink = lambert(INK);
  const walnut = lambert('#6b4a2f');
  const z0 = ROOM.z0;

  // ---------- The window's view: the roofline outside, the turbines on the horizon ----------
  const viewTex = canvas(2048, 1024, rooftops('day'));
  const view = new Mesh(new PlaneGeometry(1500, 750), new MeshBasicMaterial({ map: viewTex }));
  view.position.set(0, FLOOR + 1.2 * M + 140, z0 - 420);
  view.userData.noEdge = true;
  group.add(view);
  const turbines: Group[] = [];
  const white = lambert('#f4f4ef');
  for (const [x, scale] of [
    [-150, 1],
    [-55, 0.8],
    [80, 0.9],
  ] as const) {
    const t = new Group();
    const tower = new Mesh(new CylinderGeometry(1.4 * scale, 2.4 * scale, 62 * scale, 8), white);
    tower.position.y = 31 * scale;
    const hub = new Group();
    hub.position.set(0, 62 * scale, 2);
    for (let k = 0; k < 3; k++) {
      const blade = new Mesh(new BoxGeometry(2.6 * scale, 28 * scale, 0.8), white);
      blade.position.y = 14 * scale;
      const arm = new Group();
      arm.rotation.z = (k * Math.PI * 2) / 3;
      arm.add(blade);
      hub.add(arm);
    }
    t.add(tower, hub);
    t.position.set(x, FLOOR + 1.2 * M + 108, z0 - 400);
    t.userData.hub = hub;
    group.add(t);
    turbines.push(t);
  }
  const sparkle = canvas(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.fillRect(62, 4, 4, 120);
    c.fillRect(4, 62, 120, 4);
  });
  const glint = new Mesh(
    new PlaneGeometry(56, 56),
    new MeshBasicMaterial({ map: sparkle, color: '#fff6d8', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
  );
  glint.position.set(-750 + SOLAR.x * (1500 / 2048), view.position.y + 375 - SOLAR.y * (750 / 1024), z0 - 418);
  glint.userData.noEdge = true;
  group.add(glint);

  // ---------- The radiator under the window: fins, instanced ----------
  const fins = new InstancedMesh(new BoxGeometry(4, 0.4 * M, 8), lambert('#f2ede2'), 18);
  const m = new Matrix4();
  for (let i = 0; i < 18; i++) fins.setMatrixAt(i, m.makeTranslation(-76 + i * 9, FLOOR + 0.14 * M + 0.2 * M, z0 + 8));
  const enamel = lambert('#e6e0d2');
  group.add(
    fins,
    box(162, 4, 9, enamel, 0, FLOOR + 0.14 * M + 1, z0 + 8),
    box(162, 4, 9, enamel, 0, FLOOR + 0.54 * M - 1, z0 + 8),
    contact(190, 36, 0, z0 + 14, 0.14),
  );

  // ---------- The rug under the desk: a flat-woven kilim in the desk's colours ----------
  const rug = new Mesh(
    new PlaneGeometry(330, 250),
    new MeshLambertMaterial({
      map: canvas(512, 384, (c) => {
        c.fillStyle = CREAM;
        c.fillRect(0, 0, 512, 384);
        const bands = [CORAL, INK, SUN, BLUE, CORAL];
        bands.forEach((colour, i) => {
          c.fillStyle = colour;
          c.fillRect(0, 40 + i * 66, 512, 18);
        });
        c.fillStyle = INK;
        for (let x = 20; x < 512; x += 46) {
          c.beginPath();
          c.moveTo(x, 150);
          c.lineTo(x + 18, 192);
          c.lineTo(x, 234);
          c.lineTo(x - 18, 192);
          c.fill();
        }
        c.strokeStyle = INK;
        c.lineWidth = 10;
        c.strokeRect(10, 10, 492, 364);
      }),
    }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, FLOOR + 0.6, 70);
  rug.receiveShadow = true;
  group.add(rug);

  // ---------- The bookshelf: walnut, and the sources the tools cite ----------
  const shelf = { x: -228, z: z0 + 20, w: 116, h: 1.9 * M, d: 36 };
  const levels = [0.08, 0.5, 0.92, 1.34, 1.76].map((y) => FLOOR + y * M);
  group.add(
    box(4, shelf.h, shelf.d, walnut, shelf.x - shelf.w / 2, FLOOR + shelf.h / 2, shelf.z),
    box(4, shelf.h, shelf.d, walnut, shelf.x + shelf.w / 2, FLOOR + shelf.h / 2, shelf.z),
    box(shelf.w, shelf.h, 2, lambert('#5a3d26'), shelf.x, FLOOR + shelf.h / 2, shelf.z - shelf.d / 2 + 1),
    box(shelf.w + 8, 4, shelf.d + 4, walnut, shelf.x, FLOOR + shelf.h, shelf.z),
    contact(150, 70, shelf.x, shelf.z + 6),
  );
  for (const y of levels) group.add(box(shelf.w, 3, shelf.d, walnut, shelf.x, y, shelf.z));
  const books: Mesh[] = [];
  // Two shelves of spines at eye height, the rest leaning on the shelf below.
  let at = 0;
  SOURCES.forEach((source, i) => {
    const level = i < 9 ? 3 : i < 16 ? 2 : 1;
    const thick = 4 + ((i * 7) % 4);
    const tall = 26 + ((i * 5) % 9);
    if (i === 9 || i === 16) at = 0;
    const colour = SPINES[i % SPINES.length] ?? INK;
    const dark = colour === CREAM || colour === SUN;
    const spine = canvas(96, 512, (c) => {
      c.fillStyle = colour;
      c.fillRect(0, 0, 96, 512);
      c.fillStyle = dark ? INK : PAPER;
      c.fillRect(0, 26, 96, 4);
      c.fillRect(0, 482, 96, 4);
      c.save();
      c.translate(56, 256);
      c.rotate(-Math.PI / 2);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `600 ${source.title.length > 28 ? 26 : 34}px "IBM Plex Sans Condensed", sans-serif`;
      c.fillText(source.title, 0, 0, 420);
      c.restore();
    });
    const plain = lambert(colour);
    const mesh = new Mesh(new BoxGeometry(thick, tall, 24), [plain, plain, plain, plain, new MeshLambertMaterial({ map: spine }), plain]);
    const x = shelf.x - shelf.w / 2 + 6 + at + thick / 2;
    at += thick + 0.6;
    mesh.position.set(x, (levels[level] ?? FLOOR) + 1.5 + tall / 2, shelf.z + 4);
    mesh.userData.source = i;
    books.push(mesh);
    group.add(mesh);
  });

  // ---------- The whiteboard: the lab, sketched ----------
  const board = { x: 226, y: FLOOR + 1.55 * M, w: 118, h: 80 };
  group.add(
    box(board.w + 4, board.h + 4, 2, lambert('#c9ccd3'), board.x, board.y, z0 + 1),
    box(board.w * 0.6, 2, 5, lambert('#c9ccd3'), board.x, board.y - board.h / 2 - 3, z0 + 3),
  );
  const boardFace = new Mesh(new PlaneGeometry(board.w, board.h), new MeshLambertMaterial({ map: canvas(1024, 700, sketch) }));
  boardFace.position.set(board.x, board.y, z0 + 2.2);
  group.add(boardFace);
  // Two markers on the tray.
  group.add(
    box(10, 1.6, 1.6, lambert(BLUE), board.x - 10, board.y - board.h / 2 - 1.5, z0 + 4),
    box(10, 1.6, 1.6, lambert(CORAL), board.x + 6, board.y - board.h / 2 - 1.5, z0 + 4),
  );

  // ---------- A print on the left wall: a turbine over the roofs, in the palette ----------
  const print = canvas(600, 450, (c) => {
    c.fillStyle = '#f3e3c3';
    c.fillRect(0, 0, 600, 450);
    c.fillStyle = SUN;
    c.beginPath();
    c.arc(430, 130, 60, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#9bb3a5';
    c.fillRect(0, 300, 600, 150);
    c.strokeStyle = INK;
    c.lineWidth = 8;
    c.beginPath();
    c.moveTo(220, 300);
    c.lineTo(230, 130);
    c.stroke();
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 + (k * Math.PI * 2) / 3 + 0.4;
      c.beginPath();
      c.moveTo(230, 130);
      c.lineTo(230 + Math.cos(a) * 90, 130 + Math.sin(a) * 90);
      c.stroke();
    }
    c.fillStyle = CORAL;
    c.fillRect(60, 340, 120, 70);
    c.fillStyle = INK;
    c.font = '600 26px "IBM Plex Mono", monospace';
    c.fillText('GRID WEATHER', 330, 420);
  });
  const px = ROOM.x0 + 3;
  const printMesh = new Mesh(new PlaneGeometry(64, 48), new MeshLambertMaterial({ map: print }));
  printMesh.rotation.y = Math.PI / 2;
  printMesh.position.set(px + 2.5, FLOOR + 1.5 * M, 200);
  const printFrame = box(3, 54, 70, walnut, px + 1, FLOOR + 1.5 * M, 200);
  group.add(printFrame, printMesh);

  // ---------- The desk lamp, on the desk's back left ----------
  const lamp = new Group();
  const base = new Mesh(new CylinderGeometry(9, 10, 2.5, 24), ink);
  base.position.y = 1.25;
  const arm1 = box(2, 32, 2, lambert(SLATE), 0, 17, 0);
  arm1.rotation.z = 0.3;
  arm1.position.x = -4.5;
  const arm2 = box(2, 26, 2, lambert(SLATE), 4, 40, 0);
  arm2.rotation.z = -0.9;
  const shade = new Mesh(new ConeGeometry(9, 12, 24, 1, true), lambert(SUN));
  shade.position.set(14, 42, 0);
  shade.rotation.z = -2.3;
  const bulb = new Mesh(new CylinderGeometry(4, 4, 1, 16), new MeshBasicMaterial({ color: '#fff1c4' }));
  bulb.position.set(16, 38, 0);
  bulb.rotation.z = -2.3;
  lamp.add(base, arm1, arm2, shade, bulb);
  lamp.position.set(-92, -0.15, -36);
  lamp.rotation.y = 0.6;
  group.add(lamp);

  // ---------- The light: through the window onto the floor, by the time of day; the lamp's after dark ----------
  const glow = (w: number, d: number, texture: CanvasTexture) => {
    const mesh = new Mesh(
      new PlaneGeometry(w, d),
      new MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.userData.noEdge = true;
    mesh.renderOrder = 2;
    return mesh;
  };
  // The window's shape, two panes, softened and slanting into the room.
  const panes = canvas(256, 256, (c) => {
    c.filter = 'blur(10px)';
    c.fillStyle = '#fff';
    for (const x of [28, 134]) {
      c.beginPath();
      c.moveTo(x, 28);
      c.lineTo(x + 94, 28);
      c.lineTo(x + 94 - 20, 228);
      c.lineTo(x - 20, 228);
      c.closePath();
      c.fill();
    }
  });
  const sunPool = glow(2.6 * M, 1.6 * M, panes);
  sunPool.position.set(-30, FLOOR + 0.6, 0.62 * M + 0.8 * M);
  const round = canvas(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });
  const lampPool = glow(90, 90, round);
  lampPool.position.set(-80, -0.05, -30);
  group.add(sunPool, lampPool);
  const bulbGlow = bulb.material as MeshBasicMaterial;
  /** What the light does at each time of day: the window's colour and strength, and whether the lamp is on. */
  const LIGHT: Record<Daylight, { colour: string; strength: number; lamp: boolean }> = {
    morning: { colour: '#ffe9b8', strength: 0.26, lamp: false },
    day: { colour: '#fff8ea', strength: 0.18, lamp: false },
    evening: { colour: '#ffb46e', strength: 0.3, lamp: true },
    night: { colour: '#7d8cc4', strength: 0.08, lamp: true },
  };
  const lightFor = (daylight: Daylight) => {
    const l = LIGHT[daylight];
    const sunMaterial = sunPool.material as MeshBasicMaterial;
    sunMaterial.color.set(l.colour);
    sunMaterial.opacity = l.strength;
    (lampPool.material as MeshBasicMaterial).color.set('#ffcf7a');
    (lampPool.material as MeshBasicMaterial).opacity = l.lamp ? 0.5 : 0;
    bulbGlow.color.set(l.lamp ? '#fff1c4' : '#d8d2c2');
  };
  lightFor('day');

  // ---------- A cable run: from the desk's back leg along the skirting to a socket ----------
  const cable = lambert('#2a2f3c');
  group.add(
    box(2, 94, 2, cable, 100, FLOOR + 47, -44),
    box(2, 2, 26, cable, 100, FLOOR + 1, -58),
    box(110, 2, 2, cable, 155, FLOOR + 1, z0 + 2),
    box(10, 14, 3, lambert('#f2ede2'), 212, FLOOR + 20, z0 + 1.5),
  );

  group.traverse((o: Object3D) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) mesh.castShadow = false;
  });

  // ---------- A coral jacket, hanging on the coat stand's hook (the kit's stand is placed by the engine) ----------
  const coat = { x: ROOM.x1 - 55, z: ROOM.z1 - 70 };
  const cloth = lambert(CORAL);
  const jacket = new Group();
  const sleeve = (side: number) => {
    const s = box(10, 52, 9, cloth, side * 24, -4, 0);
    s.rotation.z = -side * 0.12;
    return s;
  };
  jacket.add(box(44, 64, 10, cloth, 0, 0, 0), sleeve(-1), sleeve(1), box(30, 8, 12, lambert('#c9504d'), 0, 30, 0));
  jacket.position.set(coat.x + 10, FLOOR + 1.42 * M, coat.z + 12);
  jacket.rotation.y = -0.5;
  group.add(jacket, contact(70, 70, coat.x, coat.z, 0.2));

  let spin = 0;
  let glinting = false;
  let shown: Daylight = 'day';
  return {
    group,
    books,
    places: {
      radio: new Vector3(shelf.x + 28, (levels[2] ?? FLOOR) + 1.5, shelf.z + 2),
      coatStand: new Vector3(coat.x, FLOOR, coat.z),
      plant: new Vector3(ROOM.x1 - 40, FLOOR, z0 + 40),
      shelfPlant: new Vector3(shelf.x + 34, FLOOR + shelf.h + 2, shelf.z),
    },
    shelfFoot: new Vector3(shelf.x, FLOOR + 0.42 * M, shelf.z + shelf.d / 2 + 4),
    setWindow(daylight, mix) {
      if (daylight !== shown) {
        shown = daylight;
        const ctx = (viewTex.image as HTMLCanvasElement).getContext('2d');
        if (ctx) rooftops(daylight)(ctx);
        viewTex.needsUpdate = true;
        const night = daylight === 'night';
        white.color.set(night ? '#3a4260' : '#f4f4ef');
        lightFor(daylight);
      }
      ({ spin, glint: glinting } = windowMotion(daylight, mix));
    },
    update(dt, t) {
      for (const turbine of turbines) (turbine.userData.hub as Group).rotation.z -= spin * dt;
      (glint.material as MeshBasicMaterial).opacity = glinting ? 0.25 + 0.45 * Math.max(0, Math.sin(t * 1.6)) : 0;
    },
    state: () => ({ daylight: shown, spin, glint: glinting }),
  };
}
