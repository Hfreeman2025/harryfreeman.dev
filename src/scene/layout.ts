// The studio's plan, in metres at full size (the model is 1:50). One source for the renderer and
// the light bake: every static object is a set of axis-aligned boxes, so the bake can ray-trace
// them exactly and the renderer can instance them.

import { PIECE_IDS, type PieceId } from '../content/pieces';

export type Vec3 = readonly [number, number, number];
export type Material = 'card' | 'wood' | 'grey' | 'dark' | 'cork' | 'screen';

export interface Box {
  readonly min: Vec3;
  readonly max: Vec3;
  readonly material: Material;
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

/** The review table at the front, the reviewer behind it (facing -z), hand-overs in front of it. */
export const REVIEW = {
  table: { x: 0, z: 3.05, width: 2.2, depth: 0.9 },
  reviewer: [0, 3.8] as const,
  /** Where a builder stands to hand work over (slot 0), then the queue behind. */
  slots: [
    [0, 2.3],
    [-0.75, 2.05],
    [-1.45, 2.05],
    [-2.15, 2.05],
    [0.75, 2.05],
    [1.45, 2.05],
    [-2.85, 2.05],
    [2.15, 2.05],
    [-1.6, 2.75],
    [-2.3, 2.75],
  ] as const,
} as const;

/** The accepted board: a pinboard on legs to the right of the review table, facing the room's front. */
export const BOARD = { x: 3.4, z: 3.35, width: 2.0, height: 0.95, bottom: 0.95 } as const;

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

function box(min: Vec3, max: Vec3, material: Material): Box {
  return { min, max, material };
}

function deskBoxes(d: DeskPlan): Box[] {
  const hw = DESK.width / 2;
  const hd = DESK.depth / 2;
  const top = DESK.height;
  const leg = 0.05;
  const boxes: Box[] = [
    box([d.x - hw, top - DESK.top, d.z - hd], [d.x + hw, top, d.z + hd], 'card'),
    // Two panel legs, as a model maker would cut them.
    box([d.x - hw, 0, d.z - hd + 0.04], [d.x - hw + leg, top - DESK.top, d.z + hd - 0.04], 'card'),
    box([d.x + hw - leg, 0, d.z - hd + 0.04], [d.x + hw, top - DESK.top, d.z + hd - 0.04], 'card'),
    // Monitor: stand, then the screen's housing.
    box([d.x - 0.12, top, d.z - 0.3], [d.x + 0.12, top + 0.02, d.z - 0.12], 'dark'),
    box([d.x - 0.03, top, d.z - 0.24], [d.x + 0.03, SCREEN.bottom, d.z - 0.2], 'dark'),
    box(
      [d.x - SCREEN.width / 2 - 0.02, SCREEN.bottom - 0.02, d.z - 0.21],
      [d.x + SCREEN.width / 2 + 0.02, SCREEN.bottom + SCREEN.height + 0.02, d.z - 0.17],
      'dark',
    ),
    // Chair: seat, stem, back.
    box([d.seat[0] - 0.24, 0.42, d.seat[1] - 0.22], [d.seat[0] + 0.24, 0.47, d.seat[1] + 0.22], 'grey'),
    box([d.seat[0] - 0.03, 0, d.seat[1] - 0.03], [d.seat[0] + 0.03, 0.42, d.seat[1] + 0.03], 'grey'),
    box([d.seat[0] - 0.22, 0.47, d.seat[1] + 0.2], [d.seat[0] + 0.22, 0.74, d.seat[1] + 0.25], 'grey'),
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
  const [rx, rz] = REVIEW.reviewer;
  boxes.push(
    box([rx - 0.24, 0.42, rz - 0.22], [rx + 0.24, 0.47, rz + 0.22], 'grey'),
    box([rx - 0.03, 0, rz - 0.03], [rx + 0.03, 0.42, rz + 0.03], 'grey'),
    box([rx - 0.22, 0.47, rz + 0.2], [rx + 0.22, 0.74, rz + 0.25], 'grey'),
  );

  const b = BOARD;
  boxes.push(
    box([b.x - b.width / 2, b.bottom, b.z - 0.02], [b.x + b.width / 2, b.bottom + b.height, b.z + 0.02], 'cork'),
    box([b.x - b.width / 2 + 0.1, 0, b.z - 0.03], [b.x - b.width / 2 + 0.15, b.bottom, b.z + 0.03], 'dark'),
    box([b.x + b.width / 2 - 0.15, 0, b.z - 0.03], [b.x + b.width / 2 - 0.1, b.bottom, b.z + 0.03], 'dark'),
  );

  const bt = BRIEF.table;
  boxes.push(
    box([bt.x - bt.width / 2, bt.height - 0.05, bt.z - bt.depth / 2], [bt.x + bt.width / 2, bt.height, bt.z + bt.depth / 2], 'wood'),
    box([bt.x - bt.width / 2 + 0.05, 0, bt.z - 0.05], [bt.x - bt.width / 2 + 0.1, bt.height - 0.05, bt.z + 0.05], 'dark'),
    box([bt.x + bt.width / 2 - 0.1, 0, bt.z - 0.05], [bt.x + bt.width / 2 - 0.05, bt.height - 0.05, bt.z + 0.05], 'dark'),
  );
  return boxes;
}

/** Walking routes: from a seat, out into the aisle behind the row, along it, down a gap between desks, to a slot. */
export function routeToReview(piece: PieceId, slot: readonly [number, number]): Array<readonly [number, number]> {
  const d = deskFor(piece);
  const aisleZ = d.z + 1.32;
  // The gap between desks nearest the centre: desks are 2.6 apart, so gaps sit at ±1.3 and ±3.9.
  const gapX = d.x === 0 ? 1.3 : d.x > 0 ? d.x - 1.3 : d.x + 1.3;
  const points: Array<readonly [number, number]> = [d.seat, [d.x, aisleZ]];
  if (d.row === 0) {
    points.push([gapX, aisleZ], [gapX, 1.75]);
  } else {
    points.push([gapX === 0 ? 0 : gapX, aisleZ]);
  }
  points.push([slot[0], Math.max(1.75, slot[1] - 0.25)], slot);
  return points;
}
