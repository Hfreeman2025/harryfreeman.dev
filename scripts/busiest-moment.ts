// The replay moment with the most work at or around the review table: in the old room, when the
// figures bunched there. The before/after shots are taken at this moment. Prints seconds into the replay.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PIECE_IDS } from '../src/content/pieces';
import { Replay } from '../src/timeline/replay';
import { parseTimeline } from '../src/timeline/schema';

const replay = new Replay(parseTimeline(JSON.parse(readFileSync(join(homedir(), 'Personal', 'site-data', 'timeline.json'), 'utf8'))));
let best = { s: 0, n: -1 };
for (let s = 0; s < replay.duration; s += 0.1) {
  const n = PIECE_IDS.filter((p) => ['to-review', 'at-review', 'back'].includes(replay.phase(p, s).kind)).length;
  if (n > best.n) best = { s: Math.round(s * 10) / 10, n };
}
console.log(JSON.stringify(best));
