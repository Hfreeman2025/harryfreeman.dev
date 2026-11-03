// Assembles the build timeline from evidence only, as read on 3 November 2026:
//   - creation and modification times of the brief files and each repository's files
//     (SPEC.md, the first file a builder created, shots/<version> folders, DONE and report files);
//   - the DONE lines and "done" times visible in each builder's herdr pane.
// No session transcripts were read. File times move when files are rewritten, so this records the
// evidence as a dated table rather than re-reading the file system. Every time is an inference
// from that evidence and each note says so.
//   npx tsx scripts/assemble-timeline.ts   → ~/Personal/site-data/timeline.draft.json

import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { PieceId } from '../src/content/pieces';
import { parseTimeline } from '../src/timeline/schema';

type Kind = 'briefed' | 'started' | 'submitted' | 'returned' | 'accepted';
interface Row {
  at: string;
  kind: Kind;
  note: string;
  brief?: 'BRIEF.md' | 'V2.md' | 'V3.md';
}

const V2_OUT = '2026-11-01T15:55:12Z';
const V2_NOTE = 'inferred: V2.md written at this time; it opens with Harry’s verdict on v1';
const V3_WAVE1 = '2026-11-02T14:18:00Z';
const V3_WAVE1_NOTE = 'inferred: the first V3 work in any repo is 14:18 (agent-race); V3.md’s own time is a later rewrite';
const V3_WAVE2 = '2026-11-02T15:35:31Z';
const V3_WAVE2_NOTE = 'inferred: V3.md rewritten at this time with the Wave 2 sections';
const RETURN_ROUND = '2026-11-01T18:05:00Z';
const RETURN_NOTE = 'inferred: v2.1 rework began in six repos between 18:05 and 18:09, so review sent v2 back just before';

const brief = (at: string, note: string, b: NonNullable<Row['brief']>): Row => ({ at, kind: 'briefed', note, brief: b });
const row = (at: string, kind: Kind, note: string): Row => ({ at, kind, note });

/** One builder's v1, using its own SPEC.md and first file. */
function v1(spec: string, first: string, firstFile: string, done: string, doneNote: string): Row[] {
  return [
    brief(spec, 'inferred: its SPEC.md was created at this time', 'BRIEF.md'),
    row(first, 'started', `inferred: its first file (${firstFile}) was created at this time`),
    row(done, 'submitted', doneNote),
    row(V2_OUT, 'accepted', 'inferred: the next brief, V2.md, built on this version'),
  ];
}
const v2Brief = (started: string, startNote: string): Row[] => [brief(V2_OUT, V2_NOTE, 'V2.md'), row(started, 'started', startNote)];
const v3Brief = (wave: 1 | 2, started: string, startNote: string): Row[] => [
  row(wave === 1 ? V3_WAVE1 : V3_WAVE2, 'accepted', 'inferred: the next brief, V3.md, built on this version'),
  brief(wave === 1 ? V3_WAVE1 : V3_WAVE2, wave === 1 ? V3_WAVE1_NOTE : V3_WAVE2_NOTE, 'V3.md'),
  row(started, 'started', startNote),
];
const lastWrite = 'inferred: the newest file still dated before V2 was written at this time';

