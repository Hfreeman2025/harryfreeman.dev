// The grid sign, in both renderings: the current half-hour's carbon intensity, its time and its
// source, or "grid data unavailable". The 3D room prints it on the sign in the scene, and its light follows it. A reading is shown only while it
// is current; when it expires without a fresh one, the sign says unavailable and the light goes neutral.

import {
  expiresAt,
  fetchMix,
  fetchReading,
  type GridMix,
  type GridReading,
  lightFor,
  NEUTRAL_LIGHT,
  type RoomLight,
  type SignText,
  signFor,
} from './grid';

const RETRY_MS = 5 * 60_000;

export function startGridSign(on: {
  light: (light: RoomLight) => void;
  sign: (text: SignText) => void;
  /** The generation mix (the office window's turbines and panels); null when there is none. */
  mix?: (mix: GridMix | null) => void;
}): void {
  const sign = document.getElementById('grid-sign');
  if (!sign) return;
  const set = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let current: GridReading | null = null;

  const show = (reading: GridReading | null, problem?: string) => {
    const text = signFor(reading, problem);
    sign.dataset.state = text.state;
    set('grid-value', text.headline);
    set('grid-detail', text.detail);
    set('grid-light', text.light);
    on.sign(text);
    on.light(reading ? lightFor(reading) : NEUTRAL_LIGHT);
  };

  const read = async (): Promise<void> => {
    // The mix alongside the reading, on its own: either can fail without the other.
    if (on.mix) void fetchMix().then(on.mix, () => on.mix?.(null));
    try {
      current = await fetchReading();
      show(current);
      clearTimeout(expiry);
      expiry = setTimeout(
        () => {
          current = null;
          show(null, 'the last reading is no longer current');
        },
        Math.max(0, expiresAt(current) - Date.now()),
      );
      // The next half-hour is published a few minutes after this one ends.
      setTimeout(() => void read(), Math.max(60_000, (current?.to ?? Date.now()) + 3 * 60_000 - Date.now()));
    } catch (error) {
      // A failed refresh keeps a reading that is still current; otherwise the sign says so.
      if (!current) show(null, error instanceof Error ? error.message : String(error));
      setTimeout(() => void read(), RETRY_MS);
    }
  };

  sign.hidden = false;
  show(null);
  void read();
}
