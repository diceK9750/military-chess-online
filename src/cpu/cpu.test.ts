import { expect, test } from 'vitest';
import { defaultPlacement } from '../dev/fixtures';
import { startGame, validateState } from '../game/game';
import { legalMoves } from '../game/movement';
import { PIECE_TYPES, RULESET_VERSION } from '../game/pieces';
import type { GameState, Move, Piece, PieceType, Player, Site } from '../game/types';
import { observeForCpu, type CpuObservation } from './observation';
import { generateCpuPlacement } from './placement';
import { chooseCpuMove } from './strategy';
import { playCpuTurn } from './turn';
import { validatePlacement } from '../game/placement';

const p = (id: string, type: PieceType, position: Site, owner: Player): Piece => ({ id, type, position, owner });
const state = (pieces: readonly Piece[], turn: Player): GameState => ({ rulesetVersion: RULESET_VERSION, pieces, firstPlayer: turn, turn, moveCount: 0, noncombatCount: 0, result: null, events: [] });

test('CPU observation strips all live enemy types, initial secrets, and removed enemy records', () => {
  const game = startGame(defaultPlacement(1), defaultPlacement(2), 2);
  const view = observeForCpu(game, 2);
  expect(view.pieces.filter(piece => piece.owner === 1)).toHaveLength(23);
  expect(view.pieces.filter(piece => piece.owner === 2 && piece.known)).toHaveLength(23);
  for (const piece of view.pieces.filter(piece => piece.owner === 1)) {
    expect(piece).toEqual({ owner: 1, position: piece.position, known: false });
    expect(Object.hasOwn(piece, 'type')).toBe(false);
    expect(Object.hasOwn(piece, 'id')).toBe(false);
  }
  expect(JSON.stringify(view)).not.toContain('initialPieces');
  expect(view.legalMoves).toEqual(legalMoves(game.pieces, 2));
});

test('secret-only opponent type swaps do not change observation or either CPU choice', () => {
  const pieces = [p('cpu', 'general', 'C7', 2), p('opp-a', 'spy', 'C6', 1), p('opp-b', 'mine', 'D6', 1), p('own', 'colonel', 'E7', 2)];
  const swapped = pieces.map(piece => piece.id === 'opp-a' ? { ...piece, type: 'mine' as const } : piece.id === 'opp-b' ? { ...piece, type: 'spy' as const } : piece);
  const a = observeForCpu(state(pieces, 2), 2);
  const b = observeForCpu(state(swapped, 2), 2);
  expect(a).toEqual(b);
  for (const difficulty of ['easy', 'normal'] as const) expect(chooseCpuMove(a, difficulty, 9750)).toEqual(chooseCpuMove(b, difficulty, 9750));
});

test('CPU can choose a high flight over an unknown enemy without using its hidden type', () => {
  const pieces = [p('air', 'aircraft', 'D4', 2), p('middle', 'spy', 'D2', 1), p('landing', 'engineer', 'HQ-P1', 1), p('own-capturer', 'general', 'F7', 2), p('enemy-capturer', 'colonel', 'F2', 1)];
  const game = state(pieces, 2);
  const view = observeForCpu(game, 2);
  const highFlight: Move = { from: 'D4', to: 'HQ-P1' };
  expect(view.legalMoves).toContainEqual(highFlight);
  const changed = state(pieces.map(piece => piece.id === 'middle' ? { ...piece, type: 'mine' as const } : piece), 2);
  expect(observeForCpu(changed, 2)).toEqual(view);
  for (const difficulty of ['easy', 'normal'] as const) expect(chooseCpuMove(observeForCpu(changed, 2), difficulty, 9750)).toEqual(chooseCpuMove(view, difficulty, 9750));
  const seed = Array.from({ length: 1024 }, (_, index) => index).find(candidate => JSON.stringify(chooseCpuMove(view, 'easy', candidate)) === JSON.stringify(highFlight));
  expect(seed).toBeDefined();
  const next = playCpuTurn(game, 2, 'easy', seed!);
  expect(next.events[0]).toMatchObject({ kind: 'MOVE', move: highFlight, battle: 'ATTACKER' });
  expect(next.pieces.find(piece => piece.id === 'middle')!.position).toBe('D2');
});

