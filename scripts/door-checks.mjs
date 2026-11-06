// The door's browser checks, run by e2e.mjs in each browser: a fresh visit lands outside the office
// door; Knock knocks twice (two synthesised hits 180 ms apart, scheduled only after the click), the voice
// answers after them with its words in a bubble, and the door opens onto the walk through one continuous
// space to the seated desk; the speaker toggle silences all of it, remembered, while the captions still
// show; its last frame the desk's own
// (pixel-similar to the desk loaded directly), with the real desk and nothing standing in for it at any
// point of the walk; Come in before the desk has loaded says Opening… and waits; Skip and Esc go
// straight in; a reload starts at the door again, and Back from another page restores the desk; deep
// links skip the door; reduced motion cuts; without WebGL the door is a poster with its plate as real
// text; on a phone it is a hero above the page. No layout shift, and no audio device opened.

const desk = { viewport: { width: 1440, height: 900 }, door: true };
const phone = (name) => ({
  viewport: { width: 390, height: 844 },
  door: true,
  ...(name === 'firefox' ? {} : { isMobile: true, hasTouch: true }),
});
const entrance = (page) => page.evaluate(() => document.documentElement.dataset.entrance);
const shifts = () => {
  window.__shift = PerformanceObserver.supportedEntryTypes?.includes('layout-shift') ? 0 : null;
  if (window.__shift === null) return;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) window.__shift += e.value;
  }).observe({ type: 'layout-shift', buffered: true });
};
const doorLive = (page) =>
  page.waitForFunction(() => document.getElementById('entrance')?.dataset.door === 'live', null, { timeout: 15000 });
/** Two PNG screenshots compared in the page: the mean difference per channel, and the share that differs much. */
async function compare(page, a, b) {
  return page.evaluate(
    async ([x, y]) => {
      const load = async (b64) => createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const [ia, ib] = await Promise.all([load(x), load(y)]);
      const c = new OffscreenCanvas(ia.width, ia.height);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(ia, 0, 0);
      const da = ctx.getImageData(0, 0, ia.width, ia.height).data;
      ctx.clearRect(0, 0, ia.width, ia.height);
      ctx.drawImage(ib, 0, 0);
      const db = ctx.getImageData(0, 0, ia.width, ia.height).data;
      let sum = 0;
      let far = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d = (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3;
        sum += d;
        if (d > 32) far++;
      }
      const n = da.length / 4;
      return { mean: sum / n / 255, far: far / n };
    },
    [a.toString('base64'), b.toString('base64')],
  );
}
/** Whether the hand (Caveat) has loaded: the doormat, the sticky note and the notebook are drawn in it. */
const handLoaded = (page) =>
  page.evaluate(() => {
    // As the canvas sees it (WebKit's document.fonts.check says no while the hand is in use): the same
    // words set in the hand and in the fallback come out different widths.
    const c = document.createElement('canvas').getContext('2d');
    const width = (font) => {
      c.font = font;
      return c.measureText('Hello, welcome! The grid, now 175').width;
    };
    return ['700', '500'].every((weight) => Math.abs(width(`${weight} 40px "Caveat", monospace`) - width(`${weight} 40px monospace`)) > 2);
  });
const seated = (page) =>
  page.waitForFunction(
    () =>
      document.documentElement.dataset.entrance === 'in' &&
      document.documentElement.dataset.stage === 'live' &&
      window.deskDebug?.station() === 'door',
    null,
    { timeout: 15000 },
  );

