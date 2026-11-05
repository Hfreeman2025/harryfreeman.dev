import { describe, expect, it } from 'vitest';
import { isPieceId } from '../src/content/pieces';
import { daylightAt, SOURCES, windowMotion } from '../src/desk/furnish';
import { fetchMix, parseMix } from '../src/room/grid';

const now = Date.parse('2026-11-05T15:40:00Z');
const mix = (
  over: Record<string, unknown> = {},
  fuels = [
    { fuel: 'gas', perc: 31.2 },
    { fuel: 'wind', perc: 42.5 },
    { fuel: 'solar', perc: 6.1 },
  ],
) => ({ data: { from: '2026-11-05T15:30Z', to: '2026-11-05T16:00Z', generationmix: fuels, ...over } });

describe('the generation mix, for the window', () => {
  it('reads the wind and solar shares for the current half-hour', () => {
    expect(parseMix(mix(), now)).toEqual({
      wind: 42.5,
      solar: 6.1,
      from: Date.parse('2026-11-05T15:30Z'),
      to: Date.parse('2026-11-05T16:00Z'),
    });
  });

  it('refuses a mix not for now, not a half-hour, out of range, or naming no wind or solar', () => {
    expect(() => parseMix(mix({ from: '2026-11-05T14:30Z', to: '2026-11-05T15:00Z' }), now)).toThrow(/not current/);
    expect(() => parseMix(mix({ to: '2026-11-05T16:30Z' }), now)).toThrow(/half-hour/);
    expect(() =>
      parseMix(
        mix({}, [
          { fuel: 'wind', perc: 140 },
          { fuel: 'solar', perc: 1 },
        ]),
        now,
      ),
    ).toThrow(/unexpected/);
    expect(() => parseMix(mix({}, [{ fuel: 'gas', perc: 90 }]), now)).toThrow(/no wind or solar/);
    expect(() => parseMix(mix({}, []), now)).toThrow(/unexpected/);
    expect(() => parseMix({ data: [] }, now)).toThrow(/unexpected/);
  });

  it('fails explicitly on an HTTP error', async () => {
    const failing = (async () => new Response('down', { status: 503 })) as typeof fetch;
    await expect(fetchMix(failing, now)).rejects.toThrow(/HTTP 503/);
    const ok = (async () => new Response(JSON.stringify(mix()), { status: 200 })) as typeof fetch;
    await expect(fetchMix(ok, now)).resolves.toMatchObject({ wind: 42.5, solar: 6.1 });
  });
});

describe('the window', () => {
  it('shows the visitor’s time of day', () => {
    expect([0, 5, 6, 10, 11, 16, 17, 20, 21, 23].map(daylightAt)).toEqual([
      'night',
      'night',
      'morning',
      'morning',
      'day',
      'day',
      'evening',
      'evening',
      'night',
      'night',
    ]);
  });

  it('turns the turbines with the wind share and glints the panels with solar, by day', () => {
    expect(windowMotion('day', { wind: 0, solar: 0 })).toEqual({ spin: 0.4, glint: false });
    expect(windowMotion('day', { wind: 30, solar: 20 })).toEqual({ spin: 2, glint: true });
    expect(windowMotion('day', { wind: 60, solar: 19.9 })).toEqual({ spin: 3.6, glint: false });
    expect(windowMotion('day', { wind: 85, solar: 30 }).spin).toBe(3.6);
    expect(windowMotion('night', { wind: 30, solar: 40 }).glint).toBe(false);
  });

  it('is still without a reading: no turning, no glint', () => {
    expect(windowMotion('day', null)).toEqual({ spin: 0, glint: false });
  });
});

describe('the shelf', () => {
  it('holds each source once, each naming the tools it fed', () => {
    expect(new Set(SOURCES.map((s) => s.title)).size).toBe(SOURCES.length);
    for (const source of SOURCES) {
      expect(source.title.trim()).not.toBe('');
      expect(source.by.trim()).not.toBe('');
      expect(source.fed.length).toBeGreaterThan(0);
      for (const id of source.fed) expect(isPieceId(id)).toBe(true);
    }
  });
});
