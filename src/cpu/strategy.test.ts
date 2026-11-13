import { expect, test } from 'vitest';
import { FORMATION_TEMPLATES, materializeFormation } from '../formation/templates';
import { applyMove, startGame } from '../game/game';
import { legalMoves } from '../game/movement';
import { RULESET_VERSION } from '../game/pieces';
import type { GameState, Move, Piece, PieceType, Player, Site } from '../game/types';
import { observeForCpu } from './observation';
import { generateCpuPlacement } from './placement';
import { seededRandom } from './random';
import { chooseCpuMove, CPU_WEIGHTS, enemyRecords, evaluateMove, hqAssaultOdds } from './strategy';
import { playCpuTurn } from './turn';

const p = (id: string, type: PieceType, position: Site, owner: Player): Piece => ({ id, type, position, owner });
const state = (pieces: readonly Piece[], turn: Player): GameState => ({ rulesetVersion: RULESET_VERSION, pieces, firstPlayer: turn, turn, moveCount: 0, noncombatCount: 0, result: null, events: [] });
const keys = (view: ReturnType<typeof observeForCpu>, move: Move) => evaluateMove(view, move).terms.map(t => t.key);

test('an occupied unknown enemy HQ is priced as a gamble, an empty one as a win', () => {
  const pieces = [p('cpu', 'colonel', 'C2', 2), p('cpu2', 'general', 'F7', 2), p('guard', 'general', 'HQ-P1', 1), p('other', 'colonel', 'A3', 1)];
  const occupied = observeForCpu(state(pieces, 2), 2);
  const attack = evaluateMove(occupied, { from: 'C2', to: 'HQ-P1' });
  expect(attack.terms.map(t => t.key)).not.toContain('captureHQ');
  expect(attack.terms.map(t => t.key)).toContain('hqAssault');
  expect(attack.total).toBeLessThan(CPU_WEIGHTS.captureHQ);
  const empty = observeForCpu(state(pieces.filter(x => x.id !== 'guard'), 2), 2);
  expect(keys(empty, { from: 'C2', to: 'HQ-P1' })).toContain('captureHQ');
  expect(chooseCpuMove(empty, 'normal', 1)).toEqual({ from: 'C2', to: 'HQ-P1' });
});

test('HQ odds use only public facts: hidden occupant type never changes evaluation or choice', () => {
  for (const hidden of ['general', 'mine', 'spy', 'secondLieutenant'] as const) {
    const pieces = [p('cpu', 'colonel', 'C2', 2), p('cpu2', 'general', 'F7', 2), p('guard', hidden, 'HQ-P1', 1), p('other', 'colonel', 'A3', 1)];
    const view = observeForCpu(state(pieces, 2), 2);
    const reference = observeForCpu(state([...pieces.slice(0, 2), p('guard', 'major', 'HQ-P1', 1), pieces[3]], 2), 2);
    expect(view).toEqual(reference);
    expect(evaluateMove(view, { from: 'C2', to: 'HQ-P1' })).toEqual(evaluateMove(reference, { from: 'C2', to: 'HQ-P1' }));
    for (const seed of [0, 1, 9750]) expect(chooseCpuMove(view, 'normal', seed)).toEqual(chooseCpuMove(reference, 'normal', seed));
  }
});

test('public records follow a moving enemy piece and remember who beat our attackers', () => {
  // P2 lieutenant colonel attacks the HQ general and loses; the record is kept on HQ-P1.
  let game = state([p('a', 'lieutenantColonel', 'C2', 2), p('b', 'colonel', 'D2', 2), p('c', 'general', 'F7', 2), p('g', 'general', 'HQ-P1', 1), p('m', 'major', 'A3', 1)], 2);
  game = applyMove(game, { from: 'C2', to: 'HQ-P1' });
  expect(game.events.at(-1)).toMatchObject({ kind: 'MOVE', battle: 'DEFENDER' });
  expect(enemyRecords(observeForCpu(game, 2).history, 2).get('HQ-P1')).toEqual({ moved: false, repelled: 1 });
  game = applyMove(game, { from: 'A3', to: 'A4' });
  const view = observeForCpu(game, 2);
  const fresh = observeForCpu(state(game.pieces, 2), 2);
  const again = evaluateMove(view, { from: 'D2', to: 'HQ-P1' });
  expect(again.terms.map(t => t.key)).toContain('hqRepelled');
  expect(again.total).toBeLessThan(evaluateMove(fresh, { from: 'D2', to: 'HQ-P1' }).total);
  expect(chooseCpuMove(view, 'normal', 1)).not.toEqual({ from: 'D2', to: 'HQ-P1' });
  // Once the occupant publicly leaves, its record moves with it and the HQ is no longer remembered.
  game = applyMove(game, { from: 'D2', to: 'D3' });
  game = applyMove(game, { from: 'HQ-P1', to: 'C2' });
  const records = enemyRecords(observeForCpu(game, 2).history, 2);
  expect(records.get('C2')).toEqual({ moved: true, repelled: 1 });
  expect(records.has('HQ-P1')).toBe(false);
});

