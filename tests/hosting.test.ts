import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/content/config';
import { PIECES } from '../src/content/pieces';
import { renderList } from '../src/content/render';
import { parseHostingConfig } from '../src/hosting/config';
import { checkHeaders, deniedIn, denyMatchers, parseDenylist, printableRuns, scanText } from '../src/hosting/gate';
import { fillHeaders, HASHES_TOKEN, inlineScriptHashes, robotsTxt } from '../src/hosting/headers';
import { hostedHtml, INDEX_COPY, pageOf } from '../src/hosting/html';
import { hostedOpenLine, isLocalOnly, RECORDING_LINE } from '../src/hosting/open';
import { checkHostedRecord } from '../src/hosting/record';
import { hasLocal, LOCAL_MARKER, redactLocal } from '../src/hosting/redact';
import { allowedAccount, deploymentUrl, projectNames } from '../src/hosting/wrangler';
import placeholder from '../src/timeline/placeholder.json' with { type: 'json' };
import { parseTimeline } from '../src/timeline/schema';

const config = parseConfig(JSON.parse(readFileSync(new URL('../site.config.json', import.meta.url), 'utf8')));
const EMAIL = config.email;

describe('hosting: the record’s local addresses and paths are redacted, every line kept', () => {
  it.each([
    ['Open http://127.0.0.1:4177.', `Open ${LOCAL_MARKER}.`],
    ['The docs page, at http://127.0.0.1:4310/docs/, lists every attribute.', `The docs page, at ${LOCAL_MARKER}, lists every attribute.`],
    ['npm run dev        # http://localhost:5173', `npm run dev        # ${LOCAL_MARKER}`],
    ['Open **[http://127.0.0.1:5177](http://127.0.0.1:5177)**.', `Open **${LOCAL_MARKER}**.`],
    ['See [the demo](http://127.0.0.1:4310/demo/) first.', 'See the demo first.'],
    ['Vite prints (<http://localhost:5173> unless busy).', `Vite prints (${LOCAL_MARKER} unless busy).`],
    ['a loopback preview at `http://127.0.0.1:4318/mixed.html`): claims', `a loopback preview at \`${LOCAL_MARKER}\`): claims`],
    ['Weights go only to ~/Personal/.models/, with digests.', `Weights go only to ${LOCAL_MARKER}, with digests.`],
    ['plain http:// only for localhost), redirects', `plain http:// only for ${LOCAL_MARKER}), redirects`],
    ['bind 127.0.0.1:8080 and wait', `bind ${LOCAL_MARKER} and wait`],
    ['written to /Users/someone/notes.md today', `written to ${LOCAL_MARKER} today`],
  ])('%s', (input, output) => {
    const r = redactLocal(input);
    expect(r.text).toBe(output);
    expect(r.spans).toBeGreaterThan(0);
    expect(hasLocal(r.text)).toBe(false);
  });

  it('leaves text with nothing local alone, including generic home-relative paths', () => {
    const text = 'Install it as ~/Library/LaunchAgents/<label>.plist; see https://example.org/docs and localhost.example.com.';
    expect(redactLocal(text)).toEqual({ text, spans: 0 });
  });

  it('never adds or removes a line', () => {
    const text = ['# Run', '', 'Open http://127.0.0.1:4177.', '```', 'npm run dev # http://localhost:5173', '```', 'Done.'].join('\n');
    expect(redactLocal(text).text.split('\n')).toHaveLength(text.split('\n').length);
  });
});

