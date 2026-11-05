// Harry's office, around the desk: one continuous space with the desk scene, so the walk in from the
// door ends exactly on the desk's own seated view. The desk's units are millimetre-scale (125 to the
// metre: the seated view's camera, about 59 units above the desk top, is then a seated person's eyes, at
// 1.29 m), so the room is built to that scale: a long birch desk under the window, its legs to the floor,
// the walls, a chair, and the door in the near wall behind the chair, with the corridor outside. The same
// palette, lights and ink outlines as the desk. Nothing here casts a shadow: the sun's shadow covers the
// desk alone.

import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { DESK_Y } from './objects';
import { BLUE, CORAL, CREAM, INK, OAK, SLATE } from './palette';

/** Desk units to the metre. */
export const M = 125;
export const FLOOR = DESK_Y - 0.75 * M;
/** The desk's top: wide and deep enough that the seated view sees nothing but desk. */
export const TABLE = { x0: -110, x1: 110, z0: -52, z1: 52, thick: 4 } as const;
export const ROOM = { x0: -300, x1: 300, z0: -72, z1: 430, height: 2.6 * M } as const;
export const DOOR = { width: 0.92 * M, height: 2.08 * M, frame: 0.08 * M, thick: 0.045 * M } as const;
/** The brass plate on the door: its centre height and size. */
const PLATE = { y: 1.36 * M, width: 0.52 * M, height: 0.17 * M } as const;
const GLASS = { bottom: 1.52 * M, top: 1.94 * M, width: 0.56 * M } as const;

/** Outside the door: where the visitor stands, and where they look. */
export const OUTSIDE = {
  pos: new Vector3(0, FLOOR + 1.6 * M, ROOM.z1 + 3.3 * M),
  look: new Vector3(0, FLOOR + 1.12 * M, ROOM.z1),
} as const;

const flat = (color: string) => new MeshLambertMaterial({ color });
function box(w: number, h: number, d: number, material: Material, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}
function gradient(draw: (c: CanvasRenderingContext2D) => void): CanvasTexture {
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
  /** The brass plate's face, for the name laid onto it: top-left, top-right, bottom-right, bottom-left. */
  plateFace(): Vector3[];
}

