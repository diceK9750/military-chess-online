import { anchors, hq } from '../game/board';
import type { Site } from '../game/types';
import type { BattlefieldViewState } from './state';

/** Position warning, never a claimed attack range or probability. No enemy type is read. */
export function approachingEnemies(state: BattlefieldViewState): readonly Site[] {
  const home = anchors(hq(state.viewer));
  return state.pieces.filter(p=>p.owner!==state.viewer && anchors(p.position).some(a=>home.some(b=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)<=2))).map(p=>p.position);
}
/** A tiny unambiguous snap only outside the selected cell's footprint; occupied/wrong cells never snap. */
export function snapTarget(point: {x:number;z:number}, candidates: readonly {site:Site;x:number;z:number;halfWidth?:number}[], radius=.08): Site | null {
  const nearby=candidates.filter(p=>Math.hypot(Math.max(0,Math.abs(point.x-p.x)-(p.halfWidth??.48)),Math.max(0,Math.abs(point.z-p.z)-.48))<=radius);
  return nearby.length===1?nearby[0].site:null;
}
