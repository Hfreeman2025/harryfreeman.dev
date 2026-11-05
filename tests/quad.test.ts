import { describe, expect, it } from 'vitest';
import { mapPoint, quadTransform } from '../src/room/quad';

describe('the screen overlay transform', () => {
  it('sends the box’s corners exactly onto a keystoned monitor', () => {
    const corners = [
      [412.5, 301.25],
      [861.0, 296.0],
      [850.25, 590.5],
      [420.0, 585.0],
    ] as const;
    const t = quadTransform(640, 400, corners);
    const got = [mapPoint(t, 0, 0), mapPoint(t, 640, 0), mapPoint(t, 640, 400), mapPoint(t, 0, 400)];
    got.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(corners[i]?.[0] ?? Number.NaN, 3);
      expect(p[1]).toBeCloseTo(corners[i]?.[1] ?? Number.NaN, 3);
    });
  });

  it('is a plain scale and move for a rectangle', () => {
    const t = quadTransform(100, 50, [
      [10, 20],
      [210, 20],
      [210, 120],
      [10, 120],
    ]);
    expect(mapPoint(t, 50, 25)[0]).toBeCloseTo(110, 6);
    expect(mapPoint(t, 50, 25)[1]).toBeCloseTo(70, 6);
  });
});
