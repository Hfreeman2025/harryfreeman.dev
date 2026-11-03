// Writes src/timeline/placeholder.json: an invented build timeline, so the replay has something
// to play until Harry supplies the real, sanitised ~/Personal/site-data/timeline.json.
// Deterministic: the same file every run. Every label in it says "placeholder".
import { writeFileSync } from 'node:fs';

const pieces = [
  'gpt-in-a-tab',
  'real-or-hallucinated',
  'agent-race',
  'grid-weather',
  'gridtop',
  'listen-to-the-grid',
  'sourced',
  'ask-the-record',
  'dreaming',
  'receipts',
];

// A small fixed generator, so the file never changes between runs.
let seed = 20261102;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

const waves = [
  { brief: 'BRIEF.md', start: Date.parse('2026-10-31T09:00:00Z') },
  { brief: 'V2.md', start: Date.parse('2026-11-01T09:00:00Z') },
  { brief: 'V3.md', start: Date.parse('2026-11-02T08:00:00Z') },
];

const minutes = (n) => n * 60_000;
const events = [];
for (const wave of waves) {
  pieces.forEach((piece, i) => {
    let t = wave.start + minutes(5 * i + Math.floor(rand() * 20));
    events.push({ at: t, piece, kind: 'briefed', brief: wave.brief });
    t += minutes(3 + Math.floor(rand() * 10));
    events.push({ at: t, piece, kind: 'started' });
    const rounds = 1 + Math.floor(rand() * 3);
    for (let r = 1; r <= rounds; r++) {
      t += minutes(60 + Math.floor(rand() * 150));
      events.push({ at: t, piece, kind: 'submitted' });
      t += minutes(10 + Math.floor(rand() * 25));
      events.push({ at: t, piece, kind: r < rounds ? 'returned' : 'accepted' });
    }
  });
}
events.sort((a, b) => a.at - b.at);

const timeline = {
  schema: 'studio-timeline/1',
  placeholder: true,
  description: 'Placeholder: invented to lay out the replay. It is not the real build record; the real timeline will replace it.',
  actors: [
    { id: 'brief', role: 'brief', kind: 'person', label: 'Harry, who wrote the briefs' },
    ...pieces.map((_, i) => ({
      id: `builder-${String.fromCharCode(97 + i)}`,
      role: 'builder',
      kind: 'other',
      label: 'Placeholder builder',
    })),
    { id: 'reviewer', role: 'reviewer', kind: 'other', label: 'Placeholder reviewer' },
  ],
  pieces: pieces.map((piece, i) => ({ piece, builder: `builder-${String.fromCharCode(97 + i)}`, reviewer: 'reviewer' })),
  events: events.map((e) => ({ ...e, at: new Date(e.at).toISOString().replace('.000Z', 'Z') })),
};

writeFileSync(new URL('../src/timeline/placeholder.json', import.meta.url), `${JSON.stringify(timeline, null, 2)}\n`);
console.log(`placeholder timeline: ${timeline.events.length} events`);
