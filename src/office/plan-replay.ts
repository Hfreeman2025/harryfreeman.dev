// The build timeline, replayed on the floor plan: a dot per builder, carrying a sheet to the review
// table and back; red when work is sent back, green when it is accepted. Runs only while the plan
// is on screen. Paused (reduced motion), it shows the end of the build.

import { PIECE_IDS, type PieceId } from '../content/pieces';
import { deskFor, REVIEW, routeToReview } from '../scene/layout';
import { along, makeRoute, type Route } from '../scene/routes';
import { captionAt } from '../timeline/caption';
import { type Phase, Replay } from '../timeline/replay';
import type { Timeline } from '../timeline/schema';

export interface PlanReplay {
  togglePause(): boolean;
}

export function startPlanReplay(svg: SVGSVGElement, timeline: Timeline, options: { paused: boolean }): PlanReplay {
  const replay = new Replay(timeline);
  const dots = new Map<PieceId, SVGCircleElement>();
  const sheets = new Map<PieceId, SVGRectElement>();
  const desks = new Map<PieceId, SVGElement>();
  const routes = new Map<PieceId, Route>();
  for (const piece of PIECE_IDS) {
    const dot = svg.querySelector<SVGCircleElement>(`.plan-figure[data-piece="${piece}"]`);
    const sheet = svg.querySelector<SVGRectElement>(`.plan-sheet[data-sheet="${piece}"]`);
    const desk = svg.querySelector<SVGElement>(`.plan-desk[data-piece="${piece}"]`);
    if (dot) dots.set(piece, dot);
    if (sheet) sheets.set(piece, sheet);
    if (desk) desks.set(piece, desk);
    routes.set(piece, makeRoute(routeToReview(piece, REVIEW.slots[0])));
  }
  const timeEl = document.getElementById('replay-time');
  const eventEl = document.getElementById('replay-event');
  const evidenceEl = document.getElementById('replay-evidence');
  const pos = new Map<PieceId, { x: number; z: number }>(PIECE_IDS.map((p) => [p, { x: deskFor(p).seat[0], z: deskFor(p).seat[1] }]));
  const last = new Map<PieceId, Phase['kind']>();
  const flashUntil = new Map<PieceId, number>();

  let paused = options.paused;
  let s = paused ? replay.duration - 0.01 : 0;
  let lastCaption = '';

  function update(dt: number, now: number, snap: boolean): void {
    const k = snap ? 1 : 1 - Math.exp(-dt * 7);
    const phases = new Map<PieceId, Phase>(PIECE_IDS.map((p) => [p, replay.phase(p, s)]));
    const queue = [...phases.entries()]
      .filter(([, ph]) => ph.kind === 'at-review')
      .sort((a, b) => (a[1].kind === 'at-review' && b[1].kind === 'at-review' ? a[1].due - b[1].due : 0))
      .map(([p]) => p);
    for (const piece of PIECE_IDS) {
      const phase = phases.get(piece);
      const route = routes.get(piece);
      const p = pos.get(piece);
      if (!phase || !route || !p) continue;
      const seat = deskFor(piece).seat;
      let carrying = false;
      let marked = false;
      if (phase.kind === 'to-review' || phase.kind === 'back') {
        const at = along(route, phase.progress, phase.kind === 'back');
        p.x = at.x;
        p.z = at.z;
        carrying = phase.kind === 'to-review' || phase.outcome === 'returned';
        marked = phase.kind === 'back' && phase.outcome === 'returned';
      } else {
        const slot =
          phase.kind === 'at-review' ? (REVIEW.slots[Math.min(queue.indexOf(piece), REVIEW.slots.length - 1)] ?? REVIEW.slots[0]) : seat;
        p.x += (slot[0] - p.x) * k;
        p.z += (slot[1] - p.z) * k;
        carrying = phase.kind === 'at-review';
      }
      const dot = dots.get(piece);
      dot?.setAttribute('cx', p.x.toFixed(3));
      dot?.setAttribute('cy', p.z.toFixed(3));
      const sheet = sheets.get(piece);
      if (sheet) {
        sheet.setAttribute('visibility', carrying ? 'visible' : 'hidden');
        sheet.setAttribute('transform', `translate(${(p.x + 0.26).toFixed(3)} ${(p.z - 0.05).toFixed(3)})`);
        sheet.dataset.marked = String(marked);
      }
      // A flash of red pencil when work comes back; green when it is accepted.
      const before = last.get(piece);
      if (before !== phase.kind) {
        last.set(piece, phase.kind);
        if (phase.kind === 'back' && dot) {
          dot.dataset.flash = phase.outcome;
          flashUntil.set(piece, now + 2600);
        }
      }
      const until = flashUntil.get(piece);
      if (until !== undefined && now > until) {
        flashUntil.delete(piece);
        if (dot) delete dot.dataset.flash;
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
    update(dt, now, false);
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

  update(0, performance.now(), true);
  return {
    togglePause() {
      paused = !paused;
      setRunning(visible && !paused);
      if (paused) update(0, performance.now(), true);
      return paused;
    },
  };
}