export function buildRoom(): Room {
  const group = new Group();
  const wall = flat('#f3e6cf');
  const ink = flat(INK);

  // The desk: its top's edge and its legs (the top's surface is the desk scene's own, deskTop()).
  const t = TABLE;
  group.add(box(t.x1 - t.x0, t.thick, t.z1 - t.z0, flat('#d9c29b'), (t.x0 + t.x1) / 2, DESK_Y - t.thick / 2 - 0.01, (t.z0 + t.z1) / 2));
  const legH = DESK_Y - t.thick - FLOOR;
  for (const x of [t.x0 + 8, t.x1 - 8]) for (const z of [t.z0 + 8, t.z1 - 8]) group.add(box(6, legH, 6, ink, x, FLOOR + legH / 2, z));

  // The floor, the back wall with its window over the desk, the side walls.
  const floor = new Mesh(new PlaneGeometry(ROOM.x1 - ROOM.x0, ROOM.z1 - ROOM.z0), flat(OAK));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, FLOOR, (ROOM.z0 + ROOM.z1) / 2);
  group.add(floor);
  const H = ROOM.height;
  const win = { x0: -1.2 * M, x1: 1.2 * M, y0: FLOOR + 1.05 * M, y1: FLOOR + 2.3 * M };
  const back = ROOM.z0 - 4;
  group.add(
    box(win.x0 - ROOM.x0, H, 8, wall, (ROOM.x0 + win.x0) / 2, FLOOR + H / 2, back),
    box(ROOM.x1 - win.x1, H, 8, wall, (ROOM.x1 + win.x1) / 2, FLOOR + H / 2, back),
    box(win.x1 - win.x0, win.y0 - FLOOR, 8, wall, 0, (FLOOR + win.y0) / 2, back),
    box(win.x1 - win.x0, FLOOR + H - win.y1, 8, wall, 0, (win.y1 + FLOOR + H) / 2, back),
  );
  const sky = new Mesh(new PlaneGeometry(win.x1 - win.x0, win.y1 - win.y0), new MeshBasicMaterial({ color: '#a9d8ff' }));
  sky.position.set(0, (win.y0 + win.y1) / 2, back - 2);
  group.add(sky, box(win.x1 - win.x0 + 10, 6, 12, ink, 0, win.y0, back + 2), box(win.x1 - win.x0 + 10, 6, 12, ink, 0, win.y1, back + 2));
  for (const x of [win.x0, 0, win.x1]) group.add(box(6, win.y1 - win.y0, 12, ink, x, (win.y0 + win.y1) / 2, back + 2));
  for (const x of [ROOM.x0 - 4, ROOM.x1 + 4]) group.add(box(8, H, ROOM.z1 - ROOM.z0, wall, x, FLOOR + H / 2, (ROOM.z0 + ROOM.z1) / 2));
  // Skirting, in ink, round the room.
  group.add(box(ROOM.x1 - ROOM.x0, 10, 3, ink, 0, FLOOR + 5, ROOM.z0 + 1.5));

  // The chair, pulled out for you and turned towards the door, to one side of where you sit.
  const chair = flat(INK);
  const seat = new Group();
  seat.add(
    box(62, 8, 60, chair, 0, FLOOR + 0.46 * M, 0),
    box(60, 66, 8, chair, 0, FLOOR + 0.46 * M + 40, 30),
    box(6, 0.46 * M, 6, flat(SLATE), 0, FLOOR + 0.23 * M, 0),
    box(60, 4, 60, chair, 0, FLOOR + 2, 0),
  );
  seat.position.set(62, 0, 112);
  seat.rotation.y = -0.6;
  group.add(seat);

  // The door wall: the room's side of it inside, the corridor's outside, round the doorway.
  const half = DOOR.width / 2 + DOOR.frame;
  const z = ROOM.z1;
  const W = 800;
  for (const side of [-1, 1]) {
    const w = W / 2 - half;
    const x = side * (half + w / 2);
    group.add(box(w, H, 8, wall, x, FLOOR + H / 2, z - 4));
    // Outside: cream above a blue dado, an ink rail and skirting.
    group.add(box(w, H - 1.0 * M, 6, flat(CREAM), x, FLOOR + 1.0 * M + (H - 1.0 * M) / 2, z + 3));
    group.add(box(w, 1.0 * M, 7, flat(BLUE), x, FLOOR + 0.5 * M, z + 3.5));
    group.add(box(w, 6, 10, ink, x, FLOOR + 1.0 * M, z + 4));
    group.add(box(w, 12, 9, ink, x, FLOOR + 6, z + 4));
  }
  const over = H - DOOR.height - DOOR.frame;
  group.add(box(2 * half, over, 8, wall, 0, FLOOR + DOOR.height + DOOR.frame + over / 2, z - 4));
  group.add(box(2 * half, over, 6, flat(CREAM), 0, FLOOR + DOOR.height + DOOR.frame + over / 2, z + 3));
  // The frame.
  group.add(
    box(DOOR.frame, DOOR.height + DOOR.frame, 20, ink, -DOOR.width / 2 - DOOR.frame / 2, FLOOR + (DOOR.height + DOOR.frame) / 2, z),
    box(DOOR.frame, DOOR.height + DOOR.frame, 20, ink, DOOR.width / 2 + DOOR.frame / 2, FLOOR + (DOOR.height + DOOR.frame) / 2, z),
    box(DOOR.width + 2 * DOOR.frame, DOOR.frame, 20, ink, 0, FLOOR + DOOR.height + DOOR.frame / 2, z),
  );
  // The corridor's floor, the doormat, and the room's warm light spilling under the door.
  const corridor = new Mesh(new PlaneGeometry(W, 6 * M), flat('#d8cfbf'));
  corridor.rotation.x = -Math.PI / 2;
  corridor.position.set(0, FLOOR, z + 3 * M);
  group.add(
    corridor,
    box(1.04 * M, 1.5, 0.66 * M, ink, 0, FLOOR + 0.75, z + 0.42 * M),
    box(0.98 * M, 2.2, 0.6 * M, flat(CORAL), 0, FLOOR + 1.1, z + 0.42 * M),
  );
  const spill = new Mesh(
    new PlaneGeometry(1.6 * M, 1.1 * M),
    new MeshBasicMaterial({
      map: gradient((c) => {
        const r = c.createRadialGradient(128, 0, 0, 128, 0, 200);
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
  );
  spill.rotation.x = -Math.PI / 2;
  spill.position.set(0, FLOOR + 2.6, z + 0.55 * M);
  spill.userData.noEdge = true;
  group.add(spill);

  // The door: an oak leaf hung on its left edge as you face it from the corridor, opening into the room.
  const hinge = new Group();
  hinge.position.set(-DOOR.width / 2, FLOOR, z - 2);
  const leaf = box(DOOR.width, DOOR.height, DOOR.thick, flat(OAK), DOOR.width / 2, DOOR.height / 2, 0);
  const panel = flat('#c58a4d');
  const face = DOOR.thick / 2;
  hinge.add(
    leaf,
    box(DOOR.width - 0.24 * M, 0.5 * M, 1.5, panel, DOOR.width / 2, 0.42 * M, face + 0.75),
    box(DOOR.width - 0.24 * M, 0.32 * M, 1.5, panel, DOOR.width / 2, 1.0 * M, face + 0.75),
  );
  const frost = gradient((c) => {
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#fff3d6');
    g.addColorStop(1, '#ffd99a');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 9; i++) c.fillRect(0, 14 + i * 28, 256, 6);
  });
  const glass = new Mesh(new PlaneGeometry(GLASS.width, GLASS.top - GLASS.bottom), new MeshBasicMaterial({ map: frost }));
  glass.position.set(DOOR.width / 2, (GLASS.top + GLASS.bottom) / 2, face + 0.3);
  hinge.add(
    glass,
    box(GLASS.width + 6, 4, 2.5, ink, DOOR.width / 2, GLASS.top + 2, face + 1),
    box(GLASS.width + 6, 4, 2.5, ink, DOOR.width / 2, GLASS.bottom - 2, face + 1),
  );
  const plate = box(
    PLATE.width,
    PLATE.height,
    1.2,
    new MeshLambertMaterial({ color: '#e0b24a', emissive: '#3a2a06' }),
    DOOR.width / 2,
    PLATE.y,
    face + 1.2,
  );
  hinge.add(box(PLATE.width + 3, PLATE.height + 3, 1, flat('#a9791f'), DOOR.width / 2, PLATE.y, face + 0.5), plate);
  const steel = flat(SLATE);
  hinge.add(
    box(0.07 * M, 0.07 * M, 2.5, steel, DOOR.width - 0.09 * M, 1.0 * M, face + 1.25),
    box(0.14 * M, 0.022 * M, 0.022 * M, steel, DOOR.width - 0.15 * M, 1.0 * M, face + 0.05 * M),
    box(0.022 * M, 0.022 * M, 0.05 * M, steel, DOOR.width - 0.09 * M, 1.0 * M, face + 0.03 * M),
  );
  group.add(hinge);
  group.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) mesh.castShadow = false;
  });

  return {
    group,
    hinge,
    plateFace() {
      plate.updateMatrixWorld(true);
      const hw = PLATE.width / 2 - 2.5;
      const hh = PLATE.height / 2 - 1.5;
      return [
        [-hw, hh],
        [hw, hh],
        [hw, -hh],
        [-hw, -hh],
      ].map(([x = 0, y = 0]) => new Vector3(x, y, 0.65).applyMatrix4(plate.matrixWorld));
    },
  };
}
