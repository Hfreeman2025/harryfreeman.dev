// What the replay caption says at a moment: the real time, the latest hand-off and its evidence.

import { pieceById } from '../content/pieces';
import type { Replay } from './replay';

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/London',
});

export function describe(kind: string, round: number, brief: string | undefined): string {
  switch (kind) {
    case 'briefed':
      return brief ? `briefed with ${brief}` : 'briefed';
    case 'started':
      return 'starts building';
    case 'submitted':
      return `hands in for review, round ${round}`;
    case 'returned':
      return 'sent back by the reviewer';
    case 'accepted':
      return 'accepted';
    default:
      return kind;
  }
}

export function captionAt(replay: Replay, s: number): { time: string; event: string; evidence: string } {
  const real = replay.realAt(s);
  const latest = replay.latest(s);
  let event = '';
  if (latest) {
    const phase = replay.phase(latest.piece, latest.scene + 0.001);
    const round = 'round' in phase ? phase.round : 0;
    event = `${pieceById(latest.piece).title} ${describe(latest.kind, round, latest.brief)}`;
  }
  return { time: real === null ? 'No events' : dateFormat.format(real), event, evidence: latest?.note ?? '' };
}