const EVENTS: Record<PieceId, Row[]> = {
  'gpt-in-a-tab': [
    ...v1('2026-11-01T10:51:55Z', '2026-11-01T11:09:11Z', 'package.json', '2026-11-01T12:36:12Z', lastWrite),
    ...v2Brief('2026-11-01T16:35:17Z', 'inferred: first v2 screenshot'),
    row('2026-11-01T18:05:43Z', 'submitted', 'inferred: last v2 screenshot'),
    ...v3Brief(1, '2026-11-02T15:31:56Z', 'inferred: first v3 screenshot'),
    row('2026-11-02T15:44:54Z', 'submitted', 'inferred: last v3 screenshot'),
  ],
  'real-or-hallucinated': [
    ...v1(
      '2026-11-01T11:41:20Z',
      '2026-11-01T11:44:26Z',
      'package.json',
      '2026-11-01T11:58:11Z',
      'inferred: docs/EVIDENCE.md created and the last v1 screenshot taken',
    ),
    ...v2Brief('2026-11-01T15:56:23Z', 'inferred: first v2 screenshot'),
    row('2026-11-01T16:49:31Z', 'submitted', 'inferred: docs/V2-EVIDENCE.md last written'),
    row(RETURN_ROUND, 'returned', RETURN_NOTE),
    row('2026-11-01T18:09:10Z', 'submitted', 'inferred: docs/V2.1-EVIDENCE.md created'),
    ...v3Brief(1, '2026-11-02T15:27:53Z', 'inferred: first v3 screenshot'),
    row('2026-11-02T19:16:14Z', 'submitted', 'inferred: docs/V3-EVIDENCE.md last written'),
  ],
  'agent-race': [
    ...v1('2026-11-01T11:41:39Z', '2026-11-01T11:45:10Z', 'package.json', '2026-11-01T13:07:09Z', lastWrite),
    ...v2Brief('2026-11-01T15:57:33Z', 'inferred: first v2 screenshot'),
    row('2026-11-01T16:45:31Z', 'submitted', 'inferred: docs/v2-verification.md last written'),
    row(RETURN_ROUND, 'returned', RETURN_NOTE),
    row('2026-11-01T18:35:28Z', 'submitted', 'inferred: docs/v2.1-verification.md last written'),
    ...v3Brief(1, '2026-11-02T14:18:39Z', 'inferred: first v3 screenshot'),
    row(
      '2026-11-02T15:01:00Z',
      'submitted',
      'inferred: its pane shows “DONE v3: Agent Race → Flight recorder”, work ending 15:01; date from v3 files',
    ),
  ],
  'grid-weather': [
    ...v1(
      '2026-11-01T11:41:28Z',
      '2026-11-01T11:44:09Z',
      'data/current-response.json',
      '2026-11-01T12:31:49Z',
      'inferred: last v1 recording report written',
    ),
    ...v2Brief('2026-11-01T16:01:55Z', 'inferred: IDENTITY.md created'),
    row('2026-11-01T17:44:17Z', 'submitted', 'inferred: shots/v2/DONE.md created'),
    row(RETURN_ROUND, 'returned', RETURN_NOTE),
    row('2026-11-01T18:19:55Z', 'submitted', 'inferred: shots/v2/DONE-v2.1.md created'),
    ...v3Brief(1, '2026-11-02T14:55:22Z', 'inferred: first v3 screenshot'),
    row(
      '2026-11-02T16:44:00Z',
      'submitted',
      'inferred: its pane shows “DONE v3: Grid Weather”, work ending 16:44; v3 critique last written 16:42',
    ),
  ],
  gridtop: [
    ...v1('2026-11-01T10:51:47Z', '2026-11-01T10:54:51Z', 'a test fixture', '2026-11-01T11:46:55Z', lastWrite),
    ...v2Brief('2026-11-01T15:57:19Z', 'inferred: first v2 capture'),
    row('2026-11-01T17:00:01Z', 'submitted', 'inferred: DONE-V2.md created'),
    row(RETURN_ROUND, 'returned', RETURN_NOTE),
    row('2026-11-01T18:11:58Z', 'submitted', 'inferred: DONE-V2.1.md created'),
    ...v3Brief(1, '2026-11-02T14:26:38Z', 'inferred: first v3 capture'),
    row('2026-11-02T15:31:51Z', 'submitted', 'inferred: DONE-V3.md created'),
  ],
  'listen-to-the-grid': [
    ...v1('2026-11-01T10:51:38Z', '2026-11-01T11:00:51Z', 'package.json', '2026-11-01T12:36:45Z', 'inferred: last v1 screenshot'),
    ...v2Brief('2026-11-01T16:48:54Z', 'inferred: first v2 screenshot'),
    row('2026-11-02T10:41:11Z', 'submitted', 'inferred: last v2 screenshot, the next morning'),
    ...v3Brief(2, '2026-11-02T16:07:22Z', 'inferred: first v3 screenshot'),
    row(
      '2026-11-03T15:31:24Z',
      'submitted',
      'inferred: last v3 screenshot; status: loudness round done, awaiting Harry’s swap into the shared link',
    ),
  ],
  sourced: [
    ...v1('2026-11-01T11:41:09Z', '2026-11-01T11:44:38Z', 'package.json', '2026-11-01T12:07:00Z', 'inferred: v1 browser report written'),
    ...v2Brief('2026-11-01T15:56:09Z', 'inferred: first v2 screenshot'),
    row('2026-11-01T17:38:30Z', 'submitted', 'inferred: last v2 screenshot before the v2.1 round'),
    row(RETURN_ROUND, 'returned', RETURN_NOTE),
    row('2026-11-01T18:21:28Z', 'submitted', 'inferred: docs/V2.1-REPORT.md last written'),
    row('2026-11-01T18:28:00Z', 'returned', 'inferred: v2.2 rework began 18:28; its README cites “the coordinator’s layout corrections”'),
    row('2026-11-01T18:32:55Z', 'submitted', 'inferred: docs/V2.2-REPORT.md created'),
    row('2026-11-01T18:36:00Z', 'returned', 'inferred: v2.3 rework began 18:36'),
    row('2026-11-01T18:50:01Z', 'submitted', 'inferred: docs/V2.3-REPORT.md created'),
    ...v3Brief(2, '2026-11-02T15:38:05Z', 'inferred: first v3 screenshot; a Claude pane took over the build for V3'),
    row('2026-11-02T17:06:00Z', 'submitted', 'inferred: its V3 pane shows “DONE v3: Sourced”, done Monday 17:06; docs/V3-REPORT.md 17:05'),
  ],
  'ask-the-record': [
    ...v1('2026-11-01T10:37:37Z', '2026-11-01T10:49:24Z', '.gitignore', '2026-11-01T13:03:40Z', lastWrite),
    ...v2Brief('2026-11-01T16:00:25Z', 'inferred: first v2 screenshot'),
    row('2026-11-01T18:08:55Z', 'submitted', 'inferred: last v2 screenshot'),
    ...v3Brief(2, '2026-11-02T16:24:47Z', 'inferred: first v3 screenshot'),
    row('2026-11-02T18:32:10Z', 'submitted', 'inferred: last v3 screenshot on 2 Nov; its pane reports DONE v3'),
  ],
  dreaming: [
    ...v1('2026-11-01T10:38:02Z', '2026-11-01T10:47:23Z', '.gitignore', '2026-11-01T12:27:15Z', lastWrite),
    ...v2Brief('2026-11-01T16:46:11Z', 'inferred: first v2 screenshot'),
    row('2026-11-01T18:20:19Z', 'submitted', 'inferred: last v2 screenshot'),
    ...v3Brief(2, '2026-11-02T17:22:02Z', 'inferred: first v3 file'),
    row('2026-11-03T14:24:08Z', 'submitted', 'inferred: last v3 screenshot, which may include later font work; reported “v3 done”'),
  ],
  receipts: [
    ...v1('2026-11-01T10:37:50Z', '2026-11-01T10:40:32Z', '.gitignore', '2026-11-01T13:24:56Z', lastWrite),
    ...v2Brief('2026-11-01T15:57:03Z', 'inferred: IDENTITY.md created'),
    row('2026-11-01T16:21:17Z', 'submitted', 'inferred: docs/v2-report.md last written'),
    row(RETURN_ROUND, 'returned', RETURN_NOTE),
    row('2026-11-01T18:09:06Z', 'submitted', 'inferred: shots/v2.1/critique.md last written'),
    ...v3Brief(1, '2026-11-02T14:22:20Z', 'inferred: first v3 file'),
    row('2026-11-02T15:29:20Z', 'submitted', 'inferred: v3 critiques and docs/v3-report.md created'),
  ],
};

