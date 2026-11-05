// Bakes the lamp's light into the model's floor and the workbench under it.
// A disc light is sampled with shadow rays against every static box in the layout (layout.ts is
// shared with the renderer), plus short ambient-occlusion rays; the result, multiplied by each
// surface's colour, is written as a PNG and converted to WebP with cwebp. Run after any change to
// layout.ts: `npm run bake`.

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { BASE, type Box, KEY, LAMP, ROOM, staticBoxes } from '../src/scene/layout';
import { BOUNCE, GROUND, lampCone, PALETTE } from '../src/scene/light';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'public', 'bake');
const tmp = join(here, '..', '.tmp');
mkdirSync(out, { recursive: true });
mkdirSync(tmp, { recursive: true });

type V = [number, number, number];

// --- a small deterministic random stream -------------------------------------------------------
let state = 0x9e3779b9;
function random(): number {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 4294967296;
}

// --- ray against an axis-aligned box (slab method) ---------------------------------------------
function hits(box: Box, o: V, d: V, maxT: number): boolean {
  let t0 = 1e-4;
  let t1 = maxT;
  for (let a = 0; a < 3; a++) {
    const inv = 1 / d[a]!;
    let tn = (box.min[a]! - o[a]!) * inv;
    let tf = (box.max[a]! - o[a]!) * inv;
    if (tn > tf) [tn, tf] = [tf, tn];
    if (tn > t0) t0 = tn;
    if (tf < t1) t1 = tf;
    if (t0 > t1) return false;
  }
  return true;
}

// --- a coarse grid so each texel only tests nearby boxes ---------------------------------------
class Grid {
  readonly cell = 0.5;
  readonly cells = new Map<string, Box[]>();
  constructor(readonly boxes: Box[]) {
    for (const b of boxes) {
      for (let x = Math.floor(b.min[0] / this.cell); x <= Math.floor(b.max[0] / this.cell); x++)
        for (let z = Math.floor(b.min[2] / this.cell); z <= Math.floor(b.max[2] / this.cell); z++) {
          const key = `${x},${z}`;
          const list = this.cells.get(key) ?? [];
          list.push(b);
          this.cells.set(key, list);
        }
    }
  }
  near(x: number, z: number, radius: number): Box[] {
    const found = new Set<Box>();
    const r = Math.ceil(radius / this.cell);
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    for (let i = cx - r; i <= cx + r; i++)
      for (let j = cz - r; j <= cz + r; j++) for (const b of this.cells.get(`${i},${j}`) ?? []) found.add(b);
    return [...found];
  }
}

