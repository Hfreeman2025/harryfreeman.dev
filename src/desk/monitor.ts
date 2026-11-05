// The ultrawide monitor at the back of the desk: a 34-inch screen on a low stand, real scale (125 units
// to the metre). Seated at the desk, only its lower edge shows along the top of the view: the dock and
// the last lines of a terminal. Walking in from the door, it is seen whole.
//
// The screen is drawn in the site's own graphic style, never copied: a wallpaper in the desk's palette, a
// dark terminal window titled "ghostty" running a session that replays the build (the same events, in
// the same words, as the replay caption, from the approved timeline), and a frosted dock of plain
// palette tiles with a dot under the ones running. No logos, no real transcripts, no real output. It is
// a canvas texture redrawn only when a new event arrives, and decorative: the events are also the
// caption's text. Like everything lettered in the scene (desk/lettering.ts), the screen is depth-tested
// and stays sharp through the desk's tilt-shift, so its last lines read along the top of the seated view.

import { BoxGeometry, CanvasTexture, Group, Mesh, MeshLambertMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from 'three';
import { pieceById } from '../content/pieces';
import { describe } from '../timeline/caption';
import type { Replay } from '../timeline/replay';
import { screenMaterial } from './lettering';
import { BIRCH, BLUE, CORAL, CREAM, INK, OAK, SLATE, SUN } from './palette';

/** The screen, in desk units: about 80 × 33.5 cm, its bottom edge 5 cm above the desk. */
export const SCREEN = { width: 100, height: 42, bottom: 6.2, bezel: 1.4 } as const;
const W = 2560;
const H = Math.round((W * SCREEN.height) / SCREEN.width);
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';

const GLYPH: Record<string, string> = { briefed: '›', started: '▸', submitted: '✻', returned: '↩', accepted: '✓' };

/** The session's lines: the prompt, then each hand-off up to now, as the caption words it. */
export function sessionLines(replay: Replay, s: number, last = 9): string[] {
  const lines: string[] = [];
  for (const beat of replay.beats) {
    if (beat.scene > s) break;
    const phase = replay.phase(beat.piece, beat.scene + 0.001);
    const round = 'round' in phase ? phase.round : 0;
    lines.push(`${GLYPH[beat.kind] ?? '·'} ${pieceById(beat.piece).title} ${describe(beat.kind, round, beat.brief)}`);
  }
  return lines.slice(-last);
}

export class Monitor {
  readonly group = new Group();
  /** The panel and screen, tilted back on the neck. */
  readonly head = new Group();
  readonly #canvas = document.createElement('canvas');
  readonly #texture: CanvasTexture;
  #shown = '';
  /** How many times the screen has been drawn (for the checks: only when a new line arrives). */
  draws = 0;

  constructor() {
    this.#canvas.width = W;
    this.#canvas.height = H;
    this.#texture = new CanvasTexture(this.#canvas);
    this.#texture.colorSpace = SRGBColorSpace;
    this.#texture.anisotropy = 8;
    const ink = new MeshLambertMaterial({ color: INK });
    const stand = new MeshLambertMaterial({ color: SLATE });
    const { width: w, height: h, bottom, bezel } = SCREEN;
    // The panel and its bezel, a slim back, the stand's neck and its plate on the desk.
    // The panel and screen on a head that tilts back on the neck, as a monitor does.
    const pivot = bottom + h * 0.45;
    this.head.position.set(0, pivot, 0);
    const panel = new Mesh(new BoxGeometry(w + 2 * bezel, h + 2 * bezel, 1.6), ink);
    panel.position.set(0, bottom + h / 2 - pivot, 0);
    const screen = new Mesh(new PlaneGeometry(w, h), screenMaterial(this.#texture));
    screen.position.set(0, bottom + h / 2 - pivot, 0.82);
    screen.userData.noEdge = true;
    const neck = new Mesh(new BoxGeometry(7, bottom + h * 0.45, 2.4), stand);
    neck.position.set(0, (bottom + h * 0.45) / 2, -1.9);
    // The stand's foot, shallow, so the things at the front of the desk keep their room.
    const plate = new Mesh(new BoxGeometry(30, 0.5, 10), stand);
    plate.position.set(0, 0.25, -2.4);
    this.head.add(panel, screen);
    // Tilted back a little, as one is to be read from a chair; seated, the camera looks down on it.
    this.head.rotation.x = -0.2;
    this.group.add(this.head, neck, plate);
    this.group.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    this.#draw([]);
  }

  #count = -1;
  /** Shows the session up to replay time s; only when a new event has arrived does it redraw. */
  update(replay: Replay, s: number): boolean {
    let count = 0;
    for (const beat of replay.beats) {
      if (beat.scene > s) break;
      count++;
    }
    if (count === this.#count) return false;
    this.#count = count;
    const lines = sessionLines(replay, s);
    if (lines.join('\n') === this.#shown) return false;
    this.#draw(lines);
    return true;
  }
  /** The lines on screen now, for the checks. */
  lines(): string[] {
    return this.#shown ? this.#shown.split('\n') : [];
  }

  /** The screen's corners in the room (bottom-left, bottom-right, top-right, top-left), and one text row's height. */
  screenCorners(): { corners: Vector3[]; row: [Vector3, Vector3]; bottomCentre: Vector3 } {
    this.group.updateMatrixWorld(true);
    const { width: w, height: h, bottom } = SCREEN;
    const pivot = bottom + h * 0.45;
    const at = (x: number, y: number) => this.head.localToWorld(new Vector3(x, y - pivot, 0.82));
    // A session row is 30 of the canvas's H pixels tall; measured at the last row, just above the dock.
    const rowAt = bottom + (h * 180) / H;
    return {
      corners: [at(-w / 2, bottom), at(w / 2, bottom), at(w / 2, bottom + h), at(-w / 2, bottom + h)],
      row: [at(0, rowAt), at(0, rowAt + (h * 30) / H)],
      bottomCentre: at(0, bottom),
    };
  }

  /**
   * What of the screen the seated view takes in: the middle of its lower edge, the dock and the session's
   * last lines (only that much, so the desk keeps the frame).
   */
  lowerStrip(): Vector3[] {
    this.group.updateMatrixWorld(true);
    const { bottom, height: h } = SCREEN;
    const pivot = bottom + h * 0.45;
    return [
      [-14, bottom],
      [14, bottom],
      [-14, bottom + 6],
      [14, bottom + 6],
    ].map(([x = 0, y = 0]) => this.head.localToWorld(new Vector3(x, y - pivot, 0.82)));
  }

  #draw(lines: readonly string[]): void {
    const c = this.#canvas.getContext('2d');
    if (!c) return;
    this.#shown = lines.join('\n');
    this.draws++;
    // Sizes as a real 34-inch screen has them: a slim menu bar, terminal rows about 6 mm, a dock about 2 cm.
    const ROW = 30;
    // The wallpaper: the desk's blue, deepening, with a soft band of sun.
    const wall = c.createLinearGradient(0, 0, 0, H);
    wall.addColorStop(0, '#2c58b8');
    wall.addColorStop(1, BLUE);
    c.fillStyle = wall;
    c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(255, 201, 74, 0.12)';
    c.fillRect(0, H * 0.55, W, H * 0.12);
    // The menu bar: a plain frosted strip, nothing in it but the time's place.
    c.fillStyle = 'rgba(255, 253, 248, 0.22)';
    c.fillRect(0, 0, W, 30);

    // The dock, and the terminal window above it: most of the screen, its last lines just over the dock.
    const tiles = [INK, BLUE, CORAL, SUN, OAK, SLATE, BIRCH, '#22b45f'];
    const size = 64;
    const gap = 14;
    const dockW = tiles.length * (size + gap) + gap;
    const dock = { x: (W - dockW) / 2, y: H - 98, w: dockW, h: 88 };
    // Centred in the middle of the ultrawide, where a seated person looks (and where the seated view sees it).
    const win = { x: 700, y: 58, w: W - 1400, h: dock.y - 24 - 58 };
    c.fillStyle = 'rgba(0, 0, 0, 0.25)';
    roundRect(c, win.x + 6, win.y + 10, win.w, win.h, 18);
    c.fill();
    c.fillStyle = '#141824';
    roundRect(c, win.x, win.y, win.w, win.h, 18);
    c.fill();
    c.fillStyle = '#232a3b';
    roundRect(c, win.x, win.y, win.w, 44, { tl: 18, tr: 18, br: 0, bl: 0 });
    c.fill();
    [CORAL, SUN, SLATE].forEach((colour, i) => {
      c.fillStyle = colour;
      c.beginPath();
      c.arc(win.x + 28 + i * 28, win.y + 22, 8, 0, Math.PI * 2);
      c.fill();
    });
    c.fillStyle = '#c9ccd3';
    c.font = `500 22px ${MONO}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('ghostty', win.x + win.w / 2, win.y + 23);

    // The session: the prompt at the top, the events filling up to the status line at the foot.
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    const left = win.x + 32;
    c.font = `500 24px ${MONO}`;
    c.fillStyle = SUN;
    c.fillText('~/studio ❯', left, win.y + 44 + ROW * 1.4);
    c.fillStyle = CREAM;
    c.fillText('claude --replay the build, round by round', left + 170, win.y + 44 + ROW * 1.4);
    const statusY = win.y + win.h - 16;
    const lastY = statusY - ROW * 1.3;
    const rows = Math.floor((lastY - (win.y + 44 + ROW * 3)) / ROW);
    const shown = lines.slice(-rows);
    c.font = `500 26px ${MONO}`;
    shown.forEach((line, i) => {
      const y = lastY - (shown.length - 1 - i) * ROW;
      const mark = line.slice(0, 1);
      c.fillStyle = mark === '✓' ? '#5fd38a' : mark === '↩' ? CORAL : mark === '✻' ? SUN : '#9fb4e6';
      c.fillText(mark, left, y);
      c.fillStyle = i === shown.length - 1 ? '#ffffff' : '#c9ccd3';
      c.fillText(line.slice(2), left + 34, y);
    });
    // The status line.
    c.fillStyle = '#2c3446';
    c.fillRect(win.x, statusY - 26, win.w, 1.5);
    c.font = `500 21px ${MONO}`;
    c.fillStyle = '#8f96a8';
    c.fillText('auto mode on · 10 builders', left, statusY);

    // The dock: a frosted bar of plain tiles in the palette, a dot under the ones running.
    c.fillStyle = 'rgba(255, 253, 248, 0.32)';
    roundRect(c, dock.x, dock.y, dock.w, dock.h, 24);
    c.fill();
    c.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    c.lineWidth = 2;
    c.stroke();
    tiles.forEach((colour, i) => {
      const x = dock.x + gap + i * (size + gap);
      c.fillStyle = colour;
      roundRect(c, x, dock.y + 10, size, size, 16);
      c.fill();
      // A simple mark on each tile: a circle, a bar, a square, by turns.
      c.fillStyle = 'rgba(255, 253, 248, 0.85)';
      const mx = x + size / 2;
      const my = dock.y + 10 + size / 2;
      if (i % 3 === 0) {
        c.beginPath();
        c.arc(mx, my, 11, 0, Math.PI * 2);
        c.fill();
      } else if (i % 3 === 1) c.fillRect(mx - 15, my - 4, 30, 8);
      else c.fillRect(mx - 9, my - 9, 18, 18);
      if (i === 0 || i === 2 || i === 4) {
        c.fillStyle = 'rgba(255, 253, 248, 0.9)';
        c.beginPath();
        c.arc(mx, dock.y + dock.h - 6, 3.5, 0, Math.PI * 2);
        c.fill();
      }
    });
    this.#texture.needsUpdate = true;
  }
}

function roundRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | { tl: number; tr: number; br: number; bl: number },
): void {
  const k = typeof r === 'number' ? { tl: r, tr: r, br: r, bl: r } : r;
  c.beginPath();
  c.moveTo(x + k.tl, y);
  c.lineTo(x + w - k.tr, y);
  c.quadraticCurveTo(x + w, y, x + w, y + k.tr);
  c.lineTo(x + w, y + h - k.br);
  c.quadraticCurveTo(x + w, y + h, x + w - k.br, y + h);
  c.lineTo(x + k.bl, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - k.bl);
  c.lineTo(x, y + k.tl);
  c.quadraticCurveTo(x, y, x + k.tl, y);
  c.closePath();
}
