// The entrance: whether a visit starts at the office door, and the way through it. The head script chose
// before first paint (html[data-entrance]): "door" for every fresh visit and every reload, "in" for Back
// and Forward, a deep link, ?in, a style direction or a still.
//
// Over the desk, the door is the desk's own scene (desk/room.ts): the poster of the door paints first,
// the whole desk loads behind it, and only then does the real door replace the poster. The way in is a
// knock (the door, the button, or Enter): two knocks, the door jolting and "knock" popping beside it on
// each; a pause; then a voice from inside, "Hello, welcome! … Come and explore.", captioned in a speech
// bubble from behind the door on the same beat; and as the second sentence ends the door swings open and
// the walk through that one space ends on the desk's own view. If the desk is not ready by then, the knock
// says "Opening…" and waits, never walking into anything less. Sound is the visitor's to turn off (and
// the captions show either way); Skip and Esc go straight in; reduced motion keeps the sound and the
// captions, with no jolt and no swing, and cuts. On the flat page (phones), the door is a hero above the
// content: a light door (door.ts) that opens onto warm light, then the page scrolls on.

import { bubblePath } from '../desk/speak';
import { BEAT, heard, knockAndAnswer, prefetchVoice, SAID, SAID_END, setSound, soundOn } from './knock';

const root = document.documentElement;
type Rect = { x: number; y: number; width: number; height: number };

interface Desk {
  walkIn(): Promise<void>;
  cutIn(): void;
  hitsDoor(x: number, y: number): boolean;
  knock(): void;
  hoverDoor(on: boolean): void;
  doorRect(): Rect | null;
}

interface EntranceOptions {
  /** Resolves when the desk (or the flat office) is ready to be seen. */
  readonly ready: Promise<unknown>;
  /** The desk, once it is up; null on the flat page. */
  readonly desk: () => Desk | null;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function startEntrance({ ready, desk }: EntranceOptions): void {
  const entrance = document.getElementById('entrance');
  const stage = entrance?.querySelector<HTMLElement>('.entrance__stage');
  const plate = document.getElementById('entrance-plate');
  const comeIn = document.getElementById('come-in');
  const skip = document.getElementById('skip-in');
  const sound = document.getElementById('door-sound');
  const said = document.getElementById('door-said');
  const saidText = said?.querySelector<HTMLElement>('.entrance__said-text');
  const knocks = [...(entrance?.querySelectorAll<HTMLElement>('.entrance__knock') ?? [])];
  const lobby = document.querySelector<HTMLElement>('.lobby');
  if (!entrance || !stage || !plate || !comeIn || !skip || !said || !saidText) return;
  const reduced = root.dataset.motion === 'reduce';
  const photo = root.dataset.photo !== undefined;
  const overDesk = () => root.dataset.mode === 'room';
  let door: import('./door').DoorScene | null = null;
  let entering = false;
  /** Which knock is playing; a skip mid-knock moves it on, and the knock stops at its next beat. */
  let run = 0;
  if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { knockDebug: heard });

  // The flat page's light door, where WebGL is to hand.
  const mountFlat = (): void => {
    if (overDesk() || typeof WebGLRenderingContext !== 'function') return;
    void import('./door')
      .then(({ mountDoor }) => mountDoor({ stage, plate, lite: true, reduced }))
      .then((scene) => {
        door = scene;
        entrance.dataset.door = 'live';
        if (new URLSearchParams(location.search).has('debug'))
          (window as unknown as { entranceDebug: unknown }).entranceDebug = scene.debug;
      })
      .catch(() => undefined);
  };
  // Over the desk, the door is live once the desk is.
  void ready.then(() => {
    if (overDesk()) entrance.dataset.door = 'live';
  });

  // The speaker: sound on unless the visitor turned it off, here or on an earlier visit.
  const showSound = (on: boolean) => {
    if (!sound) return;
    sound.setAttribute('aria-pressed', String(on));
    const state = sound.querySelector('.entrance__sound-state');
    if (state) state.textContent = on ? 'Sound: on' : 'Sound: off';
  };
  if (sound) {
    sound.hidden = false;
    showSound(soundOn());
    sound.addEventListener('click', () => {
      const on = !soundOn();
      setSound(on);
      showSound(on);
    });
  }

