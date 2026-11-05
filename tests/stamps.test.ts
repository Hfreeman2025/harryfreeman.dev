// The vendored receipt stamps, checked with the receipts project's own verifier (WebCrypto Ed25519,
// as in the browser). The pin must match the fingerprint reported separately by the receipts session.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PIECE_IDS } from '../src/content/pieces';

const dir = new URL('../public/vendor/stamps/', import.meta.url);
const json = (path: string): unknown => JSON.parse(readFileSync(new URL(path, dir), 'utf8'));
interface Result {
  valid: boolean;
  reason: string;
  checksPassed: boolean | null;
  keyFingerprint: string | null;
  statement: {
    predicate: {
      tool: string;
      status: string;
      repository: { commit: string };
      capture: { network: string };
      checks: Array<{ kind: string; status: string; reason: string | null }>;
    };
  } | null;
}
type Verify = (envelope: unknown, key: unknown) => Promise<Result>;
const verifier = (await import(new URL('verify-stamp.mjs', dir).href)) as { verifyStamp: Verify; PINNED_KEY_SHA256: string };
const key = json('public-key.json') as { raw: string; keyId: string };
const index = json('index.json') as {
  entries: Array<{ tool: string; commit: string; status: string; envelope: string }>;
  history: Array<{ tool: string; status: string; envelope: string }>;
  supplemental: Array<{ tool: string; envelope: string }>;
};

describe('receipt stamps', () => {
  it('pin the signer key the receipts session reported (e201c249…)', () => {
    expect(verifier.PINNED_KEY_SHA256.startsWith('e201c249')).toBe(true);
    expect(key.keyId).toBe(verifier.PINNED_KEY_SHA256);
    expect(createHash('sha256').update(Buffer.from(key.raw, 'base64')).digest('hex')).toBe(verifier.PINNED_KEY_SHA256);
  });

  it('give every tool a latest stamp that verifies and names that tool and commit', async () => {
    expect(index.entries.map((e) => e.tool).sort()).toEqual([...PIECE_IDS].sort());
    for (const entry of index.entries) {
      const r = await verifier.verifyStamp(json(entry.envelope), key);
      expect(r.valid, `${entry.tool}: ${r.reason}`).toBe(true);
      expect(r.statement?.predicate.tool).toBe(entry.tool);
      expect(r.statement?.predicate.repository.commit).toBe(entry.commit);
      expect(r.checksPassed).toBe(entry.status === 'passed');
    }
  });

  it('keep the signature and the checks apart: dreaming is validly signed and failed', async () => {
    const entry = index.entries.find((e) => e.tool === 'dreaming');
    if (!entry) throw new Error('no dreaming stamp');
    const r = await verifier.verifyStamp(json(entry.envelope), key);
    expect(r.valid).toBe(true);
    expect(r.checksPassed).toBe(false);
    const failed = r.statement?.predicate.checks.find((c) => c.status === 'failed');
    expect(failed?.kind).toBe('unit-tests');
    expect(failed?.reason).toMatch(/exit 1/);
    const supplement = index.supplemental.find((s) => s.tool === 'dreaming');
    if (!supplement) throw new Error('no dreaming supplement');
    const sr = await verifier.verifyStamp(json(supplement.envelope), key);
    expect(sr.valid).toBe(true);
    expect(sr.statement?.predicate.capture.network).toBe('not-os-isolated');
  });

  it('sign every earlier capture separately', async () => {
    for (const h of index.history) {
      const r = await verifier.verifyStamp(json(h.envelope), key);
      expect(r.valid, `${h.envelope}: ${r.reason}`).toBe(true);
      expect(r.statement?.predicate.status).toBe(h.status);
    }
  });

  it('reject the tampered copy and a stamp under another key', async () => {
    const r = await verifier.verifyStamp(json('tampered.dsse.json'), key);
    expect(r.valid).toBe(false);
    expect(r.statement).toBeNull();
    expect(r.checksPassed).toBeNull();
    const other = { ...key, raw: Buffer.alloc(32, 7).toString('base64') };
    const first = index.entries[0];
    if (!first) throw new Error('no stamps');
    expect((await verifier.verifyStamp(json(first.envelope), other)).valid).toBe(false);
  });
});