const BUILDERS: Record<PieceId, { id: string; kind: 'claude' | 'codex' | 'other'; label: string }> = {
  'gpt-in-a-tab': { id: 'lab-gpt', kind: 'claude', label: 'Claude, in the lab-gpt pane' },
  'real-or-hallucinated': { id: 'lab-roh', kind: 'codex', label: 'Codex, in the lab-roh pane' },
  'agent-race': { id: 'lab-race', kind: 'codex', label: 'Codex, in the lab-race pane' },
  'grid-weather': { id: 'lab-weather', kind: 'codex', label: 'Codex, in the lab-weather pane' },
  gridtop: { id: 'lab-gridtop', kind: 'codex', label: 'Codex, in the lab-gridtop pane' },
  'listen-to-the-grid': { id: 'lab-grid', kind: 'claude', label: 'Claude, in the lab-grid pane' },
  sourced: { id: 'lab-sourced', kind: 'other', label: 'Codex, then Claude for V3 (lab-sourced panes)' },
  'ask-the-record': { id: 'oss-ask', kind: 'claude', label: 'Claude, in the oss-ask pane' },
  dreaming: { id: 'oss-dreaming', kind: 'claude', label: 'Claude, in the oss-dreaming pane' },
  receipts: { id: 'oss-receipts', kind: 'codex', label: 'Codex, in the oss-receipts pane' },
};

const pieces = Object.keys(EVENTS) as PieceId[];
const events = pieces
  .flatMap((piece) => EVENTS[piece].map((r) => ({ at: r.at, piece, kind: r.kind, ...(r.brief ? { brief: r.brief } : {}), note: r.note })))
  .sort((a, b) => Date.parse(a.at) - Date.parse(b.at)); // stable: same-time events keep their order

const timeline = {
  schema: 'studio-timeline/1',
  placeholder: false,
  description:
    'Draft, assembled 3 Nov 2026 from file times in each repo and the DONE lines in the builders’ panes. Every time is inferred; each note names its evidence. Builder kinds are the panes’ current agents.',
  actors: [
    { id: 'harry', role: 'brief', kind: 'person', label: 'Harry, who wrote the briefs' },
    ...pieces.map((p) => ({ id: BUILDERS[p].id, role: 'builder', kind: BUILDERS[p].kind, label: BUILDERS[p].label })),
    { id: 'coordinator', role: 'reviewer', kind: 'other', label: 'Harry and his coordinating session' },
  ],
  pieces: pieces.map((piece) => ({ piece, builder: BUILDERS[piece].id, reviewer: 'coordinator' })),
  events,
};

const parsed = parseTimeline(timeline); // throws with a reason if the evidence breaks the rules
const out = join(homedir(), 'Personal', 'site-data');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'timeline.draft.json'), `${JSON.stringify(parsed, null, 2)}\n`);
console.log(`timeline.draft.json: ${parsed.events.length} events, ${parsed.actors.length} actors`);
