// The filing cabinet, in three.js: four drawers that slide out, each holding its tools as manila
// hanging folders with tabs cut left, centre and right. The carcass is a static box (baked into the
// floor's light); drawers, folders and the dark openings they leave are live.

import {
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
import { DRAWERS } from '../content/drawers';
import type { PieceId } from '../content/pieces';
import { CABINET } from './layout';

const GAP = 0.03;
const DRAWER_H = (CABINET.height - CABINET.plinth - GAP * (CABINET.drawers + 1)) / CABINET.drawers;
const FRONT_W = CABINET.width - 0.08;
const FRONT_Z = CABINET.z + CABINET.depth / 2;
const TRAY_DEPTH = CABINET.depth - 0.08;
/** How far a drawer comes out, and how far a chosen folder rises. */
export const PULL = 0.52;
export const LIFT = 0.17;
const FOLDER_GAP = 0.15;

const steel = new MeshLambertMaterial({ color: '#b9bdb1' });
const steelInside = new MeshLambertMaterial({ color: '#7b8075' });
const chrome = new MeshLambertMaterial({ color: '#e4e6e2' });
const manila = new MeshLambertMaterial({ color: '#e6cb92' });
const manilaTab = new MeshLambertMaterial({ color: '#efd8a6' });
const cavity = new MeshBasicMaterial({ color: '#23251f' });

function labelTexture(text: string): CanvasTexture {
  // Large enough to read from the door: the card in each drawer's holder, in Plex Sans Condensed.
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f8f7f1';
    ctx.fillRect(0, 0, 1024, 200);
    ctx.strokeStyle = '#7d8277';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 1014, 190);
    ctx.fillStyle = '#1e2225';
    let size = 120;
    const font = (px: number) => `600 ${px}px "IBM Plex Sans Condensed", "Arial Narrow", sans-serif`;
    ctx.font = font(size);
    while (size > 40 && ctx.measureText(text).width > 960) ctx.font = font(--size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, 106);
  }
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

interface FolderObject {
  readonly piece: PieceId;
  readonly group: Group;
  readonly tab: Mesh;
  lift: number;
  liftTarget: number;
}

interface DrawerObject {
  readonly id: string;
  readonly group: Group;
  readonly front: Mesh;
  readonly opening: Mesh;
  readonly folders: FolderObject[];
  out: number;
  outTarget: number;
}

export class Cabinet {
  /** Stands at the cabinet's middle, turned to its facing; everything else hangs off `#body`. */
  readonly group = new Group();
  readonly #body = new Group();
  readonly drawers: DrawerObject[] = [];
  /** Meshes a pointer can hit, each tagged with what it stands for. */
  readonly pickables: Mesh[] = [];
  /** The angle it is turned through, about its middle: 0 faces the front of the room. */
  readonly facing: number;

