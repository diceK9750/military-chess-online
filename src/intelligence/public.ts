import { observeForCpu } from '../cpu/observation';
import type { PublicEvent } from '../cpu/observation';
import { evaluateMove, CPU_WEIGHTS, type EvaluationView, type MoveEvaluation, type ScoreTerm } from '../cpu/strategy';
import { anchors, hq, SITES } from '../game/board';
import type { GameState, Piece, PieceType, Player, Site } from '../game/types';
export interface TacticalView extends EvaluationView { readonly ownInitial: readonly { type: PieceType; position: Site }[] }
/** Sole full-state adapter. Own initial types belong to the player's knowledge. */
export function tacticalView(state: GameState, side: Player, ownInitial: readonly Piece[] = []): TacticalView {
  const view = observeForCpu(state, side);
  return { side, turn: view.turn, noncombatCount: view.noncombatCount, moveCount: view.moveCount,
    history: view.history, legalMoves: view.legalMoves,
    pieces: SITES.flatMap<EvaluationView['pieces'][number]>(position => {
      const p = view.pieces.find(piece => piece.position === position);
      return !p ? [] : p.known ? [{ owner: p.owner, position, known: true as const, type: p.type }] : [{ owner: p.owner, position, known: false as const }];
    }), ownInitial: ownInitial.filter(p => p.owner === side && p.position).map(p => ({ type: p.type, position: p.position! })) };
}
export function recommendations(view: TacticalView): MoveEvaluation[] {
  if (view.turn !== view.side) return [];
  return view.legalMoves.map(move => evaluateMove(view, move)).sort((a,b) => b.total - a.total).slice(0,3);
}
export const scoreLabels: Record<ScoreTerm['key'], string> = {
  captureHQ: '本陣占領', approachEnemyHQ: '敵本陣へ接近', defendOwnHQ: '自軍本陣を防御', visibleCombat: '戦闘機会',
  capturerCombatRisk: '占領戦力のリスク', aircraftMobility: '飛行機機動性', engineerUtility: '工兵有用性', spyUtility: 'スパイ有用性', repeatMove: '往復手を抑制', avoidFiftyMoveDraw: '50手引き分け回避',
};
const distance = (a: Site, b: Site) => Math.min(...anchors(a).flatMap(x => anchors(b).map(y => Math.abs(x.x-y.x)+Math.abs(x.y-y.y))));
/** Private equipment/capture bonuses and the CPU's private total never cross this public boundary. */
export function publicCpuExplanation(view: TacticalView, event: Extract<PublicEvent, { kind: 'MOVE' }>): MoveEvaluation {
  const side = event.actor, enemy = hq(side === 1 ? 2 : 1), own = hq(side);
  const before = new Map(view.pieces.map(p => [p.position, p.owner]));
  const relevant = view.history.filter(e => e.kind === 'MOVE');
  const index = relevant.findIndex(e => e.moveNumber === event.moveNumber);
  for (const e of relevant.slice(index).reverse()) {
    before.delete(e.move.to); before.set(e.move.from, e.actor);
    if (e.battle) before.set(e.move.to, e.actor === 1 ? 2 : 1);
  }
  const terms: ScoreTerm[] = [{ key: 'approachEnemyHQ', value: (distance(event.move.from, enemy)-distance(event.move.to, enemy))*CPU_WEIGHTS.approachEnemyHQ }];
  const threat = [...before].filter(([site,owner]) => owner !== side && distance(site,own)<=3).length;
  if (threat) terms.push({key:'defendOwnHQ',value:(distance(event.move.from,own)-distance(event.move.to,own))*CPU_WEIGHTS.defendOwnHQ*threat});
  if (event.battle) terms.push({key:'visibleCombat',value:CPU_WEIGHTS.visibleCombat});
  const previous = relevant.slice(0,index).reverse().find(e => e.actor === side);
  if (previous && previous.move.from === event.move.to && previous.move.to === event.move.from) terms.push({key:'repeatMove',value:CPU_WEIGHTS.repeatMove});
  let noncombat = 0;
  for (const e of relevant.slice(0,index)) noncombat = e.battle ? 0 : noncombat + 1;
  if (event.battle && noncombat>=45) terms.push({key:'avoidFiftyMoveDraw',value:CPU_WEIGHTS.avoidFiftyMoveDraw});
  return { move: {...event.move}, terms, total: terms.reduce((sum,t)=>sum+t.value,0) };
}
