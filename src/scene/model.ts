// Builds the model's static parts from the plan: baked floor and workbench, card boxes grouped
// into one instanced mesh per material, the screens, the briefs on the wall and the accepted board.

import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { PIECE_IDS, type PieceId } from '../content/pieces';
import { BASE, BOARD, BRIEF, boardSlot, DESKS, type Material, ROOM, SCREEN, staticBoxes } from './layout';
import { GROUND, PALETTE } from './light';

const MATERIAL_COLOUR: Record<Material, string> = {
  card: PALETTE.card,
  wood: PALETTE.basswood,
  grey: PALETTE.grey,
  dark: PALETTE.dark,
  cork: PALETTE.cork,
  steel: '#b4b8ac',
  radio: '#7b2f22',
  screen: '#000000',
};

export interface Screens {
  readonly meshes: ReadonlyMap<PieceId, Mesh<PlaneGeometry, MeshBasicMaterial>>;
  setTexture(texture: Texture): void;
}

export interface Model {
  readonly group: Group;
  readonly screens: Screens;
  readonly pools: ReadonlyMap<PieceId, Mesh<PlaneGeometry, MeshBasicMaterial>>;
  readonly boardSheets: ReadonlyMap<PieceId, Mesh<PlaneGeometry, MeshBasicMaterial>>;
  readonly briefGlow: ReadonlyMap<string, Mesh<PlaneGeometry, MeshBasicMaterial>>;
  /** The baked floor and workbench, tinted when the room's light changes. */
  readonly baked: readonly MeshBasicMaterial[];
}

/** The atlas holds ten loops in a 5 × 2 grid, in desk order. */
export function atlasRect(piece: PieceId): { u0: number; v0: number; u1: number; v1: number } {
  const i = PIECE_IDS.indexOf(piece);
  const col = i % 5;
  const row = Math.floor(i / 5);
  // Rows count from the top of the image; texture v counts from the bottom.
  return { u0: col / 5, u1: (col + 1) / 5, v0: 1 - (row + 1) / 2, v1: 1 - row / 2 };
}

function tilePlane(width: number, height: number, piece: PieceId): PlaneGeometry {
  const geometry = new PlaneGeometry(width, height);
  const r = atlasRect(piece);
  const uv = geometry.attributes.uv;
  if (!uv) return geometry;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) === 0 ? r.u0 : r.u1, uv.getY(i) === 0 ? r.v0 : r.v1);
  }
  uv.needsUpdate = true;
  return geometry;
}

function poolTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(canvas);
}

