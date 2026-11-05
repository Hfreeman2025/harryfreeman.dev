// Lettering printed on things in the scene: Harry's nameplate, his card, the brass plate on the office door
// and the grid's credit slip under the sticky note. Each is drawn into its thing's own texture, so whatever
// stands in front of the thing hides the words as it would hide paint. The words come from the page's own
// text (the masthead, the door plate, the credit), which stays in the HTML, visually hidden, for screen
// readers, search and the keyboard: focus on one of its links rings the printed link on the card, and a
// click on the printed link is a click on the real one.

import { CanvasTexture, MeshLambertMaterial, NoBlending, SRGBColorSpace, type Texture } from 'three';
import { CREAM, INK } from './palette';

const cond = (weight: number, px: number) => `${weight} ${px}px "IBM Plex Sans Condensed", "Arial Narrow", sans-serif`;
const handwriting = (px: number) => `700 ${px}px "Caveat", "Comic Sans MS", cursive`;
const sans = (weight: number, px: number) => `${weight} ${px}px "IBM Plex Sans", "Helvetica Neue", sans-serif`;
/** The keyboard's focus ring, as the page draws it. */
const RING = '#ffc94a';
const LINK = '#3a6fd8';

/** A box on a printed face, as fractions of it from the top left. */
export interface FaceBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export const inBox = (b: FaceBox, x: number, y: number) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

/** The door plate's words, from the page's own plate (#entrance-plate). */
export function doorWords(plate: HTMLElement | null): { name: string; role: string } {
  return {
    name: plate?.querySelector('.entrance__name')?.textContent?.trim() ?? '',
    role: plate?.querySelector('.entrance__role')?.textContent?.trim() ?? '',
  };
}

/**
 * The material for a printed face. It draws like any other surface, lit and depth-tested, but writes 0
 * to the render's alpha (no blending, so its colour is unchanged): the desk's pass reads that as "printed
 * words here" and keeps them sharp through the tilt-shift (desk/pass.ts).
 */
export function printedMaterial(map: Texture, emissive?: string): MeshLambertMaterial {
  return new MeshLambertMaterial({ map, blending: NoBlending, opacity: 0, ...(emissive ? { emissive } : {}) });
}

