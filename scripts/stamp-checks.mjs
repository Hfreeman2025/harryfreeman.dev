// The receipt stamps' browser checks, run by e2e.mjs in each browser: a real stamp verifies in the
// browser and nothing says verified before the check resolves; the one-byte change is rejected;
// dreaming shows a valid signature with failed checks, its reason and its supplement; earlier
// captures check too; a browser without Ed25519 says it cannot verify; the flat office's folders
// carry the same stamp.

const desk = { viewport: { width: 1440, height: 900 } };
const phone = (name) => ({ viewport: { width: 390, height: 844 }, ...(name === 'firefox' ? {} : { isMobile: true, hasTouch: true }) });
const cardOpen = (page) =>
  page.waitForFunction(() => !document.getElementById('card').hidden && document.getElementById('card').dataset.open === 'true', null, {
    timeout: 15000,
  });
const stampText = (page) => page.locator('#card-stamp').textContent();
const state = (page) => page.locator('#card-stamp .stamp__status').first().getAttribute('data-state');
const settled = (page) =>
  page.waitForFunction(
    () => ['valid', 'invalid', 'unsupported', 'error'].includes(document.querySelector('#card-stamp .stamp__status')?.dataset.state ?? ''),
    null,
    {
      timeout: 15000,
    },
  );

async function openFolder(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  await cardOpen(page);
  await page.locator('#card-stamp .stamp__face').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#card-stamp').scrollIntoViewIfNeeded();
}

export async function stampChecks({ check, expect, BASE, shot, name }) {
  await check(
    'stamps: a real stamp verifies in the browser, and nothing says verified before the check resolves',
    desk,
    async (page, problems) => {
      // Hold the envelope back, to look at the page while the check is still running.
      let release;
      const held = new Promise((r) => {
        release = r;
      });
      await page.route(/\/vendor\/stamps\/stamps\//, async (route) => {
        await held;
        await route.continue();
      });
      await openFolder(page, `${BASE}/#folder-gpt-in-a-tab`);
      const before = await stampText(page);
      expect(/PASSED/.test(before) && before.includes('193619e') && before.includes('48 passed'), `the face: ${before}`);
      expect(!/verified|signature valid/i.test(before), `claims verification before any check: ${before}`);
      await page.click('#card-stamp .stamp__face');
      await page.waitForFunction(() => document.querySelector('#card-stamp .stamp__status')?.dataset.state === 'checking', null, {
        timeout: 5000,
      });
      const during = await stampText(page);
      expect(/Checking the signature/.test(during), `while checking: ${during}`);
      expect(!/signature valid|checks passed/i.test(during), `shows an outcome before the check resolved: ${during}`);
      release();
      await settled(page);
      expect((await state(page)) === 'valid', `state ${await state(page)}`);
      const after = await stampText(page);
      expect(after.includes('Signature valid, signed by key e201c249…'), 'no signature line');
      expect(after.includes('Checks passed.'), 'no checks line');
      expect(
        after.includes('193619ee720bf4a7d71da31fae9cf9c2d13a9e01') && after.includes('npm run typecheck') && after.includes('exit 0'),
        'the signed statement is not shown',
      );
      await page.locator('#card-stamp .stamp__outcome').scrollIntoViewIfNeeded();
      await page.locator('#card-stamp').evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await shot(page, 'stamp-passed');
      expect(problems.length === 0, problems.join(' | '));
    },
  );

  await check('stamps: the one-byte change is rejected, and nothing from it is shown as fact', desk, async (page) => {
    await openFolder(page, `${BASE}/#folder-gpt-in-a-tab`);
    await page.locator('#card-stamp .stamp__tamper input').check();
    await page.click('#card-stamp .stamp__face');
    await settled(page);
    expect((await state(page)) === 'invalid', `state ${await state(page)}`);
    const text = await stampText(page);
    expect(text.includes('Signature not valid: Ed25519 signature verification failed.'), `outcome: ${text}`);
    expect(!/Signature valid|Checks passed/.test(text), 'shows facts from a rejected stamp');
    expect((await page.locator('#card-stamp .stamp__facts').count()) === 0, 'a statement shown for a rejected stamp');
    await page.locator('#card-stamp').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await shot(page, 'stamp-tampered');
  });

  await check('stamps: dreaming shows a valid signature, failed checks with the reason, and its supplement', desk, async (page) => {
    await openFolder(page, `${BASE}/#folder-dreaming`);
    expect(/FAILED/.test(await stampText(page)), 'the face does not say FAILED');
    await page.click('#card-stamp .stamp__face');
    await settled(page);
    expect((await state(page)) === 'valid', `state ${await state(page)}`);
    await page.locator('#card-stamp .stamp__supplement .stamp__outcome').waitFor({ timeout: 10000 });
    const text = await stampText(page);
    expect(text.includes('Signature valid, signed by key e201c249…'), 'no valid signature');
    expect(
      /Checks failed: unit-tests exited 1: Tests {2}1 failed \| 455 passed/.test(text),
      `no failed checks and reason: ${text.slice(0, 400)}`,
    );
    expect(text.includes('not network-isolated') && text.includes('Tests  7 passed (7)'), 'no supplement');
    // Its earlier capture, signed separately, checks too.
    await page.locator('#card-stamp .stamp__history summary').click();
    await page.locator('#card-stamp .stamp__earlier-check').first().click();
    await page.waitForFunction(() => document.querySelector('#card-stamp .stamp__earlier-status')?.dataset.state === 'valid', null, {
      timeout: 10000,
    });
    await page.locator('#card-stamp').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await shot(page, 'stamp-dreaming');
  });

  await check(
    'stamps: without Ed25519 the folder says it cannot verify here, and shows nothing as verified',
    {
      ...desk,
      initScript: () => {
        const original = crypto.subtle.importKey.bind(crypto.subtle);
        crypto.subtle.importKey = (format, key, algorithm, ...rest) => {
          const name = typeof algorithm === 'string' ? algorithm : algorithm?.name;
          if (name === 'Ed25519') return Promise.reject(new DOMException('Ed25519 is not supported', 'NotSupportedError'));
          return original(format, key, algorithm, ...rest);
        };
      },
    },
    async (page) => {
      await openFolder(page, `${BASE}/#folder-sourced`);
      await page.click('#card-stamp .stamp__face');
      await settled(page);
      expect((await state(page)) === 'unsupported', `state ${await state(page)}`);
      const text = await stampText(page);
      expect(text.includes('can’t check Ed25519 signatures'), `message: ${text}`);
      expect(!/Signature valid|Checks passed/.test(text), 'claims a result without checking');
    },
  );

  await check('stamps (phone): the flat office’s folder carries the same stamp, and it verifies', phone(name), async (page) => {
    await openFolder(page, `${BASE}/#folder-receipts`);
    await page.click('#card-stamp .stamp__face');
    await settled(page);
    expect((await state(page)) === 'valid', `state ${await state(page)}`);
    expect((await stampText(page)).includes('Signature valid, signed by key e201c249…'), 'no signature line');
    const fits = await page.locator('#card-stamp').evaluate((el) => el.getBoundingClientRect().right <= innerWidth + 0.5);
    expect(fits, 'the stamp runs off the screen');
    await page.locator('#card-stamp').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await shot(page, 'stamp', 'phone');
  });
}
