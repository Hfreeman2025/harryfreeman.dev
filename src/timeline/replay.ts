// Turns the build timeline into a replay the studio can play. Real time is compressed (a night
// between events becomes a few seconds), but order is kept and every hand-off gets enough scene
// time to be seen: a walk to the review desk, the review itself, the walk back.

import type { PieceId } from '../content/pieces';
import type { EventKind, Timeline } from './schema';

/** Scene seconds for each movement. */
export const WALK_TO_REVIEW = 3.2;
export const REVIEW_MIN = 1.6;
export const WALK_BACK = 2.8;
export const BUILD_MIN = 1.4;
/** Hold at the end before the replay starts again. */
export const END_HOLD = 6;

export interface Beat {
  readonly piece: PieceId;
  readonly kind: EventKind;
  /** Seconds from the start of the replay. */
  readonly scene: number;
  /** The real instant, ms since the epoch. */
  readonly real: number;
  readonly note?: string;
  readonly brief?: string;
}

export type Phase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'building'; readonly round: number; readonly returned: boolean }
  | { readonly kind: 'to-review'; readonly progress: number; readonly round: number }
  | { readonly kind: 'at-review'; readonly reviewing: boolean; readonly due: number; readonly round: number }
  | { readonly kind: 'back'; readonly progress: number; readonly outcome: 'returned' | 'accepted'; readonly round: number }
  | { readonly kind: 'done'; readonly round: number };

/** The minimum scene time between two consecutive events for the same piece. */
export function minSpan(previous: EventKind | undefined, next: EventKind): number {
  if (previous === 'submitted') return WALK_TO_REVIEW + REVIEW_MIN;
  if (previous === 'returned' || previous === 'accepted') return WALK_BACK + (next === 'submitted' ? BUILD_MIN : 0.4);
  if (previous === 'started' && next === 'submitted') return BUILD_MIN;
  return 0;
}

/** A real gap in ms becomes a scene gap in seconds: short gaps stay short, long ones saturate. */
export function sceneGap(realMs: number): number {
  const tau = 45 * 60_000;
  return 0.3 + 2.4 * (1 - Math.exp(-Math.max(0, realMs) / tau));
}

export function buildBeats(timeline: Timeline): Beat[] {
  const beats: Beat[] = [];
  const lastScene = new Map<PieceId, number>();
  const lastKind = new Map<PieceId, EventKind>();
  let scene = 0;
  let real = Number.NaN;
  for (const event of timeline.events) {
    const at = Date.parse(event.at);
    if (beats.length > 0) scene += sceneGap(at - real);
    const previous = lastKind.get(event.piece);
    const floor = (lastScene.get(event.piece) ?? Number.NEGATIVE_INFINITY) + minSpan(previous, event.kind);
    scene = Math.max(scene, floor);
    real = at;
    lastScene.set(event.piece, scene);
    lastKind.set(event.piece, event.kind);
    beats.push({
      piece: event.piece,
      kind: event.kind,
      scene,
      real: at,
      ...(event.note !== undefined ? { note: event.note } : {}),
      ...(event.brief !== undefined ? { brief: event.brief } : {}),
    });
  }
  return beats;
}

export class Replay {
  readonly beats: readonly Beat[];
  readonly duration: number;
  readonly #byPiece = new Map<PieceId, Beat[]>();

  constructor(timeline: Timeline) {
    this.beats = buildBeats(timeline);
    const last = this.beats.at(-1);
    this.duration = (last?.scene ?? 0) + (last ? WALK_BACK : 0) + END_HOLD;
    for (const beat of this.beats) {
      const list = this.#byPiece.get(beat.piece) ?? [];
      list.push(beat);
      this.#byPiece.set(beat.piece, list);
    }
  }

  /** The real instant shown for scene time s, interpolated between events. */
  realAt(s: number): number | null {
    const beats = this.beats;
    const first = beats[0];
    if (!first) return null;
    if (s <= first.scene) return first.real;
    for (let i = 1; i < beats.length; i++) {
      const b = beats[i];
      const a = beats[i - 1];
      if (!a || !b) continue;
      if (s <= b.scene) {
        const span = b.scene - a.scene;
        const f = span > 0 ? (s - a.scene) / span : 1;
        return a.real + (b.real - a.real) * f;
      }
    }
    return beats.at(-1)?.real ?? null;
  }

  /** The most recent beat at or before s, for the caption. */
  latest(s: number): Beat | null {
    let found: Beat | null = null;
    for (const beat of this.beats) {
      if (beat.scene > s) break;
      found = beat;
    }
    return found;
  }

  phase(piece: PieceId, s: number): Phase {
    const beats = this.#byPiece.get(piece) ?? [];
    let index = -1;
    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i];
      if (beat && beat.scene <= s) index = i;
      else break;
    }
    if (index < 0) return { kind: 'idle' };
    const current = beats[index];
    if (!current) return { kind: 'idle' };
    let round = 0;
    for (let i = 0; i <= index; i++) {
      const beat = beats[i];
      if (beat?.kind === 'submitted') round += 1;
      if (beat?.kind === 'started') round = 0;
    }
    const next = beats[index + 1];
    const since = s - current.scene;
    switch (current.kind) {
      case 'briefed':
        return { kind: 'idle' };
      case 'started':
        return { kind: 'building', round, returned: false };
      case 'submitted': {
        if (since < WALK_TO_REVIEW) return { kind: 'to-review', progress: since / WALK_TO_REVIEW, round };
        const due = next ? next.scene : Number.POSITIVE_INFINITY;
        return { kind: 'at-review', reviewing: due - s <= REVIEW_MIN, due, round };
      }
      case 'returned':
      case 'accepted': {
        if (since < WALK_BACK) return { kind: 'back', progress: since / WALK_BACK, outcome: current.kind, round };
        return current.kind === 'returned' ? { kind: 'building', round, returned: true } : { kind: 'done', round };
      }
    }
  }
}
