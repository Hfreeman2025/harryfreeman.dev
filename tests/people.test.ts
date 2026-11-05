import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { PIECE_IDS } from '../src/content/pieces';
import { DESKS, REVIEW, staticBoxes } from '../src/scene/layout';
import { builderPose, type Figure, pose, reviewerPose, seatedFigure, standingFigure } from '../src/scene/people';
import placeholder from '../src/timeline/placeholder.json' with { type: 'json' };
import { Replay } from '../src/timeline/replay';
import { parseTimeline } from '../src/timeline/schema';

// The real timeline when it is on this machine, the placeholder otherwise: both are replayed.
const realPath = join(homedir(), 'Personal', 'site-data', 'timeline.json');
const timelines = [
  parseTimeline(placeholder),
  ...(existsSync(realPath) ? [parseTimeline(JSON.parse(readFileSync(realPath, 'utf8')))] : []),
];

/** Touching is how a figure sits on a chair or rests its arms on a desk; only overlap beyond 2 mm counts. */
const TOUCH = 0.002;
function overlaps(a: Box3, b: Box3, slack = TOUCH): boolean {
  return (
    a.min.x < b.max.x - slack &&
    b.min.x < a.max.x - slack &&
    a.min.y < b.max.y - slack &&
    b.min.y < a.max.y - slack &&
    a.min.z < b.max.z - slack &&
    b.min.z < a.max.z - slack
  );
}
function parts(figure: Figure): Box3[] {
  figure.group.updateMatrixWorld(true);
  const boxes: Box3[] = [];
  figure.group.traverse((o) => {
    if ('isMesh' in o && o.isMesh) boxes.push(new Box3().setFromObject(o, true));
  });
  return boxes;
}
const whole = (figure: Figure): Box3 => parts(figure).reduce((acc, b) => acc.union(b), new Box3());

const furniture = staticBoxes().map((b) => new Box3(new Vector3(...b.min), new Vector3(...b.max)));

function crew() {
  const builders = DESKS.map((d) => {
    const f = seatedFigure();
    f.group.position.set(d.seat[0], 0, d.seat[1]);
    return f;
  });
  const reviewer = standingFigure();
  reviewer.group.position.set(REVIEW.reviewer[0], 0, REVIEW.reviewer[1]);
  return { builders, reviewer };
}

describe('scale figures', () => {
  it('stand about 1.75 m tall, sit with their heads at about 1.4 m', () => {
    const { builders, reviewer } = crew();
    const standing = whole(reviewer);
    const seated = whole(builders[0] as Figure);
    expect(standing.max.y).toBeGreaterThan(1.7);
    expect(standing.max.y).toBeLessThan(1.85);
    expect(seated.max.y).toBeGreaterThan(1.3);
    expect(seated.max.y).toBeLessThan(1.45);
    expect(standing.min.y).toBeGreaterThanOrEqual(-TOUCH);
    expect(seated.min.y).toBeGreaterThanOrEqual(-TOUCH);
  });

  for (const [n, timeline] of timelines.entries()) {
    it(`never overlap each other or the furniture, at any step of the ${n === 0 ? 'placeholder' : 'real'} replay`, () => {
      const replay = new Replay(timeline);
      const { builders, reviewer } = crew();
      const all = [...builders, reviewer];
      let steps = 0;
      for (let s = 0; s <= replay.duration; s += 0.1) {
        let reviewing = false;
        PIECE_IDS.forEach((piece, i) => {
          const phase = replay.phase(piece, s);
          if (phase.kind === 'at-review' && phase.reviewing) reviewing = true;
          const b = builderPose(phase.kind === 'building', s, i);
          pose(builders[i] as Figure, b.turn, b.lean, b.nod);
        });
        const r = reviewerPose(reviewing);
        pose(reviewer, r.turn, r.lean, r.nod);

        const boxes = all.map(whole);
        for (let a = 0; a < boxes.length; a++)
          for (let b = a + 1; b < boxes.length; b++) {
            if (overlaps(boxes[a] as Box3, boxes[b] as Box3, 0)) throw new Error(`figures ${a} and ${b} overlap at ${s.toFixed(1)} s`);
          }
        all.forEach((figure, f) => {
          for (const part of parts(figure))
            for (const [k, item] of furniture.entries()) {
              if (overlaps(part, item))
                throw new Error(`figure ${f} meets furniture box ${k} (${staticBoxes()[k]?.material}) at ${s.toFixed(1)} s`);
            }
        });
        steps++;
      }
      expect(steps).toBeGreaterThan(100);
    });
  }

  it('the check catches a figure pushed into its desk or onto another figure', () => {
    const { builders } = crew();
    const f = builders[0] as Figure;
    const d = DESKS[0];
    if (!d) throw new Error('no desks');
    f.group.position.set(d.seat[0], 0, d.seat[1] - 0.35);
    expect(parts(f).some((part) => furniture.some((item) => overlaps(part, item)))).toBe(true);
    const other = builders[1] as Figure;
    other.group.position.copy(f.group.position).add(new Vector3(0.2, 0, 0));
    expect(overlaps(whole(f), whole(other), 0)).toBe(true);
  });
});
