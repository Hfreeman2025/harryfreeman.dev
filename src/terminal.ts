// Plays a terminal piece's own asciicast recording in xterm.js. The recordings are the projects'
// real captures, copied unchanged into public/casts/.

import '@xterm/xterm/css/xterm.css';
import { Terminal } from '@xterm/xterm';
import { type Cast, parseCast } from './terminal-cast';

const CASTS = {
  gridtop: {
    title: 'gridtop, recorded',
    about:
      'gridtop’s own recording of its carbon-aware runner in a dry run: the real scheduler on the public NESO forecast saved on 1 November 2026, replaying its clock. No command starts.',
    run: ['gridtop run --demo --dry-run --watch --for 2h --watts 800 -- cargo test --release'],
  },
  dreaming: {
    title: 'dreaming, recorded',
    about:
      'Recorded from the real CLI in a pseudo-terminal, on synthetic data, with a fake agent standing in for the model. The keys and pauses are scripted; everything on screen is the program’s own output, and idle gaps over 2.5 seconds are shortened.',
    run: ['dreaming run', 'dreaming review', 'dreaming why prefer-pnpm'],
  },
} as const;
type CastId = keyof typeof CASTS;

const params = new URLSearchParams(location.search);
const requested = params.get('piece') ?? '';
const loop = params.has('loop');
// The bare view is the screen alone, for recording the monitor loop.
if (params.has('bare')) document.documentElement.dataset.bare = 'true';
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const title = document.getElementById('term-title');
const about = document.getElementById('term-about');
const screen = document.getElementById('term-screen');
const replay = document.getElementById('term-replay');
const state = document.getElementById('term-state');
const run = document.getElementById('term-run');

function isCast(id: string): id is CastId {
  return id in CASTS;
}

async function main(): Promise<void> {
  if (!screen || !title || !about) return;
  if (!isCast(requested)) {
    title.textContent = 'No such recording';
    about.textContent = 'Choose gridtop or dreaming from the studio.';
    return;
  }
  const info = CASTS[requested];
  document.documentElement.dataset.piece = requested;
  document.title = info.title;
  title.textContent = info.title;
  about.textContent = info.about;
  if (run) {
    run.textContent = 'Run it from its folder: ';
    info.run.forEach((command, i) => {
      const code = document.createElement('code');
      code.textContent = command;
      if (i > 0) run.append(i === info.run.length - 1 ? ', then ' : ', ');
      run.append(code);
    });
  }
  let cast: Cast;
  try {
    const response = await fetch(`/casts/${requested}.cast`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    cast = parseCast(await response.text());
  } catch (error) {
    about.textContent = `The recording could not be loaded (${error instanceof Error ? error.message : String(error)}).`;
    return;
  }
  // Fit the recording's columns to the width available.
  const available = screen.clientWidth - 24;
  const byWidth = available / (cast.width * 0.6);
  const byHeight = (window.innerHeight - 24) / (cast.height * 1.2);
  const fontSize = Math.max(
    7,
    Math.min(params.has('bare') ? 40 : 15, Math.floor(params.has('bare') ? Math.min(byWidth, byHeight) : byWidth)),
  );
  const term = new Terminal({
    cols: cast.width,
    rows: cast.height,
    fontSize,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    disableStdin: true,
    cursorBlink: false,
    scrollback: 0,
    theme: requested === 'gridtop' ? { background: '#0f1712', foreground: '#d4e6cb' } : { background: '#0f1418', foreground: '#e6e1d6' },
  });
  term.open(screen);

  let timers: number[] = [];
  const play = (): void => {
    for (const t of timers) clearTimeout(t);
    timers = [];
    term.reset();
    if (reduced && !loop) {
      for (const [, data] of cast.events) term.write(data);
      if (state) state.textContent = 'Shown at its last frame (reduced motion).';
      return;
    }
    if (state) state.textContent = 'Playing';
    for (const [time, data] of cast.events) timers.push(window.setTimeout(() => term.write(data), time * 1000));
    const end = (cast.events.at(-1)?.[0] ?? 0) * 1000 + 1500;
    timers.push(
      window.setTimeout(() => {
        if (loop) play();
        else if (state) state.textContent = 'Finished';
      }, end),
    );
  };
  replay?.addEventListener('click', play);
  play();
}

void main();
