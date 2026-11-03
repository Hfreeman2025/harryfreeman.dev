// Photographs the model (the page's own renderer in photo mode) for the list version's still, the
// social image and the PNG favicon. Needs the dev or preview server on 4400.
//   node scripts/stills.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { silenceLiveAudio } from './silent.mjs';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.STUDIO_URL ?? 'http://127.0.0.1:4400';
const still = join(site, 'public', 'still');
const tmp = join(site, '.tmp');
mkdirSync(still, { recursive: true });
// A moment in the replay when every screen is on and work is moving to and from the reviewer.
const MOMENT = 32.5;

const browser = await chromium.launch({
  headless: true,
  channel: 'chromium',
  args: ['--mute-audio', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
async function shoot(url, width, height, path, scale = 1) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  await context.addInitScript(silenceLiveAudio);
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.stage === 'live', null, { timeout: 20000 });
  await page.waitForFunction(() => document.documentElement.dataset.screens === 'video', null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path });
  await context.close();
}

const big = join(tmp, 'still-2400.png');
await shoot(`${base}/?photo&t=${MOMENT}`, 1600, 1000, big, 1.5);
for (const w of [2400, 1600, 960]) {
  execFileSync('/opt/homebrew/bin/cwebp', ['-quiet', '-q', '80', '-resize', String(w), '0', big, '-o', join(still, `studio-${w}.webp`)]);
}
execFileSync('/opt/homebrew/bin/ffmpeg', [
  '-y',
  '-loglevel',
  'error',
  '-i',
  big,
  '-vf',
  'scale=1600:-1:flags=lanczos',
  '-q:v',
  '4',
  join(still, 'studio-1600.jpg'),
]);

await shoot(`${base}/?photo=og&t=${MOMENT}`, 1200, 630, join(site, 'public', 'og.png'));

const context = await browser.newContext({ viewport: { width: 64, height: 64 } });
const page = await context.newPage();
await page.goto(`${base}/favicon.svg`);
await page.screenshot({ path: join(site, 'public', 'favicon.png'), omitBackground: false });
await context.close();
await browser.close();
console.log('stills, og.png and favicon.png written');
