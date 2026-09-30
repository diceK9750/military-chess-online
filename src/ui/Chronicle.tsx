import { useEffect, useMemo, useState } from 'react';
import type { GameState, Piece } from '../game/types';
import { chronicleFrames, chronicleView } from '../intelligence/chronicle';
import { BattlefieldView } from '../battlefield3d/BattlefieldView';
import { Board } from './Board';
export function Chronicle({game,initial,onClose}:{game:GameState;initial:{readonly p1:readonly Piece[];readonly p2:readonly Piece[]};onClose():void}) {
  const frames=useMemo(()=>{try{return chronicleFrames(game,initial);}catch{return null;}},[game,initial]);
  const [index,setIndex]=useState(0),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1),[fallback,setFallback]=useState(false);
  useEffect(()=>{if(!playing||!frames||index>=frames.length-1){setPlaying(false);return;}const timer=setTimeout(()=>setIndex(i=>i+1),1000/speed);return()=>clearTimeout(timer);},[playing,index,speed,frames]);
  if(!frames)return <section><p role="alert">棋譜を再現できません。元の保存対局は変更していません。</p><button onClick={onClose}>結果画面へ戻る</button></section>;
  const frame=frames[index],event=[...frame.events].reverse().find(e=>e.kind==='MOVE');
  return <section className={'chronicle'+(fallback?' has-fallback':'')} aria-label="戦史再現"><div className="chronicle-heading"><h3>戦史再現 <small>CHRONICLE REPLAY</small></h3><button className="secondary" onClick={onClose}>結果画面へ戻る</button></div><p role="status" aria-label="再現中の手" className="chronicle-event">第{index}手 · {event?.kind==='MOVE'?`${event.move.from} → ${event.move.to}${event.battle?' · 戦闘':''}`:'初期配置'}</p>
    <BattlefieldView state={chronicleView(frame,game)} onSiteSelect={()=>{}} onLaneSelect={()=>{}} onUnavailable={()=>setFallback(true)}/>
    {fallback&&<Board pieces={frame.pieces} perspective={1} selected={null} disabled onSelect={()=>{}}/>}
    <div className="chronicle-controls"><button className="secondary" disabled={!index} onClick={()=>{setPlaying(false);setIndex(i=>i-1);}}>前の手</button><button className="primary" disabled={index===frames.length-1&&!playing} onClick={()=>setPlaying(p=>!p)}>{playing?'一時停止':'再生'}</button><button className="secondary" disabled={index===frames.length-1} onClick={()=>{setPlaying(false);setIndex(i=>i+1);}}>次の手</button><label>速度 <select aria-label="再現速度" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[.5,1,2].map(v=><option key={v} value={v}>{v}倍</option>)}</select></label></div>
    <label className="chronicle-slider">手数 <input aria-label="再現手数" type="range" min="0" max={frames.length-1} value={index} onChange={e=>{setPlaying(false);setIndex(Number(e.target.value));}}/></label>
  </section>;
}
