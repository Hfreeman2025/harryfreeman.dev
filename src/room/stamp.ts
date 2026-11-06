// Receipt stamps on the folders, in both renderings: each tool's latest signed check results, checked
// in your browser by the receipts project's own verifier (vendored as built in public/vendor/stamps,
// see SOURCE.json there). The stamp's face shows what the stamp claims, labelled as a claim; nothing
// shows as verified until the check has run and said so. The signature and the checks are kept apart:
// a stamp can be validly signed and record failed checks.

import * as v from 'valibot';
import type { PieceId } from '../content/pieces';

const BASE = '/vendor/stamps/';

const Check = v.looseObject({ kind: v.string(), status: v.string(), resultLine: v.string() });
const Entry = v.looseObject({
  tool: v.string(),
  commit: v.string(),
  /** Captured before the tool's history was rewritten for publication: the commit does not exist publicly. */
  prePublication: v.boolean(),
  status: v.string(),
  capture: v.string(),
  envelope: v.string(),
  resultLine: v.string(),
  checks: v.array(Check),
});
const IndexSchema = v.looseObject({ entries: v.array(Entry), history: v.array(Entry), supplemental: v.array(Entry) });
const KeySchema = v.looseObject({ algorithm: v.literal('Ed25519'), encoding: v.literal('base64'), raw: v.string(), keyId: v.string() });
type Entry = v.InferOutput<typeof Entry>;

/**
 * The supplements to one capture. Each is signed on its own, at the same commit, and named after the
 * capture it supplements with a label in words (captures/<capture>-eval-outside-sandbox.json), so a
 * tool's current stamp never shows an earlier capture's supplement. Its signed statement names that
 * capture too (tests/stamps.test.ts holds the two together).
 */
export function supplementsOf<E extends { tool: string; commit: string; capture: string }>(of: E, supplemental: readonly E[]): E[] {
  const stem = of.capture.replace(/\.json$/, '-');
  return supplemental.filter(
    (s) =>
      s.tool === of.tool &&
      s.commit === of.commit &&
      s.capture.startsWith(stem) &&
      /^[a-z]+(?:-[a-z]+)*\.json$/.test(s.capture.slice(stem.length)),
  );
}

/** The signed statement, as the verifier has already validated it; parsed again here for display. */
const Run = v.looseObject({
  kind: v.string(),
  argv: v.nullable(v.array(v.string())),
  status: v.string(),
  exitCode: v.nullable(v.number()),
  signal: v.nullable(v.string()),
  startedAt: v.nullable(v.string()),
  endedAt: v.nullable(v.string()),
  resultLine: v.string(),
  reason: v.nullable(v.string()),
});
const StatementSchema = v.looseObject({
  predicate: v.looseObject({
    tool: v.string(),
    repository: v.object({ commit: v.string(), tree: v.string() }),
    capturedAt: v.string(),
    attestedAt: v.string(),
    status: v.string(),
    capture: v.looseObject({
      method: v.string(),
      network: v.string(),
      policyExceptions: v.optional(v.array(v.string())),
      notes: v.optional(v.array(v.string())),
      runtime: v.looseObject({ node: v.string(), npm: v.string(), platform: v.string(), arch: v.string() }),
    }),
    setup: v.array(Run),
    checks: v.array(Run),
  }),
});
type Statement = v.InferOutput<typeof StatementSchema>;

interface VerifyResult {
  readonly valid: boolean;
  readonly reason: string;
  readonly statement: unknown;
  readonly payload: string | null;
  readonly checksPassed: boolean | null;
  readonly keyFingerprint: string | null;
}
interface VerifierModule {
  verifyStamp(envelope: unknown, publicKey: unknown): Promise<VerifyResult>;
}

interface Packet {
  readonly index: v.InferOutput<typeof IndexSchema>;
  readonly key: v.InferOutput<typeof KeySchema>;
  readonly verifier: VerifierModule;
}
let packet: Promise<Packet> | null = null;

