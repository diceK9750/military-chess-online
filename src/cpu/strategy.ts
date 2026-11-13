import { anchors, hq } from '../game/board';
import { combat, COMBAT_TYPES } from '../game/combat';
import { PIECES } from '../game/pieces';
import type { EffectiveType, Move, Outcome, PieceType, Player, Site } from '../game/types';
import type { CpuKnownPiece, CpuUnknownPiece, CpuObservation, PublicEvent } from './observation';
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
  /** Scale of the expected-value term for attacking an occupied, unknown enemy HQ. */
  hqAssault: 1,
  /** Extra penalty per public loss already suffered against the same HQ occupant. */
  hqRepelled: -150,
  /** Penalty per public loss already suffered against the same unknown piece outside the HQ. */
  repelledTarget: -25,
});

function distance(a: Site, b: Site): number {
  return Math.min(...anchors(a).flatMap(from => anchors(b).map(to => Math.abs(from.x - to.x) + Math.abs(from.y - to.y))));
}

export type EvaluationView = Omit<CpuObservation, 'pieces'> & { readonly pieces: readonly (Omit<CpuKnownPiece, 'id'> | CpuUnknownPiece)[] };
export interface ScoreTerm { readonly key: keyof typeof CPU_WEIGHTS; readonly value: number }
export interface MoveEvaluation { readonly move: Move; readonly terms: readonly ScoreTerm[]; readonly total: number }

/** What the public record says about one unknown enemy piece, tracked by site only (never by ID). */
export interface EnemyRecord {
  /** True when the piece has publicly moved, so it cannot be an immobile mine (or flag). */
  readonly moved: boolean;
  /** Our public attacks this piece survived (DEFENDER outcomes). */
  readonly repelled: number;
}
const FRESH: EnemyRecord = Object.freeze({ moved: false, repelled: 0 });

/**
 * Replays only public MOVE events. A record follows an enemy piece when it publicly moves and is
 * dropped when the piece is removed, so no hidden identity or type is ever read.
 */
export function enemyRecords(history: readonly PublicEvent[], side: Player): ReadonlyMap<Site, EnemyRecord> {
  const records = new Map<Site, EnemyRecord>();
  for (const event of history) {
    if (event.kind !== 'MOVE') continue;
    const { actor, move, battle } = event;
    if (actor !== side) {
      const record = records.get(move.from) ?? FRESH;
      records.delete(move.from);
      if (battle !== 'DEFENDER' && battle !== 'MUTUAL') records.set(move.to, { moved: true, repelled: record.repelled });
    } else if (battle === 'DEFENDER') {
      const record = records.get(move.to) ?? FRESH;
      records.set(move.to, { moved: record.moved, repelled: record.repelled + 1 });
    } else if (battle) records.delete(move.to);
  }
  return records;
}
export const enemyRecordAt = (history: readonly PublicEvent[], side: Player, site: Site): EnemyRecord => enemyRecords(history, side).get(site) ?? FRESH;

// Rough material scale used only to price the loss of a non-capturing piece.
const MATERIAL: Record<PieceType, number> = {
  general: 10, lieutenantGeneral: 9, majorGeneral: 8, colonel: 7, lieutenantColonel: 6, major: 5,
  captain: 4, lieutenant: 3, secondLieutenant: 2, aircraft: 8, tank: 6, engineer: 4, cavalry: 2, spy: 5, mine: 3, flag: 0,
};
const NON_CAPTURER_LOSS_SCALE = 3;
// Players tend to garrison the HQ with mines or senior officers; this only reshapes the public prior.
const HQ_PRIOR_BIAS: Partial<Record<EffectiveType, number>> = { mine: 4, general: 2, lieutenantGeneral: 2, majorGeneral: 2 };

function compositionOf(types: readonly PieceType[]): Map<EffectiveType, number> {
  const counts = new Map<EffectiveType, number>();
  for (const type of types) if (type !== 'flag') counts.set(type, (counts.get(type) ?? 0) + 1);
  return counts;
}
const FULL_ARMY: readonly PieceType[] = (Object.keys(PIECES) as PieceType[]).flatMap(type => Array.from({ length: PIECES[type].count }, () => type));

/**
 * Outcome probabilities of attacking the unknown HQ occupant with `attacker`. The prior is the public
 * army composition (flags can never stand in an HQ, mines only if the occupant never moved). Each
 * public repel reweights candidates by how often they beat one of our own pieces that has since died.
 */
export function hqAssaultOdds(view: EvaluationView, attacker: EffectiveType, intel: EnemyRecord): Record<Outcome, number> {
  const weights = new Map<EffectiveType, number>();
  for (const [type, count] of compositionOf(FULL_ARMY)) {
    if (type === 'mine' && intel.moved) continue;
    weights.set(type, count * (intel.moved ? 1 : HQ_PRIOR_BIAS[type] ?? 1));
  }
  if (intel.repelled > 0) {
    const alive = compositionOf(view.pieces.filter((p): p is Omit<CpuKnownPiece, 'id'> => p.known && p.owner === view.side).map(p => p.type));
    const lost = [...compositionOf(FULL_ARMY)].flatMap(([type, count]) => Array.from({ length: Math.max(0, count - (alive.get(type) ?? 0)) }, () => type))
      .filter(type => type !== 'mine');
    const attackers = lost.length > 0 ? lost : COMBAT_TYPES.filter(type => type !== 'mine');
    for (const [type, weight] of weights) {
      const likelihood = attackers.filter(own => combat(own, type) === 'DEFENDER').length / attackers.length;
      weights.set(type, weight * likelihood ** intel.repelled);
    }
  }
  const total = [...weights.values()].reduce((sum, w) => sum + w, 0);
  const odds: Record<Outcome, number> = { ATTACKER: 0, DEFENDER: 0, MUTUAL: 0 };
  if (total === 0) return { ATTACKER: 0, DEFENDER: 1, MUTUAL: 0 };
  for (const [type, weight] of weights) odds[combat(attacker, type)] += weight / total;
  return odds;
}

