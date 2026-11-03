// Records each piece's monitor loop from the real piece, running on its own local port, in a
// silent headless Chromium (see silent.mjs), one piece at a time. Then ffmpeg makes:
//   public/loops/<id>.webm|.mp4   960×600, 8 s, for the desk card
//   public/loops/<id>.webp        640×400 still, for the list
//   public/loops/atlas.webm|.mp4  all ten at 384×240 in a 5 × 2 grid, for the monitors
//   public/loops/atlas.webp       the atlas as a still, shown until the video plays
// Usage: node scripts/record-loops.mjs [piece ...]   (no arguments: all ten, then the atlas)

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { silenceLiveAudio } from './silent.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..');
const out = join(site, 'public', 'loops');
const work = join(site, '.tmp', 'loops');
mkdirSync(out, { recursive: true });
mkdirSync(work, { recursive: true });
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const SECONDS = 8;
const SITE = process.env.STUDIO_URL ?? 'http://127.0.0.1:4400';
const config = JSON.parse(readFileSync(join(site, 'site.config.json'), 'utf8'));
const urlOf = (id) => (config.pieces[id].startsWith('/') ? SITE + config.pieces[id] : config.pieces[id]);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function clickText(page, text, exact = false) {
  const target = page.getByRole('button', { name: text, exact }).first();
  if (await target.count()) await target.click({ timeout: 3000 }).catch(() => {});
}

/** How to show each piece working: what to do before the recording window, and during it. */
const PIECES = [
  { id: 'gpt-in-a-tab', warm: 3000, during: async () => {} },
  {
    id: 'real-or-hallucinated',
    warm: 2500,
    during: async (page) => {
      await clickText(page, 'Replay clustering');
      await wait(4200);
      await clickText(page, 'Replay clustering');
    },
  },
  { id: 'agent-race', url: 'http://127.0.0.1:4317/?view=replay', warm: 1200, during: async () => {} },
  { id: 'grid-weather', warm: 4000, during: async () => {} },
  { id: 'gridtop', url: `${SITE}/terminal.html?piece=gridtop&loop&bare`, warm: 600, during: async () => {} },
  {
    id: 'listen-to-the-grid',
    warm: 1500,
    before: async (page) => {
      await clickText(page, 'Listen', true);
      await page.evaluate(() => window.scrollTo(0, 0));
    },
    during: async () => {},
  },
  {
    id: 'sourced',
    warm: 2000,
    during: async (page) => {
      // Drag the underlined 314 (the example's usage) slowly right, then back.
      const number = page
        .locator('.cm-content')
        .getByText(/^3\d\d$/)
        .first();
      const box = (await number.count()) ? await number.boundingBox() : null;
      if (!box) return;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (let i = 0; i <= 40; i++) {
        await page.mouse.move(x + i * 4, y);
        await wait(45);
      }
      for (let i = 40; i >= -20; i--) {
        await page.mouse.move(x + i * 4, y);
        await wait(45);
      }
      await page.mouse.up();
    },
  },
  {
    id: 'ask-the-record',
    warm: 2500,
    during: async (page) => {
      await wait(800);
      await clickText(page, 'Does my question leave the browser?');
      await wait(3600);
      await clickText(page, 'Can it write me a poem?');
    },
  },
  { id: 'dreaming', url: `${SITE}/terminal.html?piece=dreaming&loop&bare`, warm: 9000, during: async () => {} },
  {
    id: 'receipts',
    url: 'http://127.0.0.1:4318/attestation.html',
    warm: 1500,
    during: async (page) => {
      await wait(1500);
      await clickText(page, 'Change recorded exit from 0 to 1');
      await wait(3500);
      await clickText(page, 'Restore original bytes');
    },
  },
];

function ffmpeg(args) {
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
}

async function record(piece) {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chromium',
    args: ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'],
  });
  const dir = join(work, piece.id);
  rmSync(dir, { recursive: true, force: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
    recordVideo: { dir, size: { width: 1280, height: 800 } },
  });
  await context.addInitScript(silenceLiveAudio);
  const page = await context.newPage();
  const born = Date.now();
  const url = piece.url ?? urlOf(piece.id);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  if (piece.before) await piece.before(page);
  await wait(piece.warm);
  const start = (Date.now() - born) / 1000;
  const during = piece.during(page);
  await wait(SECONDS * 1000 + 400);
  await during;
  const video = page.video();
  await context.close();
  await browser.close();
  const raw = await video.path();
  console.log(`${piece.id}: recorded ${url} from ${start.toFixed(2)} s`);
  return { raw, start };
}

