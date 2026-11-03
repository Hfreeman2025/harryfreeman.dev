import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import placeholder from '../src/timeline/placeholder.json' with { type: 'json' };
import { BUILD_MIN, buildBeats, minSpan, REVIEW_MIN, Replay, sceneGap, WALK_BACK, WALK_TO_REVIEW } from '../src/timeline/replay';
import { parseTimeline, pieceRecord, TimelineError } from '../src/timeline/schema';

function minimal(events: unknown[], extra: Record<string, unknown> = {}) {
  return {
    schema: 'studio-timeline/1',
    placeholder: false,
    description: 'test',
    actors: [
      { id: 'b', role: 'builder', kind: 'codex', label: 'Codex' },
      { id: 'r', role: 'reviewer', kind: 'claude', label: 'Claude' },
    ],
    pieces: [{ piece: 'gridtop', builder: 'b', reviewer: 'r' }],
    events,
    ...extra,
  };
}

const at = (minute: number) => new Date(Date.UTC(2026, 10, 1, 9, minute)).toISOString();

describe('parseTimeline', () => {
  it('accepts the placeholder and keeps its label', () => {
    const t = parseTimeline(placeholder);
    expect(t.placeholder).toBe(true);
    expect(t.events.length).toBe(192);
  });

  it('accepts a minimal real timeline', () => {
    const t = parseTimeline(
      minimal([
        { at: at(0), piece: 'gridtop', kind: 'started' },
        { at: at(30), piece: 'gridtop', kind: 'submitted' },
        { at: at(40), piece: 'gridtop', kind: 'returned', note: 'sent back: no test for SIGTERM' },
        { at: at(70), piece: 'gridtop', kind: 'submitted' },
        { at: at(80), piece: 'gridtop', kind: 'accepted' },
      ]),
    );
    expect(pieceRecord(t, 'gridtop')).toMatchObject({ rounds: 2, returned: 1, accepted: true });
    expect(pieceRecord(t, 'sourced')).toBeNull();
  });

  it('rejects events out of order', () => {
    expect(() =>
      parseTimeline(
        minimal([
          { at: at(10), piece: 'gridtop', kind: 'started' },
          { at: at(5), piece: 'gridtop', kind: 'submitted' },
        ]),
      ),
    ).toThrow(/earlier than the event before it/);
  });

  it('rejects an impossible hand-off', () => {
    expect(() => parseTimeline(minimal([{ at: at(0), piece: 'gridtop', kind: 'submitted' }]))).toThrow(/cannot go from none to submitted/);
    expect(() =>
      parseTimeline(
        minimal([
          { at: at(0), piece: 'gridtop', kind: 'started' },
          { at: at(1), piece: 'gridtop', kind: 'accepted' },
        ]),
      ),
    ).toThrow(/cannot go from started to accepted/);
  });

  it('rejects unknown actors, wrong roles, unknown pieces and stray fields', () => {
    expect(() => parseTimeline(minimal([], { pieces: [{ piece: 'gridtop', builder: 'x', reviewer: 'r' }] }))).toThrow(
      /unknown builder "x"/,
    );
    expect(() => parseTimeline(minimal([], { pieces: [{ piece: 'gridtop', builder: 'r', reviewer: 'r' }] }))).toThrow(
      /its role is reviewer/,
    );
    expect(() => parseTimeline(minimal([{ at: at(0), piece: 'sourced', kind: 'started' }]))).toThrow(/not in pieces/);
    expect(() => parseTimeline(minimal([{ at: at(0), piece: 'nope', kind: 'started' }]))).toThrow(TimelineError);
    expect(() => parseTimeline({ ...minimal([]), surprise: true })).toThrow(TimelineError);
  });

  it('rejects dates without a zone and impossible dates', () => {
    expect(() => parseTimeline(minimal([{ at: '2026-11-01T09:00:00', piece: 'gridtop', kind: 'started' }]))).toThrow(/zone/);
    expect(() => parseTimeline(minimal([{ at: '2026-13-45T09:00:00Z', piece: 'gridtop', kind: 'started' }]))).toThrow(TimelineError);
  });

  it('rejects a note that is too long', () => {
    expect(() => parseTimeline(minimal([{ at: at(0), piece: 'gridtop', kind: 'started', note: 'x'.repeat(161) }]))).toThrow(TimelineError);
  });
});