test('a repel shifts the odds toward strong defenders and never toward mines', () => {
  const view = observeForCpu(state([p('a', 'colonel', 'C2', 2), p('c', 'general', 'F7', 2), p('g', 'general', 'HQ-P1', 1)], 2), 2);
  const before = hqAssaultOdds(view, 'colonel', { moved: false, repelled: 0 });
  const after = hqAssaultOdds(view, 'colonel', { moved: false, repelled: 1 });
  expect(after.ATTACKER).toBeLessThan(before.ATTACKER);
  for (const odds of [before, after]) expect(odds.ATTACKER + odds.DEFENDER + odds.MUTUAL).toBeCloseTo(1, 12);
});

test('normal moving first no longer opens with the same aircraft-to-HQ flight', () => {
  let aircraftToHQ = 0;
  const moves = new Set<string>();
  for (const a of FORMATION_TEMPLATES) for (const b of FORMATION_TEMPLATES) for (const seed of [1, 2, 3, 4]) {
    const game = startGame(materializeFormation(a, 1, 'h'), materializeFormation(b, 2, 'c'), 2);
    const move = chooseCpuMove(observeForCpu(game, 2), 'normal', seed)!;
    if (move.to === 'HQ-P1' && game.pieces.find(x => x.position === move.from)!.type === 'aircraft') aircraftToHQ++;
    moves.add(`${move.from}-${move.to}`);
  }
  expect(aircraftToHQ).toBeLessThan(256);
  expect(aircraftToHQ).toBe(0);
  expect(moves.size).toBeGreaterThan(4);
});

function playGame(seed: number, p1: (g: GameState, rnd: () => number) => Move, p2Difficulty: 'easy' | 'normal', p1Formation?: Piece[]): GameState {
  const rnd = seededRandom(seed * 31);
  let game = startGame(p1Formation ?? generateCpuPlacement(1, seed * 7 + 3), generateCpuPlacement(2, (seed * 2654435761) >>> 0), (seed % 2 + 1) as Player);
  for (let ply = 0; !game.result && ply < 600; ply++) {
    if (game.turn === 1) {
      const move = p1(game, rnd);
      expect(legalMoves(game.pieces, 1)).toContainEqual(move);
      game = applyMove(game, move);
    } else {
      const view = observeForCpu(game, 2);
      const chosen = chooseCpuMove(view, p2Difficulty, (seed * 1000003 + ply) >>> 0);
      if (chosen) expect(view.legalMoves).toContainEqual(chosen);
      game = playCpuTurn(game, 2, p2Difficulty, (seed * 1000003 + ply) >>> 0);
    }
  }
  return game;
}

test('a passive general parked in the HQ no longer beats normal most of the time', () => {
  const guard = FORMATION_TEMPLATES.find(t => t.id === 'flag-guard-left')!;
  expect(guard.placements.find(x => x.site === 'HQ-P1')?.type).toBe('general');
  let playerWins = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const game = playGame(seed, (g, rnd) => {
      const all = legalMoves(g.pieces, 1), rest = all.filter(m => m.from !== 'HQ-P1');
      const pool = rest.length ? rest : all;
      return pool[Math.floor(rnd() * pool.length)];
    }, 'normal', materializeFormation(guard, 1, 'h'));
    if (game.result?.winner === 1) playerWins++;
  }
  expect(playerWins).toBeLessThanOrEqual(16);
}, 60000);

test('normal still clearly beats a random opponent and every game ends legally', () => {
  let normalWins = 0, randomWins = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const game = playGame(seed, (g, rnd) => { const all = legalMoves(g.pieces, 1); return all[Math.floor(rnd() * all.length)]; }, 'normal');
    if (game.result?.winner === 2) normalWins++;
    if (game.result?.winner === 1) randomWins++;
  }
  expect(normalWins).toBeGreaterThanOrEqual(14);
  expect(randomWins).toBeLessThanOrEqual(3);
}, 60000);
