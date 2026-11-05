// Reception's printout: when ask-the-record answers, the tiny printer on the model's counter prints it
// as a readable slip, with each quotation and where it comes from; a refusal prints as a refusal, with
// ask-the-record's own reason. The result comes from the element, so it is parsed, not trusted.

import * as v from 'valibot';

const Quote = v.looseObject({
  fact: v.looseObject({ text: v.string() }),
  sections: v.array(v.looseObject({ title: v.string() })),
});
const Result = v.variant('kind', [
  v.looseObject({ kind: v.literal('answer'), question: v.string(), quotes: v.array(Quote) }),
  v.looseObject({ kind: v.literal('refusal'), question: v.string(), reason: v.string() }),
]);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

/** What the slip prints: the question, then its first two quotations (shortened) or the refusal's reason. */
export type Printed =
  | { kind: 'answer'; question: string; quotes: Array<{ text: string; source: string }> }
  | { kind: 'refusal'; question: string; reason: string };

const SLIP_QUOTES = 2;
const SLIP_CHARS = 120;

/** Reads ask-the-record's result for the slip; null when it is not a result the slip can print. */
export function readResult(result: unknown): Printed | null {
  const parsed = v.safeParse(Result, result);
  if (!parsed.success) return null;
  const r = parsed.output;
  if (r.kind === 'refusal') return { kind: 'refusal', question: r.question, reason: r.reason };
  // The slip is a printout of the answer; the full quotations are in the Reception panel beside it.
  return {
    kind: 'answer',
    question: r.question,
    quotes: r.quotes.slice(0, SLIP_QUOTES).map((q) => ({
      text: q.fact.text.length > SLIP_CHARS ? `${q.fact.text.slice(0, SLIP_CHARS - 2).trimEnd()}…` : q.fact.text,
      source: q.sections[1]?.title ?? q.sections[0]?.title ?? 'The record',
    })),
  };
}

/** Prints a result onto the slip; returns what was printed, or null when the result is unreadable. */
export function printResult(slip: HTMLElement, result: unknown): 'answer' | 'refusal' | null {
  const r = readResult(result);
  if (!r) return null;
  const head = el('p', 'printout__head');
  head.append(el('span', '', 'Reception'), el('span', '', time.format(new Date())));
  slip.replaceChildren(head, el('p', 'printout__question', `“${r.question}”`));
  if (r.kind === 'refusal') {
    slip.append(el('p', 'printout__refusal', 'No answer.'), el('p', 'printout__reason', r.reason));
  } else {
    const list = el('ol', 'printout__quotes');
    for (const q of r.quotes) {
      const item = el('li', 'printout__quote');
      item.append(el('q', '', q.text), el('span', 'printout__source', q.source));
      list.append(item);
    }
    slip.append(list);
  }
  slip.dataset.kind = r.kind;
  slip.append(el('p', 'printout__foot', 'Quoted from the record, in your browser.'));
  return r.kind;
}

/** Places the slip over the printer, as if it came out of it, inside the room. */
export function placeSlip(slip: HTMLElement, hall: HTMLElement, at: { x: number; y: number } | null): void {
  const h = hall.getBoundingClientRect();
  const w = slip.offsetWidth || 280;
  const ht = slip.offsetHeight || 200;
  const x = at ? at.x - h.left - w / 2 : h.width - w - 24;
  const y = at ? at.y - h.top - ht - 6 : 24;
  const cx = Math.min(Math.max(x, 16), h.width - w - 16);
  const cy = Math.min(Math.max(y, 16), h.height - ht - 16);
  slip.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
}
