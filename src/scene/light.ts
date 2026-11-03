// Colours and the lamp's shade, shared by the bake (Node) and the renderer (browser).

export const PALETTE = {
  room: '#15120e',
  bench: '#2a2119',
  mat: '#1e4536',
  matLine: '#5d8a72',
  card: '#ece6da',
  basswood: '#cfb68b',
  grey: '#a9a49b',
  dark: '#26231f',
  cork: '#b48a5c',
  /** The lamp's light and the cool fill from the dark room. */
  lamp: '#fff1dc',
  ambient: '#3a4049',
  amber: '#f2b544',
  vermilion: '#e0563a',
} as const;

/** The workbench plane under the model, and the cutting mat on it. */
export const GROUND = {
  y: -0.15,
  x0: -20,
  x1: 20,
  z0: -15,
  z1: 16,
  mat: { x0: -9.5, x1: 9.5, z0: -6.8, z1: 7.4 },
} as const;

/** Soft-edged cone of the lamp's shade: 1 inside, 0 outside, smooth between. */
export function lampCone(fromLamp: readonly [number, number, number], axis: readonly [number, number, number]): number {
  const cos = fromLamp[0] * axis[0] + fromLamp[1] * axis[1] + fromLamp[2] * axis[2];
  const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
  const inner = 0.37 - 0.25;
  const outer = 0.37 + 0.25;
  if (angle <= inner) return 1;
  if (angle >= outer) return 0;
  const t = (angle - inner) / (outer - inner);
  return 1 - t * t * (3 - 2 * t);
}

/** Light the white card bounces back into the room, as a share of the lamp's (linear). */
export const BOUNCE = 0.24;
