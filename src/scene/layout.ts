// The studio's plan, in metres at full size (the model is 1:50). One source for the renderer and
// the light bake: every static object is a set of axis-aligned boxes, so the bake can ray-trace
// them exactly and the renderer can instance them.

import { PIECE_IDS, type PieceId } from '../content/pieces';

export type Vec3 = readonly [number, number, number];
export type Material = 'card' | 'wood' | 'grey' | 'dark' | 'cork' | 'screen' | 'steel' | 'radio';

export interface Box {
  readonly min: Vec3;
  readonly max: Vec3;
  readonly material: Material;
  /** What it is part of, so a style can swap a desk or a chair for a model of one. */
  readonly part?: 'desk' | 'chair' | 'monitor';
}

export const ROOM = { x0: -7, x1: 7, z0: -4.5, z1: 4.5 } as const;
export const BASE = { x0: -7.7, x1: 7.7, z0: -5.2, z1: 5.5, thickness: 0.14 } as const;
export const WALL = { thickness: 0.12, back: 2.6, side: 1.0, front: 0.3 } as const;

/** The lamp: a disc light above and in front of the model, aimed at its centre. */
export const LAMP = {
  position: [-3.5, 16, 6.5] as Vec3,
  target: [0, 0, -0.2] as Vec3,
  radius: 2.2,
  /** Half-angle of the shade's cone, and the width of its soft edge, in radians. */
  cone: 0.37,
  edge: 0.25,
} as const;

export const DESK = { width: 1.6, depth: 0.8, height: 0.74, top: 0.05 } as const;
export const SCREEN = { width: 0.92, height: 0.575, bottom: 0.93 } as const;

const ROW_Z = [-2.35, 0.45] as const;
const COL_X = [-5.2, -2.6, 0, 2.6, 5.2] as const;

export interface DeskPlan {
  readonly piece: PieceId;
  /** Desk centre on the floor. */
  readonly x: number;
  readonly z: number;
  readonly row: 0 | 1;
  /** Where the builder sits, facing the screen (towards -z). */
  readonly seat: readonly [number, number];
  /** Centre of the screen face, which looks towards +z. */
  readonly screen: Vec3;
}

export const DESKS: readonly DeskPlan[] = PIECE_IDS.map((piece, i) => {
  const row = (i < 5 ? 0 : 1) as 0 | 1;
  const x = COL_X[i % 5] ?? 0;
  const z = ROW_Z[row];
  return {
    piece,
    x,
    z,
    row,
    seat: [x, z + 0.78] as const,
    screen: [x, SCREEN.bottom + SCREEN.height / 2, z - 0.16] as const,
  };
});

export function deskFor(piece: PieceId): DeskPlan {
  const desk = DESKS.find((d) => d.piece === piece);
  if (!desk) throw new Error(`no desk for ${piece}`);
  return desk;
}

/** The review table at the front; the reviewer stands behind it, facing the room (-z). */
export const REVIEW = {
  table: { x: 0, z: 3.05, width: 2.2, depth: 0.9, height: 0.76 },
  reviewer: [0, 3.72] as const,
} as const;

/** The accepted board: a cork board on the back wall, right of the briefs. */
export const BOARD = { x: 4.1, z: ROOM.z0 + 0.03, width: 2.0, height: 0.95, bottom: 1.05 } as const;

/**
 * The filing cabinet, the room's hero: a lateral file just inside the door on the left, facing it,
 * with room in front for its drawers to come out short of the front wall.
 */
export const CABINET = { x: -2.5, z: 3.2, width: 1.6, height: 2.0, depth: 0.8, drawers: 4, plinth: 0.08 } as const;

/** Reception: a counter just inside the door on the right. */
export const RECEPTION = { x: 3.7, z: 3.45, width: 2.1, depth: 0.72, height: 1.02 } as const;

/** The grid sign: a printed board on the back wall, left; the radio on a shelf beside it. */
export const SIGN = { x: -4.5, y: 1.72, width: 2.3, height: 1.25 } as const;
export const SHELF = { x: -2.35, y: 1.35, width: 0.8, depth: 0.3 } as const;
export const RADIO = { x: -2.35, width: 0.52, height: 0.32, depth: 0.22 } as const;

