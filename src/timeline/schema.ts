// The build timeline: who built which piece, who reviewed it, and every hand-off between them.
// Harry supplies the real file at ~/Personal/site-data/timeline.json; until then a placeholder,
// labelled as one everywhere it shows, stands in. The file is untrusted input: parse, don't cast.

import * as v from 'valibot';
import { PIECE_IDS, type PieceId } from '../content/pieces';

export const TIMELINE_SCHEMA = 'studio-timeline/1';

const Id = v.pipe(v.string(), v.regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'ids are lowercase letters, digits and hyphens'));

const IsoInstant = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/, 'times are ISO 8601 with a zone'),
  v.check((s) => Number.isFinite(Date.parse(s)), 'not a real date'),
);

const ActorSchema = v.strictObject({
  id: Id,
  /** brief: sets the bar; builder: builds a piece; reviewer: checks work and sends it back. */
  role: v.picklist(['brief', 'builder', 'reviewer']),
  /** What the actor is. Product names are shown as plain text. */
  kind: v.picklist(['person', 'claude', 'codex', 'other']),
  /** How the site names the actor, e.g. "Codex, lab-race pane". Never a likeness. */
  label: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)),
});

const PieceEntrySchema = v.strictObject({
  piece: v.picklist(PIECE_IDS),
  builder: Id,
  reviewer: Id,
});

export const EVENT_KINDS = ['briefed', 'started', 'submitted', 'returned', 'accepted'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

const EventSchema = v.strictObject({
  at: IsoInstant,
  piece: v.picklist(PIECE_IDS),
  kind: v.picklist(EVENT_KINDS),
  /** Which brief the work was answering at this point, if the event marks a new one. */
  brief: v.optional(v.picklist(['BRIEF.md', 'V2.md', 'V3.md'])),
  /** One short, sanitised line, e.g. "sent back: contrast below AA on the phone layout". */
  note: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(160))),
});

export const TimelineSchema = v.strictObject({
  schema: v.literal(TIMELINE_SCHEMA),
  /** True for the stand-in file; the site then labels every number that comes from it. */
  placeholder: v.boolean(),
  description: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(400)),
  actors: v.pipe(v.array(ActorSchema), v.minLength(1), v.maxLength(40)),
  pieces: v.pipe(v.array(PieceEntrySchema), v.maxLength(PIECE_IDS.length)),
  events: v.pipe(v.array(EventSchema), v.maxLength(2000)),
});

export type Timeline = v.InferOutput<typeof TimelineSchema>;
export type TimelineEvent = Timeline['events'][number];
export type Actor = Timeline['actors'][number];

export class TimelineError extends Error {
  override name = 'TimelineError';
}

// Allowed transitions for one piece. A piece can go round more than once: after acceptance a new
// brief (V2, V3) starts the next version.
const NEXT: Record<EventKind | 'none', readonly EventKind[]> = {
  none: ['briefed', 'started'],
  briefed: ['briefed', 'started'],
  started: ['submitted'],
  submitted: ['returned', 'accepted'],
  returned: ['submitted'],
  accepted: ['briefed', 'started'],
};

/** Parse and cross-check a timeline. Throws TimelineError with a reason a person can act on. */
export function parseTimeline(input: unknown): Timeline {
  const result = v.safeParse(TimelineSchema, input);
  if (!result.success) {
    const issue = result.issues[0];
    const path = issue?.path?.map((p) => String(p.key)).join('.') ?? '(root)';
    throw new TimelineError(`timeline.json is invalid at ${path}: ${issue?.message ?? 'unknown problem'}`);
  }
  const timeline = result.output;

  const actors = new Map<string, Actor>();
  for (const actor of timeline.actors) {
    if (actors.has(actor.id)) throw new TimelineError(`actor "${actor.id}" is listed twice`);
    actors.set(actor.id, actor);
  }

  const seenPieces = new Set<PieceId>();
  for (const entry of timeline.pieces) {
    if (seenPieces.has(entry.piece)) throw new TimelineError(`piece "${entry.piece}" is listed twice`);
    seenPieces.add(entry.piece);
    const builder = actors.get(entry.builder);
    if (!builder) throw new TimelineError(`piece "${entry.piece}" names unknown builder "${entry.builder}"`);
    if (builder.role !== 'builder') throw new TimelineError(`"${entry.builder}" builds "${entry.piece}" but its role is ${builder.role}`);
    const reviewer = actors.get(entry.reviewer);
    if (!reviewer) throw new TimelineError(`piece "${entry.piece}" names unknown reviewer "${entry.reviewer}"`);
    if (reviewer.role !== 'reviewer')
      throw new TimelineError(`"${entry.reviewer}" reviews "${entry.piece}" but its role is ${reviewer.role}`);
  }

  const last = new Map<PieceId, EventKind>();
  let previous = Number.NEGATIVE_INFINITY;
  timeline.events.forEach((event, index) => {
    const at = Date.parse(event.at);
    if (at < previous) throw new TimelineError(`event ${index} (${event.at}) is earlier than the event before it`);
    previous = at;
    if (!seenPieces.has(event.piece)) throw new TimelineError(`event ${index} is for "${event.piece}", which is not in pieces`);
    const before = last.get(event.piece) ?? 'none';
    if (!NEXT[before].includes(event.kind)) {
      throw new TimelineError(`event ${index}: "${event.piece}" cannot go from ${before} to ${event.kind}`);
    }
    last.set(event.piece, event.kind);
  });

  return timeline;
}

export interface PieceRecord {
  readonly builder: Actor;
  readonly reviewer: Actor;
  /** Times the work was handed to the reviewer. */
  readonly rounds: number;
  /** Times the reviewer sent it back. */
  readonly returned: number;
  readonly accepted: boolean;
  readonly briefs: readonly string[];
}

/** What the desk card and the list show for one piece, derived from the events. */
export function pieceRecord(timeline: Timeline, piece: PieceId): PieceRecord | null {
  const entry = timeline.pieces.find((p) => p.piece === piece);
  if (!entry) return null;
  const builder = timeline.actors.find((a) => a.id === entry.builder);
  const reviewer = timeline.actors.find((a) => a.id === entry.reviewer);
  if (!builder || !reviewer) return null;
  const events = timeline.events.filter((e) => e.piece === piece);
  const briefs: string[] = [];
  for (const e of events) if (e.brief && !briefs.includes(e.brief)) briefs.push(e.brief);
  const lastKind = events.at(-1)?.kind;
  return {
    builder,
    reviewer,
    rounds: events.filter((e) => e.kind === 'submitted').length,
    returned: events.filter((e) => e.kind === 'returned').length,
    accepted: lastKind === 'accepted',
    briefs,
  };
}