describe('the documented example', () => {
  it('parses exactly as docs/TIMELINE.md shows it', () => {
    const doc = readFileSync(new URL('../docs/TIMELINE.md', import.meta.url), 'utf8');
    const json = /```json\n([\s\S]*?)```/.exec(doc)?.[1];
    const t = parseTimeline(JSON.parse(json ?? 'null'));
    expect(pieceRecord(t, 'agent-race')).toMatchObject({ rounds: 2, returned: 1, accepted: true });
  });
});

describe('replay', () => {
  const t = parseTimeline(
    minimal([
      { at: at(0), piece: 'gridtop', kind: 'started' },
      { at: at(1), piece: 'gridtop', kind: 'submitted' },
      { at: at(2), piece: 'gridtop', kind: 'returned' },
      { at: at(3), piece: 'gridtop', kind: 'submitted' },
      { at: at(600), piece: 'gridtop', kind: 'accepted' },
    ]),
  );

  it('compresses gaps: short stays short, long saturates', () => {
    expect(sceneGap(0)).toBeCloseTo(0.3, 5);
    expect(sceneGap(60_000)).toBeLessThan(0.5);
    expect(sceneGap(10 * 3_600_000)).toBeCloseTo(2.7, 2);
  });

  it('gives every hand-off time to be seen', () => {
    const beats = buildBeats(t);
    const s = beats.map((b) => b.scene);
    expect(s[1]! - s[0]!).toBeGreaterThanOrEqual(BUILD_MIN);
    expect(s[2]! - s[1]!).toBeGreaterThanOrEqual(WALK_TO_REVIEW + REVIEW_MIN);
    expect(s[3]! - s[2]!).toBeGreaterThanOrEqual(WALK_BACK + BUILD_MIN);
    expect(s[4]! - s[3]!).toBeGreaterThanOrEqual(WALK_TO_REVIEW + REVIEW_MIN);
    for (let i = 1; i < s.length; i++) expect(s[i]!).toBeGreaterThanOrEqual(s[i - 1]!);
    expect(minSpan('submitted', 'accepted')).toBe(WALK_TO_REVIEW + REVIEW_MIN);
  });

  it('walks the work to review and back with the right outcome', () => {
    const r = new Replay(t);
    const [started, submitted, returned, resubmitted, accepted] = r.beats;
    expect(r.phase('gridtop', started!.scene - 0.01)).toEqual({ kind: 'idle' });
    expect(r.phase('gridtop', started!.scene + 0.01)).toMatchObject({ kind: 'building', returned: false });
    expect(r.phase('gridtop', submitted!.scene + WALK_TO_REVIEW / 2)).toMatchObject({ kind: 'to-review', round: 1 });
    expect(r.phase('gridtop', returned!.scene - 0.1)).toMatchObject({ kind: 'at-review', reviewing: true });
    expect(r.phase('gridtop', returned!.scene + 0.1)).toMatchObject({ kind: 'back', outcome: 'returned', round: 1 });
    expect(r.phase('gridtop', resubmitted!.scene - 0.05)).toMatchObject({ kind: 'building', returned: true });
    expect(r.phase('gridtop', accepted!.scene + WALK_BACK + 0.1)).toEqual({ kind: 'done', round: 2 });
  });

  it('shows the real time between events and the latest hand-off', () => {
    const r = new Replay(t);
    const [, b1, b2] = r.beats;
    const mid = (b1!.scene + b2!.scene) / 2;
    const real = r.realAt(mid)!;
    expect(real).toBeGreaterThan(b1!.real);
    expect(real).toBeLessThan(b2!.real);
    expect(r.latest(mid)?.kind).toBe('submitted');
    expect(r.duration).toBeGreaterThan(r.beats.at(-1)!.scene);
  });

  it('plays the placeholder in a few minutes', () => {
    const r = new Replay(parseTimeline(placeholder));
    expect(r.duration).toBeGreaterThan(60);
    expect(r.duration).toBeLessThan(400);
  });
});
