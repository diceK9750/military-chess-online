import {expect,test} from 'vitest';
import {addOfficerRegalia,officerLook} from './regalia';
import {identity} from './identity';
import {PIECE_TYPES} from '../game/pieces';
test('nine officer ranks have distinct bounded silhouettes shared by both renderers',()=>{
 const silhouettes=[];
 for(let rank=1;rank<=9;rank++){
  const parts:unknown[][]=[];addOfficerRegalia(rank,(...part)=>parts.push(part));
  expect(parts.length).toBeLessThanOrEqual(18);expect(parts.length).toBeGreaterThan(0);
  expect(parts.flat().filter(v=>typeof v==='number').every(Number.isFinite)).toBe(true);
  silhouettes.push(JSON.stringify({look:officerLook(rank),parts}));
 }
 expect(new Set(silhouettes).size).toBe(9);expect(officerLook(9).height).toBeGreaterThan(officerLook(8).height);expect(officerLook(8).height).toBeGreaterThan(officerLook(7).height);
});
test('hidden enemy type never changes visible officer equipment',()=>{
 for(const type of PIECE_TYPES){const altered={owner:2 as const,position:'B5' as const,unknown:true as const,type};const style=identity(altered);const part=()=>{throw Error('Hidden insignia');};expect(style.rank).toBe(0);addOfficerRegalia(style.rank,part);}
});
