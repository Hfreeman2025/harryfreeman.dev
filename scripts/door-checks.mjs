// The door's browser checks, run by e2e.mjs in each browser: a fresh visit lands outside the office
// door and Come in walks through one continuous space to the seated desk, its last frame the desk's own
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
      await page.waitForFunction(() => document.getElementById('entrance-plate')?.dataset.placed !== undefined, null, { timeout: 5000 });
      const plate = await page.locator('#entrance-plate').boundingBox();
      expect(plate && plate.width > 120 && plate.y > 0, 'the plate is not on the door');
      expect(await page.locator('#come-in').isVisible(), 'no Come in');
      expect(await page.locator('#skip-in').isVisible(), 'no Skip to the desk');
      await page.waitForTimeout(300);
      await shot(page, 'door');
      const started = Date.now();
      await page.click('#come-in');
      await page.waitForTimeout(1100);
      const mid = await page.evaluate(() => ({ walked: window.deskDebug.walked(), door: window.deskDebug.doorAngle() }));
      expect(mid.walked > 0.15 && mid.walked < 0.85 && mid.door > 1, `mid-walk: ${JSON.stringify(mid)}`);
      await shot(page, 'door-walk');
      await seated(page);
      const took = Date.now() - started;
      expect(took >= 2500 && took < 7000, `coming in took ${took} ms`);
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
      const samples = [];
      for (const [i, ms] of [
        [1, 650],
        [2, 800],
        [3, 800],
      ]) {
        await page.waitForTimeout(ms);
        samples.push(await page.evaluate(() => ({ walked: window.deskDebug.walked(), ...window.deskDebug.sceneSummary() })));
        await shot(page, `walk-${i}`);
      }
      await seated(page);
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
      await direct.close();
      const diff = await compare(page, walked, straight);
      expect(diff.mean < 0.02 && diff.far < 0.03, `the seated frame differs from the desk's own: ${JSON.stringify(diff)}`);
      expect(problems.length === 0, problems.join(' | '));
      return { meanDiff: Number(diff.mean.toFixed(4)), farPixels: Number(diff.far.toFixed(4)) };
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
    await page.waitForTimeout(400);
    expect((await page.locator('#come-in').textContent()) === 'Opening…', 'Come in did not say Opening…');
    expect((await page.locator('#come-in').getAttribute('aria-busy')) === 'true', 'Come in is not marked busy');
    expect((await entrance(page)) === 'door', 'it went in before the desk was there');
    release();
    await seated(page);
  });

  await check('door: Skip and Esc go straight to the desk', desk, async (page) => {
    await page.goto(`${BASE}/?debug`, { waitUntil: 'load' });
    await page.click('#skip-in');
    await page.waitForFunction(() => document.documentElement.dataset.entrance === 'in', null, { timeout: 500 });
    await page.goto(`${BASE}/?debug&door`, { waitUntil: 'load' });
    expect((await entrance(page)) === 'door', 'the door is not shown with ?door');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.documentElement.dataset.entrance === 'in', null, { timeout: 500 });
  });

  await check('door: a reload starts at the door again; Back from the CV restores the desk', desk, async (page) => {
    await page.goto(`${BASE}/?debug`, { waitUntil: 'load' });
    expect((await entrance(page)) === 'door', 'a fresh visit did not start at the door');
    await page.click('#skip-in');
    await page.waitForFunction(() => document.documentElement.dataset.entrance === 'in', null, { timeout: 500 });
    await page.reload({ waitUntil: 'load' });
    expect((await entrance(page)) === 'door', 'a reload did not start at the door');
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

  await check('door: with reduced motion Come in is a cut', { ...desk, reducedMotion: 'reduce' }, async (page) => {
    await page.goto(`${BASE}/?debug`, { waitUntil: 'load' });
    await doorLive(page);
    await page.click('#come-in');
    await page.waitForFunction(() => document.documentElement.dataset.entrance === 'in', null, { timeout: 900 });
  });

  await check(
    'door: without WebGL the door is a poster with the plate as real text and a plain Come in link',
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
      expect(await page.locator('#entrance-plate').isVisible(), 'the plate is not shown');
      expect((await page.locator('#come-in').getAttribute('href')) === '#directory', 'Come in does not lead to the content');
      await shot(page, 'door-poster');
      await page.click('#come-in');
      await page.waitForTimeout(800);
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
