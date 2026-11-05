// The model on the desk, drawn as a management sim: zoned floors with painted names, rugs and cable
// runs, the builders (Kenney Blocky Characters) at their desks with a status gem each, the reviewer
// at the table, and the work travelling along paths to review and back, red when sent back, green
// when accepted. One palette (palette.ts); crisp daylight shadows come from the desk's sun.

import {
  BoxGeometry,
  type InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type MeshStandardMaterial,
  type Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  type Scene,
  Vector3,
} from 'three';
import { PIECE_IDS, type PieceId } from '../content/pieces';
import { Cabinet } from '../scene/cabinet';
import { CABINET, DESK, DESKS, type DeskPlan, deskFor, RECEPTION, REVIEW, ROOM, WALL } from '../scene/layout';
import type { Model } from '../scene/model';
import { canvasTexture, cond, fitBox, fitFont, kit, loadGltf, moment, type Person, person, play, seatedClip } from '../scene/style';
import { arc, boardSpot, deskSpot, tableSpot } from '../scene/work';
import type { Replay } from '../timeline/replay';
import { printer } from './objects';
import { BLUE, CORAL, CREAM, INK, OAK, SLATE, STATUS, SUN } from './palette';

const BLOCKY = ['a', 'b', 'c', 'e', 'f', 'g', 'h', 'i', 'k', 'm'];
/** One builder works from a wheelchair, and waves from it. */
export const WHEELCHAIR_DESK = 3;

type Point = readonly [number, number];

/** A builder's path to the review table: out to the aisle, through a gap between desks, to its place. */
/**
 * The tiny filing cabinet: a little smaller than the classic room's and brought forward, so the low view
 * sees the builder behind it, and its name sits on the floor in front of it.
 */
export const CABINET_AT = { x: CABINET.x, z: CABINET.z + 0.3, scale: 0.8 } as const;

/**
 * The zone names painted on the floor, each where the low view and the desk view both see all of it: the
 * front strip of the room, which has no wall in this cutaway, and the corridor in front of the desks.
 */
export const ZONES = [
  { text: 'STUDIO FLOOR', x: -4.95, z: 2.32, width: 2.1, colour: INK },
  { text: 'FILING', x: CABINET_AT.x, z: ROOM.z1 - 0.38, width: 1.6, colour: CREAM },
  { text: 'REVIEW', x: REVIEW.table.x, z: ROOM.z1 - 0.38, width: 1.6, colour: INK },
  { text: 'RECEPTION', x: RECEPTION.x, z: ROOM.z1 - 0.38, width: 2.0, colour: INK },
] as const;

/** Where a builder stands when their card is pulled: beside the desk, so their monitor stays in view. */
export function standAt(d: DeskPlan): [number, number] {
  return [d.x + DESK.width / 2 + 0.38, d.z + 0.5];
}

export function pathFor(piece: PieceId): Point[] {
  const d = deskFor(piece);
  const i = PIECE_IDS.indexOf(piece);
  const lane = (i - 4.5) * 0.045;
  const [spotX] = tableSpot(piece);
  const front = 1.85 + lane;
  const end = REVIEW.table.z - REVIEW.table.depth / 2 - 0.12;
  if (d.row === 1)
    return [
      [d.x, d.seat[1] + 0.2],
      [d.x, front],
      [spotX, front],
      [spotX, end],
    ];
  const gap = d.x === 0 ? 1.3 : d.x > 0 ? d.x - 1.3 : d.x + 1.3;
  const back = d.z + 1.38 + lane;
  return [
    [d.x, d.seat[1] + 0.2],
    [d.x, back],
    [gap + lane, back],
    [gap + lane, front],
    [spotX, front],
    [spotX, end],
  ];
}

function along(path: readonly Point[], t: number): Point {
  const lengths = path.slice(1).map((p, i) => Math.hypot(p[0] - (path[i]?.[0] ?? 0), p[1] - (path[i]?.[1] ?? 0)));
  const total = lengths.reduce((a, b) => a + b, 0);
  let d = Math.max(0, Math.min(1, t)) * total;
  for (const [i, len] of lengths.entries()) {
    const a = path[i];
    const b = path[i + 1];
    if (!a || !b) break;
    if (d <= len) return [a[0] + ((b[0] - a[0]) * d) / len, a[1] + ((b[1] - a[1]) * d) / len];
    d -= len;
  }
  return path.at(-1) ?? [0, 0];
}

