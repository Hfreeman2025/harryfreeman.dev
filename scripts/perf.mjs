// Measures the production build in each browser: first paint, the scene ready, bytes until then, layout
// shift, and frame times at the door, while the camera walks to the cabinet and while it turns to a
// desk. The phone (the flat office) gets paint, bytes and layout shift. The grid API is mocked.
//   npm run build && npm run preview, then: node scripts/perf.mjs [runs] [chromium|webkit|firefox ...]
// Writes shots/office-4/performance.json.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gridMock, launch } from './e2e.mjs';
import { silenceLiveAudio } from './silent.mjs';

const site = new URL('..', import.meta.url).pathname;
const BASE = process.env.STUDIO_URL ?? 'http://127.0.0.1:4400';
const [runsArg, ...names] = process.argv.slice(2);
const RUNS = Number(runsArg ?? 3);
const BROWSERS = names.length ? names : ['chromium', 'webkit', 'firefox'];
const out = join(site, 'shots', 'office-4');
mkdirSync(out, { recursive: true });

function stats(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    frames: sorted.length,
    median: +at(0.5).toFixed(2),
    p95: +at(0.95).toFixed(2),
    max: +sorted.at(-1).toFixed(2),
    over20ms: sorted.filter((v) => v > 20).length,
  };
}
const median = (xs) => {
  const v = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  return v.length ? Math.round(v[Math.floor(v.length / 2)]) : null;
};

function observe() {
  window.__perf = { lcp: null, shift: null };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__perf.lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}
  if (PerformanceObserver.supportedEntryTypes?.includes('layout-shift')) {
    window.__perf.shift = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.shift += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  }
}
const frames = (ms) =>
  new Promise((resolve) => {
    const deltas = [];
    let last = performance.now();
    const end = last + ms;
    const tick = (now) => {
      deltas.push(now - last);
      last = now;
      if (now < end) requestAnimationFrame(tick);
      else resolve(deltas.slice(1));
    };
    requestAnimationFrame(tick);
  });
const paint = () => {
  const nav = performance.getEntriesByType('navigation')[0];
  const resources = performance.getEntriesByType('resource');
  const ready = performance.getEntriesByName('scene-ready')[0]?.startTime ?? null;
  const bytes = (until) =>
    nav.transferSize +
    resources.filter((r) => until === null || r.responseEnd <= until).reduce((s, r) => s + (r.transferSize || r.encodedBodySize || 0), 0);
  return {
    fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
    sceneReady: ready,
    bytesAtReady: ready === null ? null : bytes(ready),
    lcp: window.__perf.lcp,
    shift: window.__perf.shift,
  };
};

const report = { base: BASE, at: new Date().toISOString(), runs: RUNS, browsers: {} };
for (const name of BROWSERS) {
  const browser = await launch(name);
  const room = [];
  const phone = [];
  for (let i = 0; i < RUNS; i++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await context.addInitScript(silenceLiveAudio);
    await context.addInitScript(observe);
    await context.route(/^https:\/\/api\.carbonintensity\.org\.uk\//, gridMock('ok'));
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset.stage === 'live', null, { timeout: 20000 });
    await page.waitForTimeout(3000);
    const door = await page.evaluate(frames, 5000);
    const walkPromise = page.evaluate(frames, 1400);
    await page.click('[data-target="cabinet"]');
    const walk = await walkPromise;
    await page.waitForFunction(() => document.documentElement.dataset.station === 'cabinet');
    await page.waitForTimeout(300);
    const drawerPromise = page.evaluate(frames, 900);
    await page.click('[data-target="drawer:grid"]');
    const drawer = await drawerPromise;
    await page.waitForTimeout(300);
    const turnPromise = page.evaluate(frames, 1900);
    await page.click('[data-target="folder:grid-weather"]');
    const turn = await turnPromise;
    room.push({ ...(await page.evaluate(paint)), door: stats(door), walk: stats(walk), drawer: stats(drawer), turn: stats(turn) });
    await context.close();

    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      ...(name === 'firefox' ? {} : { isMobile: true, hasTouch: true }),
    });
    await mobile.addInitScript(silenceLiveAudio);
    await mobile.addInitScript(observe);
    await mobile.route(/^https:\/\/api\.carbonintensity\.org\.uk\//, gridMock('ok'));
    const p = await mobile.newPage();
    await p.goto(BASE, { waitUntil: 'load' });
    await p.waitForTimeout(2500);
    const flat = await p.evaluate(paint);
    phone.push({
      fcp: flat.fcp,
      lcp: flat.lcp,
      shift: flat.shift,
      bytes: await p.evaluate(
        () =>
          performance.getEntriesByType('navigation')[0].transferSize +
          performance.getEntriesByType('resource').reduce((s, r) => s + (r.transferSize || r.encodedBodySize || 0), 0),
      ),
    });
    await mobile.close();
  }
  await browser.close();
  const pick = (runs, key) => runs.map((r) => r[key]);
  report.browsers[name] = {
    desktop: {
      firstContentfulPaintMs: median(pick(room, 'fcp')),
      sceneReadyMs: median(pick(room, 'sceneReady')),
      kbAtSceneReady: median(pick(room, 'bytesAtReady').map((b) => (b === null ? null : b / 1024))),
      largestContentfulPaintMs: median(pick(room, 'lcp')),
      layoutShift: room.map((r) => r.shift),
      framesAtTheDoor: room.map((r) => r.door),
      framesWalkingToTheCabinet: room.map((r) => r.walk),
      framesOpeningADrawer: room.map((r) => r.drawer),
      framesTurningToADesk: room.map((r) => r.turn),
    },
    phone: {
      firstContentfulPaintMs: median(pick(phone, 'fcp')),
      largestContentfulPaintMs: median(pick(phone, 'lcp')),
      kbTransferred: median(pick(phone, 'bytes').map((b) => b / 1024)),
      layoutShift: phone.map((r) => r.shift),
    },
  };
  console.log(name, JSON.stringify(report.browsers[name].desktop.sceneReadyMs), 'ms to scene ready');
}
writeFileSync(join(out, 'performance.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
