// The room's light follows the GB grid. One request to the NESO Carbon Intensity API (no key,
// CC BY 4.0) for the current national half-hour; the reading is validated, banded as Grid Weather
// bands it, and turns into a light and a wall sign. When the call fails or the reading is not for
// now, the sign says grid data is unavailable and the light stays neutral: nothing is invented, and
// nothing cached is shown as current.

import * as v from 'valibot';

export const GRID_SOURCE = {
  url: 'https://api.carbonintensity.org.uk/intensity',
  name: 'NESO Carbon Intensity API',
  licence: 'CC BY 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
} as const;

/** Grid Weather's bands, in gCO₂/kWh: lower below 100, moderate 100–199, higher 200–299, very high 300+. */
export type Band = 'lower' | 'moderate' | 'higher' | 'very high';
export function bandOf(g: number): Band {
  if (g < 100) return 'lower';
  if (g < 200) return 'moderate';
  if (g < 300) return 'higher';
  return 'very high';
}

const Instant = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/),
  v.transform((s) => Date.parse(s)),
  v.check((n) => Number.isFinite(n)),
);
const Gram = v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(2000)));
const ResponseSchema = v.object({
  data: v.pipe(
    v.array(v.object({ from: Instant, to: Instant, intensity: v.object({ forecast: Gram, actual: Gram, index: v.string() }) })),
    v.minLength(1),
  ),
});

export interface GridReading {
  readonly value: number;
  /** NESO publishes a forecast first and the measured estimate later. */
  readonly kind: 'actual' | 'forecast';
  readonly from: number;
  readonly to: number;
  readonly band: Band;
}

const HALF_HOUR = 30 * 60_000;

/** Parse a response; throws unless it holds a value for the half-hour around `now`. */
export function parseReading(json: unknown, now: number): GridReading {
  const parsed = v.safeParse(ResponseSchema, json);
  if (!parsed.success) throw new Error('the grid service sent something unexpected');
  const latest = parsed.output.data.at(-1);
  if (!latest) throw new Error('the grid service sent no data');
  if (latest.to - latest.from !== HALF_HOUR) throw new Error('the grid service sent an interval that is not a half-hour');
  // The current half-hour, or the one just finished while NESO publishes the next.
  if (latest.from > now || latest.to < now - HALF_HOUR) throw new Error('the grid service’s latest half-hour is not current');
  const value = latest.intensity.actual ?? latest.intensity.forecast;
  if (value === null) throw new Error('the grid service has no value for this half-hour yet');
  return { value, kind: latest.intensity.actual === null ? 'forecast' : 'actual', from: latest.from, to: latest.to, band: bandOf(value) };
}

export async function fetchReading(fetcher: typeof fetch = fetch, now = Date.now(), timeoutMs = 8000): Promise<GridReading> {
  const response = await fetcher(GRID_SOURCE.url, {
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`the grid service returned HTTP ${response.status}`);
  return parseReading(await response.json(), now);
}

/** The generation mix for the current half-hour: the shares the office window shows (wind, solar). */
export interface GridMix {
  readonly wind: number;
  readonly solar: number;
  readonly from: number;
  readonly to: number;
}
const MixSchema = v.object({
  data: v.object({
    from: Instant,
    to: Instant,
    generationmix: v.pipe(
      v.array(v.object({ fuel: v.string(), perc: v.pipe(v.number(), v.minValue(0), v.maxValue(100)) })),
      v.minLength(1),
    ),
  }),
});

/** Parse a /generation response; throws unless it is for the half-hour around `now` and names wind and solar. */
export function parseMix(json: unknown, now: number): GridMix {
  const parsed = v.safeParse(MixSchema, json);
  if (!parsed.success) throw new Error('the grid service sent an unexpected generation mix');
  const { from, to, generationmix } = parsed.output.data;
  if (to - from !== HALF_HOUR) throw new Error('the generation mix is not for a half-hour');
  if (from > now || to < now - HALF_HOUR) throw new Error('the generation mix is not current');
  const share = (fuel: string) => generationmix.find((g) => g.fuel === fuel)?.perc;
  const wind = share('wind');
  const solar = share('solar');
  if (wind === undefined || solar === undefined) throw new Error('the generation mix names no wind or solar');
  return { wind, solar, from, to };
}

export async function fetchMix(fetcher: typeof fetch = fetch, now = Date.now(), timeoutMs = 8000): Promise<GridMix> {
  const response = await fetcher('https://api.carbonintensity.org.uk/generation', {
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`the grid service returned HTTP ${response.status}`);
  return parseMix(await response.json(), now);
}

const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London', timeZoneName: 'short' });
const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

export interface SignText {
  readonly headline: string;
  readonly detail: string;
  /** What the room's light is doing; only the 3D room shows it. */
  readonly light: string;
  readonly source: string;
  readonly state: 'live' | 'unavailable' | 'loading';
}

export function signFor(reading: GridReading | null, problem?: string): SignText {
  const source = `${GRID_SOURCE.name}, ${GRID_SOURCE.licence}`;
  if (reading === null && problem === undefined) {
    return {
      headline: 'Reading the grid…',
      detail: 'Asking for the current half-hour.',
      light: 'The light waits for a reading.',
      source,
      state: 'loading',
    };
  }
  if (reading === null) {
    return {
      headline: 'Grid data unavailable',
      detail: `No current reading: ${problem ?? 'no reason given'}.`,
      light: 'The light stays neutral.',
      source,
      state: 'unavailable',
    };
  }
  const when = `${clock.format(reading.from)}–${time.format(reading.to)}`;
  return {
    headline: `${reading.value} gCO₂/kWh, ${reading.band}`,
    detail: `Great Britain, ${when}, ${reading.kind === 'actual' ? 'measured estimate' : 'forecast'}.`,
    light: 'The light in here warms and dims as carbon rises.',
    source,
    state: 'live',
  };
}

/** A reading stops being current half an hour after its half-hour ends (see parseReading). */
export function expiresAt(reading: GridReading): number {
  return reading.to + HALF_HOUR;
}

export interface RoomLight {
  /** Linear multipliers for the lamp's colour (r, g, b) and its strength. */
  readonly colour: readonly [number, number, number];
  readonly level: number;
}

/** No reading: the lamp's own neutral white. */
export const NEUTRAL_LIGHT: RoomLight = { colour: [1, 0.945, 0.86], level: 1 };

/** Carbon rising from 0 to 400 g warms the light from a clean white to amber and dims it by a third. */
export function lightFor(reading: GridReading | null): RoomLight {
  if (reading === null) return NEUTRAL_LIGHT;
  const t = Math.max(0, Math.min(1, reading.value / 400));
  const mix = (a: number, b: number) => a + (b - a) * t;
  return { colour: [1, mix(0.975, 0.78), mix(0.94, 0.52)], level: mix(1.08, 0.7) };
}