const getJson = async (path: string): Promise<unknown> => {
  const response = await fetch(BASE + path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
};

function loadPacket(): Promise<Packet> {
  packet ??= Promise.all([
    getJson('index.json').then((j) => v.parse(IndexSchema, j)),
    getJson('public-key.json').then((j) => v.parse(KeySchema, j)),
    import(/* @vite-ignore */ new URL(`${BASE}verify-stamp.mjs`, location.href).href) as Promise<VerifierModule>,
  ]).then(([index, key, verifier]) => ({ index, key, verifier }));
  packet.catch(() => {
    packet = null;
  });
  return packet;
}

/** Whether this browser's WebCrypto can check Ed25519 at all; any other failure is left to the verifier. */
async function ed25519(key: Packet['key']): Promise<boolean> {
  if (!globalThis.crypto?.subtle) return false;
  try {
    const raw = Uint8Array.from(atob(key.raw), (c) => c.charCodeAt(0));
    await crypto.subtle.importKey('raw', raw, 'Ed25519', false, ['verify']);
    return true;
  } catch (error) {
    return !(error instanceof DOMException && error.name === 'NotSupportedError');
  }
}

// ---------- DOM helpers ----------
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
const short = (commit: string) => commit.slice(0, 7);
const when = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'Europe/London',
  timeZoneName: 'short',
});
const at = (iso: string | null) => (iso ? when.format(Date.parse(iso)) : '—');
const seconds = (a: string | null, b: string | null) => (a && b ? `${((Date.parse(b) - Date.parse(a)) / 1000).toFixed(1)} s` : '');
const capturedHow = (s: Statement) => {
  const c = s.predicate.capture;
  const method = c.method === 'fresh-local-clone-non-browser' ? 'a fresh local clone, non-browser commands' : c.method;
  const network =
    c.network === 'loopback-only'
      ? 'external network denied (loopback only)'
      : c.network === 'not-os-isolated'
        ? 'not network-isolated'
        : c.network;
  return `${method}; ${network}${c.policyExceptions?.length ? `; sandbox exception: ${c.policyExceptions.join(', ')}` : ''}`;
};

/** What the checks did, in a line: "unit-tests exited 1: Tests 1 failed | 455 passed …". */
function failure(s: Statement): string {
  const exit = (c: Statement['predicate']['checks'][number]) =>
    c.exitCode !== null ? `exited ${c.exitCode}` : `stopped by ${c.signal ?? 'a signal'}`;
  const failed = [...s.predicate.setup, ...s.predicate.checks].filter((c) => c.status === 'failed');
  if (failed.length) return failed.map((c) => `${c.kind} ${exit(c)}: ${c.resultLine}`).join('; ');
  // Incomplete: say which ran and which did not.
  return s.predicate.checks
    .map((c) => (c.status === 'not-run' ? `${c.kind} not run` : `${c.kind} ${c.status} (${c.resultLine})`))
    .join('; ');
}