function sub(a: V, b: V): V {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function norm(a: V): V {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
}

interface Lamp {
  readonly position: V;
  readonly axis: V;
  readonly cone: number;
  readonly edge: number;
  /** Stratified samples over the lamp's disc, in the plane facing its target. */
  readonly points: V[];
  /** Irradiance at the target from the unoccluded lamp, so 1.0 means "full lamp". */
  readonly reference: number;
  readonly strength: number;
}

const LIGHT_SAMPLES = 16;
function makeLamp(
  def: { position: readonly number[]; target: readonly number[]; radius: number; cone: number; edge: number },
  strength: number,
): Lamp {
  const position: V = [def.position[0] ?? 0, def.position[1] ?? 0, def.position[2] ?? 0];
  const target: V = [def.target[0] ?? 0, def.target[1] ?? 0, def.target[2] ?? 0];
  const axis = norm(sub(target, position));
  const up: V = Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = norm([up[1] * axis[2] - up[2] * axis[1], up[2] * axis[0] - up[0] * axis[2], up[0] * axis[1] - up[1] * axis[0]]);
  const w: V = [axis[1] * u[2] - axis[2] * u[1], axis[2] * u[0] - axis[0] * u[2], axis[0] * u[1] - axis[1] * u[0]];
  const points: V[] = [];
  const n = Math.sqrt(LIGHT_SAMPLES);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const r = def.radius * Math.sqrt((i + 0.5) / n);
      const a = (2 * Math.PI * (j + 0.5 + i * 0.37)) / n;
      points.push([
        position[0] + u[0] * r * Math.cos(a) + w[0] * r * Math.sin(a),
        position[1] + u[1] * r * Math.cos(a) + w[1] * r * Math.sin(a),
        position[2] + u[2] * r * Math.cos(a) + w[2] * r * Math.sin(a),
      ]);
    }
  const d = sub(position, target);
  const reference = norm(d)[1] / (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
  return { position, axis, cone: def.cone, edge: def.edge, points, reference, strength };
}

/** The work lamp over the model, and the soft key light on the cabinet. */
const LAMPS = [makeLamp(LAMP, 1), makeLamp(KEY, KEY.strength)];

/** Direct light (0..~1.5) at a point on a horizontal surface, from every lamp. */
function direct(p: V, near: Box[]): number {
  let total = 0;
  for (const lamp of LAMPS) {
    const fromLamp = norm(sub(p, lamp.position));
    const shade = lampCone(fromLamp, lamp.axis, lamp.cone, lamp.edge);
    if (shade === 0) continue;
    let sum = 0;
    for (const l of lamp.points) {
      const d = sub(l, p);
      const dist = Math.hypot(d[0], d[1], d[2]);
      const dir: V = [d[0] / dist, d[1] / dist, d[2] / dist];
      let blocked = false;
      for (const b of near) {
        if (hits(b, p, dir, dist)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) sum += dir[1] / (dist * dist);
    }
    total += (sum / lamp.points.length / lamp.reference) * shade * lamp.strength;
  }
  return total;
}

const AO_SAMPLES = 20;
const AO_RANGE = 1.1;
/** Share of the sky above a horizontal point that nearby boxes leave open (0..1). */
function openness(p: V, near: Box[]): number {
  let open = 0;
  for (let i = 0; i < AO_SAMPLES; i++) {
    // Cosine-weighted hemisphere around +y.
    const r = Math.sqrt((i + random()) / AO_SAMPLES);
    const a = 2 * Math.PI * random();
    const dir: V = [r * Math.cos(a), Math.sqrt(Math.max(0, 1 - r * r)), r * Math.sin(a)];
    let blocked = false;
    for (const b of near) {
      if (hits(b, p, dir, AO_RANGE)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) open += 1;
  }
  return open / AO_SAMPLES;
}

// --- PNG ---------------------------------------------------------------------------------------
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(width: number, height: number, rgb: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array()),
  ]);
}

const toSrgb = (c: number): number => {
  const v = Math.max(0, Math.min(1, c));
  return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
};
const fromHex = (hex: string): V => {
  const n = Number.parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
};

const lampColour = fromHex(PALETTE.lamp);
const ambientColour = fromHex(PALETTE.ambient);

/** Blur the light term a little to hide the sampling. Albedo stays sharp. */
function blur(field: Float32Array, w: number, h: number, passes: number): Float32Array {
  let src = field;
  for (let p = 0; p < passes; p++) {
    const dst = new Float32Array(src.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            s += src[yy * w + xx]!;
            n += 1;
          }
        dst[y * w + x] = s / n;
      }
    src = dst;
  }
  return src;
}

function write(name: string, w: number, h: number, rgb: Uint8Array, quality: number): void {
  const pngPath = join(tmp, `${name}.png`);
  writeFileSync(pngPath, png(w, h, rgb));
  execFileSync('/opt/homebrew/bin/cwebp', ['-quiet', '-q', String(quality), pngPath, '-o', join(out, `${name}.webp`)]);
  rmSync(pngPath);
}