  /**
   * `facing` turns the whole cabinet in its corner (a style frame turns it to the view from the door);
   * `carcass` draws its body live, when the baked box (which cannot turn) is left out.
   */
  constructor(facing = 0, carcass = false) {
    this.facing = facing;
    this.group.position.set(CABINET.x, 0, CABINET.z);
    this.group.rotation.y = facing;
    this.#body.position.set(-CABINET.x, 0, -CABINET.z);
    this.group.add(this.#body);
    if (carcass) {
      const body = new Mesh(new BoxGeometry(CABINET.width, CABINET.height, CABINET.depth), steel);
      body.position.set(CABINET.x, CABINET.height / 2, CABINET.z);
      this.#body.add(body);
    }
    DRAWERS.forEach((d, i) => {
      const top = CABINET.height - GAP - i * (DRAWER_H + GAP);
      const centreY = top - DRAWER_H / 2;
      // The dark opening a pulled drawer leaves in the carcass.
      const opening = new Mesh(new PlaneGeometry(FRONT_W, DRAWER_H), cavity);
      opening.position.set(CABINET.x, centreY, FRONT_Z + 0.002);
      opening.visible = false;
      this.#body.add(opening);

      const group = new Group();
      group.position.set(CABINET.x, centreY, 0);
      const front = new Mesh(new BoxGeometry(FRONT_W, DRAWER_H - 0.012, 0.03), steel);
      front.position.set(0, 0, FRONT_Z + 0.015);
      front.userData.target = `drawer:${d.id}`;
      const plate = new Mesh(
        new PlaneGeometry(FRONT_W * 0.92, DRAWER_H * 0.58),
        new MeshBasicMaterial({ map: labelTexture(d.label), toneMapped: false }),
      );
      plate.position.set(0, DRAWER_H * 0.1, FRONT_Z + 0.031);
      plate.userData.target = `drawer:${d.id}`;
      const handle = new Mesh(new BoxGeometry(FRONT_W * 0.34, 0.035, 0.035), chrome);
      handle.position.set(0, -DRAWER_H * 0.33, FRONT_Z + 0.05);
      // The tray behind the front: floor, sides and back.
      const floorY = -DRAWER_H / 2 + 0.012;
      const trayZ = FRONT_Z - TRAY_DEPTH / 2;
      const parts: Array<[number, number, number, number, number, number, Material]> = [
        [FRONT_W - 0.04, 0.01, TRAY_DEPTH, 0, floorY, trayZ, steelInside],
        [0.012, DRAWER_H * 0.7, TRAY_DEPTH, -(FRONT_W - 0.04) / 2, floorY + DRAWER_H * 0.35, trayZ, steelInside],
        [0.012, DRAWER_H * 0.7, TRAY_DEPTH, (FRONT_W - 0.04) / 2, floorY + DRAWER_H * 0.35, trayZ, steelInside],
        [FRONT_W - 0.04, DRAWER_H * 0.7, 0.012, 0, floorY + DRAWER_H * 0.35, FRONT_Z - TRAY_DEPTH, steelInside],
      ];
      group.add(front, plate, handle);
      for (const [w, h, dpt, x, y, z, m] of parts) {
        const part = new Mesh(new BoxGeometry(w, h, dpt), m);
        part.position.set(x, y, z);
        group.add(part);
      }
      // Hanging folders, front to back, tabs cut left, centre and right.
      const folders: FolderObject[] = d.pieces.map((piece, f) => {
        const folderGroup = new Group();
        const h = DRAWER_H * 0.86;
        const body = new Mesh(new BoxGeometry(FRONT_W - 0.12, h, 0.008), manila);
        body.position.y = floorY + h / 2;
        const tab = new Mesh(new BoxGeometry(0.26, 0.07, 0.009), manilaTab);
        tab.position.set([-0.25, 0, 0.25][f] ?? 0, floorY + h + 0.035, 0);
        body.userData.target = `folder:${piece}`;
        tab.userData.target = `folder:${piece}`;
        folderGroup.add(body, tab);
        folderGroup.position.z = FRONT_Z - 0.1 - f * FOLDER_GAP;
        group.add(folderGroup);
        this.pickables.push(body, tab);
        return { piece, group: folderGroup, tab, lift: 0, liftTarget: 0 };
      });
      this.#body.add(group);
      this.pickables.push(front, plate);
      this.drawers.push({ id: d.id, group, front, opening, folders, out: 0, outTarget: 0 });
    });
  }

  open(id: string | null): void {
    for (const d of this.drawers) d.outTarget = d.id === id ? PULL : 0;
  }

  lift(piece: PieceId | null): void {
    for (const d of this.drawers) for (const f of d.folders) f.liftTarget = f.piece === piece ? LIFT : 0;
  }

  /** Eases drawers and folders toward their targets; `snap` jumps there (reduced motion). */
  update(dt: number, snap: boolean): boolean {
    const k = snap ? 1 : 1 - Math.exp(-dt * 7);
    let moving = false;
    for (const d of this.drawers) {
      d.out += (d.outTarget - d.out) * k;
      if (Math.abs(d.outTarget - d.out) < 0.001) d.out = d.outTarget;
      else moving = true;
      d.group.position.z = d.out;
      d.opening.visible = d.out > 0.02;
      for (const f of d.folders) {
        f.lift += (f.liftTarget - f.lift) * k;
        if (Math.abs(f.liftTarget - f.lift) < 0.001) f.lift = f.liftTarget;
        else moving = true;
        f.group.position.y = f.lift;
        // A closed drawer's folders are out of sight.
        f.group.visible = d.out > 0.02;
      }
    }
    return moving;
  }

  /** The four corners of a drawer's front, where it is now, for the button laid over it. */
  frontCorners(id: string): Vector3[] {
    const d = this.drawers.find((x) => x.id === id);
    if (!d) return [];
    const y = d.group.position.y;
    const z = FRONT_Z + 0.031 + d.group.position.z;
    const w = FRONT_W / 2;
    const h = (DRAWER_H - 0.012) / 2;
    return [
      new Vector3(CABINET.x - w, y - h, z),
      new Vector3(CABINET.x + w, y - h, z),
      new Vector3(CABINET.x + w, y + h, z),
      new Vector3(CABINET.x - w, y + h, z),
    ].map((v) => this.world(v));
  }

  isOpen(id: string): boolean {
    return this.drawers.some((d) => d.id === id && d.outTarget > 0);
  }

  /** Where a drawer's label or a folder's tab is, in the world, for the DOM labels over them. */
  anchor(target: string): Vector3 | null {
    const [kind, id] = target.split(':');
    for (const d of this.drawers) {
      if (kind === 'drawer' && d.id === id)
        return this.world(new Vector3(CABINET.x, d.group.position.y + DRAWER_H * 0.17, FRONT_Z + d.group.position.z + 0.04));
      for (const f of d.folders) {
        if (kind === 'folder' && f.piece === id) return f.tab.getWorldPosition(new Vector3());
      }
    }
    if (kind === 'cabinet') return this.world(new Vector3(CABINET.x, CABINET.height + 0.12, CABINET.z));
    return null;
  }

  /** A point given as if the cabinet faced the front of the room, where it really is. */
  world(point: Vector3): Vector3 {
    this.group.updateMatrixWorld(true);
    return this.#body.localToWorld(point);
  }
}
