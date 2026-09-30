import { useEffect, useMemo, useState } from 'react';
import type { GameState, Piece } from '../game/types';
import { chronicleFrames, chronicleView } from '../intelligence/chronicle';
import { chronicleDelay, chronicleStory } from '../intelligence/chronicleStory';
import { BattlefieldView } from '../battlefield3d/BattlefieldView';
import { Board } from './Board';

export function Chronicle({ game, initial, onClose }: { game: GameState; initial: { readonly p1: readonly Piece[]; readonly p2: readonly Piece[] }; onClose(): void }) {
  const recording = useMemo(() => {
    try { const frames = chronicleFrames(game, initial); return { frames, ...chronicleStory(frames) }; }
    catch { return null; }
  }, [game, initial]);
  const [index, setIndex] = useState(0), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(1), [fallback, setFallback] = useState(false);
  useEffect(() => {
    if (!playing || !recording || index >= recording.frames.length - 1) { setPlaying(false); return; }
    // Give battle effects their full 800ms even at 2x; notable scenes get a readable dwell.
    const scene = recording.scenes[index];
    const event = [...recording.frames[index].events].reverse().find(e => e.kind === 'MOVE');
    const timer = setTimeout(() => setIndex(i => i + 1), chronicleDelay(scene, speed, index > 0, !!event?.battle));
    return () => clearTimeout(timer);
  }, [playing, index, speed, recording]);
  if (!recording) return <section><p role="alert">棋譜を再現できません。元の保存対局は変更していません。</p><button onClick={onClose}>結果画面へ戻る</button></section>;
  const { frames, scenes, chapters } = recording, frame = frames[index], scene = scenes[index];
  const event = [...frame.events].reverse().find(e => e.kind === 'MOVE');
  const seek = (value: number) => { setPlaying(false); setIndex(value); };
  return <section className={'chronicle' + (fallback ? ' has-fallback' : '')} aria-label="戦史再現">
    <div className="chronicle-heading"><div><small>CHRONICLE THEATER · 終局後の記録</small><h3>戦史再現 — 二つの本陣</h3><p>{game.moveCount}手の戦いを、動きと解説で追体験</p></div><button className="secondary" onClick={onClose}>結果画面へ戻る</button></div>
    <div className="chronicle-controls">
      <button className="secondary" disabled={!index} onClick={() => seek(index - 1)}>前の手</button>
      <button className="primary" onClick={() => { if (index === frames.length - 1) setIndex(0); setPlaying(p => !p); }}>{playing ? '一時停止' : index === frames.length - 1 ? '最初から再生' : '再生'}</button>
      <button className="secondary" disabled={index === frames.length - 1} onClick={() => seek(index + 1)}>次の手</button>
      <label>速度 <select aria-label="再現速度" value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[.5, 1, 2].map(v => <option key={v} value={v}>{v}倍</option>)}</select></label>
      <span>{playing ? '再生中' : '一時停止'} · {index} / {game.moveCount}手</span>
    </div>
    <label className="chronicle-slider">手数 <input aria-label="再現手数" type="range" min="0" max={frames.length - 1} value={index} onChange={e => seek(Number(e.target.value))} /></label>
    <p role="status" aria-label="再現中の手" className="chronicle-event">第{index}手 · {scene.move}{event?.battle ? ' · 戦闘' : ''}</p>
    <div className="chronicle-commentary" role="status" aria-label="戦史解説" data-kinds={scene.kinds.join(' ')}><small>{index === 0 ? '序章' : index === game.moveCount ? '終章' : `第${index}手の記録`}</small><h4>{scene.title}</h4><p>{scene.text}</p></div>
    <BattlefieldView state={chronicleView(frame, game, [...initial.p1, ...initial.p2])} onSiteSelect={() => {}} onLaneSelect={() => {}} onUnavailable={() => setFallback(true)} />
    {fallback && <Board pieces={frame.pieces} perspective={1} selected={null} disabled onSelect={() => {}} />}
    <nav className="chronicle-chapters" aria-label="戦史の見どころ"><strong>見どころ</strong>{chapters.map(chapter => <button className="secondary" key={chapter.index + chapter.title} aria-label={`${chapter.title} 第${chapter.index}手`} aria-pressed={index === chapter.index} onClick={() => seek(chapter.index)}>{chapter.title}<small>第{chapter.index}手</small></button>)}</nav>
  </section>;
}