for (const side of [1, 2] as const) for (const seed of [0, 1, 9750, 0xffffffff]) {
  test(`CPU ${side} placement seed ${seed} is legal, complete, deterministic`, () => {
    const placement = generateCpuPlacement(side, seed);
    expect(() => validatePlacement(placement, side)).not.toThrow();
    expect(placement).toHaveLength(23);
    expect(new Set(placement.map(piece => piece.position)).size).toBe(23);
    expect(new Set(placement.map(piece => piece.type)).size).toBe(PIECE_TYPES.length);
    expect(generateCpuPlacement(side, seed)).toEqual(placement);
    const entrances = side === 1 ? ['B4', 'E4'] : ['B5', 'E5'];
    expect(placement.filter(piece => entrances.includes(piece.position!) && ['mine', 'flag'].includes(piece.type))).toHaveLength(0);
  });
}

for (const difficulty of ['easy', 'normal'] as const) for (const side of [1, 2] as const) {
  test(`${difficulty} CPU ${side} chooses only legal moves in full position`, () => {
    const game = startGame(defaultPlacement(1), defaultPlacement(2), side);
    const view = observeForCpu(game, side);
    const chosen = chooseCpuMove(view, difficulty, 123456);
    expect(chosen).not.toBeNull();
    expect(view.legalMoves).toContainEqual(chosen);
    expect(chooseCpuMove(view, difficulty, 123456)).toEqual(chosen);
    const next = playCpuTurn(game, side, difficulty, 123456);
    expect(next.moveCount).toBe(1);
    expect(next.turn).toBe(side === 1 ? 2 : 1);
    expect(next.events[1]).toMatchObject({ kind: 'MOVE', actor: side, move: chosen });
    validateState(next);
  });
}

test('one legal move is selected by both difficulties', () => {
  const only: Move = { from: 'B5', to: 'B4' };
  const view: CpuObservation = { side: 2, turn: 2, pieces: [{ id: 'a', owner: 2, type: 'general', position: 'B5', known: true }], legalMoves: [only], history: [], moveCount: 0, noncombatCount: 0 };
  expect(chooseCpuMove(view, 'easy', 1)).toEqual(only);
  expect(chooseCpuMove(view, 'normal', 1)).toEqual(only);
});

test('CPU turn can finish by occupying enemy HQ', () => {
  const game = state([p('cpu', 'general', 'C2', 2), p('human', 'colonel', 'A2', 1)], 2);
  const next = playCpuTurn(game, 2, 'normal', 9750);
  expect(next.result).toEqual({ winner: 2, reason: 'HQ_CAPTURE' });
  expect(next.turn).toBeNull();
});

test('CPU with no legal move records automatic PASS without a player move', () => {
  const game = state([p('cpu', 'general', 'A8', 2), p('mine-a', 'mine', 'A7', 2), p('mine-b', 'mine', 'B8', 2), p('human', 'general', 'A2', 1)], 2);
  const next = playCpuTurn(game, 2, 'normal', 7);
  expect(next.turn).toBe(1);
  expect(next.moveCount).toBe(0);
  expect(next.noncombatCount).toBe(0);
  expect(next.events).toEqual([{ kind: 'AUTO_PASS', actor: 2 }]);
});

test('CPU evaluation cannot be affected by false enemy type in a forged view', () => {
  const game = startGame(defaultPlacement(1), defaultPlacement(2), 2);
  const view = observeForCpu(game, 2);
  const altered = { ...view, pieces: view.pieces.map(piece => piece.owner === 1 ? { ...piece, type: 'general' } : piece) } as CpuObservation;
  expect(chooseCpuMove(view, 'normal', 9750)).toEqual(chooseCpuMove(altered, 'normal', 9750));
});
