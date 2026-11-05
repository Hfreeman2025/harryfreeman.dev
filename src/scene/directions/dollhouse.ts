// Direction 1, Dollhouse cutaway, up close. A low camera near eye level looks into the cut-open room
// as into a dollhouse: about three desks across the frame, builders facing you over their laptops so
// you see faces and hands at work. Evening: a dusk window, warm desk lamps, the cabinet huge in the
// near foreground under its own light, its drawer cards easy to read. The grid reading stands on the
// cabinet like a desk clock; Reception has a hanging sign and the radio on its counter.

import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  type InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  TorusGeometry,
  Vector3,
} from 'three';
import { pieceById } from '../../content/pieces';
import { CABINET, DESK, DESKS, deskFor, RECEPTION, REVIEW, ROOM, WALL } from '../layout';
import {
  canvasTexture,
  fitBox,
  kit,
  loadGltf,
  lookFrom,
  moment,
  type Person,
  person,
  place,
  plate,
  play,
  type StyleContext,
  type StyleHandle,
  seatedClip,
} from '../style';

const MINI = [
  'character-female-a',
  'character-male-b',
  'character-female-c',
  'character-male-d',
  'character-female-e',
  'character-male-a',
  'character-female-b',
  'character-male-c',
  'character-female-d',
  'character-male-e',
];
/** Builders sit on the far side of their desks, facing the door. */
const SEAT_BACK = 0.8;
const WHEELCHAIR_DESK = 8;

