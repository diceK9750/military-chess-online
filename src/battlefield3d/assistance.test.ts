import {test,expect} from 'vitest';
import {autoQuality,qualityProfile} from './settings';
import {snapTarget,approachingEnemies} from './assistance';
import {toBattlefieldView} from './state';
import {scenario} from '../dev/fixtures';
test('quality budgets and environment decisions are bounded',()=>{
 expect(autoQuality({width:390,dpr:3,memory:8})).toBe('light');
 expect(autoQuality({width:1920,dpr:1,memory:8})).toBe('high');
 expect(autoQuality({width:1920,dpr:3})).toBe('standard');
 expect(autoQuality({width:1920,dpr:1,memory:4})).toBe('light');
 for(const quality of ['light','standard','high'] as const){const p=qualityProfile(quality);expect(p.followers).toBeLessThanOrEqual(3);expect(p.pixelRatio).toBeLessThanOrEqual(2);expect(p.confetti).toBeLessThanOrEqual(144);}
});
test('snap accepts only a tiny unambiguous footprint margin',()=>{
 const targets=[{site:'A1' as const,x:0,z:0},{site:'B1' as const,x:1,z:0}];
 expect(snapTarget({x:-.53,z:0},targets)).toBe('A1');
 expect(snapTarget({x:-.6,z:0},targets)).toBeNull();
 expect(snapTarget({x:.5,z:0},targets)).toBeNull();
 expect(snapTarget({x:.53,z:.53},[targets[0]])).toBe('A1');
});
test('position warning never needs enemy types or mutates the public view',()=>{
 const state=toBattlefieldView(scenario('highFlight'),1),before=JSON.stringify(state);
 const without= {...state,pieces:state.pieces.map(p=>p.owner!==1?{owner:p.owner,position:p.position,unknown:true as const}:p)};
 expect(approachingEnemies(state)).toEqual(approachingEnemies(without));
 expect(JSON.stringify(state)).toBe(before);
 expect(without.pieces.every(p=>!('id' in p))).toBe(true);
});
