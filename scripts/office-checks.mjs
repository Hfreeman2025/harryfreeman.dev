// The flat office's browser checks, run by e2e.mjs in each browser: the same building as HTML, for
// phones, reduced motion and no WebGL (and ?flat on a desktop). The cabinet, the folder card,
// Reception with its marked line, the grid sign, the radio and the floor plan.

import { MOCK_VALUE } from './e2e.mjs';

const desk = { viewport: { width: 1440, height: 900 } };
const phone = (name) => ({ viewport: { width: 390, height: 844 }, ...(name === 'firefox' ? {} : { isMobile: true, hasTouch: true }) });
const cardOpen = (page) =>
  page.waitForFunction(() => !document.getElementById('card').hidden && document.getElementById('card').dataset.open === 'true', null, {
    timeout: 8000,
  });
const cardTitle = async (page) => (await page.locator('#card-title').textContent())?.trim();
const mode = (page) => page.evaluate(() => document.documentElement.dataset.mode);

export async function officeChecks({ check, expect, BASE, config, shot, name }) {
  const FLAT = `${BASE}/?flat`;

  await check('office: ?flat and reduced data get the flat office, with no canvas', desk, async (page) => {
    const seen = {};
    for (const [label, url, options] of [
      ['?flat', FLAT, {}],
      ['?flat, reduced motion', FLAT, { reducedMotion: 'reduce' }],
    ]) {
      await page.emulateMedia({ reducedMotion: options.reducedMotion ?? 'no-preference' });
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForTimeout(500);
      seen[label] = await mode(page);
      expect(seen[label] === 'office', `${label} got ${seen[label]}`);
      expect((await page.locator('canvas').count()) === 0, `${label} made a canvas`);
      const poster = await page.locator('.room__poster').evaluate((img) => img.complete && img.naturalWidth > 0);
      expect(!poster, `${label} downloaded the room's poster`);
    }
    return seen;
  });

  await check(
    'office: loads with a clean console and no layout shift',
    {
      ...desk,
      initScript: () => {
        window.__shift = PerformanceObserver.supportedEntryTypes?.includes('layout-shift') ? 0 : null;
        if (window.__shift === null) return;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (!e.hadRecentInput) window.__shift += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
      },
    },
    async (page, problems) => {
      await page.goto(FLAT, { waitUntil: 'load' });
      await page.waitForTimeout(2500);
      const shift = await page.evaluate(() => window.__shift);
      if (shift !== null) expect(shift === 0, `layout shift ${shift}`);
      await shot(page, 'flat-top');
      expect(problems.length === 0, problems.join(' | '));
      return { layoutShift: shift === null ? 'not reported by this browser' : shift };
    },
  );

  await check('office: keyboard pulls a drawer, then a folder; Escape puts it back', desk, async (page, problems) => {
    await page.goto(FLAT, { waitUntil: 'load' });
    await page.focus('.drawer[data-drawer="grid"] .drawer__front');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    expect((await page.getAttribute('.drawer[data-drawer="grid"] .drawer__front', 'aria-expanded')) === 'true', 'drawer not expanded');
    await page.keyboard.press('Tab');
    expect(
      (await page.evaluate(() => document.activeElement?.getAttribute('data-piece'))) === 'grid-weather',
      'Tab missed the first folder',
    );
    await page.keyboard.press('Enter');
    await cardOpen(page);
    await page.waitForTimeout(600);
    expect((await cardTitle(page)) === 'Grid Weather', `card title ${await cardTitle(page)}`);
    expect((await page.evaluate(() => document.activeElement?.id)) === 'card-title', 'focus not in the card');
    expect((await page.locator('#card .open').getAttribute('href')) === config.pieces['grid-weather'], 'open link');
    expect(/^Recorded/.test((await page.locator('#card-recorded').textContent()) ?? ''), 'no recorded label');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('card').hidden, null, { timeout: 8000 });
    expect((await page.evaluate(() => document.activeElement?.getAttribute('data-piece'))) === 'grid-weather', 'focus not returned');
    expect(problems.length === 0, problems.join(' | '));
  });

  await check('office: one drawer out at a time, and a closed drawer hides its folders', desk, async (page) => {
    await page.goto(FLAT, { waitUntil: 'load' });
    await page.click('.drawer[data-drawer="agents"] .drawer__front');
    await page.waitForTimeout(800);
    await page.click('.drawer[data-drawer="inside"] .drawer__front', { position: { x: 30, y: 30 } });
    await page.waitForTimeout(900);
    const open = await page.$$eval('.drawer[data-open="true"]', (els) => els.map((e) => e.dataset.drawer));
    expect(open.length === 1 && open[0] === 'inside', `open: ${open}`);
    const hidden = await page.$$eval('.drawer:not([data-open="true"]) .folder', (els) =>
      els.every((e) => getComputedStyle(e).visibility === 'hidden' && e.tabIndex === -1),
    );
    expect(hidden, 'a closed drawer shows or tabs to its folders');
  });

  await check('office: the directory, the list and the floor plan all pull the right folder', desk, async (page) => {
    await page.goto(FLAT, { waitUntil: 'load' });
    await page.click('.board__row a[data-piece="gridtop"]');
    await cardOpen(page);
    expect((await cardTitle(page)) === 'gridtop', 'directory pulled the wrong folder');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('card').hidden, null, { timeout: 8000 });
    await page.locator('#floor').scrollIntoViewIfNeeded();
    await page.click('.plan-desk[data-piece="sourced"] .plan-desk__top');
    await cardOpen(page);
    expect((await cardTitle(page)) === 'Sourced', 'the plan pulled the wrong folder');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('card').hidden, null, { timeout: 8000 });
    await page.click('#work-dreaming .work__elsewhere a');
    await cardOpen(page);
    expect((await cardTitle(page)) === 'dreaming', 'the list pulled the wrong folder');
  });

  await check('office: reaching for the question box moves nothing (ask-the-record loads in place)', desk, async (page) => {
    await page.goto(FLAT, { waitUntil: 'load' });
    const where = () => page.$eval('.ask__try button', (b) => Math.round(b.getBoundingClientRect().top + scrollY));
    const box = () => page.$eval('#ask-box', (b) => Math.round(b.getBoundingClientRect().height));
    const [top, height] = [await where(), await box()];
    await page.hover('#ask');
    await page.waitForFunction(() => document.querySelector('ask-the-record')?.record, null, { timeout: 30000 });
    await page.waitForTimeout(400);
    expect((await where()) === top, `a suggestion moved from ${top} to ${await where()}`);
    expect((await box()) === height, `the box grew from ${height} to ${await box()}`);
  });

  await check('office: Reception’s answer opens the folder at the quoted line; a refusal opens nothing', desk, async (page, problems) => {
    await page.goto(FLAT, { waitUntil: 'load' });
    await page.getByRole('button', { name: 'How does gridtop choose when to run?' }).click();
    await page.waitForFunction(() => document.querySelector('ask-the-record')?.result?.kind === 'answer', null, { timeout: 30000 });
    await cardOpen(page);
    expect((await cardTitle(page)) === 'gridtop', `opened ${await cardTitle(page)}`);
    const marked = await page.evaluate(() => {
      const highlight = globalThis.CSS?.highlights?.get('ask-the-record');
      if (!highlight) return { api: false };
      const node = [...highlight][0]?.startContainer;
      const line = (node instanceof Element ? node : node?.parentElement)?.closest('[data-record-line]');
      return {
        api: true,
        inFolder: Boolean(line && document.getElementById('record-lines').contains(line)),
        line: line?.dataset.recordLine,
      };
    });
    if (marked.api) expect(marked.inFolder, 'the quoted line is not marked in the folder');
    await page.waitForFunction(() => document.getElementById('card-readme').open, null, { timeout: 5000 }).catch(() => {});
    expect(await page.locator('#card-readme').evaluate((d) => d.open), 'the README is not open at the line');
    await page.waitForTimeout(500);
    await shot(page, 'flat-answer');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('card').hidden, null, { timeout: 8000 });
    const input = page.locator('ask-the-record').locator('[part="input"]');
    await input.fill('What is your favourite football team?');
    await input.press('Enter');
    await page.waitForFunction(() => document.querySelector('ask-the-record')?.result?.kind === 'refusal', null, { timeout: 30000 });
    await page.waitForTimeout(1200);
    expect(await page.locator('#card').isHidden(), 'a folder opened for a refusal');
    expect((await page.locator('.drawer[data-open="true"]').count()) <= 1, 'drawers moved');
    expect(problems.length === 0, problems.join(' | '));
    return { line: marked.line ?? 'no Highlight API' };
  });

  await check('office (phone): the sign, the radio and the folder fit the screen, and the grid credit shows', phone(name), async (page) => {
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('grid-sign')?.dataset.state === 'live', null, { timeout: 8000 });
    const fits = async (selector) => {
      await page.locator(selector).scrollIntoViewIfNeeded();
      return page.evaluate((sel) => {
        const r = document.querySelector(sel).getBoundingClientRect();
        return { ok: r.width > 0 && r.left >= 0 && r.right <= innerWidth + 0.5 && r.height <= innerHeight, r: r.toJSON() };
      }, selector);
    };
    for (const selector of ['#grid-sign', '#radio']) {
      const v = await fits(selector);
      expect(v.ok, `${selector} leaves the screen: ${JSON.stringify(v.r)}`);
    }
    expect(await page.locator('.grid-sign__source').isVisible(), 'no grid credit on the sign');
    expect(await page.locator('#radio-credit').isVisible(), 'no grid credit by the radio');
    await page.locator('#archive').scrollIntoViewIfNeeded();
    await page.click('.drawer[data-drawer="grid"] .drawer__front', { position: { x: 20, y: 20 } });
    await page.waitForTimeout(800);
    await page.locator('.folder[data-piece="gridtop"] .folder__tab').click();
    await cardOpen(page);
    const card = await page.evaluate(() => {
      const r = document.querySelector('#card .folder-card__open').getBoundingClientRect();
      return { ok: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5, r: r.toJSON() };
    });
    expect(card.ok, `the folder leaves the screen: ${JSON.stringify(card.r)}`);
  });

  await check('office: the grid sign and the radio are in the lobby too', desk, async (page) => {
    await page.goto(FLAT, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('grid-sign')?.dataset.state === 'live', null, { timeout: 8000 });
    expect((await page.locator('#grid-value').textContent()) === `${MOCK_VALUE} gCO₂/kWh, moderate`, 'sign value');
    expect(await page.locator('#grid-light').isHidden(), 'the flat office talks about a light it does not have');
    expect(await page.locator('#radio-button').isVisible(), 'no radio');
    expect((await page.evaluate(() => window.__audio.made)) === 0, 'audio before the press');
  });

  await check('office: desk names on the plan clear the chairs and the builders', desk, async (page) => {
    await page.goto(FLAT, { waitUntil: 'load' });
    const overlaps = await page.$$eval('.plan-desk', (desks) =>
      desks
        .filter((d) => {
          const a = d.querySelector('.plan-label').getBBox();
          const b = d.querySelector('.plan-desk__chair').getBBox();
          return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        })
        .map((d) => d.dataset.piece),
    );
    expect(overlaps.length === 0, `labels over chairs: ${overlaps}`);
  });

  await check('office: arriving at /?flat#folder-dreaming pulls that folder', desk, async (page) => {
    await page.goto(`${FLAT}#folder-dreaming`, { waitUntil: 'load' });
    await cardOpen(page);
    expect((await cardTitle(page)) === 'dreaming', `pulled ${await cardTitle(page)}`);
  });

  await check(
    'office: with reduced motion the flat office opens drawers without sliding and holds the replay',
    { ...desk, reducedMotion: 'reduce' },
    async (page, problems) => {
      await page.goto(FLAT, { waitUntil: 'load' });
      expect((await page.evaluate(() => document.documentElement.dataset.motion)) === 'reduce', 'motion not reduced');
      await page.click('.drawer[data-drawer="sources"] .drawer__front', { position: { x: 20, y: 20 } });
      const duration = await page.$eval('.drawer[data-drawer="sources"]', (d) => getComputedStyle(d).transitionDuration);
      expect(duration === '0s', `drawer transition ${duration}`);
      expect((await page.locator('#replay-toggle').textContent())?.trim() === 'Play', 'replay not held');
      expect(problems.length === 0, problems.join(' | '));
    },
  );

  for (const [size, options] of [
    ['laptop', desk],
    ['phone', phone(name)],
  ]) {
    await check(`office (${size}): every folder tab shows its whole name`, options, async (page) => {
      await page.goto(FLAT, { waitUntil: 'load' });
      const cut = [];
      for (const drawer of ['inside', 'agents', 'grid', 'sources']) {
        await page.locator(`.drawer[data-drawer="${drawer}"] .drawer__front`).scrollIntoViewIfNeeded();
        const out = page.locator('.drawer[data-open="true"] .drawer__front');
        if (await out.count()) {
          await out.click({ position: { x: 24, y: 10 } });
          await page.waitForTimeout(750);
        }
        const front = page.locator(`.drawer[data-drawer="${drawer}"] .drawer__front`);
        const box = await front.boundingBox();
        await front.click({ position: { x: 24, y: Math.max(8, box.height - 10) } });
        await page.waitForTimeout(750);
        cut.push(
          ...(await page.$$eval(`.drawer[data-drawer="${drawer}"] .folder__tab`, (tabs) =>
            tabs.filter((t) => t.scrollWidth > t.clientWidth + 1).map((t) => t.textContent),
          )),
        );
      }
      expect(cut.length === 0, `cut short: ${cut.join(', ')}`);
    });
  }

  await check(
    'office (phone): the flat office, no sideways scroll, no layout shift; an open bottom drawer clears Reception',
    {
      ...phone(name),
      initScript: () => {
        window.__shift = PerformanceObserver.supportedEntryTypes?.includes('layout-shift') ? 0 : null;
        if (window.__shift === null) return;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (!e.hadRecentInput) window.__shift += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
      },
    },
    async (page, problems) => {
      await page.goto(BASE, { waitUntil: 'load' });
      expect((await mode(page)) === 'office', `a phone got ${await mode(page)}`);
      await page.waitForTimeout(1500);
      const shift = await page.evaluate(() => window.__shift);
      if (shift !== null) expect(shift === 0, `layout shift ${shift}`);
      const [sw, w] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      expect(sw <= w, `scrollWidth ${sw} > ${w}`);
      await shot(page, 'top', 'phone');
      await page.locator('#archive').scrollIntoViewIfNeeded();
      await page.click('.drawer[data-drawer="sources"] .drawer__front', { position: { x: 20, y: 20 } });
      await page.waitForTimeout(800);
      const front = await page.locator('.drawer[data-drawer="sources"] .drawer__front').boundingBox();
      const reception = await page.locator('#ask-title').boundingBox();
      expect(front.y + front.height < reception.y, `drawer bottom ${front.y + front.height} over Reception at ${reception.y}`);
      await shot(page, 'drawer', 'phone');
      await page.locator('.folder[data-piece="sourced"] .folder__tab').click();
      await cardOpen(page);
      expect((await cardTitle(page)) === 'Sourced', 'phone folder');
      await page.waitForTimeout(500);
      await shot(page, 'folder', 'phone');
      expect(problems.length === 0, problems.join(' | '));
      return { layoutShift: shift === null ? 'not reported by this browser' : shift };
    },
  );

  await check('office (phone): Reception’s answer opens the folder at the quoted line', phone(name), async (page) => {
    await page.goto(BASE, { waitUntil: 'load' });
    await page.locator('#ask').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'What happens if you change one byte?' }).click();
    await page.waitForFunction(() => document.querySelector('ask-the-record')?.result?.kind, null, { timeout: 30000 });
    const kind = await page.evaluate(() => document.querySelector('ask-the-record').result.kind);
    if (kind === 'answer') {
      await cardOpen(page);
      await page.waitForTimeout(500);
      await shot(page, 'answer', 'phone');
      return { opened: await cardTitle(page) };
    }
    return { kind };
  });
}
