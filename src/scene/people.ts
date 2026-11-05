// Scale figures, as an architect's model maker sets them: slim, correctly proportioned, matte
// stone-white and faceless, all alike. A builder sits at each desk; the reviewer stands at the review
// table. They stand for roles in the build, never for a person, and they do not walk: the work moves.
//
// Built from capsules between joints, so poses are plain numbers and the figures can be measured
// against the furniture without a browser (tests/people.test.ts).

import { CapsuleGeometry, Group, Mesh, MeshLambertMaterial, Quaternion, SphereGeometry, Vector3 } from 'three';
import { PALETTE } from './light';

type P = readonly [number, number, number];

const stone = new MeshLambertMaterial({ color: PALETTE.stone });
const UP = new Vector3(0, 1, 0);
const LIMB = 0.042;
const ARM = 0.032;

/** A capsule from one joint to another, its caps rounding the joints. */
function limb(from: P, to: P, radius: number): Mesh {
  const a = new Vector3(...from);
  const b = new Vector3(...to);
  const dir = b.clone().sub(a);
  const length = dir.length();
  const mesh = new Mesh(new CapsuleGeometry(radius, Math.max(0.001, length), 3, 8), stone);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.copy(new Quaternion().setFromUnitVectors(UP, dir.normalize()));
  return mesh;
}

/** The torso: a capsule flattened front to back, from the pelvis to the base of the neck. */
function torso(bottom: number, top: number, z = 0): Mesh {
  const r = 0.15;
  const mesh = new Mesh(new CapsuleGeometry(r, Math.max(0.001, top - bottom - 2 * r), 4, 10), stone);
  mesh.position.set(0, (bottom + top) / 2, z);
  mesh.scale.set(1.1, 1, 0.66);
  return mesh;
}

function head(y: number, z = 0): Mesh {
  const mesh = new Mesh(new SphereGeometry(0.1, 12, 10), stone);
  mesh.position.set(0, y, z);
  mesh.scale.set(0.88, 1.14, 0.98);
  return mesh;
}

export interface Figure {
  readonly group: Group;
  /** Everything above the hips, turned or leant as one. */
  readonly upper: Group;
  readonly head: Mesh;
}

/**
 * A builder seated at a desk, facing it (-z), the origin under the middle of the chair's seat. Thighs
 * rest on the seat (top 0.47), feet on the floor under the desk, forearms on the desk top (0.74),
 * which starts 0.38 m in front of the seat's middle.
 */
export function seatedFigure(): Figure {
  const group = new Group();
  for (const side of [-1, 1]) {
    const x = side * 0.09;
    group.add(
      limb([x, 0.537, 0.04], [x, 0.537, -0.37], LIMB + 0.022),
      limb([x, 0.537, -0.37], [x, 0.09, -0.41], LIMB),
      limb([x, 0.045, -0.4], [x, 0.045, -0.5], 0.038),
    );
  }
  const upper = new Group();
  upper.position.set(0, 0.6, 0.06);
  const h = head(0.67, -0.02);
  upper.add(torso(-0.07, 0.49), limb([0, 0.47, -0.01], [0, 0.53, -0.015], 0.04), h);
  for (const side of [-1, 1]) {
    const sx = side * 0.19;
    upper.add(
      limb([sx, 0.45, -0.02], [side * 0.21, 0.26, -0.2], ARM + 0.004),
      limb([side * 0.21, 0.26, -0.2], [side * 0.13, 0.177, -0.53], ARM),
    );
  }
  group.add(upper);
  return { group, upper, head: h };
}

/** The reviewer, standing behind the review table, facing the room (-z), hands clasped in front. */
export function standingFigure(): Figure {
  const group = new Group();
  for (const side of [-1, 1]) {
    const x = side * 0.09;
    group.add(
      limb([x, 0.9, 0], [x, 0.5, -0.01], LIMB + 0.012),
      limb([x, 0.5, -0.01], [x, 0.09, 0.01], LIMB),
      limb([x, 0.045, 0.02], [x, 0.045, -0.09], 0.038),
    );
  }
  const upper = new Group();
  upper.position.set(0, 0.92, 0);
  const h = head(0.75, -0.01);
  upper.add(torso(-0.07, 0.56), limb([0, 0.54, 0], [0, 0.61, -0.005], 0.04), h);
  for (const side of [-1, 1]) {
    upper.add(
      limb([side * 0.19, 0.52, 0], [side * 0.2, 0.24, -0.06], ARM + 0.004),
      limb([side * 0.2, 0.24, -0.06], [side * 0.05, 0.08, -0.15], ARM),
    );
  }
  group.add(upper);
  return { group, upper, head: h };
}

/** A builder at work turns a little now and then; the reviewer leans in to read. */
export function pose(figure: Figure, turn: number, lean: number, nod: number): void {
  figure.upper.rotation.set(-lean, turn, 0);
  figure.head.rotation.set(-nod, turn * 0.6, 0);
}

/** How a builder sits at a moment of the replay: the one at work turns a little and looks down. */
export function builderPose(working: boolean, t: number, i: number): { turn: number; lean: number; nod: number } {
  return working
    ? { turn: Math.sin(t * 0.55 + i * 1.7) * 0.07, lean: 0, nod: 0.18 + Math.sin(t * 0.9 + i) * 0.04 }
    : { turn: 0, lean: 0, nod: 0.05 };
}

/** The reviewer leans in to read while a review is due. */
export function reviewerPose(reviewing: boolean): { turn: number; lean: number; nod: number } {
  return reviewing ? { turn: 0, lean: 0.1, nod: 0.35 } : { turn: 0, lean: 0, nod: 0.08 };
}
