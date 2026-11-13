// Frozen Step12B evaluator (546dde9) is an independent compatibility oracle.
import { anchors, hq } from '../game/board';
import { PIECES } from '../game/pieces';
import type { Move, Site } from '../game/types';
import type { CpuKnownPiece, CpuObservation } from './observation';
import { seededRandom } from './random';

type Difficulty = 'easy' | 'normal';

/** Heuristic values affect CPU preference only, never game legality or combat. */
const CPU_WEIGHTS = Object.freeze({
  captureHQ: 1000,
  approachEnemyHQ: 3,
  defendOwnHQ: 2,
  visibleCombat: 7,
  capturerCombatRisk: -5,
  aircraftMobility: 1,
  engineerUtility: 0.8,
  spyUtility: 0.4,
  repeatMove: -14,
  avoidFiftyMoveDraw: 28,
});

function distance(a: Site, b: Site): number {
  return Math.min(...anchors(a).flatMap(from => anchors(b).map(to => Math.abs(from.x - to.x) + Math.abs(from.y - to.y))));
}

function scoreMove(view: CpuObservation, move: Move): number {
  const actor = view.pieces.find((piece): piece is CpuKnownPiece => piece.known && piece.position === move.from && piece.owner === view.side);
  if (!actor) return -Infinity;
  const enemyHQ = hq(view.side === 1 ? 2 : 1);
  const ownHQ = hq(view.side);
  const destination = view.pieces.find(piece => piece.position === move.to);
  const enemyThreat = view.pieces.filter(piece => !piece.known && distance(piece.position, ownHQ) <= 3).length;
  let score = (distance(move.from, enemyHQ) - distance(move.to, enemyHQ)) * CPU_WEIGHTS.approachEnemyHQ;
  if (PIECES[actor.type].captures && move.to === enemyHQ) score += CPU_WEIGHTS.captureHQ;
  if (enemyThreat > 0) score += (distance(move.from, ownHQ) - distance(move.to, ownHQ)) * CPU_WEIGHTS.defendOwnHQ * enemyThreat;
  if (destination && !destination.known) {
    score += CPU_WEIGHTS.visibleCombat;
    if (PIECES[actor.type].captures && move.to !== enemyHQ) score += CPU_WEIGHTS.capturerCombatRisk;
    if (view.noncombatCount >= 45) score += CPU_WEIGHTS.avoidFiftyMoveDraw;
  }
  if (actor.type === 'aircraft') score += CPU_WEIGHTS.aircraftMobility;
  if (actor.type === 'engineer') score += CPU_WEIGHTS.engineerUtility;
  if (actor.type === 'spy') score += CPU_WEIGHTS.spyUtility;
  const lastOwnMove = [...view.history].reverse().find(event => event.kind === 'MOVE' && event.actor === view.side);
  if (lastOwnMove?.kind === 'MOVE' && lastOwnMove.move.from === move.to && lastOwnMove.move.to === move.from) score += CPU_WEIGHTS.repeatMove;
  return score;
}

/** Pure decision function. It cannot inspect true opponent piece types. */
function legacyChoose(view: CpuObservation, difficulty: Difficulty, seed: number): Move | null {
  if (view.turn !== view.side || view.legalMoves.length === 0) return null;
  const random = seededRandom(seed);
  if (difficulty === 'easy') return { ...view.legalMoves[Math.floor(random() * view.legalMoves.length)] };
  const scored = view.legalMoves.map(move => ({ move, score: scoreMove(view, move) }));
  const best = Math.max(...scored.map(candidate => candidate.score));
  const tied = scored.filter(candidate => candidate.score === best);
  return { ...tied[Math.floor(random() * tied.length)].move };
}

import { expect, test } from 'vitest';
import { chooseCpuMove, evaluateMove } from './strategy';
import { defaultPlacement } from '../dev/fixtures';
import { startGame, applyMove } from '../game/game';
import { observeForCpu } from './observation';
// Step12B kept CPU_WEIGHTS.captureHQ for any capturer entering the enemy HQ. The current evaluator
// replaces only that HQ judgement (and adds public-loss memory), so these keys are compared separately.
const REPLACED_KEYS = new Set(['captureHQ', 'hqAssault', 'hqRepelled', 'repelledTarget']);
test('frozen Step12B: every shared scoring term still matches exactly; only the HQ/repel judgement differs', () => {
 for(let run=0;run<8;run++) {
  let game=startGame(defaultPlacement(1),defaultPlacement(2),run%2===0?1:2);
  for(let turn=0;turn<80&&!game.result;turn++) {
   const view=observeForCpu(game,game.turn!);
   const enemyHQ=view.side===1?'HQ-P2':'HQ-P1';
   for(const move of view.legalMoves) {
    const evaluation=evaluateMove(view,move);
    expect(evaluation.terms.reduce((s,t)=>s+t.value,0)).toBe(evaluation.total);
    const actor=view.pieces.find(p=>p.known&&p.position===move.from);
    const legacyHQ=actor?.known&&PIECES[actor.type].captures&&move.to===enemyHQ?CPU_WEIGHTS.captureHQ:0;
    const shared=evaluation.terms.filter(t=>!REPLACED_KEYS.has(t.key)).reduce((s,t)=>s+t.value,0);
    expect(shared).toBeCloseTo(scoreMove(view,move)-legacyHQ,9);
    if(!evaluation.terms.some(t=>REPLACED_KEYS.has(t.key))&&legacyHQ===0) expect(evaluation.total).toBe(scoreMove(view,move));
   }
   // Easy is untouched. Normal now varies among near-equal moves, which is covered in strategy.test.ts.
   for(const seed of [0,1,9750,0xffffffff]) expect(chooseCpuMove(view,'easy',seed)).toEqual(legacyChoose(view,'easy',seed));
   game=applyMove(game,legacyChoose(view,'normal',(run*123+turn)>>>0)!);
  }
 }
});
