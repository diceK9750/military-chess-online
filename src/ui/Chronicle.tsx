import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState, Piece } from '../game/types';
import { chronicleFrames, chronicleView } from '../intelligence/chronicle';
import { chronicleStory } from '../intelligence/chronicleStory';
import { BattlefieldView } from '../battlefield3d/BattlefieldView';
import {cinemaPlaybackRetime,cinemaPlaybackSchedule,cinemaShot} from '../battlefield3d/cinemaPresentation';
import type {CinemaPlaybackSchedule} from '../battlefield3d/cinemaPresentation';
import {useMobileScreen} from '../battlefield3d/viewport';
import { Board } from './Board';
import { CommandDeck } from './CommandDeck';
import {playCue} from './sound';
const chapterIcons:Record<string,string>={開戦:'⚑',序盤:'➜',初接触:'⚔',初の突破:'↗',本陣圧迫:'⌂',重要駒撃破:'◆',決定打:'★',終局:'◎'};
const outcomeText={ATTACKER:'攻撃側勝利',DEFENDER:'防御側勝利',MUTUAL:'相打ち'};
const reasons={HQ_CAPTURE:'司令部占領',CAPTURERS_ELIMINATED:'片側の占領可能駒全滅',BOTH_CAPTURERS_ELIMINATED:'双方の占領可能駒全滅',NO_LEGAL_MOVES_BOTH:'双方合法手なし',FIFTY_NONCOMBAT_MOVES:'非戦闘50手'};

