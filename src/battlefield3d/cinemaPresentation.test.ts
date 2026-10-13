import {expect,test} from 'vitest';
import {cinemaTiming,cinemaDelay,cinemaPlaybackRetime,cinemaPlaybackSchedule,cinemaShot} from './cinemaPresentation';
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
test('every formal battle receives an action shot even after the first-contact chapter',()=>{
 expect(cinemaShot(ordinary,28,true)).toBe('battle');
 expect(cinemaShot({...ordinary,kinds:['decisive']},28,true)).toBe('decisive');
 expect(cinemaShot({...ordinary,kinds:['summary']},28,false)).toBe('summary');
});
test('invalid speeds cannot cause infinite or negative film timers',()=>{
 for(const speed of [0,-1,NaN,Infinity]){
  expect(cinemaTiming(speed,true)).toEqual(cinemaTiming(1,true));
  expect(cinemaDelay(ordinary,speed,true,true)).toBe(cinemaDelay(ordinary,1,true,true));
 }
});
test('playback retiming preserves progress through the contact phases and narration tail',()=>{
 const scene={...ordinary,kinds:['contact' as const]},slow=cinemaPlaybackSchedule(scene,.5,true,true),fast=cinemaPlaybackSchedule(scene,2,true,true);
 expect(cinemaPlaybackRetime(300,slow,fast)).toBe(75);
 expect(cinemaPlaybackRetime(slow.march+slow.clash/2,slow,fast)).toBe(fast.march+fast.clash/2);
 const slowEnd=slow.march+slow.clash+slow.exit,fastEnd=fast.march+fast.clash+fast.exit;
 expect(cinemaPlaybackRetime(slowEnd+slow.tail/2,slow,fast)).toBeCloseTo(fastEnd+fast.tail/2);
 expect(cinemaPlaybackRetime(slow.duration+1000,slow,fast)).toBe(fast.duration);
});
