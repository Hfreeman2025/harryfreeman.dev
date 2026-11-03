// The ten pieces on the desks. Text is summarised from each project's README and IDENTITY.md
// (read-only, 2 Nov 2026); checks are as each README reports them, not re-run here.

export const PIECE_IDS = [
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
] as const;

export type PieceId = (typeof PIECE_IDS)[number];

export interface BriefAsk {
  /** The brief document, as Harry wrote it. */
  readonly doc: 'BRIEF.md' | 'V2.md' | 'V3.md';
  /** What that brief asked of this piece, in one line. */
  readonly ask: string;
}

export interface Piece {
  readonly id: PieceId;
  readonly title: string;
  /** Web pieces open in a browser; terminal pieces open their recorded terminal session. */
  readonly kind: 'web' | 'terminal';
  readonly folder: 'lab' | 'oss';
  /** One plain sentence: what it is. */
  readonly line: string;
  /** How it works, plainly. */
  readonly technique: string;
  readonly citation?: { readonly label: string; readonly href: string };
  /** As reported in the project's README. */
  readonly checks: readonly string[];
  readonly brief: readonly BriefAsk[];
  /** The command that runs it locally, for terminal pieces. */
  readonly run?: string;
  /** The piece's own screen colour, used for the monitor before its loop loads. */
  readonly screen: string;
}

const SHARED_LAB: BriefAsk = {
  doc: 'BRIEF.md',
  ask: 'A wow within five seconds, finish that reads as craft, honest data, strict types and real tests.',
};
const SHARED_OSS: BriefAsk = {
  doc: 'BRIEF.md',
  ask: 'Tools that make AI checkable: strict TypeScript, validation at every boundary, no fake success.',
};