export function evaluateMove(view: EvaluationView, move: Move): MoveEvaluation {
  const actor = view.pieces.find((piece): piece is Omit<CpuKnownPiece, 'id'> => piece.known && piece.position === move.from && piece.owner === view.side);
  if (!actor) return { move: { ...move }, terms: [], total: -Infinity };
  const enemyHQ = hq(view.side === 1 ? 2 : 1);
  const ownHQ = hq(view.side);
  const destination = view.pieces.find(piece => piece.position === move.to);
  const enemyThreat = view.pieces.filter(piece => !piece.known && distance(piece.position, ownHQ) <= 3).length;
  const terms: ScoreTerm[] = [];
  const add = (key: ScoreTerm['key'], value: number = CPU_WEIGHTS[key]) => terms.push({ key, value });
  const captures = PIECES[actor.type].captures;
  add('approachEnemyHQ', (distance(move.from, enemyHQ) - distance(move.to, enemyHQ)) * CPU_WEIGHTS.approachEnemyHQ);
  // Entering the enemy HQ wins only when it is publicly empty; an occupied HQ is priced as a gamble.
  if (captures && move.to === enemyHQ && !destination) add('captureHQ');
  if (move.to === enemyHQ && destination && !destination.known && actor.type !== 'flag') {
    const intel = enemyRecordAt(view.history, view.side, move.to);
    const odds = hqAssaultOdds(view, actor.type, intel);
    const capturersLeft = view.pieces.filter(p => p.known && p.owner === view.side && PIECES[p.type].captures).length;
    const lossCost = captures ? CPU_WEIGHTS.captureHQ / Math.max(1, capturersLeft) : MATERIAL[actor.type] * NON_CAPTURER_LOSS_SCALE;
    const gain = captures ? odds.ATTACKER * CPU_WEIGHTS.captureHQ : 0;
    add('hqAssault', (gain - (odds.DEFENDER + odds.MUTUAL) * lossCost) * CPU_WEIGHTS.hqAssault);
    if (intel.repelled > 0) add('hqRepelled', intel.repelled * CPU_WEIGHTS.hqRepelled);
  }
  if (enemyThreat > 0) add('defendOwnHQ', (distance(move.from, ownHQ) - distance(move.to, ownHQ)) * CPU_WEIGHTS.defendOwnHQ * enemyThreat);
  if (destination && !destination.known) {
    add('visibleCombat');
    if (captures && move.to !== enemyHQ) add('capturerCombatRisk');
    if (view.noncombatCount >= 45) add('avoidFiftyMoveDraw');
    if (move.to !== enemyHQ) {
      const record = enemyRecordAt(view.history, view.side, move.to);
      if (record.repelled > 0) add('repelledTarget', record.repelled * CPU_WEIGHTS.repelledTarget);
    }
  }
  if (actor.type === 'aircraft') add('aircraftMobility');
  if (actor.type === 'engineer') add('engineerUtility');
  if (actor.type === 'spy') add('spyUtility');
  const lastOwnMove = [...view.history].reverse().find(event => event.kind === 'MOVE' && event.actor === view.side);
  if (lastOwnMove?.kind === 'MOVE' && lastOwnMove.move.from === move.to && lastOwnMove.move.to === move.from) add('repeatMove');
  return { move: { ...move }, terms, total: terms.reduce((sum, term) => sum + term.value, 0) };
}

/** Score margin (points) inside which normal treats candidate moves as equally good. */
export const NORMAL_VARIETY_WINDOW = 3;

/** Pure decision function. It cannot inspect true opponent piece types. */
export function chooseCpuMove(view: CpuObservation, difficulty: Difficulty, seed: number): Move | null {
  if (view.turn !== view.side || view.legalMoves.length === 0) return null;
  const random = seededRandom(seed);
  if (difficulty === 'easy') return { ...view.legalMoves[Math.floor(random() * view.legalMoves.length)] };
  const scored = view.legalMoves.map(move => ({ move, score: evaluateMove(view, move).total }));
  const best = Math.max(...scored.map(candidate => candidate.score));
  // Near-equal heuristic scores are not meaningfully different, so vary among them by seed to avoid a
  // fixed, exploitable opening. A sure win (empty enemy HQ) is never traded for variety.
  const window = best >= CPU_WEIGHTS.captureHQ ? 0 : NORMAL_VARIETY_WINDOW;
  const near = scored.filter(candidate => candidate.score >= best - window);
  return { ...near[Math.floor(random() * near.length)].move };
}
