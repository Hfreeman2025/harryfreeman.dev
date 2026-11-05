// The real-size things on Harry's desk, around the model, drawn in the model's clean graphic style:
// the desk itself, the index-card box that is the filing cabinet, the notebook of briefs, the
// keyboard that is Reception, the rubber stamp and ink pad, a cup of coffee, a pencil and the sticky
// note with the grid's reading. The room is 1:50, so 1 cm on the desk is 0.5 units here.

import {
  BoxGeometry,
  type CanvasTexture,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  type Material,
  Mesh,
  MeshLambertMaterial,
  type Object3D,
  PlaneGeometry,
  RepeatWrapping,
  Shape,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { DRAWERS } from '../content/drawers';
import { PIECES, type PieceId, pieceById } from '../content/pieces';
import type { SignText } from '../room/grid';
import { canvasTexture, cond, fitFont } from '../scene/style';
import { BIRCH, BLUE, CORAL, CREAM, INK, PAPER, SUN } from './palette';

/** The desk's top, where the model's base and everything else stand. */
export const DESK_Y = -0.15;
export const hand = (weight: number) => (px: number) => `${weight} ${px}px "Caveat", "Comic Sans MS", cursive`;

const flat = (color: string) => new MeshLambertMaterial({ color });
function shadows(o: Object3D, receive = true): Object3D {
  o.traverse((m) => {
    if ((m as Mesh).isMesh) {
      (m as Mesh).castShadow = true;
      (m as Mesh).receiveShadow = receive;
    }
  });
  return o;
}

// ---------- The desk ----------
export function deskTop(): Mesh {
  const texture = canvasTexture(1024, 1024, (c) => {
    c.fillStyle = BIRCH;
    c.fillRect(0, 0, 1024, 1024);
    // Long boards, flat-coloured, with a fine seam: graphic, not photographic.
    for (let x = 0; x < 1024; x += 128) {
      c.fillStyle = (x / 128) % 2 ? 'rgba(160,110,60,0.04)' : 'rgba(255,255,255,0.04)';
      c.fillRect(x, 0, 128, 1024);
      c.fillStyle = 'rgba(120,80,40,0.12)';
      c.fillRect(x, 0, 2, 1024);
    }
  });
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(6, 6);
  const mesh = new Mesh(new PlaneGeometry(200, 200), new MeshLambertMaterial({ map: texture }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = DESK_Y - 0.004;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------- The index-card box: the filing cabinet ----------
const BOX = { w: 6.9, d: 9.2, h: 3.1, wall: 0.3 } as const;
const CARD = { w: BOX.w - 2 * BOX.wall - 0.5, h: 3.0 } as const;

function tabTexture(text: string): CanvasTexture {
  return canvasTexture(720, 220, (c) => {
    c.fillStyle = SUN;
    c.fillRect(0, 0, 720, 220);
    c.fillStyle = INK;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitFont(c, text, cond(700), 118, 660);
    c.fillText(text, 360, 118);
  });
}

function cardTexture(title: string, line: string): CanvasTexture {
  return canvasTexture(768, 360, (c) => {
    c.fillStyle = PAPER;
    c.fillRect(0, 0, 768, 360);
    c.fillStyle = CORAL;
    c.fillRect(0, 74, 768, 5);
    c.fillStyle = '#c9d6ee';
    for (let y = 122; y < 360; y += 44) c.fillRect(0, y, 768, 2);
    c.fillStyle = INK;
    fitFont(c, title, hand(700), 66, 720);
    c.fillText(title, 26, 58);
    c.font = hand(500)(36);
    let row = '';
    let y = 112;
    for (const w of line.split(' ')) {
      if (c.measureText(`${row} ${w}`).width > 700) {
        c.fillText(row, 30, y);
        row = w;
        y += 44;
        if (y > 330) return;
      } else row = row ? `${row} ${w}` : w;
    }
    c.fillText(row, 30, y);
  });
}

interface Section {
  readonly id: string;
  readonly group: Group;
  readonly cards: Array<{ readonly piece: PieceId; readonly mesh: Mesh; readonly group: Group; lift: number; liftTarget: number }>;
  readonly tab: Mesh;
  out: number;
  outTarget: number;
}

/**
 * The filing cabinet as a real index-card box: a divider per drawer, a card per tool. It answers to
 * the cabinet's controls: open a divider (its cards rise to be read), lift a card out.
 */
export class IndexBox {
  readonly group = new Group();
  readonly drawers: Section[] = [];
  readonly pickables: Mesh[] = [];

  constructor() {
    const wood = flat(CORAL);
    const inside = flat('#d65a57');
    const { w, d, h, wall } = BOX;
    for (const [bw, bh, bd, x, y, z, m] of [
      [w, wall, d, 0, wall / 2, 0, wood],
      [wall, h, d, -w / 2 + wall / 2, h / 2, 0, wood],
      [wall, h, d, w / 2 - wall / 2, h / 2, 0, wood],
      [w, h * 0.6, wall, 0, (h * 0.6) / 2, d / 2 - wall / 2, wood],
      [w, h, wall, 0, h / 2, -d / 2 + wall / 2, inside],
    ] as const) {
      const part = new Mesh(new BoxGeometry(bw, bh, bd), m);
      part.position.set(x, y, z);
      part.userData.target = 'cabinet';
      this.group.add(part);
      this.pickables.push(part);
    }
    const label = new Mesh(
      new PlaneGeometry(3.6, 0.95),
      new MeshLambertMaterial({
        map: canvasTexture(720, 190, (c) => {
          c.fillStyle = CREAM;
          c.fillRect(0, 0, 720, 190);
          c.strokeStyle = INK;
          c.lineWidth = 10;
          c.strokeRect(5, 5, 710, 180);
          c.fillStyle = INK;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          fitFont(c, 'Filing cabinet', cond(700), 110, 640);
          c.fillText('Filing cabinet', 360, 100);
        }),
      }),
    );
    label.position.set(0, h * 0.3, d / 2 + 0.01);
    this.group.add(label);

    const card = flat(PAPER);
    const manila = flat('#f3dfa8');
    const span = d - 2 * wall - 0.6;
    DRAWERS.forEach((drawer, s) => {
      const section = new Group();
      section.position.z = d / 2 - wall - 0.45 - s * (span / DRAWERS.length);
      const divider = new Mesh(new BoxGeometry(w - 2 * wall - 0.2, 3.3, 0.05), manila);
      divider.position.set(0, wall + 1.65, 0);
      const tabX = [-1.3, 0.35, 1.3, -0.35][s] ?? 0;
      const tab = new Mesh(new BoxGeometry(3.3, 1.2, 0.055), [
        manila,
        manila,
        manila,
        manila,
        new MeshLambertMaterial({ map: tabTexture(drawer.label) }),
        manila,
      ]);
      tab.position.set(tabX, wall + 3.3 + 0.6, 0);
      divider.userData.target = `drawer:${drawer.id}`;
      tab.userData.target = `drawer:${drawer.id}`;
      section.add(divider, tab);
      this.pickables.push(divider, tab);
      const cards = drawer.pieces.map((id, k) => {
        const g = new Group();
        const piece = pieceById(id);
        const mesh = new Mesh(new BoxGeometry(CARD.w, CARD.h, 0.035), [
          card,
          card,
          card,
          card,
          new MeshLambertMaterial({ map: cardTexture(piece.title, piece.line) }),
          card,
        ]);
        mesh.position.set(0, wall + CARD.h / 2, 0);
        mesh.userData.target = `folder:${id}`;
        g.add(mesh);
        g.position.z = -0.24 - k * 0.26;
        section.add(g);
        this.pickables.push(mesh);
        return { piece: id, mesh, group: g, lift: 0, liftTarget: 0 };
      });
      this.group.add(section);
      this.drawers.push({ id: drawer.id, group: section, cards, tab, out: 0, outTarget: 0 });
    });
    shadows(this.group);
  }

  /** Open a divider: its section rises so its cards can be read. */
  open(id: string | null): void {
    for (const s of this.drawers) s.outTarget = s.id === id ? 1 : 0;
  }

  /** Lift one card clear of the box. */
  lift(piece: PieceId | null): void {
    for (const s of this.drawers) for (const c of s.cards) c.liftTarget = c.piece === piece ? 1 : 0;
  }

  isOpen(id: string): boolean {
    return this.drawers.some((s) => s.id === id && s.outTarget > 0);
  }

  update(dt: number, snap: boolean): boolean {
    const k = snap ? 1 : 1 - Math.exp(-dt * 7);
    let moving = false;
    for (const s of this.drawers) {
      s.out += (s.outTarget - s.out) * k;
      if (Math.abs(s.outTarget - s.out) < 0.001) s.out = s.outTarget;
      else moving = true;
      // An open section rises and leans back, its cards fanned to be read.
      s.group.position.y = s.out * 2.4;
      s.group.rotation.x = -s.out * 0.16;
      s.cards.forEach((c, i) => {
        c.lift += (c.liftTarget - c.lift) * k;
        if (Math.abs(c.liftTarget - c.lift) < 0.001) c.lift = c.liftTarget;
        else moving = true;
        c.group.position.y = s.out * i * 0.55 + c.lift * 3.2;
        c.group.rotation.x = s.out * (0.12 + i * 0.06);
      });
    }
    return moving;
  }

  /** A point in the box's own frame, where it is on the desk. */
  world(local: Vector3): Vector3 {
    this.group.updateMatrixWorld(true);
    return this.group.localToWorld(local.clone());
  }

  /** Where a divider's tab or a card's top is, for the buttons laid over them. */
  anchor(target: string): Vector3 | null {
    const [kind, id] = target.split(':');
    for (const s of this.drawers) {
      if (kind === 'drawer' && s.id === id) return s.tab.getWorldPosition(new Vector3());
      for (const c of s.cards) if (kind === 'folder' && c.piece === id) return c.mesh.localToWorld(new Vector3(0, CARD.h / 2 + 0.2, 0));
    }
    return null;
  }

  /** The corners of a divider's tab, for the button that lies over it. */
  frontCorners(id: string): Vector3[] {
    const s = this.drawers.find((x) => x.id === id);
    if (!s) return [];
    return [
      [-1.65, -0.6],
      [1.65, -0.6],
      [1.65, 0.6],
      [-1.65, 0.6],
    ].map(([x, y]) => s.tab.localToWorld(new Vector3(x, y, 0.03)));
  }

  /** The band at the top of a card where its title is written, for the button that lies over it. */
  cardCorners(piece: PieceId): Vector3[] {
    for (const s of this.drawers)
      for (const c of s.cards)
        if (c.piece === piece)
          return [
            [-CARD.w / 2, CARD.h / 2],
            [CARD.w / 2, CARD.h / 2],
            [CARD.w / 2, CARD.h / 2 - 0.62],
            [-CARD.w / 2, CARD.h / 2 - 0.62],
          ].map(([x, y]) => c.mesh.localToWorld(new Vector3(x, y, 0.03)));
    return [];
  }

  /** Corners of the whole box, raised sections included, for framing views. */
  corners(): Vector3[] {
    const { w, d } = BOX;
    const out: Vector3[] = [];
    for (const x of [-w / 2, w / 2]) for (const y of [0, 7.5]) for (const z of [-d / 2, d / 2]) out.push(this.world(new Vector3(x, y, z)));
    return out;
  }
}

// ---------- The notebook: the briefs ----------
export const ROUNDS = ['BRIEF.md', 'V2.md', 'V3.md'] as const;
export type Round = (typeof ROUNDS)[number];

/** A page of the notebook: each tool's ask in that round, as the site already quotes it, by hand. */
function pageTexture(round: Round): CanvasTexture {
  return canvasTexture(1024, 1448, (c) => {
    c.fillStyle = PAPER;
    c.fillRect(0, 0, 1024, 1448);
    c.fillStyle = '#c9d6ee';
    for (let y = 170; y < 1448; y += 62) c.fillRect(0, y, 1024, 2);
    c.fillStyle = CORAL;
    c.fillRect(118, 0, 3, 1448);
    c.fillStyle = INK;
    c.font = hand(700)(84);
    c.fillText(round === 'BRIEF.md' ? 'The brief' : round === 'V2.md' ? 'V2' : 'V3', 150, 112);
    c.font = hand(500)(40);
    c.fillStyle = BLUE;
    c.fillText(round, 760, 112);
    let y = 222;
    for (const piece of PIECES) {
      const ask = piece.brief.find((b) => b.doc === round)?.ask;
      if (!ask) continue;
      c.fillStyle = INK;
      c.font = hand(700)(40);
      c.fillText(piece.title, 150, y);
      y += 46;
      c.fillStyle = '#2b3a67';
      c.font = hand(500)(34);
      let row = '';
      for (const w of ask.split(' ')) {
        if (c.measureText(`${row} ${w}`).width > 820) {
          c.fillText(row, 170, y);
          row = w;
          y += 40;
        } else row = row ? `${row} ${w}` : w;
      }
      c.fillText(row, 170, y);
      y += 58;
      if (y > 1420) break;
    }
  });
}

export class Notebook {
  readonly group = new Group();
  readonly pickables: Mesh[] = [];
  readonly #pages = new Map<Round, CanvasTexture>();
  readonly #right: Mesh;
  readonly #turning: Mesh;
  #turn = 1;
  #next: Round | null = null;
  round: Round = 'BRIEF.md';

  constructor() {
    for (const r of ROUNDS) this.#pages.set(r, pageTexture(r));
    const cover = new Mesh(new BoxGeometry(16.2, 0.24, 11.2), flat(BLUE));
    cover.position.y = DESK_Y + 0.12;
    const blank = flat(PAPER);
    // Each page has its own top face (and the turning page its own back), so changing one never paints another.
    const page = (map: CanvasTexture | null) => [blank, blank, new MeshLambertMaterial({ color: PAPER, map }), flat(PAPER), blank, blank];
    // Open flat: the left page is the cover's inside, the right page shows the round.
    const left = new Mesh(new BoxGeometry(7.7, 0.14, 10.6), page(null));
    left.position.set(-3.95, DESK_Y + 0.31, 0);
    this.#right = new Mesh(new BoxGeometry(7.7, 0.14, 10.6), page(this.#pages.get('BRIEF.md') ?? null));
    this.#right.position.set(3.95, DESK_Y + 0.31, 0);
    // The page being turned, hinged at the spine.
    const hinge = new Group();
    hinge.position.set(0, DESK_Y + 0.4, 0);
    this.#turning = new Mesh(new BoxGeometry(7.7, 0.04, 10.6), page(null));
    this.#turning.position.x = 3.95;
    this.#turning.visible = false;
    hinge.add(this.#turning);
    const ring = flat('#c8ccd2');
    for (let i = 0; i < 12; i++) {
      const r = new Mesh(new TorusGeometry(0.34, 0.07, 8, 18), ring);
      r.position.set(0, DESK_Y + 0.4, -4.8 + i * 0.87);
      this.group.add(r);
    }
    // A label on the left page: what the notebook holds.
    const title = new Mesh(
      new PlaneGeometry(6.6, 2.6),
      new MeshLambertMaterial({
        transparent: true,
        map: canvasTexture(660, 260, (c) => {
          c.fillStyle = INK;
          c.font = hand(700)(96);
          c.fillText('The briefs', 30, 110);
          c.font = hand(500)(46);
          c.fillStyle = '#2b3a67';
          c.fillText('one page a round: turn it to', 34, 180);
          c.fillText('replay that round in the office', 34, 232);
        }),
      }),
    );
    title.rotation.x = -Math.PI / 2;
    title.position.set(-3.95, DESK_Y + 0.39, -2.6);
    this.group.add(cover, left, this.#right, hinge, title);
    for (const m of [cover, left, this.#right, title]) {
      m.userData.target = 'notebook';
      this.pickables.push(m);
    }
    shadows(this.group);
  }

  /** Turns to a round's page; the page swings over the spine. */
  turnTo(round: Round, snap: boolean): void {
    if (round === this.round && !this.#next) return;
    this.#next = round;
    if (snap) this.#turn = 1;
    else this.#turn = 0;
    const map = this.#pages.get(round) ?? null;
    const mats = this.#turning.material as Material[];
    const outgoing = (this.#right.material as MeshLambertMaterial[])[2];
    if (mats[2] && outgoing) (mats[2] as MeshLambertMaterial).map = outgoing.map;
    for (const m of mats) m.needsUpdate = true;
    const rightTop = (this.#right.material as MeshLambertMaterial[])[2];
    if (rightTop) {
      rightTop.map = map;
      rightTop.needsUpdate = true;
    }
    this.round = round;
  }

  update(dt: number): boolean {
    if (this.#turn >= 1) {
      this.#turning.visible = false;
      return false;
    }
    this.#turn = Math.min(1, this.#turn + dt / 0.7);
    this.#turning.visible = true;
    const parent = this.#turning.parent;
    if (parent) parent.rotation.z = Math.PI * (1 - (1 - this.#turn) ** 2);
    if (this.#turn >= 1) this.#next = null;
    return true;
  }

  corners(): Vector3[] {
    this.group.updateMatrixWorld(true);
    const out: Vector3[] = [];
    for (const x of [-8.1, 8.1]) for (const z of [-5.6, 5.6]) out.push(this.group.localToWorld(new Vector3(x, DESK_Y + 0.4, z)));
    return out;
  }
}

// ---------- The keyboard: Reception ----------
const ROWS = ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'] as const;

export class Keyboard {
  readonly group = new Group();
  readonly pickables: Mesh[] = [];
  readonly #keys = new Map<string, Mesh>();
  readonly #pressed = new Map<Mesh, number>();
  readonly #space: Mesh;

  constructor() {
    const shell = new Mesh(new BoxGeometry(21.4, 0.9, 8.2), flat(INK));
    shell.position.y = DESK_Y + 0.45;
    this.group.add(shell);
    shell.userData.target = 'reception';
    this.pickables.push(shell);
    const cap = flat(CREAM);
    const accent = flat(SUN);
    const pitch = 1.55;
    ROWS.forEach((row, r) => {
      [...row].forEach((ch, k) => {
        const key = new Mesh(new BoxGeometry(1.32, 0.42, 1.32), ch === 'f' || ch === 'j' ? accent : cap);
        key.position.set(-9.2 + k * pitch + r * 0.42, DESK_Y + 1.11, -2.85 + r * pitch);
        key.userData.target = 'reception';
        key.userData.rest = key.position.y;
        this.group.add(key);
        this.pickables.push(key);
        this.#keys.set(ch, key);
      });
    });
    this.#space = new Mesh(new BoxGeometry(9.4, 0.42, 1.32), cap);
    this.#space.position.set(-0.2, DESK_Y + 1.11, -2.85 + 4 * pitch);
    this.#space.userData.target = 'reception';
    this.#space.userData.rest = this.#space.position.y;
    this.group.add(this.#space);
    this.pickables.push(this.#space);
    const enter = new Mesh(new BoxGeometry(2.4, 0.42, 1.32), flat(CORAL));
    enter.position.set(9.0, DESK_Y + 1.11, -2.85 + 2 * pitch);
    enter.userData.rest = enter.position.y;
    enter.userData.target = 'reception';
    this.#keys.set('Enter', enter);
    this.group.add(enter);
    this.pickables.push(enter);
    shadows(this.group);
  }

  /** Presses the key a character falls on, so the 3D keys move in time with typing. */
  press(key: string): boolean {
    const mesh = key === ' ' ? this.#space : (this.#keys.get(key.length === 1 ? key.toLowerCase() : key) ?? null);
    if (!mesh) return false;
    this.#pressed.set(mesh, 0.16);
    return true;
  }

  update(dt: number): void {
    for (const [mesh, left] of this.#pressed) {
      const rest = mesh.userData.rest as number;
      const next = left - dt;
      mesh.position.y = rest - (next > 0.08 ? 0.28 : Math.max(0, next / 0.08) * 0.28);
      if (next <= 0) {
        mesh.position.y = rest;
        this.#pressed.delete(mesh);
      } else this.#pressed.set(mesh, next);
    }
  }

  /** How many keys are down now (for the checks). */
  get down(): number {
    return this.#pressed.size;
  }

  corners(): Vector3[] {
    this.group.updateMatrixWorld(true);
    const out: Vector3[] = [];
    for (const x of [-10.7, 10.7]) for (const z of [-4.1, 4.1]) out.push(this.group.localToWorld(new Vector3(x, DESK_Y + 1.3, z)));
    return out;
  }
}

// ---------- The stamp and ink pad: receipts ----------
export function stampAndPad(): Group {
  const group = new Group();
  const tin = new Mesh(new BoxGeometry(5.6, 0.5, 3.6), flat(INK));
  tin.position.set(0, DESK_Y + 0.25, 0);
  const pad = new Mesh(new BoxGeometry(5.0, 0.12, 3.0), flat('#3b2f6b'));
  pad.position.set(0, DESK_Y + 0.56, 0);
  const handle = new Mesh(new CylinderGeometry(0.75, 0.95, 3.4, 24), flat(SUN));
  handle.position.set(-5.2, DESK_Y + 2.6, 0.6);
  const knob = new Mesh(new CylinderGeometry(1.0, 0.75, 0.9, 24), flat(SUN));
  knob.position.set(-5.2, DESK_Y + 4.6, 0.6);
  const base = new Mesh(new BoxGeometry(2.8, 0.8, 2.0), flat(CORAL));
  base.position.set(-5.2, DESK_Y + 0.5, 0.6);
  const rubber = new Mesh(new BoxGeometry(2.6, 0.12, 1.8), flat('#2b2440'));
  rubber.position.set(-5.2, DESK_Y + 0.06, 0.6);
  group.add(tin, pad, handle, knob, base, rubber);
  for (const m of [tin, pad, handle, knob, base]) m.userData.target = 'stamp';
  shadows(group);
  return group;
}

// ---------- A cup of coffee, a pencil ----------
export function coffee(): Group {
  const group = new Group();
  const ceramic = flat(CREAM);
  const band = flat(CORAL);
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
  cup.position.y = 0.28;
  const stripe = new Mesh(new CylinderGeometry(2.04, 1.98, 0.7, 48, 1, true), band);
  stripe.position.y = 0.28 + 2.9;
  const handle = new Mesh(new TorusGeometry(1.0, 0.26, 12, 32, Math.PI * 1.15), ceramic);
  handle.position.set(2.15, 2.48, 0);
  handle.rotation.z = -Math.PI / 2 - 0.3;
  const drink = new Mesh(new CylinderGeometry(1.95, 1.95, 0.05, 48), flat('#5a3a24'));
  drink.position.y = 3.93;
  const saucer = new Mesh(new CylinderGeometry(3.1, 2.6, 0.28, 48), ceramic);
  saucer.position.y = 0.14;
  group.add(saucer, cup, stripe, handle, drink);
  group.position.y = DESK_Y;
  shadows(group);
  return group;
}

export function pencil(): Group {
  const r = 0.2;
  const body = new Mesh(new CylinderGeometry(r, r, 8.2, 6), flat(SUN));
  const ferrule = new Mesh(new CylinderGeometry(r * 1.02, r * 1.02, 0.5, 16), flat('#b9bec4'));
  ferrule.position.y = -4.35;
  const eraser = new Mesh(new CylinderGeometry(r * 0.98, r * 0.98, 0.38, 16), flat(CORAL));
  eraser.position.y = -4.79;
  const wood = new Mesh(new CylinderGeometry(0.02, r, 0.8, 6), flat('#f0d3ad'));
  wood.position.y = 4.5;
  const inner = new Group();
  inner.add(body, ferrule, eraser, wood);
  inner.rotation.set(Math.PI / 2, 0, 0);
  const holder = new Group();
  holder.add(inner);
  shadows(holder);
  return holder;
}

// ---------- The sticky note: the grid ----------
export function stickyTexture(text: SignText): CanvasTexture {
  return canvasTexture(760, 760, (c) => {
    c.fillStyle = SUN;
    c.fillRect(0, 0, 760, 760);
    c.fillStyle = 'rgba(0,0,0,0.06)';
    c.fillRect(0, 0, 760, 84);
    c.fillStyle = INK;
    c.font = hand(700)(84);
    c.fillText('The grid, now', 44, 160);
    if (text.state === 'live') {
      const [value = '', band = ''] = text.headline.split(', ');
      c.font = hand(700)(200);
      c.fillText(value.replace(' gCO₂/kWh', ''), 44, 360);
      c.font = hand(700)(66);
      c.fillText(`gCO₂/kWh, ${band}`, 44, 440);
    } else {
      fitFont(c, text.headline, hand(700), 104, 680);
      c.fillText(text.headline, 44, 340);
    }
    fitFont(c, text.detail.replace('Great Britain, ', 'GB, '), hand(500), 52, 680);
    c.fillText(text.detail.replace('Great Britain, ', 'GB, '), 44, 600);
    // The credit is a slip stuck under the note: real text on the page (#desk-credit), not paint.
  });
}

export function sticky(text: SignText): Mesh {
  const mesh = new Mesh(new PlaneGeometry(4.4, 4.4), new MeshLambertMaterial({ map: stickyTexture(text) }));
  mesh.rotation.set(-Math.PI / 2, 0, 0);
  mesh.receiveShadow = true;
  mesh.userData.target = 'sign';
  return mesh;
}

/** A tiny receipt printer for the model's Reception counter: answers print out of it. */
export function printer(): Group {
  const group = new Group();
  const body = new Mesh(new BoxGeometry(0.42, 0.2, 0.32), flat(INK));
  body.position.y = 0.1;
  const slot = new Mesh(new BoxGeometry(0.3, 0.02, 0.04), flat('#0b0e16'));
  slot.position.set(0, 0.205, -0.06);
  group.add(body, slot);
  shadows(group);
  return group;
}

/**
 * Harry's nameplate: a wedge on the desk, its slanted face turned up to the door camera. The name is real
 * text laid over the face (#masthead's plate), so the face is a plain cream plate in an ink frame.
 */
export const PLATE = { width: 9.6, depth: 2.6, height: 1.9, inset: 0.22 } as const;
export class Nameplate {
  readonly group = new Group();
  constructor() {
    const { width: w, depth: d, height: h } = PLATE;
    // The wedge's side profile, in (−z, y) because turning the extrusion maps the shape's x to −z: flat on
    // the desk, upright at the back, the face sloping down to the front edge.
    const shape = new Shape([new Vector2(-d / 2, 0), new Vector2(d / 2, 0), new Vector2(d / 2, h), new Vector2(d / 2 - 0.25, h)]);
    const body = new Mesh(new ExtrudeGeometry(shape, { depth: w, bevelEnabled: false }), flat(INK));
    // Extruded along z; turned so the length runs along x.
    body.rotation.y = Math.PI / 2;
    body.position.set(-w / 2, 0, 0);
    const face = new Mesh(new PlaneGeometry(w - 2 * PLATE.inset, this.#slope() - 2 * PLATE.inset), flat(CREAM));
    face.position.copy(this.#faceCentre(0.012));
    face.rotation.x = -Math.atan2(d - 0.25, h);
    face.userData.noEdge = true;
    this.group.add(body, face);
    this.group.position.y = DESK_Y;
    shadows(this.group);
  }
  #slope(): number {
    return Math.hypot(PLATE.depth - 0.25, PLATE.height);
  }
  /** The middle of the sloping face, lifted off it by `lift` along its normal. */
  #faceCentre(lift: number): Vector3 {
    const { depth: d, height: h } = PLATE;
    const run = d - 0.25;
    const n = new Vector3(0, run, h).normalize();
    return new Vector3(0, h / 2, d / 2 - run / 2).addScaledVector(n, lift);
  }
  /** The face's text area, in the room: top-left, top-right, bottom-right, bottom-left as the camera sees it. */
  face(): Vector3[] {
    const { width: w, depth: d, height: h, inset } = PLATE;
    const run = d - 0.25;
    const along = new Vector3(0, -h, run).normalize();
    const top = new Vector3(0, h, d / 2 - run).addScaledVector(along, inset);
    const bottom = new Vector3(0, 0, d / 2).addScaledVector(along, -inset);
    const x = w / 2 - inset;
    this.group.updateMatrixWorld(true);
    return [
      new Vector3(-x, top.y, top.z),
      new Vector3(x, top.y, top.z),
      new Vector3(x, bottom.y, bottom.z),
      new Vector3(-x, bottom.y, bottom.z),
    ].map((p) => this.group.localToWorld(p));
  }
  corners(): Vector3[] {
    const { width: w, depth: d, height: h } = PLATE;
    this.group.updateMatrixWorld(true);
    const out: Vector3[] = [];
    for (const x of [-w / 2, w / 2])
      for (const [y, z] of [
        [0, d / 2],
        [h, -d / 2],
      ] as const)
        out.push(this.group.localToWorld(new Vector3(x, y, z)));
    return out;
  }
}

/** Harry's card, lying on the desk by the nameplate: the intro and his links are real text laid over it. */
export const BCARD = { width: 12.8, depth: 7.0, inset: 0.55 } as const;
export class BusinessCard {
  readonly group = new Group();
  constructor() {
    const card = new Mesh(new BoxGeometry(BCARD.width, 0.08, BCARD.depth), flat(PAPER));
    card.position.y = 0.04;
    const rule = new Mesh(new BoxGeometry(BCARD.width, 0.082, 0.18), flat(CORAL));
    rule.position.set(0, 0.041, -BCARD.depth / 2 + 0.09);
    this.group.add(card, rule);
    this.group.position.y = DESK_Y;
    shadows(this.group);
  }
  /** The card's text area, in the room: top-left, top-right, bottom-right, bottom-left. */
  face(): Vector3[] {
    const x = BCARD.width / 2 - BCARD.inset;
    const z = BCARD.depth / 2 - BCARD.inset;
    this.group.updateMatrixWorld(true);
    return [new Vector3(-x, 0.09, -z + 0.15), new Vector3(x, 0.09, -z + 0.15), new Vector3(x, 0.09, z), new Vector3(-x, 0.09, z)].map((p) =>
      this.group.localToWorld(p),
    );
  }
  corners(): Vector3[] {
    this.group.updateMatrixWorld(true);
    return [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([sx = 0, sz = 0]) => this.group.localToWorld(new Vector3((sx * BCARD.width) / 2, 0.1, (sz * BCARD.depth) / 2)));
  }
}
