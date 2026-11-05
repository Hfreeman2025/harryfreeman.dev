// Direction 3, Miniature on your desk. The studio is a small model standing on a real-size desk, and
// the camera photographs it like a tilt-shift diorama. Around it, at giant scale: the filing cabinet
// as a real index-card box (the hero by contrast), a coffee cup, a notebook of handwritten-style notes
// from the briefs, a pencil, the edge of a keyboard, and the grid reading on a sticky note. Toy-like
// characters with a slight plastic sheen; soft daylight from a window.
//
// Scale: the room is 1:50, so 1 cm on the desk is 0.5 m here. A 15 cm index box is 7.5 m.

import {
  BoxGeometry,
  type CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  type InstancedMesh,
  LatheGeometry,
  Mesh,
  MeshLambertMaterial,
  type MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  PMREMGenerator,
  RepeatWrapping,
  MeshStandardMaterial as Standard,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { DRAWERS } from '../../content/drawers';
import { pieceById } from '../../content/pieces';
import type { SignText } from '../../room/grid';
import { signFor } from '../../room/grid';
import { BASE, DESKS, deskFor, RECEPTION, REVIEW } from '../layout';
import {
  canvasTexture,
  cond,
  fitBox,
  fitFont,
  fitView,
  fromAngles,
  italic,
  loadGltf,
  lookFrom,
  moment,
  mono,
  type Person,
  person,
  play,
  type StyleContext,
  type StyleHandle,
  seatedClip,
} from '../style';
import { TiltShiftPass } from '../tiltshift';

const MINI = [
  'character-male-a',
  'character-female-b',
  'character-male-c',
  'character-female-d',
  'character-male-e',
  'character-female-a',
  'character-male-b',
  'character-female-c',
  'character-male-d',
  'character-female-e',
];
const DESK_Y = -0.15;
const WHEELCHAIR_DESK = 1;

/** The real desk under the model: oak, with a long grain. */
function deskSurface(): Mesh {
  const texture = canvasTexture(1024, 1024, (c) => {
    c.fillStyle = '#b9895a';
    c.fillRect(0, 0, 1024, 1024);
    for (let y = 0; y < 1024; y += 2) {
      const v = Math.sin(y * 0.05) * 0.5 + Math.sin(y * 0.013 + 1.7) * 0.5;
      c.fillStyle = `rgba(${v > 0 ? '120,78,44' : '214,170,120'},${Math.abs(v) * 0.22})`;
      c.fillRect(0, y, 1024, 2);
    }
    for (let i = 0; i < 18; i++) {
      c.strokeStyle = 'rgba(110,70,40,0.18)';
      c.lineWidth = 2;
      c.beginPath();
      const y = (i * 61) % 1024;
      c.moveTo(0, y);
      for (let x = 0; x <= 1024; x += 32) c.lineTo(x, y + Math.sin(x * 0.01 + i) * 14);
      c.stroke();
    }
  });
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(3, 3);
  const mesh = new Mesh(new PlaneGeometry(180, 180), new Standard({ map: texture, roughness: 0.55, metalness: 0 }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = DESK_Y - 0.005;
  mesh.receiveShadow = true;
  return mesh;
}

/** The filing cabinet, as a real-size index-card box: a divider per drawer, a card per tool. */
function indexBox(pulled: string | null): Group {
  const W = 6.9;
  const D = 9.2;
  const H = 3.1;
  const T = 0.32;
  const wood = new Standard({ color: '#a87447', roughness: 0.6 });
  const box = new Group();
  for (const [w, h, d, x, y, z] of [
    [W, T, D, 0, T / 2, 0],
    [T, H, D, -W / 2 + T / 2, H / 2, 0],
    [T, H, D, W / 2 - T / 2, H / 2, 0],
    [W, H * 0.62, T, 0, (H * 0.62) / 2, D / 2 - T / 2],
    [W, H, T, 0, H / 2, -D / 2 + T / 2],
  ] as const) {
    const part = new Mesh(new BoxGeometry(w, h, d), wood);
    part.position.set(x, y, z);
    part.castShadow = true;
    part.receiveShadow = true;
    box.add(part);
  }
  // A label on the box's front, like a stationer's.
  const label = new Mesh(
    new PlaneGeometry(3.2, 0.9),
    new MeshLambertMaterial({
      map: canvasTexture(640, 180, (c) => {
        c.fillStyle = '#f3ead6';
        c.fillRect(0, 0, 640, 180);
        c.strokeStyle = '#6b4a2b';
        c.lineWidth = 8;
        c.strokeRect(10, 10, 620, 160);
        c.fillStyle = '#2b1f14';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        fitFont(c, 'Filing cabinet', cond(600), 96, 560);
        c.fillText('Filing cabinet', 320, 96);
      }),
    }),
  );
  label.position.set(-1.6, H * 0.32, D / 2 + 0.01);
  box.add(label);

  const card = new MeshLambertMaterial({ color: '#fbf8f0' });
  const manila = new MeshLambertMaterial({ color: '#e7c98c' });
  const inner = D - 2 * T - 0.4;
  DRAWERS.forEach((drawer, s) => {
    const z0 = D / 2 - T - 0.35 - s * (inner / DRAWERS.length);
    const section = new Group();
    section.position.z = z0;
    // The divider, taller than the cards, its tab cut left, centre or right.
    const divider = new Mesh(new BoxGeometry(W - 2 * T - 0.25, 3.4, 0.04), manila);
    divider.position.set(0, T + 1.7, 0);
    const tabX = [-1.4, 0.3, 1.4, -0.4][s] ?? 0;
    const tab = new Mesh(new BoxGeometry(3.2, 1.15, 0.045), [
      manila,
      manila,
      manila,
      manila,
      new MeshLambertMaterial({ map: tabTexture(drawer.label) }),
      manila,
    ]);
    tab.position.set(tabX, T + 3.4 + 0.57, 0);
    section.add(divider, tab);
    // Behind it, a card per tool, each titled by hand.
    drawer.pieces.forEach((id, k) => {
      const c = new Mesh(new BoxGeometry(W - 2 * T - 0.5, 3.0, 0.03), [
        card,
        card,
        card,
        card,
        new MeshLambertMaterial({ map: cardTexture(pieceById(id).title, pieceById(id).line) }),
        card,
      ]);
      c.position.set(0, T + 1.5, -0.22 - k * 0.24);
      section.add(c);
    });
    if (pulled === drawer.id) {
      // Pulled up out of the box, as you would to look through them.
      section.position.y = 2.2;
      section.position.z += 0.6;
      section.rotation.x = -0.12;
    }
    section.traverse((o) => {
      if ((o as Mesh).isMesh) (o as Mesh).castShadow = true;
    });
    box.add(section);
  });
  return box;
}

function tabTexture(text: string): CanvasTexture {
  return canvasTexture(640, 210, (c) => {
    c.fillStyle = '#e7c98c';
    c.fillRect(0, 0, 640, 210);
    c.fillStyle = '#ffffff';
    c.fillRect(24, 26, 592, 158);
    c.fillStyle = '#1e2225';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitFont(c, text, cond(600), 104, 560);
    c.fillText(text, 320, 112);
  });
}

function cardTexture(title: string, line: string): CanvasTexture {
  return canvasTexture(768, 360, (c) => {
    c.fillStyle = '#fbf8f0';
    c.fillRect(0, 0, 768, 360);
    c.fillStyle = '#d9534f';
    c.fillRect(0, 70, 768, 4);
    c.fillStyle = '#9ec5e8';
    for (let y = 118; y < 360; y += 44) c.fillRect(0, y, 768, 2);
    c.fillStyle = '#1f3a93';
    c.font = italic(52);
    c.fillText(title, 26, 54);
    c.font = italic(30);
    const words = line.split(' ');
    let row = '';
    let y = 110;
    for (const w of words) {
      if (c.measureText(`${row} ${w}`).width > 700) {
        c.fillText(row, 30, y);
        row = w;
        y += 44;
        if (y > 330) break;
      } else row = row ? `${row} ${w}` : w;
    }
    if (y <= 330) c.fillText(row, 30, y);
  });
}

/** A notebook open at the briefs, written by hand in blue ink (a handwriting style, set in Plex italic). */
function notebook(): Group {
  const group = new Group();
  const page = canvasTexture(1024, 1448, (c) => {
    c.fillStyle = '#fbf7ec';
    c.fillRect(0, 0, 1024, 1448);
    c.fillStyle = '#a9c7e6';
    for (let y = 150; y < 1448; y += 58) c.fillRect(0, y, 1024, 2);
    c.fillStyle = '#e39a9a';
    c.fillRect(120, 0, 3, 1448);
    c.fillStyle = '#1f3a93';
    const lines: Array<[string, number]> = [
      ['The briefs', 64],
      ['BRIEF: one signature idea per piece,', 44],
      ['    built properly. Engine first.', 44],
      ['Honest data: label times and sources,', 44],
      ['    an explicit offline state.', 44],
      ['Must not look AI-generated!', 44],
      ['V2: a real technical core, cited,', 44],
      ['    explained in plain words.', 44],
      ['A wow inside ten seconds.', 44],
      ['V3: honest by construction:', 44],
      ['    inferred things labelled inferred.', 44],
      ['Every state designed. Zero console errors.', 44],
      ['Chromium, WebKit, Firefox.', 44],
      ['Two hostile self-critique passes.', 44],
    ];
    let y = 128;
    lines.forEach(([text, size], i) => {
      c.save();
      c.translate(150 + ((i * 13) % 9), y);
      c.rotate(((i % 3) - 1) * 0.008);
      c.font = italic(size);
      c.fillText(text, 0, 0);
      c.restore();
      y += i === 0 ? 116 : 58 * 1.5;
    });
    c.strokeStyle = '#1f3a93';
    c.lineWidth = 4;
    c.beginPath();
    c.ellipse(520, 512, 330, 46, -0.02, 0, Math.PI * 2);
    c.stroke();
  });
  const cover = new Mesh(new BoxGeometry(11.2, 0.2, 15.4), new Standard({ color: '#2f3e46', roughness: 0.7 }));
  cover.position.y = DESK_Y + 0.1;
  const paper = new Mesh(new BoxGeometry(10.5, 0.16, 14.8), [
    new MeshLambertMaterial({ color: '#efe9da' }),
    new MeshLambertMaterial({ color: '#efe9da' }),
    new MeshLambertMaterial({ map: page }),
    new MeshLambertMaterial({ color: '#efe9da' }),
    new MeshLambertMaterial({ color: '#efe9da' }),
    new MeshLambertMaterial({ color: '#efe9da' }),
  ]);
  paper.position.set(0.25, DESK_Y + 0.28, 0);
  const ring = new Standard({ color: '#c0c4c8', metalness: 0.9, roughness: 0.3 });
  for (let i = 0; i < 16; i++) {
    const r = new Mesh(new TorusGeometry(0.32, 0.06, 8, 20), ring);
    r.position.set(-5.15, DESK_Y + 0.3, -6.8 + i * 0.9);
    r.rotation.y = Math.PI / 2;
    group.add(r);
  }
  group.add(cover, paper);
  group.traverse((o) => {
    if ((o as Mesh).isMesh) {
      (o as Mesh).castShadow = true;
      (o as Mesh).receiveShadow = true;
    }
  });
  return group;
}

function coffee(): Group {
  const group = new Group();
  const ceramic = new Standard({ color: '#f4f1ea', roughness: 0.18 });
  const profile = [
    [0, 0],
    [1.75, 0],
    [1.85, 0.2],
    [2.1, 4.2],
    [1.92, 4.25],
    [1.72, 0.45],
    [0, 0.45],
  ].map(([x, y]) => new Vector2(x, y));
  const cup = new Mesh(new LatheGeometry(profile, 48), ceramic);
  const handle = new Mesh(new TorusGeometry(1.0, 0.26, 12, 32, Math.PI * 1.15), ceramic);
  handle.position.set(2.15, 2.2, 0);
  handle.rotation.z = -Math.PI / 2 - 0.3;
  const drink = new Mesh(new CylinderGeometry(1.95, 1.95, 0.05, 48), new Standard({ color: '#4a2c1a', roughness: 0.15 }));
  drink.position.y = 3.65;
  const saucer = new Mesh(new CylinderGeometry(3.1, 2.6, 0.28, 48), ceramic);
  saucer.position.y = 0.14;
  cup.position.y = 0.28;
  handle.position.y += 0.28;
  drink.position.y += 0.28;
  group.add(saucer, cup, handle, drink);
  group.position.y = DESK_Y;
  group.traverse((o) => {
    if ((o as Mesh).isMesh) (o as Mesh).castShadow = true;
  });
  return group;
}

function pencil(): Group {
  const group = new Group();
  const r = 0.18;
  const body = new Mesh(new CylinderGeometry(r, r, 8.2, 6), new Standard({ color: '#f2c230', roughness: 0.45 }));
  const ferrule = new Mesh(
    new CylinderGeometry(r * 1.02, r * 1.02, 0.5, 16),
    new Standard({ color: '#b9bec4', metalness: 0.8, roughness: 0.35 }),
  );
  ferrule.position.y = -4.35;
  const eraser = new Mesh(new CylinderGeometry(r * 0.98, r * 0.98, 0.38, 16), new Standard({ color: '#e88a99', roughness: 0.8 }));
  eraser.position.y = -4.79;
  const wood = new Mesh(new ConeGeometry(r, 0.8, 6, 1, true), new Standard({ color: '#e5c39a', roughness: 0.7 }));
  wood.position.y = 4.5;
  const lead = new Mesh(new ConeGeometry(r * 0.32, 0.26, 12), new Standard({ color: '#3a3a3a', roughness: 0.4 }));
  lead.position.y = 4.88;
  group.add(body, ferrule, eraser, wood, lead);
  group.traverse((o) => {
    if ((o as Mesh).isMesh) (o as Mesh).castShadow = true;
  });
  // Lying on the desk, its tip by the model's front edge.
  group.rotation.set(Math.PI / 2, 0, 0);
  const holder = new Group();
  holder.add(group);
  holder.rotation.y = Math.PI - 0.62;
  holder.position.set(3.2, DESK_Y + r, 9.6);
  return holder;
}

function keyboardEdge(): Group {
  const group = new Group();
  const shell = new Mesh(new BoxGeometry(22, 0.9, 7.5), new Standard({ color: '#2d3036', roughness: 0.6 }));
  shell.position.y = DESK_Y + 0.45;
  group.add(shell);
  const cap = new Standard({ color: '#e9e9e4', roughness: 0.5 });
  for (let row = 0; row < 4; row++)
    for (let k = 0; k < 20; k++) {
      const key = new Mesh(new BoxGeometry(0.82, 0.32, 0.82), cap);
      key.position.set(-10.2 + k * 1.02 + (row % 2) * 0.3, DESK_Y + 1.06, -2.7 + row * 1.02);
      key.castShadow = true;
      group.add(key);
    }
  shell.castShadow = true;
  group.position.set(-9, 0, -15.5);
  group.rotation.y = 0.1;
  return group;
}

function stickyTexture(text: SignText): CanvasTexture {
  return canvasTexture(760, 760, (c) => {
    c.fillStyle = '#ffe36e';
    c.fillRect(0, 0, 760, 760);
    c.fillStyle = 'rgba(0,0,0,0.05)';
    c.fillRect(0, 0, 760, 90);
    c.fillStyle = '#1e2a52';
    c.font = cond(700)(78);
    c.fillText('The grid, now', 46, 150);
    if (text.state === 'live') {
      const [value = '', band = ''] = text.headline.split(', ');
      c.font = mono(600)(150);
      c.fillText(value.replace(' gCO₂/kWh', ''), 46, 330);
      c.font = cond(600)(64);
      c.fillText(`gCO₂/kWh, ${band}`, 46, 420);
    } else {
      fitFont(c, text.headline, cond(700), 92, 680);
      c.fillText(text.headline, 46, 330);
    }
    c.font = cond(500)(40);
    const detail = text.detail.replace('Great Britain, ', 'GB, ');
    fitFont(c, detail, cond(500), 42, 680);
    c.fillText(detail, 46, 540);
    c.fillStyle = '#4a4a3a';
    fitFont(c, `Source: ${text.source}`, cond(500), 34, 680);
    c.fillText(`Source: ${text.source}`, 46, 690);
  });
}

export async function miniature(ctx: StyleContext): Promise<StyleHandle> {
  const { scene, model, renderer } = ctx;
  // ---------- The real desk, daylight from a window ----------
  scene.background = new Color('#cfc3b2');
  renderer.setClearColor('#cfc3b2');
  renderer.shadowMap.enabled = true;
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const groundMaterial = model.baked[0];
  for (const o of model.group.children) if ((o as Mesh).material === groundMaterial) o.visible = false;
  scene.add(deskSurface());
  const sun = new DirectionalLight('#fff1dc', 2.4);
  sun.position.set(-26, 34, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 30, bottom: -30, near: 5, far: 110 });
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  ctx.fill.color.set('#fff6ea');
  ctx.fill.groundColor.set('#8a6a4a');
  ctx.fill.intensity *= 1.2;
  const [work] = ctx.lamps;
  if (work) work.intensity *= 0.7;
  const tint: Record<string, string> = { card: '#f3efe7', wood: '#d7b88e', grey: '#a7a39a', dark: '#2b2a28', cork: '#c39a6b' };
  for (const [material, colour] of Object.entries(tint)) {
    const mesh = model.boxes.get(material as never) as InstancedMesh | undefined;
    if (mesh) {
      (mesh.material as MeshLambertMaterial).color.set(colour);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  }
  for (const pool of model.pools.values()) pool.visible = false;
  ctx.cabinet.group.visible = false;

  // ---------- At giant scale, around the model ----------
  const box = indexBox(ctx.close === 'cabinet' ? 'grid' : null);
  box.position.set(-13.4, DESK_Y, 2.2);
  box.rotation.y = -0.3;
  scene.add(box);
  const cup = coffee();
  cup.position.set(14.2, DESK_Y, -8.6);
  scene.add(cup);
  const book = notebook();
  book.position.set(12.6, 0, 8.4);
  book.rotation.y = -0.32;
  scene.add(book);
  scene.add(pencil(), keyboardEdge());
  // The grid reading, on a sticky note on the desk beside the model, in the sharp band.
  let sticky = new Mesh(new PlaneGeometry(3.6, 3.6), new MeshLambertMaterial({ map: stickyTexture(signFor(null)) }));
  sticky.rotation.set(-Math.PI / 2, 0, -0.12);
  sticky.position.set(10.6, DESK_Y + 0.02, -2.2);
  sticky.receiveShadow = true;
  scene.add(sticky);
  ctx.signFace.visible = false;

  // The radio, on the model's Reception counter.
  const radio = (await loadGltf('kenney-furniture-kit/radio.glb')).scene;
  fitBox(radio, RECEPTION.x - 0.6, RECEPTION.z, { x: 0.46, y: 0.28, z: 0.2 }, 0.3, RECEPTION.height + 0.04);
  radio.traverse((o) => {
    if ((o as Mesh).isMesh) (o as Mesh).castShadow = true;
  });
  scene.add(radio);

  // ---------- Toy people, with a plastic sheen ----------
  const [cast, reviewerGltf, wheelchairGltf] = await Promise.all([
    Promise.all(MINI.map((n) => loadGltf(`kenney-mini-characters/${n}.glb`))),
    loadGltf('kenney-mini-characters/character-male-f.glb'),
    loadGltf('kenney-mini-characters/wheelchair.glb'),
  ]);
  const toy = (root: Object3D) =>
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      const m = mesh.material as MeshStandardMaterial;
      if ('roughness' in m) {
        m.roughness = 0.28;
        m.metalness = 0;
        m.envMapIntensity = 1.3;
      }
    });
  const wheelchairDesk = DESKS[WHEELCHAIR_DESK]?.piece;
  const builders = DESKS.map((d, i) => {
    const gltf = cast[i];
    if (!gltf) throw new Error('missing character');
    const p = person(gltf, 1.45);
    toy(p.root);
    scene.add(p.root);
    return [d.piece, p] as const;
  });
  if (wheelchairDesk) {
    const d = deskFor(wheelchairDesk);
    const w = wheelchairGltf.scene;
    w.scale.setScalar(1.85);
    w.rotation.y = Math.PI;
    w.position.set(d.seat[0], 0, d.seat[1] + 0.02);
    toy(w);
    scene.add(w);
  }
  const reviewer = person(reviewerGltf, 1.5);
  toy(reviewer.root);
  reviewer.root.position.set(REVIEW.reviewer[0], 0, REVIEW.reviewer[1] - 0.08);
  reviewer.root.rotation.y = Math.PI;
  reviewer.sheet.visible = true;
  play(reviewer, 'holding', 0.4);
  scene.add(reviewer.root);
  ctx.crew.people = false;

  // ---------- Tilt-shift ----------
  const tilt = new TiltShiftPass(renderer, {
    focus: ctx.close ? 0.5 : 0.47,
    band: ctx.close ? 0.1 : 0.16,
    falloff: 0.32,
    radius: 11 * Math.min(window.devicePixelRatio, 2),
    saturation: 1.22,
  });

  // The frame holds the model and the giant things around it.
  const world = (o: Object3D, points: Array<[number, number, number]>) => {
    o.updateMatrixWorld(true);
    return points.map((p) => o.localToWorld(new Vector3(...p)));
  };
  const scenePoints = [
    ...world(box, [
      [-3.45, 0, -4.6],
      [-3.45, 0, 4.6],
      [-3.45, 5.0, -4.6],
      [-3.45, 5.0, 4.6],
      [3.45, 0, -4.6],
      [3.45, 0, 4.6],
      [3.45, 5.0, -4.6],
      [3.45, 5.0, 4.6],
    ]),
    new Vector3(BASE.x0, 0, BASE.z0),
    new Vector3(BASE.x1, 0, BASE.z1),
    new Vector3(12.6, 0, -0.2),
    new Vector3(14.2, 4.6, -8.6),
    new Vector3(16.4, 0, -8.6),
    ...world(book, [[-5.6, 0, 2]]),
  ];
  const seat = (p: Person, x: number, z: number, wheel: boolean) => {
    p.root.position.set(x, wheel ? 0.13 : 0.27, z - 0.06);
    p.root.rotation.y = Math.PI;
  };
  let lastHeld: string | null | undefined;
  return {
    views: {
      door: (aspect) => fitView(fromAngles(44, -22), 22, aspect, scenePoints, { top: 0.94, bottom: -0.94, side: 0.88 }),
      desk: () => lookFrom([1.9, 2.35, 7.2], [0.1, 0.85, 0.6], 30),
      cabinet: () => {
        const [a] = world(box, [[0, 2.6, 0]]);
        const target = a ?? new Vector3(-15, 2.6, 0.8);
        return { pos: target.clone().add(new Vector3(9.5, 9.5, 15)), look: target, fov: 28 };
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
          p.root.position.set(REVIEW.table.x + 0.55, 0, REVIEW.table.z - REVIEW.table.depth / 2 - 0.45);
          p.root.rotation.y = 0;
          p.sheet.visible = true;
          play(p, 'holding', i * 0.3);
        } else {
          seat(p, d.seat[0], d.seat[1], wheel);
          p.sheet.visible = false;
          play(p, seatedClip(phase, wheel), i * 0.37);
        }
        p.mixer.update(dt);
      });
      reviewer.mixer.update(dt);
    },
    render: (s, camera) => tilt.render(s, camera),
    resize: (w, h) => tilt.setSize(w, h),
    sign(text) {
      const next = new Mesh(sticky.geometry, new MeshLambertMaterial({ map: stickyTexture(text) }));
      next.rotation.copy(sticky.rotation);
      next.position.copy(sticky.position);
      next.receiveShadow = true;
      scene.remove(sticky);
      scene.add(next);
      sticky = next;
    },
  };
}