export async function doorChecks({ check, expect, BASE, shot, name }) {
  await check(
    'door: a first visit lands outside the office door; Come in swings it open, walks in and sits at the desk',
    { ...desk, initScript: shifts },
    async (page, problems) => {
      await page.goto(`${BASE}/?debug`, { waitUntil: 'load' });
      expect((await entrance(page)) === 'door', `a first visit starts ${await entrance(page)}`);
      expect((await page.title()) === 'Harry Freeman, Head of AI', `the title is ${await page.title()}`);
      expect(
        (await page.locator('#entrance-plate').textContent()) === 'Harry Freeman, Head of AI',
        'the plate does not read the name and role',
      );
      await doorLive(page);
      // The plate's words engraved on the door in the scene, and the same words in the page, visually hidden.
      const plate = await page.evaluate(() => window.deskDebug.printed().door);
      expect(plate.width > 120 && plate.y > 0, `the plate is not on the door: ${JSON.stringify(plate)}`);
      expect(
        (await page.locator('#entrance-plate').evaluate((el) => el.getBoundingClientRect().width)) <= 1,
        'the plate words float over the door',
      );
      expect(await page.locator('#come-in').isVisible(), 'no Knock');
      expect((await page.locator('#come-in').textContent()) === 'Knock', 'the way in is not a knock');
      expect(await page.locator('#skip-in').isVisible(), 'no Skip to the desk');
      await page.waitForTimeout(300);
      await shot(page, 'door');
      const started = Date.now();
      await page.click('#come-in');
      // Two knocks, the voice and its words (about four seconds), then the door opens and the walk begins.
      await page.waitForTimeout(6600);
      const mid = await page.evaluate(() => ({ walked: window.deskDebug.walked(), door: window.deskDebug.doorAngle() }));
      expect(mid.walked > 0.15 && mid.walked < 0.85 && mid.door > 1, `mid-walk: ${JSON.stringify(mid)}`);
      await shot(page, 'door-walk');
      await seated(page);
      const took = Date.now() - started;
      // About four seconds of knock and answer, then a walk of about six and a half.
      expect(took >= 9500 && took < 16000, `coming in took ${took} ms`);
      expect(await page.locator('#entrance').isHidden(), 'the door is still up');
      expect((await page.evaluate(() => document.activeElement?.className)) === 'masthead__name', 'focus did not land on the name');
      await page.waitForTimeout(600);
      await shot(page, 'door-seated');
      const shift = await page.evaluate(() => window.__shift);
      if (shift !== null) expect(shift === 0, `layout shift ${shift}`);
      const audio = await page.evaluate(() => window.__audio);
      expect(audio.made === audio.deviceFree, `an audio device was opened: ${JSON.stringify(audio)}`);
      expect(problems.length === 0, problems.join(' | '));
      return { cameInMs: took, layoutShift: shift ?? 'not reported by this browser' };
    },
  );

  await check(
    'door: the walk in is paced like a person: still while the door swings, a pause on the threshold, slower at the shelf and the whiteboard, a slow sit-down',
    desk,
    async (page, problems) => {
      await page.goto(`${BASE}/?debug`, { waitUntil: 'load' });
      await page.waitForFunction(() => document.documentElement.dataset.stage === 'live', null, { timeout: 30000 });
      await page.click('#come-in');
      // The camera, frame by frame, from the walk's first frame to sitting down.
      const trace = await page.evaluate(
        () =>
          new Promise((done) => {
            const out = [];
            let from;
            const tick = (now) => {
              if (window.deskDebug.walked() > 0 && from === undefined) from = now;
              if (from !== undefined) out.push([now - from, ...window.deskDebug.cameraAt()]);
              if (document.documentElement.dataset.entrance === 'in') return done(out);
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }),
      );
      // Speed over a tenth of a second (desk units a second; 125 to the metre), sampled every tenth.
      const speed = [];
      for (let at = 100; at <= trace.at(-1)[0]; at += 100) {
        const a = trace.findLast((r) => r[0] <= at - 100);
        const b = trace.findLast((r) => r[0] <= at);
        if (a && b && b[0] > a[0]) speed.push([at / 1000, Math.hypot(b[1] - a[1], b[2] - a[2], b[3] - a[3]) / ((b[0] - a[0]) / 1000)]);
      }
      const during = (t0, t1) => speed.filter(([t]) => t > t0 && t <= t1).map(([, v]) => v);
      const max = (xs) => Math.max(...xs);
      const total = trace.at(-1)[0];
      expect(total >= 6000 && total < 7500, `the walk took ${Math.round(total)} ms`);
      // Still while the door swings open; then on the threshold, still again for the pause.
      expect(max(during(0, 0.4)) < 1, `the camera moved before the door opened: ${max(during(0, 0.4))}`);
      // (The trace starts on the walk's first frame, a frame after it began: the pause is 2.7 to 3.1 s.)
      expect(max(during(2.8, 3.05)) < 2, `no pause on the threshold: ${max(during(2.8, 3.05)).toFixed(1)}`);
      // Never faster than a brisk walk (3 m/s).
      expect(max(speed.map(([, v]) => v)) < 375, `too fast: ${max(speed.map(([, v]) => v)).toFixed(0)} units/s`);
      // Not a constant glide: it slows while looking at the shelf and the whiteboard, between faster stretches.
      const roam = during(3.3, 5.3);
      expect(max(roam) / Math.min(...roam.slice(2)) > 1.4, `an even glide across the room: ${roam.map((v) => v.toFixed(0)).join(' ')}`);
      // Sitting down slowly: the last half-second at under a fifth of the walk's top speed.
      const end = during(total / 1000 - 0.5, total / 1000);
      expect(max(end) < max(roam) / 5, `a hard landing: ${max(end).toFixed(0)} against ${max(roam).toFixed(0)}`);
      expect(problems.length === 0, problems.join(' | '));
      return { walkMs: Math.round(total), topSpeed: Math.round(max(speed.map(([, v]) => v))), landing: Math.round(max(end)) };
    },
  );

  await check(
    'door: one continuous space: the walk-in ends on the desk’s own frame, with the real desk and no stand-ins all the way',
    desk,
    async (page, problems) => {
      // Held at one moment of the replay, so the two frames can be compared.
      const url = `${BASE}/?debug&hold&t=16.2`;
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(() => document.documentElement.dataset.stage === 'live', null, { timeout: 30000 });
      await page.waitForTimeout(500);
      await shot(page, 'walk-0-door');
      await page.click('#come-in');
      // Timed in the page, frame by frame: from the first step of the walk to sitting down.
      await page.evaluate(() => {
        const tick = () => {
          const walked = window.deskDebug.walked();
          if (walked > 0 && window.__walkFrom === undefined) window.__walkFrom = performance.now();
          if (window.__walkFrom !== undefined && document.documentElement.dataset.entrance === 'in') {
            window.__walkMs = performance.now() - window.__walkFrom;
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      // The knock and the answer, shot as they happen; then the door opening.
      await page.waitForTimeout(330);
      await shot(page, 'knock');
      await page.waitForTimeout(2600);
      expect(
        (await page.locator('#door-said').textContent())?.trim() === 'Hello, welcome! Come and explore.',
        `the bubble says ${await page.locator('#door-said').textContent()}`,
      );
      await shot(page, 'knock-said');
      await page.waitForTimeout(1300);
      await shot(page, 'knock-open');
      // Three frames along the walk: on the threshold, mid-room past the shelf and the whiteboard, near
      // the desk; and how long the walk itself took.
      const samples = [];
      for (const [i, at] of [
        [1, 0.42],
        [2, 0.64],
        [3, 0.87],
      ]) {
        await page.waitForFunction((w) => window.deskDebug.walked() >= w, at, { timeout: 8000, polling: 16 });
        samples.push(await page.evaluate(() => ({ walked: window.deskDebug.walked(), ...window.deskDebug.sceneSummary() })));
        await shot(page, `walk-${i}`);
      }
      await seated(page);
      const walkMs = Math.round(await page.evaluate(() => window.__walkMs));
      expect(walkMs >= 6000 && walkMs < 7500, `the walk took ${walkMs} ms`);
      samples.push(await page.evaluate(() => ({ walked: window.deskDebug.walked(), ...window.deskDebug.sceneSummary() })));
      for (const s of samples) {
        expect(s.placeholders === 0, `a stand-in in the scene at ${s.walked.toFixed(2)}`);
        expect(
          s.model && Object.values(s.desk).every(Boolean),
          `the real desk is not all there at ${s.walked.toFixed(2)}: ${JSON.stringify(s.desk)}`,
        );
      }
      await page.waitForTimeout(1200);
      await page.evaluate(() => document.activeElement?.blur());
      const walked = await page.screenshot();
      await shot(page, 'walk-4-seated');
      // The same desk, loaded straight (as a deep link or Back would): the frame sitting down lands on.
      const direct = await page.context().newPage();
      await direct.goto(`${url}&in`, { waitUntil: 'load' });
      await direct.waitForFunction(() => document.documentElement.dataset.stage === 'live', null, { timeout: 30000 });
      await direct.waitForTimeout(1700);
      const straight = await direct.screenshot();
      await shot(direct, 'walk-direct');
      // A frame drawn in the fallback hand is a font that did not arrive, not a different desk: say so.
      expect(await handLoaded(page), 'the hand font did not load in the page that walked in');
      expect(await handLoaded(direct), 'the hand font did not load in the page loaded directly');
      await direct.close();
      const diff = await compare(page, walked, straight);
      expect(diff.mean < 0.01 && diff.far < 0.01, `the seated frame differs from the desk's own: ${JSON.stringify(diff)}`);
      expect(problems.length === 0, problems.join(' | '));
      return { meanDiff: Number(diff.mean.toFixed(4)), farPixels: Number(diff.far.toFixed(4)), walkMs };
    },
  );

  await check(
    'door: over the door the pointer is a knuckle and the door brightens; a click on the door knocks',
    desk,
    async (page, problems) => {
      await page.goto(`${BASE}/?debug`, { waitUntil: 'load' });
      await doorLive(page);
      // On the door's leaf, below its plate.
      const plate = await page.evaluate(() => window.deskDebug.printed().door);
      const at = { x: plate.x + plate.width / 2, y: plate.y + plate.height * 3 };
      await page.mouse.move(at.x, at.y);
      await page.waitForTimeout(150);
      const over = await page.evaluate(() => {
        const entrance = document.getElementById('entrance');
        return { marked: entrance.dataset.hover !== undefined, cursor: getComputedStyle(entrance).cursor };
      });
      expect(over.marked && over.cursor.includes('knuckle.svg'), `over the door: ${JSON.stringify(over)}`);
      await page.mouse.click(at.x, at.y);
      await page.waitForFunction(() => document.getElementById('entrance').dataset.knocking !== undefined, null, { timeout: 2000 });
      expect(problems.length === 0, problems.join(' | '));
    },
  );

  await check('door: Come in before the desk has loaded says Opening… and waits for it', desk, async (page) => {
    // Hold the desk's models back, so the door is still a poster when Come in is pressed.
    let release;
    const held = new Promise((r) => {
      release = r;
    });
    await page.route(/\/assets\/3d\//, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(`${BASE}/?debug`, { waitUntil: 'load' });
    expect((await page.evaluate(() => document.documentElement.dataset.stage)) !== 'live', 'the desk was up already');
    await page.click('#come-in');
    // The knock and the answer play; when the door would open, it says Opening… and waits.
    await page.waitForFunction(() => document.getElementById('come-in')?.textContent === 'Opening…', null, { timeout: 7000 });
    expect((await page.locator('#come-in').getAttribute('aria-busy')) === 'true', 'Come in is not marked busy');
    expect((await entrance(page)) === 'door', 'it went in before the desk was there');
    release();
    await seated(page);
  });

  // 'Straight' here is within 1.5 s (the walk alone is 6.9 s); a tighter bound flaked on a loaded machine.
  await check('door: Skip and Esc go straight to the desk, before the knock, mid-knock and mid-walk', desk, async (page) => {
    await page.goto(`${BASE}/?debug`, { waitUntil: 'load' });
    await page.click('#skip-in');
    await page.waitForFunction(() => document.documentElement.dataset.entrance === 'in', null, { timeout: 1500 });
    await page.goto(`${BASE}/?debug&door`, { waitUntil: 'load' });
    expect((await entrance(page)) === 'door', 'the door is not shown with ?door');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.documentElement.dataset.entrance === 'in', null, { timeout: 1500 });
    // Mid-knock too.
    await page.goto(`${BASE}/?debug&door`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset.stage === 'live', null, { timeout: 30000 });
    await page.click('#come-in');
    await page.waitForTimeout(400);
    await page.click('#skip-in');
    await page.waitForFunction(() => document.documentElement.dataset.entrance === 'in', null, { timeout: 1500 });
    await page.waitForTimeout(4500);
    expect((await page.evaluate(() => window.deskDebug.station())) === 'door', 'the knock carried on after Skip');
    // Mid-walk, by Skip and by Esc: straight to the seat, the walk dropped.
    for (const how of ['skip', 'escape']) {
      await page.goto(`${BASE}/?debug&door`, { waitUntil: 'load' });
      await page.waitForFunction(() => document.documentElement.dataset.stage === 'live', null, { timeout: 30000 });
      await page.click('#come-in');
      await page.waitForFunction(() => window.deskDebug.walked() > 0.45, null, { timeout: 15000, polling: 16 });
      if (how === 'skip') await page.click('#skip-in');
      else await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.documentElement.dataset.entrance === 'in', null, { timeout: 1500 });
      const after = await page.evaluate(() => ({ station: window.deskDebug.station(), walked: window.deskDebug.walked() }));
      expect(after.station === 'door' && after.walked === 1, `after ${how} mid-walk: ${JSON.stringify(after)}`);
      await page.waitForTimeout(800);
      expect(
        (await page.evaluate(() => document.activeElement?.className)) === 'masthead__name',
        `focus is not on the name after ${how} mid-walk`,
      );
    }
  });

  await check(
    'door: the knock knocks twice and the voice answers after; nothing touches audio before it; the speaker silences it all, remembered, while the words still show',
    desk,
    async (page, problems) => {
      await page.goto(`${BASE}/?debug`, { waitUntil: 'load' });
      await page.waitForFunction(() => document.documentElement.dataset.stage === 'live', null, { timeout: 30000 });
      expect((await page.evaluate(() => window.__audio.made)) === 0, 'audio was touched before the knock');
      await page.click('#come-in');
      await page.waitForFunction(() => window.knockDebug.voice !== 'none', null, { timeout: 3000 });
      const heard = await page.evaluate(() => ({ ...window.knockDebug, audio: window.__audio }));
      expect(
        heard.hits.length === 2 && Math.abs(heard.hits[1] - heard.hits[0] - 0.18) < 0.005,
        `the knocks: ${JSON.stringify(heard.hits)}`,
      );
      expect(heard.voice === 'scheduled' && heard.voiceAt - heard.hits[1] > 0.5, `the voice: ${JSON.stringify(heard)}`);
      expect(heard.audio.made === 1 && heard.audio.deviceFree === 1, `audio: ${JSON.stringify(heard.audio)}`);
      // Muted: the same knock, the same words, no sound at all, and still so after a reload.
      await page.goto(`${BASE}/?debug&door`, { waitUntil: 'load' });
      await page.waitForFunction(() => document.documentElement.dataset.stage === 'live', null, { timeout: 30000 });
      await page.click('#door-sound');
      expect((await page.locator('#door-sound').getAttribute('aria-pressed')) === 'false', 'the speaker did not turn off');
      await page.reload({ waitUntil: 'load' });
      expect((await page.locator('#door-sound').getAttribute('aria-pressed')) === 'false', 'the speaker did not stay off');
      await page.waitForFunction(() => document.documentElement.dataset.stage === 'live', null, { timeout: 30000 });
      await page.click('#come-in');
      await page.waitForFunction(() => document.getElementById('door-said')?.textContent?.trim() === 'Hello, welcome!', null, {
        timeout: 3000,
      });
      await page.waitForFunction(
        () => document.getElementById('door-said')?.textContent?.trim() === 'Hello, welcome! Come and explore.',
        null,
        { timeout: 4000 },
      );
      const muted = await page.evaluate(() => ({ ...window.knockDebug, audio: window.__audio }));
      expect(muted.voice === 'muted' && muted.hits.length === 0 && muted.audio.made === 0, `muted: ${JSON.stringify(muted)}`);
      expect(problems.length === 0, problems.join(' | '));
    },
  );

  await check('door: a reload starts at the door again; Back from the CV restores the desk', desk, async (page) => {
    await page.goto(`${BASE}/?debug`, { waitUntil: 'load' });
    expect((await entrance(page)) === 'door', 'a fresh visit did not start at the door');
    await doorLive(page);
    await page.click('#skip-in');
    await page.waitForFunction(() => document.documentElement.dataset.entrance === 'in', null, { timeout: 500 });
    await page.reload({ waitUntil: 'load' });
    expect((await entrance(page)) === 'door', 'a reload did not start at the door');
    await doorLive(page);
    await page.click('#skip-in');
    await page.waitForFunction(() => document.documentElement.dataset.stage === 'live', null, { timeout: 30000 });
    await page.goto(`${BASE}/cv.html`, { waitUntil: 'load' });
    await page.goBack({ waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset.entrance === 'in', null, { timeout: 3000 });
    expect(await page.locator('#entrance').isHidden(), 'Back showed the door');
  });

  await check('door: deep links skip the door', desk, async (page) => {
    for (const hash of ['#ask', '#folder-gridtop', '#work-sourced']) {
      await page.goto(`${BASE}/${hash}`, { waitUntil: 'commit' });
      expect((await entrance(page)) === 'in', `${hash} was shown the door`);
    }
    await page.goto(`${BASE}/cv.html`, { waitUntil: 'load' });
    expect((await page.locator('#entrance').count()) === 0, 'the CV has a door');
  });

  await check(
    'door: with reduced motion the knock and the words stay, with no jolt or swing, and it cuts in',
    { ...desk, reducedMotion: 'reduce' },
    async (page) => {
      await page.goto(`${BASE}/?debug`, { waitUntil: 'load' });
      await doorLive(page);
      await page.waitForFunction(() => document.documentElement.dataset.stage === 'live', null, { timeout: 30000 });
      await page.click('#come-in');
      await page.waitForFunction(() => document.getElementById('door-said')?.textContent?.trim().startsWith('Hello, welcome!'), null, {
        timeout: 3000,
      });
      const during = await page.evaluate(() => ({
        knocks: window.deskDebug.knocks(),
        door: window.deskDebug.doorAngle(),
        heard: window.knockDebug,
      }));
      expect(during.knocks === 0 && during.door === 0, `the door moved: ${JSON.stringify(during)}`);
      expect(during.heard.hits.length === 2, 'reduced motion lost the knock');
      await page.waitForFunction(() => document.documentElement.dataset.entrance === 'in', null, { timeout: 6000 });
      expect((await page.evaluate(() => window.deskDebug.walked())) === 1, 'it walked rather than cut');
    },
  );

  await check(
    'door: without WebGL the door is a poster, the plate engraved in it and its words in the page, and a plain Come in link',
    {
      ...desk,
      // An init script runs in the page, so it carries its own layout-shift counter.
      initScript: () => {
        delete window.WebGLRenderingContext;
        delete window.WebGL2RenderingContext;
        window.__shift = PerformanceObserver.supportedEntryTypes?.includes('layout-shift') ? 0 : null;
        if (window.__shift === null) return;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (!e.hadRecentInput) window.__shift += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
      },
    },
    async (page, problems) => {
      await page.goto(`${BASE}/`, { waitUntil: 'load' });
      await page.waitForTimeout(1200);
      expect((await page.evaluate(() => document.documentElement.dataset.mode)) === 'office', 'not the flat page');
      expect(await page.locator('#entrance').isVisible(), 'no door');
      expect(
        await page.locator('.entrance__poster').evaluate((img) => img.complete && img.naturalWidth > 0),
        'the door poster did not load',
      );
      // The plate's words: engraved in the poster (dark letters in the plate's place), and in the page.
      const entranceBox = await page.locator('#entrance').boundingBox();
      const plateClip = {
        x: entranceBox.x + entranceBox.width / 2 - entranceBox.height * 0.09,
        y: entranceBox.y + entranceBox.height * 0.335,
        width: entranceBox.height * 0.18,
        height: entranceBox.height * 0.035,
      };
      const engraved = await page.evaluate(
        async (b64) => {
          const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
          const c = new OffscreenCanvas(bitmap.width, bitmap.height);
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(bitmap, 0, 0);
          const d = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
          let dark = 0;
          for (let i = 0; i < d.length; i += 4) if (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] < 90) dark++;
          return dark / (d.length / 4);
        },
        (await page.screenshot({ clip: plateClip })).toString('base64'),
      );
      expect(engraved > 0.03, `no words on the poster's plate (${engraved.toFixed(3)} dark)`);
      expect((await page.locator('#entrance-plate').textContent()) === 'Harry Freeman, Head of AI', 'the plate words are not in the page');
      expect((await page.locator('#come-in').getAttribute('href')) === '#directory', 'Come in does not lead to the content');
      await shot(page, 'door-poster');
      await page.click('#come-in');
      await page.waitForFunction(() => document.documentElement.dataset.entrance === 'passed', null, { timeout: 8000 });
      await page.waitForTimeout(900);
      expect(
        await page.locator('#directory').evaluate((el) => el.getBoundingClientRect().top < innerHeight * 0.5),
        'Come in did not go to the content',
      );
      const shift = await page.evaluate(() => window.__shift);
      if (shift !== null) expect(shift === 0, `layout shift ${shift}`);
      expect(problems.length === 0, problems.join(' | '));
    },
  );

  await check(
    'door (phone): the door, in lighter detail, above the page; Come in goes on to the content',
    { ...phone(name), initScript: shifts },
    async (page, problems) => {
      await page.goto(`${BASE}/?debug`, { waitUntil: 'load' });
      expect((await entrance(page)) === 'door', 'a first visit on a phone starts inside');
      await doorLive(page);
      await page.waitForTimeout(400);
      await shot(page, 'door', 'phone');
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width <= 390, `sideways scroll: ${width}px`);
      await page.click('#come-in');
      await page.waitForFunction(() => document.documentElement.dataset.entrance === 'passed', null, { timeout: 8000 });
      await page.waitForTimeout(900);
      expect(
        await page.locator('#directory').evaluate((el) => el.getBoundingClientRect().top < innerHeight * 0.5),
        'Come in did not go on to the content',
      );
      const shift = await page.evaluate(() => window.__shift);
      if (shift !== null) expect(shift === 0, `layout shift ${shift}`);
      expect(problems.length === 0, problems.join(' | '));
    },
  );
}