  /** Where the door is on the page now: from the 3D door, or the middle of the poster. */
  const doorRect = (): Rect => {
    const live = overDesk() ? desk()?.doorRect() : door?.rect();
    if (live) return live;
    const r = entrance.getBoundingClientRect();
    return { x: r.left + r.width * 0.39, y: r.top + r.height * 0.09, width: r.width * 0.22, height: r.height * 0.8 };
  };
  const jolt = () => (overDesk() ? desk()?.knock() : door?.knock());

  /** Knock and Skip beside the door, at the height of its handle, where there is room; at the foot if not. */
  const ways = entrance.querySelector<HTMLElement>('.entrance__ways');
  const placeWays = () => {
    if (!ways) return;
    const d = doorRect();
    const r = entrance.getBoundingClientRect();
    const left = d.x + d.width - r.left + 34;
    if (left + ways.offsetWidth > r.width - 16) {
      ways.style.transform = '';
      return;
    }
    ways.style.transform = `translate(${left.toFixed(0)}px, ${(d.y - r.top + d.height * 0.5 - ways.offsetHeight / 2).toFixed(0)}px)`;
  };
  /** Walking in, Skip waits in the corner, out of the way of the room (a transform: nothing moves on the page). */
  const cornerWays = () => {
    if (!ways) return;
    const r = entrance.getBoundingClientRect();
    ways.style.transform = `translate(${(r.width - ways.offsetWidth - 24).toFixed(0)}px, ${(r.height - ways.offsetHeight - 24).toFixed(0)}px)`;
  };
  new ResizeObserver(() => (entrance.dataset.walking === undefined ? placeWays() : cornerWays())).observe(entrance);
  void ready.then(() => requestAnimationFrame(placeWays));

  /** Over the desk, the door is drawn under this layer: a pointer on the layer itself (not on a button, the
   *  bubble or the speaker) is a pointer on the scene. */
  const onScene = (event: Event) => event.target === entrance || event.target === stage;
  // Over the door, it brightens a touch and the pointer becomes a knuckle.
  entrance.addEventListener('pointermove', (event) => {
    const over = overDesk()
      ? onScene(event) && Boolean(desk()?.hitsDoor(event.clientX, event.clientY))
      : Boolean(door?.hitsDoor(event.clientX, event.clientY));
    if (over === (entrance.dataset.hover !== undefined)) return;
    if (over) entrance.dataset.hover = '';
    else delete entrance.dataset.hover;
    if (overDesk()) desk()?.hoverDoor(over);
    else door?.brighten(over);
  });

  /** "knock", popping beside the door: the first on the hinge side, the second on the handle side. */
  const pop = (i: number) => {
    const word = knocks[i];
    if (!word) return;
    const d = doorRect();
    const r = entrance.getBoundingClientRect();
    const x = i === 0 ? d.x - r.left - 26 : d.x + d.width - r.left + 26;
    word.style.left = `${x.toFixed(0)}px`;
    word.style.top = `${(d.y - r.top + d.height * (i === 0 ? 0.36 : 0.3)).toFixed(0)}px`;
    word.dataset.side = i === 0 ? 'left' : 'right';
    delete word.dataset.on;
    void word.offsetWidth;
    word.dataset.on = '';
  };

  /** The voice's words, in a speech bubble from behind the door's handle side, its tail to the door. */
  const say = (text: string) => {
    saidText.textContent = text;
    said.dataset.on = '';
    const d = doorRect();
    const r = entrance.getBoundingClientRect();
    const w = said.offsetWidth;
    const h = said.offsetHeight;
    const right = d.x + d.width + 18;
    // Beside the door if there is room, otherwise above its top.
    const beside = right + w <= r.right - 12;
    const x = beside ? right - r.left : Math.max(12, Math.min(r.width - w - 12, d.x - r.left + d.width / 2 - w / 2));
    const y = beside ? d.y - r.top + d.height * 0.16 : Math.max(12, d.y - r.top - h - 14);
    said.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
    const tip = beside ? { x: -16, y: h * 0.62 } : { x: w / 2, y: h + 16 };
    const svg = said.querySelector('svg');
    svg?.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg?.setAttribute('width', String(w));
    svg?.setAttribute('height', String(h));
    svg?.querySelector('path')?.setAttribute('d', bubblePath(w, h, 16, tip));
  };
  const hush = () => {
    delete said.dataset.on;
    saidText.textContent = '';
    for (const word of knocks) delete word.dataset.on;
  };

