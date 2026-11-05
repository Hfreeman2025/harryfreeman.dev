// The build timeline, replayed on the floor plan: the builders stay at their desks and the work
// moves, as in the 3D room (scene/work.ts): a sheet goes from a desk to the review table, back in red
// when sent back, on to the board in green when accepted. Runs only while the plan is on screen.
// Paused (reduced motion), it shows the end of the build, still.

import { PIECE_IDS, type PieceId } from '../content/pieces';
import { sheetPose } from '../scene/work';
import { captionAt } from '../timeline/caption';
import { Replay } from '../timeline/replay';
import type { Timeline } from '../timeline/schema';

export interface PlanReplay {
  togglePause(): boolean;
}

export function startPlanReplay(svg: SVGSVGElement, timeline: Timeline, options: { paused: boolean }): PlanReplay {
  const replay = new Replay(timeline);
  const sheets = new Map<PieceId, SVGRectElement>();
  const desks = new Map<PieceId, SVGElement>();
  for (const piece of PIECE_IDS) {
    const sheet = svg.querySelector<SVGRectElement>(`.plan-sheet[data-sheet="${piece}"]`);
    const desk = svg.querySelector<SVGElement>(`.plan-desk[data-piece="${piece}"]`);
    if (sheet) sheets.set(piece, sheet);
    if (desk) desks.set(piece, desk);
  }
  const timeEl = document.getElementById('replay-time');
  const eventEl = document.getElementById('replay-event');
  const evidenceEl = document.getElementById('replay-evidence');

  let paused = options.paused;
  let s = paused ? replay.duration - 0.01 : 0;
  let lastCaption = '';

  function update(): void {
    for (const piece of PIECE_IDS) {
      const phase = replay.phase(piece, s);
      const sheet = sheets.get(piece);
      if (sheet) {
        const p = sheetPose(piece, phase);
        sheet.setAttribute('visibility', p.visible ? 'visible' : 'hidden');
        sheet.setAttribute('transform', `translate(${p.x.toFixed(3)} ${p.z.toFixed(3)})`);
        sheet.dataset.tint = p.tint;
      }
      const desk = desks.get(piece);
      if (desk) desk.dataset.state = phase.kind === 'done' ? 'accepted' : '';
    }
    const { time, event, evidence } = captionAt(replay, s);
    const caption = `${time}|${event}|${evidence}`;
    if (caption !== lastCaption && timeEl && eventEl) {
      lastCaption = caption;
      timeEl.textContent = time;
      eventEl.textContent = event;
      if (evidenceEl) evidenceEl.textContent = evidence;
    }
  }

  let running = false;
  let visible = false;
  let lastFrame = performance.now();
  const frame = (now: number) => {
    if (!running) return;
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (!paused) s = (s + dt) % replay.duration;
    update();
    requestAnimationFrame(frame);
  };
  const setRunning = (on: boolean) => {
    if (on === running) return;
    running = on;
    if (on) {
      lastFrame = performance.now();
      requestAnimationFrame(frame);
    }
  };
  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    setRunning(visible && !paused);
  }).observe(svg);

  update();
  return {
    togglePause() {
      paused = !paused;
      setRunning(visible && !paused);
      if (paused) update();
      return paused;
    },
  };
}
