// The outside of Harry's office door, in the desk's sim-cartoon line: one builder for both doors, the
// desk scene's (desk/room.ts, 125 units to the metre) and the phone's (entrance/door.ts, in metres).
//
// A panelled oak door with warm grain and raised, bevelled panels; a frosted pane lit warm from inside,
// the soft shape of a desk lamp behind it; a large brass plate, the name and role engraved on it; a
// brass lever and kick plate. Round it, a calm corridor: warm cream plaster over an oak wainscot, ink
// rails and skirting, a boarded floor; a brass sconce with its pool of light; a framed plan of the office
// with a hand-lettered "Please knock" tucked into it; a coir mat that says hello; and, for the scene to
// place, a potted plant. Soft contact shading where things meet the floor. All flat colour and canvas
// textures in the desk's palette; nothing is downloaded but the plant.

import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { Printed, paintDoorPlate, printedMaterial } from './lettering';
import { CORAL, CREAM, INK, PAPER } from './palette';

/** The door, in metres. */
export const DOOR = { width: 0.92, height: 2.08, thick: 0.045, frame: 0.1 } as const;
/** The brass plate on the door: its centre's height and its size, in metres. */
const PLATE = { y: 1.4, width: 0.66, height: 0.22 } as const;
const GLASS = { bottom: 1.6, top: 1.96, width: 0.6 } as const;
const BRASS = '#d9a63b';
const BRASS_LIGHT = '#f0c766';
const WALNUT = '#6b4a2f';

const hand = (weight: number, px: number) => `${weight} ${px}px "Caveat", "Comic Sans MS", cursive`;

function canvas(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat?: [number, number]): CanvasTexture {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  const ctx = el.getContext('2d');
  if (ctx) draw(ctx);
  const texture = new CanvasTexture(el);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  if (repeat) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(...repeat);
  }
  return texture;
}

/** A seeded random, so the grain and the coir are the same on every visit. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Oak with a warm, flowing grain; `calm` for the wall's panelling, where it should hardly show. */
function grain(base: string, seed: number, calm = false): CanvasTexture {
  return canvas(256, 512, (c) => {
    c.fillStyle = base;
    c.fillRect(0, 0, 256, 512);
    const rnd = seeded(seed);
    for (let i = 0; i < 46; i++) {
      const x = rnd() * 256;
      const a = calm ? 0.045 : 1;
      c.strokeStyle = rnd() > 0.5 ? `rgba(120, 70, 30, ${0.16 * a})` : `rgba(255, 220, 170, ${0.12 * a})`;
      c.lineWidth = 1 + rnd() * 3;
      c.beginPath();
      c.moveTo(x, 0);
      const sway = calm ? 1 : 1.5 + rnd() * 2;
      for (let y = 0; y <= 512; y += 8) c.lineTo(x + Math.sin(y / 90 + i) * sway, y);
      c.stroke();
    }
  });
}

export interface DoorwayOptions {
  /** Units to the metre. */
  readonly unit: number;
  /** The floor's height, and the plane the door's corridor face sits on. */
  readonly floor: number;
  readonly z: number;
  /** The words engraved on the brass plate: the page's own (#entrance-plate). */
  readonly words: { readonly name: string; readonly role: string };
}

export interface Doorway {
  /** The corridor face of the wall, the frame, the dressing. */
  readonly group: Group;
  /** The door, hung on its left edge as you face it, opening away from you. */
  readonly hinge: Group;
  /** Where the scene sets the potted plant down (it loads the plant itself). */
  readonly plantAt: Vector3;
  /** The plant's height, in the scene's units. */
  readonly plantHeight: number;
  /** The brass plate's face: top-left, top-right, bottom-right, bottom-left. */
  plateFace(): Vector3[];
  /** The door a touch brighter, as the pointer comes over it. */
  brighten(on: boolean): void;
}

