import {expect,test} from 'vitest';
import {cinemaTiming,cinemaDelay,cinemaShot} from './cinemaPresentation';
const ordinary={title:'行軍',text:'移動',move:'B2 → B3',kinds:[]};
test('film speed never skips a contact or decisive move and delay covers all phases',()=>{
 for(const speed of [.5,1,2])for(const battle of [false,true])for(const decisive of [false,true]){
  const scene={...ordinary,kinds:decisive?['decisive' as const]:[]},t=cinemaTiming(speed,battle,decisive);
  if(battle){expect(t.clash).toBeGreaterThanOrEqual(750);expect(t.clash).toBeLessThanOrEqual(1500);}
  if(decisive)expect(t.march).toBeGreaterThanOrEqual(1200);
  expect(cinemaDelay(scene,speed,true,battle)).toBeGreaterThan(t.march+t.clash+t.exit);
 }
});
test('director shots are determined by actual scene facts only',()=>{
 expect(cinemaShot(ordinary,0)).toBe('opening');expect(cinemaShot(ordinary,4)).toBe('march');
 for(const [kind,shot] of [['contact','battle'],['breakthrough','breach'],['pressure','pressure'],['loss','battle'],['decisive','decisive'],['summary','summary']] as const)expect(cinemaShot({...ordinary,kinds:[kind]},20)).toBe(shot);
});
