import { describe, expect, it } from 'vitest';
import { bandOf, expiresAt, fetchReading, lightFor, NEUTRAL_LIGHT, parseReading, signFor } from '../src/room/grid';

const now = Date.parse('2026-11-04T15:40:00Z');
const response = (over: Record<string, unknown> = {}, intensity: Record<string, unknown> = {}) => ({
  data: [
    {
      from: '2026-11-04T15:30Z',
      to: '2026-11-04T16:00Z',
      intensity: { forecast: 182, actual: 175, index: 'moderate', ...intensity },
      ...over,
    },
  ],
});

describe('bands, as Grid Weather draws them', () => {
  it('splits at 100, 200 and 300 gCO₂/kWh', () => {
    expect([0, 99, 100, 199, 200, 299, 300, 900].map(bandOf)).toEqual([
      'lower',
      'lower',
      'moderate',
      'moderate',
      'higher',
      'higher',
      'very high',
      'very high',
    ]);
  });
});

describe('reading the current half-hour', () => {
  it('takes the measured estimate when there is one, else the forecast', () => {
    expect(parseReading(response(), now)).toMatchObject({ value: 175, kind: 'actual', band: 'moderate' });
    expect(parseReading(response({}, { actual: null }), now)).toMatchObject({ value: 182, kind: 'forecast' });
  });

  it('refuses anything not for now: an old half-hour, a future one, a wrong interval', () => {
    expect(() => parseReading(response({ from: '2026-11-04T14:30Z', to: '2026-11-04T15:00Z' }), now)).toThrow(/not current/);
    expect(() => parseReading(response({ from: '2026-11-04T16:00Z', to: '2026-11-04T16:30Z' }), now)).toThrow(/not current/);
    expect(() => parseReading(response({ from: '2026-11-04T15:30Z', to: '2026-11-04T16:30Z' }), now)).toThrow(/half-hour/);
  });

  it('accepts the half-hour just finished while the next is published, until it expires', () => {
    const reading = parseReading(response(), Date.parse('2026-11-04T16:10:00Z'));
    expect(reading.value).toBe(175);
    expect(expiresAt(reading)).toBe(Date.parse('2026-11-04T16:30:00Z'));
    expect(() => parseReading(response(), Date.parse('2026-11-04T16:31:00Z'))).toThrow(/not current/);
  });

  it('refuses malformed or empty responses and missing values', () => {
    expect(() => parseReading({ data: [] }, now)).toThrow();
    expect(() => parseReading({ nope: true }, now)).toThrow(/unexpected/);
    expect(() => parseReading(response({}, { actual: null, forecast: null }), now)).toThrow(/no value/);
    expect(() => parseReading(response({}, { actual: -5 }), now)).toThrow(/unexpected/);
    expect(() => parseReading(response({ from: '2026-11-04 15:30' }), now)).toThrow(/unexpected/);
  });

  it('fails explicitly on an HTTP error', async () => {
    const failing = (async () => new Response('down', { status: 503 })) as typeof fetch;
    await expect(fetchReading(failing, now)).rejects.toThrow(/HTTP 503/);
    const ok = (async () => new Response(JSON.stringify(response()), { status: 200 })) as typeof fetch;
    await expect(fetchReading(ok, now)).resolves.toMatchObject({ value: 175 });
  });
});

describe('the sign and the light', () => {
  it('shows the value, the half-hour and the source, or says data is unavailable', () => {
    const live = signFor(parseReading(response(), now));
    expect(live.headline).toBe('175 gCO₂/kWh, moderate');
    expect(live.detail).toContain('15:30–16:00 GMT');
    expect(live.detail).toContain('measured estimate');
    expect(live.source).toBe('NESO Carbon Intensity API, CC BY 4.0');
    expect(live.light).toContain('warms');
    const down = signFor(null, 'the grid service returned HTTP 503');
    expect(down).toMatchObject({ headline: 'Grid data unavailable', state: 'unavailable', light: 'The light stays neutral.' });
    expect(down.detail).toBe('No current reading: the grid service returned HTTP 503.');
    expect(`${down.headline} ${down.detail}`).not.toMatch(/\d+ gCO/);
  });

  it('warms and dims as carbon rises, and stays neutral without a reading', () => {
    const at = (value: number) => lightFor({ value, kind: 'actual', from: 0, to: 0, band: bandOf(value) });
    expect(at(50).level).toBeGreaterThan(at(250).level);
    expect(at(250).colour[2]).toBeLessThan(at(50).colour[2]);
    expect(at(1000)).toEqual(at(400));
    expect(lightFor(null)).toBe(NEUTRAL_LIGHT);
  });
});