/** A soft key light on the cabinet, so the eye lands there first. Baked into the floor like the lamp. */
export const KEY = {
  position: [CABINET.x + 1.7, 5.4, CABINET.z + 3.6] as Vec3,
  target: [CABINET.x, 0.6, CABINET.z] as Vec3,
  radius: 0.9,
  cone: 0.24,
  edge: 0.3,
  /** Its strength, as a share of the lamp's at its own target. */
  strength: 0.55,
} as const;

/** The brief: a drafting table against the back wall with the three briefs pinned above it. */
export const BRIEF = {
  table: { x: 0, z: -3.85, width: 1.9, depth: 0.85, height: 0.9 },
  sheets: [
    { doc: 'BRIEF.md', x: -0.95 },
    { doc: 'V2.md', x: 0 },
    { doc: 'V3.md', x: 0.95 },
  ],
  sheetY: 1.72,
  sheetSize: [0.72, 1.02] as const,
} as const;

/** Sheet slots on the accepted board, one per piece, in desk order. */
export function boardSlot(piece: PieceId): Vec3 {
  const i = PIECE_IDS.indexOf(piece);
  const col = i % 5;
  const row = Math.floor(i / 5);
  const x = BOARD.x - BOARD.width / 2 + 0.24 + col * 0.38;
  const y = BOARD.bottom + BOARD.height - 0.3 - row * 0.46;
  return [x, y, BOARD.z + 0.035];
}

function box(min: Vec3, max: Vec3, material: Material, part?: Box['part']): Box {
  return part ? { min, max, material, part } : { min, max, material };
}

function deskBoxes(d: DeskPlan): Box[] {
  const hw = DESK.width / 2;
  const hd = DESK.depth / 2;
  const top = DESK.height;
  const leg = 0.05;
  const boxes: Box[] = [
    box([d.x - hw, top - DESK.top, d.z - hd], [d.x + hw, top, d.z + hd], 'card', 'desk'),
    // Two panel legs, as a model maker would cut them.
    box([d.x - hw, 0, d.z - hd + 0.04], [d.x - hw + leg, top - DESK.top, d.z + hd - 0.04], 'card', 'desk'),
    box([d.x + hw - leg, 0, d.z - hd + 0.04], [d.x + hw, top - DESK.top, d.z + hd - 0.04], 'card', 'desk'),
    // Monitor: stand, then the screen's housing.
    box([d.x - 0.12, top, d.z - 0.3], [d.x + 0.12, top + 0.02, d.z - 0.12], 'dark', 'monitor'),
    box([d.x - 0.03, top, d.z - 0.24], [d.x + 0.03, SCREEN.bottom, d.z - 0.2], 'dark', 'monitor'),
    box(
      [d.x - SCREEN.width / 2 - 0.02, SCREEN.bottom - 0.02, d.z - 0.21],
      [d.x + SCREEN.width / 2 + 0.02, SCREEN.bottom + SCREEN.height + 0.02, d.z - 0.17],
      'dark',
      'monitor',
    ),
    // Chair: seat, stem, back.
    box([d.seat[0] - 0.24, 0.42, d.seat[1] - 0.22], [d.seat[0] + 0.24, 0.47, d.seat[1] + 0.22], 'grey', 'chair'),
    box([d.seat[0] - 0.03, 0, d.seat[1] - 0.03], [d.seat[0] + 0.03, 0.42, d.seat[1] + 0.03], 'grey', 'chair'),
    box([d.seat[0] - 0.22, 0.47, d.seat[1] + 0.2], [d.seat[0] + 0.22, 0.74, d.seat[1] + 0.25], 'grey', 'chair'),
  ];
  return boxes;
}

