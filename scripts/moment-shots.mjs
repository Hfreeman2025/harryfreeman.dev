// The replay moment Harry screenshotted (desks and the review table mid-replay), before and after,
// in each browser: the office-3 room (built from the commit "One building: the lit 3D studio is the way in,
// the office its flat rendering", 4 November, served on BEFORE_URL) and this one.
//   node scripts/moment-shots.mjs [chromium|webkit|firefox ...]
// Writes shots/office-4/<browser>-moment-before.png and -after.png. The grid API is mocked.
import { join } from 'node:path';
import { gridMock, launch } from './e2e.mjs';
import { silenceLiveAudio } from './silent.mjs';

const site = new URL('..', import.meta.url).pathname;
const AFTER = process.env.STUDIO_URL ?? 'http://127.0.0.1:4400';
const BEFORE = process.env.BEFORE_URL ?? 'http://127.0.0.1:4401';
// From scripts/busiest-moment.ts: all ten tools' work at, to or from the review table.
const MOMENT = Number(process.env.MOMENT ?? 16.2);
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'webkit', 'firefox'];

for (const name of names) {
  const browser = await launch(name);
  for (const [label, base] of [
    ['before', BEFORE],
    ['after', AFTER],
  ]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await context.addInitScript(silenceLiveAudio);
    await context.route(/^https:\/\/api\.carbonintensity\.org\.uk\//, gridMock('ok'));
    const page = await context.newPage();
    await page.goto(`${base}/?room&hold&t=${MOMENT}`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset.stage === 'live', null, { timeout: 20000 });
    await page.waitForFunction(() => document.documentElement.dataset.screens === 'video', null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(site, 'shots', 'office-4', `${name}-moment-${label}.png`) });
    await context.close();
  }
  await browser.close();
  console.log(`${name}: before and after at ${MOMENT} s`);
}
