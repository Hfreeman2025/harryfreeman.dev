// The desk's browser checks (branch design/desk-miniature), run by e2e.mjs in each browser: the desk
// at real scale, the dive into the office and back, the index box and a card pull, the name tags,
// the notebook's rounds, and reduced motion.

const desk = { viewport: { width: 1440, height: 900 } };
const station = (page) => page.evaluate(() => window.deskDebug?.station());
const waitStation = (page, s, timeout = 9000) =>
  page.waitForFunction(
    (want) =>
      window.deskDebug?.station() === want && document.documentElement.dataset.station === (want.startsWith('desk:') ? 'desk' : want),
    s,
    { timeout },
  );
const active = (page) => page.evaluate(() => document.activeElement?.dataset?.action ?? document.activeElement?.id ?? null);
const cardOpen = (page) =>
  page.waitForFunction(() => !document.getElementById('card').hidden && document.getElementById('card').dataset.open === 'true', null, {
    timeout: 12000,
  });
const cardTitle = async (page) => (await page.locator('#card-title').textContent())?.trim();

async function live(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.documentElement.dataset.stage === 'live' || document.documentElement.dataset.mode === 'office',
    null,
    { timeout: 30000 },
  );
  if ((await page.evaluate(() => document.documentElement.dataset.mode)) !== 'room')
    throw new Error(`the desk did not start: ${await page.locator('#room-status').textContent()}`);
  await page.waitForTimeout(500);
}

