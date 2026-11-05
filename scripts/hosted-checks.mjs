// Every station of the hosted build, in a browser, as the public site serves it: at https://harryfreeman.dev,
// served from this machine. wrangler's own Cloudflare Pages emulation (tools/deploy) serves dist/ with its
// _headers; a TLS front holding a throwaway certificate for harryfreeman.dev stands before it; and each
// browser reaches the site through a local proxy. So the page runs on the real origin, in a secure
// context, off loopback as far as it can tell, under the real headers. The proxy lets through only
// Hugging Face, over the real network (the meaning model); the Carbon Intensity API is mocked as in the
// other checks; any other request off this machine is refused and reported. The front adds a report-uri
// to the policy, so violations in workers are seen too; the deployed headers have none.
//
//   npm run check:hosted -- measure [browser]          the policy as Report-Only: every origin, kind and violation
//   npm run check:hosted -- [chromium|firefox|webkit…]  the policy enforced: zero violations, every station working
//
// Needs `npm run build:hosted` first. Browsers are silent (silent.mjs). Writes shots/hosted/<mode>-<browser>.json.

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { gridMock, MOCK_VALUE } from './e2e.mjs';
import { silenceLiveAudio } from './silent.mjs';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://harryfreeman.dev';
const work = join(site, '.cache/hosted-checks');
const out = join(site, 'shots/hosted');
mkdirSync(work, { recursive: true });
mkdirSync(out, { recursive: true });

const args = process.argv.slice(2);
const mode = args[0] === 'measure' ? 'measure' : 'enforce';
const browsers = args.filter((a) => ['chromium', 'firefox', 'webkit'].includes(a));
if (browsers.length === 0) browsers.push(...(mode === 'measure' ? ['chromium'] : ['chromium', 'firefox', 'webkit']));
/** Hosts the proxy lets through to the real network: Hugging Face, where the meaning model is published. */
const PASS = /(?:^|\.)(?:huggingface\.co|hf\.co)$/;
const RECORDING_LINE = 'Runs on Harry’s machine; this is a recording of the real tool.';
const OWN_QUESTION = 'Which tool turns the grid into something you can listen to?';

// ---------- The site, as Pages serves it ----------

function certificate() {
  const key = join(work, 'key.pem');
  const cert = join(work, 'cert.pem');
  if (!existsSync(key) || !existsSync(cert))
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        key,
        '-out',
        cert,
        '-days',
        '7',
        '-subj',
        '/CN=harryfreeman.dev',
        '-addext',
        'subjectAltName=DNS:harryfreeman.dev',
      ],
      { stdio: 'ignore' },
    );
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