describe('hosting: the hosted record is the committed one, redacted', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'record-'));
  const write = (d: string, facts: Array<{ text: string; line: number }>, lines = 10) => {
    writeFileSync(
      join(d, 'sources.json'),
      JSON.stringify({ sources: [{ section: 'A', piece: 'a', path: 'a/README.md', sha256: 'f00', bytes: 1 }] }),
    );
    writeFileSync(
      join(d, 'studio.json'),
      JSON.stringify({ sections: [{ title: 'A' }], facts: facts.map((f) => ({ ...f, section: 0 })), embeddings: { model: 'm', dims: 3 } }),
    );
    writeFileSync(join(d, 'lines.json'), JSON.stringify({ lines, sections: [{ key: 'a', title: 'A', from: 1, to: lines, html: '' }] }));
    writeFileSync(join(d, 'suggestions.json'), '{}');
    return d;
  };
  const committed = write(dir(), [
    { text: 'Open http://127.0.0.1:4177.', line: 3 },
    { text: 'It is fast.', line: 4 },
  ]);

  it('passes when only redactions differ', () => {
    const hosted = write(dir(), [
      { text: `Open ${LOCAL_MARKER}.`, line: 3 },
      { text: 'It is fast.', line: 4 },
    ]);
    expect(checkHostedRecord(committed, hosted)).toEqual([]);
  });

  it('fails when a fact changes without a redaction, moves line, or something local is left', () => {
    const changed = write(dir(), [
      { text: `Open ${LOCAL_MARKER}.`, line: 3 },
      { text: 'It is slow.', line: 4 },
    ]);
    expect(checkHostedRecord(committed, changed)).toContain('the fact at 0:4 changed without a redaction');
    const moved = write(dir(), [
      { text: `Open ${LOCAL_MARKER}.`, line: 3 },
      { text: 'It is fast.', line: 5 },
    ]);
    expect(checkHostedRecord(committed, moved).join('\n')).toMatch(/section:line 0:4: 1 committed, 0 hosted/);
    const left = write(dir(), [
      { text: 'Open http://127.0.0.1:4177.', line: 3 },
      { text: 'It is fast.', line: 4 },
    ]);
    expect(checkHostedRecord(committed, left)).toContain('studio.json still carries a local address or path');
    const shorter = write(dir(), [{ text: `Open ${LOCAL_MARKER}.`, line: 3 }], 9);
    expect(checkHostedRecord(committed, shorter).join('\n')).toMatch(/source lines: 10 committed, 9 hosted/);
  });
});

