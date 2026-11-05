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

/**
 * At a desk: the camera square to the screen, the tool's loop laid exactly over the screen, big enough to
 * read, the Open line under the bezel, and no second copy of the loop in the card.
 */
async function onScreen(page, piece, expect) {
  await page.locator('#desk-screen').waitFor({ state: 'visible', timeout: 5000 });
  const at = await page.evaluate(() => {
    const video = document.getElementById('desk-loop');
    return {
      ...window.deskDebug.deskShot(),
      overlay: document.getElementById('desk-screen').getBoundingClientRect().toJSON(),
      under: document.getElementById('desk-under').getBoundingClientRect().toJSON(),
      card: document.getElementById('card').getBoundingClientRect().toJSON(),
      src: video.currentSrc || video.getAttribute('src') || '',
      poster: video.poster,
      paused: video.paused,
      cardVideo: { src: document.querySelector('#card .folder-card__video')?.getAttribute('src') ?? null },
    };
  });
  const cardVideoShown = await page.locator('#card .folder-card__video').isVisible();
  expect(at.facing < 3, `the camera is ${at.facing.toFixed(1)}° off square to the screen`);
  for (const k of ['x', 'y', 'width', 'height'])
    expect(
      Math.abs(at.overlay[k] - at.screen[k]) < 2,
      `the loop is not on the screen: ${k} ${at.overlay[k].toFixed(1)} vs ${at.screen[k].toFixed(1)}`,
    );
  expect(at.overlay.width >= 360, `the screen is only ${at.overlay.width.toFixed(0)}px wide`);
  expect(at.overlay.x + at.overlay.width <= at.card.x, 'the screen is under the card');
  expect(at.src.includes(`/loops/${piece}.`) && at.poster.includes(`/loops/${piece}.webp`), `the screen plays ${at.src}`);
  expect(
    at.under.y >= at.overlay.y + at.overlay.height && at.under.y - (at.overlay.y + at.overlay.height) < 60,
    'Open is not under the bezel',
  );
  expect(!cardVideoShown && !at.cardVideo.src, 'the card still carries a copy of the loop');
  return at;
}

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

