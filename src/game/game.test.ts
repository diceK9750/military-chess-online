import { expect, test } from 'vitest';
import { defaultPlacement } from '../dev/fixtures';
import { rotate } from './board';
import { applyMove, settleTurn, startGame, validateState } from './game';
import { legalMoves } from './movement';
import { PIECES, PIECE_TYPES, RULESET_VERSION } from './pieces';
import { validatePieces, validatePlacement } from './placement';
import type { GameState, Piece, PieceType, Player, Site } from './types';

const p = (id: string, type: PieceType, position: Site | null, owner: Player = 1): Piece => ({ id, type, position, owner });
const state = (pieces: Piece[], extras: Partial<GameState> = {}): GameState => ({ rulesetVersion: RULESET_VERSION, pieces, firstPlayer: 1, turn: 1, moveCount: 0, noncombatCount: 0, result: null, events: [], ...extras });
const reserves = [p('r1', 'colonel', 'A2'), p('r2', 'colonel', 'F7', 2)];
function swap(pieces: Piece[], a: Site, b: Site): Piece[] { return pieces.map(piece => ({ ...piece, position: piece.position === a ? b : piece.position === b ? a : piece.position })); }
test('inventory matches specification and both full setups start', () => {
  expect(PIECE_TYPES).toHaveLength(16);
  expect(PIECE_TYPES.map(t => PIECES[t].count).reduce((a, b) => a + b, 0)).toBe(23);
  expect(PIECE_TYPES.filter(t => PIECES[t].count === 1)).toHaveLength(9);
  for (const side of [1, 2] as const) {
    const pieces = defaultPlacement(side); expect(() => validatePlacement(pieces, side)).not.toThrow();
    for (const type of PIECE_TYPES) expect(pieces.filter(p => p.type === type)).toHaveLength(PIECES[type].count);
    const game = startGame(defaultPlacement(1), defaultPlacement(2), side);
    expect(game.pieces).toHaveLength(46); expect(game.firstPlayer).toBe(side);
  }
});
for (const entrance of ['B4', 'E4'] as const) for (const [source, type] of [['A1', 'mine'], ['A2', 'flag']] as const) test(`${type} at ${entrance} forbidden`, () => {
  expect(() => validatePlacement(swap(defaultPlacement(1), source, entrance), 1)).toThrow('FORBIDDEN_ENTRANCE');
});
for (const last of ['A1', 'B1', 'HQ-P1', 'E1', 'F1'] as const) test(`flag last row ${last}`, () => expect(() => validatePlacement(swap(defaultPlacement(1), 'A2', last), 1)).toThrow('FLAG_LAST_ROW'));
test('reject missing, duplicate ID, duplicate HQ, wrong inventory/territory/anchor', () => {
  const pieces = defaultPlacement(1);
  expect(() => validatePlacement(pieces.slice(1), 1)).toThrow('PIECE_COUNT');
  expect(() => validatePlacement([...pieces, pieces[0]], 1)).toThrow('DUPLICATE_ID');
  expect(() => validatePlacement(pieces.map((p, i) => i === 0 ? { ...p, position: 'HQ-P1' } : p), 1)).toThrow('OCCUPIED_SITE');
  expect(() => validatePlacement(pieces.map((p, i) => i === 0 ? { ...p, type: 'general' } : p), 1)).toThrow('EXCESS_PIECES');
  expect(() => validatePlacement(pieces.map((p, i) => i === 0 ? { ...p, position: 'A8' } : p), 1)).toThrow('OUTSIDE_TERRITORY');
  expect(() => validatePlacement(pieces.map((p, i) => i === 0 ? { ...p, position: 'C1' as Site } : p), 1)).toThrow('INVALID_SITE');
});
for (const [defender, outcome, attackerPos, defenderPos] of [
  ['captain', 'ATTACKER', 'B4', null], ['general', 'DEFENDER', null, 'B4'], ['major', 'MUTUAL', null, null],
] as const) test(`battle position ${outcome} and input unchanged`, () => {
  const input = state([...reserves, p('a', 'major', 'B3'), p('d', defender, 'B4', 2)], { moveCount: 49, noncombatCount: 49 });
  const snapshot = JSON.stringify(input);
  const next = applyMove(input, { from: 'B3', to: 'B4' });
  expect(next.pieces.find(p => p.id === 'a')!.position).toBe(attackerPos);
  expect(next.pieces.find(p => p.id === 'd')!.position).toBe(defenderPos);
  expect(next.noncombatCount).toBe(0); expect(next.moveCount).toBe(50);
  expect(next.events[0]).toMatchObject({ battle: outcome }); expect(JSON.stringify(input)).toBe(snapshot);
});
test('flag inherits dynamically, supporting piece survives', () => {
  const input = state([...reserves, p('a', 'engineer', 'C3', 2), p('flag', 'flag', 'C2'), p('support', 'tank', 'HQ-P1')], { turn: 2 });
  const next = applyMove(input, { from: 'C3', to: 'C2' });
  expect(next.pieces.find(p => p.id === 'flag')!.position).toBeNull();
  expect(next.pieces.find(p => p.id === 'support')!.position).toBe('HQ-P1');
  const noSupport = { ...input, pieces: input.pieces.filter(p => p.id !== 'support') };
  expect(applyMove(noSupport, { from: 'C3', to: 'C2' }).pieces.find(p => p.id === 'a')!.position).toBe('C2');
});
test('same effective type draws without removing flag support', () => {
  const next = applyMove(state([...reserves, p('a', 'tank', 'C3', 2), p('flag', 'flag', 'C2'), p('support', 'tank', 'HQ-P1')], { turn: 2 }), { from: 'C3', to: 'C2' });
  expect(next.pieces.filter(p => ['a', 'flag'].includes(p.id)).every(p => p.position === null)).toBe(true);
  expect(next.pieces.find(p => p.id === 'support')!.position).toBe('HQ-P1');
});
test('HQ capture takes priority over 50 and elimination', () => {
  const next = applyMove(state([p('a', 'general', 'C7')], { moveCount: 49, noncombatCount: 49 }), { from: 'C7', to: 'HQ-P2' });
  expect(next.result).toEqual({ winner: 1, reason: 'HQ_CAPTURE' }); expect(next.noncombatCount).toBe(50);
});
test('aircraft HQ combat is not occupation; selected lane remains in event', () => {
  const next = applyMove(state([...reserves, p('a', 'aircraft', 'HQ-P1'), p('d', 'engineer', 'HQ-P2', 2)]), { from: 'HQ-P1', to: 'HQ-P2', lane: 'D' });
  expect(next.result).toBeNull(); expect(next.turn).toBe(2); expect(next.pieces.find(p => p.id === 'a')!.position).toBe('HQ-P2');
  expect(next.events[0]).toMatchObject({ move: { lane: 'D' }, battle: 'ATTACKER' });
});
test('unqualified HQ visitor can exit through another port on later turn', () => {
  let game = state([...reserves, p('a', 'spy', 'C7')]);
  game = applyMove(game, { from: 'C7', to: 'HQ-P2' }); expect(game.result).toBeNull();
  game = applyMove(game, { from: 'F7', to: 'F6' });
  game = applyMove(game, { from: 'HQ-P2', to: 'E8' }); expect(game.pieces.find(p => p.id === 'a')!.position).toBe('E8');
});
test('one capturer side extinct / both extinct', () => {
  const both = applyMove(state([p('a', 'general', 'B4'), p('d', 'general', 'B5', 2)]), { from: 'B4', to: 'B5' });
  expect(both.result).toEqual({ winner: null, reason: 'BOTH_CAPTURERS_ELIMINATED' });
  const one = applyMove(state([p('a', 'general', 'B4'), p('d', 'colonel', 'B5', 2)]), { from: 'B4', to: 'B5' });
  expect(one.result).toEqual({ winner: 1, reason: 'CAPTURERS_ELIMINATED' });
});
test('flag strength does not prevent capturer extinction', () => {
  const next = applyMove(state([p('a', 'general', 'B4'), p('d', 'general', 'B5', 2), p('flag', 'flag', 'C7', 2), p('rear', 'tank', 'HQ-P2', 2)]), { from: 'B4', to: 'B5' });
  expect(next.result?.reason).toBe('BOTH_CAPTURERS_ELIMINATED');
});
test('50 quiet moves and finished move rejection', () => {
  const next = applyMove(state(reserves, { moveCount: 49, noncombatCount: 49 }), { from: 'A2', to: 'A3' });
  expect(next.result).toEqual({ winner: null, reason: 'FIFTY_NONCOMBAT_MOVES' }); expect(next.turn).toBeNull();
  expect(() => applyMove(next, { from: 'F7', to: 'F6' })).toThrow('GAME_FINISHED');
});
// A corner capturer surrounded by two immobile friendly mines cannot move.
const blockedP2 = [p('d', 'general', 'A8', 2), p('m1', 'mine', 'A7', 2), p('m2', 'mine', 'B8', 2)];
test('automatic PASS after move does not alter either counter', () => {
  const next = applyMove(state([p('a', 'general', 'A2'), ...blockedP2], { moveCount: 7, noncombatCount: 7 }), { from: 'A2', to: 'A3' });
  expect(next.turn).toBe(1); expect(next.moveCount).toBe(8); expect(next.noncombatCount).toBe(8);
  expect(next.events.at(-1)).toEqual({ kind: 'AUTO_PASS', actor: 2 });
});
test('50 ends without an extra PASS', () => {
  const next = applyMove(state([p('a', 'general', 'A2'), ...blockedP2], { moveCount: 49, noncombatCount: 49 }), { from: 'A2', to: 'A3' });
  expect(next.result?.reason).toBe('FIFTY_NONCOMBAT_MOVES'); expect(next.events.some(e => e.kind === 'AUTO_PASS')).toBe(false);
});
test('both no moves takes priority over 50; initial candidate auto pass', () => {
  const bothBlocked = [...blockedP2, p('a', 'general', 'A1'), p('m3', 'mine', 'A2'), p('m4', 'mine', 'B1')];
  expect(settleTurn(state(bothBlocked, { moveCount: 50, noncombatCount: 50 }), 1).result?.reason).toBe('NO_LEGAL_MOVES_BOTH');
  const passed = settleTurn(state([p('a', 'general', 'A2'), ...blockedP2]), 2);
  expect(passed.turn).toBe(1); expect(passed.moveCount).toBe(0); expect(passed.noncombatCount).toBe(0);
});
test('both immobile after a real mutual battle ends before turn transition', () => {
  const next = applyMove(state([...blockedP2, p('a', 'general', 'A1'), p('m3', 'mine', 'A2'), p('m4', 'mine', 'B1'), p('s1', 'spy', 'B4'), p('s2', 'spy', 'B5', 2)]), { from: 'B4', to: 'B5' });
  expect(next.result?.reason).toBe('NO_LEGAL_MOVES_BOTH');
  expect(next.events.map(e => e.kind)).toEqual(['MOVE', 'END']);
  expect(next.noncombatCount).toBe(0);
});
test('P2 placement restrictions are rotated P1 restrictions', () => {
  for (const [a, b] of [['A1', 'B4'], ['A1', 'E4'], ['A2', 'HQ-P1'], ['A2', 'B4']] as [Site, Site][]) {
    const pieces = swap(defaultPlacement(1), a, b).map(p => ({ ...p, owner: 2 as const, position: rotate(p.position!) }));
    expect(() => validatePlacement(pieces, 2)).toThrow();
  }
});
test('battle and occupation results rotate to the other player', () => {
  for (const [from, to, attacker, defender] of [['B4', 'B5', 'general', 'colonel'], ['C7', 'HQ-P2', 'general', 'mine'], ['C7', 'HQ-P2', 'general', 'captain']] as [Site, Site, PieceType, PieceType][]) {
    const pieces = [p('a', attacker, from), p('d', defender, to, 2)];
    const original = applyMove(state(pieces), { from, to });
    const mirrored = applyMove(state(pieces.map(p => ({ ...p, owner: p.owner === 1 ? 2 : 1, position: rotate(p.position!) })), { turn: 2, firstPlayer: 2 }), { from: rotate(from), to: rotate(to) });
    expect(mirrored.pieces.map(p => p.position)).toEqual(original.pieces.map(p => p.position ? rotate(p.position) : null));
    expect(mirrored.result?.reason).toBe(original.result?.reason);
    expect(mirrored.result?.winner).toBe(original.result?.winner ? original.result.winner === 1 ? 2 : 1 : null);
  }
});
test('start preserves the injected first player and zero move count', () => {
  const initial = startGame(defaultPlacement(1), defaultPlacement(2), 2);
  expect(initial.events[0]).toEqual({ kind: 'START', firstPlayer: 2 });
  expect(initial.moveCount).toBe(0);
});
test('invalid state and invalid moves leave input untouched', () => {
  expect(() => validateState(state(reserves, { rulesetVersion: 'unknown' }))).toThrow('UNSUPPORTED_RULESET');
  expect(() => validateState(state(reserves, { noncombatCount: 1 }))).toThrow('INVALID_COUNTER');
  const input = state(reserves); const snapshot = JSON.stringify(input);
  expect(() => applyMove(input, { from: 'F7', to: 'F6' })).toThrow('NOT_OWN_PIECE');
  expect(JSON.stringify(input)).toBe(snapshot);
});
test('seeded generated legal play preserves identity, positions, and monotone removals', () => {
  let seed = 9750;
  for (let run = 0; run < 8; run++) {
    let game = startGame(defaultPlacement(1), defaultPlacement(2), run % 2 ? 1 : 2);
    for (let step = 0; step < 100 && !game.result; step++) {
      const moves = legalMoves(game.pieces, game.turn!);
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const next = applyMove(game, moves[seed % moves.length]);
      expect(next.pieces).toHaveLength(46); validatePieces(next.pieces); validateState(next);
      for (const piece of game.pieces) {
        const after = next.pieces.find(p => p.id === piece.id)!;
        expect([after.type, after.owner]).toEqual([piece.type, piece.owner]);
        if (piece.position === null) expect(after.position).toBeNull();
      }
      game = next;
    }
  }
});
