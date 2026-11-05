// A tool's folder, the same in both renderings: what it is, the brief, the checks and how to open it
// (cloned from its entry in the full list), the recorded loop, its receipt stamp, and its README as
// numbered source lines, in which Reception marks the line an answer quoted.

import * as v from 'valibot';
import type { PieceId } from './content/pieces';
import { renderStamp } from './room/stamp';

const Report = v.record(v.string(), v.looseObject({ recordedAt: v.optional(v.string()), url: v.optional(v.string()) }));
let report: v.InferOutput<typeof Report> = {};
void fetch('/loops/report.json')
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
  .then((json: unknown) => {
    report = v.parse(Report, json);
  })
  .catch(() => {
    report = {};
  });

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/London',
});

export function recordedLine(piece: PieceId): string {
  const at = report[piece]?.recordedAt;
  const when = at && Number.isFinite(Date.parse(at)) ? ` on ${dateFormat.format(Date.parse(at))}` : '';
  return `Recorded${when} from the real tool, in a silent headless browser: 8 seconds, looped. Open it to use it live.`;
}

export function loopSource(video: HTMLVideoElement, piece: PieceId): string {
  return video.canPlayType('video/webm; codecs="vp9"') ? `/loops/${piece}.webm` : `/loops/${piece}.mp4`;
}

/** Fills the folder card's text from the tool's entry in the full list. */
export function fillFolder(piece: PieceId): void {
  const body = document.getElementById('card-body');
  if (!body) return;
  const clone = document.querySelector(`#work-${piece} .work__text`)?.cloneNode(true);
  body.replaceChildren();
  if (!(clone instanceof HTMLElement)) return;
  for (const el of clone.querySelectorAll('[id]')) el.removeAttribute('id');
  clone.querySelector('.work__elsewhere')?.remove();
  const title = clone.querySelector('.work__title');
  if (title) {
    title.id = 'card-title';
    title.setAttribute('tabindex', '-1');
  }
  // Beside the loop: how to open it and who made it. Beside that: what it is.
  const actions = document.getElementById('card-actions');
  if (actions) {
    actions.replaceChildren();
    for (const selector of ['.work__open', '.work__run', '.work__record', '.work__placeholder', '.work__inferred']) {
      const part = clone.querySelector(selector);
      if (part) actions.append(part);
    }
  }
  const wrapper = document.createElement('div');
  wrapper.className = 'work';
  wrapper.append(clone);
  body.append(wrapper);
  const recorded = document.getElementById('card-recorded');
  if (recorded) recorded.textContent = recordedLine(piece);
  renderStamp(piece);
  void showLines(piece);
}

// ---------- The README, as source lines ----------

const Lines = v.object({
  sections: v.array(v.object({ key: v.string(), title: v.string(), from: v.number(), to: v.number(), html: v.string() })),
});
type Section = v.InferOutput<typeof Lines>['sections'][number];
let sections: Map<string, Section> | null = null;
let loadingLines: Promise<boolean> | null = null;

/** Loads the README lines once; Reception waits for them, so an answer can always be marked. */
export function loadLines(): Promise<boolean> {
  loadingLines ??= fetch('/record/lines.json')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((json: unknown) => {
      sections = new Map(v.parse(Lines, json).sections.map((s) => [s.key, s]));
      return true;
    })
    .catch((error: unknown) => {
      const box = document.getElementById('record-lines');
      if (box) box.textContent = `The README could not be loaded (${error instanceof Error ? error.message : String(error)}).`;
      return false;
    });
  return loadingLines;
}

/**
 * Puts a tool's README lines in the folder, unless they are already there: Reception's marks are
 * ranges in these very nodes, so redrawing them would lose the marks.
 */
export function showLines(piece: PieceId): boolean {
  const box = document.getElementById('record-lines');
  if (!box) return false;
  if (box.dataset.piece === piece) return true;
  const section = sections?.get(piece);
  if (!section) {
    if (!sections) void loadLines().then((ok) => ok && showLines(piece));
    return false;
  }
  box.innerHTML = section.html;
  box.dataset.piece = piece;
  box.scrollTop = 0;
  return true;
}

/** Scrolls the folder's README box to the marked line, if there is one. */
export function scrollToMark(range: Range | null): void {
  const box = document.getElementById('record-lines');
  if (!box || !range) return;
  const line = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest(
    '[data-record-line]',
  );
  if (!(line instanceof HTMLElement) || !box.contains(line)) return;
  // Open first: a closed <details> lays nothing out, so the line has no position until then.
  const details = box.closest('details');
  if (details) details.open = true;
  box.scrollTop = line.offsetTop - box.clientHeight / 3;
  // And the folder itself scrolls to its README, so the marked line is on screen.
  for (let el = details?.parentElement ?? null; el && el !== document.body; el = el.parentElement) {
    const style = getComputedStyle(el);
    if (!/(auto|scroll)/.test(style.overflowY) || el.scrollHeight <= el.clientHeight) continue;
    const from = el.getBoundingClientRect().top;
    el.scrollTop += (details ?? box).getBoundingClientRect().top - from - 12;
    break;
  }
}

/** Keeps Tab inside an open dialog. */
export function trapTab(container: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== 'Tab') return;
  const focusable = [...container.querySelectorAll<HTMLElement>('a[href], button, summary, [tabindex="-1"], [tabindex="0"]')].filter(
    (el) => el.offsetParent !== null && !el.closest('[hidden], [inert]'),
  );
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