describe('hosting: tools on Harry’s machine say they are recordings', () => {
  it('knows a local URL from a site path or a public URL', () => {
    expect(isLocalOnly('http://127.0.0.1:4180/')).toBe(true);
    expect(isLocalOnly('http://localhost:5173/demo/')).toBe(true);
    expect(isLocalOnly('/terminal.html?piece=gridtop')).toBe(false);
    expect(isLocalOnly('https://example.org/')).toBe(false);
    expect(hostedOpenLine('/terminal.html?piece=gridtop')).toBeNull();
  });

  it('renders no local link in the hosted list, a recording line for each local tool, and the terminal tools’ links', () => {
    const timeline = parseTimeline(placeholder);
    const hosted = renderList(config, timeline, true);
    const local = PIECES.filter((p) => isLocalOnly(config.pieces[p.id]));
    expect(local.length).toBe(8);
    expect(hosted).not.toMatch(/127\.0\.0\.1|localhost|href="http:/);
    expect(hosted.split(RECORDING_LINE)).toHaveLength(local.length + 1);
    expect(hosted).toContain('href="/terminal.html?piece=gridtop">Open gridtop</a>');
    expect(hosted).toContain('href="/terminal.html?piece=dreaming">Open dreaming</a>');
    // The local build is unchanged.
    const localBuild = renderList(config, timeline);
    expect(localBuild).not.toContain(RECORDING_LINE);
    expect(localBuild).toContain('href="http://127.0.0.1:4180/">Open GPT in a tab</a>');
  });
});

describe('hosting: the pages on the public origin', () => {
  const ORIGIN = 'https://harryfreeman.dev';
  const page = (body: string) =>
    `<html><head><meta property="og:image" content="/og.png"></head><body>${INDEX_COPY.map(([from]) => from).join('\n')}${body}</body></html>`;

  it('adds the canonical URL and og:url, makes the social card absolute, and applies every copy change', () => {
    const out = hostedHtml(page(''), 'index', ORIGIN);
    expect(out).toContain('<link rel="canonical" href="https://harryfreeman.dev/">');
    expect(out).toContain('<meta property="og:url" content="https://harryfreeman.dev/">');
    expect(out).toContain('content="https://harryfreeman.dev/og.png"');
    for (const [from, to] of INDEX_COPY) {
      if (from !== to && to) expect(out).toContain(to);
      expect(out.includes(from) && !to.includes(from)).toBe(false);
    }
    expect(hostedHtml('<html><head></head></html>', 'cv', ORIGIN)).toContain('href="https://harryfreeman.dev/cv"');
  });

  it('fails the build when the page no longer says what it expects', () => {
    expect(() => hostedHtml('<html><head></head><body>changed copy</body></html>', 'index', ORIGIN)).toThrow(/no longer contains/);
    expect(pageOf('/x/index.html')).toBe('index');
    expect(pageOf('/x/other.html')).toBeNull();
  });

  it('reads hosting.config.json, and refuses an origin that is not https', () => {
    const real = parseHostingConfig(JSON.parse(readFileSync(new URL('../hosting.config.json', import.meta.url), 'utf8')));
    expect(real.origin).toBe(ORIGIN);
    expect(() => parseHostingConfig({ ...real, origin: 'http://harryfreeman.dev' })).toThrow(/origin/);
    expect(() => parseHostingConfig({ ...real, SITE_INDEXABLE: 'yes' })).toThrow(/SITE_INDEXABLE/);
  });
});

describe('hosting: _headers and robots.txt', () => {
  const template = `/*\n  Content-Security-Policy: default-src 'none'; script-src 'self' ${HASHES_TOKEN}; frame-ancestors 'none'\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Content-Type-Options: nosniff\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), accelerometer=(self), gyroscope=(self)\n`;
  const html =
    '<script>console.log(1)</script><script type="application/json" id="d">{"a":1}</script><script type="module" src="/a.js"></script>';

  it('hashes the scripts a browser runs, not data blocks or external scripts', () => {
    const hashes = inlineScriptHashes(html);
    expect(hashes).toHaveLength(1);
    // SHA-256 of "console.log(1)", base64 (as `openssl dgst -sha256 -binary | base64` gives it).
    expect(hashes[0]).toBe("'sha256-CihokcEcBW4atb/CW/XWsvWwbTjqwQlE9nj9ii5ww5M='");
    expect(inlineScriptHashes('<script type="module">import "/x.js"</script>')).toHaveLength(1);
  });

  it('fills the hashes and applies the indexing switch to the header and robots.txt together', () => {
    const hashes = inlineScriptHashes(html);
    const off = fillHeaders(template, { hashes, indexable: false });
    expect(off).toContain(hashes[0]);
    expect(off).toMatch(/X-Robots-Tag: noindex, nofollow/);
    const on = fillHeaders(template, { hashes, indexable: true });
    expect(on).not.toMatch(/X-Robots-Tag/);
    expect(robotsTxt(false)).toBe('User-agent: *\nDisallow: /\n');
    expect(robotsTxt(true)).toBe('User-agent: *\nAllow: /\n');
    const pages = [{ file: 'index.html', html }];
    expect(checkHeaders(off, robotsTxt(false), pages, false)).toEqual([]);
    expect(checkHeaders(on, robotsTxt(true), pages, true)).toEqual([]);
    // Out of step: either half alone fails.
    expect(checkHeaders(off, robotsTxt(true), pages, false).map((f) => f.file)).toEqual(['robots.txt']);
    expect(checkHeaders(on, robotsTxt(false), pages, false).map((f) => f.what)).toEqual([
      'X-Robots-Tag: noindex, nofollow is missing, and SITE_INDEXABLE is false',
    ]);
    expect(checkHeaders(off, robotsTxt(false), pages, true).map((f) => f.file)).toEqual(['_headers', 'robots.txt']);
  });

  it('refuses a template it cannot fill, and a line Pages would not read', () => {
    expect(() => fillHeaders('/*\n  X-Robots-Tag: noindex\n', { hashes: [], indexable: false })).toThrow(HASHES_TOKEN);
    expect(() =>
      fillHeaders(template, {
        hashes: Array(60)
          .fill("'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='")
          .map((h, i) => h + i),
        indexable: false,
      }),
    ).toThrow(/2000/);
  });

  it('flags an unhashed inline script, unsafe sources and missing headers', () => {
    const filled = fillHeaders(template, { hashes: [], indexable: false });
    expect(checkHeaders(filled, robotsTxt(false), [{ file: 'index.html', html }], false)[0]?.what).toMatch(
      /inline script the CSP does not allow/,
    );
    const loose = filled.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");
    expect(checkHeaders(loose, robotsTxt(false), [], false).map((f) => f.what)).toContain("the CSP's script-src allows 'unsafe-inline'");
    const bare = filled.replace(/^\s*Referrer-Policy:.*$/m, '');
    expect(checkHeaders(bare, robotsTxt(false), [], false).map((f) => f.what)).toContain('Referrer-Policy is missing');
    expect(checkHeaders(`${filled}\n__LEFT__`, robotsTxt(false), [], false).map((f) => f.what)).toContain('a placeholder was never filled');
  });
});

describe('hosting: the pre-deploy gate', () => {
  it('reads the denylist and refuses an empty one', () => {
    expect(parseDenylist('# names\nAcme Widgets\n\n  Globex # a client\n')).toEqual(['Acme Widgets', 'Globex']);
    expect(() => parseDenylist('# nothing\n\n')).toThrow(/no names/);
  });

  it('matches names case-insensitively, as whole words, across spacing', () => {
    const m = denyMatchers(['Acme Widgets', 'Globex']);
    expect(deniedIn('Built for ACME   widgets in 2025', m)).toEqual([1]);
    expect(deniedIn('acme-widgets', m)).toEqual([1]);
    expect(deniedIn('GlobexCorp and Acmewidgets', m)).toEqual([]);
    expect(deniedIn('globex.', m)).toEqual([2]);
  });

  it('reads binary files as their printable text, which still carries a name in metadata', () => {
    const m = denyMatchers(['Globex', 'Ace']);
    const bytes = Buffer.concat([Buffer.from([0, 1, 2, 200]), Buffer.from('title=Globex quarterly'), Buffer.from([0, 9])]);
    expect(deniedIn(printableRuns(bytes), m)).toEqual([1]);
    expect(deniedIn(printableRuns(Buffer.from('\u0000artist: Ace\u0000')), m)).toEqual([2]);
    // A few printable bytes between others in compressed data are not text.
    expect(deniedIn(printableRuns(Buffer.from([0, 0x5b, 0x41, 0x63, 0x65, 0])), m)).toEqual([]);
  });

  it('refuses home paths, local addresses, plain http, keys and other emails', () => {
    const found = (file: string, text: string) => scanText(file, text, EMAIL).map((f) => f.what.split(' (')[0]);
    expect(found('a.js', 'x="/Users/someone/site"')).toEqual(['a home path']);
    expect(found('a.js', 'fetch("http://localhost:4400/x")')).toEqual(['a local address', 'a plain http:// URL']);
    expect(found('a.js', 'a localhost-only provider')).toEqual(['a local address']);
    expect(found('a.js', 'k="sk-abcdefghijklmnopqrstuvwxyz123"')).toEqual(['an API key']);
    expect(found('a.js', '//# sourceMappingURL=a.js.map')).toEqual(['a source map reference']);
    expect(found('a.js', 'mail someone@example.org')).toEqual(['an email that is not Harry’s personal one']);
    expect(found('a.js', `mail ${EMAIL} or see http://www.w3.org/2000/svg`)).toEqual([]);
  });

  it('keeps each reviewed exception to its exact file and its exact text', () => {
    const found = (file: string, text: string) => scanText(file, text, EMAIL).map((f) => f.what.split(' (')[0]);
    const stamps = '"dir":"~/Personal/oss/receipts/.cache/stamps/dreaming/.capture-tmp/dreaming-1"';
    expect(found('vendor/stamps/captures/dreaming.json', stamps)).toEqual([]);
    expect(found('vendor/stamps/captures/dreaming.json', '"dir":"~/Personal/lab/other"')).toEqual(['a home path']);
    expect(found('vendor/stamps/captures/gridtop.json', stamps)).toEqual(['a home path']);
    expect(found('record/studio.json', stamps)).toEqual(['a home path']);
    // The radio's bundle builds an IPv6 URL in a template literal: the source text is `http://[${e}]`.
    const radio = `a="http://json-schema.org/draft-07/schema#";b=\`http://[$\{e}]\``;
    expect(found('vendor/radio/listen-to-the-grid-radio.js', radio)).toEqual([]);
    expect(found('vendor/radio/listen-to-the-grid-radio.js', 'c="http://example.org/x"')).toEqual(['a plain http:// URL']);
    expect(found('assets/index.js', radio)).toEqual(['a plain http:// URL', 'a plain http:// URL']);
    expect(found('vendor/ort/ort-wasm-simd-threaded.mjs', 'HOME:"/home/web_user"')).toEqual([]);
    expect(found('assets/index.js', 'HOME:"/home/web_user"')).toEqual(['a home path']);
    expect(found('casts/dreaming.cast', 'cd /home/sam/code')).toEqual([]);
    expect(found('casts/dreaming.cast', 'cd /home/harry/code')).toEqual(['a home path']);
    expect(found('fonts/plex/OFL.txt', 'http://scripts.sil.org/OFL')).toEqual([]);
    expect(found('vendor/transformers/LICENSE', 'http://www.apache.org/licenses/')).toEqual([]);
    expect(found('notes.txt', 'http://scripts.sil.org/OFL')).toEqual(['a plain http:// URL']);
    expect(found('fonts/plex/OFL.txt', 'see /Users/someone')).toEqual(['a home path']);
  });
});

describe('hosting: deploy only to Harry’s personal Cloudflare account', () => {
  const account = { id: '0123456789abcdef0123456789abcdef', name: 'Personal' };
  const whoami = (over: object) => JSON.stringify({ loggedIn: true, email: EMAIL, accounts: [account], ...over });

  it('accepts exactly the personal email with one account', () => {
    expect(allowedAccount(whoami({}), EMAIL)).toEqual({ email: EMAIL, ...account });
  });

  it('refuses any other email, a near miss, no login, an API token, two accounts or unreadable output', () => {
    expect(() => allowedAccount(whoami({ email: 'someone@example.org' }), EMAIL)).toThrow(/refusing/);
    expect(() => allowedAccount(whoami({ email: EMAIL.toUpperCase() }), EMAIL)).toThrow(/refusing/);
    expect(() => allowedAccount(whoami({ email: ` ${EMAIL}` }), EMAIL)).toThrow(/refusing/);
    expect(() => allowedAccount(whoami({ loggedIn: false }), EMAIL)).toThrow(/not logged in/);
    expect(() => allowedAccount(JSON.stringify({ loggedIn: true, accounts: [account] }), EMAIL)).toThrow(/not logged in/);
    expect(() => allowedAccount(whoami({ accounts: [account, { ...account, id: 'f'.repeat(32) }] }), EMAIL)).toThrow(
      /2 Cloudflare accounts/,
    );
    expect(() => allowedAccount(whoami({ accounts: [] }), EMAIL)).toThrow(/0 Cloudflare accounts/);
    expect(() => allowedAccount('You are not authenticated.', EMAIL)).toThrow(/JSON/);
  });

  it('reads the projects and the deployment URL', () => {
    expect(projectNames(JSON.stringify([{ 'Project Name': 'harryfreeman-studio', 'Project Domains': 'x' }]))).toEqual([
      'harryfreeman-studio',
    ]);
    expect(projectNames('[]')).toEqual([]);
    expect(deploymentUrl('✨ Deployment complete! Take a peek over at https://abc123.harryfreeman-studio.pages.dev')).toBe(
      'https://abc123.harryfreeman-studio.pages.dev',
    );
    expect(deploymentUrl('nothing')).toBeNull();
  });
});