/** The verified outcome: the signature first, then, separately, what the checks did, then the statement. */
function outcome(result: VerifyResult, expected: PieceId, compact: boolean): HTMLElement {
  const box = el('div', 'stamp__outcome');
  const parsed = result.valid ? v.safeParse(StatementSchema, result.statement) : null;
  const statement = parsed?.success ? parsed.output : null;
  if (!result.valid || !statement) {
    box.dataset.result = 'invalid';
    box.append(
      el('p', 'stamp__sig stamp__sig--bad', `Signature not valid: ${result.valid ? 'the statement could not be read' : result.reason}.`),
    );
    box.append(el('p', 'stamp__aside', 'Nothing from this stamp is shown as fact.'));
    return box;
  }
  if (statement.predicate.tool !== expected) {
    box.dataset.result = 'invalid';
    box.append(el('p', 'stamp__sig stamp__sig--bad', `This stamp is signed, but for ${statement.predicate.tool}, not this tool.`));
    return box;
  }
  box.dataset.result = 'valid';
  box.append(el('p', 'stamp__sig', `Signature valid, signed by key ${(result.keyFingerprint ?? '').slice(0, 8)}…`));
  const checks = el(
    'p',
    `stamp__checks stamp__checks--${result.checksPassed ? 'passed' : statement.predicate.status === 'incomplete' ? 'incomplete' : 'failed'}`,
  );
  checks.textContent = result.checksPassed ? 'Checks passed.' : `Checks ${statement.predicate.status}: ${failure(statement)}.`;
  box.append(checks);
  if (compact) return box;

  const facts = el('dl', 'stamp__facts');
  const fact = (term: string, value: string) => facts.append(el('dt', '', term), el('dd', '', value));
  fact('Commit', `${statement.predicate.repository.commit} (tree ${short(statement.predicate.repository.tree)})`);
  fact('Captured', at(statement.predicate.capturedAt));
  fact('Signed', at(statement.predicate.attestedAt));
  fact('How', capturedHow(statement));
  const r = statement.predicate.capture.runtime;
  fact('Runtime', `Node ${r.node}, npm ${r.npm}, ${r.platform} ${r.arch}`);
  box.append(facts);

  const runs = el('ol', 'stamp__runs');
  for (const run of [...statement.predicate.setup, ...statement.predicate.checks]) {
    const item = el('li', `stamp__run stamp__run--${run.status}`);
    const head = el('p', 'stamp__run-head');
    head.append(
      el('span', 'stamp__run-kind', run.kind),
      el(
        'span',
        'stamp__run-exit',
        run.status === 'not-run' ? 'not run' : run.exitCode !== null ? `exit ${run.exitCode}` : `signal ${run.signal ?? '?'}`,
      ),
    );
    item.append(head);
    if (run.argv) item.append(el('code', 'stamp__run-argv', run.argv.join(' ')));
    item.append(el('p', 'stamp__run-line', run.resultLine));
    if (run.startedAt) item.append(el('p', 'stamp__run-when', `${at(run.startedAt)}, ${seconds(run.startedAt, run.endedAt)}`));
    if (run.status === 'failed' && run.reason) item.append(el('p', 'stamp__run-reason', run.reason));
    runs.append(item);
  }
  box.append(runs);

  if (statement.predicate.capture.notes?.length) {
    const notes = el('details', 'stamp__more');
    notes.append(el('summary', '', 'Capture notes, as signed'));
    const list = el('ul');
    for (const note of statement.predicate.capture.notes) list.append(el('li', '', note));
    notes.append(list);
    box.append(notes);
  }
  if (result.payload) {
    const exact = el('details', 'stamp__more');
    exact.append(el('summary', '', 'The exact signed statement'));
    exact.append(el('pre', 'stamp__payload', result.payload));
    box.append(exact);
  }
  return box;
}

/** Runs one check: says it is checking, and shows the outcome only once the verifier has answered. */
async function check(
  envelopePath: string,
  expected: PieceId,
  status: HTMLElement,
  place: HTMLElement,
  compact: boolean,
  isCurrent: () => boolean,
): Promise<void> {
  status.textContent = 'Checking the signature in your browser…';
  status.dataset.state = 'checking';
  place.replaceChildren();
  try {
    const { key, verifier } = await loadPacket();
    if (!(await ed25519(key))) {
      if (!isCurrent()) return;
      status.textContent = 'This browser can’t check Ed25519 signatures, so this stamp is not verified here.';
      status.dataset.state = 'unsupported';
      return;
    }
    const envelope = await getJson(envelopePath);
    const result = await verifier.verifyStamp(envelope, key);
    if (!isCurrent()) return;
    status.textContent = result.valid ? 'Checked in your browser.' : 'Checked in your browser: not valid.';
    status.dataset.state = result.valid ? 'valid' : 'invalid';
    const shown = outcome(result, expected, compact);
    place.replaceChildren(shown);
    if (!compact) inkCard(place, shown.dataset.result === 'valid' ? (result.checksPassed ? 'passed' : statusOf(result)) : 'not-valid');
  } catch (error) {
    if (!isCurrent()) return;
    status.textContent = `Could not check the stamp: ${error instanceof Error ? error.message : String(error)}.`;
    status.dataset.state = 'error';
  }
}