/** Every static box in the model. Figures, sheets and screens' images are not here: they move or glow. */
export function staticBoxes(): Box[] {
  const t = WALL.thickness;
  const boxes: Box[] = [
    // Walls, cut low at the sides and front as in a sectional model; the back stays full height.
    box([ROOM.x0 - t, 0, ROOM.z0 - t], [ROOM.x1 + t, WALL.back, ROOM.z0], 'card'),
    box([ROOM.x0 - t, 0, ROOM.z0], [ROOM.x0, WALL.side, ROOM.z1 + t], 'card'),
    box([ROOM.x1, 0, ROOM.z0], [ROOM.x1 + t, WALL.side, ROOM.z1 + t], 'card'),
    box([ROOM.x0, 0, ROOM.z1], [-0.8, WALL.front, ROOM.z1 + t], 'card'),
    box([0.8, 0, ROOM.z1], [ROOM.x1, WALL.front, ROOM.z1 + t], 'card'),
  ];
  for (const d of DESKS) boxes.push(...deskBoxes(d));

  const r = REVIEW.table;
  boxes.push(
    box([r.x - r.width / 2, 0.71, r.z - r.depth / 2], [r.x + r.width / 2, 0.76, r.z + r.depth / 2], 'wood'),
    box([r.x - r.width / 2, 0, r.z - r.depth / 2 + 0.05], [r.x - r.width / 2 + 0.05, 0.71, r.z + r.depth / 2 - 0.05], 'wood'),
    box([r.x + r.width / 2 - 0.05, 0, r.z - r.depth / 2 + 0.05], [r.x + r.width / 2, 0.71, r.z + r.depth / 2 - 0.05], 'wood'),
  );

  const b = BOARD;
  boxes.push(box([b.x - b.width / 2, b.bottom, ROOM.z0], [b.x + b.width / 2, b.bottom + b.height, ROOM.z0 + 0.04], 'cork'));

  // The cabinet's carcass (its drawers move, so they are drawn live), the counter, the shelf, the
  // radio and the sign plate.
  const c = CABINET;
  boxes.push(box([c.x - c.width / 2, 0, c.z - c.depth / 2], [c.x + c.width / 2, c.height, c.z + c.depth / 2], 'steel'));
  const rc = RECEPTION;
  boxes.push(
    box([rc.x - rc.width / 2, 0, rc.z - rc.depth / 2], [rc.x + rc.width / 2, rc.height, rc.z + rc.depth / 2], 'wood'),
    box(
      [rc.x - rc.width / 2 - 0.03, rc.height, rc.z - rc.depth / 2 - 0.03],
      [rc.x + rc.width / 2 + 0.03, rc.height + 0.04, rc.z + rc.depth / 2 + 0.03],
      'card',
    ),
  );
  boxes.push(
    box([SHELF.x - SHELF.width / 2, SHELF.y - 0.04, ROOM.z0], [SHELF.x + SHELF.width / 2, SHELF.y, ROOM.z0 + SHELF.depth], 'wood'),
    box(
      [RADIO.x - RADIO.width / 2, SHELF.y, ROOM.z0 + 0.04],
      [RADIO.x + RADIO.width / 2, SHELF.y + RADIO.height, ROOM.z0 + 0.04 + RADIO.depth],
      'radio',
    ),
    box(
      [SIGN.x - SIGN.width / 2, SIGN.y - SIGN.height / 2, ROOM.z0],
      [SIGN.x + SIGN.width / 2, SIGN.y + SIGN.height / 2, ROOM.z0 + 0.025],
      'card',
    ),
  );

  const bt = BRIEF.table;
  boxes.push(
    box([bt.x - bt.width / 2, bt.height - 0.05, bt.z - bt.depth / 2], [bt.x + bt.width / 2, bt.height, bt.z + bt.depth / 2], 'wood'),
    box([bt.x - bt.width / 2 + 0.05, 0, bt.z - 0.05], [bt.x - bt.width / 2 + 0.1, bt.height - 0.05, bt.z + 0.05], 'dark'),
    box([bt.x + bt.width / 2 - 0.1, 0, bt.z - 0.05], [bt.x + bt.width / 2 - 0.05, bt.height - 0.05, bt.z + 0.05], 'dark'),
  );
  return boxes;
}