export function buildDoorway({ unit: u, floor, z, words }: DoorwayOptions): Doorway {
  const group = new Group();
  const lambert = (color: string) => new MeshLambertMaterial({ color });
  /** A box, its size and centre in metres, from the door's foot at the corridor face. */
  const box = (w: number, h: number, d: number, material: Material, x: number, y: number, dz: number) => {
    const mesh = new Mesh(new BoxGeometry(w * u, h * u, d * u), material);
    mesh.position.set(x * u, floor + y * u, z + dz * u);
    return mesh;
  };
  const plane = (w: number, h: number, material: Material, x: number, y: number, dz: number, lie = false) => {
    const mesh = new Mesh(new PlaneGeometry(w * u, h * u), material);
    mesh.position.set(x * u, floor + y * u, z + dz * u);
    if (lie) mesh.rotation.x = -Math.PI / 2;
    return mesh;
  };

  // ---------- The wall: cream plaster over an oak wainscot, an ink rail and a walnut skirting ----------
  const W = 7;
  const H = 2.8;
  const half = DOOR.width / 2 + DOOR.frame;
  const plaster = lambert('#efe2cc');
  const wainscot = new MeshLambertMaterial({ map: grain('#d2b080', 7, true) });
  const ink = lambert(INK);
  for (const side of [-1, 1]) {
    const w = W / 2 - half;
    const x = side * (half + w / 2);
    group.add(box(w, H - 0.95, 0.06, plaster, x, 0.95 + (H - 0.95) / 2, 0.03));
    group.add(box(w, 0.95, 0.07, wainscot, x, 0.475, 0.035));
    // Panel mouldings on the wainscot, a rail and the skirting.
    for (let i = 0; i < Math.floor(w / 0.62); i++) {
      const px = x - w / 2 + 0.36 + i * 0.62;
      group.add(box(0.48, 0.5, 0.006, lambert('#cdab7b'), px, 0.47, 0.073));
    }
    group.add(box(w, 0.04, 0.1, ink, x, 0.95, 0.05));
    group.add(box(w, 0.13, 0.09, lambert(WALNUT), x, 0.065, 0.045));
  }
  group.add(
    box(2 * half, H - DOOR.height - DOOR.frame, 0.06, plaster, 0, DOOR.height + DOOR.frame + (H - DOOR.height - DOOR.frame) / 2, 0.03),
  );

  // ---------- The frame: a walnut architrave with a lip ----------
  const architrave = lambert(WALNUT);
  const lip = lambert('#7d5838');
  group.add(
    box(DOOR.frame, DOOR.height + DOOR.frame, 0.1, architrave, -DOOR.width / 2 - DOOR.frame / 2, (DOOR.height + DOOR.frame) / 2, 0.05),
    box(DOOR.frame, DOOR.height + DOOR.frame, 0.1, architrave, DOOR.width / 2 + DOOR.frame / 2, (DOOR.height + DOOR.frame) / 2, 0.05),
    box(DOOR.width + 2 * DOOR.frame + 0.06, DOOR.frame + 0.02, 0.12, architrave, 0, DOOR.height + DOOR.frame / 2, 0.06),
    box(DOOR.frame * 0.4, DOOR.height, 0.13, lip, -DOOR.width / 2 - DOOR.frame * 0.2, DOOR.height / 2, 0.065),
    box(DOOR.frame * 0.4, DOOR.height, 0.13, lip, DOOR.width / 2 + DOOR.frame * 0.2, DOOR.height / 2, 0.065),
  );

  // ---------- The floor: warm boards, and the shade where the wall meets it ----------
  const boards = canvas(
    512,
    512,
    (c) => {
      c.fillStyle = '#d9bf95';
      c.fillRect(0, 0, 512, 512);
      for (let y = 0; y < 512; y += 64) {
        c.fillStyle = (y / 64) % 2 ? 'rgba(160, 110, 60, 0.07)' : 'rgba(255, 240, 210, 0.06)';
        c.fillRect(0, y, 512, 64);
        c.fillStyle = 'rgba(110, 70, 35, 0.35)';
        c.fillRect(0, y, 512, 2);
        const off = ((y / 64) % 3) * 170;
        c.fillRect(off, y, 2, 64);
      }
    },
    [W / 2, 3],
  );
  const floorPlane = plane(W, 6, new MeshLambertMaterial({ map: boards }), 0, 0, 3, true);
  floorPlane.receiveShadow = true;
  const shade = (_w: number, _d: number, draw: (c: CanvasRenderingContext2D) => void) =>
    new MeshBasicMaterial({ map: canvas(128, 128, draw), transparent: true, depthWrite: false });
  const wallFoot = plane(
    W,
    0.35,
    shade(W, 0.35, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, 'rgba(60, 40, 20, 0.28)');
      g.addColorStop(1, 'rgba(60, 40, 20, 0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 128, 128);
    }),
    0,
    0.003,
    0.29,
    true,
  );
  for (const m of [wallFoot]) m.userData.noEdge = true;
  group.add(floorPlane, wallFoot);

  // ---------- The coir mat, saying hello ----------
  const coir = canvas(512, 320, (c) => {
    c.fillStyle = '#b07a3c';
    c.fillRect(0, 0, 512, 320);
    const rnd = seeded(31);
    for (let i = 0; i < 2600; i++) {
      c.strokeStyle = rnd() > 0.5 ? 'rgba(90, 55, 20, 0.35)' : 'rgba(230, 180, 110, 0.3)';
      c.lineWidth = 1.2;
      const x = rnd() * 512;
      const y = rnd() * 320;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (rnd() - 0.5) * 6, y + 4 + rnd() * 6);
      c.stroke();
    }
    c.strokeStyle = 'rgba(70, 40, 15, 0.75)';
    c.lineWidth = 18;
    c.strokeRect(20, 20, 472, 280);
    c.fillStyle = 'rgba(60, 32, 12, 0.85)';
    c.font = hand(700, 150);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('hello', 256, 170);
  });
  const mat = box(0.92, 0.022, 0.56, new MeshLambertMaterial({ map: coir }), 0, 0.011, 0.42);
  // Its edges: the coir's sides, darker.
  (mat.material as MeshLambertMaterial).needsUpdate = true;
  const matShade = plane(
    1.04,
    0.68,
    shade(1, 1, (c) => {
      const r = c.createRadialGradient(64, 64, 30, 64, 64, 64);
      r.addColorStop(0, 'rgba(50, 30, 10, 0.22)');
      r.addColorStop(1, 'rgba(50, 30, 10, 0)');
      c.fillStyle = r;
      c.fillRect(0, 0, 128, 128);
    }),
    0,
    0.002,
    0.42,
    true,
  );
  matShade.userData.noEdge = true;
  group.add(matShade, mat);

  // ---------- The room's warm light, under the door ----------
  const spill = plane(
    1.7,
    1.1,
    new MeshBasicMaterial({
      map: canvas(256, 256, (c) => {
        const r = c.createRadialGradient(128, 0, 0, 128, 0, 210);
        r.addColorStop(0, 'rgba(255, 201, 120, 0.85)');
        r.addColorStop(0.45, 'rgba(255, 190, 110, 0.25)');
        r.addColorStop(1, 'rgba(255, 190, 110, 0)');
        c.fillStyle = r;
        c.fillRect(0, 0, 256, 256);
      }),
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
    0,
    0.026,
    0.55,
    true,
  );
  spill.userData.noEdge = true;
  const crack = box(DOOR.width, 0.012, 0.02, new MeshBasicMaterial({ color: '#ffd48a' }), 0, 0.006, 0.0);
  crack.userData.noEdge = true;
  group.add(spill, crack);

  // ---------- The sconce, and its pool of light on the wall ----------
  const brass = new MeshLambertMaterial({ color: BRASS, emissive: '#3a2a06' });
  const sx = half + 0.55;
  const sy = 1.82;
  const back = new Mesh(new CylinderGeometry(0.06 * u, 0.06 * u, 0.02 * u, 24), brass);
  back.rotation.x = Math.PI / 2;
  back.position.set(sx * u, floor + sy * u, z + 0.07 * u);
  const arm = box(0.025, 0.025, 0.12, brass, sx, sy, 0.13);
  const shadeMesh = new Mesh(new CylinderGeometry(0.07 * u, 0.1 * u, 0.15 * u, 24, 1, true), new MeshBasicMaterial({ color: '#ffe7b8' }));
  shadeMesh.position.set(sx * u, floor + (sy + 0.06) * u, z + 0.19 * u);
  const pool = plane(
    1.5,
    1.5,
    new MeshBasicMaterial({
      map: canvas(256, 256, (c) => {
        const r = c.createRadialGradient(128, 110, 4, 128, 128, 128);
        r.addColorStop(0, 'rgba(255, 214, 150, 0.55)');
        r.addColorStop(0.5, 'rgba(255, 200, 130, 0.16)');
        r.addColorStop(1, 'rgba(255, 200, 130, 0)');
        c.fillStyle = r;
        c.fillRect(0, 0, 256, 256);
      }),
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
    sx,
    sy - 0.05,
    0.065,
  );
  pool.userData.noEdge = true;
  group.add(pool, back, arm, shadeMesh);

  // ---------- A framed plan of the office, and a card tucked into the frame ----------
  const px = -half - 0.85;
  const py = 1.5;
  const plan = canvas(480, 360, (c) => {
    c.fillStyle = PAPER;
    c.fillRect(0, 0, 480, 360);
    c.strokeStyle = INK;
    c.lineWidth = 6;
    c.strokeRect(40, 40, 400, 280);
    c.lineWidth = 3;
    // Two rows of five desks, the review table, the cabinet and Reception: the office on the desk.
    for (let row = 0; row < 2; row++) for (let col = 0; col < 5; col++) c.strokeRect(70 + col * 72, 80 + row * 78, 44, 24);
    c.fillStyle = CORAL;
    c.fillRect(196, 250, 88, 30);
    c.strokeRect(196, 250, 88, 30);
    c.strokeRect(80, 262, 54, 40);
    c.strokeRect(330, 262, 80, 30);
    c.fillStyle = INK;
    c.font = '600 22px "IBM Plex Mono", monospace';
    c.fillText('THE STUDIO 1:50', 44, 30);
  });
  group.add(
    box(0.56, 0.44, 0.03, lambert(WALNUT), px, py, 0.075),
    box(0.5, 0.38, 0.032, lambert(CREAM), px, py, 0.077),
    plane(0.4, 0.3, new MeshLambertMaterial({ map: plan }), px, py, 0.095),
  );
  const card = plane(
    0.16,
    0.1,
    new MeshLambertMaterial({
      map: canvas(320, 200, (c) => {
        c.fillStyle = '#fff6dd';
        c.fillRect(0, 0, 320, 200);
        c.fillStyle = INK;
        c.font = hand(700, 74);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('Please', 160, 70);
        c.fillText('knock', 160, 142);
      }),
    }),
    px + 0.22,
    py - 0.2,
    0.1,
  );
  card.rotation.z = -0.16;
  group.add(card);

  // ---------- The door: oak, panelled, its panels raised and bevelled; the glass, the brass ----------
  const hinge = new Group();
  hinge.position.set((-DOOR.width / 2) * u, floor, z - 0.02 * u);
  const oak = new MeshLambertMaterial({ map: grain('#c98c4e', 3) });
  const oakEdge = new MeshLambertMaterial({ map: grain('#b97c42', 5) });
  const face = DOOR.thick / 2;
  const on = (w: number, h: number, d: number, material: Material, x: number, y: number, dz: number) => {
    const mesh = new Mesh(new BoxGeometry(w * u, h * u, d * u), material);
    mesh.position.set(x * u, y * u, dz * u);
    hinge.add(mesh);
    return mesh;
  };
  const _leaf = on(DOOR.width, DOOR.height, DOOR.thick, oak, DOOR.width / 2, DOOR.height / 2, 0);
  // Stiles and rails, standing proud of the panels.
  const proud = 0.012;
  on(0.11, DOOR.height, proud, oakEdge, 0.055, DOOR.height / 2, face + proud / 2);
  on(0.11, DOOR.height, proud, oakEdge, DOOR.width - 0.055, DOOR.height / 2, face + proud / 2);
  for (const [y, h] of [
    [0.1, 0.2],
    [1.08, 0.14],
    [1.5, 0.1],
    [2.02, 0.12],
  ] as const)
    on(DOOR.width - 0.22, h, proud, oakEdge, DOOR.width / 2, y, face + proud / 2);
  // Raised panels: two below, two above the lock rail, each with a bevelled field.
  for (const [x, y, w, h] of [
    [0.31, 0.62, 0.32, 0.76],
    [0.61, 0.62, 0.32, 0.76],
    [0.31, 1.29, 0.32, 0.28],
    [0.61, 1.29, 0.32, 0.28],
  ] as const) {
    on(w, h, 0.006, oakEdge, x, y, face + 0.003);
    on(w - 0.06, h - 0.06, 0.012, oak, x, y, face + 0.006);
  }
  // The frosted pane, warm, a desk lamp's soft shape behind it.
  const frost = canvas(256, 160, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 160);
    g.addColorStop(0, '#fff3d6');
    g.addColorStop(1, '#ffd391');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 160);
    c.filter = 'blur(7px)';
    c.fillStyle = 'rgba(120, 80, 40, 0.42)';
    c.beginPath();
    c.moveTo(150, 46);
    c.lineTo(196, 46);
    c.lineTo(208, 78);
    c.lineTo(138, 78);
    c.closePath();
    c.fill();
    c.fillRect(170, 78, 6, 58);
    c.fillRect(150, 132, 46, 10);
    c.fillStyle = 'rgba(255, 236, 190, 0.9)';
    c.beginPath();
    c.ellipse(173, 92, 40, 12, 0, 0, Math.PI * 2);
    c.fill();
    c.filter = 'none';
    c.fillStyle = 'rgba(255, 255, 255, 0.18)';
    const rnd = seeded(11);
    for (let i = 0; i < 400; i++) c.fillRect(rnd() * 256, rnd() * 160, 2, 2);
  });
  const glass = new Mesh(new PlaneGeometry(GLASS.width * u, (GLASS.top - GLASS.bottom) * u), new MeshBasicMaterial({ map: frost }));
  glass.position.set((DOOR.width / 2) * u, ((GLASS.top + GLASS.bottom) / 2) * u, (face + 0.004) * u);
  hinge.add(glass);
  on(GLASS.width + 0.04, 0.025, 0.02, ink, DOOR.width / 2, GLASS.top + 0.012, face + 0.01);
  on(GLASS.width + 0.04, 0.025, 0.02, ink, DOOR.width / 2, GLASS.bottom - 0.012, face + 0.01);
  on(0.025, GLASS.top - GLASS.bottom, 0.02, ink, DOOR.width / 2 - GLASS.width / 2 - 0.012, (GLASS.top + GLASS.bottom) / 2, face + 0.01);
  on(0.025, GLASS.top - GLASS.bottom, 0.02, ink, DOOR.width / 2 + GLASS.width / 2 + 0.012, (GLASS.top + GLASS.bottom) / 2, face + 0.01);
  // The brass plate: a bevelled edge round a lighter face, four screws.
  const plateEdge = new MeshLambertMaterial({ color: BRASS, emissive: '#2a1e04' });
  // Its face engraved with the name and role (desk/lettering.ts), so the door hides them as it swings.
  const engraved = new Printed(1320, 408);
  engraved.draw(paintDoorPlate(words.name, words.role, BRASS_LIGHT));
  const plateFaceMat = printedMaterial(engraved.texture, '#3a2a06');
  on(PLATE.width, PLATE.height, 0.008, plateEdge, DOOR.width / 2, PLATE.y, face + 0.016);
  const plate = on(PLATE.width - 0.024, PLATE.height - 0.024, 0.006, plateFaceMat, DOOR.width / 2, PLATE.y, face + 0.022);
  for (const [dx, dy] of [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ] as const) {
    const screw = new Mesh(new CylinderGeometry(0.007 * u, 0.007 * u, 0.004 * u, 10), lambert('#8a6418'));
    screw.rotation.x = Math.PI / 2;
    screw.position.set(
      (DOOR.width / 2 + dx * (PLATE.width / 2 - 0.024)) * u,
      (PLATE.y + dy * (PLATE.height / 2 - 0.022)) * u,
      (face + 0.026) * u,
    );
    hinge.add(screw);
  }
  // The lever handle and its rose, and the kick plate, in brass.
  const rose = new Mesh(new CylinderGeometry(0.035 * u, 0.035 * u, 0.02 * u, 24), brass);
  rose.rotation.x = Math.PI / 2;
  rose.position.set((DOOR.width - 0.09) * u, 1.0 * u, (face + 0.01) * u);
  hinge.add(rose);
  on(0.15, 0.024, 0.024, brass, DOOR.width - 0.155, 1.0, face + 0.055);
  on(0.024, 0.024, 0.05, brass, DOOR.width - 0.09, 1.0, face + 0.03);
  on(
    DOOR.width - 0.08,
    0.2,
    0.004,
    new MeshLambertMaterial({ color: BRASS_LIGHT, emissive: '#2a1e04' }),
    DOOR.width / 2,
    0.11,
    face + 0.002,
  );
  group.add(hinge);

  // Nothing here casts a shadow: the sun's shadow covers the desk alone.
  group.traverse((o: Object3D) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) mesh.castShadow = false;
  });

  const lit = [oak, oakEdge];
  return {
    group,
    hinge,
    plantAt: new Vector3(-(half + 0.42) * u, floor, z + 0.32 * u),
    plantHeight: 1.05 * u,
    plateFace() {
      plate.updateMatrixWorld(true);
      const hw = ((PLATE.width - 0.024) / 2 - 0.02) * u;
      const hh = ((PLATE.height - 0.024) / 2 - 0.012) * u;
      return [
        [-hw, hh],
        [hw, hh],
        [hw, -hh],
        [-hw, -hh],
      ].map(([x = 0, y = 0]) => new Vector3(x, y, 0.0031 * u).applyMatrix4(plate.matrixWorld));
    },
    brighten(on) {
      for (const m of lit) m.emissive.set(on ? '#4a2c0e' : '#000000');
    },
  };
}