function encode(id, raw, start) {
  const ss = String(start);
  const t = String(SECONDS);
  ffmpeg([
    '-ss',
    ss,
    '-i',
    raw,
    '-t',
    t,
    '-vf',
    'scale=960:600:flags=lanczos,fps=24',
    '-c:v',
    'libvpx-vp9',
    '-crf',
    '38',
    '-b:v',
    '0',
    '-row-mt',
    '1',
    '-deadline',
    'good',
    '-an',
    join(out, `${id}.webm`),
  ]);
  ffmpeg([
    '-ss',
    ss,
    '-i',
    raw,
    '-t',
    t,
    '-vf',
    'scale=960:600:flags=lanczos,fps=24',
    '-c:v',
    'libx264',
    '-crf',
    '27',
    '-preset',
    'slow',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an',
    join(out, `${id}.mp4`),
  ]);
  const still = join(work, `${id}.png`);
  ffmpeg(['-ss', String(start + SECONDS * 0.55), '-i', raw, '-frames:v', '1', '-vf', 'scale=640:400:flags=lanczos', still]);
  execFileSync('/opt/homebrew/bin/cwebp', ['-quiet', '-q', '80', still, '-o', join(out, `${id}.webp`)]);
  // The atlas tile, kept lossless-ish until the atlas is assembled.
  ffmpeg([
    '-ss',
    ss,
    '-i',
    raw,
    '-t',
    t,
    '-vf',
    'scale=384:240:flags=lanczos,fps=20',
    '-c:v',
    'libx264',
    '-crf',
    '12',
    '-pix_fmt',
    'yuv420p',
    '-an',
    join(work, `${id}.tile.mp4`),
  ]);
}

function atlas() {
  const ids = PIECES.map((p) => p.id);
  const inputs = ids.flatMap((id) => ['-i', join(work, `${id}.tile.mp4`)]);
  const layout = ids.map((_, i) => `${(i % 5) * 384}_${Math.floor(i / 5) * 240}`).join('|');
  const filter = `${ids.map((_, i) => `[${i}:v]`).join('')}xstack=inputs=${ids.length}:layout=${layout}[v]`;
  ffmpeg([
    ...inputs,
    '-filter_complex',
    filter,
    '-map',
    '[v]',
    '-t',
    String(SECONDS),
    '-c:v',
    'libvpx-vp9',
    '-crf',
    '36',
    '-b:v',
    '0',
    '-row-mt',
    '1',
    '-an',
    join(out, 'atlas.webm'),
  ]);
  ffmpeg([
    ...inputs,
    '-filter_complex',
    filter,
    '-map',
    '[v]',
    '-t',
    String(SECONDS),
    '-c:v',
    'libx264',
    '-crf',
    '26',
    '-preset',
    'slow',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an',
    join(out, 'atlas.mp4'),
  ]);
  const still = join(work, 'atlas.png');
  ffmpeg(['-ss', String(SECONDS * 0.55), '-i', join(out, 'atlas.webm'), '-frames:v', '1', still]);
  execFileSync('/opt/homebrew/bin/cwebp', ['-quiet', '-q', '78', still, '-o', join(out, 'atlas.webp')]);
}

const wanted = process.argv.slice(2);
const report = existsSync(join(out, 'report.json')) ? JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')) : {};
for (const piece of PIECES) {
  if (wanted.length && !wanted.includes(piece.id)) continue;
  try {
    const { raw, start } = await record(piece);
    encode(piece.id, raw, start);
    report[piece.id] = { url: piece.url ?? urlOf(piece.id), recordedAt: new Date().toISOString(), seconds: SECONDS };
  } catch (error) {
    console.error(`${piece.id}: FAILED ${error instanceof Error ? error.message : String(error)}`);
    report[piece.id] = { error: String(error), recordedAt: new Date().toISOString() };
  }
}
if (PIECES.every((p) => existsSync(join(work, `${p.id}.tile.mp4`)))) atlas();
else console.log('atlas not assembled: some tiles are missing');
writeFileSync(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