function glow(colour: string, size: number, opacity: number): Mesh {
  const texture = canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
  const mesh = new Mesh(
    new PlaneGeometry(size, size),
    new MeshBasicMaterial({ map: texture, color: colour, transparent: true, opacity, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 2;
  return mesh;
}

function mug(colour: string): Group {
  const group = new Group();
  const material = new MeshLambertMaterial({ color: colour });
  const cup = new Mesh(new CylinderGeometry(0.045, 0.04, 0.1, 16), material);
  cup.position.y = 0.05;
  const handle = new Mesh(new TorusGeometry(0.028, 0.009, 6, 12), material);
  handle.position.set(0.05, 0.055, 0);
  group.add(cup, handle);
  return group;
}

/** A laptop opened towards its user (facing -z), its screen playing the tool's loop. */
function laptop(screen: Mesh): Group {
  const group = new Group();
  const shell = new MeshLambertMaterial({ color: '#c9ccd1' });
  const base = new Mesh(new BoxGeometry(0.36, 0.018, 0.25), shell);
  base.position.y = 0.009;
  const keys = new Mesh(new PlaneGeometry(0.3, 0.12), new MeshLambertMaterial({ color: '#3a3d42' }));
  keys.rotation.x = -Math.PI / 2;
  keys.position.set(0, 0.0185, -0.03);
  const hinge = new Group();
  hinge.position.set(0, 0.018, 0.125);
  hinge.rotation.x = 0.28;
  const lid = new Mesh(new BoxGeometry(0.36, 0.24, 0.012), shell);
  lid.position.set(0, 0.12, 0);
  hinge.add(lid);
  screen.removeFromParent();
  screen.scale.set(0.34, 0.37, 1);
  screen.position.set(0, 0.12, -0.007);
  screen.rotation.set(0, Math.PI, 0);
  hinge.add(screen);
  group.add(base, keys, hinge);
  return group;
}

export async function dollhouse(ctx: StyleContext): Promise<StyleHandle> {
  const { scene, model } = ctx;
  // ---------- Evening ----------
  scene.background = canvasTexture(16, 256, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#141a33');
    g.addColorStop(0.6, '#2a2440');
    g.addColorStop(1, '#3b2c34');
    c.fillStyle = g;
    c.fillRect(0, 0, 16, 256);
  });
  ctx.renderer.setClearColor('#1c1d33');
  // The dollhouse stands on a dark wooden table.
  ctx.setBaseTint(new Color('#5b4434'), new Color('#9a7457'));
  const [work, key] = ctx.lamps;
  if (work) {
    work.light.color.set('#8796d6');
    work.intensity *= 0.16;
  }
  if (key) {
    key.light.color.set('#ffcf9e');
    key.intensity *= 0.9;
  }
  ctx.fill.color.set('#7b80b8');
  ctx.fill.groundColor.set('#3b2a22');
  ctx.fill.intensity *= 0.75;
  const tint: Record<string, string> = { card: '#e6d4bb', wood: '#8f5f3e', grey: '#6b6159', dark: '#24211f', cork: '#9f7349' };
  for (const [material, colour] of Object.entries(tint)) {
    const mesh = model.boxes.get(material as never) as InstancedMesh | undefined;
    if (mesh) (mesh.material as MeshLambertMaterial).color.set(colour);
  }
  for (const pool of model.pools.values()) pool.visible = false;

  // A window in the back wall: the last of the day outside.
  const sky = canvasTexture(256, 192, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 192);
    g.addColorStop(0, '#24305e');
    g.addColorStop(0.55, '#6a5a8c');
    g.addColorStop(0.85, '#e79a6b');
    g.addColorStop(1, '#f2b77f');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 192);
    c.fillStyle = '#1d1f33';
    for (let x = 0; x < 256; x += 22) {
      const h = 24 + ((x * 37) % 41);
      c.fillRect(x, 192 - h, 18, h);
    }
    c.fillStyle = '#ffd88a';
    for (let x = 4; x < 256; x += 22) for (let y = 192 - 20; y > 140; y -= 9) if ((x + y) % 3 === 0) c.fillRect(x, y, 3, 3);
  });
  const windowGroup = new Group();
  const pane = new Mesh(new PlaneGeometry(1.5, 1.05), new MeshBasicMaterial({ map: sky }));
  const frameMat = new MeshLambertMaterial({ color: '#f4ece0' });
  windowGroup.add(pane);
  for (const [w, h, x, y] of [
    [1.6, 0.06, 0, 0.55],
    [1.6, 0.06, 0, -0.55],
    [0.06, 1.16, -0.78, 0],
    [0.06, 1.16, 0.78, 0],
    [0.04, 1.05, 0, 0],
    [1.5, 0.04, 0, 0.1],
  ] as const) {
    const bar = new Mesh(new BoxGeometry(w, h, 0.04), frameMat);
    bar.position.set(x, y, 0.02);
    windowGroup.add(bar);
  }
  windowGroup.position.set(2.25, 1.75, ROOM.z0 + 0.01);
  scene.add(windowGroup);
  // A dollhouse's walls run up to its roof: the back and side walls rise above the cut-down model's.
  const wallpaper = canvasTexture(256, 256, (c) => {
    c.fillStyle = '#e2cfb4';
    c.fillRect(0, 0, 256, 256);
    c.fillStyle = '#d6c1a3';
    for (let x = 0; x < 256; x += 32) c.fillRect(x, 0, 10, 256);
  });
  wallpaper.wrapS = RepeatWrapping;
  wallpaper.wrapT = RepeatWrapping;
  wallpaper.repeat.set(14, 2);
  const upper = new Mesh(new PlaneGeometry(ROOM.x1 - ROOM.x0 + 0.24, 3.6), new MeshLambertMaterial({ map: wallpaper }));
  upper.position.set(0, WALL.back + 1.8 - 0.01, ROOM.z0 + 0.005);
  const rail = new Mesh(new BoxGeometry(ROOM.x1 - ROOM.x0 + 0.24, 0.08, 0.05), new MeshLambertMaterial({ color: '#7a5236' }));
  rail.position.set(0, WALL.back, ROOM.z0 + 0.03);
  scene.add(upper, rail);
  for (const x of [ROOM.x0 - 0.06, ROOM.x1 + 0.06]) {
    const side = new Mesh(new BoxGeometry(0.12, 6.2 - WALL.side, 3.2), new MeshLambertMaterial({ color: '#cbb596' }));
    side.position.set(x, WALL.side + (6.2 - WALL.side) / 2, ROOM.z0 + 1.6);
    scene.add(side);
  }
  // Pictures along the upper wall.
  for (const [i, x] of [-5.6, -3.4, 4.3, 6.1].entries()) {
    const art = new Mesh(
      new PlaneGeometry(1.0, 0.75),
      new MeshLambertMaterial({
        map: canvasTexture(200, 150, (c) => {
          c.fillStyle = '#5a3d2b';
          c.fillRect(0, 0, 200, 150);
          c.fillStyle = ['#e9c46a', '#2a9d8f', '#e76f51', '#8ab17d'][i] ?? '#e9c46a';
          c.fillRect(14, 14, 172, 122);
          c.fillStyle = 'rgba(255,255,255,0.35)';
          c.beginPath();
          c.arc(60 + i * 20, 70, 30, 0, Math.PI * 2);
          c.fill();
        }),
      }),
    );
    art.position.set(x, 3.15, ROOM.z0 + 0.02);
    scene.add(art);
  }

  // ---------- Desks, turned to face the door ----------
  const furniture = await kit(
    [
      'desk',
      'chairDesk',
      'lampRoundTable',
      'books',
      'plantSmall1',
      'plantSmall2',
      'plantSmall3',
      'pottedPlant',
      'radio',
      'coatRackStanding',
      'rugRectangle',
    ],
    (n) => `kenney-furniture-kit/${n}.glb`,
  );
  const wheelchairDesk = DESKS[WHEELCHAIR_DESK]?.piece;
  for (const [i, d] of DESKS.entries()) {
    scene.add(fitBox(furniture('desk'), d.x, d.z, { x: DESK.width, y: DESK.height, z: DESK.depth }));
    if (d.piece !== wheelchairDesk) scene.add(fitBox(furniture('chairDesk'), d.x, d.z - SEAT_BACK - 0.05, { x: 0.5, y: 0.95, z: 0.5 }));
    const screen = model.screens.meshes.get(d.piece);
    if (screen) {
      const l = laptop(screen);
      l.position.set(d.x - 0.05, DESK.height, d.z - 0.12);
      scene.add(l);
    }
    // The lamp, its light on the desk and the floor.
    scene.add(place(furniture('lampRoundTable'), d.x - 0.6, DESK.height, d.z + 0.12, 1.7));
    const bulb = new PointLight('#ffb36b', 2.8, 4.0, 2);
    bulb.position.set(d.x - 0.6, DESK.height + 0.42, d.z + 0.1);
    scene.add(bulb);
    const onDesk = glow('#ffb46e', 1.5, 0.35);
    onDesk.position.set(d.x - 0.35, DESK.height + 0.003, d.z);
    const onFloor = glow('#ff9c55', 3.2, 0.22);
    onFloor.position.set(d.x - 0.3, 0.004, d.z + 0.2);
    scene.add(onDesk, onFloor);
    scene.add(place(mug(['#c9483f', '#3e6fa8', '#e8b931', '#4f9a63'][i % 4] ?? '#c9483f'), d.x + 0.38, DESK.height, d.z + 0.15, 1));
    scene.add(
      i % 2
        ? place(furniture('books'), d.x + 0.6, DESK.height, d.z - 0.15, 1.6, 0.4)
        : place(furniture(['plantSmall1', 'plantSmall2', 'plantSmall3'][i % 3] ?? 'plantSmall1'), d.x + 0.62, DESK.height, d.z - 0.12, 1.5),
    );
    // A brass name plate on the desk's front, facing the door.
    const name = new Mesh(
      new PlaneGeometry(0.56, 0.12),
      new MeshBasicMaterial({
        map: plate(pieceById(d.piece).title, { width: 560, height: 120, bg: '#d9b46a', ink: '#2b2116', border: '#8a6a32' }),
      }),
    );
    name.position.set(d.x + 0.25, DESK.height - 0.13, d.z + DESK.depth / 2 + 0.012);
    scene.add(name);
  }
  // A rug under the review table, plants in the corners, a coat stand by Reception.
  scene.add(fitBox(furniture('rugRectangle'), REVIEW.table.x, REVIEW.table.z - 0.2, { x: 3.0, y: 0.01, z: 2.0 }));
  scene.add(place(furniture('pottedPlant'), ROOM.x0 + 0.45, 0, ROOM.z0 + 0.5, 2.4));
  scene.add(place(furniture('pottedPlant'), ROOM.x1 - 0.45, 0, ROOM.z0 + 0.5, 2.4));
  scene.add(place(furniture('coatRackStanding'), RECEPTION.x + RECEPTION.width / 2 + 0.55, 0, RECEPTION.z + 0.4, 2.2));

  // ---------- Reception: a hanging sign, the radio on the counter ----------
  const reception = new Mesh(
    new PlaneGeometry(1.5, 0.36),
    new MeshBasicMaterial({ map: plate('Reception', { width: 750, height: 180, bg: '#1d5a44', ink: '#ffffff' }) }),
  );
  reception.position.set(RECEPTION.x, RECEPTION.height + 0.9, RECEPTION.z + RECEPTION.depth / 2 - 0.05);
  scene.add(reception);
  for (const dx of [-0.6, 0.6]) {
    const post = new Mesh(new BoxGeometry(0.03, 0.72, 0.03), new MeshLambertMaterial({ color: '#2a2622' }));
    post.position.set(RECEPTION.x + dx, RECEPTION.height + 0.4, RECEPTION.z + RECEPTION.depth / 2 - 0.05);
    scene.add(post);
  }
  scene.add(fitBox(furniture('radio'), RECEPTION.x - 0.6, RECEPTION.z, { x: 0.46, y: 0.28, z: 0.2 }, 0.3, RECEPTION.height + 0.04));
  const counterLamp = new PointLight('#ffc48a', 1.4, 3.5, 2);
  counterLamp.position.set(RECEPTION.x, RECEPTION.height + 0.7, RECEPTION.z + 0.3);
  scene.add(counterLamp);

  // ---------- The cabinet, brought forward and turned to the door: the first thing you see ----------
  ctx.cabinet.group.position.set(-1.8, 0, 4.0);
  ctx.cabinet.group.rotation.y = 0.2;
  // ---------- The grid reading, standing on the cabinet like a desk clock ----------
  const sign = ctx.signFace;
  sign.removeFromParent();
  const stand = new Group();
  const back = new Mesh(new BoxGeometry(1.18, 0.66, 0.05), new MeshLambertMaterial({ color: '#2a2622' }));
  back.position.z = -0.03;
  sign.position.set(0, 0, 0);
  sign.scale.setScalar(0.5);
  stand.add(back, sign);
  stand.position.copy(ctx.cabinet.world(new Vector3(CABINET.x, CABINET.height + 0.36, CABINET.z + 0.05)));
  stand.rotation.set(-0.1, 0.2, 0, 'YXZ');
  scene.add(stand);

  // ---------- People: faces to the door ----------
  const [castGltfs, reviewerGltf, wheelchairGltf] = await Promise.all([
    Promise.all(MINI.map((n) => loadGltf(`kenney-mini-characters/${n}.glb`))),
    loadGltf('kenney-mini-characters/character-female-f.glb'),
    loadGltf('kenney-mini-characters/wheelchair.glb'),
  ]);
  const builders = DESKS.map((d, i) => {
    const gltf = castGltfs[i];
    if (!gltf) throw new Error('missing character');
    const p = person(gltf, 1.45);
    scene.add(p.root);
    return [d.piece, p] as const;
  });
  if (wheelchairDesk) {
    const d = deskFor(wheelchairDesk);
    const w = wheelchairGltf.scene;
    fitBox(w, d.x, d.z - SEAT_BACK + 0.02, { x: 0.62, y: 0.62, z: 0.7 });
    scene.add(w);
  }
  const reviewer = person(reviewerGltf, 1.5);
  // At the table's end, in the gap between desks, reading.
  // Behind the table, facing you, placed where she covers no builder from the door.
  reviewer.root.position.set(-0.75, 0, REVIEW.table.z - REVIEW.table.depth / 2 - 0.25);
  reviewer.root.rotation.y = 0;
  reviewer.sheet.visible = true;
  play(reviewer, 'holding', 0.4);
  scene.add(reviewer.root);
  ctx.crew.people = false;

  const seat = (p: Person, x: number, z: number, wheel: boolean) => {
    p.root.position.set(x, wheel ? 0.13 : 0.27, z);
    p.root.rotation.y = 0;
  };
  let lastHeld: string | null | undefined;
  return {
    views: {
      door: () => lookFrom([-0.6, 1.75, 10.0], [0.15, 1.15, 0.4], 42),
      desk: () => lookFrom([0.95, 1.55, 2.7], [0.0, 1.0, -0.25], 32),
      cabinet: () => {
        const look = ctx.cabinet.world(new Vector3(CABINET.x, 0.95, CABINET.z + 0.55));
        return { pos: look.clone().add(new Vector3(1.4, 0.75, 3.2)), look, fov: 34 };
      },
    },
    update(dt) {
      const m = moment(ctx.replay, ctx.now());
      if (m.held !== lastHeld) {
        ctx.crew.held = m.held;
        lastHeld = m.held;
      }
      builders.forEach(([piece, p], i) => {
        const d = deskFor(piece);
        const phase = m.phases.get(piece);
        if (!phase) return;
        const wheel = piece === wheelchairDesk;
        if (piece === m.held && !wheel) {
          // Handing the work in, beside the reviewer.
          p.root.position.set(1.1, 0, REVIEW.table.z - REVIEW.table.depth / 2 - 0.25);
          p.root.rotation.y = -0.7;
          p.sheet.visible = true;
          play(p, 'holding', i * 0.3);
        } else {
          seat(p, d.x, d.z - SEAT_BACK, wheel);
          p.sheet.visible = false;
          play(p, seatedClip(phase, wheel), i * 0.37);
        }
        p.mixer.update(dt);
      });
      reviewer.mixer.update(dt);
    },
  };
}
