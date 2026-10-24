import {test,expect} from 'vitest';
import {PerspectiveCamera,Vector3} from 'three';
import {selectionFit,closestTouchTarget} from './camera';
import {SITES} from '../game/board';
import {sitePoint} from './state';
import type {Site} from '../game/types';

for(const [width,height] of [[390,644],[430,732]])for(const viewer of [1,2] as const)test(`selection fit includes every footprint and HQ half ${width} P${viewer}`,()=>{
 for(const sites of [['B2','B3','A2','C2'] as Site[],['HQ-P1','HQ-P2','C2','D7'] as Site[],[...SITES]]){
  const fit=selectionFit(sites,width,height,viewer),camera=new PerspectiveCamera(42,width/height,.1,100);camera.position.copy(fit.position);camera.lookAt(fit.target);camera.updateMatrixWorld();
  expect(fit.distance).toBeGreaterThanOrEqual(6);expect(fit.distance).toBeLessThanOrEqual(34);
  for(const site of sites){const p=sitePoint(site),half=site.startsWith('HQ')?1:.52;for(const dx of [-half,half])for(const dz of [-.52,.52])for(const y of [0,1.6]){const v=new Vector3(p.x+dx,y,p.z+dz).project(camera);expect(Math.abs(v.x)).toBeLessThanOrEqual(.901);expect(v.y).toBeLessThanOrEqual(1-144/height+.001);expect(v.y).toBeGreaterThanOrEqual(-1+32/height-.001);}}
 }
});
test('touch expansion is 44 CSS px and rejects close ties and non-candidates',()=>{
 const targets=[{x:100,y:100,value:'A1'},{x:140,y:100,value:'B1'}];
 expect(closestTouchTarget(100,122,targets)).toBe('A1');expect(closestTouchTarget(100,123,targets)).toBeUndefined();expect(closestTouchTarget(120,100,targets)).toBeUndefined();expect(closestTouchTarget(122,100,targets)).toBe('B1');expect(closestTouchTarget(100,100,[])).toBeUndefined();
});