export function Chronicle({ game, initial, onClose, onSave, onTitle }: { game: GameState; initial: { readonly p1: readonly Piece[]; readonly p2: readonly Piece[] }; onClose(): void; onSave?(): void; onTitle?(): void }) {
 const recording=useMemo(()=>{try{const frames=chronicleFrames(game,initial);return {frames,...chronicleStory(frames)};}catch{return null;}},[game,initial]);
 const mobile=useMobileScreen();
 const renderCompletion=useRef({index:-1,ready:false,due:false});
 const [index,setIndex]=useState(0),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1),[fallback,setFallback]=useState(false),[intro,setIntro]=useState(true),[chapterOverride,setChapterOverride]=useState<string|null>(null);
 if(renderCompletion.current.index!==index)renderCompletion.current={index,ready:false,due:false};
 useEffect(()=>{if(!intro)return;const timer=setTimeout(()=>setIntro(false),2500);return()=>clearTimeout(timer);},[intro]);
  const playbackClock=useRef<{index:number;speed:number;elapsed:number;startedAt:number|null;schedule:CinemaPlaybackSchedule}>({index:-1,speed:1,elapsed:0,startedAt:null,schedule:{march:0,clash:0,exit:0,duration:0,tail:0}});
  const [pageVisible,setPageVisible]=useState(()=>typeof document==='undefined'||document.visibilityState!=='hidden');
  useEffect(()=>{const updateVisibility=()=>setPageVisible(document.visibilityState!=='hidden');document.addEventListener('visibilitychange',updateVisibility);return()=>document.removeEventListener('visibilitychange',updateVisibility);},[]);
  useEffect(() => {
    if (!recording) return;
    const scene = recording.scenes[index];
    const event = [...recording.frames[index].events].reverse().find(e => e.kind === 'MOVE');
    const schedule=cinemaPlaybackSchedule(scene,speed,index>0,!!event?.battle),clock=playbackClock.current;
    if(clock.index!==index){clock.index=index;clock.speed=speed;clock.elapsed=0;clock.startedAt=null;clock.schedule=schedule;}
    else{
      if(clock.startedAt!==null){clock.elapsed=Math.min(clock.schedule.duration,clock.elapsed+Math.max(0,performance.now()-clock.startedAt));clock.startedAt=null;}
      if(clock.speed!==speed){clock.elapsed=cinemaPlaybackRetime(clock.elapsed,clock.schedule,schedule);clock.speed=speed;clock.schedule=schedule;}
    }
    if(!playing||!pageVisible||intro)return;
    const startedAt=performance.now();clock.startedAt=startedAt;
    const timer=setTimeout(()=>{if(index>=recording.frames.length-1){renderCompletion.current.due=true;if(renderCompletion.current.ready||fallback)setPlaying(false);}else {setChapterOverride(null);setIndex(i=>i+1);}},Math.max(0,schedule.duration-clock.elapsed));
    return()=>{clearTimeout(timer);if(clock.startedAt===startedAt){clock.elapsed=Math.min(clock.schedule.duration,clock.elapsed+Math.max(0,performance.now()-startedAt));clock.startedAt=null;}};
  }, [playing, index, speed, recording, pageVisible,intro,fallback]);
 useEffect(()=>{if(!playing||!index||!recording)return;const event=[...recording.frames[index].events].reverse().find(e=>e.kind==='MOVE');playCue(event?.battle?'battle':recording.chapters.some(c=>c.index===index)?'analysis':'move');},[index,playing,recording]);
 const baseView=useMemo(()=>recording?chronicleView(recording.frames[index],game,[...initial.p1,...initial.p2]):null,[recording,index,game,initial]);
 const scene=recording?.scenes[index],chapterNumber=recording?chapterOverride?recording.chapters.findIndex(c=>c.index===index&&c.title===chapterOverride):recording.chapters.reduce((n,c,i)=>c.index<=index?i:n,0):0,chapter=recording?.chapters[chapterNumber];
 const chapterTitle=chapter?`第${chapterNumber+1}章 · ${chapter.title}`:'戦史再現';
 const event=recording?[...recording.frames[index].events].reverse().find(e=>e.kind==='MOVE'):undefined;
 const subtitle=scene?`${scene.move}${event?.battle?' · 戦闘 / '+outcomeText[event.battle]:index?' · 移動':''}`:'';
 const summary=game.result?`${reasons[game.result.reason]} · 全${game.moveCount}手 · 戦闘${game.events.filter(e=>e.kind==='MOVE'&&e.battle).length}回`:'';
 const movieView=useMemo(()=>baseView&&scene?({...baseView,cinematic:{shot:cinemaShot(scene,index,!!event?.battle),title:scene.title,chapter:chapterTitle,subtitle,summary,ending:index===recording!.frames.length-1,speed,playing}}):null,[baseView,scene,index,chapterTitle,subtitle,summary,recording,speed,playing]);
 if(!recording||!movieView||!scene)return <section><p role="alert">棋譜を再現できません。元の保存対局は変更していません。</p><button onClick={onClose}>結果画面へ戻る</button></section>;
 const {frames,chapters}=recording,frame=frames[index];
 const seek=(value:number,title:string|null=null)=>{playbackClock.current.index=-1;setIntro(false);setPlaying(false);setChapterOverride(title);setIndex(value);};
 const restart=()=>{playbackClock.current.index=-1;setChapterOverride(null);setIndex(0);setIntro(true);setPlaying(true);};
 const play=()=>{if(!playing&&index===frames.length-1){restart();return;}setPlaying(p=>!p);};
 const transport=<><div className="chronicle-controls">{(!mobile||fallback)&&<><button className="secondary" disabled={!index} onClick={()=>seek(index-1)}>前の手</button><button className="primary" onClick={play}>{playing?'一時停止':index===frames.length-1?'最初から再生':'再生'}</button><button className="secondary" disabled={index===frames.length-1} onClick={()=>seek(index+1)}>次の手</button></>}<label>速度 <select aria-label="再現速度" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[.5,1,2].map(v=><option key={v} value={v}>{v}倍</option>)}</select></label><span>{playing?'再生中':'一時停止'} · {index} / {game.moveCount}手</span></div><label className="chronicle-slider">手数 <input aria-label="再現手数" type="range" min="0" max={frames.length-1} value={index} onChange={e=>seek(Number(e.target.value))}/></label></>;
 const commands=<CommandDeck><p className="next-action">見どころ → 再生。速度と手数で見たい場面へ。</p><div className="actions"><button className="secondary" onClick={onClose}>結果画面へ戻る</button>{index!==frames.length-1&&<button onClick={restart}>最初から再生</button>}{onSave&&<button onClick={onSave}>対局を保存</button>}{onTitle&&<button onClick={onTitle}>タイトルへ</button>}</div><nav className="chronicle-chapters" aria-label="戦史の見どころ"><strong>見どころ</strong>{chapters.map(c=><button className="secondary" key={c.index+c.title} aria-label={`${c.title} 第${c.index}手`} aria-pressed={index===c.index} onClick={()=>seek(c.index,c.title)}><span aria-hidden="true">{chapterIcons[c.title]??'◆'} </span>{c.title}<small>第{c.index}手</small></button>)}</nav></CommandDeck>;
 // Select at most three existing sentences; the full verified commentary remains available.
 const sentences=scene.text.split('。').map(s=>s.trim()).filter(Boolean),short=[...sentences.slice(0,scene.kinds.includes('summary')?2:3),...(scene.kinds.includes('summary')&&sentences.length>2?[sentences.at(-1)!]:[])].join('。')+'。';
 const narration=<div className="chronicle-commentary" role="status" aria-label="戦史解説" data-kinds={scene.kinds.join(' ')}><small>戦史官 / CHRONICLE NARRATOR · {index===0?'序章':index===game.moveCount?'終章':`第${index}手の記録`}</small><h4>{scene.title}</h4><p>{short}</p><details><summary>詳しい記録</summary><p>{scene.text}</p></details><small>正式棋譜から生成した事実解説</small></div>;
 const chapterOverlay=<div className="theater-chapter" key={chapterTitle} aria-label="章タイトル"><small>{chapterTitle}</small><strong>{scene.title}</strong></div>;
 const titleOverlay=<>{!mobile&&chapterOverlay}<div className="theater-lower-third chronicle-event" role="status" aria-label="再現中の手"><strong>第{index}手 · {subtitle}</strong>{scene.kinds.some(k=>k!=='opening')&&<small>{scene.title}</small>}</div>{intro&&<div className="theater-intro" aria-label="戦史の導入"><small>CHRONICLE THEATER</small><h3>戦史再現 — 二つの本陣</h3><p>全{game.moveCount}手 · 先手 {game.firstPlayer===1?'自軍':'CPU'}</p><p>{game.result?.winner===null?'引き分け':game.result?.winner===1?'自軍の勝利':'CPUの勝利'} · {game.result&&reasons[game.result.reason]}</p><button onClick={()=>setIntro(false)}>導入をスキップ</button></div>}</>;
 return <section className={'chronicle television'+(fallback?' has-fallback':'')} aria-label="戦史再現"><div className="chronicle-heading"><div><small>CHRONICLE THEATER · 終局後の正式記録</small><h3>戦史再現 — 二つの本陣</h3></div></div><p className="chronicle-provenance">棋譜に基づく再現。地形・兵員数・動作は演出です。</p><BattlefieldView stageHeading={mobile?chapterOverlay:undefined} stageOverlay={titleOverlay} playback={transport} primaryCommands={()=><>{mobile&&<><button aria-label="前の手" disabled={!index} onClick={()=>seek(index-1)}>前</button><button className="primary" onClick={play}>{playing?'一時停止':index===frames.length-1?'最初から再生':'再生'}</button><button aria-label="次の手" disabled={index===frames.length-1} onClick={()=>seek(index+1)}>次</button></>}</>} caption={narration} commands={commands} state={movieView} onSiteSelect={()=>{}} onLaneSelect={()=>{}} onReplayComplete={moveCount=>{if(moveCount===renderCompletion.current.index){renderCompletion.current.ready=true;if(renderCompletion.current.due)setPlaying(false);}}} onUnavailable={()=>setFallback(true)}/>{fallback&&<Board pieces={frame.pieces} perspective={1} selected={null} disabled onSelect={()=>{}}/>}</section>;
}