/** What a verified statement says about its checks: failed or incomplete (only called when it did not pass). */
function statusOf(result: VerifyResult): 'failed' | 'incomplete' {
  const parsed = v.safeParse(StatementSchema, result.statement);
  return parsed.success && parsed.output.predicate.status === 'incomplete' ? 'incomplete' : 'failed';
}

const INK_TEXT = { passed: 'PASSED', failed: 'FAILED', incomplete: 'INCOMPLETE', 'not-valid': 'NOT VALID' } as const;

/**
 * The stamp's ink on the card, only once the check has resolved: PASSED or FAILED for a valid signature
 * (the checks' result), NOT VALID when the signature is not.
 */
function inkCard(place: HTMLElement, ink: keyof typeof INK_TEXT): void {
  const mark = el('p', `stamp__ink stamp__ink--${ink}`, INK_TEXT[ink]);
  mark.setAttribute('aria-hidden', 'true');
  place.prepend(mark);
}

let generation = 0;

/** Fills a folder's stamp slot for a tool. */
export function renderStamp(piece: PieceId): void {
  const slot = document.getElementById('card-stamp');
  if (!slot) return;
  const mine = ++generation;
  const isCurrent = () => mine === generation;
  slot.hidden = false;
  slot.replaceChildren(el('p', 'stamp__aside', 'Loading its receipt stamp…'));
  void loadPacket().then(
    ({ index }) => {
      if (!isCurrent()) return;
      const entry = index.entries.find((e) => e.tool === piece);
      if (!entry) {
        slot.replaceChildren(el('p', 'stamp__aside', 'No receipt stamp for this tool.'));
        return;
      }
      slot.replaceChildren(stampFor(piece, entry, index, isCurrent));
    },
    (error: unknown) => {
      if (isCurrent())
        slot.replaceChildren(
          el('p', 'stamp__aside', `The receipt stamps could not be loaded (${error instanceof Error ? error.message : String(error)}).`),
        );
    },
  );
}

function face(entry: Entry, tampered: boolean): HTMLButtonElement {
  const button = el('button', 'stamp__face');
  button.type = 'button';
  button.dataset.result = entry.status;
  const ring = el('span', 'stamp__ring');
  ring.append(
    el('span', 'stamp__result', entry.status.toUpperCase()),
    el('span', 'stamp__tool', entry.tool),
    el('span', 'stamp__commit', `at ${short(entry.commit)}`),
  );
  button.append(ring, el('span', 'stamp__line', entry.resultLine.replace(/^[^—]*— /, '')));
  button.append(el('span', 'stamp__action', tampered ? 'Check the changed copy' : 'Check the signature'));
  return button;
}

