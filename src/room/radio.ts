// The radio on the shelf plays Listen to the Grid, through its own embeddable build (vendored in
// public/vendor/radio, see SOURCE.json there). Silent until pressed: the module is fetched when someone
// reaches for the button, and play() is called only from the press itself. It stops when you leave.

import * as v from 'valibot';

const MODULE_URL = '/vendor/radio/listen-to-the-grid-radio.js';

const StateShape = v.variant('status', [
  v.object({ status: v.literal('off'), reason: v.string() }),
  v.object({ status: v.literal('loading'), reason: v.string() }),
  v.looseObject({
    status: v.literal('playing'),
    reason: v.string(),
    stale: v.boolean(),
    halfHour: v.looseObject({ label: v.string(), measured: v.boolean() }),
  }),
  v.object({ status: v.literal('failed'), reason: v.string() }),
]);
type State = v.InferOutput<typeof StateShape>;

interface Radio {
  play(): Promise<void>;
  stop(): Promise<void>;
  readonly state: unknown;
  on(event: 'state', fn: (state: unknown) => void): () => void;
}
interface RadioModule {
  createRadio(options: { region: string; version: 'real' | 'ossia'; volume: number }): Radio;
}

function describe(state: State): string {
  switch (state.status) {
    case 'off':
      return 'off';
    case 'loading':
      return 'tuning in…';
    case 'playing':
      return state.stale ? `on, ${state.halfHour.label} (NESO is late; its last half-hour plays on)` : `on, ${state.halfHour.label}`;
    case 'failed':
      return `failed: ${state.reason}`;
  }
}

export function setupRadio(): void {
  const control = document.getElementById('radio');
  const button = document.getElementById('radio-button');
  const stateText = document.getElementById('radio-state');
  if (!control || !button || !stateText) return;
  control.hidden = false;
  let radio: Radio | null = null;
  let loading: Promise<Radio | null> | null = null;

  const render = (raw: unknown) => {
    const parsed = v.safeParse(StateShape, raw);
    const state: State = parsed.success ? parsed.output : { status: 'failed', reason: 'the radio reported something unexpected' };
    const on = state.status === 'playing' || state.status === 'loading';
    button.setAttribute('aria-pressed', String(on));
    control.dataset.state = state.status;
    stateText.textContent = describe(state);
  };

  // Fetching the module makes no sound and opens nothing; the radio only starts on a press.
  const load = (): Promise<Radio | null> => {
    loading ??= import(/* @vite-ignore */ new URL(MODULE_URL, location.href).href).then(
      (mod: RadioModule) => {
        radio = mod.createRadio({ region: 'gb', version: 'real', volume: 0.75 });
        radio.on('state', render);
        return radio;
      },
      (error: unknown) => {
        render({ status: 'failed', reason: `the radio could not be loaded (${error instanceof Error ? error.message : String(error)})` });
        return null;
      },
    );
    return loading;
  };
  button.addEventListener('pointerenter', () => void load(), { once: true });
  button.addEventListener('focus', () => void load(), { once: true });

  const toggle = async (): Promise<void> => {
    // Already loaded, play() runs inside the press, as browsers require for sound.
    const r = radio ?? (await load());
    if (!r) return;
    const status = v.safeParse(StateShape, r.state);
    if (status.success && (status.output.status === 'playing' || status.output.status === 'loading')) await r.stop();
    else await r.play();
  };
  button.addEventListener('click', () => void toggle());

  // Leaving the room stops it.
  window.addEventListener('pagehide', () => void radio?.stop());
}