export async function deskChecks({ check, expect, BASE, shot, name }) {
  // Links are in the Tab order everywhere but Safari, where a keyboard reaches them with Option+Tab.
  const linkTab = name === 'webkit' ? 'Alt+Tab' : 'Tab';
  const DESK = (query = '') => `${BASE}/?debug${query ? `&${query}` : ''}`;

  await check('desk: the HTML carries the desk’s objects, the name tags and every card before any script', {}, async () => {
    const html = await (await fetch(`${BASE}/`)).text();
    expect((html.match(/data-desk-target=/g) ?? []).length === 37, `desk targets: ${(html.match(/data-desk-target=/g) ?? []).length}`);
    for (const action of ['office', 'cabinet', 'notebook', 'reception', 'stamp', 'sign'])
      expect(html.includes(`data-action="${action}"`), `no ${action}`);
    expect(html.includes('id="notebook-panel"') && html.includes('id="printout"'), 'no notebook panel or printout');
    // Who this is, as real text before any script: the name, the role, the intro and the links.
    expect(html.includes('<h1 class="masthead__name">Harry Freeman</h1>') && html.includes('>Head of AI</p>'), 'no name or role');
    expect(html.includes('class="masthead__line">I run AI strategy'), 'no intro');
    expect(
      /class="masthead__links"><a href="[^"]+">CV<\/a><a href="mailto:[^"]+">Email<\/a><a href="https:[^"]+">LinkedIn<\/a>/.test(html),
      'no CV, Email and LinkedIn',
    );
    expect(!html.includes('class="board'), 'the directory board is still there');
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
      // It leans in square to the builder's monitor, and the tool's loop plays on that screen.
      const loop = await onScreen(page, 'gridtop', expect);
      expect(!loop.paused, 'the loop is not playing on the screen');
      expect((await page.evaluate(() => window.deskDebug.standing()?.piece)) === 'gridtop', 'the builder did not stand');
      // The live tool opens from the screen, by keyboard too: Shift+Tab from the card reaches it.
      expect((await page.locator('#desk-under .open').textContent())?.trim() === 'Open gridtop', 'no Open under the screen');
      expect(await page.locator('#desk-under .open').isVisible(), 'Open under the screen is not visible');
      await page.focus('#card-title');
      await page.keyboard.press('Shift+Tab');
      expect((await page.evaluate(() => document.activeElement?.textContent?.trim())) === 'Open gridtop', 'Shift+Tab did not reach Open');
      await page.focus('#card-title');
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

  await check(
    'desk: the name and role are on the nameplate and the intro and links on the card, as real text; the card’s links and the index reach everything by keyboard',
    desk,
    async (page, problems) => {
      await live(page, DESK());
      await page.waitForFunction(() => document.querySelectorAll('.masthead [data-placed]').length === 2, null, { timeout: 5000 });
      const at = await page.evaluate(() => {
        const rect = (sel) => document.querySelector(sel).getBoundingClientRect().toJSON();
        return {
          faces: window.deskDebug.faces(),
          plate: rect('.masthead__plate'),
          card: rect('.masthead__card'),
          name: rect('.masthead__name'),
          line: document.querySelector('.masthead__line').textContent,
          stage: rect('.room__stage'),
        };
      });
      // Laid onto the faces: the text boxes land on the 3D faces, and are big enough to read.
      for (const k of ['plate', 'card']) {
        const face = at.faces[k === 'plate' ? 'nameplate' : 'card'];
        for (const d of ['x', 'y', 'width', 'height'])
          expect(
            Math.abs(at[k][d] - face[d]) < 3,
            `the ${k}’s text is off its face (${d}: ${at[k][d].toFixed(0)} vs ${face[d].toFixed(0)})`,
          );
        expect(at[k].x >= at.stage.x && at[k].y >= at.stage.y, `the ${k} is off screen`);
      }
      expect(at.name.height >= 22, `the name is ${at.name.height.toFixed(0)}px tall`);
      // The intro's type, as it lands on screen: its set size times the card's scale.
      const intro = await page.evaluate(() => {
        const el = document.querySelector('.masthead__card');
        return (Number.parseFloat(getComputedStyle(document.querySelector('.masthead__line')).fontSize) * el.getBoundingClientRect().width) / el.offsetWidth;
      });
      expect(intro >= 12, `the intro is set at ${intro.toFixed(1)}px on screen`);
      expect(at.line.startsWith('I run AI strategy'), 'the intro is not on the card');
      // The card's links, in order, by keyboard.
      await page.focus('.masthead__links a');
      const order = [await page.evaluate(() => document.activeElement.textContent)];
      for (let i = 0; i < 2; i++) {
        await page.keyboard.press(linkTab);
        order.push(await page.evaluate(() => document.activeElement.textContent));
      }
      expect(order.join(',') === 'CV,Email,LinkedIn', `Tab on the card: ${order.join(', ')}`);
      // Then the quiet index: the ten tools, Ask, the briefs and the CV, every one shown and reachable.
      const index = [];
      for (let i = 0; i < 13; i++) {
        await page.keyboard.press(linkTab);
        index.push(
          await page.evaluate(() => {
            const el = document.activeElement;
            const r = el.getBoundingClientRect();
            return { text: el.textContent, inIndex: Boolean(el.closest('.index')), shown: r.width > 0 && r.bottom <= innerHeight };
          }),
        );
      }
      expect(
        index.every((l) => l.inIndex && l.shown),
        `the index: ${index.map((l) => `${l.text}${l.inIndex && l.shown ? '' : ' (missed)'}`).join(', ')}`,
      );
      expect(
        index
          .slice(-3)
          .map((l) => l.text)
          .join(',') === 'Ask,The briefs,CV',
        `the index ends ${index.slice(-3).map((l) => l.text)}`,
      );
      await shot(page, 'desk-front');
      // An index link pulls its card, as the board's rows did.
      await page.click('.index a[data-piece="sourced"]');
      await cardOpen(page);
      await waitStation(page, 'desk:sourced');
      expect(problems.length === 0, problems.join(' | '));
      return { index: index.length };
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
      // A cut straight to square-on, the loop held still on its poster.
      const loop = await onScreen(page, 'gridtop', expect);
      expect(loop.paused, 'the loop plays with reduced motion');
      expect(problems.length === 0, problems.join(' | '));
    },
  );
}
