// The phone's door: the outside of Harry's office door in the desk's graphic style, light enough for a
// phone (the desk itself comes to phones later). A corridor wall and floor, the door with its frosted
// pane, the brass plate (its words are real text laid onto it), a handle and a doormat, with warm light
// under the door. Come in swings the door open onto the room's warm light and steps towards it; the page
// then scrolls on to the content. There is no room modelled behind it, so nothing stands in for the desk.
// Units are metres; the door is at z = 0, the corridor in front (+z).

import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { BLUE, CORAL, CREAM, INK, OAK, SLATE } from '../desk/palette';
import { DeskPass } from '../desk/pass';
import { quadTransform } from '../room/quad';

const DOOR = { width: 0.92, height: 2.08, thick: 0.045, frame: 0.08 } as const;
/** The brass plate on the door, its centre and size; the name on it is real text (#entrance-plate). */
const PLATE = { y: 1.36, width: 0.52, height: 0.17 } as const;
const GLASS = { bottom: 1.52, top: 1.94, width: 0.56 } as const;

/** Where the camera stands outside, and the timing of the door opening and the step towards the light. */
const OUTSIDE = { pos: new Vector3(0, 1.48, 4.2), look: new Vector3(0, 1.1, 0) } as const;
const INTO = { pos: new Vector3(0, 1.45, 1.1), look: new Vector3(0, 1.2, -1) } as const;
const WALK = { open: [0, 0.95], move: [0.35, 1.7], sit: [1.7, 1.7] } as const;

export interface DoorScene {
  /** Swings the door open and walks in to the desk; resolves once seated. Reduced motion: a cut. */
  walk(): Promise<void>;
  /** The door shut again, the camera outside. */
  reset(): void;
  /** Whether a click at this page point lands on the door. */
  hitsDoor(x: number, y: number): boolean;
  /** A knock: the door jolts on its hinge, briefly. */
  knock(): void;
  /** The door on screen, in page pixels. */
  rect(): { x: number; y: number; width: number; height: number };
  dispose(): void;
  readonly debug: Record<string, () => unknown>;
}

interface Options {
  readonly stage: HTMLElement;
  /** The plate's real text, laid onto the brass plate. */
  readonly plate: HTMLElement;
  /** Phones: a lower pixel ratio and fewer details. */
  readonly lite: boolean;
  readonly reduced: boolean;
  /** Stills: the plate left blank for the text laid over the poster. */
  readonly photo: boolean;
}

const flat = (color: string) => new MeshLambertMaterial({ color });
const ease = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
};
const span = (t: number, [a, b]: readonly [number, number]) => ease((t - a) / (b - a));

