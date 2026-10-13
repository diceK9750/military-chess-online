import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState, Piece } from '../game/types';
import { chronicleFrames, chronicleView } from '../intelligence/chronicle';
import { chronicleStory } from '../intelligence/chronicleStory';
import { BattlefieldView } from '../battlefield3d/BattlefieldView';
import {cinemaPlaybackRetime,cinemaPlaybackSchedule,cinemaShot} from '../battlefield3d/cinemaPresentation';
import type {CinemaPlaybackSchedule} from '../battlefield3d/cinemaPresentation';
import { Board } from './Board';
import { CommandDeck } from './CommandDeck';
const chapterIcons:Record<string,string>={開戦:'⚑',序盤:'➜',初接触:'⚔',初の突破:'↗',本陣圧迫:'⌂',重要駒撃破:'◆',決定打:'★',終局:'◎'};

export function Chronicle({ game, initial, onClose, onSave, onTitle }: { game: GameState; initial: { readonly p1: readonly Piece[]; readonly p2: readonly Piece[] }; onClose(): void; onSave?(): void; onTitle?(): void }) {
  const recording = useMemo(() => {
    try { const frames = chronicleFrames(game, initial); return { frames, ...chronicleStory(frames) }; }
    catch { return null; }
  }, [game, initial]);
  const [index, setIndex] = useState(0), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(1), [fallback, setFallback] = useState(false);
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
    if(!playing||!pageVisible)return;
    const startedAt=performance.now();clock.startedAt=startedAt;
    const timer=setTimeout(()=>{if(index>=recording.frames.length-1)setPlaying(false);else setIndex(i=>i+1);},Math.max(0,schedule.duration-clock.elapsed));
    return()=>{clearTimeout(timer);if(clock.startedAt===startedAt){clock.elapsed=Math.min(clock.schedule.duration,clock.elapsed+Math.max(0,performance.now()-startedAt));clock.startedAt=null;}};
  }, [playing, index, speed, recording, pageVisible]);
  const baseView=useMemo(()=>recording?chronicleView(recording.frames[index],game,[...initial.p1,...initial.p2]):null,[recording,index,game,initial]);
  const movieView=useMemo(()=>baseView&&recording?({...baseView,cinematic:{shot:cinemaShot(recording.scenes[index],index,!![...recording.frames[index].events].reverse().find(e=>e.kind==='MOVE')?.battle),title:recording.scenes[index].title,ending:index===recording.frames.length-1,speed,playing}}):null,[baseView,recording,index,speed,playing]);
  if (!recording || !movieView) return <section><p role="alert">棋譜を再現できません。元の保存対局は変更していません。</p><button onClick={onClose}>結果画面へ戻る</button></section>;
  const { frames, scenes, chapters } = recording, frame = frames[index], scene = scenes[index];
  const event = [...frame.events].reverse().find(e => e.kind === 'MOVE');
  const seek = (value: number) => { playbackClock.current.index=-1;playbackClock.current.elapsed=0;playbackClock.current.startedAt=null;setPlaying(false);setIndex(value); };
  const primaryControls = <><p className="cinema-cue" role="status">{scene.title} · 第{index}手</p>
    <div className="chronicle-controls">
      <button className="secondary" disabled={!index} onClick={() => seek(index - 1)}>前の手</button>
      <button className="primary" onClick={() => { if (!playing && index === frames.length - 1) setIndex(0); setPlaying(p => !p); }}>{playing ? '一時停止' : index === frames.length - 1 ? '最初から再生' : '再生'}</button>
      <button className="secondary" disabled={index === frames.length - 1} onClick={() => seek(index + 1)}>次の手</button>
      <label>速度 <select aria-label="再現速度" value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[.5, 1, 2].map(v => <option key={v} value={v}>{v}倍</option>)}</select></label>
      <span>{playing ? '再生中' : '一時停止'} · {index} / {game.moveCount}手</span>
    </div>
    <label className="chronicle-slider">手数 <input aria-label="再現手数" type="range" min="0" max={frames.length - 1} value={index} onChange={e => seek(Number(e.target.value))} /></label>
  </>;
  const commands = <CommandDeck><p className="next-action">見どころで場面を選ぶ → 「再生」 → 0.5／1／2倍で鑑賞。「前の手」「次の手」で詳しく確認できます。</p><div className="actions"><button className="secondary" onClick={onClose}>結果画面へ戻る</button>{onSave && <button onClick={onSave}>対局を保存</button>}{onTitle && <button onClick={onTitle}>タイトルへ</button>}</div>
    <nav className="chronicle-chapters" aria-label="戦史の見どころ"><strong>見どころ</strong>{chapters.map(chapter => <button className="secondary" key={chapter.index + chapter.title} aria-label={`${chapter.title} 第${chapter.index}手`} aria-pressed={index === chapter.index} onClick={() => seek(chapter.index)}><span aria-hidden="true">{chapterIcons[chapter.title]??'◆'} </span>{chapter.title}<small>第{chapter.index}手</small></button>)}</nav>
</CommandDeck>;
  return <section className={'chronicle' + (fallback ? ' has-fallback' : '')} aria-label="戦史再現">
    <div className="chronicle-heading"><div><small>CINEMATIC CHRONICLE · 終局後の正式記録</small><h3>戦史映画 — 二つの本陣</h3><p>{game.moveCount}手の戦いを、部隊の行軍と戦史官の解説で追体験</p></div></div>
    <p role="status" aria-label="再現中の手" className="chronicle-event">第{index}手 · {scene.move}{event?.battle ? ' · 戦闘' : ''}</p>

    <p className="chronicle-provenance">棋譜に基づく再現。地形・兵員数・動作は演出です。</p>
    <BattlefieldView primaryControls={!fallback ? primaryControls : undefined} caption={<div className="chronicle-commentary" role="status" aria-label="戦史解説" data-kinds={scene.kinds.join(' ')}><small>戦史官 / CHRONICLE NARRATOR · {index === 0 ? '序章' : index === game.moveCount ? '終章' : `第${index}手の記録`}</small><h4>{scene.title}</h4><p>{scene.text}</p><small>正式棋譜から生成した事実解説</small></div>} commands={commands} state={movieView} onSiteSelect={() => {}} onLaneSelect={() => {}} onUnavailable={() => setFallback(true)} />
    {fallback && <><Board pieces={frame.pieces} perspective={1} selected={null} disabled onSelect={() => {}} /><div className="chronicle-fallback-controls">{primaryControls}</div></>}

  </section>;
}