export async function deskChecks({ check, expect, BASE, shot }) {
  const DESK = (query = '') => `${BASE}/?debug${query ? `&${query}` : ''}`;

  await check('desk: the HTML carries the desk’s objects, the name tags and every card before any script', {}, async () => {
    const html = await (await fetch(`${BASE}/`)).text();
    expect((html.match(/data-desk-target=/g) ?? []).length === 34, `desk targets: ${(html.match(/data-desk-target=/g) ?? []).length}`);
    for (const action of ['office', 'cabinet', 'notebook', 'reception', 'stamp', 'sign'])
      expect(html.includes(`data-action="${action}"`), `no ${action}`);
    expect(html.includes('id="notebook-panel"') && html.includes('id="printout"'), 'no notebook panel or printout');
  });

  await check(
    'desk: opens on the desk at real scale, in full tilt-shift, with a clean console and no layout shift',
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
      await live(page, DESK());
      await page.waitForTimeout(1500);
      expect((await station(page)) === 'door', `station ${await station(page)}`);
      expect((await page.evaluate(() => window.deskDebug.strength())) > 0.95, 'not in tilt-shift');
      const shift = await page.evaluate(() => window.__shift);
      if (shift !== null) expect(shift === 0, `layout shift ${shift}`);
      await shot(page, 'desk-door');
      expect(problems.length === 0, problems.join(' | '));
      return { layoutShift: shift ?? 'not reported by this browser' };
    },
  );

  await check(
    'desk: the dive into the office pulls focus sharp; Esc, the button and the scroll wheel rise back out',
    desk,
    async (page, problems) => {
      await live(page, DESK());
      await page.click('[data-action="office"][data-at="door"]');
      await waitStation(page, 'office');
      await page.waitForFunction(() => window.deskDebug.strength() < 0.02, null, { timeout: 5000 });
      await page.locator('[data-action^="desk:"][data-at="office"]').first().waitFor({ state: 'visible', timeout: 5000 });
      expect((await page.locator('#room-back').textContent())?.trim() === 'Rise to the desk', 'no way back up');
      await shot(page, 'desk-office');
      await page.keyboard.press('Escape');
      await waitStation(page, 'door');
      await page.waitForFunction(() => window.deskDebug.strength() > 0.95, null, { timeout: 5000 });
      await page.mouse.move(900, 450);
      await page.mouse.wheel(0, 400);
      await waitStation(page, 'office');
      await page.waitForTimeout(1900);
      await page.mouse.wheel(0, -400);
      await waitStation(page, 'door');
      await page.waitForTimeout(1900);
      await page.click('[data-action="office"][data-at="door"]');
      await waitStation(page, 'office');
      await page.waitForTimeout(1900);
      await page.click('#room-back');
      await waitStation(page, 'door');
      expect(problems.length === 0, problems.join(' | '));
    },
  );

  await check(
    'desk: a card pulled from the index box reaches the right desk, its builder stands, and Esc steps back',
    desk,
    async (page, problems) => {
      await live(page, DESK());
      await page.focus('[data-action="cabinet"][data-at="door"]');
      await page.keyboard.press('Enter');
      await waitStation(page, 'cabinet');
      await page.waitForFunction(() => document.activeElement?.dataset.action === 'drawer:inside', null, { timeout: 6000 });
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      expect((await active(page)) === 'drawer:grid', `Tab went to ${await active(page)}`);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.activeElement?.dataset.action === 'folder:grid-weather', null, { timeout: 6000 });
      await page.waitForTimeout(700);
      await shot(page, 'desk-cabinet');
      await page.keyboard.press('Tab');
      expect((await active(page)) === 'folder:gridtop', `Tab went to ${await active(page)}`);
      await page.keyboard.press('Enter');
      await cardOpen(page);
      await waitStation(page, 'desk:gridtop');
      expect((await cardTitle(page)) === 'gridtop', `card ${await cardTitle(page)}`);
      expect((await page.evaluate(() => window.deskDebug.standing()?.piece)) === 'gridtop', 'the builder did not stand');
      expect((await page.locator('#card .folder-card__video').getAttribute('src'))?.includes('/loops/gridtop.'), 'the card has no loop');
      expect((await page.locator('#card .open').count()) === 1, 'no Open link on the card');
      await page.waitForTimeout(500);
      await shot(page, 'desk-card');
      await page.keyboard.press('Escape');
      await waitStation(page, 'cabinet');
      await page.waitForFunction(() => document.activeElement?.dataset.action === 'folder:gridtop', null, { timeout: 6000 });
      expect((await page.evaluate(() => window.deskDebug.standing())) === null, 'still standing');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.activeElement?.dataset.action === 'drawer:grid', null, { timeout: 6000 });
      await page.keyboard.press('Escape');
      await waitStation(page, 'door');
      await page.waitForFunction(() => document.activeElement?.dataset.action === 'cabinet', null, { timeout: 6000 });
      expect(problems.length === 0, problems.join(' | '));
    },
  );

  await check(
    'desk: in the office a desk’s name tag reaches its desk, and no name tag covers a screen or another tag',
    desk,
    async (page) => {
      await live(page, DESK());
      await page.click('[data-action="office"][data-at="door"]');
      await waitStation(page, 'office');
      await page.locator('[data-action="desk:sourced"][data-at="office"]').waitFor({ state: 'visible', timeout: 6000 });
      await page.waitForTimeout(400);
      const { tags, monitors } = await page.evaluate(() => ({
        tags: [...document.querySelectorAll('.dtag--name')]
          .filter((el) => !el.hidden)
          .map((el) => ({ piece: el.dataset.piece, ...el.getBoundingClientRect().toJSON() })),
        monitors: window.deskDebug.monitorRects(),
      }));
      const hit = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(tags.length === 10, `${tags.length} name tags`);
      for (const t of tags) {
        for (const m of monitors) expect(!hit(t, m), `${t.piece}’s tag covers a screen`);
        for (const u of tags) if (u !== t) expect(!hit(t, u), `${t.piece}’s tag covers ${u.piece}’s`);
      }
      await page.click('[data-action="desk:sourced"][data-at="office"]');
      await cardOpen(page);
      expect((await cardTitle(page)) === 'Sourced', `card ${await cardTitle(page)}`);
      expect((await page.locator('#card-back').textContent())?.trim() === 'Back to the office', 'the way back does not say the office');
      await page.keyboard.press('Escape');
      await waitStation(page, 'office');
      return { tags: tags.length };
    },
  );

  await check('desk: turning the notebook to a round replays that round in the office', desk, async (page) => {
    await live(page, DESK());
    await page.click('[data-action="notebook"][data-at="door"]');
    await waitStation(page, 'notebook');
    await page.click('.desk__rounds [data-round="V3.md"]');
    const at = await page.evaluate(() => ({
      t: window.deskDebug.replayTime(),
      briefs: window.deskDebug.briefAt(),
      round: window.deskDebug.round(),
    }));
    expect(at.round === 'V3.md', `the notebook is on ${at.round}`);
    expect(Math.abs(at.t - (at.briefs['V3.md'] - 0.5)) < 0.6, `replay at ${at.t}, V3 starts ${at.briefs['V3.md']}`);
    expect((await page.locator('#notebook-asks li').count()) === 10, 'not every tool’s V3 ask is listed');
    expect(!(await page.locator('#notebook-asks').textContent()).match(/Simply|employer/i), 'the notebook names the employer');
    await page.waitForTimeout(900);
    await shot(page, 'desk-notebook');
    return { replayAt: Number(at.t.toFixed(1)) };
  });

  await check(
    'desk: with reduced motion the dive is a cut and no one waves',
    { ...desk, reducedMotion: 'reduce' },
    async (page, problems) => {
      await live(page, DESK());
      await page.click('[data-action="office"][data-at="door"]');
      await page.waitForTimeout(150);
      expect((await station(page)) === 'office', 'not there at once');
      expect((await page.evaluate(() => window.deskDebug.strength())) < 0.02, 'focus did not cut to sharp');
      await page.click('[data-action="desk:gridtop"][data-at="office"]');
      await cardOpen(page);
      expect((await page.evaluate(() => window.deskDebug.standing()?.wave)) === false, 'a builder waved');
      expect(problems.length === 0, problems.join(' | '));
    },
  );
}