/** A canvas texture that can be drawn again (a focus ring, a hover). */
export class Printed {
  readonly texture: CanvasTexture;
  readonly #canvas: HTMLCanvasElement;
  constructor(width: number, height: number) {
    this.#canvas = document.createElement('canvas');
    this.#canvas.width = width;
    this.#canvas.height = height;
    this.texture = new CanvasTexture(this.#canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 8;
  }
  draw(paint: (c: CanvasRenderingContext2D, w: number, h: number) => void): void {
    const c = this.#canvas.getContext('2d');
    if (!c) return;
    c.save();
    paint(c, this.#canvas.width, this.#canvas.height);
    c.restore();
    this.texture.needsUpdate = true;
  }
}

/** Words longer than the line go on to the next; returns the lines. */
function wrap(c: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && c.measureText(next).width > max) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
/** The largest size (down to `min`) at which the text fits the width. */
function fitText(c: CanvasRenderingContext2D, text: string, font: (px: number) => string, px: number, max: number, min = 8): number {
  let size = px;
  c.font = font(size);
  while (size > min && c.measureText(text).width > max) c.font = font(--size);
  return size;
}
function ring(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, width: number): void {
  c.strokeStyle = RING;
  c.lineWidth = width;
  c.beginPath();
  c.roundRect(x, y, w, h, width * 1.4);
  c.stroke();
}

/** The nameplate's face: the name over the role, centred, on cream; ringed while the name has focus. */
export function paintNameplate(name: string, role: string, focused: boolean) {
  return (c: CanvasRenderingContext2D, w: number, h: number) => {
    c.fillStyle = CREAM;
    c.fillRect(0, 0, w, h);
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillStyle = INK;
    fitText(c, name, (px) => cond(700, px), Math.round(h * 0.42), w * 0.92);
    c.fillText(name, w / 2, h * 0.56);
    c.fillStyle = '#5d6577';
    fitText(c, role, (px) => cond(600, px), Math.round(h * 0.22), w * 0.9);
    c.fillText(role, w / 2, h * 0.86);
    if (focused) ring(c, 10, 10, w - 20, h - 20, 12);
  };
}

export interface CardLink {
  readonly text: string;
  readonly href: string;
}
/**
 * Harry's card: the intro, then his links in a row, in blue and underlined. Returns where each link is
 * printed, for clicks and the focus ring; `focus` rings one, `hover` underlines one more heavily.
 */
export function paintCard(
  intro: string,
  links: readonly CardLink[],
  paper: string,
  focus: number | null,
  hover: number | null,
  out: FaceBox[],
) {
  return (c: CanvasRenderingContext2D, w: number, h: number) => {
    c.fillStyle = paper;
    c.fillRect(0, 0, w, h);
    const pad = w * 0.012;
    const max = w - 2 * pad;
    // The intro, as large as fits above the links.
    let px = Math.round(h * 0.094);
    let lines: string[] = [];
    for (; px > 12; px--) {
      c.font = sans(500, px);
      lines = wrap(c, intro, max);
      if (lines.length * px * 1.36 + px * 2.4 <= h - 2 * pad) break;
    }
    c.fillStyle = INK;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    lines.forEach((line, i) => {
      c.fillText(line, pad, pad + px * (1 + i * 1.36));
    });
    // The links, a row under the intro.
    const size = Math.round(px * 1.08);
    c.font = cond(700, size);
    const y = pad + px * (lines.length * 1.36) + size * 1.55;
    out.length = 0;
    let x = pad;
    links.forEach((link, i) => {
      const width = c.measureText(link.text).width;
      c.fillStyle = LINK;
      c.fillText(link.text, x, y);
      c.fillRect(x, y + size * 0.14, width, hover === i ? size * 0.12 : size * 0.06);
      const box = { x: x - size * 0.3, y: y - size * 1.05, w: width + size * 0.6, h: size * 1.5 };
      if (focus === i) ring(c, box.x, box.y, box.w, box.h, Math.max(8, size * 0.3));
      out.push({ x: box.x / w, y: box.y / h, w: box.w / w, h: box.h / h });
      x += width + size * 0.95;
    });
  };
}

/** The brass plate on the door: the name over the role, engraved (dark, with a light lower lip). */
export function paintDoorPlate(name: string, role: string, brass: string) {
  return (c: CanvasRenderingContext2D, w: number, h: number) => {
    c.fillStyle = brass;
    c.fillRect(0, 0, w, h);
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    const engrave = (text: string, font: (px: number) => string, px: number, y: number) => {
      fitText(c, text, font, px, w * 0.9);
      c.fillStyle = 'rgba(255, 240, 200, 0.55)';
      c.fillText(text, w / 2, y + Math.max(1, h * 0.012));
      c.fillStyle = '#3b2a08';
      c.fillText(text, w / 2, y);
    };
    engrave(name, (px) => cond(700, px), Math.round(h * 0.4), h * 0.55);
    engrave(role, (px) => cond(600, px), Math.round(h * 0.2), h * 0.84);
  };
}

/** The grid's credit, handwritten on a yellow slip. */
export function paintCredit(text: string, paper: string) {
  return (c: CanvasRenderingContext2D, w: number, h: number) => {
    c.fillStyle = paper;
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,0.05)';
    c.fillRect(0, 0, w, h * 0.08);
    c.fillStyle = INK;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    const pad = w * 0.05;
    let px = Math.round(h * 0.36);
    let lines: string[] = [];
    for (; px > 10; px--) {
      c.font = handwriting(px);
      lines = wrap(c, text, w - 2 * pad);
      if (lines.length * px * 1.05 <= h - 2 * pad) break;
    }
    lines.forEach((line, i) => {
      c.fillText(line, pad, pad + px * (0.85 + i * 1.05));
    });
  };
}
