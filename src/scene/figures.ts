// Scale figures, as a model maker cuts them: a tapered card body and a faceted head, no face, no
// features, all alike. They stand for roles in the build (builder, reviewer), never for a person.

import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Vector2,
} from 'three';
import { PALETTE } from './light';

const BODY_HEIGHT = 1.44;
/** Model makers oversize figures a little so they read at a distance. */
const FIGURE_SCALE = 1.1;
/** Hip height: a seated figure sinks by this much less the seat. */
const HIP = 0.8;
// A turned silhouette: feet, legs, hips, waist, shoulders, neck. Seven facets, like cut card.
const body = new LatheGeometry(
  [
    [0.0, 0.0],
    [0.085, 0.0],
    [0.1, 0.1],
    [0.095, 0.45],
    [0.13, 0.78],
    [0.115, 0.95],
    [0.175, 1.3],
    [0.12, 1.39],
    [0.045, 1.42],
    [0.0, 1.44],
  ].map(([r, y]) => new Vector2(r, y)),
  7,
);
const head = new IcosahedronGeometry(0.125, 1);
const sheet = new PlaneGeometry(0.27, 0.36);
const corner = (() => {
  const g = new BufferGeometry();
  // The top-right corner of a sheet, struck in red pencil.
  g.setAttribute('position', new Float32BufferAttribute([0.135, 0.18, 0.002, 0.035, 0.18, 0.002, 0.135, 0.08, 0.002], 3));
  g.computeVertexNormals();
  return g;
})();

const cardMaterial = new MeshLambertMaterial({ color: PALETTE.card, flatShading: true });
const sheetMaterial = new MeshLambertMaterial({ color: '#f7f3ea', side: DoubleSide });
const markMaterial = new MeshBasicMaterial({ color: PALETTE.vermilion, side: DoubleSide, toneMapped: false });

export class Figure {
  readonly group = new Group();
  readonly body = new Mesh(body, cardMaterial);
  readonly head = new Mesh(head, cardMaterial);
  readonly sheet = new Mesh(sheet, sheetMaterial);
  readonly mark = new Mesh(corner, markMaterial);
  /** Smoothed pose, so queue shuffles and stand-ups never jump. */
  x = 0;
  z = 0;
  facing = 0;
  seated = 1;
  answer = 0;

  constructor() {
    this.group.add(this.body, this.head, this.sheet);
    this.sheet.add(this.mark);
    this.sheet.visible = false;
    this.mark.visible = false;
  }

  /**
   * Places the figure. seated runs 0 (standing) to 1 (in a chair); lean tips the body forward;
   * bob lifts it while walking.
   */
  pose(seated: number, lean: number, bob: number): void {
    const s = Math.max(0, Math.min(1, seated));
    // Seated, the hips sit on the chair (0.47) and the legs pass out of sight under the desk.
    const baseY = (0.47 - HIP) * s + bob;
    this.body.position.y = baseY;
    this.body.rotation.x = lean;
    const top = baseY + BODY_HEIGHT;
    this.head.position.set(0, top + 0.13, Math.sin(lean) * (BODY_HEIGHT - HIP) + 0.01);
    this.sheet.position.set(0, baseY + 1.08, 0.24);
    this.sheet.rotation.x = -0.35;
    this.group.position.set(this.x, 0, this.z);
    this.group.scale.setScalar(FIGURE_SCALE);
    this.group.rotation.y = this.facing;
  }
}

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
