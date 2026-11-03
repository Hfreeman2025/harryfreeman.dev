// Walking routes and headings, shared by the 3D figures and the floor plan's dots.

/** Turn toward an angle the short way round. */
export function approachAngle(current: number, target: number, rate: number): number {
  let d = target - current;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return current + d * rate;
}

export interface Route {
  readonly points: ReadonlyArray<readonly [number, number]>;
  readonly lengths: readonly number[];
  readonly total: number;
}

export function makeRoute(points: ReadonlyArray<readonly [number, number]>): Route {
  const lengths: number[] = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
    lengths.push(total);
  }
  return { points, lengths, total };
}

/** Position and heading at a share t (0..1) of the way along a route, eased at both ends. */
export function along(route: Route, t: number, reverse = false): { x: number; z: number; facing: number } {
  const clamped = Math.max(0, Math.min(1, t));
  const eased = clamped * clamped * (3 - 2 * clamped);
  const distance = (reverse ? 1 - eased : eased) * route.total;
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1];
    const b = route.points[i];
    const l0 = route.lengths[i - 1] ?? 0;
    const l1 = route.lengths[i] ?? 0;
    if (!a || !b) continue;
    if (distance <= l1 || i === route.points.length - 1) {
      const f = l1 > l0 ? (distance - l0) / (l1 - l0) : 1;
      const dx = (b[0] - a[0]) * (reverse ? -1 : 1);
      const dz = (b[1] - a[1]) * (reverse ? -1 : 1);
      return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, facing: Math.atan2(dx, dz) };
    }
  }
  const last = route.points.at(-1) ?? [0, 0];
  return { x: last[0], z: last[1], facing: 0 };
}
