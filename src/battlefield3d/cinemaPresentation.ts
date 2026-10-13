import type {ChronicleScene} from '../intelligence/chronicleStory';
const playbackSpeed=(speed:number)=>Number.isFinite(speed)&&speed>0?Math.min(2,Math.max(.5,speed)):1;
/** All recorded actions remain visible, with a quiet return to the overall situation. */
export const cinemaTiming=(speed:number,battle:boolean,decisive=false)=>{const rate=playbackSpeed(speed);return {march:Math.max(decisive?1200:600,1200/rate),clash:battle?Math.max(750,Math.min(1500,1000/rate)):0,exit:battle?450:decisive?500:250};};
export function cinemaShot(scene:ChronicleScene,index:number,battle=false){return index===0?'opening' as const:scene.kinds.includes('decisive')?'decisive' as const:scene.kinds.includes('summary')?'summary' as const:scene.kinds.includes('pressure')?'pressure' as const:scene.kinds.includes('breakthrough')?'breach' as const:battle||scene.kinds.includes('contact')||scene.kinds.includes('loss')?'battle' as const:'march' as const;}
export function cinemaDelay(scene:ChronicleScene,speed:number,hasMove:boolean,battle:boolean){const rate=playbackSpeed(speed),t=cinemaTiming(rate,battle,scene.kinds.includes('decisive'));return Math.max(hasMove?t.march+t.clash+t.exit+100:1000/rate,scene.kinds.some(k=>k!=='opening')?2500/rate:0);}
export interface CinemaPlaybackSchedule { readonly march:number; readonly clash:number; readonly exit:number; readonly duration:number; readonly tail:number }
export function cinemaPlaybackSchedule(scene:ChronicleScene,speed:number,hasMove:boolean,battle:boolean):CinemaPlaybackSchedule{
 const phases=cinemaTiming(speed,battle,scene.kinds.includes('decisive')),duration=cinemaDelay(scene,speed,hasMove,battle),tail=Math.max(0,duration-phases.march-phases.clash-phases.exit);
 return {...phases,duration,tail};
}
/** Retiming preserves progress inside each animated phase, then inside its narration dwell. */
export function cinemaPlaybackRetime(elapsed:number,before:CinemaPlaybackSchedule,after:CinemaPlaybackSchedule):number{
 let remaining=Math.max(0,elapsed),next=0;
 for(const phase of ['march','clash','exit'] as const){
  if(before[phase]>0&&remaining<before[phase])return next+remaining/before[phase]*after[phase];
  remaining-=before[phase];next+=after[phase];
 }
 const tailProgress=before.tail>0?Math.max(0,Math.min(1,remaining/before.tail)):1;
 return next+tailProgress*after.tail;
}