  /**
   * In. Over the desk the door goes and focus lands on Harry's name. On the flat page the door is a hero
   * above the content, so it stays where it is (removing it would move the page) and the page scrolls on.
   */
  const arrive = (): void => {
    entering = false;
    hush();
    delete entrance.dataset.walking;
    delete entrance.dataset.knocking;
    comeIn.textContent = 'Knock';
    comeIn.removeAttribute('aria-busy');
    if (!overDesk()) {
      root.dataset.entrance = 'passed';
      document.getElementById('directory')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
      return;
    }
    root.dataset.entrance = 'in';
    lobby?.removeAttribute('inert');
    document.querySelector<HTMLElement>('.masthead__name')?.focus({ preventScroll: true });
  };

  const knockNow = async (): Promise<void> => {
    if (entering || (root.dataset.entrance !== 'door' && overDesk())) return;
    entering = true;
    const mine = ++run;
    const still = () => mine === run;
    entrance.dataset.knocking = '';
    // The sound starts in this click, or not at all.
    void knockAndAnswer(soundOn());
    jolt();
    pop(0);
    await wait(BEAT.second * 1000);
    if (!still()) return;
    jolt();
    pop(1);
    await wait((BEAT.voice - BEAT.second) * 1000);
    if (!still()) return;
    const [first, second] = SAID;
    say(first.text);
    await wait(second.at * 1000);
    if (!still()) return;
    say(`${first.text} ${second.text}`);
    await wait((SAID_END - second.at) * 1000);
    if (!still()) return;
    // As the second sentence ends, the door opens.
    if (overDesk()) {
      if (root.dataset.stage !== 'live') {
        // The desk is still loading: say so, and wait for it rather than walk into anything less.
        comeIn.textContent = 'Opening…';
        comeIn.setAttribute('aria-busy', 'true');
        delete entrance.dataset.knocking;
        await ready;
        if (!still()) return;
      }
      entrance.dataset.walking = '';
      cornerWays();
      const d = desk();
      if (d && overDesk()) {
        if (reduced) d.cutIn();
        else {
          hush();
          await d.walkIn();
        }
      }
    } else {
      entrance.dataset.walking = '';
      cornerWays();
      hush();
      await door?.walk();
    }
    // Skip or Esc mid-walk has already cut in and arrived.
    if (!still()) return;
    arrive();
  };
  const skipNow = (): void => {
    if (root.dataset.entrance !== 'door') return;
    // Mid-knock too: the knock stops where it is.
    run++;
    desk()?.cutIn();
    arrive();
  };

  comeIn.textContent = 'Knock';
  comeIn.addEventListener('click', (event) => {
    event.preventDefault();
    void knockNow();
  });
  skip.addEventListener('click', (event) => {
    event.preventDefault();
    skipNow();
  });
  stage.addEventListener('click', (event) => {
    if (door?.hitsDoor(event.clientX, event.clientY)) void knockNow();
  });
  // Over the desk the door is drawn on the desk's own stage, under this layer: a click on the door there.
  entrance.addEventListener('click', (event) => {
    if (overDesk() && onScene(event) && desk()?.hitsDoor(event.clientX, event.clientY)) void knockNow();
  });
  document.addEventListener('keydown', (event) => {
    if (root.dataset.entrance !== 'door') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      skipNow();
    } else if (event.key === 'Enter' && (document.activeElement === document.body || document.activeElement === entrance)) {
      event.preventDefault();
      void knockNow();
    }
  });
  // Back to this page from another (the CV, a tool) restores where the visitor was: inside.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && root.dataset.entrance === 'door') skipNow();
  });

  if (root.dataset.entrance === 'door') {
    // Over the desk the door is all there is until you come in; on the flat page it is a hero above it.
    if (overDesk()) lobby?.setAttribute('inert', '');
    mountFlat();
    if (!photo) {
      prefetchVoice();
      comeIn.focus({ preventScroll: true });
    }
  }
}
