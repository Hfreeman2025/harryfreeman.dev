// The 3D room's browser checks, run by e2e.mjs in each browser: the first screen, the cabinet, the
// desks, Reception, the grid sign, the radio, the keyboard and the fallback without WebGL.

import { MOCK_VALUE } from './e2e.mjs';

const desk = { viewport: { width: 1440, height: 900 } };
const station = (page) => page.evaluate(() => document.documentElement.dataset.station);
const waitStation = (page, s, timeout = 8000) =>
  page.waitForFunction((want) => document.documentElement.dataset.station === want, s, { timeout });
const active = (page) => page.evaluate(() => document.activeElement?.dataset?.target ?? document.activeElement?.id ?? null);
const cardOpen = (page) =>
  page.waitForFunction(() => !document.getElementById('card').hidden && document.getElementById('card').dataset.open === 'true', null, {
    timeout: 10000,
  });
const cardTitle = async (page) => (await page.locator('#card-title').textContent())?.trim();
const box = (page, selector) => page.locator(selector).boundingBox();

async function live(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  await waitLive(page);
}

async function waitLive(page) {
  await page.waitForFunction(
    () => document.documentElement.dataset.stage === 'live' || document.documentElement.dataset.mode === 'office',
    null,
    { timeout: 20000 },
  );
  const mode = await page.evaluate(() => document.documentElement.dataset.mode);
  if (mode !== 'room') throw new Error(`the room did not start: ${await page.locator('#room-status').textContent()}`);
  // Let the first glide-free frames settle and the labels be placed.
  await page.waitForTimeout(400);
}

