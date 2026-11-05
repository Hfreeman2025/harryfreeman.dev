import { describe, expect, it } from 'vitest';
import { readResult } from '../src/desk/printout';

const quote = (text: string, sections: string[]) => ({ fact: { text }, sections: sections.map((title) => ({ title })), score: 0.6 });

describe('Reception’s printout', () => {
  it('prints an answer’s first two quotations, each with the section it came from', () => {
    const printed = readResult({
      kind: 'answer',
      question: 'How does gridtop choose when to run?',
      quotes: [
        quote('Run it with --demo.', ['gridtop', 'See it in ten seconds']),
        quote('It picks the cleanest window.', ['gridtop']),
        quote('A third.', ['gridtop']),
      ],
    });
    expect(printed).toEqual({
      kind: 'answer',
      question: 'How does gridtop choose when to run?',
      quotes: [
        { text: 'Run it with --demo.', source: 'See it in ten seconds' },
        { text: 'It picks the cleanest window.', source: 'gridtop' },
      ],
    });
  });

  it('shortens a long quotation to fit the slip, marking the cut', () => {
    const long = 'word '.repeat(60).trim();
    const printed = readResult({ kind: 'answer', question: 'q', quotes: [quote(long, ['x'])] });
    expect(printed?.kind).toBe('answer');
    const text = printed?.kind === 'answer' ? (printed.quotes[0]?.text ?? '') : '';
    expect(text.length).toBeLessThanOrEqual(120);
    expect(text.endsWith('…')).toBe(true);
    expect(long.startsWith(text.slice(0, -1))).toBe(true);
  });

  it('prints a refusal as a refusal, with its reason', () => {
    expect(readResult({ kind: 'refusal', question: 'Favourite team?', reason: 'The record never mentions “team”.' })).toEqual({
      kind: 'refusal',
      question: 'Favourite team?',
      reason: 'The record never mentions “team”.',
    });
  });

  it('prints nothing for a result it cannot read', () => {
    expect(readResult(undefined)).toBeNull();
    expect(readResult({ kind: 'answer', question: 'q' })).toBeNull();
    expect(readResult({ kind: 'answer', question: 'q', quotes: [{ fact: {} }] })).toBeNull();
    expect(readResult({ kind: 'shrug', question: 'q' })).toBeNull();
  });
});
