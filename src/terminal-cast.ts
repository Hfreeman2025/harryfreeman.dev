// asciicast v2, the format the terminal pieces recorded themselves in. Parsed, not cast.

import * as v from 'valibot';

const Header = v.object({
  version: v.literal(2),
  width: v.pipe(v.number(), v.integer(), v.minValue(20), v.maxValue(400)),
  height: v.pipe(v.number(), v.integer(), v.minValue(5), v.maxValue(200)),
});
const Event = v.tuple([v.pipe(v.number(), v.minValue(0)), v.string(), v.string()]);

export interface Cast {
  readonly width: number;
  readonly height: number;
  readonly events: ReadonlyArray<readonly [number, string]>;
}

export function parseCast(text: string): Cast {
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  const first = lines.shift();
  if (!first) throw new Error('the recording is empty');
  const header = v.parse(Header, JSON.parse(first));
  const events: Array<readonly [number, string]> = [];
  let last = 0;
  let shift = 0;
  for (const line of lines) {
    const [time, kind, data] = v.parse(Event, JSON.parse(line));
    if (kind !== 'o') continue;
    // Long idle gaps are shortened, as the projects' own players do.
    const gap = time - last;
    if (gap > 2.5) shift += gap - 2.5;
    last = time;
    events.push([time - shift, data]);
  }
  // Leaving the alternate screen at the very end would blank the replay; stop on the last frame.
  while (events.length > 0 && /\u001b\[\?1049l/.test(events.at(-1)?.[1] ?? '')) events.pop();
  return { width: header.width, height: header.height, events };
}
