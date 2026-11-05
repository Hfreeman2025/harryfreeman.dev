// Photographs the room with the page's own renderer, for the poster shown before the scene is ready,
// the social image and the PNG favicon. The grid API is mocked never to answer, so the stills show the
// sign reading the grid and the neutral light, never a reading that would go stale. Needs the dev or preview server on 4400.
//   node scripts/stills.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gridMock, launch } from './e2e.mjs';
import { silenceLiveAudio } from './silent.mjs';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.STUDIO_URL ?? 'http://127.0.0.1:4400';
const still = join(site, 'public', 'still');
const tmp = join(site, '.tmp');
mkdirSync(still, { recursive: true });
mkdirSync(tmp, { recursive: true });
// A moment in the replay when every screen is on and work is moving to and from the reviewer.
const MOMENT = 15;

const browser = await launch('chromium');
async function open(url, width, height, scale) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  await context.addInitScript(silenceLiveAudio);
  await context.route(/^https:\/\/api\.carbonintensity\.org\.uk\//, gridMock('hang'));
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.stage === 'live', null, { timeout: 20000 });
  await page.waitForFunction(() => document.documentElement.dataset.screens === 'video', null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  return { page, done: () => context.close() };
}

// The poster: the room from the door, at the hall's shape on a laptop (the board takes the left).
{
  const { page, done } = await open(`${base}/?room&photo&t=${MOMENT}`, 1200, 1000, 2);
  const big = join(tmp, 'door-2400.png');
  await page.screenshot({ path: big });
  await done();
  for (const w of [2400, 1600, 1200]) {
    execFileSync('/opt/homebrew/bin/cwebp', ['-quiet', '-q', '78', '-resize', String(w), '0', big, '-o', join(still, `door-${w}.webp`)]);
  }
}

// The social image: the way in, the directory board and the room behind it.
{
  const { page, done } = await open(`${base}/?room&hold&t=${MOMENT}`, 1200, 630, 1);
  await page.screenshot({ path: join(site, 'public', 'og.png') });
  await done();
}
rmSync(join(site, 'public', 'og-studio.png'), { force: true });
for (const old of ['studio-1600.jpg', 'studio-1600.webp', 'studio-2400.webp', 'studio-960.webp']) rmSync(join(still, old), { force: true });

const context = await browser.newContext({ viewport: { width: 64, height: 64 } });
const page = await context.newPage();
await page.goto(`${base}/favicon.svg`);
await page.screenshot({ path: join(site, 'public', 'favicon.png'), omitBackground: false });
await context.close();
await browser.close();
console.log('poster, og.png and favicon.png written');