function floor(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  draw: (c: CanvasRenderingContext2D) => void,
  repeat: [number, number],
  y: number,
): Mesh {
  const texture = canvasTexture(256, 256, draw);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(...repeat);
  const mesh = new Mesh(new PlaneGeometry(x1 - x0, z1 - z0), new MeshLambertMaterial({ map: texture }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  mesh.receiveShadow = true;
  return mesh;
}

/** Zone names painted on the floor. */
function stencil(text: string, x: number, z: number, width: number, colour: string): Mesh {
  const texture = canvasTexture(1024, 225, (c) => {
    c.fillStyle = colour;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitFont(c, text, cond(700), 170, 980);
    c.fillText(text, 512, 120);
  });
  const mesh = new Mesh(
    new PlaneGeometry(width, width * 0.22),
    new MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.014, z);
  mesh.renderOrder = 2;
  mesh.userData.noEdge = true;
  return mesh;
}

/** The work's route to review, dashed in ink on the floor. */
function dashes(path: readonly Point[]): Object3D[] {
  const texture = canvasTexture(64, 16, (c) => {
    c.fillStyle = INK;
    c.fillRect(0, 0, 36, 16);
  });
  texture.wrapS = RepeatWrapping;
  const out: Object3D[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (!a || !b) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.01) continue;
    const t = texture.clone();
    t.repeat.set(len / 0.3, 1);
    t.needsUpdate = true;
    const mesh = new Mesh(
      new PlaneGeometry(len, 0.05),
      new MeshBasicMaterial({ map: t, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    mesh.rotation.set(-Math.PI / 2, 0, -Math.atan2(b[1] - a[1], b[0] - a[0]));
    mesh.position.set((a[0] + b[0]) / 2, 0.018, (a[1] + b[1]) / 2);
    mesh.renderOrder = 3;
    mesh.userData.noEdge = true;
    out.push(mesh);
  }
  return out;
}

export interface Office {
  readonly cabinet: Cabinet;
  readonly gems: ReadonlyMap<PieceId, Mesh<OctahedronGeometry, MeshBasicMaterial>>;
  /** The printer on the Reception counter, where answers come out. */
  readonly printer: Object3D;
  /** A builder stands up at their desk (and waves, unless motion is reduced); null sits everyone down. */
  stand(piece: PieceId | null, wave: boolean): void;
  /** Who is standing, and whether they wave (for the checks). */
  standing(): { piece: PieceId; wave: boolean } | null;
  /** Opens the left side wall (the camera's side in a card view), so it never stands before a desk. */
  openSide(open: boolean): void;
  /** In a card view only its builder's status gem shows; null shows them all. */
  solo(piece: PieceId | null): void;
  update(dt: number, t: number): void;
}

export async function buildOffice(scene: Scene, model: Model, replay: Replay, now: () => number): Promise<Office> {
  // Walls coral, tables sun, the rest neutral; the box desks and chairs give way to models of them.
  const tint: Record<string, string> = { card: CORAL, wood: SUN, grey: SLATE, dark: INK, cork: '#e8b04a' };
  for (const [material, colour] of Object.entries(tint)) {
    const mesh = model.boxes.get(material as never) as InstancedMesh | undefined;
    if (!mesh) continue;
    (mesh.material as MeshLambertMaterial).color.set(colour);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  for (const pool of model.pools.values()) pool.visible = false;
  // A cutaway: the low front wall goes, so the camera looks straight in at the monitors and the zone
  // names along the front are never behind it.
  const walls = model.boxes.get('card' as never) as InstancedMesh | undefined;
  let side: { index: number; matrix: Matrix4 } | null = null;
  if (walls) {
    const m = new Matrix4();
    const at = new Vector3();
    const size = new Vector3();
    for (let i = 0; i < walls.count; i++) {
      walls.getMatrixAt(i, m);
      m.decompose(at, new Quaternion(), size);
      if (Math.abs(size.y - WALL.front) < 1e-3 && at.z > ROOM.z1 - 1e-3) walls.setMatrixAt(i, new Matrix4().makeScale(0, 0, 0));
      else if (Math.abs(size.y - WALL.side) < 1e-3 && at.x < ROOM.x0) side = { index: i, matrix: m.clone() };
    }
    walls.instanceMatrix.needsUpdate = true;
  }

  // ---------- Floors, zones, names, cables ----------
  scene.add(
    floor(
      ROOM.x0,
      ROOM.z0,
      ROOM.x1,
      ROOM.z1,
      (c) => {
        for (let y = 0; y < 256; y += 32)
          for (let x = (y / 32) % 2 ? -48 : 0; x < 256; x += 96) {
            c.fillStyle = ((x + y) / 32) % 2 ? OAK : '#cc9354';
            c.fillRect(x, y, 94, 30);
          }
      },
      [14 / 2, 9 / 2],
      0.003,
    ),
    // Carpet under each row of desks.
    floor(
      -6.4,
      -3.15,
      6.4,
      -0.95,
      (c) => {
        c.fillStyle = BLUE;
        c.fillRect(0, 0, 256, 256);
        c.fillStyle = '#3366c9';
        for (let i = 0; i < 256; i += 16) c.fillRect(i, 0, 8, 256);
      },
      [6, 1],
      0.006,
    ),
    floor(
      -6.4,
      -0.35,
      6.4,
      1.72,
      (c) => {
        c.fillStyle = BLUE;
        c.fillRect(0, 0, 256, 256);
        c.fillStyle = '#3366c9';
        for (let i = 0; i < 256; i += 16) c.fillRect(i, 0, 8, 256);
      },
      [6, 1],
      0.006,
    ),
    // Tiles by Reception (stopping short of its painted name), slate by the filing cabinet, sun under the
    // review table, both out to the front.
    floor(
      RECEPTION.x - 1.7,
      2.45,
      ROOM.x1,
      ROOM.z1 - 0.72,
      (c) => {
        for (let y = 0; y < 4; y++)
          for (let x = 0; x < 4; x++) {
            c.fillStyle = (x + y) % 2 ? CREAM : INK;
            c.fillRect(x * 64, y * 64, 64, 64);
          }
      },
      [4, 2],
      0.006,
    ),
    floor(
      CABINET.x - 1.3,
      2.3,
      CABINET.x + 1.3,
      ROOM.z1,
      (c) => {
        c.fillStyle = SLATE;
        c.fillRect(0, 0, 256, 256);
        c.strokeStyle = '#4f5667';
        c.lineWidth = 4;
        for (let i = 0; i <= 256; i += 64) {
          c.strokeRect(0, i, 256, 0);
          c.strokeRect(i, 0, 0, 256);
        }
      },
      [2, 2],
      0.006,
    ),
    floor(
      REVIEW.table.x - 1.75,
      REVIEW.table.z - 0.95,
      REVIEW.table.x + 1.75,
      ROOM.z1,
      (c) => {
        c.fillStyle = SUN;
        c.fillRect(0, 0, 256, 256);
        c.strokeStyle = '#f0b52f';
        c.lineWidth = 12;
        c.strokeRect(14, 14, 228, 228);
      },
      [1, 1],
      0.009,
    ),
  );
  scene.add(...ZONES.map((z) => stencil(z.text, z.x, z.z, z.width, z.colour)));
  const cable = new MeshLambertMaterial({ color: INK });
  for (const d of DESKS) {
    const run = new Mesh(new BoxGeometry(0.035, 0.012, d.z - 0.35 - (ROOM.z0 + 0.15)), cable);
    run.position.set(d.x - 0.55, 0.012, (d.z - 0.35 + ROOM.z0 + 0.15) / 2);
    scene.add(run);
  }
  const trunk = new Mesh(new BoxGeometry(ROOM.x1 - ROOM.x0 - 0.6, 0.02, 0.06), cable);
  trunk.position.set(0, 0.014, ROOM.z0 + 0.15);
  scene.add(trunk);
  for (const path of PIECE_IDS.map(pathFor)) scene.add(...dashes(path));

  // ---------- The filing cabinet's model, a blue landmark in its corner ----------
  const cabinet = new Cabinet(0, true);
  cabinet.group.position.set(CABINET_AT.x, 0, CABINET_AT.z);
  cabinet.group.scale.setScalar(CABINET_AT.scale);
  cabinet.group.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const m = mesh.material as MeshLambertMaterial;
    if (m.color?.getHexString() === 'b9bdb1') m.color.set(BLUE);
    mesh.castShadow = true;
  });
  scene.add(cabinet.group);

  // ---------- Furniture: desks, chairs, plants, the radio and the printer ----------
  const furniture = await kit(['desk', 'chairDesk', 'pottedPlant', 'plantSmall2', 'radio'], (n) => `kenney-furniture-kit/${n}.glb`);
  const recolour = (o: Object3D, colours: Record<string, string>) => {
    o.traverse((m) => {
      const mesh = m as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const swap = (mat: Material) => {
        const c = colours[(mat as MeshStandardMaterial).name];
        if (!c) return mat;
        const copy = (mat as MeshStandardMaterial).clone();
        copy.color.set(c);
        return copy;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    });
    return o;
  };
  const wheelchairDesk = DESKS[WHEELCHAIR_DESK]?.piece;
  for (const d of DESKS) {
    scene.add(
      recolour(fitBox(furniture('desk'), d.x, d.z, { x: DESK.width, y: DESK.height, z: DESK.depth }, Math.PI), {
        wood: CREAM,
        metal: SLATE,
      }),
    );
    if (d.piece !== wheelchairDesk)
      scene.add(
        recolour(fitBox(furniture('chairDesk'), d.seat[0], d.seat[1] + 0.05, { x: 0.5, y: 0.9, z: 0.5 }, Math.PI), {
          carpet: INK,
          metalMedium: SLATE,
        }),
      );
    const plant = recolour(furniture('plantSmall2'), {});
    plant.scale.setScalar(1.7);
    plant.position.set(d.x - 0.62, DESK.height, d.z - 0.15);
    scene.add(plant);
  }
  for (const [x, z] of [
    [ROOM.x0 + 0.5, ROOM.z0 + 0.5],
    [ROOM.x1 - 0.5, ROOM.z0 + 0.5],
  ] as const) {
    const plant = recolour(furniture('pottedPlant'), {});
    plant.scale.setScalar(2.6);
    plant.position.set(x, 0, z);
    scene.add(plant);
  }
  scene.add(
    recolour(fitBox(furniture('radio'), RECEPTION.x - 0.6, RECEPTION.z, { x: 0.46, y: 0.28, z: 0.2 }, 0.3, RECEPTION.height + 0.04), {
      red: CORAL,
    }),
  );
  const tinyPrinter = printer();
  tinyPrinter.position.set(RECEPTION.x + 0.55, RECEPTION.height + 0.04, RECEPTION.z);
  scene.add(tinyPrinter);

  // ---------- The team ----------
  const [cast, reviewerGltf, wheelchairGltf] = await Promise.all([
    Promise.all(BLOCKY.map((x) => loadGltf(`kenney-blocky-characters/character-${x}.glb`))),
    loadGltf('kenney-blocky-characters/character-q.glb'),
    loadGltf('kenney-mini-characters/wheelchair.glb'),
  ]);
  const castShadows = (o: Object3D) =>
    o.traverse((m) => {
      if ((m as Mesh).isMesh) (m as Mesh).castShadow = true;
    });
  const builders = DESKS.map((d, i) => {
    const gltf = cast[i];
    if (!gltf) throw new Error('missing character');
    const p = person(gltf, 1.6);
    castShadows(p.root);
    scene.add(p.root);
    return { piece: d.piece, p };
  });
  if (wheelchairDesk) {
    const d = deskFor(wheelchairDesk);
    const w = wheelchairGltf.scene;
    fitBox(w, d.seat[0], d.seat[1], { x: 0.62, y: 0.62, z: 0.7 }, Math.PI);
    castShadows(w);
    scene.add(w);
  }
  const reviewer = person(reviewerGltf, 1.65);
  reviewer.root.position.set(REVIEW.reviewer[0], 0, REVIEW.reviewer[1] - 0.1);
  reviewer.root.rotation.y = Math.PI;
  reviewer.sheet.visible = true;
  castShadows(reviewer.root);
  play(reviewer, 'holding', 0.4);
  scene.add(reviewer.root);

  const gems = new Map<PieceId, Mesh<OctahedronGeometry, MeshBasicMaterial>>();
  for (const d of DESKS) {
    const gem = new Mesh(new OctahedronGeometry(0.17, 0), new MeshBasicMaterial({ color: STATUS.building }));
    gem.scale.set(0.8, 1.5, 0.8);
    gem.userData.noEdge = true;
    scene.add(gem);
    gems.set(d.piece, gem);
  }

  // ---------- The work, one sheet per tool ----------
  const sheets = new Map(
    PIECE_IDS.map((piece) => {
      const mesh = new Mesh(new PlaneGeometry(0.34, 0.44), new MeshLambertMaterial({ color: CREAM }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.castShadow = true;
      mesh.visible = false;
      scene.add(mesh);
      return [piece, mesh] as const;
    }),
  );
  const paths = new Map(PIECE_IDS.map((p) => [p, pathFor(p)] as const));

  let standing: { piece: PieceId; wave: boolean; since: number } | null = null;
  let soloPiece: PieceId | null = null;
  let clock = 0;
  const seat = (p: Person, x: number, z: number, wheel: boolean) => {
    p.root.position.set(x, wheel ? 0.12 : 0.2, z - 0.05);
    p.root.rotation.y = Math.PI;
  };
  return {
    cabinet,
    gems,
    printer: tinyPrinter,
    stand(piece, wave) {
      standing = piece ? { piece, wave, since: clock } : null;
    },
    standing: () => (standing ? { piece: standing.piece, wave: standing.wave } : null),
    solo(piece) {
      soloPiece = piece;
    },
    openSide(open) {
      if (!walls || !side) return;
      walls.setMatrixAt(side.index, open ? new Matrix4().makeScale(0, 0, 0) : side.matrix);
      walls.instanceMatrix.needsUpdate = true;
    },
    update(dt, t) {
      clock += dt;
      const m = moment(replay, now());
      for (const { piece, p } of builders) {
        const d = deskFor(piece);
        const phase = m.phases.get(piece);
        if (!phase) continue;
        const wheel = piece === wheelchairDesk;
        const i = PIECE_IDS.indexOf(piece);
        if (standing?.piece === piece) {
          // Up from the desk, turned to the room; a wave for the first few seconds.
          const waving = standing.wave && clock - standing.since < 2.8;
          if (wheel) {
            seat(p, d.seat[0], d.seat[1], true);
            play(p, waving ? 'wheelchairTyping' : 'wheelchair', 0);
          } else {
            const [sx, sz] = standAt(d);
            p.root.position.set(sx, 0, sz);
            p.root.rotation.y = -0.55;
            play(p, waving ? 'cheer' : 'idle', 0);
          }
        } else {
          seat(p, d.seat[0], d.seat[1], wheel);
          play(p, seatedClip(phase, wheel), i * 0.37);
        }
        p.mixer.update(dt);
        const gem = gems.get(piece);
        if (gem) {
          const colour =
            phase.kind === 'idle'
              ? null
              : phase.kind === 'done' || (phase.kind === 'back' && phase.outcome === 'accepted')
                ? STATUS.accepted
                : (phase.kind === 'building' && phase.returned) || (phase.kind === 'back' && phase.outcome === 'returned')
                  ? STATUS.returned
                  : STATUS.building;
          gem.visible = colour !== null && (soloPiece === null || soloPiece === piece);
          if (colour) gem.material.color.set(colour);
          const up = standing?.piece === piece && !wheel;
          const [gx, gz] = up ? standAt(d) : [d.seat[0], d.seat[1]];
          gem.position.set(gx, 2.35 + (up ? 0.25 : 0) + Math.sin(t * 2 + d.x) * 0.04, gz);
          gem.rotation.y = t * 1.3 + d.x;
        }
        const sheet = sheets.get(piece);
        const route = paths.get(piece);
        if (!sheet || !route) continue;
        let at: [number, number, number] | null = null;
        let colour = CREAM;
        let upright = 0;
        if (phase.kind === 'building') {
          at = [...deskSpot(piece)];
          colour = phase.returned ? STATUS.returned : CREAM;
        } else if (phase.kind === 'to-review') {
          const [x, z] = along(route, phase.progress);
          at = [x, 0.06, z];
        } else if (phase.kind === 'at-review') {
          at = [...tableSpot(piece)];
        } else if (phase.kind === 'back' && phase.outcome === 'returned') {
          const [x, z] = along(route, 1 - phase.progress);
          at = [x, 0.06, z];
          colour = STATUS.returned;
        } else if (phase.kind === 'back') {
          at = [...arc(tableSpot(piece), boardSpot(piece), phase.progress)];
          colour = STATUS.accepted;
          upright = Math.max(0, Math.min(1, (phase.progress - 0.55) / 0.45));
        }
        sheet.visible = at !== null;
        if (at) {
          sheet.position.set(...at);
          sheet.rotation.set(-Math.PI / 2 + (Math.PI / 2) * upright, 0, 0);
          sheet.material.color.set(colour);
        }
      }
      reviewer.mixer.update(dt);
    },
  };
}
