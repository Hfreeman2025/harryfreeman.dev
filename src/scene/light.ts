// Colours and the lamps' shades, shared by the bake (Node) and the renderer (browser). The room is an
// architect's study model on a sheet of paper: card walls, a balsa floor, stone-white figures.

export const PALETTE = {
  /** The paper the model sits on, and the page around it. */
  paper: '#e8e3d9',
  surround: '#ebe7e0',
  card: '#ece6da',
  basswood: '#d5bf98',
  grey: '#c9c3b7',
  dark: '#2b2824',
  cork: '#bf9a6e',
  stone: '#eeeae3',
  /** The lamp's light, and the soft daylight the paper gives back. */
  lamp: '#fff3e2',
  ambient: '#8c8f93',
  amber: '#e9ad45',
  /** Work sent back and work accepted, as tints on a sheet. */
  returned: '#e38a74',
  accepted: '#8fc79a',
} as const;

/** The paper under the model. */
export const GROUND = {
  y: -0.15,
  x0: -24,
  x1: 24,
  z0: -18,
  z1: 20,
} as const;

/** Soft-edged cone of a lamp's shade: 1 inside, 0 outside, smooth between. */
export function lampCone(
  fromLamp: readonly [number, number, number],
  axis: readonly [number, number, number],
  cone = 0.37,
  edge = 0.25,
): number {
  const cos = fromLamp[0] * axis[0] + fromLamp[1] * axis[1] + fromLamp[2] * axis[2];
  const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
  const inner = cone - edge;
  const outer = cone + edge;
  if (angle <= inner) return 1;
  if (angle >= outer) return 0;
  const t = (angle - inner) / (outer - inner);
  return 1 - t * t * (3 - 2 * t);
}

/** Light the white card bounces back into the room, as a share of the lamp's (linear). */
export const BOUNCE = 0.3;