export async function roomChecks({ check, expect, BASE, config, shot }) {
  const ids = Object.keys(config.pieces);
  // The classic room, kept on this branch behind ?style=classic; the desk has its own checks.
  const ROOM = (query = '', hash = '') => `${BASE}/?style=classic${query ? `&${query}` : ''}${hash}`;

  await check('room: the HTML carries the directory, every object and every folder before any script', {}, async () => {
    const html = await (await fetch(`${BASE}/`)).text();
    for (const text of [
      'Harry Freeman',
      'Head of AI',
      'coding agents built these ten tools',
      'href="/cv.html"',
      'class="room__poster"',
      'highlight="#record-lines"',
    ])
      expect(html.includes(text), `missing ${text}`);
    expect(!html.includes('studio.html'), 'still links to the old studio page');
    for (const target of ['cabinet', 'reception', 'sign', 'radio']) expect(html.includes(`data-target="${target}"`), `no ${target}`);
    for (const id of ids) {
      expect(html.includes(`data-target="desk:${id}"`), `no desk label for ${id}`);
      expect(html.includes(`data-target="folder:${id}"`), `no folder label for ${id}`);
      expect(html.includes(`href="#work-${id}" data-piece="${id}"`), `no directory row for ${id}`);
      expect(html.includes(`href="${config.pieces[id]}"`), `no open link for ${id}`);
    }
  });

  await check(
    'room: the first screen is the directory and a poster of the room; the scene comes up cleanly, with no layout shift',
    {
      ...desk,
      initScript: () => {
        window.__shift = PerformanceObserver.supportedEntryTypes?.includes('layout-shift') ? 0 : null;
        if (window.__shift === null) return;
        window.__shifted = [];
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            if (e.hadRecentInput) continue;
            window.__shift += e.value;
            for (const source of e.sources ?? []) {
              const n = source.node;
              const el = n?.nodeType === 1 ? n : n?.parentElement;
              window.__shifted.push(
                `${el ? `${el.tagName.toLowerCase()}#${el.id}.${String(el.className).split(' ')[0]}` : '?'} ${Math.round(source.previousRect.y)}→${Math.round(source.currentRect.y)}`,
              );
            }
          }
        }).observe({ type: 'layout-shift', buffered: true });
      },
    },
    async (page, problems) => {
      await page.goto(ROOM(), { waitUntil: 'commit' });
      await page.waitForSelector('.masthead__name', { timeout: 5000 });
      await waitLive(page);
      await page.waitForTimeout(2000);
      const t = await page.evaluate(() => ({
        fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
        sceneReady: performance.getEntriesByName('scene-ready')[0]?.startTime ?? null,
        poster: (() => {
          const img = document.querySelector('.room__poster');
          return img?.complete && img.naturalWidth > 0 ? img.currentSrc.split('/').pop() : null;
        })(),
        shift: window.__shift,
        shifted: window.__shifted,
      }));
      expect(t.poster, 'the poster of the room did not load');
      expect(t.sceneReady !== null, 'no scene-ready mark');
      if (t.shift !== null) expect(t.shift === 0, `layout shift ${t.shift}: ${t.shifted.join(', ')}`);
      await shot(page, 'door');
      expect(problems.length === 0, problems.join(' | '));
      return {
        firstContentfulPaintMs: t.fcp === null ? 'not reported' : Math.round(t.fcp),
        sceneReadyMs: Math.round(t.sceneReady),
        poster: t.poster,
        layoutShift: t.shift === null ? 'not reported by this browser' : t.shift,
      };
    },
  );

  await check('room: keyboard: cabinet → drawer → folder → the desk turn → Esc back, step by step', desk, async (page, problems) => {
    await live(page, ROOM());
    await page.focus('[data-target="cabinet"]');
    await page.keyboard.press('Enter');
    await waitStation(page, 'cabinet');
    await page.waitForFunction(() => document.activeElement?.dataset.target === 'drawer:inside', null, { timeout: 5000 });
    expect(!(await page.locator('#room-back').isHidden()), 'no visible way back to the door');
    await shot(page, 'cabinet');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect((await active(page)) === 'drawer:grid', `Tab went to ${await active(page)}`);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.dataset.target === 'folder:grid-weather', null, { timeout: 5000 });
    expect((await page.getAttribute('[data-target="drawer:grid"]', 'aria-expanded')) === 'true', 'drawer not expanded');
    await page.waitForTimeout(700);
    await shot(page, 'drawer');
    await page.keyboard.press('Tab');
    expect((await active(page)) === 'folder:gridtop', `Tab went to ${await active(page)}`);
    await page.keyboard.press('Enter');
    await cardOpen(page);
    await waitStation(page, 'desk');
    expect((await cardTitle(page)) === 'gridtop', `card title ${await cardTitle(page)}`);
    expect((await active(page)) === 'card-title', `focus on ${await active(page)}`);
    expect((await page.locator('#card-back').textContent())?.trim() === 'Back to the cabinet', 'no “Back to the cabinet”');
    expect((await page.locator('#card .open').getAttribute('href')) === config.pieces.gridtop, 'open link');
    // The desk's screen plays the loop over the monitor; the folder sits beside it, not over it.
    const screen = await box(page, '#room-screen');
    const card = await box(page, '#card .folder-card__open');
    expect(screen && screen.width > 200, `the screen overlay is ${JSON.stringify(screen)}`);
    expect(screen.x + screen.width <= card.x + 2, `the folder covers the screen: ${JSON.stringify({ screen, card })}`);
    expect((await page.locator('#room-screen').getAttribute('data-loop'))?.includes('/loops/gridtop.'), 'the screen plays another loop');
    await page.waitForTimeout(600);
    await shot(page, 'desk');
    await page.keyboard.press('Escape');
    await waitStation(page, 'cabinet');
    await page.waitForFunction(() => document.activeElement?.dataset.target === 'folder:gridtop', null, { timeout: 5000 });
    expect(await page.locator('#card').isHidden(), 'the folder stayed open');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement?.dataset.target === 'drawer:grid', null, { timeout: 5000 });
    expect((await page.getAttribute('[data-target="drawer:grid"]', 'aria-expanded')) === 'false', 'drawer still out');
    await page.keyboard.press('Escape');
    await waitStation(page, 'door');
    await page.waitForFunction(() => document.activeElement?.dataset.target === 'cabinet', null, { timeout: 5000 });
    expect(problems.length === 0, problems.join(' | '));
  });

  await check('room: Tab reaches every object at the door', desk, async (page) => {
    await live(page, ROOM());
    await page.focus('.index__more a[href="#brief"]');
    const seen = new Set();
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const target = await page.evaluate(() => document.activeElement?.closest('[data-target]')?.dataset.target ?? null);
      if (target) seen.add(target);
    }
    for (const want of ['cabinet', 'reception', 'radio', ...ids.map((id) => `desk:${id}`)])
      expect(seen.has(want), `Tab never reached ${want}`);
    return { reached: seen.size };
  });

  await check('room: the pointer picks the cabinet, a drawer front and a folder in the model', desk, async (page) => {
    await live(page, ROOM());
    // Just under each label is the object itself, drawn in WebGL.
    let b = await box(page, '[data-target="cabinet"]');
    await page.mouse.click(b.x + b.width / 2, b.y - 50);
    await waitStation(page, 'cabinet');
    // The labels come back once the camera has arrived.
    await page.locator('[data-target="drawer:agents"]').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(200);
    // A drawer's button lies over its front, so clicking the front itself opens it.
    b = await box(page, '[data-target="drawer:agents"]');
    await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.75);
    await page.waitForFunction(
      () => document.querySelector('[data-target="drawer:agents"]')?.getAttribute('aria-expanded') === 'true',
      null,
      {
        timeout: 5000,
      },
    );
    await page.locator('[data-target="folder:receipts"]').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(700);
    // The folder's name is printed on its tab; just under it is the folder itself, drawn in WebGL.
    b = await box(page, '[data-target="folder:receipts"]');
    await page.mouse.click(b.x + b.width / 2, b.y + b.height + 14);
    await cardOpen(page);
    expect((await cardTitle(page)) === 'receipts', `pulled ${await cardTitle(page)}`);
  });

  await check('room: clicking a desk in the model turns to it', desk, async (page) => {
    await live(page, ROOM('debug'));
    const sourced = (await page.evaluate(() => window.roomDebug.monitorRects()))[6];
    // Pointing at a desk (here, its monitor) shows its tag; clicking turns to it.
    await page.mouse.move(sourced.x + sourced.width / 2, sourced.y + sourced.height / 2);
    await page.waitForFunction(() => document.querySelector('[data-target="desk:sourced"]')?.dataset.hot === 'true', null, {
      timeout: 3000,
    });
    await page.waitForTimeout(200);
    expect(
      Number(await page.locator('[data-target="desk:sourced"]').evaluate((el) => getComputedStyle(el).opacity)) > 0.9,
      'its tag did not show',
    );
    await page.mouse.click(sourced.x + sourced.width / 2, sourced.y + sourced.height / 2);
    await cardOpen(page);
    expect((await cardTitle(page)) === 'Sourced', `opened ${await cardTitle(page)}`);
  });

  await check(
    'room: Reception’s answer turns the camera to the desk, opens its folder and marks the quoted line',
    desk,
    async (page, problems) => {
      await live(page, ROOM());
      await page.focus('[data-target="reception"]');
      await page.keyboard.press('Enter');
      await waitStation(page, 'reception');
      await page.getByRole('button', { name: 'How does gridtop choose when to run?' }).click();
      await page.waitForFunction(() => document.querySelector('ask-the-record')?.result?.kind === 'answer', null, { timeout: 30000 });
      await shot(page, 'reception-answer');
      await cardOpen(page);
      await waitStation(page, 'desk');
      expect((await cardTitle(page)) === 'gridtop', `opened ${await cardTitle(page)}`);
      const marked = await page.evaluate(() => {
        const quote = document.querySelector('ask-the-record').result.quotes[0];
        const lines = document.getElementById('record-lines');
        const highlight = globalThis.CSS?.highlights?.get('ask-the-record');
        if (!highlight) return { api: false, piece: lines.dataset.piece };
        const ranges = [...highlight];
        const first = ranges[0];
        const node = first?.startContainer;
        const line = (node instanceof Element ? node : node?.parentElement)?.closest('[data-record-line]');
        const lineBox = line?.getBoundingClientRect();
        const frame = lines.getBoundingClientRect();
        return {
          api: true,
          piece: lines.dataset.piece,
          ranges: ranges.length,
          inFolder: Boolean(line && lines.contains(line)),
          line: line?.dataset.recordLine,
          text: first?.toString().slice(0, 60),
          quote: quote.fact.text.slice(0, 60),
          visible: Boolean(lineBox && lineBox.top >= frame.top - 1 && lineBox.bottom <= frame.bottom + 1 && lineBox.height > 0),
        };
      });
      expect(marked.piece === 'gridtop', `the folder shows ${marked.piece}`);
      if (marked.api) {
        expect(marked.ranges > 0 && marked.inFolder, `nothing marked in the folder: ${JSON.stringify(marked)}`);
        expect(
          marked.quote.startsWith(marked.text.slice(0, 20).trim()) || marked.text.includes(marked.quote.slice(0, 20)),
          `marked ${JSON.stringify(marked)}`,
        );
        expect(marked.visible, `the marked line is scrolled out of view: ${JSON.stringify(marked)}`);
      }
      await page.waitForTimeout(400);
      await shot(page, 'reception-desk');
      // Esc goes back to Reception, where the question was asked.
      await page.keyboard.press('Escape');
      await waitStation(page, 'reception');
      expect(problems.length === 0, problems.join(' | '));
      return { line: marked.line ?? 'no Highlight API', marked: marked.text };
    },
  );

  await check('room: a refusal says so and moves nothing', desk, async (page) => {
    await live(page, ROOM());
    await page.focus('[data-target="reception"]');
    await page.keyboard.press('Enter');
    await waitStation(page, 'reception');
    await page.waitForFunction(() => customElements.get('ask-the-record') && document.querySelector('ask-the-record')?.record, null, {
      timeout: 30000,
    });
    const input = page.locator('ask-the-record').locator('[part="input"]');
    await input.fill('What is your favourite football team?');
    await input.press('Enter');
    await page.waitForFunction(() => document.querySelector('ask-the-record')?.result?.kind === 'refusal', null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    expect((await station(page)) === 'reception', `moved to ${await station(page)}`);
    expect(await page.locator('#card').isHidden(), 'a folder opened for a refusal');
    expect((await page.locator('[data-answering="true"]').count()) === 0, 'something lit for a refusal');
    await shot(page, 'refusal');
  });

  await check(
    'room: the grid sign shows the mocked half-hour, its time and its source, and the light follows it',
    desk,
    async (page, problems, requests) => {
      await live(page, ROOM());
      await page.waitForFunction(() => document.getElementById('grid-sign')?.dataset.state === 'live', null, { timeout: 8000 });
      const value = await page.locator('#grid-value').textContent();
      const detail = await page.locator('#grid-detail').textContent();
      const source = await page.locator('.grid-sign__source').textContent();
      expect(value === `${MOCK_VALUE} gCO₂/kWh, moderate`, `value ${value}`);
      expect(/\d{2}:\d{2}–\d{2}:\d{2} (GMT|BST)/.test(detail ?? ''), `no half-hour in ${detail}`);
      expect(/NESO Carbon Intensity API, CC BY 4\.0/.test(source ?? ''), `source ${source}`);
      expect((await page.evaluate(() => document.documentElement.dataset.light)) === 'grid', 'the light does not follow the reading');
      expect(requests.grid >= 1, 'the sign never asked the (mocked) grid');
      expect(problems.length === 0, problems.join(' | '));
      return { value, detail };
    },
  );

  await check(
    'room: when the grid API fails, the sign says unavailable and the light stays neutral',
    { ...desk, grid: 'fail' },
    async (page) => {
      await live(page, ROOM());
      await page.waitForFunction(() => document.getElementById('grid-sign')?.dataset.state === 'unavailable', null, { timeout: 8000 });
      const text = await page.locator('#grid-sign').textContent();
      expect(text.includes('Grid data unavailable'), `sign: ${text}`);
      expect(!/\d+\s*gCO/.test(text), `a value is shown: ${text}`);
      expect((await page.evaluate(() => document.documentElement.dataset.light)) === 'neutral', 'the light is not neutral');
      await shot(page, 'grid-unavailable');
      return { sign: text.replace(/\s+/g, ' ').trim().slice(0, 140) };
    },
  );

  await check('room: the radio is silent until pressed, opens no audio device, and stops when you leave', desk, async (page, problems) => {
    await live(page, ROOM());
    await page.waitForTimeout(1500);
    expect((await page.evaluate(() => window.__audio.made)) === 0, 'an audio context was made before the press');
    // The radio is an object on the shelf; its card opens on hover, with the switch in it.
    await page.hover('[data-target="radio"]');
    await page.waitForFunction(() => document.getElementById('radio')?.dataset.open === 'true', null, { timeout: 3000 });
    await page.hover('#radio-button');
    await page.waitForTimeout(800);
    expect((await page.evaluate(() => window.__audio.made)) === 0, 'reaching for the radio made an audio context');
    expect((await page.getAttribute('#radio-button', 'aria-pressed')) === 'false', 'on before the press');
    await page.click('#radio-button');
    await page.waitForFunction(() => ['playing', 'failed'].includes(document.getElementById('radio').dataset.state), null, {
      timeout: 15000,
    });
    const state = await page.locator('#radio-state').textContent();
    const audio = await page.evaluate(() => window.__audio);
    expect((await page.getAttribute('#radio', 'data-state')) === 'playing', `the radio did not play: ${state}`);
    expect((await page.getAttribute('#radio-button', 'aria-pressed')) === 'true', 'no visible on state');
    expect(audio.made >= 1 && audio.made === audio.deviceFree, `audio contexts: ${JSON.stringify(audio)}`);
    expect(
      (await page.locator('#radio-credit').textContent()) === 'Data: Carbon Intensity API, © NESO, CC BY 4.0',
      'no credit by the radio',
    );
    await shot(page, 'radio-on');
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
    await page.waitForFunction(() => document.getElementById('radio').dataset.state === 'off', null, { timeout: 5000 });
    expect(problems.length === 0, problems.join(' | '));
    return { playing: state, audio };
  });

  await check('room: arriving at ?style=classic#folder-receipts turns to that desk', desk, async (page) => {
    await live(page, ROOM('', '#folder-receipts'));
    await cardOpen(page);
    expect((await cardTitle(page)) === 'receipts', `opened ${await cardTitle(page)}`);
  });

  await check('room: a directory row pulls its folder from wherever you stand', desk, async (page) => {
    await live(page, ROOM());
    await page.click('.index a[data-piece="real-or-hallucinated"]');
    await cardOpen(page);
    expect((await cardTitle(page)) === 'Real or Hallucinated?', `opened ${await cardTitle(page)}`);
    await page.click('.index a[data-piece="sourced"]');
    await page.waitForFunction(() => document.getElementById('card-title')?.textContent.trim() === 'Sourced', null, { timeout: 10000 });
  });

  await check('room: the replay pauses and plays', desk, async (page) => {
    await live(page, ROOM());
    await page.click('#replay-toggle');
    const a = await page.locator('#replay-time').textContent();
    await page.waitForTimeout(2500);
    expect(a === (await page.locator('#replay-time').textContent()), 'time moved while paused');
    expect((await page.locator('#replay-toggle').getAttribute('aria-pressed')) === 'true', 'aria-pressed not set');
    await page.click('#replay-toggle');
    await page.waitForTimeout(2500);
    expect(a !== (await page.locator('#replay-time').textContent()), 'time did not move after play');
  });

  await check('room: reaching for the question box at Reception moves nothing', desk, async (page) => {
    await live(page, ROOM());
    await page.click('[data-target="reception"]');
    await waitStation(page, 'reception');
    const where = () => page.$eval('.ask__try button', (b) => Math.round(b.getBoundingClientRect().top));
    const height = () => page.$eval('#ask-box', (b) => Math.round(b.getBoundingClientRect().height));
    const [top, h] = [await where(), await height()];
    await page.waitForFunction(() => document.querySelector('ask-the-record')?.record, null, { timeout: 30000 });
    await page.waitForTimeout(400);
    expect((await where()) === top, `a suggestion moved from ${top} to ${await where()}`);
    expect((await height()) === h, `the box grew from ${h} to ${await height()}`);
  });

  await check('room: at rest no label covers a monitor, and a desk’s tag never does when shown', desk, async (page) => {
    await live(page, ROOM('debug'));
    const monitors = await page.evaluate(() => window.roomDebug.monitorRects());
    const covering = (r) =>
      monitors.some((m) => r.x < m.x + m.width && m.x < r.x + r.width && r.y < m.y + m.height && m.y < r.y + r.height);
    const shown = await page.evaluate(() =>
      [...document.querySelectorAll('.room__labels > [data-target]')]
        .filter((el) => !el.hidden && Number(getComputedStyle(el).opacity) > 0.05 && el.dataset.place !== 'cover')
        .map((el) => ({ target: el.dataset.target, ...el.getBoundingClientRect().toJSON() })),
    );
    expect(
      shown
        .map((l) => l.target)
        .sort()
        .join(',') === 'cabinet,credit,reception',
      `labelled at rest: ${shown.map((l) => l.target).join(', ')}`,
    );
    for (const l of shown) expect(!covering(l), `${l.target} covers a monitor`);
    // Each desk's tag, shown by keyboard focus.
    const desks = [];
    await page.focus('.index__more a[href="#brief"]');
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      // Tags fade in over 140 ms.
      await page.waitForTimeout(200);
      const t = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.dataset?.target?.startsWith('desk:')
          ? { target: el.dataset.target, opacity: Number(getComputedStyle(el).opacity), ...el.getBoundingClientRect().toJSON() }
          : null;
      });
      // Tab wraps round in some browsers: each desk counts once.
      if (t && !desks.some((d) => d.target === t.target)) desks.push(t);
    }
    expect(desks.length === 10, `reached ${desks.length} desk tags`);
    for (const t of desks) {
      expect(t.opacity > 0.9, `${t.target} stayed hidden when focused`);
      expect(!covering(t), `${t.target} covers a monitor`);
    }
    return { atRest: shown.length, deskTags: desks.length };
  });

  await check('room: the grid credit is visible at rest', desk, async (page) => {
    await live(page, ROOM());
    const credit = await page.evaluate(() => {
      const el = document.getElementById('grid-credit');
      const r = el.getBoundingClientRect();
      return {
        hidden: el.hidden,
        opacity: Number(getComputedStyle(el).opacity),
        text: el.textContent,
        inside: r.width > 50 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      };
    });
    expect(!credit.hidden && credit.opacity > 0.9 && credit.inside, `credit: ${JSON.stringify(credit)}`);
    expect(credit.text === 'Data: Carbon Intensity API, © NESO, CC BY 4.0', `credit text: ${credit.text}`);
  });

  for (const [size, viewport] of [
    ['1440×900', { width: 1440, height: 900 }],
    ['1280×720', { width: 1280, height: 720 }],
  ]) {
    await check(`room (${size}): every card stays fully inside the viewport`, { viewport }, async (page, problems) => {
      await live(page, ROOM());
      const inside = (selector) =>
        page.evaluate((sel) => {
          const r = document.querySelector(sel).getBoundingClientRect();
          return {
            ok: r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
            r: r.toJSON(),
          };
        }, selector);
      const seen = {};
      await page.hover('[data-target="sign"]');
      await page.waitForFunction(() => document.getElementById('grid-sign')?.dataset.open === 'true', null, { timeout: 3000 });
      seen.sign = await inside('#grid-sign');
      await shot(page, `sign-card-${viewport.width}`);
      await page.mouse.move(5, 5);
      await page.click('[data-target="radio"]');
      await page.waitForFunction(() => document.getElementById('radio')?.dataset.open === 'true', null, { timeout: 3000 });
      seen.radio = await inside('#radio');
      await shot(page, `radio-card-${viewport.width}`);
      await page.keyboard.press('Escape');
      await page.click('[data-target="reception"]');
      await waitStation(page, 'reception');
      await page.waitForTimeout(300);
      seen.reception = await inside('#ask');
      await page.keyboard.press('Escape');
      await waitStation(page, 'door');
      await page.locator('[data-target="cabinet"]').waitFor({ state: 'visible' });
      await page.click('.index a[data-piece="gridtop"]');
      await cardOpen(page);
      seen.folder = await inside('#card .folder-card__open');
      for (const [name, v] of Object.entries(seen)) expect(v.ok, `${name} card leaves the viewport: ${JSON.stringify(v.r)}`);
      expect(problems.length === 0, problems.join(' | '));
    });
  }

  await check(
    'without WebGL the room says so and becomes the flat office',
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
      await page.goto(ROOM(), { waitUntil: 'load' });
      await page.waitForFunction(() => document.documentElement.dataset.mode === 'office', null, { timeout: 15000 });
      const status = await page.locator('#room-status').textContent();
      expect(/could not start/.test(status ?? ''), `status: ${status}`);
      expect(await page.locator('#archive').isVisible(), 'the flat cabinet is not shown');
      await page.click('.drawer[data-drawer="grid"] .drawer__front');
      await page.waitForTimeout(800);
      expect((await page.getAttribute('.drawer[data-drawer="grid"]', 'data-open')) === 'true', 'the flat cabinet does not work');
    },
  );
}