async function startPages(port) {
  const bin = join(site, 'tools/deploy/node_modules/.bin/wrangler');
  if (!existsSync(bin)) throw new Error('no wrangler in tools/deploy: run npm ci --prefix tools/deploy');
  // Run from .cache/hosted-checks, so wrangler's own .wrangler/ state stays out of the site.
  const child = spawn(
    bin,
    ['pages', 'dev', join(site, 'dist'), '--ip', '127.0.0.1', '--port', String(port), '--compatibility-date', '2026-11-01'],
    {
      cwd: work,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 60; i++) {
    if (/Ready on http/.test(log)) return child;
    if (child.exitCode !== null) throw new Error(`wrangler pages dev exited: ${log.slice(-500)}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error('wrangler pages dev did not start');
}

/** The TLS front: forwards to wrangler, applies the run's policy mode, and collects CSP reports. */
function startFront(pagesPort, record) {
  const server = https.createServer(certificate(), (req, res) => {
    if (req.url === '/__csp-report' && req.method === 'POST') {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          for (const r of Array.isArray(parsed) ? parsed : [parsed]) record.reports.push(r['csp-report'] ?? r.body ?? r);
        } catch {
          record.reports.push({ unparsed: body.slice(0, 300) });
        }
        res.writeHead(204).end();
      });
      return;
    }
    const upstream = http.request(
      { host: '127.0.0.1', port: pagesPort, method: req.method, path: req.url, headers: { ...req.headers, host: 'harryfreeman.dev' } },
      (up) => {
        const headers = { ...up.headers };
        const csp = headers['content-security-policy'];
        if (csp) {
          delete headers['content-security-policy'];
          headers[mode === 'measure' ? 'content-security-policy-report-only' : 'content-security-policy'] =
            `${csp}; report-uri /__csp-report`;
        }
        record.served.push({ path: req.url, status: up.statusCode, type: up.headers['content-type'] ?? '' });
        res.writeHead(up.statusCode ?? 502, headers);
        up.pipe(res);
      },
    );
    upstream.on('error', (e) => res.writeHead(502).end(String(e)));
    req.pipe(upstream);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** The proxy every browser uses: the site to the front, Hugging Face to the network, nothing else. */
function startProxy(frontPort, record) {
  const proxy = http.createServer((req, res) => {
    record.refused.push(`plain http: ${req.url}`);
    res.writeHead(403).end();
  });
  proxy.on('connect', (req, client, head) => {
    const [host, port = '443'] = (req.url ?? '').split(':');
    let target = null;
    if (host === 'harryfreeman.dev' && port === '443') target = { host: '127.0.0.1', port: frontPort };
    else if (host && PASS.test(host) && port === '443') {
      target = { host, port: 443 };
      record.passed.add(host);
    }
    if (!target) {
      record.refused.push(`${host}:${port}`);
      client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const upstream = net.connect(target.port, target.host, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head?.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on('error', () => client.destroy());
    client.on('error', () => upstream.destroy());
  });
  return new Promise((resolve) => proxy.listen(0, '127.0.0.1', () => resolve(proxy)));
}

// ---------- Browsers ----------

function launch(name, proxy) {
  const opts = { proxy: { server: `http://127.0.0.1:${proxy}` } };
  if (name === 'chromium')
    return chromium.launch({
      ...opts,
      channel: 'chromium',
      args: ['--mute-audio', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
    });
  if (name === 'firefox') return firefox.launch({ ...opts, firefoxUserPrefs: { 'media.volume_scale': '0.0' } });
  return webkit.launch(opts);
}

/** Collects every request the browser makes, with what kind of request it is and who made it. */
function watch(context, page, record, station) {
  const seen = (r, from) => {
    const url = new URL(r.url());
    record.requests.push({
      station: station.name,
      origin: url.protocol.startsWith('http') ? url.origin : url.protocol,
      type: r.resourceType(),
      from,
      path: url.pathname,
    });
  };
  page.on('request', (r) => seen(r, 'page'));
  page.on('worker', (w) => record.workers.push({ station: station.name, url: w.url().replace(/^blob:.*/, 'blob:') }));
  context.on('request', (r) => {
    if (!r.frame?.()) seen(r, 'worker');
  });
  page.on('requestfailed', (r) => record.failed.push({ station: station.name, url: r.url(), error: r.failure()?.errorText }));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning')
      record.console.push({ station: station.name, type: m.type(), text: m.text().slice(0, 400) });
  });
  page.on('pageerror', (e) => record.console.push({ station: station.name, type: 'pageerror', text: e.message.slice(0, 400) }));
}

const expect = (cond, message) => {
  if (!cond) throw new Error(message);
};
const waitStation = (page, s, timeout = 12000) => page.waitForFunction((want) => window.deskDebug?.station() === want, s, { timeout });
const live = (page) =>
  page.waitForFunction(
    () => document.documentElement.dataset.stage === 'live' || document.documentElement.dataset.mode === 'office',
    null,
    { timeout: 30000 },
  );
const press = async (page, selector) => {
  await page.focus(selector);
  await page.keyboard.press('Enter');
};

// ---------- The stations ----------

const DESK = { viewport: { width: 1440, height: 900 } };
const PHONE = (name) => ({ viewport: { width: 390, height: 844 }, ...(name === 'firefox' ? {} : { isMobile: true, hasTouch: true }) });

const STATIONS = [
  {
    name: 'door: knock, the voice answers, walk in to the desk',
    context: DESK,
    async run(page) {
      await page.goto(`${ORIGIN}/?debug`, { waitUntil: 'load' });
      expect((await page.evaluate(() => document.documentElement.dataset.entrance)) === 'door', 'a first visit did not start at the door');
      await page.waitForFunction(() => document.getElementById('entrance')?.dataset.door === 'live', null, { timeout: 20000 });
      await page.click('#come-in');
      await page.waitForFunction(
        () =>
          document.documentElement.dataset.entrance === 'in' &&
          document.documentElement.dataset.stage === 'live' &&
          window.deskDebug?.station() === 'door',
        null,
        { timeout: 20000 },
      );
      return {
        voice: await page.evaluate(() => performance.getEntriesByType('resource').some((e) => /\/audio\/door-voice\./.test(e.name))),
      };
    },
  },
  {
    name: 'desk: the dive into the office and back, the notebook, the grid note, the mic',
    context: DESK,
    async run(page) {
      await page.goto(`${ORIGIN}/?debug&in`, { waitUntil: 'load' });
      await live(page);
      await page.click('[data-action="office"][data-at="door"]');
      await waitStation(page, 'office');
      await page.keyboard.press('Escape');
      await waitStation(page, 'door');
      await page.click('[data-action="notebook"][data-at="door"]');
      await page.waitForTimeout(1200);
      await page.keyboard.press('Escape');
      await page.click('[data-action="sign"][data-at="door"]');
      await page.waitForFunction((v) => document.getElementById('grid-value')?.textContent?.includes(String(v)), MOCK_VALUE, {
        timeout: 10000,
      });
      await page.keyboard.press('Escape');
      await page.click('[data-action="mic"][data-at="door"]');
      await page.waitForFunction(() => document.getElementById('speak')?.dataset.open === 'true', null, { timeout: 5000 });
      await page.keyboard.press('Escape');
      return { grid: await page.locator('#grid-value').textContent() };
    },
  },
  {
    name: 'card: a card pulled, its loop on the screen, the recording line under it, its stamp checked',
    context: DESK,
    async run(page, name) {
      await page.goto(`${ORIGIN}/?debug#folder-gpt-in-a-tab`, { waitUntil: 'load' });
      await page.waitForFunction(() => document.getElementById('card')?.dataset.open === 'true', null, { timeout: 20000 });
      await page.locator('#desk-screen').waitFor({ state: 'visible', timeout: 10000 });
      await page.waitForFunction(() => (document.getElementById('desk-loop')?.readyState ?? 0) >= 2, null, { timeout: 15000 });
      const screen = await page.evaluate(() => {
        const v = document.getElementById('desk-loop');
        return {
          src: v.currentSrc,
          paused: v.paused,
          under: document.getElementById('desk-under')?.textContent ?? '',
          links: document.querySelectorAll('#card a[href^="http://"]').length,
        };
      });
      expect(screen.under.includes(RECORDING_LINE), `under the screen: ${screen.under}`);
      expect(!/\bOpen GPT in a tab\b/.test(screen.under), 'an Open link to a local port is still offered');
      expect(screen.links === 0, 'the card links to a plain http:// address');
      expect(!screen.paused || name === 'webkit', 'the loop is not playing');
      await page.locator('#card-stamp .stamp__face').scrollIntoViewIfNeeded();
      await page.click('#card-stamp .stamp__face');
      await page.waitForFunction(
        () =>
          ['valid', 'invalid', 'unsupported', 'error'].includes(document.querySelector('#card-stamp .stamp__status')?.dataset.state ?? ''),
        null,
        { timeout: 20000 },
      );
      const stamp = await page.evaluate(() => document.querySelector('#card-stamp .stamp__status')?.dataset.state);
      expect(stamp === 'valid', `the stamp checked as ${stamp}`);
      return { loop: screen.src.replace(ORIGIN, ''), playing: !screen.paused, stamp };
    },
  },
  {
    name: 'Reception: a question of your own, answered by meaning search with the model from Hugging Face',
    context: DESK,
    async run(page) {
      await page.goto(`${ORIGIN}/?debug&in`, { waitUntil: 'load' });
      await live(page);
      await press(page, '[data-action="reception"][data-at="door"]');
      await waitStation(page, 'reception');
      await page.waitForFunction(() => customElements.get('ask-the-record') && document.querySelector('ask-the-record')?.record, null, {
        timeout: 30000,
      });
      const input = page.locator('ask-the-record').locator('[part="input"]');
      await input.fill(OWN_QUESTION);
      await input.press('Enter');
      await page.waitForFunction(
        (q) => {
          const el = document.querySelector('ask-the-record');
          return (el?.result?.question === q && el.result.mode === 'hybrid') || el?.modelState === 'failed';
        },
        OWN_QUESTION,
        { timeout: 240000 },
      );
      const result = await page.evaluate(() => {
        const el = document.querySelector('ask-the-record');
        return {
          mode: el.result?.mode,
          kind: el.result?.kind,
          model: el.modelState,
          diagnostics: el.diagnostics,
          first: el.result?.quotes?.[0]?.fact?.text?.slice(0, 120),
        };
      });
      expect(result.mode === 'hybrid', `meaning search did not run: ${JSON.stringify(result)}`);
      return result;
    },
  },
  {
    name: 'radio: Listen to the Grid plays (device-free) and stops',
    context: DESK,
    async run(page) {
      await page.goto(`${ORIGIN}/?debug&in`, { waitUntil: 'load' });
      await live(page);
      await page.click('[data-action="office"][data-at="door"]');
      await waitStation(page, 'office');
      await page.click('[data-action="radio"][data-at="office"]');
      await page.waitForFunction(() => document.getElementById('radio')?.dataset.open === 'true', null, { timeout: 5000 });
      await page.click('#radio-button');
      await page.waitForFunction(() => ['playing', 'failed'].includes(document.getElementById('radio')?.dataset.state ?? ''), null, {
        timeout: 20000,
      });
      const state = await page.getAttribute('#radio', 'data-state');
      expect(state === 'playing', `the radio is ${state}: ${await page.locator('#radio-state').textContent()}`);
      await page.waitForTimeout(2500);
      await page.click('#radio-button');
      return { state };
    },
  },
  {
    name: 'flat office on a phone: a folder, its recording line and stamp, Reception by keyword',
    context: PHONE,
    async run(page) {
      await page.goto(`${ORIGIN}/#folder-receipts`, { waitUntil: 'load' });
      expect((await page.evaluate(() => document.documentElement.dataset.mode)) === 'office', 'the phone did not get the flat office');
      await page.waitForFunction(() => document.getElementById('card')?.dataset.open === 'true', null, { timeout: 20000 });
      const text = await page.locator('#card').textContent();
      expect(text.includes(RECORDING_LINE), 'the flat folder has no recording line');
      await page.locator('#card-stamp .stamp__face').scrollIntoViewIfNeeded();
      await page.click('#card-stamp .stamp__face');
      await page.waitForFunction(() => document.querySelector('#card-stamp .stamp__status')?.dataset.state === 'valid', null, {
        timeout: 20000,
      });
      await page.goto(`${ORIGIN}/#ask`, { waitUntil: 'load' });
      await page.locator('#ask').scrollIntoViewIfNeeded();
      await page.getByRole('button', { name: 'How does gridtop choose when to run?' }).click();
      await page.waitForFunction(() => document.querySelector('ask-the-record')?.result?.kind === 'answer', null, { timeout: 30000 });
      return { answered: true };
    },
  },
  {
    name: 'pages: the CV, what a stamp proves, both recorded terminal sessions, and a missing page',
    context: DESK,
    async run(page) {
      const cv = await page.goto(`${ORIGIN}/cv.html`, { waitUntil: 'load' });
      expect(new URL(page.url()).pathname === '/cv' && cv.ok(), `/cv.html went to ${page.url()} (${cv.status()})`);
      expect((await page.locator('main').textContent()).includes('Head of AI'), 'the CV did not render');
      await page.goto(`${ORIGIN}/stamps.html`, { waitUntil: 'load' });
      expect((await page.locator('main').textContent()).length > 500, 'the stamps page is empty');
      for (const piece of ['dreaming', 'gridtop']) {
        await page.goto(`${ORIGIN}/terminal.html?piece=${piece}`, { waitUntil: 'load' });
        await page.waitForTimeout(3500);
        expect(((await page.locator('.xterm-rows').textContent()) ?? '').trim().length > 0, `${piece}: nothing written`);
      }
      const missing = await page.goto(`${ORIGIN}/no-such-page`, { waitUntil: 'load' });
      return { missing: missing.status() };
    },
  },
];

// ---------- Run ----------

async function run(name, proxyPort, record) {
  const browser = await launch(name, proxyPort);
  const results = [];
  try {
    for (const s of STATIONS) {
      const context = await browser.newContext({
        deviceScaleFactor: 1,
        ignoreHTTPSErrors: true,
        ...(typeof s.context === 'function' ? s.context(name) : s.context),
      });
      await context.addInitScript(silenceLiveAudio);
      await context.route(/^https:\/\/api\.carbonintensity\.org\.uk\//, (route) => {
        record.requests.push({
          station: s.name,
          origin: 'https://api.carbonintensity.org.uk',
          type: route.request().resourceType(),
          from: 'page (mocked)',
          path: new URL(route.request().url()).pathname,
        });
        return gridMock('ok')(route);
      });
      const page = await context.newPage();
      watch(context, page, record, s);
      const started = Date.now();
      const before = record.reports.length;
      try {
        const detail = await s.run(page, name);
        await page.waitForTimeout(800); // late reports
        const violations = record.reports.length - before;
        results.push({ station: s.name, ok: true, ms: Date.now() - started, violations, detail });
        console.log(
          `  ok   ${s.name} (${Date.now() - started} ms, ${violations} violation reports)${detail ? ` ${JSON.stringify(detail).slice(0, 220)}` : ''}`,
        );
      } catch (error) {
        results.push({ station: s.name, ok: false, error: String(error instanceof Error ? error.message : error).slice(0, 600) });
        console.log(`  FAIL ${s.name}: ${String(error instanceof Error ? error.message : error).slice(0, 600)}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  return results;
}

/** Every origin, by the kind of request, as the policy names kinds. */
function summarise(record) {
  const byOrigin = {};
  for (const r of record.requests) {
    byOrigin[r.origin] ??= {};
    byOrigin[r.origin][r.type] = (byOrigin[r.origin][r.type] ?? 0) + 1;
  }
  const violations = {};
  for (const r of record.reports) {
    const key = `${r['effective-directive'] ?? r.effectiveDirective ?? r['violated-directive'] ?? '?'} ← ${r['blocked-uri'] ?? r.blockedURL ?? '?'}`;
    violations[key] = (violations[key] ?? 0) + 1;
  }
  return {
    byOrigin,
    workers: [...new Set(record.workers.map((w) => w.url.replace(ORIGIN, '')))],
    passedThroughProxy: [...record.passed],
    refused: record.refused,
    violations,
  };
}

const pagesPort = 8788 + Math.floor(Math.random() * 500);
let pages;
let front;
let proxy;
let failed = 0;
try {
  if (!existsSync(join(site, 'dist/_headers')) || !readFileSync(join(site, 'dist/index.html'), 'utf8').includes(`href="${ORIGIN}/"`))
    throw new Error('dist/ is not the hosted build: run npm run build:hosted');
  pages = await startPages(pagesPort);
  for (const name of browsers) {
    const record = { requests: [], workers: [], failed: [], console: [], reports: [], served: [], passed: new Set(), refused: [] };
    front = await startFront(pagesPort, record);
    proxy = await startProxy(front.address().port, record);
    console.log(`${name} (${mode === 'measure' ? 'policy report-only, measuring' : 'policy enforced'})`);
    const results = await run(name, proxy.address().port, record);
    const summary = summarise(record);
    const notFound = record.served.filter((s) => s.status === 404 && s.path !== '/no-such-page');
    const report = {
      browser: name,
      mode,
      origin: ORIGIN,
      at: new Date().toISOString(),
      results,
      ...summary,
      notFound,
      consoleProblems: record.console,
      failedRequests: record.failed,
    };
    writeFileSync(join(out, `${mode}-${name}.json`), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`  origins: ${JSON.stringify(summary.byOrigin)}`);
    console.log(
      `  workers: ${summary.workers.join(', ') || 'none'}; through the proxy: ${summary.passedThroughProxy.join(', ') || 'nothing'}; refused: ${summary.refused.join(', ') || 'nothing'}`,
    );
    console.log(`  violations: ${Object.keys(summary.violations).length ? JSON.stringify(summary.violations) : 'none'}`);
    failed += results.filter((r) => !r.ok).length;
    if (mode === 'enforce' && (record.reports.length || record.refused.length)) failed++;
    front.close();
    proxy.close();
  }
} finally {
  pages?.kill();
}
process.exit(failed ? 1 : 0);
