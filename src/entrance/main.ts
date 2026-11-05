// The entrance: whether a visit starts at the office door, and the way through it. The head script chose
// before first paint (html[data-entrance]): "door" for every fresh visit and every reload, "in" for Back
// and Forward, a deep link, ?in, a style direction or a still.
//
// Over the desk, the door is the desk's own scene (desk/room.ts): the poster of the door paints first,
// the whole desk loads behind it, and only then does the real door replace the poster. Come in (the
// door, the button, or Enter) walks through that one space and sits, ending on the desk's own view; if
// the desk is not ready yet, Come in says "Opening…" and waits, never walking into anything less. Skip
// and Esc go straight in; reduced motion cuts. On the flat page (phones), the door is a hero above the
// content: a light door (door.ts) that opens onto warm light, then the page scrolls on.

const root = document.documentElement;

interface Desk {
  walkIn(): Promise<void>;
  cutIn(): void;
  hitsDoor(x: number, y: number): boolean;
}

interface EntranceOptions {
  /** Resolves when the desk (or the flat office) is ready to be seen. */
  readonly ready: Promise<unknown>;
  /** The desk, once it is up; null on the flat page. */
  readonly desk: () => Desk | null;
}

export function startEntrance({ ready, desk }: EntranceOptions): void {
  const entrance = document.getElementById('entrance');
  const stage = entrance?.querySelector<HTMLElement>('.entrance__stage');
  const plate = document.getElementById('entrance-plate');
  const comeIn = document.getElementById('come-in');
  const skip = document.getElementById('skip-in');
  const lobby = document.querySelector<HTMLElement>('.lobby');
  if (!entrance || !stage || !plate || !comeIn || !skip) return;
  const reduced = root.dataset.motion === 'reduce';
  const photo = root.dataset.photo !== undefined;
  const overDesk = () => root.dataset.mode === 'room';
  let door: import('./door').DoorScene | null = null;
  let entering = false;

  // The flat page's light door, where WebGL is to hand.
  const mountFlat = (): void => {
    if (overDesk() || typeof WebGLRenderingContext !== 'function') return;
    void import('./door')
      .then(({ mountDoor }) => mountDoor({ stage, plate, lite: true, reduced, photo }))
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

  /**
   * In. Over the desk the door goes and focus lands on Harry's name. On the flat page the door is a hero
   * above the content, so it stays where it is (removing it would move the page) and the page scrolls on.
   */
  const arrive = (): void => {
    entering = false;
    delete entrance.dataset.walking;
    comeIn.textContent = 'Come in';
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

  const comeInNow = async (): Promise<void> => {
    if (entering || (root.dataset.entrance !== 'door' && overDesk())) return;
    entering = true;
    if (overDesk()) {
      if (root.dataset.stage !== 'live') {
        // The desk is still loading: say so, and wait for it rather than walk into anything less.
        comeIn.textContent = 'Opening…';
        comeIn.setAttribute('aria-busy', 'true');
        await ready;
      }
      entrance.dataset.walking = '';
      const d = desk();
      if (d && overDesk()) {
        if (reduced) d.cutIn();
        else await d.walkIn();
      }
    } else {
      entrance.dataset.walking = '';
      await door?.walk();
    }
    arrive();
  };
  const skipNow = (): void => {
    if (root.dataset.entrance !== 'door' || entering) return;
    desk()?.cutIn();
    arrive();
  };

  comeIn.addEventListener('click', (event) => {
    event.preventDefault();
    void comeInNow();
  });
  skip.addEventListener('click', (event) => {
    event.preventDefault();
    skipNow();
  });
  stage.addEventListener('click', (event) => {
    if (door?.hitsDoor(event.clientX, event.clientY)) void comeInNow();
  });
  // Over the desk the door is drawn on the desk's own stage, under this layer: a click on the door there.
  entrance.addEventListener('click', (event) => {
    if (overDesk() && event.target === entrance && desk()?.hitsDoor(event.clientX, event.clientY)) void comeInNow();
  });
  document.addEventListener('keydown', (event) => {
    if (root.dataset.entrance !== 'door') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      skipNow();
    } else if (event.key === 'Enter' && (document.activeElement === document.body || document.activeElement === entrance)) {
      event.preventDefault();
      void comeInNow();
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
    if (!photo) comeIn.focus({ preventScroll: true });
  }
}
