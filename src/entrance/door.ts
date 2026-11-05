// The phone's door: the outside of Harry's office door in the desk's graphic style, light enough for a
// phone (the desk itself comes to phones later). A corridor wall and floor, the door with its frosted
// pane, the brass plate (the name and role engraved on it), a handle and a doormat, with warm light
// under the door. Come in swings the door open onto the room's warm light and steps towards it; the page
// then scrolls on to the content. There is no room modelled behind it, so nothing stands in for the desk.
// Units are metres; the door is at z = 0, the corridor in front (+z).

import {
  Box3,
  Color,
  DirectionalLight,
  HemisphereLight,
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
import { buildDoorway, DOOR } from '../desk/doorway';
import { doorWords } from '../desk/lettering';
import { DeskPass } from '../desk/pass';
import { loadGltf } from '../scene/style';

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
  /** The door a touch brighter under the pointer. */
  brighten(on: boolean): void;
  /** The door on screen, in page pixels. */
  rect(): { x: number; y: number; width: number; height: number };
  dispose(): void;
  readonly debug: Record<string, () => unknown>;
}

interface Options {
  readonly stage: HTMLElement;
  /** The plate's words on the page (visually hidden; engraved on the 3D plate). */
  readonly plate: HTMLElement;
  /** Phones: a lower pixel ratio and fewer details. */
  readonly lite: boolean;
  readonly reduced: boolean;
}

const _flat = (color: string) => new MeshLambertMaterial({ color });
const ease = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
};
const span = (t: number, [a, b]: readonly [number, number]) => ease((t - a) / (b - a));

/** Behind the door: the room's warm light, filling the doorway. */
function light(): Mesh {
  const glow = new Mesh(new PlaneGeometry(DOOR.width + 0.4, DOOR.height + 0.4), new MeshBasicMaterial({ color: '#fff1cf' }));
  glow.position.set(0, DOOR.height / 2, -0.3);
  glow.userData.noEdge = true;
  return glow;
}

export async function mountDoor({ stage, plate: plateText, lite, reduced }: Options): Promise<DoorScene> {
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
  // The same doorway as the desk scene's, in metres.
  const doorway = buildDoorway({ unit: 1, floor: 0, z: 0, words: doorWords(plateText) });
  const { hinge } = doorway;
  scene.add(doorway.group, light());
  if (!lite)
    void loadGltf('kenney-furniture-kit/pottedPlant.glb')
      .then((gltf) => {
        const plant = gltf.scene;
        plant.updateMatrixWorld(true);
        const size = new Box3().setFromObject(plant).getSize(new Vector3());
        plant.scale.setScalar(doorway.plantHeight / Math.max(0.001, size.y));
        plant.position.copy(doorway.plantAt);
        scene.add(plant);
        dirty = true;
      })
      .catch(() => undefined);

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
    brighten(on) {
      doorway.brighten(on && phase === 'door');
      dirty = true;
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
