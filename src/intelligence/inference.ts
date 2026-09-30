import { anchors, rear } from '../game/board';
import { combat, COMBAT_TYPES } from '../game/combat';
import { moveError } from '../game/movement';
import { PIECE_TYPES } from '../game/pieces';
import type { EffectiveType, Piece, PieceType, Player, Site } from '../game/types';
import type { TacticalView } from './public';
export interface EnemyHypothesis { readonly position: Site; readonly candidates: readonly PieceType[]; readonly evidence: readonly string[] }
interface Track { candidates: PieceType[]; evidence: string[] }
/** Reconstruct anonymous occupancy from public outcomes. Tracking keys are sites, never internal IDs. */
export function inferEnemies(view: TacticalView): EnemyHypothesis[] {
  const moves = view.history.filter(e => e.kind === 'MOVE');
  const occupancy = new Map<Site,Player>(view.pieces.map(p => [p.position,p.owner]));
  for (const e of [...moves].reverse()) {
    occupancy.delete(e.move.to); occupancy.set(e.move.from,e.actor);
    if (e.battle) occupancy.set(e.move.to,e.actor === 1 ? 2 : 1);
  }
  const tracks = new Map<Site,Track>();
  const self = new Map(view.ownInitial.map(p=>[p.position,p.type]));
  for (const [site,owner] of occupancy) if (owner !== view.side) {
    const row = anchors(site)[0].y, last = owner === 1 ? 1 : 8;
    const entrance = owner === 1 ? ['B4','E4'] : ['B5','E5'];
    tracks.set(site,{candidates:PIECE_TYPES.filter(type => !(entrance.includes(site) && (type==='mine'||type==='flag')) && !(row===last && type==='flag')), evidence:[]});
  }
  function possible(type: PieceType, site: Site, owner: Player): (EffectiveType|null)[] {
    if (type !== 'flag') return [type];
    const back = rear(site,owner);
    if (!back || occupancy.get(back)!==owner) return [null];
    if (owner === view.side) { const known = self.get(back); return known && known!=='flag' ? [known] : [...COMBAT_TYPES]; }
    return tracks.get(back)?.candidates.filter((t):t is EffectiveType=>t!=='flag') ?? [...COMBAT_TYPES];
  }
  for (const e of moves) {
    const enemyActor = e.actor !== view.side;
    const enemySite = enemyActor ? e.move.from : e.move.to;
    const track = tracks.get(enemySite);
    if (track && enemyActor) {
      track.candidates = track.candidates.filter(type => {
        const hypothetical: Piece[] = [...occupancy].map(([position,owner],i)=>({id:`public-${i}`,owner,position,type:position===e.move.from?type:'general'}));
        return moveError(hypothetical,e.actor,e.move) === null;
      });
      track.evidence.push(`${e.moveNumber}手目 ${e.move.from}→${e.move.to}：公開移動能力`);
    }
    if (track && e.battle) {
      const ownSite = enemyActor ? e.move.to : e.move.from;
      const ownType = self.get(ownSite);
      if (ownType) {
        const knownEffective = possible(ownType,ownSite,view.side);
        const enemyOwner: Player = view.side === 1 ? 2 : 1;
        track.candidates = track.candidates.filter(type => possible(type,enemySite,enemyOwner).some(enemy => knownEffective.some(own => {
          const attacker = enemyActor ? enemy : own, defender = enemyActor ? own : enemy;
          return (defender === null ? 'ATTACKER' : attacker === null ? 'DEFENDER' : combat(attacker,defender)) === e.battle;
        })));
        track.evidence.push(`${e.moveNumber}手目 ${e.move.to}：自軍既知駒との公開戦闘結果`);
      }
    }
    const ownMoving = self.get(e.move.from);
    self.delete(e.move.from);
    if (e.battle !== 'DEFENDER' && e.battle !== 'MUTUAL') { occupancy.delete(e.move.from); occupancy.set(e.move.to,e.actor); self.delete(e.move.to); if (ownMoving) self.set(e.move.to,ownMoving); }
    else { occupancy.delete(e.move.from); if (e.battle==='MUTUAL') { occupancy.delete(e.move.to); self.delete(e.move.to); } }
    if (enemyActor) {
      tracks.delete(e.move.from);
      if (track && e.battle !== 'DEFENDER' && e.battle !== 'MUTUAL') tracks.set(e.move.to,track);
    } else if (e.battle && e.battle !== 'DEFENDER') tracks.delete(e.move.to);
  }
  return view.pieces.filter(p=>!p.known).map(p=>({position:p.position,candidates:[...(tracks.get(p.position)?.candidates ?? PIECE_TYPES)],evidence:[...(tracks.get(p.position)?.evidence ?? [])].slice(-2)}));
}