/** A brief, as a printed sheet: its name and grey lines of text. */
function briefTexture(name: string): CanvasTexture {
  const w = 210;
  const h = 297;
  const canvas = document.createElement('canvas');
  canvas.width = w * 2;
  canvas.height = h * 2;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(2, 2);
    ctx.fillStyle = PALETTE.card;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2b261f';
    ctx.font = '600 22px "IBM Plex Sans Condensed", "Arial Narrow", sans-serif';
    ctx.fillText(name, 18, 40);
    ctx.fillStyle = '#9d958a';
    let y = 64;
    for (let i = 0; i < 17; i++) {
      const len = i % 6 === 5 ? 90 : 150 + ((i * 37) % 24);
      ctx.fillRect(18, y, len, 3);
      y += i % 6 === 5 ? 18 : 11;
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function buildModel(floor: Texture, ground: Texture, poster: Texture): Model {
  const group = new Group();

  // The workbench and the mat, baked.
  ground.colorSpace = SRGBColorSpace;
  const groundMesh = new Mesh(new PlaneGeometry(GROUND.x1 - GROUND.x0, GROUND.z1 - GROUND.z0), new MeshBasicMaterial({ map: ground }));
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.set((GROUND.x0 + GROUND.x1) / 2, GROUND.y, (GROUND.z0 + GROUND.z1) / 2);
  group.add(groundMesh);

  // The baseboard's edges (lit live), and its top, the floor (baked).
  const baseboard = new Mesh(
    new BoxGeometry(BASE.x1 - BASE.x0, BASE.thickness, BASE.z1 - BASE.z0),
    new MeshLambertMaterial({ color: PALETTE.card }),
  );
  baseboard.position.set((BASE.x0 + BASE.x1) / 2, -BASE.thickness / 2 - 0.002, (BASE.z0 + BASE.z1) / 2);
  group.add(baseboard);
  floor.colorSpace = SRGBColorSpace;
  floor.anisotropy = 8;
  const floorMesh = new Mesh(new PlaneGeometry(BASE.x1 - BASE.x0, BASE.z1 - BASE.z0), new MeshBasicMaterial({ map: floor }));
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set((BASE.x0 + BASE.x1) / 2, 0, (BASE.z0 + BASE.z1) / 2);
  group.add(floorMesh);

  // Every static box, one instanced mesh per material.
  const unit = new BoxGeometry(1, 1, 1);
  const byMaterial = new Map<Material, ReturnType<typeof staticBoxes>>();
  for (const box of staticBoxes()) {
    const list = byMaterial.get(box.material) ?? [];
    list.push(box);
    byMaterial.set(box.material, list);
  }
  const m = new Matrix4();
  for (const [material, boxes] of byMaterial) {
    const mesh = new InstancedMesh(unit, new MeshLambertMaterial({ color: MATERIAL_COLOUR[material] }), boxes.length);
    boxes.forEach((b, i) => {
      const sx = b.max[0] - b.min[0];
      const sy = b.max[1] - b.min[1];
      const sz = b.max[2] - b.min[2];
      m.makeScale(sx, sy, sz).setPosition((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  // Screens: one plane per desk, all showing tiles of the same atlas.
  poster.colorSpace = SRGBColorSpace;
  const screenMeshes = new Map<PieceId, Mesh<PlaneGeometry, MeshBasicMaterial>>();
  for (const d of DESKS) {
    const mesh = new Mesh(
      tilePlane(SCREEN.width, SCREEN.height, d.piece),
      new MeshBasicMaterial({ map: poster, color: new Color(0.08, 0.08, 0.08), toneMapped: false }),
    );
    mesh.position.set(d.screen[0], d.screen[1], d.screen[2] + 0.012);
    group.add(mesh);
    screenMeshes.set(d.piece, mesh);
  }

  // Lamp pools: a soft amber light on the floor around a desk, for focus and for answers.
  const pool = poolTexture();
  const pools = new Map<PieceId, Mesh<PlaneGeometry, MeshBasicMaterial>>();
  for (const d of DESKS) {
    const mesh = new Mesh(
      new PlaneGeometry(2.6, 2.6),
      new MeshBasicMaterial({
        map: pool,
        color: PALETTE.amber,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(d.x, 0.004, d.z + 0.35);
    mesh.renderOrder = 1;
    group.add(mesh);
    pools.set(d.piece, mesh);
  }

  // The briefs, pinned to the back wall, each with an amber frame that shows while it is current.
  const briefGlow = new Map<string, Mesh<PlaneGeometry, MeshBasicMaterial>>();
  const [sw, sh] = BRIEF.sheetSize;
  for (const sheet of BRIEF.sheets) {
    const paper = new Mesh(new PlaneGeometry(sw, sh), new MeshLambertMaterial({ map: briefTexture(sheet.doc) }));
    paper.position.set(sheet.x, BRIEF.sheetY, ROOM.z0 + 0.012);
    group.add(paper);
    const frame = new Mesh(
      new PlaneGeometry(sw + 0.07, sh + 0.07),
      new MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0, toneMapped: false }),
    );
    frame.position.set(sheet.x, BRIEF.sheetY, ROOM.z0 + 0.006);
    group.add(frame);
    briefGlow.set(sheet.doc, frame);
  }

  // The accepted board: a sheet per piece, its tile of the atlas, shown once accepted.
  const boardSheets = new Map<PieceId, Mesh<PlaneGeometry, MeshBasicMaterial>>();
  for (const piece of PIECE_IDS) {
    const mesh = new Mesh(
      tilePlane(0.32, 0.2, piece),
      new MeshBasicMaterial({ map: poster, side: DoubleSide, toneMapped: false, color: new Color(0.92, 0.92, 0.92) }),
    );
    const [x, y, z] = boardSlot(piece);
    mesh.position.set(x, y, z);
    mesh.visible = false;
    group.add(mesh);
    boardSheets.set(piece, mesh);
  }
  void BOARD;

  return {
    group,
    baked: [groundMesh.material, floorMesh.material],
    screens: {
      meshes: screenMeshes,
      setTexture(texture: Texture) {
        for (const mesh of screenMeshes.values()) mesh.material.map = texture;
        for (const mesh of boardSheets.values()) mesh.material.map = texture;
        for (const mesh of [...screenMeshes.values(), ...boardSheets.values()]) mesh.material.needsUpdate = true;
      },
    },
    pools,
    boardSheets,
    briefGlow,
  };
}
