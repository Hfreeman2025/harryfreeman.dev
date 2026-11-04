// Ask the studio: ask-the-record's element, loaded from its own folder when someone reaches for it.
// Until then a plain stand-in box sits in its place (light DOM, which the element's shadow root
// replaces once it upgrades), so the first screen costs nothing.

import * as v from 'valibot';
import { PIECES, type PieceId } from './content/pieces';

const ELEMENT_URL = '/vendor/ask-the-record/ask-the-record.min.js';
const SUGGESTIONS_URL = '/record/suggestions.json';

const SuggestionsSchema = v.object({
  model: v.string(),
  questions: v.array(v.object({ question: v.string(), vector: v.pipe(v.string(), v.base64()) })),
});

const QuoteShape = v.looseObject({ sections: v.array(v.looseObject({ title: v.string() })) });
const ResultShape = v.looseObject({
  kind: v.picklist(['answer', 'refusal']),
  quotes: v.optional(v.array(QuoteShape)),
});

interface AskElement extends HTMLElement {
  ask(question: string, options?: { vector?: Float32Array }): Promise<unknown>;
}

function decodeVector(base64: string): Float32Array {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Float32Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 4));
}

/** Which desks an answer quoted: the piece whose README a quote came from. The CV lights no desk. */
export function piecesQuoted(result: unknown): PieceId[] {
  const parsed = v.safeParse(ResultShape, result);
  if (!parsed.success || parsed.output.kind !== 'answer') return [];
  const found: PieceId[] = [];
  for (const quote of parsed.output.quotes ?? []) {
    const top = quote.sections[1]?.title;
    const piece = PIECES.find((p) => p.title === top);
    if (piece && !found.includes(piece.id)) found.push(piece.id);
  }
  return found;
}

/** Where a quote's source link should go: its piece's desk, or the CV at the quoted words. */
export function sourceOf(quote: unknown): { piece: PieceId } | { cv: string } | null {
  const parsed = v.safeParse(v.looseObject({ sections: QuoteShape.entries.sections, fact: v.looseObject({ text: v.string() }) }), quote);
  if (!parsed.success) return null;
  const top = parsed.output.sections[1]?.title;
  const piece = PIECES.find((p) => p.title === top);
  if (piece) return { piece: piece.id };
  // A text fragment scrolls the CV to the quote and highlights it.
  const words = parsed.output.fact.text.split(/\s+/).slice(0, 8).join(' ');
  // Commas and hyphens are syntax in a text fragment, so they are escaped too.
  return { cv: `/cv.html#:~:text=${encodeURIComponent(words).replace(/-/g, '%2D')}` };
}

export interface AskOptions {
  /** Runs before the element loads: whatever an answer will be marked in must be in the page first. */
  readonly prepare?: () => Promise<unknown>;
  readonly onAnswer: (pieces: PieceId[]) => void;
  /** The first quote found in the page, as a range, once an answer has been marked. */
  readonly onLocated?: (range: Range | null) => void;
  readonly onSource: (piece: PieceId) => void;
}

export function setupAsk(options: AskOptions): void {
  const box = document.getElementById('ask-box') as AskElement | null;
  const section = document.getElementById('ask');
  if (!box || !section) return;

  const standin = section.querySelector<HTMLInputElement>('.ask__standin input');
  const standinForm = section.querySelector<HTMLFormElement>('.ask__standin');
  let vectors = new Map<string, Float32Array>();
  let pending: string | null = null;
  let loading: Promise<boolean> | null = null;

  const ready = new Promise<void>((resolve) => box.addEventListener('ask-the-record:ready', () => resolve(), { once: true }));

  const load = (): Promise<boolean> => {
    loading ??= (async () => {
      const src = box.dataset.src;
      if (!src) return false;
      box.setAttribute('src', src);
      await options.prepare?.();
      try {
        await import(/* @vite-ignore */ new URL(ELEMENT_URL, location.href).href);
      } catch (error) {
        section.dataset.state = 'failed';
        const note = document.createElement('p');
        note.className = 'ask__none';
        note.textContent = `Asking is unavailable: ask-the-record could not be loaded (${error instanceof Error ? error.message : String(error)}).`;
        section.append(note);
        return false;
      }
      try {
        const response = await fetch(SUGGESTIONS_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const file = v.parse(SuggestionsSchema, await response.json());
        vectors = new Map(file.questions.map((q) => [q.question, decodeVector(q.vector)]));
      } catch {
        // Without the precomputed vectors the suggested questions are embedded here, like any other.
        vectors = new Map();
      }
      await ready;
      const typed = standin?.value.trim() ?? '';
      const hadFocus = standin !== null && document.activeElement === standin;
      const real = box.shadowRoot?.querySelector<HTMLInputElement>('[part="input"]');
      if (real && typed) real.value = typed;
      if (real && hadFocus) real.focus();
      return true;
    })();
    return loading;
  };

  const ask = async (question: string): Promise<void> => {
    if (!(await load())) return;
    const vector = vectors.get(question);
    await box.ask(question, vector ? { vector } : {});
  };

  section.addEventListener('pointerenter', () => void load(), { once: true });
  section.addEventListener('focusin', () => void load(), { once: true });
  standinForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    pending = standin?.value.trim() ?? '';
    if (pending) void ask(pending);
  });
  for (const button of section.querySelectorAll<HTMLButtonElement>('button[data-question]')) {
    button.addEventListener('click', () => void ask(button.dataset.question ?? ''));
  }

  box.addEventListener('ask-the-record:answer', (event) => {
    const detail = (event as CustomEvent<{ result?: unknown }>).detail;
    options.onAnswer(piecesQuoted(detail?.result));
  });
  box.addEventListener('ask-the-record:clear', () => options.onAnswer([]));
  box.addEventListener('ask-the-record:located', (event) => {
    const located = (event as CustomEvent<{ located?: ReadonlyArray<{ range?: unknown }> }>).detail?.located;
    const range = located?.[0]?.range;
    options.onLocated?.(range instanceof Range ? range : null);
  });
  // The record merges eleven sources into one page, so its own section links would go nowhere here.
  box.addEventListener('ask-the-record:source', (event) => {
    const target = sourceOf((event as CustomEvent<{ quote?: unknown }>).detail?.quote);
    if (!target) return;
    event.preventDefault();
    if ('piece' in target) options.onSource(target.piece);
    else location.assign(target.cv);
  });
}
