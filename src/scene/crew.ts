// The people in the room and what follows them: a builder at each desk and the reviewer, replaying
// the build timeline; the screens that light when work starts; the accepted board; the brief in
// force; the lamp pools for hover and answers; and the caption under the room.

import { Mesh, MeshLambertMaterial, PlaneGeometry, type Scene } from 'three';
import { PIECE_IDS, type PieceId } from '../content/pieces';
import { captionAt } from '../timeline/caption';
import { type Phase, Replay } from '../timeline/replay';
import type { Timeline } from '../timeline/schema';
import { along, approachAngle, Figure, makeRoute, type Route } from './figures';
import { DESKS, deskFor, REVIEW, routeToReview } from './layout';
import type { Model } from './model';

const smooth = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

export interface CrewOptions {
  readonly scene: Scene;
  readonly model: Model;
  readonly timeline: Timeline;
  readonly startAt: number;
  /** Desk labels, to flash when work is sent back or accepted. */
  readonly labelFor: (piece: PieceId) => HTMLElement | undefined;
}

export class Crew {
  readonly replay: Replay;
  s: number;
  hovered: PieceId | null = null;
  readonly answering = new Set<PieceId>();
  /** Where the camera stands close (at a desk): figures within reach of it step out of the picture. */
  near: { x: number; z: number; r: number } | null = null;
  readonly #builders = new Map<PieceId, Figure>();
  readonly #routes = new Map<PieceId, Route>();
  readonly #reviewer = new Figure();
  readonly #tableSheet: Mesh;
  readonly #lastPhase = new Map<PieceId, Phase['kind']>();
  readonly #flashUntil = new Map<PieceId, number>();
  readonly #screenLevel = new Map<PieceId, number>(PIECE_IDS.map((p) => [p, 0.07]));
  readonly #poolLevel = new Map<PieceId, number>(PIECE_IDS.map((p) => [p, 0]));
  readonly #o: CrewOptions;
  #lastCaption = '';