function box(w: number, h: number, d: number, material: Material, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function gradientTexture(draw: (c: CanvasRenderingContext2D) => void, w = 256, h = 256): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** The corridor outside: floor, wall with a blue dado and an ink rail, a skirting board, the doormat. */
function corridor(): Group {
  const g = new Group();
  const floor = new Mesh(new PlaneGeometry(9, 6), flat('#d8cfbf'));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 3);
  const wallMat = flat(CREAM);
  const dadoMat = flat(BLUE);
  const half = DOOR.width / 2 + DOOR.frame;
  // The wall either side of the door, and over it.
  for (const side of [-1, 1]) {
    const w = 4.5 - half;
    const x = side * (half + w / 2);
    g.add(box(w, 1.92, 0.12, wallMat, x, 1.04 + 0.96 + 0.0, -0.06));
    g.add(box(w, 1.0, 0.13, dadoMat, x, 0.5, -0.06));
    g.add(box(w, 0.05, 0.16, flat(INK), x, 1.0, -0.06));
    g.add(box(w, 0.1, 0.15, flat(INK), x, 0.05, -0.06));
  }
  g.add(
    box(2 * half, 3.0 - DOOR.height - DOOR.frame, 0.12, wallMat, 0, DOOR.height + DOOR.frame + (3.0 - DOOR.height - DOOR.frame) / 2, -0.06),
  );
  // The frame.
  const frame = flat(INK);
  g.add(box(DOOR.frame, DOOR.height + DOOR.frame, 0.16, frame, -DOOR.width / 2 - DOOR.frame / 2, (DOOR.height + DOOR.frame) / 2, -0.04));
  g.add(box(DOOR.frame, DOOR.height + DOOR.frame, 0.16, frame, DOOR.width / 2 + DOOR.frame / 2, (DOOR.height + DOOR.frame) / 2, -0.04));
  g.add(box(DOOR.width + 2 * DOOR.frame, DOOR.frame, 0.16, frame, 0, DOOR.height + DOOR.frame / 2, -0.04));
  // The doormat.
  const mat = box(0.98, 0.018, 0.6, flat(CORAL), 0, 0.009, 0.42);
  const matEdge = box(1.04, 0.012, 0.66, flat(INK), 0, 0.006, 0.42);
  g.add(floor, matEdge, mat);
  // Warm light from the room, spilling under the door onto the floor.
  const spill = new Mesh(
    new PlaneGeometry(1.6, 1.1),
    new MeshBasicMaterial({
      map: gradientTexture((c) => {
        const r = c.createRadialGradient(128, 0, 0, 128, 0, 200);
        r.addColorStop(0, 'rgba(255, 201, 120, 0.85)');
        r.addColorStop(0.45, 'rgba(255, 190, 110, 0.25)');
        r.addColorStop(1, 'rgba(255, 190, 110, 0)');
        c.fillStyle = r;
        c.fillRect(0, 0, 256, 256);
      }),
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  spill.rotation.x = -Math.PI / 2;
  spill.position.set(0, 0.022, 0.55);
  spill.userData.noEdge = true;
  const crack = box(DOOR.width, 0.012, 0.02, new MeshBasicMaterial({ color: '#ffd48a' }), 0, 0.006, 0.0);
  crack.userData.noEdge = true;
  g.add(spill, crack);
  return g;
}

/** The door: an oak leaf hung on its left edge, a frosted pane lit from the room, the brass plate, the handle. */
function door(): { hinge: Group; plate: Mesh } {
  const hinge = new Group();
  hinge.position.set(-DOOR.width / 2, 0, -0.02);
  const leaf = box(DOOR.width, DOOR.height, DOOR.thick, flat(OAK), DOOR.width / 2, DOOR.height / 2, 0);
  hinge.add(leaf);
  // Two raised panels below the glass, as a door has.
  const panel = flat('#c58a4d');
  hinge.add(box(DOOR.width - 0.24, 0.5, 0.012, panel, DOOR.width / 2, 0.42, DOOR.thick / 2 + 0.006));
  hinge.add(box(DOOR.width - 0.24, 0.32, 0.012, panel, DOOR.width / 2, 1.0, DOOR.thick / 2 + 0.006));
  // Frosted glass, warm with the room's light behind it.
  const frost = gradientTexture((c) => {
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#fff3d6');
    g.addColorStop(1, '#ffd99a');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 9; i++) c.fillRect(0, 14 + i * 28, 256, 6);
  });
  const glass = new Mesh(
    new PlaneGeometry(GLASS.width, GLASS.top - GLASS.bottom),
    new MeshBasicMaterial({ map: frost, toneMapped: false }),
  );
  glass.position.set(DOOR.width / 2, (GLASS.top + GLASS.bottom) / 2, DOOR.thick / 2 + 0.002);
  const bead = flat(INK);
  hinge.add(glass, box(GLASS.width + 0.05, 0.03, 0.02, bead, DOOR.width / 2, GLASS.top + 0.015, DOOR.thick / 2 + 0.008));
  hinge.add(box(GLASS.width + 0.05, 0.03, 0.02, bead, DOOR.width / 2, GLASS.bottom - 0.015, DOOR.thick / 2 + 0.008));
  // The brass plate: a face in an edge; its words are real text laid onto the face.
  const brass = new MeshLambertMaterial({ color: '#e0b24a', emissive: new Color('#3a2a06') });
  const edge = box(PLATE.width + 0.025, PLATE.height + 0.025, 0.008, flat('#a9791f'), DOOR.width / 2, PLATE.y, DOOR.thick / 2 + 0.004);
  const plate = box(PLATE.width, PLATE.height, 0.01, brass, DOOR.width / 2, PLATE.y, DOOR.thick / 2 + 0.01);
  hinge.add(edge, plate);
  // The lever handle, on the side away from the hinge.
  const steel = flat(SLATE);
  const rose = new Mesh(new CylinderGeometry(0.035, 0.035, 0.02, 20), steel);
  rose.rotation.x = Math.PI / 2;
  rose.position.set(DOOR.width - 0.09, 1.0, DOOR.thick / 2 + 0.01);
  const lever = box(0.14, 0.022, 0.022, steel, DOOR.width - 0.15, 1.0, DOOR.thick / 2 + 0.05);
  const neck = box(0.022, 0.022, 0.05, steel, DOOR.width - 0.09, 1.0, DOOR.thick / 2 + 0.03);
  hinge.add(rose, lever, neck);
  return { hinge, plate };
}

/** Behind the door: the room's warm light, filling the doorway. */
function light(): Mesh {
  const glow = new Mesh(new PlaneGeometry(DOOR.width + 0.4, DOOR.height + 0.4), new MeshBasicMaterial({ color: '#fff1cf' }));
  glow.position.set(0, DOOR.height / 2, -0.3);
  glow.userData.noEdge = true;
  return glow;
}

export async function mountDoor({ stage, plate: plateText, lite, reduced, photo }: Options): Promise<DoorScene> {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: false, powerPreference: lite ? 'low-power' : 'high-performance' });
  } catch {
    throw new Error('WebGL is unavailable');
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lite ? 1.5 : 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor('#d8cfbf');
  renderer.domElement.setAttribute('aria-hidden', 'true');
  stage.append(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color('#2b2f3d');
  scene.add(new HemisphereLight('#ffffff', '#b9a98f', 1.6));
  const sun = new DirectionalLight('#fff3e0', 1.5);
  sun.position.set(-2, 5, 4);
  scene.add(sun);
  // The room's own warm light, from inside.
  const lamp = new DirectionalLight('#ffd9a0', 0.9);
  lamp.position.set(1, 3, -6);
  scene.add(lamp);
  scene.add(corridor(), light());
  const { hinge, plate } = door();
  scene.add(hinge);

  const camera = new PerspectiveCamera(35, 1, 0.05, 30);
  const pass = new DeskPass(renderer);
  pass.strength = 0;

  /** The door fills the height, whatever the window's shape; held upright, a phone keeps its width too. */
  function frameOutside(aspect: number): number {
    const distance = OUTSIDE.pos.distanceTo(OUTSIDE.look);
    const byHeight = 2 * Math.atan((DOOR.height + DOOR.frame + 0.5) / 2 / distance);
    const byWidth = 2 * Math.atan((DOOR.width + 0.9) / 2 / distance / aspect);
    return (Math.max(byHeight, byWidth) * 180) / Math.PI;
  }
  let outsideFov = 35;
  function resize(): void {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const buffer = renderer.getDrawingBufferSize(new Vector2());
    pass.setSize(buffer.x, buffer.y);
    camera.aspect = w / h;
    outsideFov = frameOutside(w / h);
    dirty = true;
  }
  const observer = new ResizeObserver(resize);
  observer.observe(stage);

  let walkAt: number | null = null;
  let progress = 0;
  let done: (() => void) | null = null;
  let dirty = true;
  let running = true;
  let phase: 'door' | 'walking' | 'seated' = 'door';

  let knockedAt = -1;
  function pose(t: number): void {
    hinge.rotation.y = -1.85 * span(t, WALK.open);
    if (knockedAt >= 0 && t === 0) {
      const k = (performance.now() - knockedAt) / 160;
      hinge.rotation.y = k < 1 ? -0.012 * Math.sin(k * Math.PI * 3) * (1 - k) : 0;
      if (k >= 1) knockedAt = -1;
      else dirty = true;
    }
    // A step towards the open door and its light.
    const m = span(t, WALK.move);
    camera.position.lerpVectors(OUTSIDE.pos, INTO.pos, m);
    camera.lookAt(new Vector3().lerpVectors(OUTSIDE.look, INTO.look, m));
    camera.fov = outsideFov + (40 - outsideFov) * m;
    camera.near = 0.05;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  const projected = new Vector3();
  function placePlate(): void {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    plate.updateMatrixWorld(true);
    const hw = PLATE.width / 2 - 0.02;
    const hh = PLATE.height / 2 - 0.012;
    const corners = [
      [-hw, hh],
      [hw, hh],
      [hw, -hh],
      [-hw, -hh],
    ].map(([x = 0, y = 0]) => {
      projected.set(x, y, 0.0051).applyMatrix4(plate.matrixWorld).project(camera);
      return [(projected.x * 0.5 + 0.5) * w, (-projected.y * 0.5 + 0.5) * h, projected.z] as const;
    });
    const [a, b, , d] = corners;
    const facing = a && b && d ? (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]) > 600 : false;
    // Turned away (the door swinging open), its words fade rather than change shape, so nothing moves.
    const away = !facing || corners.some((c) => c[2] >= 1);
    if (away !== (plateText.dataset.away !== undefined)) {
      if (away) plateText.dataset.away = '';
      else delete plateText.dataset.away;
    }
    if (away) return;
    plateText.style.transform = quadTransform(
      plateText.offsetWidth,
      plateText.offsetHeight,
      corners.map((c) => [c[0], c[1]] as const) as unknown as Parameters<typeof quadTransform>[2],
    );
    if (plateText.dataset.placed === undefined) plateText.dataset.placed = '';
  }

  function frame(now: number): void {
    if (!running) return;
    if (walkAt !== null) {
      progress = Math.min(WALK.sit[1], (now - walkAt) / 1000);
      dirty = true;
      if (progress >= WALK.sit[1]) {
        walkAt = null;
        phase = 'seated';
        const resolve = done;
        done = null;
        resolve?.();
      }
    }
    if (dirty) {
      pose(progress);
      pass.render(scene, camera);
      if (!photo) placePlate();
      dirty = false;
    }
    requestAnimationFrame(frame);
  }
  resize();
  requestAnimationFrame(frame);

  const raycaster = new Raycaster();
  const ndc = new Vector2();
  return {
    walk() {
      if (phase !== 'door') return Promise.resolve();
      phase = 'walking';
      if (reduced) {
        progress = WALK.sit[1];
        phase = 'seated';
        dirty = true;
        return Promise.resolve();
      }
      walkAt = performance.now();
      return new Promise((resolve) => {
        done = resolve;
      });
    },
    reset() {
      walkAt = null;
      progress = 0;
      phase = 'door';
      dirty = true;
      done?.();
      done = null;
    },
    knock() {
      if (reduced || phase !== 'door') return;
      knockedAt = performance.now();
      dirty = true;
    },
    rect() {
      const r = stage.getBoundingClientRect();
      const xs: number[] = [];
      const ys: number[] = [];
      for (const x of [-DOOR.width / 2, DOOR.width / 2])
        for (const y of [0, DOOR.height]) {
          const p = new Vector3(x, y, 0).project(camera);
          xs.push(r.left + (p.x * 0.5 + 0.5) * r.width);
          ys.push(r.top + (-p.y * 0.5 + 0.5) * r.height);
        }
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
    },
    hitsDoor(x, y) {
      const r = stage.getBoundingClientRect();
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObject(hinge, true).length > 0;
    },
    dispose() {
      running = false;
      observer.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
      scene.traverse((o: Object3D) => {
        const mesh = o as Mesh;
        mesh.geometry?.dispose();
      });
    },
    debug: {
      phase: () => phase,
      progress: () => progress,
      doorAngle: () => hinge.rotation.y,
    },
  };
}
