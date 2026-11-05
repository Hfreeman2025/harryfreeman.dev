// Harry's office, around the desk: one continuous space with the desk scene, so the walk in from the
// door ends exactly on the desk's own seated view. The room is drawn at 125 units to the metre and set into
// the world (74 to the metre, where the desk's things are real-scale) by toWorld: a long birch desk under
// the window, its legs to the floor,
// the walls, a chair, and the door in the near wall behind the chair, with the corridor outside. The same
// palette, lights and ink outlines as the desk. Nothing here casts a shadow: the sun's shadow covers the
// desk alone.

import {
  BoxGeometry,
  CanvasTexture,
  Group,
  type Material,
  Mesh,
  MeshLambertMaterial,
  type Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { buildDoorway, DOOR as DOORWAY } from './doorway';
import { DESK_Y } from './objects';
import { INK, OAK, SLATE } from './palette';

/**
 * The room is drawn in its own units, 125 to the metre (the numbers here, in doorway.ts and in furnish.ts),
 * and set into the desk's world at its real size by toWorld(): the desk's things are real-scale at 74 world
 * units to the metre, and the office model on the desk stays a miniature among them.
 */
export const DRAWN = 125;
/** World units to the metre. */
export const M = 74;
const SCALE = M / DRAWN;
/** Sets a group drawn in the room's units into the world: scaled about the desk top, which stays put. */
export function toWorld(group: Object3D): void {
  group.scale.setScalar(SCALE);
  group.position.y = DESK_Y * (1 - SCALE);
}

// ---------- The room's drawing: its own units ----------
const DM = DRAWN;
const DFLOOR = DESK_Y - 0.75 * DM;
/** The desk's top: wide and deep enough that the seated view sees nothing but desk. */
const DTABLE = { x0: -110, x1: 110, z0: -52, z1: 52, thick: 4 } as const;
const DROOM = { x0: -300, x1: 300, z0: -72, z1: 430, height: 2.6 * DM } as const;
/** The door, in the drawing's units (the doorway builds it in metres). */
const DDOOR = { width: DOORWAY.width * DM, height: DOORWAY.height * DM, frame: DOORWAY.frame * DM, thick: DOORWAY.thick * DM } as const;
/** The same numbers for the room's furnishing (furnish.ts), drawn alongside. */
export const drawn = { M: DM, FLOOR: DFLOOR, ROOM: DROOM, TABLE: DTABLE } as const;

// ---------- The same, in the world ----------
export const FLOOR = DESK_Y - 0.75 * M;
export const TABLE = {
  x0: DTABLE.x0 * SCALE,
  x1: DTABLE.x1 * SCALE,
  z0: DTABLE.z0 * SCALE,
  z1: DTABLE.z1 * SCALE,
  thick: DTABLE.thick * SCALE,
} as const;
export const ROOM = { x0: DROOM.x0 * SCALE, x1: DROOM.x1 * SCALE, z0: DROOM.z0 * SCALE, z1: DROOM.z1 * SCALE, height: 2.6 * M } as const;
export const DOOR = { width: DOORWAY.width * M, height: DOORWAY.height * M, frame: DOORWAY.frame * M, thick: DOORWAY.thick * M } as const;

/** Outside the door: where the visitor stands, and where they look. */
export const OUTSIDE = {
  pos: new Vector3(0, FLOOR + 1.6 * M, ROOM.z1 + 3.3 * M),
  look: new Vector3(0, FLOOR + 1.0 * M, ROOM.z1),
} as const;

const flat = (color: string) => new MeshLambertMaterial({ color });
function box(w: number, h: number, d: number, material: Material, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}
function _gradient(draw: (c: CanvasRenderingContext2D) => void): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export interface Room {
  readonly group: Group;
  /** The door, hung on its left edge; opened by turning it. */
  readonly hinge: Group;
  /** Where the corridor's potted plant stands, and how tall; the engine loads it. */
  readonly plantAt: Vector3;
  readonly plantHeight: number;
  /** The door a touch brighter under the pointer. */
  brighten(on: boolean): void;
  /** The brass plate's face, for the name laid onto it: top-left, top-right, bottom-right, bottom-left. */
  plateFace(): Vector3[];
}

export function buildRoom(words: { readonly name: string; readonly role: string }): Room {
  const group = new Group();
  const wall = flat('#f3e6cf');
  const ink = flat(INK);

  // The desk: its top's edge and its legs (the top's surface is the desk scene's own, deskTop()).
  const t = DTABLE;
  group.add(box(t.x1 - t.x0, t.thick, t.z1 - t.z0, flat('#d9c29b'), (t.x0 + t.x1) / 2, DESK_Y - t.thick / 2 - 0.01, (t.z0 + t.z1) / 2));
  const legH = DESK_Y - t.thick - DFLOOR;
  for (const x of [t.x0 + 8, t.x1 - 8]) for (const z of [t.z0 + 8, t.z1 - 8]) group.add(box(6, legH, 6, ink, x, DFLOOR + legH / 2, z));

  // The floor, the back wall with its window over the desk, the side walls.
  const floor = new Mesh(new PlaneGeometry(DROOM.x1 - DROOM.x0, DROOM.z1 - DROOM.z0), flat(OAK));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, DFLOOR, (DROOM.z0 + DROOM.z1) / 2);
  group.add(floor);
  const H = DROOM.height;
  const win = { x0: -1.2 * DM, x1: 1.2 * DM, y0: DFLOOR + 1.05 * DM, y1: DFLOOR + 2.3 * DM };
  const back = DROOM.z0 - 4;
  group.add(
    box(win.x0 - DROOM.x0, H, 8, wall, (DROOM.x0 + win.x0) / 2, DFLOOR + H / 2, back),
    box(DROOM.x1 - win.x1, H, 8, wall, (DROOM.x1 + win.x1) / 2, DFLOOR + H / 2, back),
    box(win.x1 - win.x0, win.y0 - DFLOOR, 8, wall, 0, (DFLOOR + win.y0) / 2, back),
    box(win.x1 - win.x0, DFLOOR + H - win.y1, 8, wall, 0, (win.y1 + DFLOOR + H) / 2, back),
  );
  // Through the window, the roofline and the grid outside (desk/furnish.ts): the frame and a deep sill here.
  group.add(
    box(win.x1 - win.x0 + 10, 6, 12, ink, 0, win.y0, back + 2),
    box(win.x1 - win.x0 + 10, 6, 12, ink, 0, win.y1, back + 2),
    box(win.x1 - win.x0 + 24, 4, 22, flat('#f4ead8'), 0, win.y0 - 4, back + 9),
  );
  for (const x of [win.x0, 0, win.x1]) group.add(box(6, win.y1 - win.y0, 12, ink, x, (win.y0 + win.y1) / 2, back + 2));
  for (const x of [DROOM.x0 - 4, DROOM.x1 + 4])
    group.add(box(8, H, DROOM.z1 - DROOM.z0, wall, x, DFLOOR + H / 2, (DROOM.z0 + DROOM.z1) / 2));
  // The ceiling, plain and pale.
  const ceiling = new Mesh(new PlaneGeometry(DROOM.x1 - DROOM.x0 + 16, DROOM.z1 - DROOM.z0 + 16), flat('#f6efe2'));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, DFLOOR + H, (DROOM.z0 + DROOM.z1) / 2);
  group.add(ceiling);
  // Skirting, in ink, round the room; and a dado rail in walnut, the wall under it a shade deeper.
  const under = flat('#dcc49c');
  const dado = DFLOOR + 0.9 * DM;
  const rail = flat('#6b4a2f');
  group.add(
    box(DROOM.x1 - DROOM.x0, 10, 3, ink, 0, DFLOOR + 5, DROOM.z0 + 1.5),
    box(win.x0 - DROOM.x0, dado - DFLOOR, 1, under, (DROOM.x0 + win.x0) / 2, (DFLOOR + dado) / 2, DROOM.z0 + 0.6),
    box(DROOM.x1 - win.x1, dado - DFLOOR, 1, under, (DROOM.x1 + win.x1) / 2, (DFLOOR + dado) / 2, DROOM.z0 + 0.6),
    box(win.x1 - win.x0, dado - DFLOOR, 1, under, 0, (DFLOOR + dado) / 2, DROOM.z0 + 0.6),
    box(DROOM.x1 - DROOM.x0, 5, 4, rail, 0, dado, DROOM.z0 + 2),
  );
  for (const x of [DROOM.x0, DROOM.x1]) {
    const side = Math.sign(x);
    group.add(
      box(1, dado - DFLOOR, DROOM.z1 - DROOM.z0, under, x - side * 0.6, (DFLOOR + dado) / 2, (DROOM.z0 + DROOM.z1) / 2),
      box(4, 5, DROOM.z1 - DROOM.z0, rail, x - side * 2, dado, (DROOM.z0 + DROOM.z1) / 2),
      box(3, 10, DROOM.z1 - DROOM.z0, ink, x - side * 1.5, DFLOOR + 5, (DROOM.z0 + DROOM.z1) / 2),
    );
  }

  // The chair, pushed back to the desk's end and turned towards the room: a swivel chair, coral
  // upholstered, on five ink feet.
  const chair = flat(INK);
  const cushion = flat('#e8665f');
  const seat = new Group();
  const sit = DFLOOR + 0.46 * DM;
  seat.add(
    box(52, 9, 50, cushion, 0, sit + 2, 0),
    box(46, 42, 8, cushion, 0, sit + 40, 24),
    box(5, 22, 5, chair, 0, sit + 14, 26),
    box(5, 0.42 * DM, 5, flat(SLATE), 0, DFLOOR + 0.21 * DM, 0),
  );
  for (let k = 0; k < 5; k++) {
    const foot = box(30, 3, 4, chair, 0, DFLOOR + 3, 0);
    foot.geometry.translate(15, 0, 0);
    foot.rotation.y = (k * Math.PI * 2) / 5;
    seat.add(foot);
  }
  seat.position.set(165, 0, 52);
  seat.rotation.y = 2.5;
  group.add(seat);

  // The door wall: the room's side of it here; the corridor's side, the door and the corridor's dressing
  // are the doorway (desk/doorway.ts), the same as the phone's door.
  const half = DDOOR.width / 2 + DDOOR.frame;
  const z = DROOM.z1;
  const W = 800;
  for (const side of [-1, 1]) {
    const w = W / 2 - half;
    group.add(box(w, H, 8, wall, side * (half + w / 2), DFLOOR + H / 2, z - 4));
  }
  const over = H - DDOOR.height - DDOOR.frame;
  group.add(box(2 * half, over, 8, wall, 0, DFLOOR + DDOOR.height + DDOOR.frame + over / 2, z - 4));
  const doorway = buildDoorway({ unit: DM, floor: DFLOOR, z, words });
  group.add(doorway.group);

  group.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) mesh.castShadow = false;
  });

  return {
    group,
    hinge: doorway.hinge,
    plantAt: doorway.plantAt,
    plantHeight: doorway.plantHeight,
    plateFace: () => doorway.plateFace(),
    brighten: (on) => doorway.brighten(on),
  };
}
