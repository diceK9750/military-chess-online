import {expect,test} from 'vitest';
import {squadFormation} from './squad';
import {PIECE_TYPES} from '../game/pieces';
test('cosmetic formations differentiate mounted, column and armored squads within bounded budgets',()=>{
 for(const type of PIECE_TYPES)for(const followers of [1,2,3]){const squad=squadFormation(type,followers);expect(squad.length).toBeLessThanOrEqual(followers);expect(squad.every(p=>Math.abs(p.x)<.4&&Math.abs(p.z)<.8&&p.scale<=1)).toBe(true);}
 expect(squadFormation('engineer',3).every(p=>p.x===0&&p.type==='engineer')).toBe(true);
 expect(squadFormation('cavalry',2).map(p=>p.x)).toEqual([.28,-.28]);
 expect(squadFormation('tank',3)).toHaveLength(2);
 for(const type of ['mine','spy','aircraft'] as const)expect(squadFormation(type,3)).toHaveLength(0);
});
