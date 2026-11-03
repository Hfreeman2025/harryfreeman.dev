// How the ten tools are filed: one drawer per theme, top to bottom.

import type { PieceId } from './pieces';

export interface Drawer {
  readonly id: string;
  /** The label in the drawer's card holder. */
  readonly label: string;
  /** Where the directory board says it is. */
  readonly position: string;
  readonly pieces: readonly PieceId[];
}

export const DRAWERS: readonly Drawer[] = [
  { id: 'inside', label: 'Inside the model', position: 'Top drawer', pieces: ['gpt-in-a-tab', 'real-or-hallucinated'] },
  { id: 'agents', label: 'Agents and evidence', position: 'Second drawer', pieces: ['agent-race', 'receipts', 'dreaming'] },
  { id: 'grid', label: 'The electricity grid', position: 'Third drawer', pieces: ['grid-weather', 'gridtop', 'listen-to-the-grid'] },
  { id: 'sources', label: 'Answers with sources', position: 'Bottom drawer', pieces: ['ask-the-record', 'sourced'] },
];

export function drawerOf(piece: PieceId): Drawer {
  const drawer = DRAWERS.find((d) => d.pieces.includes(piece));
  if (!drawer) throw new Error(`${piece} is not filed`);
  return drawer;
}