  constructor(o: CrewOptions) {
    this.#o = o;
    this.replay = new Replay(o.timeline);
    this.s = o.startAt;
    for (const d of DESKS) {
      const figure = new Figure();
      figure.x = d.seat[0];
      figure.z = d.seat[1];
      figure.facing = Math.PI;
      o.scene.add(figure.group);
      this.#builders.set(d.piece, figure);
      this.#routes.set(d.piece, makeRoute(routeToReview(d.piece, REVIEW.slots[0])));
    }
    this.#reviewer.x = REVIEW.reviewer[0];
    this.#reviewer.z = REVIEW.reviewer[1];
    this.#reviewer.facing = Math.PI;
    o.scene.add(this.#reviewer.group);
    this.#tableSheet = new Mesh(new PlaneGeometry(0.27, 0.36), new MeshLambertMaterial({ color: '#f7f3ea' }));
    this.#tableSheet.rotation.x = -Math.PI / 2;
    this.#tableSheet.position.set(REVIEW.table.x - 0.1, 0.765, REVIEW.table.z - 0.05);
    this.#tableSheet.visible = false;
    o.scene.add(this.#tableSheet);
  }

  update(dt: number, t: number): void {
    const { model, labelFor } = this.#o;
    const s = this.s;
    const k = 1 - Math.exp(-dt * 7);
    const phases = new Map<PieceId, Phase>(PIECE_IDS.map((p) => [p, this.replay.phase(p, s)]));
    const queue = [...phases.entries()]
      .filter(([, ph]) => ph.kind === 'at-review')
      .sort((a, b) => (a[1].kind === 'at-review' && b[1].kind === 'at-review' ? a[1].due - b[1].due : 0))
      .map(([p]) => p);
    let reviewing = false;

    for (const piece of PIECE_IDS) {
      const figure = this.#builders.get(piece);
      const route = this.#routes.get(piece);
      const phase = phases.get(piece);
      if (!figure || !route || !phase) continue;
      const d = deskFor(piece);
      const i = PIECE_IDS.indexOf(piece);
      let seated = 1;
      let lean = 0;
      let bob = 0;
      let carrying = false;
      let marked = false;
      const answering = this.answering.has(piece);
      figure.answer += ((answering ? 1 : 0) - figure.answer) * k;

      switch (phase.kind) {
        case 'idle':
        case 'done':
        case 'building': {
          figure.x += (d.seat[0] - figure.x) * k;
          figure.z += (d.seat[1] - figure.z) * k;
          figure.facing = approachAngle(figure.facing, answering ? 0 : Math.PI, k);
          seated = 1 - figure.answer;
          lean = phase.kind === 'building' ? 0.1 + Math.sin(t * 2.1 + i) * 0.025 : phase.kind === 'done' ? -0.05 : 0;
          break;
        }
        case 'to-review': {
          const at = along(route, phase.progress);
          figure.x = at.x;
          figure.z = at.z;
          figure.facing = at.facing;
          seated = 1 - smooth(phase.progress / 0.14);
          bob = Math.abs(Math.sin(phase.progress * route.total * 3.2)) * 0.035;
          carrying = true;
          break;
        }
        case 'at-review': {
          const slot = REVIEW.slots[Math.min(queue.indexOf(piece), REVIEW.slots.length - 1)] ?? REVIEW.slots[0];
          figure.x += (slot[0] - figure.x) * k;
          figure.z += (slot[1] - figure.z) * k;
          figure.facing = approachAngle(figure.facing, 0, k);
          seated = 0;
          carrying = !phase.reviewing;
          if (phase.reviewing) reviewing = true;
          break;
        }
        case 'back': {
          const at = along(route, phase.progress, true);
          figure.x = at.x;
          figure.z = at.z;
          figure.facing = at.facing;
          seated = smooth((phase.progress - 0.86) / 0.14);
          bob = Math.abs(Math.sin(phase.progress * route.total * 3.2)) * 0.035;
          carrying = phase.outcome === 'returned';
          marked = carrying;
          break;
        }
      }
      figure.group.visible = this.near === null || Math.hypot(figure.x - this.near.x, figure.z - this.near.z) > this.near.r;
      figure.seated = seated;
      figure.sheet.visible = carrying;
      figure.mark.visible = marked;
      figure.pose(seated, lean, bob);

      // Screens: dark until the work starts, lit from then on.
      const target = phase.kind === 'idle' ? 0.07 : 1;
      const level = (this.#screenLevel.get(piece) ?? 0) + (target - (this.#screenLevel.get(piece) ?? 0)) * k;
      this.#screenLevel.set(piece, level);
      model.screens.meshes.get(piece)?.material.color.setScalar(level);

      const sheet = model.boardSheets.get(piece);
      if (sheet) sheet.visible = this.replay.beats.some((b) => b.piece === piece && b.kind === 'accepted' && b.scene <= s);

      const poolTarget = answering ? 0.85 : this.hovered === piece ? 0.5 : 0;
      const pool = (this.#poolLevel.get(piece) ?? 0) + (poolTarget - (this.#poolLevel.get(piece) ?? 0)) * k;
      this.#poolLevel.set(piece, pool);
      const poolMesh = model.pools.get(piece);
      if (poolMesh) poolMesh.material.opacity = pool * 0.55;

      // A moment of red pencil on the desk's label when work is sent back, amber when accepted.
      if (this.#lastPhase.get(piece) !== phase.kind) {
        this.#lastPhase.set(piece, phase.kind);
        const label = labelFor(piece);
        if (label && phase.kind === 'back') {
          label.dataset.flash = phase.outcome;
          label.dataset.state = phase.outcome;
          const state = label.querySelector('.desk-label__state');
          if (state)
            state.textContent = phase.outcome === 'returned' ? `sent back, round ${phase.round}` : `accepted, round ${phase.round}`;
          this.#flashUntil.set(piece, t + 2.6);
        }
      }
      const until = this.#flashUntil.get(piece);
      if (until !== undefined && t > until) {
        this.#flashUntil.delete(piece);
        const label = labelFor(piece);
        if (label) {
          delete label.dataset.flash;
          label.dataset.state = '';
        }
      }
    }

    this.#reviewer.pose(1, reviewing ? 0.22 : 0.02, 0);
    this.#tableSheet.visible = reviewing;

    let currentBrief: string | undefined;
    let briefAt = Number.NEGATIVE_INFINITY;
    for (const b of this.replay.beats) {
      if (b.scene > s) break;
      if (b.kind === 'briefed' && b.brief) {
        currentBrief = b.brief;
        briefAt = b.scene;
      }
    }
    for (const [doc, frame] of model.briefGlow) {
      const fresh = doc === currentBrief ? Math.max(0, 1 - (s - briefAt) / 3) : 0;
      frame.material.opacity = doc === currentBrief ? 0.35 + 0.55 * fresh : 0;
    }

    const { time, event, evidence } = captionAt(this.replay, s);
    const caption = `${time}|${event}|${evidence}`;
    if (caption !== this.#lastCaption) {
      this.#lastCaption = caption;
      const set = (id: string, text: string) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      };
      set('replay-time', time);
      set('replay-event', event);
      set('replay-evidence', evidence);
    }
  }
}