export const PIECES: readonly Piece[] = [
  {
    id: 'gpt-in-a-tab',
    title: 'GPT in a tab',
    kind: 'web',
    folder: 'lab',
    line: 'A small transformer trains in your browser tab on hand-written WebGPU kernels, and you watch the moment it learns to copy.',
    technique:
      'No machine-learning library: every kernel is hand-written WGSL. A repeated-sequence test runs during training and names the step a head becomes an induction head; afterwards you can knock out heads, patch activations and read the residual stream through a sparse autoencoder trained on the GPU.',
    citation: {
      label: 'Olsson et al. 2022, In-context Learning and Induction Heads',
      href: 'https://transformer-circuits.pub/2022/in-context-learning-and-induction-heads/index.html',
    },
    checks: [
      '48/48 CPU reference tests, including float64 gradient checks for every operation',
      'Every GPU kernel against the CPU reference: 36/36 in Chromium and in WebKit',
      'Knocking out the copying heads stops copying, 40 of 40 to 0 of 40, in a real browser',
    ],
    brief: [
      SHARED_LAB,
      { doc: 'V2.md', ask: 'A lab instrument, not a magazine. Scrub through its mind, checkpoint by checkpoint.' },
      { doc: 'V3.md', ask: 'A microscope: induction heads forming live, a sparse autoencoder, causality you can touch.' },
    ],
    screen: '#08090a',
  },
  {
    id: 'real-or-hallucinated',
    title: 'Real or Hallucinated?',
    kind: 'web',
    folder: 'lab',
    line: 'A daily round of five cited claims, some fabricated, each settled by the original source.',
    technique:
      'Fabrications are marked up like an editor’s proof, with the invented phrase struck through and corrected in the margin; real claims show the source passage in context. The lie detector asks a small in-browser model the same question five times and measures how far the answers disagree in meaning.',
    citation: {
      label: 'Farquhar et al., Nature 2024, Detecting hallucinations using semantic entropy',
      href: 'https://www.nature.com/articles/s41586-024-07421-0',
    },
    checks: [
      'npm run verify fetches all 18 source pages and all 70 quotes must match, with no cache fallback',
      'Schema rejection, exact proof spans, London dates across clock changes and blocked storage are tested',
      'The detector’s recorded evaluation is published on the page, unflattering numbers included',
    ],
    brief: [
      SHARED_LAB,
      { doc: 'V2.md', ask: 'A fact-check desk. The anatomy of a fabrication, marked up like an editor’s proof.' },
      { doc: 'V3.md', ask: 'A lie detector: semantic entropy with an in-browser model, and its real accuracy.' },
    ],
    screen: '#f2f2ef',
  },
  {
    id: 'agent-race',
    title: 'Agent Race',
    kind: 'web',
    folder: 'lab',
    line: 'Two coding agents get the same bug in fresh sandboxes on one clock, and their real recorded runs replay as a timing screen and a flight recorder.',
    technique:
      'Each changed line is linked back to the earlier reads and outputs that contain its identifiers, a backward slice over the recorded tool calls, with every link labelled inferred. The recordings are signed with Ed25519 and verified in your browser: change one byte and the signature fails.',
    citation: { label: 'Weiser, Program Slicing, ICSE 1981', href: 'https://doi.org/10.5555/800078.802557' },
    checks: [
      'Recorded 1 Nov 2026: both agents passed all five hidden tests; first verified finish at 41.5 s',
      '51 of 124 changed lines have an earlier lexical match; causal accuracy is stated as unknown',
      'One gate: strict TypeScript, Biome, tests, the sandbox check, licences and audit',
    ],
    brief: [
      SHARED_LAB,
      { doc: 'V2.md', ask: 'A motorsport broadcast, with live commentary written by rules from the real events.' },
      { doc: 'V3.md', ask: 'A flight recorder: a causal trace of each run, with signatures checked in the browser.' },
    ],
    screen: '#14160f',
  },
  {
    id: 'grid-weather',
    title: 'Grid Weather',
    kind: 'web',
    folder: 'lab',
    line: 'Great Britain’s carbon forecast as a TV weather chart, with the real wind field moving behind it.',
    technique:
      'Wind at 100 metres from Open-Meteo is carried by more than a hundred thousand GPU particles under the regional carbon map. A rule-based presenter tours the next 48 hours and shows the exact numbers behind every caption.',
    checks: [
      'Every caption shows the source values it used; forecast frames are hatched and labelled',
      'Validated API responses, a dated saved snapshot when offline, never presented as live',
      'Falls back to an SVG chart when WebGL2 is unavailable, with the presenter intact',
    ],
    brief: [
      SHARED_LAB,
      { doc: 'V2.md', ask: 'A TV weather broadcast. The forecast, presented, with every caption derivable from the numbers.' },
      { doc: 'V3.md', ask: 'The real weather behind it: the wind field as GPU particles, and a forecaster scored against NESO.' },
    ],
    screen: '#0f2a2c',
  },
  {
    id: 'gridtop',
    title: 'gridtop',
    kind: 'terminal',
    folder: 'lab',
    line: 'A terminal tool that waits for the cleanest window in the regional electricity forecast, then runs your command.',
    technique:
      'It scores every window of the requested length in NESO’s 48-hour regional forecast, counts down to the cleanest start, then passes through input, output, signals and the exit code. Grams of carbon appear only when you give it an energy estimate.',
    checks: [
      'cargo fmt, clippy with warnings denied, and the test suite, all locked',
      'Native pseudo-terminal checks for Ctrl-C, SIGTERM, resizing and cleanup after a panic',
      'No forecast means an explicit error, unless you pass --now-if-unavailable',
    ],
    brief: [
      SHARED_LAB,
      { doc: 'V2.md', ask: 'Great Britain in your terminal: fourteen regions rasterised from the real boundaries.' },
      { doc: 'V3.md', ask: 'A carbon-aware runner people would actually install.' },
    ],
    run: 'gridtop run --demo --dry-run --watch --for 2h --watts 800 -- cargo test --release',
    screen: '#0f1712',
  },
  {
    id: 'listen-to-the-grid',
    title: 'Listen to the Grid',
    kind: 'web',
    folder: 'lab',
    line: 'Great Britain’s electricity grid played live as an orchestral score, engraved note by note as it sounds.',
    technique:
      'Each source of power has its own staff and voice, louder the bigger its share, and carbon intensity chooses the key. Any day since May 2018 can be pressed as a record: a minute of audio rendered offline in your browser, with the day’s score as its sleeve.',
    checks: [
      'Unit tests for the composer: in key, spellable rhythms, phrases that come home, clock changes',
      'Offline renders measured for clipping, levels and phrasing',
      'The test automation is proved silent: no browser it drives opens an audio device',
    ],
    brief: [
      SHARED_LAB,
      { doc: 'V2.md', ask: 'An engraved orchestral score. Make it sound good, and press any day as a record.' },
      { doc: 'V3.md', ask: 'A fair A/B: loudness-matched to ITU-R BS.1770 between the real grid and the ossia.' },
    ],
    screen: '#f4efe6',
  },
  {
    id: 'sourced',
    title: 'Sourced',
    kind: 'web',
    folder: 'lab',
    line: 'A calculation pad where every number carries its unit and its source.',
    technique:
      'A small hand-written language with dimensional analysis and provenance. Drag any number and every result recomputes; hover a result and the code it depends on lights up; a sensitivity chart ranks which inputs move the answer.',
    checks: [
      'An unsourced number is an error unless it is declared an assumption; mismatched units are errors',
      'The interpreter and the compiled JavaScript agree on all four examples',
      'Browser contracts at two sizes in Chromium, WebKit and Firefox, with zero console errors',
    ],
    brief: [
      SHARED_LAB,
      { doc: 'V2.md', ask: 'An engineer’s calculation pad. Scrubbable numbers and a sensitivity tornado.' },
      { doc: 'V3.md', ask: 'Answers as distributions: Monte Carlo in a worker and Sobol sensitivity indices.' },
    ],
    screen: '#ffffff',
  },
  {
    id: 'ask-the-record',
    title: 'ask-the-record',
    kind: 'web',
    folder: 'oss',
    line: 'A question box for any page that never writes an answer: it quotes your own content word for word, or says there is no source.',
    technique:
      'Keyword search (BM25) and sentence embeddings computed in the visitor’s browser are fused by reciprocal rank, then a published refusal policy decides whether anything supports an answer. Ask the studio, below, runs on it.',
    checks: [
      'Held-out questions, hybrid search: 77% answer precision and 91% refusal recall (10 of 11)',
      'Every record is validated on build and on load; an invalid record is never answered from',
      'The model must reproduce stored vectors to a cosine of 0.95 before it is trusted',
    ],
    brief: [
      SHARED_OSS,
      { doc: 'V2.md', ask: 'The document is the interface. Show the question travelling to the facts it matched.' },
      { doc: 'V3.md', ask: 'Answers that prove themselves: generated sentences checked one by one against their source.' },
    ],
    screen: '#e8eaed',
  },
  {
    id: 'dreaming',
    title: 'dreaming',
    kind: 'terminal',
    folder: 'oss',
    line: 'A coding agent proposes changes to its own memory each night, and in the morning you review them like a pull request.',
    technique:
      'Every proposal cites quotes from the day’s sessions, and each quote is checked against the transcript before you see it. Only approved changes are written, with a backup and an audit trail, and dreaming why traces a memory back to the conversation it came from.',
    checks: [
      'The agent runs with read-only tools and no MCP servers, and a test proves it',
      'Quotes must match whole words in the cited message; a person’s edits are never overwritten',
      'The review writes nothing until you submit, and applies exactly the diff it showed',
    ],
    brief: [
      SHARED_OSS,
      { doc: 'V2.md', ask: 'The morning review, like a pull request, and dreaming why for any memory’s provenance.' },
      { doc: 'V3.md', ask: 'Memory you can measure: run a task suite with and without a proposed memory.' },
    ],
    run: 'dreaming review',
    screen: '#0f1418',
  },
  {
    id: 'receipts',
    title: 'receipts',
    kind: 'web',
    folder: 'oss',
    line: 'Coding agents must back claims like “tests pass” with a recorded command, or a stop hook blocks them.',
    technique:
      'Each claim is checked against the command ledger and the current code, so “nothing has run since your last edit” is caught. Evidence is signed as an in-toto Statement in a DSSE envelope with Ed25519 and can be verified on another machine.',
    citation: {
      label: 'in-toto Attestation Framework, Statement v1',
      href: 'https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md',
    },
    checks: [
      'Claim extraction on blind held-out sets: 94–97% precision and 92–94% recall, first runs kept',
      'Signatures verified with WebCrypto; change one recorded byte and verification fails',
      'Keys are project-local and ignored by Git; home configuration is never touched',
    ],
    brief: [
      SHARED_OSS,
      { doc: 'V2.md', ask: 'The agent can’t say “done” without receipts: a stop hook that blocks with a reason.' },
      { doc: 'V3.md', ask: 'Sign every receipt: in-toto in DSSE with Ed25519, verified, with tamper tests.' },
    ],
    screen: '#ffffff',
  },
];

export function pieceById(id: PieceId): Piece {
  const piece = PIECES.find((p) => p.id === id);
  if (!piece) throw new Error(`unknown piece ${id}`);
  return piece;
}

export function isPieceId(value: string): value is PieceId {
  return (PIECE_IDS as readonly string[]).includes(value);
}