function stampFor(piece: PieceId, entry: Entry, index: Packet['index'], isCurrent: () => boolean): HTMLElement {
  const section = el('section', 'stamp');
  section.setAttribute('aria-label', 'Receipt stamp');
  section.append(el('h4', 'stamp__heading', 'Receipt stamp'));
  const status = el('p', 'stamp__status', 'What the stamp claims; not checked yet.');
  status.setAttribute('role', 'status');
  status.dataset.state = 'unchecked';
  const place = el('div', 'stamp__place');
  let tampered = false;
  let button = face(entry, false);
  const run = () => {
    const supplements = supplementsOf(entry, index.supplemental);
    void check(tampered ? 'tampered.dsse.json' : entry.envelope, piece, status, place, false, isCurrent).then(() => {
      // A supplement is signed on its own, and shown beside the stamp, never instead of it.
      if (tampered || !isCurrent() || status.dataset.state !== 'valid') return;
      // Right after the checks line, so the failure and its supplement are read together.
      const after = place.querySelector('.stamp__checks');
      for (const s of supplements.reverse()) {
        const box = supplement(piece, s, isCurrent);
        if (after) after.after(box);
        else place.append(box);
      }
    });
  };
  const wire = (b: HTMLButtonElement) => b.addEventListener('click', run);
  wire(button);
  section.append(button, status, place);

  // The one-byte change: the shipped tampered copy of gpt-in-a-tab's stamp (unit-test exit 0 → 1).
  if (piece === 'gpt-in-a-tab') {
    const label = el('label', 'stamp__tamper');
    const box = el('input');
    box.type = 'checkbox';
    label.append(box, document.createTextNode(' Change one byte: the unit tests’ exit code, 0 to 1'));
    box.addEventListener('change', () => {
      tampered = box.checked;
      const next = face(entry, tampered);
      if (tampered) next.dataset.tampered = 'true';
      wire(next);
      button.replaceWith(next);
      button = next;
      place.replaceChildren();
      status.textContent = tampered ? 'A copy with one byte changed; not checked yet.' : 'What the stamp claims; not checked yet.';
      status.dataset.state = 'unchecked';
    });
    section.append(label);
  }

  const earlier = index.history.filter((h) => h.tool === piece);
  if (earlier.length) {
    const history = el('details', 'stamp__history');
    history.append(el('summary', '', `Earlier captures (${earlier.length}), each signed separately`));
    if (earlier.some((h) => h.prePublication))
      history.append(
        el(
          'p',
          'stamp__pre-note',
          'These were captured before this tool’s history was rewritten for publication, so their commits do not ' +
            'exist publicly. Their signatures still check.',
        ),
      );
    const list = el('ul');
    for (const h of earlier) {
      const item = el('li', 'stamp__earlier');
      item.dataset.result = h.status;
      item.append(
        el('span', 'stamp__earlier-result', h.status.toUpperCase()),
        el('span', 'stamp__earlier-commit', short(h.commit)),
        el('span', 'stamp__earlier-line', h.resultLine.replace(/^[^—]*— /, '')),
      );
      const b = el('button', 'stamp__earlier-check', 'Check');
      b.type = 'button';
      const s = el('span', 'stamp__earlier-status');
      s.setAttribute('role', 'status');
      const p = el('div');
      b.addEventListener(
        'click',
        () =>
          void check(h.envelope, piece, s, p, true, isCurrent).then(() => {
            if (!isCurrent() || s.dataset.state !== 'valid') return;
            for (const sup of supplementsOf(h, index.supplemental)) p.append(supplement(piece, sup, isCurrent));
          }),
      );
      item.append(b);
      if (h.prePublication) item.append(el('span', 'stamp__earlier-pre', 'pre-publication commit, not public'));
      item.append(s, p);
      list.append(item);
    }
    history.append(list);
    section.append(history);
  }

  const note = el('p', 'stamp__note', 'A stamp proves who signed which check results, at which commit; not that the tool is correct. ');
  const link = el('a', '', 'What a stamp proves');
  link.href = '/stamps.html';
  note.append(link);
  section.append(note);
  return section;
}

function supplement(piece: PieceId, entry: Entry, isCurrent: () => boolean): HTMLElement {
  const box = el('div', 'stamp__supplement');
  box.append(el('h5', 'stamp__supplement-title', 'Supplement: run outside the capture sandbox, not network-isolated'));
  box.append(el('p', 'stamp__line', entry.resultLine.replace(/^[^—]*— /, '')));
  const status = el('p', 'stamp__status');
  status.setAttribute('role', 'status');
  const place = el('div');
  box.append(status, place);
  void check(entry.envelope, piece, status, place, true, isCurrent);
  return box;
}
