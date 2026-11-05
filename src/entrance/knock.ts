// The knock at the door, and the voice that answers. Nothing touches audio until the visitor knocks: the
// AudioContext is made (or resumed) inside that click. Each knock is synthesised, no file and no licence:
// a short band-passed burst of noise for the rap, and a resonant, quickly fading woody body under it; two
// knocks 180 ms apart. About 600 ms later the voice says "Hello, welcome! … Come and explore." (Kokoro,
// Apache-2.0, generated offline; see NOTICES.txt), webm/Opus where the browser plays it, AAC otherwise.
// A speaker toggle on the door view mutes all of it, remembered across visits; muted, the captions still
// show on the same beat.

const SOUND = 'studio:sound';
/** The voice's sentences, and where each starts in the clip, in seconds. */
export const SAID = [
  { text: 'Hello, welcome!', at: 0 },
  { text: 'Come and explore.', at: 1.98 },
] as const;
/** When the second sentence ends: the door opens then. */
export const SAID_END = 3.16;
/** The beat: the two knocks, then the pause before the voice. */
export const BEAT = { second: 0.18, voice: 0.78 } as const;

/** What was played, for the checks: when each knock was scheduled, and the voice. */
export const heard = {
  hits: [] as number[],
  voice: 'none' as 'none' | 'scheduled' | 'missing' | 'muted',
  voiceAt: null as number | null,
};

export function soundOn(): boolean {
  try {
    return localStorage.getItem(SOUND) !== 'off';
  } catch {
    return true;
  }
}
export function setSound(on: boolean): void {
  try {
    localStorage.setItem(SOUND, on ? 'on' : 'off');
  } catch {
    // Without storage the choice lasts this visit only.
  }
}

let context: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function rap(ctx: AudioContext, at: number): void {
  noise ??= (() => {
    const b = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.05), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    return b;
  })();
  // The rap: knuckle on wood, a bright click.
  const burst = ctx.createBufferSource();
  burst.buffer = noise;
  const bright = ctx.createBiquadFilter();
  bright.type = 'bandpass';
  bright.frequency.value = 2400;
  bright.Q.value = 1.4;
  const tap = ctx.createGain();
  tap.gain.setValueAtTime(0.7, at);
  tap.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
  burst.connect(bright).connect(tap).connect(ctx.destination);
  burst.start(at);
  // The body: the door's panel, a low hollow ring that dies quickly.
  for (const [freq, level] of [
    [165, 0.55],
    [248, 0.3],
  ] as const) {
    const tone = ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.setValueAtTime(freq * 1.06, at);
    tone.frequency.exponentialRampToValueAtTime(freq, at + 0.03);
    const wood = ctx.createBiquadFilter();
    wood.type = 'bandpass';
    wood.frequency.value = freq;
    wood.Q.value = 6;
    const body = ctx.createGain();
    body.gain.setValueAtTime(0.0001, at);
    body.gain.exponentialRampToValueAtTime(level, at + 0.004);
    body.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
    tone.connect(wood).connect(body).connect(ctx.destination);
    tone.start(at);
    tone.stop(at + 0.2);
  }
  heard.hits.push(at);
}

function voiceUrl(): string {
  const probe = document.createElement('audio');
  return probe.canPlayType('audio/webm; codecs="opus"') ? '/audio/door-voice.webm' : '/audio/door-voice.m4a';
}

let bytes: Promise<ArrayBuffer> | null = null;
/** Fetches the voice's file ahead (network only: no audio is touched until the knock). */
export function prefetchVoice(): void {
  bytes ??= fetch(voiceUrl()).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))));
  bytes.catch(() => undefined);
}

/**
 * Knocks twice now and answers after the pause; call it from the knock's own click. Resolves once the voice
 * is scheduled (or known to be missing); with the sound off it plays nothing at all.
 */
export async function knockAndAnswer(on: boolean): Promise<void> {
  heard.hits = [];
  heard.voiceAt = null;
  if (!on) {
    heard.voice = 'muted';
    return;
  }
  context ??= new AudioContext();
  const ctx = context;
  if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
  const start = ctx.currentTime + 0.02;
  rap(ctx, start);
  rap(ctx, start + BEAT.second);
  heard.voice = 'none';
  try {
    prefetchVoice();
    // A copy: decoding detaches the buffer it is given, and a second knock needs the bytes again.
    const clip = await ctx.decodeAudioData(((await bytes) as ArrayBuffer).slice(0));
    const at = Math.max(ctx.currentTime + 0.02, start + BEAT.voice);
    const voice = ctx.createBufferSource();
    voice.buffer = clip;
    voice.connect(ctx.destination);
    voice.start(at);
    heard.voice = 'scheduled';
    heard.voiceAt = at;
  } catch {
    // No voice here (not decodable, or not there): the captions still say it, on the same beat.
    heard.voice = 'missing';
  }
}
