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

export { along, approachAngle, makeRoute, type Route } from './routes';
