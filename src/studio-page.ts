// The page works without this script: the title block, the list and every desk link are HTML.
// This adds the studio (on large screens that welcome motion), the desk card and Ask the studio.

import { setupAsk } from './ask';
import { isPieceId, type PieceId } from './content/pieces';
import type { Studio } from './scene/studio';
import { parseTimeline, type Timeline } from './timeline/schema';

const root = document.documentElement;
const status = document.getElementById('studio-status');

function say(text: string): void {
  if (status) status.textContent = text;
}

function readTimeline(): Timeline | null {
  const node = document.getElementById('timeline-data');
  if (!node?.textContent) return null;
  try {
    return parseTimeline(JSON.parse(node.textContent));
  } catch (error) {
    say(`The build timeline could not be read: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

let studio: Studio | null = null;

/** Light the desks (or list entries) whose sources an answer quoted. */
function showAnswering(pieces: readonly PieceId[]): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-answering]')) el.removeAttribute('data-answering');
  for (const piece of pieces) {
    for (const el of document.querySelectorAll<HTMLElement>(`.desk-label[data-piece="${piece}"], .work[data-piece="${piece}"]`)) {
      el.dataset.answering = 'true';
    }
  }
  studio?.answering(pieces);
}

setupAsk({
  onAnswer: showAnswering,
  onSource: (piece) => {
    const label = document.querySelector<HTMLElement>(`.desk-label[data-piece="${piece}"]`);
    if (studio && label && root.dataset.mode === 'scene') void studio.open(piece, label);
    else document.getElementById(`work-${piece}`)?.scrollIntoView({ block: 'start' });
  },
});

async function startStudio(timeline: Timeline): Promise<void> {
  const stage = document.querySelector<HTMLElement>('.studio__stage');
  const labels = document.querySelector<HTMLElement>('.studio__labels');
  if (!stage || !labels) return;
  try {
    const { mountStudio } = await import('./scene/studio');
    const params = new URLSearchParams(location.search);
    const at = Number(params.get('t'));
    const photo = root.dataset.photo !== undefined;
    studio = await mountStudio({ stage, labels, timeline, ...(Number.isFinite(at) && at > 0 ? { startAt: at } : {}), paused: photo });
    root.dataset.stage = 'live';
  } catch (error) {
    // No 3D: the page becomes the list, and says why.
    root.dataset.mode = 'list';
    say(`The 3D studio could not start here (${error instanceof Error ? error.message : String(error)}), so this is the list version.`);
    followHash();
    return;
  }
  wireDesks(studio);
  followHash();
}

/** Arriving from the archive: /studio.html#desk-<id> glides to that desk. */
function followHash(): void {
  const piece = /^#desk-(.+)$/.exec(location.hash)?.[1] ?? '';
  if (!isPieceId(piece)) return;
  const label = document.querySelector<HTMLElement>(`.desk-label[data-piece="${piece}"]`);
  if (studio && label && root.dataset.mode === 'scene') void studio.open(piece, label);
  else document.getElementById(`work-${piece}`)?.scrollIntoView({ block: 'start' });
}
window.addEventListener('hashchange', followHash);

function wireDesks(s: Studio): void {
  for (const label of document.querySelectorAll<HTMLAnchorElement>('.desk-label')) {
    const id = label.dataset.piece ?? '';
    label.addEventListener('click', (event) => {
      if (!isPieceId(id)) return; // The brief, the reviewer and the board link to sections of the page.
      event.preventDefault();
      void s.open(id, label);
    });
    label.addEventListener('focus', () => isPieceId(id) && s.hover(id));
    label.addEventListener('blur', () => s.hover(null));
    label.addEventListener('pointerenter', () => isPieceId(id) && s.hover(id));
    label.addEventListener('pointerleave', () => s.hover(null));
  }
  const toggle = document.getElementById('replay-toggle');
  toggle?.addEventListener('click', () => {
    const paused = s.togglePause();
    toggle.textContent = paused ? 'Play' : 'Pause';
    toggle.setAttribute('aria-pressed', String(paused));
  });
}

const timeline = readTimeline();
if (root.dataset.mode === 'scene' && timeline) {
  void startStudio(timeline);
} else if (root.dataset.mode === 'scene') {
  root.dataset.mode = 'list';
}
if (root.dataset.mode === 'list') followHash();
