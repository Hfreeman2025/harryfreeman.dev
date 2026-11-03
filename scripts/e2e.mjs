// Browser checks for the studio, in Chromium, WebKit and Firefox, one browser at a time, one page
// at a time. Every browser is silent (silent.mjs). Needs the site on STUDIO_URL (default :4400).
//   node scripts/e2e.mjs [chromium|webkit|firefox ...]
// Writes shots/e2e-<browser>.json and prints a summary. Exit code 1 if any check fails.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { silenceLiveAudio } from './silent.mjs';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.STUDIO_URL ?? 'http://127.0.0.1:4400';
const config = JSON.parse(readFileSync(join(site, 'site.config.json'), 'utf8'));
const shots = join(site, 'shots', 'e2e');
mkdirSync(shots, { recursive: true });

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'webkit', 'firefox'];

function launch(name) {
  // Chromium runs as the full browser with GPU compositing, as a visitor's would.
  if (name === 'chromium')
    return chromium.launch({ channel: 'chromium', args: ['--mute-audio', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  if (name === 'firefox') return firefox.launch({ firefoxUserPrefs: { 'media.volume_scale': '0.0' } });
  return webkit.launch();
}

async function withPage(browser, options, fn) {
  const context = await browser.newContext({ deviceScaleFactor: 1, ...options });
  await context.addInitScript(silenceLiveAudio);
  if (options.initScript) await context.addInitScript(options.initScript);
  const page = await context.newPage();
  const problems = [];
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    // Firefox's own notice when ask-the-record's worker asks for a WebGPU adapter on a machine where
    // Firefox blocklists WebGPU. The browser writes it; no page can probe for WebGPU without it.
    if (/^\[JavaScript Warning: "WebGPU is disabled by blocklist\."/.test(m.text())) return;
    problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  try {
    return await fn(page, problems);
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
  const check = async (label, options, fn) => {
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
  const desk = { viewport: { width: 1440, height: 900 } };

  await check('the HTML carries name, role, line, CV and every desk link before any script', {}, async () => {
    const html = await (await fetch(`${BASE}/`)).text();
    for (const text of ['Harry Freeman', 'Head of AI', 'coding agents built these ten pieces', 'href="/cv.html"', 'Skip to the list'])
      expect(html.includes(text), `missing ${text}`);
    for (const id of Object.keys(config.pieces)) {
      expect(html.includes(`href="#work-${id}"`), `no desk link for ${id}`);
      expect(html.includes(`href="${config.pieces[id]}"`), `no open link for ${id}`);
    }
  });

  let sceneOk = false;
  await check('the studio comes alive on a laptop screen, with a clean console', desk, async (page, problems) => {
    const t0 = Date.now();
    await page.goto(BASE, { waitUntil: 'commit' });
    await page.waitForSelector('.titleblock__name', { timeout: 5000 });
    const firstText = Date.now() - t0;
    const mode = await page.evaluate(() => document.documentElement.dataset.mode);
    let live = null;
    if (mode === 'scene') {
      await page.waitForFunction(
        () => ['live'].includes(document.documentElement.dataset.stage ?? '') || document.documentElement.dataset.mode === 'list',
        null,
        { timeout: 15000 },
      );
      live = Date.now() - t0;
    }
    const finalMode = await page.evaluate(() => document.documentElement.dataset.mode);
    sceneOk = finalMode === 'scene';
    await page.waitForTimeout(3000);
    await page.screenshot({ path: join(shots, `${name}-desktop-studio.png`) });
    if (!sceneOk) {
      const status = await page.locator('#studio-status').textContent();
      expect(status && status.length > 20, 'fell back to the list without saying why');
    }
    expect(problems.length === 0, problems.join(' | '));
    return {
      mode: finalMode,
      firstTextMs: firstText,
      liveMs: live,
      status: sceneOk ? undefined : await page.locator('#studio-status').textContent(),
    };
  });

  if (sceneOk) {
    await check('Tab to a desk, Enter: the camera glides in and the card opens; Escape returns focus', desk, async (page, problems) => {
      await page.goto(BASE, { waitUntil: 'load' });
      await page.waitForFunction(() => document.documentElement.dataset.stage === 'live');
      const label = page.locator('.desk-label[data-piece="agent-race"]');
      await label.focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.getElementById('card') && !document.getElementById('card').hidden, null, { timeout: 8000 });
      await page.waitForTimeout(900);
      const title = await page.locator('#card-title').textContent();
      expect(title?.trim() === 'Agent Race', `card title was ${title}`);
      const focused = await page.evaluate(() => document.activeElement?.id);
      expect(focused === 'card-title', `focus was on ${focused}`);
      const open = await page.locator('#card .open').getAttribute('href');
      expect(open === config.pieces['agent-race'], `open link was ${open}`);
      await page.screenshot({ path: join(shots, `${name}-desktop-card.png`) });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.getElementById('card').hidden && !document.documentElement.dataset.zoom, null, {
        timeout: 8000,
      });
      const back = await page.evaluate(() => document.activeElement?.getAttribute('data-piece'));
      expect(back === 'agent-race', `focus returned to ${back}`);
      expect(problems.length === 0, problems.join(' | '));
    });

    await check('clicking a desk in the model opens it', desk, async (page) => {
      await page.goto(BASE, { waitUntil: 'load' });
      await page.waitForFunction(() => document.documentElement.dataset.stage === 'live');
      await page.waitForTimeout(500);
      const box = await page.locator('.desk-label[data-piece="sourced"]').boundingBox();
      // The desk sits just under its label.
      await page.mouse.click(box.x + box.width / 2, box.y + box.height + 40);
      await page.waitForFunction(() => !document.getElementById('card').hidden, null, { timeout: 8000 });
      await page.waitForTimeout(900);
      const title = await page.locator('#card-title').textContent();
      expect(title?.trim() === 'Sourced', `opened ${title}`);
    });

    await check('the replay pauses and plays', desk, async (page) => {
      await page.goto(BASE, { waitUntil: 'load' });
      await page.waitForFunction(() => document.documentElement.dataset.stage === 'live');
      await page.click('#replay-toggle');
      const a = await page.locator('#replay-time').textContent();
      await page.waitForTimeout(2500);
      const b = await page.locator('#replay-time').textContent();
      expect(a === b, `time moved while paused: ${a} → ${b}`);
      expect((await page.locator('#replay-toggle').getAttribute('aria-pressed')) === 'true', 'aria-pressed not set');
      await page.click('#replay-toggle');
      await page.waitForTimeout(2500);
      const c = await page.locator('#replay-time').textContent();
      expect(c !== b, 'time did not move after play');
    });
  }

  await check('Ask the studio answers with quotes, and the desk it concerns lights up', desk, async (page, problems) => {
    await page.goto(BASE, { waitUntil: 'load' });
    await page.getByRole('button', { name: 'How does gridtop choose when to run?' }).click();
    await page.waitForFunction(() => document.querySelector('ask-the-record')?.result?.kind === 'answer', null, { timeout: 20000 });
    const first = await page.evaluate(() => document.querySelector('ask-the-record').result.quotes[0].fact.text);
    expect(/gridtop/.test(first), `first quote: ${first}`);
    const lit = await page.locator('[data-piece="gridtop"][data-answering="true"]').count();
    expect(lit >= 1, 'gridtop not lit');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(shots, `${name}-desktop-answer.png`) });
    expect(problems.length === 0, problems.join(' | '));
    return { first: first.slice(0, 80) };
  });

  await check('Ask the studio refuses what the record does not say', desk, async (page) => {
    await page.goto(BASE, { waitUntil: 'load' });
    await page.locator('#ask-standin').click();
    await page.waitForFunction(() => customElements.get('ask-the-record') && document.querySelector('ask-the-record')?.record, null, {
      timeout: 20000,
    });
    const input = page.locator('ask-the-record').locator('[part="input"]');
    await input.fill('What is your favourite football team?');
    await input.press('Enter');
    await page.waitForFunction(() => document.querySelector('ask-the-record')?.result?.kind === 'refusal', null, { timeout: 30000 });
    expect((await page.locator('[data-answering="true"]').count()) === 0, 'a desk lit for a refusal');
    await page.screenshot({ path: join(shots, `${name}-desktop-refusal.png`) });
  });

  await check('Skip to the list reaches the list', desk, async (page) => {
    await page.goto(BASE, { waitUntil: 'load' });
    await page.click('.titleblock__skip');
    await page.waitForTimeout(1200);
    const top = await page.locator('#work').evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(top) < 120, `list top at ${top}`);
  });

  await check('reduced motion gets the list and the still photograph', { ...desk, reducedMotion: 'reduce' }, async (page, problems) => {
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(800);
    expect((await page.evaluate(() => document.documentElement.dataset.mode)) === 'list', 'not list mode');
    expect((await page.locator('canvas').count()) === 0, 'a canvas was created');
    const still = await page.locator('.studio__still img').evaluate((img) => img.complete && img.naturalWidth > 0);
    expect(still, 'still did not load');
    expect((await page.locator('.works > .work').count()) === 10, 'list incomplete');
    expect(problems.length === 0, problems.join(' | '));
  });

  await check(
    'a phone gets the list, with no sideways scroll',
    { viewport: { width: 390, height: 844 }, isMobile: name !== 'firefox', hasTouch: true },
    async (page, problems) => {
      await page.goto(BASE, { waitUntil: 'load' });
      await page.waitForTimeout(800);
      expect((await page.evaluate(() => document.documentElement.dataset.mode)) === 'list', 'not list mode');
      const [sw, w] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      expect(sw <= w, `scrollWidth ${sw} > ${w}`);
      await page.screenshot({ path: join(shots, `${name}-phone-top.png`) });
      expect(problems.length === 0, problems.join(' | '));
    },
  );

  await check(
    'without WebGL the page says so and becomes the list',
    {
      ...desk,
      initScript: () => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
          if (String(type).startsWith('webgl')) return null;
          return original.call(this, type, ...rest);
        };
      },
    },
    async (page) => {
      await page.goto(BASE, { waitUntil: 'load' });
      await page.waitForFunction(() => document.documentElement.dataset.mode === 'list', null, { timeout: 10000 });
      const status = await page.locator('#studio-status').textContent();
      expect(/could not start/.test(status ?? ''), `status: ${status}`);
    },
  );

  await check('the CV page holds only confirmed claims', {}, async (page, problems) => {
    await page.goto(`${BASE}/cv.html`, { waitUntil: 'load' });
    const text = await page.locator('main').textContent();
    expect(text.includes('Head of AI') && text.includes('EU AI Act'), 'CV content missing');
    for (const bad of ['redacted-term', 'redacted-term', 'Simply']) expect(!text.includes(bad), `found ${bad}`);
    expect(problems.length === 0, problems.join(' | '));
  });

  await check('a terminal piece plays its recording', desk, async (page, problems) => {
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

let failed = 0;
for (const name of wanted) {
  console.log(name);
  const results = await run(name);
  failed += results.filter((r) => !r.ok).length;
}
process.exit(failed ? 1 : 0);
