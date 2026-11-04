// The office's browser checks, run by e2e.mjs in each browser: the lobby, the cabinet, the folder,
// Reception, the floor plan and the doors between the office and the studio.

const desk = { viewport: { width: 1440, height: 900 } };
const phone = (name) => ({ viewport: { width: 390, height: 844 }, ...(name === 'firefox' ? {} : { isMobile: true, hasTouch: true }) });
const cardOpen = (page) =>
  page.waitForFunction(() => !document.getElementById('card').hidden && document.getElementById('card').dataset.open === 'true', null, {
    timeout: 8000,
  });
const cardTitle = async (page) => (await page.locator('#card-title').textContent())?.trim();

export async function officeChecks({ check, expect, BASE, config, name }) {
  const ids = Object.keys(config.pieces);

  await check('office: the HTML carries name, role, line, the directory and every folder before any script', {}, async () => {
    const html = await (await fetch(`${BASE}/`)).text();
    for (const text of ['Harry Freeman', 'Head of AI', 'coding agents built these ten tools', 'href="/cv.html"', 'href="/studio.html"'])
      expect(html.includes(text), `missing ${text}`);
    expect((html.match(/class="drawer__front" aria-expanded="false"/g) ?? []).length === 4, 'not four drawers');
    for (const id of ids) {
      expect(html.includes(`href="#work-${id}" data-piece="${id}"`), `no directory link for ${id}`);
      expect(html.includes(`class="folder" href="#work-${id}"`), `no folder for ${id}`);
      expect(html.includes(`href="${config.pieces[id]}"`), `no open link for ${id}`);
    }
  });

  await check(
    'office: loads with a clean console and no layout shift',
    {
      ...desk,
      initScript: () => {
        window.__shift = 0;
        // Only Chromium reports layout shifts; asking elsewhere just logs a warning.
        if (!PerformanceObserver.supportedEntryTypes?.includes('layout-shift')) {
          window.__shift = null;
          return;
        }
        try {
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) if (!e.hadRecentInput) window.__shift += e.value;
          }).observe({ type: 'layout-shift', buffered: true });
        } catch {
          window.__shift = null; // This browser does not report layout shifts.
        }
      },
    },
    async (page, problems) => {
      await page.goto(BASE, { waitUntil: 'load' });
      await page.waitForTimeout(2500);
      const shift = await page.evaluate(() => window.__shift);
      if (shift !== null) expect(shift < 0.01, `layout shift ${shift}`);
      expect(problems.length === 0, problems.join(' | '));
      return { layoutShift: shift === null ? 'not reported by this browser' : Number(shift.toFixed(4)) };
    },
  );

  await check('office: keyboard pulls a drawer, then a folder; Escape puts it back', desk, async (page, problems) => {
    await page.goto(BASE, { waitUntil: 'load' });
    await page.focus('.drawer[data-drawer="grid"] .drawer__front');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    expect((await page.getAttribute('.drawer[data-drawer="grid"] .drawer__front', 'aria-expanded')) === 'true', 'drawer not expanded');
    expect(!(await page.evaluate(() => document.getElementById('tray-grid').inert)), 'tray still inert');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-piece'));
    expect(focused === 'grid-weather', `Tab went to ${focused}`);
    await page.keyboard.press('Enter');
    await cardOpen(page);
    await page.waitForTimeout(600);
    expect((await cardTitle(page)) === 'Grid Weather', `card title ${await cardTitle(page)}`);
    expect((await page.evaluate(() => document.activeElement?.id)) === 'card-title', 'focus not in the card');
    expect((await page.locator('#card .open').getAttribute('href')) === config.pieces['grid-weather'], 'open link');
    expect(/^Recorded/.test((await page.locator('#card-recorded').textContent()) ?? ''), 'no recorded label');
    expect(
      (await page.locator('#card .work__elsewhere a').getAttribute('href')) === '/studio.html#desk-grid-weather',
      'no way to its desk',
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('card').hidden, null, { timeout: 8000 });
    expect((await page.evaluate(() => document.activeElement?.getAttribute('data-piece'))) === 'grid-weather', 'focus not returned');
    expect(problems.length === 0, problems.join(' | '));
  });

  await check('office: one drawer out at a time, and a closed drawer hides its folders', desk, async (page) => {
    await page.goto(BASE, { waitUntil: 'load' });
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

  await check('office: the directory and the floor plan both pull the right folder', desk, async (page) => {
    await page.goto(BASE, { waitUntil: 'load' });
    await page.click('.board__row a[data-piece="gridtop"]');
    await cardOpen(page);
    expect((await cardTitle(page)) === 'gridtop', 'directory pulled the wrong folder');
    expect((await page.getAttribute('.drawer[data-drawer="grid"]', 'data-open')) === 'true', 'its drawer is not open');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('card').hidden, null, { timeout: 8000 });
    await page.locator('#floor').scrollIntoViewIfNeeded();
    await page.click('.plan-desk[data-piece="sourced"] .plan-desk__top');
    await cardOpen(page);
    expect((await cardTitle(page)) === 'Sourced', 'the plan pulled the wrong folder');
  });

  for (const [room, path] of [
    ['office', '/'],
    ['studio', '/studio.html'],
  ]) {
    await check(`${room}: reaching for the question box moves nothing (ask-the-record loads in place)`, desk, async (page) => {
      await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
      const where = () => page.$eval('.ask__try button', (b) => Math.round(b.getBoundingClientRect().top + scrollY));
      const box = () => page.$eval('#ask-box', (b) => Math.round(b.getBoundingClientRect().height));
      const [top, height] = [await where(), await box()];
      await page.hover('#ask');
      await page.waitForFunction(() => document.querySelector('ask-the-record')?.record, null, { timeout: 30000 });
      await page.waitForTimeout(400);
      expect((await where()) === top, `a suggestion moved from ${top} to ${await where()}`);
      expect((await box()) === height, `the box grew from ${height} to ${await box()}`);
    });
  }

  await check('office: Reception answers, pulls the drawer and marks the folder', desk, async (page, problems) => {
    await page.goto(BASE, { waitUntil: 'load' });
    await page.getByRole('button', { name: 'How does gridtop choose when to run?' }).click();
    await page.waitForFunction(() => document.querySelector('ask-the-record')?.result?.kind === 'answer', null, { timeout: 30000 });
    await page.waitForTimeout(900);
    expect((await page.getAttribute('.drawer[data-drawer="grid"]', 'data-open')) === 'true', 'drawer not pulled');
    expect((await page.getAttribute('.folder[data-piece="gridtop"]', 'data-answering')) === 'true', 'folder not marked');
    expect((await page.getAttribute('.plan-desk[data-piece="gridtop"]', 'data-answering')) === 'true', 'desk not marked');
    expect(problems.length === 0, problems.join(' | '));
  });

  for (const [size, options] of [
    ['laptop', desk],
    ['phone', phone(name)],
  ]) {
    await check(`office (${size}): every folder tab shows its whole name`, options, async (page) => {
      await page.goto(BASE, { waitUntil: 'load' });
      const cut = [];
      for (const drawer of ['inside', 'agents', 'grid', 'sources']) {
        await page.locator(`.drawer[data-drawer="${drawer}"] .drawer__front`).scrollIntoViewIfNeeded();
        // Push back the drawer that is out, as a person would when it is in the way.
        const out = page.locator('.drawer[data-open="true"] .drawer__front');
        if (await out.count()) {
          await out.click({ position: { x: 24, y: 10 } });
          await page.waitForTimeout(750);
        }
        const front = page.locator(`.drawer[data-drawer="${drawer}"] .drawer__front`);
        const box = await front.boundingBox();
        // The lower edge of a front is never under the drawer pulled out above it.
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

  await check('office: desk names on the plan clear the chairs and the builders', desk, async (page) => {
    await page.goto(BASE, { waitUntil: 'load' });
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

  await check('office: the studio is a room off the lobby, with a way back to the archive', desk, async (page) => {
    await page.goto(BASE, { waitUntil: 'load' });
    await page.click('.floor__enter a');
    await page.waitForURL('**/studio.html');
    await page.click('.titleblock__back a');
    await page.waitForURL((url) => url.pathname === '/' && url.hash === '#archive');
  });

  await check('office: arriving at /#folder-dreaming pulls that folder', desk, async (page) => {
    await page.goto(`${BASE}/#folder-dreaming`, { waitUntil: 'load' });
    await cardOpen(page);
    expect((await cardTitle(page)) === 'dreaming', `pulled ${await cardTitle(page)}`);
  });

  await check(
    'office: reduced motion opens drawers without sliding and holds the replay at the end',
    { ...desk, reducedMotion: 'reduce' },
    async (page, problems) => {
      await page.goto(BASE, { waitUntil: 'load' });
      expect((await page.evaluate(() => document.documentElement.dataset.motion)) === 'reduce', 'motion not reduced');
      await page.click('.drawer[data-drawer="sources"] .drawer__front', { position: { x: 20, y: 20 } });
      const duration = await page.$eval('.drawer[data-drawer="sources"]', (d) => getComputedStyle(d).transitionDuration);
      expect(duration === '0s', `drawer transition ${duration}`);
      expect((await page.locator('#replay-toggle').textContent())?.trim() === 'Play', 'replay not held');
      expect(problems.length === 0, problems.join(' | '));
    },
  );

  await check('office (phone): no sideways scroll, and an open bottom drawer clears Reception', phone(name), async (page, problems) => {
    await page.goto(BASE, { waitUntil: 'load' });
    const [sw, w] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(sw <= w, `scrollWidth ${sw} > ${w}`);
    await page.locator('#archive').scrollIntoViewIfNeeded();
    await page.click('.drawer[data-drawer="sources"] .drawer__front', { position: { x: 20, y: 20 } });
    await page.waitForTimeout(800);
    const front = await page.locator('.drawer[data-drawer="sources"] .drawer__front').boundingBox();
    const reception = await page.locator('#ask-title').boundingBox();
    expect(front.y + front.height < reception.y, `drawer bottom ${front.y + front.height} over Reception at ${reception.y}`);
    const gap = reception.y - (front.y + front.height);
    await page.locator('.folder[data-piece="sourced"] .folder__tab').click();
    await cardOpen(page);
    expect((await cardTitle(page)) === 'Sourced', 'phone folder');
    expect(problems.length === 0, problems.join(' | '));
    return { gapBelowOpenDrawerPx: Math.round(gap) };
  });
}
