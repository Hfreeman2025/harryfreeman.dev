// The people in the room and the work between them. A builder sits at each desk and the reviewer
// stands at the review table; nobody walks. The replay moves the work instead (work.ts): each tool's
// sheet goes from its desk to the table and back red, or on to the board green. Screens light when
// work starts, the brief in force glows, lamp pools mark hover and answers, and the caption follows.

import { CanvasTexture, Color, DoubleSide, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, type Scene } from 'three';
import { PIECE_IDS, type PieceId } from '../content/pieces';
import { captionAt } from '../timeline/caption';
import { type Phase, Replay, WALK_BACK } from '../timeline/replay';
import type { Timeline } from '../timeline/schema';
import { DESKS, REVIEW } from './layout';
import { PALETTE } from './light';
import type { Model } from './model';
import { builderPose, type Figure, pose, reviewerPose, seatedFigure, standingFigure } from './people';
import { sheetPose, type Tint } from './work';

export interface CrewOptions {
  readonly scene: Scene;
  readonly model: Model;
  readonly timeline: Timeline;
  readonly startAt: number;
}

const TINTS: Record<Tint, Color> = {
  paper: new Color('#faf8f3'),
  returned: new Color(PALETTE.returned),
  accepted: new Color(PALETTE.accepted),
};

/** A soft shadow where a figure meets the floor, as a model photographed under a soft lamp shows. */
function contactTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(canvas);
}

export class Crew {
  readonly replay: Replay;
  s: number;
  hovered: PieceId | null = null;
  readonly answering = new Set<PieceId>();
  /** The desk the camera stands at: its builder steps out of the picture. */
  away: PieceId | null = null;
  /** False when a style frame brings its own people. */
  people = true;
  /** A piece whose sheet a style frame's builder is holding: its sheet is not drawn on its own. */
  held: PieceId | null = null;
  readonly #shadows: Mesh[] = [];
  readonly #builders = new Map<PieceId, Figure>();
  readonly #reviewer: Figure;
  readonly #sheets = new Map<PieceId, Mesh<PlaneGeometry, MeshLambertMaterial>>();
  readonly #screenLevel = new Map<PieceId, number>(PIECE_IDS.map((p) => [p, 0.07]));
  readonly #poolLevel = new Map<PieceId, number>(PIECE_IDS.map((p) => [p, 0]));
  readonly #o: CrewOptions;
  #lastCaption = '';

  constructor(o: CrewOptions) {
    this.#o = o;
    this.replay = new Replay(o.timeline);
    this.s = o.startAt;
    const contact = contactTexture();
    const shadow = (x: number, z: number, w: number, d: number) => {
      const mesh = new Mesh(
        new PlaneGeometry(w, d),
        new MeshBasicMaterial({ map: contact, transparent: true, depthWrite: false, opacity: 0.5 }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.003, z);
      mesh.renderOrder = 1;
      o.scene.add(mesh);
      this.#shadows.push(mesh);
    };
    for (const d of DESKS) {
      const figure = seatedFigure();
      figure.group.position.set(d.seat[0], 0, d.seat[1]);
      o.scene.add(figure.group);
      this.#builders.set(d.piece, figure);
      shadow(d.seat[0], d.seat[1] - 0.42, 0.42, 0.3);
      const sheet = new Mesh(new PlaneGeometry(0.26, 0.34), new MeshLambertMaterial({ color: TINTS.paper.clone(), side: DoubleSide }));
      sheet.visible = false;
      o.scene.add(sheet);
      this.#sheets.set(d.piece, sheet);
    }
    this.#reviewer = standingFigure();
    this.#reviewer.group.position.set(REVIEW.reviewer[0], 0, REVIEW.reviewer[1]);
    o.scene.add(this.#reviewer.group);
    shadow(REVIEW.reviewer[0], REVIEW.reviewer[1] - 0.02, 0.6, 0.42);
  }

  update(dt: number, t: number): void {
    const { model } = this.#o;
    const s = this.s;
    const k = 1 - Math.exp(-dt * 7);
    const phases = new Map<PieceId, Phase>(PIECE_IDS.map((p) => [p, this.replay.phase(p, s)]));
    let reviewing = false;

    for (const piece of PIECE_IDS) {
      const phase = phases.get(piece);
      const figure = this.#builders.get(piece);
      if (!phase || !figure) continue;
      const i = PIECE_IDS.indexOf(piece);
      if (phase.kind === 'at-review' && phase.reviewing) reviewing = true;

      // At most the builder at work turns a little, now and then, and looks down at the desk.
      const b = builderPose(phase.kind === 'building', t, i);
      pose(figure, b.turn, b.lean, b.nod);
      figure.group.visible = this.people && this.away !== piece;

      const sheet = this.#sheets.get(piece);
      if (sheet) {
        const p = sheetPose(piece, phase);
        sheet.visible = p.visible && this.held !== piece;
        if (p.visible) {
          sheet.position.set(p.x, p.y, p.z);
          // Flat on a desk or the table; turning upright as it reaches the board.
          sheet.rotation.set(-Math.PI / 2 + (Math.PI / 2) * p.upright, 0, (1 - p.upright) * (0.12 + (i % 3) * 0.05));
          sheet.material.color.copy(TINTS[p.tint]);
        }
      }

      // Screens: dark until the work starts, lit from then on.
      const target = phase.kind === 'idle' ? 0.07 : 1;
      const level = (this.#screenLevel.get(piece) ?? 0) + (target - (this.#screenLevel.get(piece) ?? 0)) * k;
      this.#screenLevel.set(piece, level);
      model.screens.meshes.get(piece)?.material.color.setScalar(level);

      // The board shows a tool once its accepted sheet has arrived there.
      const board = model.boardSheets.get(piece);
      if (board) board.visible = this.replay.beats.some((b) => b.piece === piece && b.kind === 'accepted' && b.scene + WALK_BACK <= s);

      const poolTarget = this.answering.has(piece) ? 0.85 : this.hovered === piece ? 0.5 : 0;
      const pool = (this.#poolLevel.get(piece) ?? 0) + (poolTarget - (this.#poolLevel.get(piece) ?? 0)) * k;
      this.#poolLevel.set(piece, pool);
      const poolMesh = model.pools.get(piece);
      if (poolMesh) poolMesh.material.opacity = pool * 0.5;
    }

    const r = reviewerPose(reviewing);
    pose(this.#reviewer, r.turn, r.lean, r.nod);
    this.#reviewer.group.visible = this.people;
    for (const shadow of this.#shadows) shadow.visible = this.people;

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
