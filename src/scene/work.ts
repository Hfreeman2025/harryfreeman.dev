// The work, not the people, moves in the replay. Each tool has one sheet: it lies on its desk while
// it is built, travels to the review table when handed in, and lies there in its own place (one per
// tool, so sheets never pile up) until reviewed; then it goes back to the desk tinted red when sent
// back, or on to the accepted board tinted green. A pure function of the replay, shared by the 3D
// room and the floor plan.

import { PIECE_IDS, type PieceId } from '../content/pieces';
import type { Phase } from '../timeline/replay';
import { BOARD, boardSlot, DESK, deskFor, REVIEW } from './layout';

type P = readonly [number, number, number];
export type Tint = 'paper' | 'returned' | 'accepted';

export interface SheetPose {
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** 0 lying flat; 1 upright on the board, facing the room. */
  readonly upright: number;
  readonly tint: Tint;
}

/** On its desk, to the right of the builder's hands. */
export function deskSpot(piece: PieceId): P {
  const d = deskFor(piece);
  return [d.x + 0.52, DESK.height + 0.004, d.z + 0.14];
}

/** Its own place on the review table: two rows of five, in desk order. */
export function tableSpot(piece: PieceId): P {
  const i = PIECE_IDS.indexOf(piece);
  const t = REVIEW.table;
  return [t.x - 0.8 + (i % 5) * 0.4, t.height + 0.004, t.z + (i < 5 ? -0.2 : 0.2)];
}

/** Its slot on the accepted board, just proud of the cork. */
export function boardSpot(piece: PieceId): P {
  const [x, y] = boardSlot(piece);
  return [x, y, BOARD.z + 0.05];
}

const smooth = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

/** A flight from a to b: eased along, lifted in an arc high enough to clear every monitor on the way. */
export function arc(a: P, b: P, t: number): P {
  const e = smooth(t);
  const dist = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const peak = 0.95 + 0.06 * dist;
  return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e + peak * Math.sin(Math.PI * e), a[2] + (b[2] - a[2]) * e];
}

const at = (p: P, tint: Tint, upright = 0): SheetPose => ({ visible: true, x: p[0], y: p[1], z: p[2], upright, tint });
const HIDDEN: SheetPose = { visible: false, x: 0, y: 0, z: 0, upright: 0, tint: 'paper' };

export function sheetPose(piece: PieceId, phase: Phase): SheetPose {
  switch (phase.kind) {
    case 'idle':
    case 'done':
      // Not started yet, or on the board (the board shows it).
      return HIDDEN;
    case 'building':
      return at(deskSpot(piece), phase.returned ? 'returned' : 'paper');
    case 'to-review':
      return at(arc(deskSpot(piece), tableSpot(piece), phase.progress), 'paper');
    case 'at-review':
      return at(tableSpot(piece), 'paper');
    case 'back':
      if (phase.outcome === 'returned') return at(arc(tableSpot(piece), deskSpot(piece), phase.progress), 'returned');
      return at(arc(tableSpot(piece), boardSpot(piece), phase.progress), 'accepted', smooth((phase.progress - 0.55) / 0.45));
  }
}
