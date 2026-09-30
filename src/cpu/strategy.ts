import { anchors, hq } from '../game/board';
import { PIECES } from '../game/pieces';
import type { Move, Site } from '../game/types';
import type { CpuKnownPiece, CpuUnknownPiece, CpuObservation } from './observation';
import { seededRandom } from './random';

export type Difficulty = 'easy' | 'normal';

/** Heuristic values affect CPU preference only, never game legality or combat. */
export const CPU_WEIGHTS = Object.freeze({
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

export type EvaluationView = Omit<CpuObservation, 'pieces'> & { readonly pieces: readonly (Omit<CpuKnownPiece, 'id'> | CpuUnknownPiece)[] };
export interface ScoreTerm { readonly key: keyof typeof CPU_WEIGHTS; readonly value: number }
export interface MoveEvaluation { readonly move: Move; readonly terms: readonly ScoreTerm[]; readonly total: number }
export function evaluateMove(view: EvaluationView, move: Move): MoveEvaluation {
  const actor = view.pieces.find((piece): piece is Omit<CpuKnownPiece, 'id'> => piece.known && piece.position === move.from && piece.owner === view.side);
  if (!actor) return { move: { ...move }, terms: [], total: -Infinity };
  const enemyHQ = hq(view.side === 1 ? 2 : 1);
  const ownHQ = hq(view.side);
  const destination = view.pieces.find(piece => piece.position === move.to);
  const enemyThreat = view.pieces.filter(piece => !piece.known && distance(piece.position, ownHQ) <= 3).length;
  const terms: ScoreTerm[] = [];
  const add = (key: ScoreTerm['key'], value: number = CPU_WEIGHTS[key]) => terms.push({ key, value });
  add('approachEnemyHQ', (distance(move.from, enemyHQ) - distance(move.to, enemyHQ)) * CPU_WEIGHTS.approachEnemyHQ);
  if (PIECES[actor.type].captures && move.to === enemyHQ) add('captureHQ');
  if (enemyThreat > 0) add('defendOwnHQ', (distance(move.from, ownHQ) - distance(move.to, ownHQ)) * CPU_WEIGHTS.defendOwnHQ * enemyThreat);
  if (destination && !destination.known) {
    add('visibleCombat');
    if (PIECES[actor.type].captures && move.to !== enemyHQ) add('capturerCombatRisk');
    if (view.noncombatCount >= 45) add('avoidFiftyMoveDraw');
  }
  if (actor.type === 'aircraft') add('aircraftMobility');
  if (actor.type === 'engineer') add('engineerUtility');
  if (actor.type === 'spy') add('spyUtility');
  const lastOwnMove = [...view.history].reverse().find(event => event.kind === 'MOVE' && event.actor === view.side);
  if (lastOwnMove?.kind === 'MOVE' && lastOwnMove.move.from === move.to && lastOwnMove.move.to === move.from) add('repeatMove');
  return { move: { ...move }, terms, total: terms.reduce((sum, term) => sum + term.value, 0) };
}

/** Pure decision function. It cannot inspect true opponent piece types. */
export function chooseCpuMove(view: CpuObservation, difficulty: Difficulty, seed: number): Move | null {
  if (view.turn !== view.side || view.legalMoves.length === 0) return null;
  const random = seededRandom(seed);
  if (difficulty === 'easy') return { ...view.legalMoves[Math.floor(random() * view.legalMoves.length)] };
  const scored = view.legalMoves.map(move => ({ move, score: evaluateMove(view, move).total }));
  const best = Math.max(...scored.map(candidate => candidate.score));
  const tied = scored.filter(candidate => candidate.score === best);
  return { ...tied[Math.floor(random() * tied.length)].move };
}
