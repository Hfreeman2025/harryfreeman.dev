// Direction 2, Management sim, top-down. A high, near-orthographic camera reads the whole studio as a
// game floor plan, in daylight with crisp shadows. Rich floor materials (oak, carpet under the desk
// rows, tiles by Reception, slate by the cabinet), stencilled zone names, cable runs and plants. Each
// builder has a name tag and a status gem; the work travels along coloured paths to the review table.
// Blocky characters; the cabinet is a bold landmark in its corner.

import {
  BoxGeometry,
  type CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  type InstancedMesh,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  RepeatWrapping,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { PIECE_IDS, type PieceId, pieceById } from '../../content/pieces';
import { EdgePass } from '../edges';
import { BASE, BRIEF, CABINET, DESK, DESKS, deskFor, RECEPTION, REVIEW, ROOM, WALL } from '../layout';
import {
  canvasTexture,
  cond,
  fitBox,
  fitFont,
  fitView,
  fromAngles,
  gemColour,
  kit,
  loadGltf,
  moment,
  type Person,
  person,
  place,
  play,
  type StyleContext,
  type StyleHandle,
  seatedClip,
} from '../style';
import { arc, boardSpot, deskSpot, tableSpot } from '../work';

const BLOCKY = ['a', 'b', 'c', 'e', 'f', 'g', 'h', 'i', 'k', 'm'];
/** A bright colour per tool, for its chair, tag and path, as a transit map gives each line one. */
const LINE: Record<PieceId, string> = {
  'gpt-in-a-tab': '#ff6b6b',
  'real-or-hallucinated': '#ffa94d',
  'agent-race': '#ffd43b',
  'grid-weather': '#69db7c',
  gridtop: '#38d9a9',
  'listen-to-the-grid': '#4dabf7',
  sourced: '#748ffc',
  'ask-the-record': '#da77f2',
  dreaming: '#f783ac',
  receipts: '#e8e8e8',
};
const WHEELCHAIR_DESK = 3;
const AZIMUTH = 32;

type Point = readonly [number, number];

/** A builder's path to the review table: out to the aisle, through a gap between desks, to its place at the table. */
function pathFor(piece: PieceId): Point[] {
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

/** A floor surface drawn on a canvas, laid flat over an area of the room. */
function floor(x0: number, z0: number, x1: number, z1: number, texture: CanvasTexture, repeat: [number, number], y = 0.004): Mesh {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(...repeat);
  const mesh = new Mesh(new PlaneGeometry(x1 - x0, z1 - z0), new MeshLambertMaterial({ map: texture }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  mesh.receiveShadow = true;
  return mesh;
}

/** Words painted on the floor, as zone markings. */
function stencil(text: string, x: number, z: number, width: number, colour: string, rotate = 0): Mesh {
  const height = width * 0.22;
  const texture = canvasTexture(1024, 225, (c) => {
    c.fillStyle = colour;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitFont(c, text, cond(700), 170, 980);
    c.fillText(text, 512, 120);
  });
  const mesh = new Mesh(
    new PlaneGeometry(width, height),
    new MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  mesh.rotation.set(-Math.PI / 2, 0, rotate);
  mesh.position.set(x, 0.012, z);
  mesh.renderOrder = 2;
  mesh.userData.noEdge = true;
  return mesh;
}

/** A dashed line on the floor in a tool's colour. */
function dashes(path: readonly Point[], colour: string): Group {
  const group = new Group();
  const texture = canvasTexture(64, 16, (c) => {
    c.fillStyle = colour;
    c.fillRect(0, 0, 40, 16);
  });
  texture.wrapS = RepeatWrapping;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (!a || !b) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.01) continue;
    const t = texture.clone();
    t.repeat.set(len / 0.32, 1);
    t.needsUpdate = true;
    const mesh = new Mesh(new PlaneGeometry(len, 0.07), new MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    mesh.rotation.set(-Math.PI / 2, 0, -Math.atan2(b[1] - a[1], b[0] - a[0]));
    mesh.position.set((a[0] + b[0]) / 2, 0.016, (a[1] + b[1]) / 2);
    mesh.renderOrder = 3;
    mesh.userData.noEdge = true;
    group.add(mesh);
  }
  return group;
}

function nameTag(text: string, colour: string): Sprite {
  const texture = canvasTexture(512, 132, (c) => {
    c.fillStyle = 'rgba(20,24,38,0.92)';
    c.beginPath();
    c.roundRect(4, 4, 504, 124, 38);
    c.fill();
    c.fillStyle = colour;
    c.beginPath();
    c.arc(66, 66, 26, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ffffff';
    c.textBaseline = 'middle';
    fitFont(c, text, cond(600), 72, 380);
    c.fillText(text, 108, 70);
  });
  const sprite = new Sprite(new SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(2.0, 0.52, 1);
  sprite.renderOrder = 10;
  sprite.userData.noEdge = true;
  return sprite;
}

export async function management(ctx: StyleContext): Promise<StyleHandle> {
  const { scene, model } = ctx;
  // ---------- Daylight ----------
  scene.background = new Color('#7cc46f');
  ctx.renderer.setClearColor('#7cc46f');
  ctx.renderer.shadowMap.enabled = true;
  for (const lamp of ctx.lamps) lamp.intensity *= 0.18;
  ctx.fill.color.set('#ffffff');
  ctx.fill.groundColor.set('#b9d9a6');
  ctx.fill.intensity *= 1.9;
  const sun = new DirectionalLight('#fff4de', 2.6);
  sun.position.set(-7, 18, 10);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 9, bottom: -9, near: 2, far: 45 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  // The lawn around the building.
  const lawn = canvasTexture(512, 512, (c) => {
    c.fillStyle = '#7cc46f';
    c.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 64) {
      c.fillStyle = y % 128 ? '#86cd78' : '#74bb67';
      c.fillRect(0, y, 512, 64);
    }
  });
  lawn.wrapS = RepeatWrapping;
  lawn.wrapT = RepeatWrapping;
  lawn.repeat.set(6, 6);
  const ground = model.baked[0];
  if (ground) {
    ground.map = lawn;
    ground.needsUpdate = true;
  }
  ctx.setBaseTint(new Color(1, 1, 1), new Color(1, 1, 1));
  const path = new Mesh(new PlaneGeometry(2.2, 9), new MeshLambertMaterial({ color: '#d9cdb4' }));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, -0.14, BASE.z1 + 4.4);
  scene.add(path);

  // Walls, tables and counter in bold colour; the cabinet a blue landmark.
  const tint: Record<string, string> = { card: '#ef6f6c', wood: '#f4a259', grey: '#4b5563', dark: '#1f2937', cork: '#f6c453' };
  for (const [material, colour] of Object.entries(tint)) {
    const mesh = model.boxes.get(material as never) as InstancedMesh | undefined;
    if (mesh) {
      (mesh.material as MeshLambertMaterial).color.set(colour);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  }
  ctx.cabinet.group.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const m = mesh.material as MeshLambertMaterial;
    if (m.color && m.color.getHexString() === 'b9bdb1') m.color.set('#3a86ff');
    mesh.castShadow = true;
  });
  for (const pool of model.pools.values()) pool.visible = false;

  // ---------- Floors, zones, stencils, cables ----------
  const oak = canvasTexture(512, 512, (c) => {
    for (let y = 0; y < 512; y += 32) {
      for (let x = (y / 32) % 2 ? -96 : 0; x < 512; x += 192) {
        c.fillStyle = ['#c8925a', '#bd8650', '#d29c63', '#c08b55'][(((x + y) / 32) % 4) | 0] ?? '#c8925a';
        c.fillRect(x, y, 190, 30);
      }
    }
  });
  const carpet = canvasTexture(256, 256, (c) => {
    c.fillStyle = '#2f4f8f';
    c.fillRect(0, 0, 256, 256);
    c.fillStyle = '#36599e';
    for (let i = 0; i < 256; i += 16) c.fillRect(i, 0, 8, 256);
  });
  const tiles = canvasTexture(256, 256, (c) => {
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        c.fillStyle = (x + y) % 2 ? '#f1ece2' : '#2b2d42';
        c.fillRect(x * 64, y * 64, 64, 64);
      }
  });
  const slate = canvasTexture(256, 256, (c) => {
    c.fillStyle = '#56607a';
    c.fillRect(0, 0, 256, 256);
    c.strokeStyle = '#495268';
    c.lineWidth = 4;
    for (let i = 0; i <= 256; i += 64) {
      c.strokeRect(0, i, 256, 0);
      c.strokeRect(i, 0, 0, 256);
    }
  });
  const green = canvasTexture(64, 64, (c) => {
    c.fillStyle = '#7fb069';
    c.fillRect(0, 0, 64, 64);
  });
  scene.add(
    floor(ROOM.x0, ROOM.z0, ROOM.x1, ROOM.z1, oak, [14 / 3, 9 / 3], 0.003),
    floor(-6.35, -3.15, 6.35, -0.95, carpet, [6, 1]),
    floor(-6.35, -0.35, 6.35, 1.72, carpet, [6, 1]),
    floor(RECEPTION.x - 1.7, 2.45, ROOM.x1, ROOM.z1, tiles, [4, 2]),
    floor(CABINET.x - 1.25, 2.3, CABINET.x + 1.25, ROOM.z1, slate, [2, 2]),
    floor(-1.45, ROOM.z0, 1.45, BRIEF.table.z + 0.75, green, [1, 1]),
  );
  scene.add(
    stencil('FILING', CABINET.x, ROOM.z1 - 0.32, 2.2, '#ffd166'),
    stencil('REVIEW', REVIEW.table.x + 2.1, REVIEW.reviewer[1] + 0.35, 2.0, '#ffffff'),
    stencil('RECEPTION', RECEPTION.x, ROOM.z1 - 0.3, 2.6, '#ef476f'),
    stencil('THE BRIEFS', 0, BRIEF.table.z + 0.66, 2.4, '#ffffff'),
    stencil('STUDIO FLOOR', ROOM.x0 + 1.4, -0.66, 2.4, '#ffd166'),
  );
  const cable = new MeshLambertMaterial({ color: '#2b2d42' });
  for (const d of DESKS) {
    const run = new Mesh(new BoxGeometry(0.035, 0.012, d.z - 0.35 - (ROOM.z0 + 0.15)), cable);
    run.position.set(d.x - 0.55, 0.01, (d.z - 0.35 + ROOM.z0 + 0.15) / 2);
    scene.add(run);
  }
  const trunk = new Mesh(new BoxGeometry(ROOM.x1 - ROOM.x0 - 0.6, 0.02, 0.06), cable);
  trunk.position.set(0, 0.012, ROOM.z0 + 0.15);
  scene.add(trunk);

  // ---------- Desks, chairs, plants ----------
  const furniture = await kit(
    ['desk', 'chairDesk', 'pottedPlant', 'plantSmall2', 'rugRound', 'bookcaseOpen', 'sideTable', 'radio', 'trashcan'],
    (n) => `kenney-furniture-kit/${n}.glb`,
  );
  const recolour = (o: ReturnType<typeof furniture>, colours: Record<string, string>) => {
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
        wood: '#ffffff',
        metal: '#9aa5b1',
      }),
    );
    if (d.piece !== wheelchairDesk)
      scene.add(
        recolour(fitBox(furniture('chairDesk'), d.seat[0], d.seat[1] + 0.05, { x: 0.5, y: 0.9, z: 0.5 }, Math.PI), {
          carpet: pieceById(d.piece).screen,
        }),
      );
    scene.add(recolour(place(furniture('plantSmall2'), d.x - 0.62, DESK.height, d.z - 0.15, 1.7), {}));
  }
  scene.add(recolour(fitBox(furniture('rugRound'), REVIEW.table.x, REVIEW.table.z, { x: 3.6, y: 0.01, z: 2.6 }), { carpet: '#f4a259' }));
  for (const [x, z] of [
    [ROOM.x0 + 0.5, ROOM.z0 + 0.5],
    [ROOM.x1 - 0.5, ROOM.z0 + 0.5],
    [ROOM.x0 + 0.5, ROOM.z1 - 0.5],
    [ROOM.x1 - 0.45, 2.1],
  ] as const)
    scene.add(recolour(place(furniture('pottedPlant'), x, 0, z, 2.6), {}));
  scene.add(recolour(fitBox(furniture('bookcaseOpen'), -4.4, ROOM.z0 + 0.25, { x: 1.4, y: 1.5, z: 0.4 }), {}));
  scene.add(
    recolour(fitBox(furniture('sideTable'), RECEPTION.x + RECEPTION.width / 2 + 0.6, RECEPTION.z, { x: 0.6, y: 0.55, z: 0.6 }), {}),
  );
  scene.add(
    recolour(
      fitBox(furniture('radio'), RECEPTION.x + RECEPTION.width / 2 + 0.6, RECEPTION.z, { x: 0.46, y: 0.28, z: 0.2 }, -0.4, 0.55),
      {},
    ),
  );

  // ---------- The grid board, on a stand tilted up to the camera ----------
  const sign = ctx.signFace;
  sign.removeFromParent();
  const board = new Group();
  const backing = new Mesh(new BoxGeometry(2.1, 1.16, 0.06), new MeshLambertMaterial({ color: '#2b2d42' }));
  backing.position.z = -0.04;
  backing.castShadow = true;
  sign.scale.setScalar(0.9);
  sign.position.set(0, 0, 0);
  board.add(backing, sign);
  board.position.set(ROOM.x0 + 1.35, 0.85, ROOM.z1 - 0.95);
  board.rotation.set(-0.95, 0.15, 0);
  scene.add(board);
  for (const dx of [-0.7, 0.7]) {
    const leg = new Mesh(new BoxGeometry(0.06, 0.8, 0.06), new MeshLambertMaterial({ color: '#2b2d42' }));
    leg.position.set(ROOM.x0 + 1.35 + dx, 0.4, ROOM.z1 - 1.05);
    leg.castShadow = true;
    scene.add(leg);
  }

  // ---------- Paths to the review table, in each tool's colour ----------
  const paths = new Map(PIECE_IDS.map((p) => [p, pathFor(p)] as const));
  for (const [piece, p] of paths) scene.add(dashes(p, LINE[piece]));

  // ---------- People, tags and gems ----------
  const [cast, reviewerGltf, wheelchairGltf] = await Promise.all([
    Promise.all(BLOCKY.map((x) => loadGltf(`kenney-blocky-characters/character-${x}.glb`))),
    loadGltf('kenney-blocky-characters/character-q.glb'),
    loadGltf('kenney-mini-characters/wheelchair.glb'),
  ]);
  const shadows = (o: { traverse(fn: (m: unknown) => void): void }) =>
    o.traverse((m) => {
      if ((m as Mesh).isMesh) (m as Mesh).castShadow = true;
    });
  const builders = DESKS.map((d, i) => {
    const gltf = cast[i];
    if (!gltf) throw new Error('missing character');
    const p = person(gltf, 1.6);
    shadows(p.root);
    scene.add(p.root);
    const tag = nameTag(pieceById(d.piece).title, LINE[d.piece]);
    tag.position.set(d.seat[0], 2.3, d.seat[1] + 0.2);
    scene.add(tag);
    const gem = new Mesh(new OctahedronGeometry(0.24, 0), new MeshBasicMaterial({ color: '#3d9bff' }));
    gem.scale.set(0.8, 1.5, 0.8);
    gem.userData.noEdge = true;
    scene.add(gem);
    return { piece: d.piece, p, tag, gem };
  });
  if (wheelchairDesk) {
    const d = deskFor(wheelchairDesk);
    const w = wheelchairGltf.scene;
    fitBox(w, d.seat[0], d.seat[1], { x: 0.62, y: 0.62, z: 0.7 }, Math.PI);
    shadows(w);
    scene.add(w);
  }
  const reviewer = person(reviewerGltf, 1.65);
  reviewer.root.position.set(REVIEW.reviewer[0], 0, REVIEW.reviewer[1] - 0.1);
  reviewer.root.rotation.y = Math.PI;
  reviewer.sheet.visible = true;
  shadows(reviewer.root);
  play(reviewer, 'holding', 0.4);
  scene.add(reviewer.root);
  const reviewerTag = nameTag('The reviewer', '#ffffff');
  reviewerTag.position.set(REVIEW.reviewer[0], 2.2, REVIEW.reviewer[1]);
  scene.add(reviewerTag);
  ctx.crew.people = false;
  ctx.crew.sheets = false;

  // The work: one sheet per tool, moving along its path.
  const TINT = { paper: '#ffffff', returned: '#ff5a4f', accepted: '#35c46a' } as const;
  const sheets = new Map(
    PIECE_IDS.map((piece) => {
      const mesh = new Mesh(new PlaneGeometry(0.34, 0.44), new MeshLambertMaterial({ color: TINT.paper, side: DoubleSide }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.castShadow = true;
      mesh.visible = false;
      scene.add(mesh);
      return [piece, mesh] as const;
    }),
  );

  const edges = new EdgePass(ctx.renderer, { color: '#1f2433', width: 1.6, strength: 0.9, normalThreshold: 0.4, depthThreshold: 0.012 });
  scene.traverse((o) => {
    if ((o as Mesh).isMesh && ((o as Mesh).material as MeshBasicMaterial).transparent) o.userData.noEdge = true;
  });
  if (ground) for (const o of model.group.children) if ((o as Mesh).material === ground) o.userData.noEdge = true;

  const room: Vector3[] = [
    new Vector3(BASE.x0, 0, BASE.z0),
    new Vector3(BASE.x1, 0, BASE.z0),
    new Vector3(BASE.x0, 0, BASE.z1),
    new Vector3(BASE.x1, 0, BASE.z1),
    new Vector3(ROOM.x0, WALL.back, ROOM.z0),
    new Vector3(ROOM.x1, WALL.back, ROOM.z0),
  ];
  const seat = (p: Person, x: number, z: number, wheel: boolean) => {
    p.root.position.set(x, wheel ? 0.12 : 0.2, z - 0.05);
    p.root.rotation.y = Math.PI;
  };
  return {
    views: {
      door: (aspect) => fitView(fromAngles(64, AZIMUTH), 15, aspect, room, { top: 0.99, bottom: -0.9, side: 1.06 }),
      desk: (aspect) =>
        fitView(fromAngles(58, AZIMUTH), 15, aspect, [
          new Vector3(-0.9, 0, -0.1),
          new Vector3(3.6, 0, -0.1),
          new Vector3(-0.9, 0, 2.2),
          new Vector3(3.6, 2.4, 2.2),
        ]),
      cabinet: (aspect) =>
        fitView(fromAngles(52, AZIMUTH), 15, aspect, [
          new Vector3(CABINET.x - 1.3, 0, CABINET.z - 0.6),
          new Vector3(CABINET.x + 1.3, 0, ROOM.z1),
          new Vector3(CABINET.x - 1.3, CABINET.height, CABINET.z - 0.6),
          new Vector3(CABINET.x + 1.3, 0, CABINET.z - 0.6),
        ]),
    },
    update(dt, t) {
      const m = moment(ctx.replay, ctx.now());
      for (const { piece, p, tag, gem } of builders) {
        const d = deskFor(piece);
        const phase = m.phases.get(piece);
        if (!phase) continue;
        const wheel = piece === wheelchairDesk;
        seat(p, d.seat[0], d.seat[1], wheel);
        play(p, seatedClip(phase, wheel), PIECE_IDS.indexOf(piece) * 0.37);
        p.mixer.update(dt);
        const colour = gemColour(phase);
        gem.visible = colour !== null;
        if (colour) gem.material.color.set(colour);
        gem.position.set(d.seat[0], 2.95 + Math.sin(t * 2 + d.x) * 0.04, d.seat[1]);
        gem.rotation.y = t * 1.3 + d.x;
        tag.visible = true;
        // The sheet: on the desk, along the path, at the table, back again or on to the board.
        const sheet = sheets.get(piece);
        const route = paths.get(piece);
        if (!sheet || !route) continue;
        let at: [number, number, number] | null = null;
        let colourName: keyof typeof TINT = 'paper';
        let upright = 0;
        if (phase.kind === 'building') {
          at = [...deskSpot(piece)];
          colourName = phase.returned ? 'returned' : 'paper';
        } else if (phase.kind === 'to-review') {
          const [x, z] = along(route, phase.progress);
          at = [x, 0.06, z];
        } else if (phase.kind === 'at-review') {
          at = [...tableSpot(piece)];
        } else if (phase.kind === 'back' && phase.outcome === 'returned') {
          const [x, z] = along(route, 1 - phase.progress);
          at = [x, 0.06, z];
          colourName = 'returned';
        } else if (phase.kind === 'back') {
          at = [...arc(tableSpot(piece), boardSpot(piece), phase.progress)];
          colourName = 'accepted';
          upright = Math.max(0, Math.min(1, (phase.progress - 0.55) / 0.45));
        }
        sheet.visible = at !== null;
        if (at) {
          sheet.position.set(...at);
          sheet.rotation.set(-Math.PI / 2 + (Math.PI / 2) * upright, 0, 0);
          sheet.material.color.set(TINT[colourName]);
        }
      }
      reviewer.mixer.update(dt);
    },
    render: (s, camera) => edges.render(s, camera),
    resize: (w, h) => edges.setSize(w, h),
  };
}
