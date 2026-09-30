import { useEffect, useState, type CSSProperties } from 'react';
import {qualityProfile,type Quality} from './settings';
/** Decorative, bounded ceremony. No game objects, hidden information, or input interception. */
export function VictoryCelebration({quality='standard',fresh=false}:{quality?:Quality;fresh?:boolean}) {
 const [active,setActive]=useState(false);
 useEffect(()=>{
  const preference=window.matchMedia?.('(prefers-reduced-motion: reduce)');let expired=false;
  const update=()=>setActive(!expired&&!preference?.matches);update();preference?.addEventListener('change',update);
  const timer=setTimeout(()=>{expired=true;setActive(false);},fresh?5200:1400);
  return()=>{clearTimeout(timer);preference?.removeEventListener('change',update);};
 },[fresh]);
 const count=fresh?qualityProfile(quality).confetti:Math.min(20,qualityProfile(quality).confetti);
 return <div className={'victory-celebration'+(fresh?' full-ceremony':' reprise')} aria-hidden="true" data-active={active} data-fresh={fresh}>
  {active&&<><div className="victory-halo"/><div className="victory-standard">✦ 勝鬨 ✦<small>VICTORY CEREMONY</small></div>{fresh&&<div className="salute-battery">{Array.from({length:quality==='light'?2:4},(_,i)=><span className="salute-cannon" key={i} style={{'--delay':`${1.05+i*.16}s`,'--x':`${i<2?6+i*10:74+(i-2)*10}%`} as CSSProperties}>▰<b/><em/></span>)}</div>}
  {Array.from({length:count},(_,i)=><i className={i%3===0?'petal':'paper'} key={i} style={{'--x':`${i*37%100}%`,'--delay':`${(fresh?1.1:0)+i%12*.06}s`,'--drift':`${(i%7-3)*26}px`,'--turn':`${(i%2?1:-1)*(180+i*21)}deg`,'--paper':['#ffe18a','#fff8df','#cc4441','#efb3bb'][i%4]} as CSSProperties}/>)}</>}
 </div>;
}
