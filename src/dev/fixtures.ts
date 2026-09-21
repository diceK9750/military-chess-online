import { rotate, territory } from '../game/board';
import { PIECES, PIECE_TYPES, RULESET_VERSION } from '../game/pieces';
import { validatePlacement } from '../game/placement';
import type { GameState, Piece, Player, Site } from '../game/types';

/** Synthetic data only. This module must never be used to distribute real opponent state. */
export function defaultPlacement(side: Player): Piece[] {
  const types = PIECE_TYPES.flatMap(type => Array.from({ length: PIECES[type].count }, () => type));
  const sites = [...territory(1)];
  const reserved: Partial<Record<Site, Piece['type']>> = { 'HQ-P1': 'mine', A1: 'mine', A2: 'flag' };
  for (const type of Object.values(reserved)) types.splice(types.indexOf(type!), 1);
  const pieces: Piece[] = sites.map((site, i) => ({ id: `local-${side}-${i}`, owner: side, type: reserved[site] ?? types.shift()!, position: side === 1 ? site : rotate(site) }));
  validatePlacement(pieces, side);
  return pieces;
}
export function scenario(name: 'aircraft' | 'capture'): GameState {
  const pieces: Piece[] = [
    { id: 'demo-1', owner: 1, type: name === 'aircraft' ? 'aircraft' : 'general', position: name === 'aircraft' ? 'HQ-P1' : 'C7' },
    { id: 'demo-2', owner: 2, type: 'colonel', position: 'A7' },
  ];
  if (name === 'aircraft') pieces.push({ id: 'demo-3', owner: 1, type: 'general', position: 'A2' }, { id: 'demo-4', owner: 2, type: 'engineer', position: 'HQ-P2' });
  return { rulesetVersion: RULESET_VERSION, pieces, firstPlayer: 1, turn: 1, moveCount: 0, noncombatCount: 0, result: null, events: [] };
}