// --- the model's floor and baseboard top --------------------------------------------------------
function bakeFloor(): void {
  const boxes = staticBoxes();
  const grid = new Grid(boxes);
  const w = 1024;
  const h = Math.round((w * (BASE.z1 - BASE.z0)) / (BASE.x1 - BASE.x0));
  const light = new Float32Array(w * h);
  const ao = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = BASE.x0 + ((i + 0.5) / w) * (BASE.x1 - BASE.x0);
      const z = BASE.z0 + ((j + 0.5) / h) * (BASE.z1 - BASE.z0);
      const p: V = [x, 0.001, z];
      light[j * w + i] = direct(p, grid.near(x, z, 2.6));
      ao[j * w + i] = openness(p, grid.near(x, z, AO_RANGE + 0.3));
    }
  }
  const lightB = blur(light, w, h, 2);
  const aoB = blur(ao, w, h, 2);
  const rgb = new Uint8Array(w * h * 3);
  const wood = fromHex(PALETTE.basswood);
  const card = fromHex(PALETTE.card);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = BASE.x0 + ((i + 0.5) / w) * (BASE.x1 - BASE.x0);
      const z = BASE.z0 + ((j + 0.5) / h) * (BASE.z1 - BASE.z0);
      const inside = x > ROOM.x0 && x < ROOM.x1 && z > ROOM.z0 && z < ROOM.z1;
      let albedo: V = card;
      if (inside) {
        // Basswood strips 0.2 m wide, each a slightly different tone, with a fine seam.
        const strip = Math.floor((z - ROOM.z0) / 0.2);
        const tone = 0.93 + ((0.1 * (((Math.sin(strip * 12.9898) * 43758.5453) % 1) + 1)) % 1);
        const seam = (z - ROOM.z0) / 0.2 - strip < 0.06 ? 0.8 : 1;
        albedo = [wood[0] * tone * seam, wood[1] * tone * seam, wood[2] * tone * seam];
      }
      const k = j * w + i;
      const occ = 0.3 + 0.7 * aoB[k]!;
      const e = lightB[k]! * (0.55 + 0.45 * occ);
      for (let c = 0; c < 3; c++)
        rgb[k * 3 + c] = toSrgb(albedo[c]! * (lampColour[c]! * (e + BOUNCE * occ) + ambientColour[c]! * occ * 0.5));
    }
  }
  write('floor', w, h, rgb, 82);
  console.log(`floor ${w}×${h}`);
}

// --- the paper the model sits on ----------------------------------------------------------------
function bakeGround(): void {
  const base: Box = { min: [BASE.x0, -BASE.thickness, BASE.z0], max: [BASE.x1, 0, BASE.z1], material: 'card' };
  const walls = staticBoxes().slice(0, 5);
  const occluders = [base, ...walls];
  const w = 768;
  const h = Math.round((w * (GROUND.z1 - GROUND.z0)) / (GROUND.x1 - GROUND.x0));
  const light = new Float32Array(w * h);
  const ao = new Float32Array(w * h);
  const y = GROUND.y;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = GROUND.x0 + ((i + 0.5) / w) * (GROUND.x1 - GROUND.x0);
      const z = GROUND.z0 + ((j + 0.5) / h) * (GROUND.z1 - GROUND.z0);
      const p: V = [x, y + 0.001, z];
      light[j * w + i] = direct(p, occluders);
      ao[j * w + i] = openness(p, [base]);
    }
  }
  const lightB = blur(light, w, h, 2);
  const aoB = blur(ao, w, h, 1);
  const paper = fromHex(PALETTE.paper);
  const surround = fromHex(PALETTE.surround);
  const rgb = new Uint8Array(w * h * 3);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = GROUND.x0 + ((i + 0.5) / w) * (GROUND.x1 - GROUND.x0);
      const z = GROUND.z0 + ((j + 0.5) / h) * (GROUND.z1 - GROUND.z0);
      // A sheet of drawing paper: a faint, even tooth, nothing printed on it.
      const tooth = 0.985 + 0.015 * Math.sin(x * 37.1 + Math.sin(z * 23.7) * 3) * Math.sin(z * 41.3);
      const k = j * w + i;
      const occ = 0.35 + 0.65 * aoB[k]!;
      const e = lightB[k]! * (0.6 + 0.4 * occ);
      // Under the lamp the paper is warm and bright; away from it, the soft daylight of the page.
      const edge = Math.min(x - GROUND.x0, GROUND.x1 - x, z - GROUND.z0, GROUND.z1 - z);
      const fade = Math.min(1, Math.max(0, edge / 7));
      for (let c = 0; c < 3; c++) {
        const lit = paper[c]! * tooth * (0.55 * lampColour[c]! * e + 1.05 * occ);
        rgb[k * 3 + c] = toSrgb(surround[c]! + (lit - surround[c]!) * fade);
      }
    }
  }
  write('ground', w, h, rgb, 78);
  console.log(`ground ${w}×${h}`);
}

const started = performance.now();
bakeFloor();
bakeGround();
console.log(`baked in ${((performance.now() - started) / 1000).toFixed(1)} s`);
