// Measures the production build: paint timings, bytes transferred until the studio is interactive,
// JavaScript shipped, and frame times while the replay runs and while the camera glides.
//   npm run build && npm run preview, then: node scripts/perf.mjs [runs]
// Writes shots/performance.json.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import { silenceLiveAudio } from './silent.mjs';

const site = new URL('..', import.meta.url).pathname;
const BASE = process.env.STUDIO_URL ?? 'http://127.0.0.1:4400';
const RUNS = Number(process.argv[2] ?? 3);

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    frames: sorted.length,
    median: +at(0.5).toFixed(2),
    p95: +at(0.95).toFixed(2),
    p99: +at(0.99).toFixed(2),
    max: +sorted.at(-1).toFixed(2),
    over20ms: sorted.filter((v) => v > 20).length,
  };
}

const browser = await chromium.launch({
  channel: 'chromium',
  args: ['--mute-audio', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const runs = [];
for (let i = 0; i < RUNS; i++) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await context.addInitScript(silenceLiveAudio);
  await context.addInitScript(() => {
    window.__perf = { lcp: 0 };
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__perf.lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    // The init script runs before the document exists; watch the root once it does.
    const watch = () => {
      new MutationObserver(() => {
        const d = document.documentElement.dataset;
        if (d.stage === 'live' && !window.__perf.live) window.__perf.live = performance.now();
        if (d.screens === 'video' && !window.__perf.video) window.__perf.video = performance.now();
      }).observe(document.documentElement, { attributes: true });
    };
    if (document.documentElement) watch();
    else document.addEventListener('readystatechange', watch, { once: true });
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__perf.live, null, { timeout: 15000 });
  const atLive = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    const bytes = (until) =>
      nav.transferSize +
      resources.filter((r) => r.responseEnd <= until).reduce((sum, r) => sum + (r.transferSize || r.encodedBodySize || 0), 0);
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
    return { fcp, live: window.__perf.live, bytesAtLive: bytes(window.__perf.live) };
  });
  await page.waitForTimeout(4000);
  const after = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    return {
      lcp: window.__perf.lcp,
      video: window.__perf.video ?? null,
      bytesAt5s: nav.transferSize + resources.reduce((s, r) => s + (r.transferSize || r.encodedBodySize || 0), 0),
      requests: resources.length + 1,
    };
  });
  // Frame times while the replay runs (5 s).
  const replay = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const deltas = [];
        let last = performance.now();
        const end = last + 5000;
        const tick = (now) => {
          deltas.push(now - last);
          last = now;
          if (now < end) requestAnimationFrame(tick);
          else resolve(deltas.slice(1));
        };
        requestAnimationFrame(tick);
      }),
  );
  // Frame times while the camera glides down to a desk.
  await page.locator('.desk-label[data-piece="grid-weather"]').focus();
  const glidePromise = page.evaluate(
    () =>
      new Promise((resolve) => {
        const deltas = [];
        let last = performance.now();
        const end = last + 1300;
        const tick = (now) => {
          deltas.push(now - last);
          last = now;
          if (now < end) requestAnimationFrame(tick);
          else resolve(deltas.slice(1));
        };
        requestAnimationFrame(tick);
      }),
  );
  await page.keyboard.press('Enter');
  const glide = await glidePromise;
  runs.push({ ...atLive, ...after, replay: stats(replay), glide: stats(glide) });
  await context.close();
}
// The office, the way in: paint, bytes, layout shift, and frames while a drawer slides out.
const officeRuns = [];
for (let i = 0; i < RUNS; i++) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await context.addInitScript(silenceLiveAudio);
  await context.addInitScript(() => {
    window.__o = { lcp: 0, shift: 0 };
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__o.lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__o.shift += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  const loaded = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const res = performance.getEntriesByType('resource');
    return {
      fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
      lcp: window.__o.lcp,
      layoutShift: window.__o.shift,
      bytes: nav.transferSize + res.reduce((sum, r) => sum + (r.transferSize || r.encodedBodySize || 0), 0),
      requests: res.length + 1,
    };
  });
  const frames = page.evaluate(
    () =>
      new Promise((resolve) => {
        const deltas = [];
        let last = performance.now();
        const end = last + 1000;
        const tick = (now) => {
          deltas.push(now - last);
          last = now;
          if (now < end) requestAnimationFrame(tick);
          else resolve(deltas.slice(1));
        };
        requestAnimationFrame(tick);
      }),
  );
  await page.click('.drawer[data-drawer="agents"] .drawer__front');
  officeRuns.push({ ...loaded, drawer: stats(await frames) });
  await context.close();
}
await browser.close();

// JavaScript and CSS shipped, gzipped, from the build.
const assets = join(site, 'dist', 'assets');
const shipped = Object.fromEntries(
  readdirSync(assets)
    .filter((f) => /\.(js|css)$/.test(f))
    .map((f) => [
      f.replace(/-[\w-]{8}\./, '.'),
      { raw: statSync(join(assets, f)).size, gzip: gzipSync(readFileSync(join(assets, f))).length },
    ]),
);
const html = gzipSync(readFileSync(join(site, 'dist', 'index.html'))).length;

const medianOf = (list, key) => {
  const v = list
    .map((r) => r[key])
    .filter((x) => typeof x === 'number')
    .sort((a, b) => a - b);
  return v.length ? +v[Math.floor(v.length / 2)].toFixed(0) : null;
};
const median = (key) => {
  const v = runs
    .map((r) => r[key])
    .filter((x) => typeof x === 'number')
    .sort((a, b) => a - b);
  return v.length ? +v[Math.floor(v.length / 2)].toFixed(0) : null;
};
const report = {
  measuredAt: new Date().toISOString(),
  base: BASE,
  browser: 'Chromium (Playwright 1.63, full build, GPU compositing via Metal), 1440×900 at 2× pixel ratio',
  note: 'A shared, busy machine: other builds ran throughout. Treat as a loaded laptop, not a benchmark.',
  studio: 'the median below is the studio floor, /studio.html',
  median: {
    firstContentfulPaintMs: median('fcp'),
    largestContentfulPaintMs: median('lcp'),
    studioInteractiveMs: median('live'),
    screensPlayingMs: median('video'),
    bytesAtInteractive: median('bytesAtLive'),
    bytesAfter5s: median('bytesAt5s'),
  },
  runs,
  office: {
    median: {
      firstContentfulPaintMs: medianOf(officeRuns, 'fcp'),
      largestContentfulPaintMs: medianOf(officeRuns, 'lcp'),
      bytesAfter2s: medianOf(officeRuns, 'bytes'),
    },
    layoutShift: officeRuns.map((r) => Number(r.layoutShift.toFixed(4))),
    runs: officeRuns,
  },
  shipped: { indexHtmlGzip: html, ...shipped },
};
writeFileSync(join(site, 'shots', 'performance.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log('studio', JSON.stringify(report.median, null, 2));
console.log(
  'office',
  JSON.stringify(report.office.median),
  'shift',
  report.office.layoutShift.join(' '),
  'drawer frames',
  JSON.stringify(officeRuns.map((r) => r.drawer.max)),
);
console.log(runs.map((r) => `replay ${JSON.stringify(r.replay)}\nglide  ${JSON.stringify(r.glide)}`).join('\n'));
