// The desk's browser checks (branch design/desk-miniature), run by e2e.mjs in each browser: the desk
// at real scale with the grid's credit on its note, the swoop down into the low office view and back,
// the index box and a card pull landing on the builder's monitor, the name tags and the painted zone
// names, the notebook's rounds, typing at Reception and its printout (an answer, and a refusal), and
// reduced motion.

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
const hit = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const angle = (page) => page.evaluate(() => window.deskDebug.cameraAngle());

/** Goes to Reception from the desk, with the record loaded and its input ready. */
async function toReception(page) {
  await page.focus('[data-action="reception"][data-at="door"]');
  await page.keyboard.press('Enter');
  await waitStation(page, 'reception');
  await page.waitForFunction(() => customElements.get('ask-the-record') && document.querySelector('ask-the-record')?.record, null, {
    timeout: 30000,
  });
  return page.locator('ask-the-record').locator('[part="input"]');
}

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
      const strength = await page.evaluate(() => window.deskDebug.strength());
      expect(Math.abs(strength - 0.8) < 0.02, `tilt-shift at ${strength}`);
      // The grid's credit is a slip stuck under the sticky note, not a box out on the desk.
      const { credit, note } = await page.evaluate(() => ({
        credit: document.getElementById('desk-credit').getBoundingClientRect().toJSON(),
        note: document.querySelector('[data-desk-target="sign"]').getBoundingClientRect().toJSON(),
      }));
      expect(credit.width > 0 && !(await page.locator('#desk-credit').isHidden()), 'the credit is not shown');
      expect(
        credit.y < note.y + note.height + 4 &&
          credit.y > note.y + note.height * 0.4 &&
          credit.x < note.x + note.width &&
          credit.x + credit.width > note.x,
        `the credit is not on the note: ${JSON.stringify({ credit, note })}`,
      );
      expect((await page.locator('#desk-credit').textContent()).includes('© NESO, CC BY 4.0'), 'the credit lost its words');
      const shift = await page.evaluate(() => window.__shift);
      if (shift !== null) expect(shift === 0, `layout shift ${shift}`);
      await shot(page, 'desk-door');
      expect(problems.length === 0, problems.join(' | '));
      return { layoutShift: shift ?? 'not reported by this browser' };
    },
  );

  await check(
    'desk: the dive swoops down from high over the desk to a low view across the office, pulling focus sharp; Esc, the button and the scroll wheel rise back out',
    desk,
    async (page, problems) => {
      await live(page, DESK());
      const high = await angle(page);
      await page.click('[data-action="office"][data-at="door"]');
      await page.waitForTimeout(650);
      const mid = await angle(page);
      await waitStation(page, 'office');
      await page.waitForFunction(() => window.deskDebug.strength() < 0.02, null, { timeout: 5000 });
      const low = await angle(page);
      expect(high.elevation > 45, `the desk is seen from ${high.elevation.toFixed(0)}°`);
      expect(low.elevation < 30, `the office lands at ${low.elevation.toFixed(0)}°, not low`);
      // It levels out late: still well above the landing part-way down.
      expect(mid.elevation > low.elevation + 8, `mid-swoop ${mid.elevation.toFixed(0)}°, landing ${low.elevation.toFixed(0)}°`);
      await page.locator('[data-action^="desk:"][data-at="office"]').first().waitFor({ state: 'visible', timeout: 5000 });
      expect((await page.locator('#room-back').textContent())?.trim() === 'Rise to the desk', 'no way back up');
      await shot(page, 'desk-office');
      await page.keyboard.press('Escape');
      await waitStation(page, 'door');
      await page.waitForFunction(() => window.deskDebug.strength() > 0.78, null, { timeout: 5000 });
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
      // It lands on the builder's monitor: the screen the subject, clear of the card, the builder beside it.
      const framed = await page.evaluate(() => ({
        ...window.deskDebug.deskShot(),
        card: document.getElementById('card').getBoundingClientRect().toJSON(),
      }));
      expect(framed.screen.width > 70 && framed.screen.width < 260, `the screen is ${framed.screen.width.toFixed(0)}px wide`);
      expect(framed.screen.x > 0 && framed.screen.x + framed.screen.width < framed.card.x, 'the screen is under the card');
      expect(framed.builder.x >= framed.screen.x + framed.screen.width - 6, 'the builder stands in front of the screen');
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
      const { tags, labels, monitors, zones, stage } = await page.evaluate(() => ({
        tags: [...document.querySelectorAll('.dtag--name')]
          .filter((el) => !el.hidden)
          .map((el) => ({ piece: el.dataset.piece, ...el.getBoundingClientRect().toJSON() })),
        labels: [...document.querySelectorAll('.desk__labels > [data-at="office"]')]
          .filter((el) => !el.hidden && !el.classList.contains('obj'))
          .map((el) => ({ name: el.textContent.trim(), ...el.getBoundingClientRect().toJSON() })),
        monitors: window.deskDebug.monitorRects(),
        zones: window.deskDebug.zoneRects(),
        stage: document.querySelector('.room__stage').getBoundingClientRect().toJSON(),
      }));
      expect(tags.length === 10, `${tags.length} name tags`);
      for (const t of tags) {
        for (const m of monitors) expect(!hit(t, m), `${t.piece}’s tag covers a screen`);
        for (const u of tags) if (u !== t) expect(!hit(t, u), `${t.piece}’s tag covers ${u.piece}’s`);
      }
      // Every screen faces the low camera, in view and big enough to see its loop.
      for (const m of monitors)
        expect(
          m.x >= stage.x && m.x + m.width <= stage.x + stage.width && m.width > 25,
          `a screen is out of view or edge-on: ${JSON.stringify(m)}`,
        );
      // The painted zone names are all on screen and no tag sits on one.
      for (const z of zones) {
        expect(
          z.x >= stage.x && z.x + z.width <= stage.x + stage.width && z.y + z.height <= stage.y + stage.height,
          `${z.text} is off screen`,
        );
        for (const l of labels) expect(!hit(z, l), `the ${l.name} tag covers ${z.text}`);
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
    await page.waitForTimeout(900);
    await shot(page, 'desk-notebook');
    return { replayAt: Number(at.t.toFixed(1)) };
  });

  await check(
    'desk: typing at Reception presses the keyboard, and the answer prints with its quotes before the builder’s desk opens at the quoted line',
    desk,
    async (page, problems) => {
      await live(page, DESK());
      const input = await toReception(page);
      const before = await page.evaluate(() => window.deskDebug.presses());
      await input.click();
      await page.keyboard.type('gridtop', { delay: 40 });
      const pressed = (await page.evaluate(() => window.deskDebug.presses())) - before;
      expect(pressed === 7, `${pressed} keys pressed for 7 typed`);
      expect((await input.inputValue()) === 'gridtop', 'the typing did not reach the real input');
      await input.fill('');
      await page.getByRole('button', { name: 'How does gridtop choose when to run?' }).click();
      await page.waitForFunction(() => document.querySelector('ask-the-record')?.result?.kind === 'answer', null, { timeout: 30000 });
      await page.locator('#printout').waitFor({ state: 'visible', timeout: 5000 });
      const slip = await page.evaluate(() => ({
        kind: document.getElementById('printout-paper').dataset.kind,
        text: document.getElementById('printout-paper').textContent,
        quotes: document.querySelectorAll('#printout .printout__quote').length,
        first: document.querySelector('ask-the-record').result.quotes[0].fact.text,
      }));
      expect(slip.kind === 'answer', `the slip printed ${slip.kind}`);
      expect(slip.quotes > 0 && slip.text.includes(slip.first.slice(0, 40)), 'the slip does not carry the quotes');
      expect(slip.text.includes('How does gridtop choose when to run?'), 'the slip does not carry the question');
      expect(
        (await page.evaluate(() => window.deskDebug.standing()?.piece)) === 'gridtop',
        'the builder whose README answered did not stand',
      );
      await page.waitForTimeout(1300);
      await shot(page, 'desk-printout');
      await cardOpen(page);
      await waitStation(page, 'desk:gridtop');
      expect(await page.locator('#printout').isHidden(), 'the slip stayed up at the desk');
      const marked = await page.evaluate(() => {
        const highlight = globalThis.CSS?.highlights?.get('ask-the-record');
        if (!highlight) return { api: false };
        const first = [...highlight][0];
        const node = first?.startContainer;
        const line = (node instanceof Element ? node : node?.parentElement)?.closest('[data-record-line]');
        return { api: true, inFolder: Boolean(line && document.getElementById('record-lines').contains(line)) };
      });
      if (marked.api) expect(marked.inFolder, 'the quoted line is not marked in the card');
      expect(problems.length === 0, problems.join(' | '));
      return { slip: slip.kind, marked: marked.api ? 'marked' : 'no Highlight API' };
    },
  );

  await check('desk: a refusal at Reception prints a refusal and moves nothing', desk, async (page) => {
    await live(page, DESK());
    const input = await toReception(page);
    await input.fill('What is your favourite football team?');
    await input.press('Enter');
    await page.waitForFunction(() => document.querySelector('ask-the-record')?.result?.kind === 'refusal', null, { timeout: 30000 });
    await page.locator('#printout').waitFor({ state: 'visible', timeout: 5000 });
    const text = await page.locator('#printout-paper').textContent();
    expect((await page.locator('#printout-paper').getAttribute('data-kind')) === 'refusal', 'the slip is not a refusal');
    expect(text.includes('No answer.') && text.includes('What is your favourite football team?'), `the slip: ${text}`);
    await page.waitForTimeout(1500);
    expect((await station(page)) === 'reception', `moved to ${await station(page)}`);
    expect(await page.locator('#card').isHidden(), 'a card opened for a refusal');
    expect((await page.evaluate(() => window.deskDebug.standing())) === null, 'someone stood for a refusal');
    await shot(page, 'desk-refusal');
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
