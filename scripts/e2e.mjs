// Browser checks for the one building: the 3D room (desktop) and the flat office (phone, reduced
// motion, no WebGL, ?flat), in Chromium, WebKit and Firefox, one browser at a time, one page at a time.
// Every browser is silent (silent.mjs) and offline from the world: the Carbon Intensity API is always
// mocked, and any other request off this machine fails the check. Needs the site on STUDIO_URL.
//   node scripts/e2e.mjs [chromium|webkit|firefox ...]
// Writes shots/e2e-<browser>.json and prints a summary. Exit code 1 if any check fails.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { officeChecks } from './office-checks.mjs';
import { roomChecks } from './room-checks.mjs';
import { silenceLiveAudio } from './silent.mjs';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.STUDIO_URL ?? 'http://127.0.0.1:4400';
const config = JSON.parse(readFileSync(join(site, 'site.config.json'), 'utf8'));
const shots = join(site, 'shots', process.env.SHOTS_DIR ?? 'office-3');
mkdirSync(shots, { recursive: true });

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'webkit', 'firefox'];

export function launch(name) {
  // Chromium runs as the full browser with GPU compositing, as a visitor's would.
  if (name === 'chromium')
    return chromium.launch({ channel: 'chromium', args: ['--mute-audio', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  if (name === 'firefox') return firefox.launch({ firefoxUserPrefs: { 'media.volume_scale': '0.0' } });
  return webkit.launch();
}

// ---------- The grid, mocked ----------
const HALF_HOUR = 30 * 60_000;
const iso = (t) => `${new Date(t).toISOString().slice(0, 16)}Z`;
export const MOCK_VALUE = 175;
const MIX = [
  ['gas', 31],
  ['wind', 38],
  ['nuclear', 14],
  ['solar', 4],
  ['imports', 7],
  ['biomass', 5],
  ['hydro', 1],
  ['coal', 0],
  ['other', 0],
];

/** The Carbon Intensity API as these checks see it: a current half-hour, or a failure. */
export function gridMock(mode = 'ok') {
  return async (route) => {
    if (mode === 'fail') return route.fulfill({ status: 503, contentType: 'text/plain', body: 'service unavailable' });
    const from = Math.floor(Date.now() / HALF_HOUR) * HALF_HOUR;
    const half = { from: iso(from), to: iso(from + HALF_HOUR) };
    const path = new URL(route.request().url()).pathname;
    const json = (body) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(body),
      });
    if (path === '/intensity') return json({ data: [{ ...half, intensity: { forecast: 182, actual: MOCK_VALUE, index: 'moderate' } }] });
    if (path === '/generation') return json({ data: { ...half, generationmix: MIX.map(([fuel, perc]) => ({ fuel, perc })) } });
    return route.fulfill({ status: 404, contentType: 'text/plain', body: `not mocked: ${path}` });
  };
}

/** Counts audio contexts the page makes, and whether each one is device-free. Runs after silenceLiveAudio. */
function countAudio() {
  const Base = window.AudioContext;
  window.__audio = { made: 0, deviceFree: 0 };
  class Counted extends Base {
    constructor(...args) {
      super(...args);
      window.__audio.made++;
      if (this instanceof OfflineAudioContext) window.__audio.deviceFree++;
    }
  }
  window.AudioContext = Counted;
  window.webkitAudioContext = Counted;
}

async function withPage(browser, options, fn) {
  const { initScript, grid = 'ok', ...contextOptions } = options;
  const context = await browser.newContext({ deviceScaleFactor: 1, ...contextOptions });
  await context.addInitScript(silenceLiveAudio);
  await context.addInitScript(countAudio);
  if (initScript) await context.addInitScript(initScript);
  const requests = { grid: 0, offsite: [] };
  await context.route(/^https:\/\/api\.carbonintensity\.org\.uk\//, (route) => {
    requests.grid++;
    return gridMock(grid)(route);
  });
  const page = await context.newPage();
  const problems = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (
      ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) &&
      !['127.0.0.1', 'localhost', 'api.carbonintensity.org.uk'].includes(url.hostname)
    )
      requests.offsite.push(r.url());
  });
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    // Firefox's own notice when ask-the-record's worker asks for a WebGPU adapter on a machine where
    // Firefox blocklists WebGPU. The browser writes it; no page can probe for WebGPU without it.
    if (/^\[JavaScript Warning: "WebGPU is disabled by blocklist\."/.test(m.text())) return;
    // The failing grid mock answers 503 on purpose; browsers log the failed request.
    if (grid === 'fail' && /503|Service Unavailable|Failed to load resource/i.test(m.text())) return;
    problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  try {
    const result = await fn(page, problems, requests);
    if (requests.offsite.length) throw new Error(`requests off this machine: ${requests.offsite.join(', ')}`);
    return result;
  } finally {
    await context.close();
  }
}

const expect = (cond, message) => {
  if (!cond) throw new Error(message);
};

async function run(name) {
  const browser = await launch(name);
  const results = [];
  const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
  const check = async (label, options, fn) => {
    if (only && !only.test(label)) return;
    const started = Date.now();
    try {
      const detail = await withPage(browser, options, fn);
      results.push({ check: label, ok: true, ms: Date.now() - started, ...(detail ? { detail } : {}) });
      console.log(`  ok   ${label}${detail ? ` (${JSON.stringify(detail)})` : ''}`);
    } catch (error) {
      results.push({ check: label, ok: false, error: String(error instanceof Error ? error.message : error) });
      console.log(`  FAIL ${label}: ${error instanceof Error ? error.message : error}`);
    }
  };
  const shot = (page, state, size = 'desktop') => page.screenshot({ path: join(shots, `${name}-${size}-${state}.png`) });
  const context = { check, expect, BASE, config, shots, shot, name };

  await roomChecks(context);
  await officeChecks(context);

  await check('the CV page holds only confirmed claims', {}, async (page, problems) => {
    await page.goto(`${BASE}/cv.html`, { waitUntil: 'load' });
    const text = await page.locator('main').textContent();
    expect(text.includes('Head of AI') && text.includes('EU AI Act'), 'CV content missing');
    for (const bad of ['redacted-term', 'redacted-term', 'Simply']) expect(!text.includes(bad), `found ${bad}`);
    expect(problems.length === 0, problems.join(' | '));
  });

  await check('a terminal piece plays its recording', { viewport: { width: 1440, height: 900 } }, async (page, problems) => {
    await page.goto(`${BASE}/terminal.html?piece=dreaming`, { waitUntil: 'load' });
    await page.waitForTimeout(4000);
    const rows = await page.locator('.xterm-rows').textContent();
    expect(rows.includes('dreaming'), 'nothing written');
    expect(problems.length === 0, problems.join(' | '));
  });

  await browser.close();
  writeFileSync(
    join(site, 'shots', `e2e-${name}.json`),
    `${JSON.stringify({ browser: name, base: BASE, at: new Date().toISOString(), results }, null, 2)}\n`,
  );
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = 0;
  for (const name of wanted) {
    console.log(name);
    const results = await run(name);
    failed += results.filter((r) => !r.ok).length;
  }
  process.exit(failed ? 1 : 0);
}
