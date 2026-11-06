// The loops where the host ignores byte ranges, as Cloudflare Pages does: dist/ served by a static server
// that answers every request whole (200, never 206), and in each browser the recordings play anyway,
// because the site fetches each one whole into a blob (src/folder.ts, wholeMedia). Safari will not play a
// <video> from such a server's own URL; Playwright's WebKit does (its media stack is not Safari's), so the
// checks hold the contract that makes it safe: no loop is ever asked of the host by the media player, only
// fetched whole, and every one plays from its blob.

import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import { extname, join, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.onnx': 'application/octet-stream',
  '.bin': 'application/octet-stream',
};

/** A static server for dist/ that ignores Range: every answer whole, 200, with no Accept-Ranges. */
function serveWhole(root) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let path = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!path.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
    if (!existsSync(path)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream', 'Content-Length': statSync(path).size });
    createReadStream(path).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

export async function norangeChecks({ check, expect, site, name }) {
  const dist = join(site, 'dist');
  const server = await serveWhole(dist);
  const base = `http://127.0.0.1:${server.address().port}`;
  const desk = { viewport: { width: 1440, height: 900 } };
  const phone = { viewport: { width: 390, height: 844 }, ...(name === 'firefox' ? {} : { isMobile: true, hasTouch: true }) };
  /** Requests for the loops, by kind: the media player's must be none, the page's fetches all of them. */
  const watchLoops = (page) => {
    const asked = { media: 0, fetch: 0 };
    page.on('request', (r) => {
      if (!/\/loops\/[^/]+\.(?:webm|mp4)$/.test(new URL(r.url()).pathname)) return;
      if (r.resourceType() === 'media') asked.media++;
      else asked.fetch++;
    });
    return asked;
  };
  /** The video plays: from a blob, with data, unpaused, and its time moving on. */
  const playing = (page, selector) =>
    page.evaluate(async (sel) => {
      const v = document.querySelector(sel);
      if (!v) return { found: false };
      const before = v.currentTime;
      await new Promise((r) => setTimeout(r, 700));
      return {
        found: true,
        fromBlob: v.currentSrc.startsWith('blob:'),
        ready: v.readyState,
        paused: v.paused,
        moved: v.currentTime !== before,
      };
    }, selector);

  try {
    await check('no ranges: the static server answers a byte range whole, as Cloudflare Pages does', {}, async () => {
      const response = await fetch(`${base}/loops/receipts.mp4`, { headers: { Range: 'bytes=0-1' } });
      const body = await response.arrayBuffer();
      expect(response.status === 200 && body.byteLength > 1000, `a range answered ${response.status} with ${body.byteLength} bytes`);
    });

    await check('no ranges: the card’s loop plays on the desk’s screen, from the whole file', desk, async (page, problems) => {
      const asked = watchLoops(page);
      await page.goto(`${base}/?debug&in#folder-gpt-in-a-tab`, { waitUntil: 'load' });
      await page.waitForFunction(() => document.getElementById('card')?.dataset.open === 'true', null, { timeout: 30000 });
      await page.waitForFunction(() => (document.getElementById('desk-loop')?.readyState ?? 0) >= 2, null, { timeout: 15000 });
      const loop = await playing(page, '#desk-loop');
      expect(loop.fromBlob && !loop.paused && loop.moved, `the card's loop: ${JSON.stringify(loop)}`);
      expect(asked.media === 0 && asked.fetch > 0, `loops asked of the host: ${JSON.stringify(asked)}`);
      expect(problems.length === 0, problems.join(' | '));
      return { ...loop, asked };
    });

    await check('no ranges: the desk’s ten screens play their loops', desk, async (page) => {
      const asked = watchLoops(page);
      await page.goto(`${base}/?debug&in`, { waitUntil: 'load' });
      await page.waitForFunction(() => document.documentElement.dataset.screens === 'video', null, { timeout: 20000 });
      expect(asked.media === 0 && asked.fetch > 0, `loops asked of the host: ${JSON.stringify(asked)}`);
      return asked;
    });

    await check('no ranges: on a phone, the flat office’s folder plays its loop, from the whole file', phone, async (page, problems) => {
      const asked = watchLoops(page);
      await page.goto(`${base}/`, { waitUntil: 'load' });
      await page.waitForFunction(() => document.documentElement.dataset.mode === 'office', null, { timeout: 15000 });
      // The cabinet's grid drawer, then gridtop's folder.
      await page.locator('#archive').scrollIntoViewIfNeeded();
      await page.click('.drawer[data-drawer="grid"] .drawer__front', { position: { x: 20, y: 20 } });
      await page.waitForTimeout(800);
      await page.locator('.folder[data-piece="gridtop"] .folder__tab').click();
      await page.waitForFunction(() => (document.querySelector('.folder-card__video')?.readyState ?? 0) >= 2, null, { timeout: 15000 });
      const loop = await playing(page, '.folder-card__video');
      expect(loop.fromBlob && !loop.paused && loop.moved, `the folder's loop: ${JSON.stringify(loop)}`);
      expect(asked.media === 0 && asked.fetch > 0, `loops asked of the host: ${JSON.stringify(asked)}`);
      expect(problems.length === 0, problems.join(' | '));
      return { ...loop, asked };
    });
  } finally {
    server.close();
  }
}
