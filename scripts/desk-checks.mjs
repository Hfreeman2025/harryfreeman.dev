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

/** The UI meant to float over the scene: tags, notes, bubbles, cards, panels, the index, buttons. */
const FLOATING = [
  '.dtag',
  '.dnote',
  '.desk-spine',
  '.speak',
  '.printout',
  '.ask',
  '.grid-sign',
  '.radio',
  '.shelf-card',
  '.folder-card',
  '.desk__screen',
  '.desk__notebook',
  '.index',
  '.room__back',
  '.replay',
  '.entrance__ways',
  '.entrance__sound',
  '.entrance__said',
  '.entrance__knock',
];
/** Every visible piece of DOM text over the 3D stage that is not floating UI (visually hidden copies aside). */
const textOverScene = (page) =>
  page.evaluate((floating) => {
    const stage = document.querySelector('.room__stage').getBoundingClientRect();
    const clipped = (el) => {
      for (let a = el; a; a = a.parentElement) {
        const cs = getComputedStyle(a);
        const r = a.getBoundingClientRect();
        if ((cs.clipPath !== 'none' || cs.overflow === 'hidden') && (r.width <= 1 || r.height <= 1)) return true;
      }
      return false;
    };
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!n.textContent.trim() || !el?.checkVisibility({ opacityProperty: true, visibilityProperty: true }) || clipped(el)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.right <= stage.left || r.left >= stage.right || r.bottom <= stage.top || r.top >= stage.bottom)
        continue;
      if (!el.closest(floating.join(',')))
        out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}: ${n.textContent.trim().slice(0, 30)}`);
    }
    return out;
  }, FLOATING);
/** Shares of a screenshot's pixels: dark ink, the test board's green, the focus ring's yellow. */
const pixels = (page, png) =>
  page.evaluate(async (b64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    const d = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let ink = 0;
    let green = 0;
    let ring = 0;
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
      if (0.2126 * r + 0.7152 * g + 0.0722 * b < 90) ink++;
      if (g > 150 && r < 110 && b < 150 && g - r > 80) green++;
      if (r > 200 && g > 150 && g < 230 && b < 130 && r - b > 110) ring++;
    }
    const n = d.length / 4;
    return { ink: ink / n, green: green / n, ring: ring / n };
  }, png.toString('base64'));

/**
 * At a desk: the camera square to the screen, the tool's loop laid exactly over the screen, big enough to
 * read, the Open line under the bezel, and no second copy of the loop in the card.
 */
async function onScreen(page, piece, expect) {
  await page.locator('#desk-screen').waitFor({ state: 'visible', timeout: 5000 });
  // The desk as it is now, whichever way in: no directory board, the scene the whole window, and the
  // one way back, Back, saying where it goes.
  const layout = await page.evaluate(() => ({
    board: document.querySelectorAll('.board, .board__face').length,
    stage: document.querySelector('.room__stage').getBoundingClientRect().toJSON(),
    width: innerWidth,
    back: document.getElementById('card-back').firstChild?.textContent,
    where: document.querySelector('#card-back .folder-card__where')?.textContent?.trim(),
  }));
  expect(layout.board === 0, 'the old directory board is on the page');
  expect(
    layout.stage.x === 0 && Math.abs(layout.stage.width - layout.width) < 1,
    `the scene is ${layout.stage.width}px wide at x ${layout.stage.x}`,
  );
  expect(
    layout.back === 'Back' && /^to the (office|cabinet)$/.test(layout.where ?? ''),
    `the way back says ${layout.back} ${layout.where}`,
  );
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

export async function deskChecks({ check, expect, BASE, shot, name, config }) {
  // Links are in the Tab order everywhere but Safari, where a keyboard reaches them with Option+Tab.
  const linkTab = name === 'webkit' ? 'Alt+Tab' : 'Tab';
  const DESK = (query = '') => `${BASE}/?debug${query ? `&${query}` : ''}`;

  await check('desk: the HTML carries the desk’s objects, the name tags and every card before any script', {}, async () => {
    const html = await (await fetch(`${BASE}/`)).text();
    expect((html.match(/data-desk-target=/g) ?? []).length === 39, `desk targets: ${(html.match(/data-desk-target=/g) ?? []).length}`);
    for (const action of ['office', 'cabinet', 'notebook', 'reception', 'stamp', 'sign', 'room', 'shelf'])
      expect(html.includes(`data-action="${action}"`), `no ${action}`);
    expect(html.includes('id="notebook-panel"') && html.includes('id="printout"'), 'no notebook panel or printout');
    // What the scene prints (the door plate, the credit) is in the page too, in words.
    expect(
      html.includes('<span class="entrance__name">Harry Freeman</span>') && html.includes('<span class="entrance__role">Head of AI</span>'),
      'no door plate words',
    );
    expect(html.includes('id="desk-credit">Data: Carbon Intensity API, © NESO, CC BY 4.0</p>'), 'no credit words');
    // Who this is, as real text before any script: the name, the role, the intro and the links.
    expect(
      html.includes('<h1 class="masthead__name" tabindex="-1">Harry Freeman</h1>') && html.includes('>Head of AI</p>'),
      'no name or role',
    );
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
      // The grid's credit is a slip stuck under the sticky note, printed in the scene and clear of the
      // keyboard; its words are in the page for screen readers.
      const { credit, note, inSight } = await page.evaluate(() => ({
        credit: window.deskDebug.printed().credit,
        note: document.querySelector('[data-desk-target="sign"]').getBoundingClientRect().toJSON(),
        inSight: window.deskDebug.printedInSight(),
      }));
      expect(credit.width > 60, 'the credit slip is not in view');
      // Every part of every printed face in sight from the seat: nothing on the desk covers the words.
      for (const [k, v] of Object.entries(inSight)) expect(v === 1, `${k}: only ${Math.round(v * 100)}% of it in sight`);
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
      await onScreen(page, 'sourced', expect);
      expect((await page.locator('#card-back').textContent())?.trim() === 'Back to the office', 'the way back does not say the office');
      await page.keyboard.press('Escape');
      await waitStation(page, 'office');
      return { tags: tags.length };
    },
  );

  await check(
    'desk: the name and role are printed on the nameplate and the intro and links on the card, in the scene, with the same words in the page; the keyboard rings each printed link and a click on one is that link; the index reaches everything',
    desk,
    async (page, problems) => {
      await live(page, DESK());
      await page.waitForTimeout(400);
      const at = await page.evaluate(() => {
        const masthead = document.querySelector('.masthead');
        return {
          printed: window.deskDebug.printed(),
          stage: document.querySelector('.room__stage').getBoundingClientRect().toJSON(),
          // The page's copy: the same words and links, visually hidden (clipped, not removed).
          name: document.querySelector('.masthead__name').textContent,
          role: document.querySelector('.masthead__role').textContent,
          line: document.querySelector('.masthead__line').textContent,
          links: [...document.querySelectorAll('.masthead__links a:not(.masthead__speak)')].map((a) => [
            a.textContent,
            a.getAttribute('href'),
          ]),
          hidden: masthead.getBoundingClientRect().width <= 1 && getComputedStyle(masthead).display !== 'none',
        };
      });
      expect(at.name === 'Harry Freeman' && at.role === 'Head of AI', `the page's name and role: ${at.name}, ${at.role}`);
      expect(at.line.startsWith('I run AI strategy'), 'the intro is not in the page');
      expect(
        JSON.stringify(at.links) ===
          JSON.stringify([
            ['CV', config.cv],
            ['Email', `mailto:${config.email}`],
            ['LinkedIn', config.linkedin],
          ]),
        `the page's links: ${JSON.stringify(at.links)}`,
      );
      expect(at.hidden, 'the header is not visually hidden over the scene');
      // Printed on the faces, in view and big enough to read.
      for (const k of ['nameplate', 'card']) {
        const f = at.printed[k];
        expect(f.x >= at.stage.x && f.y >= at.stage.y && f.x + f.width <= at.stage.x + at.stage.width, `the ${k} is off screen`);
      }
      expect(at.printed.nameplate.height >= 60, `the nameplate is ${at.printed.nameplate.height.toFixed(0)}px tall`);
      expect(at.printed.card.width >= 280, `the card is ${at.printed.card.width.toFixed(0)}px wide`);
      // By keyboard from the name (where arriving puts focus): each card link in turn, ringed on the card.
      await page.focus('.masthead__name');
      const order = [];
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press(linkTab);
        await page.waitForTimeout(60);
        const now = await page.evaluate(() => ({
          text: document.activeElement.textContent,
          ringed: window.deskDebug.printed().card.ringed,
        }));
        order.push(now.text);
        expect(now.ringed === i, `${now.text} has focus but the card rings ${now.ringed}`);
        if (i === 0) {
          const card = at.printed.card;
          const ringPx = await pixels(
            page,
            await page.screenshot({ clip: { x: card.x, y: card.y, width: card.width, height: card.height } }),
          );
          expect(ringPx.ring > 0.001, `no focus ring on the printed CV link: ${JSON.stringify(ringPx)}`);
        }
      }
      expect(order.join(',') === 'CV,Email,LinkedIn', `Tab on the card: ${order.join(', ')}`);
      // A click on a printed link is a click on the page's link (stopped here, so the page stays).
      for (const [i, text] of [
        [0, 'CV'],
        [2, 'LinkedIn'],
      ]) {
        await page.evaluate(() => {
          window.__clicked = null;
          for (const a of document.querySelectorAll('.masthead__links a'))
            a.addEventListener(
              'click',
              (event) => {
                window.__clicked = a.textContent;
                event.preventDefault();
              },
              { once: true },
            );
        });
        const spot = (await page.evaluate(() => window.deskDebug.printed().card.links))[i];
        await page.mouse.click(spot.x, spot.y);
        expect(
          (await page.evaluate(() => window.__clicked)) === text,
          `clicking the printed ${text} clicked ${await page.evaluate(() => window.__clicked)}`,
        );
      }
      // Back to the keyboard order from the last card link.
      await page.focus('.masthead__links a:nth-child(3)');
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
      await onScreen(page, 'sourced', expect);
      expect(problems.length === 0, problems.join(' | '));
      return { index: index.length };
    },
  );

  await check('desk: a deep link to a card lands square-on to its screen, the desk as it is now', desk, async (page, problems) => {
    await page.goto(`${BASE}/?debug#folder-dreaming`, { waitUntil: 'load' });
    await cardOpen(page);
    await waitStation(page, 'desk:dreaming');
    await page.waitForTimeout(400);
    await onScreen(page, 'dreaming', expect);
    await shot(page, 'desk-card-deep-link');
    expect(problems.length === 0, problems.join(' | '));
  });

  // A clipboard to read back, and a microphone that counts any request for it.
  const micWatch = () => {
    window.__copied = null;
    window.__mic = 0;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text) => {
          window.__copied = text;
          return Promise.resolve();
        },
      },
    });
    if (navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = () => {
        window.__mic++;
        return Promise.reject(new Error('not here'));
      };
  };
  /** Opens the mic's bubble and reads it: the email on one line, and the bubble clear of every thing and label. */
  const bubble = async (page) => {
    const mic = '[data-action="mic"][data-at="door"]';
    await page.locator(mic).waitFor({ state: 'visible', timeout: 5000 });
    await page.click(mic);
    await page.locator('#speak[data-open="true"]').waitFor({ timeout: 3000 });
    await page.waitForTimeout(500);
    return page.evaluate(() => {
      const card = document.getElementById('speak');
      const email = document.getElementById('speak-email').parentElement;
      const box = card.getBoundingClientRect();
      const lineHeight = Number.parseFloat(getComputedStyle(email).lineHeight);
      const labels = [...document.querySelectorAll('.desk__labels > :not([hidden])')]
        .filter((el) => el.dataset.action !== 'mic')
        .map((el) => ({ name: el.dataset.deskTarget ?? el.className, ...el.getBoundingClientRect().toJSON() }));
      const things = window.deskDebug.objectRects();
      const hit = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      return {
        oneLine: email.scrollWidth <= email.clientWidth + 1 && email.getBoundingClientRect().height < lineHeight * 1.5,
        emailText: email.textContent.trim(),
        inView: box.x >= 0 && box.y >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
        over: [...things, ...labels].filter((t) => hit(box, t)).map((t) => t.name),
        focus: document.activeElement?.id,
        lamp: window.deskDebug.onAir(),
      };
    });
  };

  await check(
    'desk: Speak to me: the mic’s speech bubble says hello with the email on one line, clear of the desk’s things; Copy, Esc and a click away work, and it never listens',
    { ...desk, initScript: micWatch },
    async (page, problems) => {
      await live(page, DESK());
      const at = await bubble(page);
      expect(at.lamp, 'the ON AIR lamp is off');
      expect(at.focus === 'speak-copy', `focus went to ${at.focus}`);
      expect(at.emailText === config.email && at.oneLine, `the email is not on one line: ${JSON.stringify(at)}`);
      expect(at.inView && at.over.length === 0, `the bubble is over ${at.over.join(', ')}`);
      const chips = await page.evaluate(() =>
        [...document.querySelectorAll('#speak .speak__chip')].map((c) => ({
          tag: c.tagName,
          text: c.textContent,
          href: c.getAttribute('href'),
        })),
      );
      expect(
        chips.map((c) => c.text).join('|') === 'Copy email|LinkedIn|CV' && chips[1].href === config.linkedin && chips[2].href === config.cv,
        `the chips: ${JSON.stringify(chips)}`,
      );
      for (const i of [0, 1, 2]) {
        await page.locator('#speak .speak__chip').nth(i).focus();
        expect(
          await page
            .locator('#speak .speak__chip')
            .nth(i)
            .evaluate((c) => document.activeElement === c),
          `chip ${i} cannot take focus`,
        );
      }
      await page.click('#speak-copy');
      await page.waitForFunction(() => document.getElementById('speak-copy')?.textContent === 'Copied ✓', null, { timeout: 2000 });
      expect((await page.evaluate(() => window.__copied)) === config.email, 'the clipboard does not hold the email');
      await shot(page, 'desk-mic');
      await page.waitForFunction(() => document.getElementById('speak-copy')?.textContent === 'Copy email', null, { timeout: 3500 });
      await page.keyboard.press('Escape');
      expect(await page.locator('#speak').isHidden(), 'Esc did not close the bubble');
      expect(!(await page.evaluate(() => window.deskDebug.onAir())), 'the lamp stayed on');
      expect((await page.evaluate(() => document.activeElement?.dataset?.action)) === 'mic', 'focus did not go back to the mic');
      expect((await station(page)) === 'door', 'Esc stepped away from the desk too');
      // Enter on the mic opens it; a click on the desk closes it.
      await page.keyboard.press('Enter');
      await page.locator('#speak[data-open="true"]').waitFor({ timeout: 3000 });
      await page.mouse.click(1380, 60);
      expect(await page.locator('#speak').isHidden(), 'a click on the desk did not close the bubble');
      // At a smaller window the email still fits on its line, and the bubble still finds space.
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.waitForTimeout(800);
      const small = await bubble(page);
      expect(small.oneLine && small.inView && small.over.length === 0, `at 1280 × 720: ${JSON.stringify(small)}`);
      expect((await page.evaluate(() => window.__mic)) === 0, 'the page asked for a microphone');
      expect(problems.length === 0, problems.join(' | '));
    },
  );

  await check(
    'desk (phone width): the mic’s bubble keeps the email on one line',
    { viewport: { width: 390, height: 844 }, initScript: micWatch },
    async (page) => {
      await live(page, DESK('room'));
      const at = await bubble(page);
      expect(at.emailText === config.email && at.oneLine, `the email is not on one line: ${JSON.stringify(at)}`);
      expect(at.inView, `the bubble runs off the screen: ${JSON.stringify(at)}`);
      return { over: at.over.length ? at.over.join(', ') : 'nothing' };
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
      await onScreen(page, 'gridtop', expect);
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
    'desk: printed words are hidden by whatever stands in front of them, as paint is; no other text floats over the scene but its tags, notes and panels',
    desk,
    async (page, problems) => {
      await live(page, DESK());
      await page.waitForTimeout(600);
      const plate = await page.evaluate(() => window.deskDebug.printed().nameplate);
      const clip = {
        x: plate.x + plate.width * 0.15,
        y: plate.y + plate.height * 0.2,
        width: plate.width * 0.7,
        height: plate.height * 0.6,
      };
      const before = await pixels(page, await page.screenshot({ clip }));
      expect(before.ink > 0.03, `no name printed on the plate: ${JSON.stringify(before)}`);
      // A plain board stood in front of the nameplate: its words go, and nothing of them shows through.
      await page.evaluate(() => window.deskDebug.blockNameplate(true));
      await page.waitForTimeout(300);
      const after = await pixels(page, await page.screenshot({ clip }));
      expect(after.green > 0.95 && after.ink < 0.002, `the name shows through what stands in front of it: ${JSON.stringify(after)}`);
      await page.evaluate(() => window.deskDebug.blockNameplate(false));
      // No text over the scene but what is meant to float: seated, standing in the room, in the office, at a desk.
      const stray = { seated: await textOverScene(page) };
      await page.click('[data-action="room"][data-at="door"]');
      await waitStation(page, 'room');
      await page.locator('[data-action="shelf"][data-at="room"]').waitFor({ state: 'visible', timeout: 5000 });
      stray.room = await textOverScene(page);
      await page.click('#room-back');
      await waitStation(page, 'door');
      await page.locator('[data-action="office"][data-at="door"]').waitFor({ state: 'visible', timeout: 5000 });
      await page.click('[data-action="office"][data-at="door"]');
      await waitStation(page, 'office');
      // The dive done: the office's name tags are up.
      await page.locator('[data-action="desk:gridtop"][data-at="office"]').waitFor({ state: 'visible', timeout: 6000 });
      await page.waitForTimeout(300);
      stray.office = await textOverScene(page);
      await page.click('[data-action="desk:gridtop"][data-at="office"]');
      await cardOpen(page);
      stray.desk = await textOverScene(page);
      for (const [where, found] of Object.entries(stray))
        expect(found.length === 0, `text over the scene (${where}): ${found.join(' | ')}`);
      expect(problems.length === 0, problems.join(' | '));
      return { inkBefore: Number(before.ink.toFixed(3)), greenAfter: Number(after.green.toFixed(3)) };
    },
  );

  await check('desk: from the seated view the index box keeps clear of the nameplate at every window shape', desk, async (page) => {
    await live(page, DESK());
    const gaps = {};
    for (const [w, h] of [
      [1440, 900],
      [1280, 720],
      [1920, 1080],
      [1024, 768],
      [1280, 1024],
      [2560, 1080],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(500);
      gaps[`${w}x${h}`] = await page.evaluate(() => {
        const rects = window.deskDebug.objectRects();
        const a = rects.find((r) => r.name === 'nameplate');
        const b = rects.find((r) => r.name === 'index box');
        // Their boxes on screen (generous: each its whole bounding box) apart, by this many pixels.
        return Math.round(Math.max(b.y - (a.y + a.height), b.x - (a.x + a.width), a.x - (b.x + b.width), a.y - (b.y + b.height)));
      });
    }
    for (const [size, gap] of Object.entries(gaps)) expect(gap >= 8, `at ${size} the index box is within ${gap}px of the nameplate`);
    return gaps;
  });

  await check(
    'desk: looking round the room: the window shows the grid’s wind and sun at the visitor’s time of day, the shelf names its sources, the radio is the radio',
    {
      ...desk,
      initScript: () => {
        window.__shift = PerformanceObserver.supportedEntryTypes?.includes('layout-shift') ? 0 : null;
        window.__moved = [];
        if (window.__shift === null) return;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            if (e.hadRecentInput) continue;
            window.__shift += e.value;
            for (const s of e.sources ?? []) window.__moved.push(s.node?.id || s.node?.className || s.node?.nodeName);
          }
        }).observe({ type: 'layout-shift', buffered: true });
      },
    },
    async (page, problems) => {
      await live(page, DESK());
      // The mocked grid: wind 38%, solar 4%. The turbines turn at that pace; no glint at 4% solar.
      await page.waitForFunction(() => window.deskDebug.windowState().spin > 0, null, { timeout: 8000 });
      const state = await page.evaluate(() => window.deskDebug.windowState());
      const hour = await page.evaluate(() => new Date().getHours());
      const daylight = hour >= 6 && hour < 11 ? 'morning' : hour < 17 && hour >= 11 ? 'day' : hour >= 17 && hour < 21 ? 'evening' : 'night';
      expect(Math.abs(state.spin - (0.4 + (38 / 60) * 3.2)) < 1e-9, `the turbines turn at ${state.spin}`);
      expect(state.glint === false, 'the panels glint at 4% solar');
      expect(state.daylight === daylight, `the window shows ${state.daylight} at ${hour}:00`);
      // Up from the desk, by its tag.
      await page.click('[data-action="room"][data-at="door"]');
      await waitStation(page, 'room');
      // Its tags show once the camera has stood up.
      await page.locator('[data-action="shelf"][data-at="room"]').waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForTimeout(200);
      expect((await page.locator('#room-back').textContent()) === 'Sit back down', 'the way back does not say where');
      expect(await page.locator('[data-desk-target="room-radio"]').isVisible(), 'no radio on the shelf');
      // Over the window, what it shows and whose data it is.
      const note = await page.locator('[data-desk-target="window"]').textContent();
      expect(
        note.includes('wind 38% and solar 4%') && note.includes('Carbon Intensity API, © NESO, CC BY 4.0'),
        `the window's note says ${note}`,
      );
      await shot(page, 'room');
      // A spine under the pointer says which source it is and which tool it fed.
      for (const i of [0, 7, 17]) {
        const at = await page.evaluate((k) => window.deskDebug.bookAt(k), i);
        await page.mouse.move(at.x, at.y);
        await page.waitForTimeout(120);
        const spine = await page.evaluate(() => ({
          hidden: document.getElementById('desk-spine').hidden,
          title: document.querySelector('.desk-spine__title').textContent,
          fed: document.querySelector('.desk-spine__fed').textContent,
        }));
        expect(!spine.hidden && spine.title.length > 2 && spine.fed.startsWith('fed '), `book ${i}: ${JSON.stringify(spine)}`);
        if (i === 0) {
          expect(
            spine.title === 'Detecting hallucinations using semantic entropy' && spine.fed === 'fed Real or Hallucinated?',
            `book 0 reads ${JSON.stringify(spine)}`,
          );
          await shot(page, 'room-book');
        }
      }
      await page.mouse.move(720, 120);
      await page.waitForTimeout(120);
      expect(await page.locator('#desk-spine').isHidden(), 'the spine stayed up off the shelf');
      // The same list from the keyboard: the shelf's tag opens it.
      await page.locator('[data-action="shelf"][data-at="room"]').focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      const listed = await page.evaluate(() => [...document.querySelectorAll('#shelf .shelf-card__book')].map((b) => b.textContent));
      expect(listed.length === 18 && (await page.locator('#shelf').isVisible()), `the shelf lists ${listed.length}`);
      expect((await page.evaluate(() => document.activeElement?.id)) === 'shelf', 'focus did not go into the list');
      // Esc unpins it and focus goes back to the tag; moving on closes it.
      await page.keyboard.press('Escape');
      expect((await page.evaluate(() => document.activeElement?.dataset.action)) === 'shelf', 'focus did not come back to the tag');
      await page.locator('#room-back').focus();
      await page.waitForTimeout(400);
      expect(await page.locator('#shelf').isHidden(), 'the list stayed open');
      // The radio on the shelf opens the radio's own card.
      await page.locator('[data-desk-target="room-radio"]').click();
      await page.waitForTimeout(200);
      expect(await page.locator('#radio').isVisible(), 'the radio’s card did not open');
      await page.keyboard.press('Escape');
      // Back down to the desk by the button; up again by the wheel, and down by it.
      await page.click('#room-back');
      await waitStation(page, 'door');
      await page.mouse.move(720, 450);
      await page.mouse.wheel(0, -200);
      await waitStation(page, 'room');
      await page.waitForTimeout(1000);
      await page.mouse.wheel(0, 200);
      await waitStation(page, 'door');
      const shift = await page.evaluate(() => window.__shift);
      if (shift !== null) expect(shift === 0, `layout shift ${shift}: ${await page.evaluate(() => window.__moved.join(', '))}`);
      expect(problems.length === 0, problems.join(' | '));
      return { spin: Number(state.spin.toFixed(3)), daylight: state.daylight, layoutShift: shift ?? 'not reported by this browser' };
    },
  );

  await check('desk: without the grid, the window is still: no turning, no glint', { ...desk, grid: 'fail' }, async (page) => {
    await live(page, DESK());
    // The reading failed (the sign says so); the mix, asked for at the same time, failed too.
    await page.waitForFunction(() => document.getElementById('grid-sign')?.dataset.state === 'unavailable', null, { timeout: 12000 });
    await page.waitForTimeout(800);
    const state = await page.evaluate(() => window.deskDebug.windowState());
    expect(state.spin === 0 && state.glint === false, `the window moves without data: ${JSON.stringify(state)}`);
    expect(
      (await page.locator('#window-now').textContent()).includes('unavailable, so the turbines stand still'),
      'the window does not say the data is unavailable',
    );
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
