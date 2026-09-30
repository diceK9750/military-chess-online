import { useEffect, useRef, useState } from 'react';
import { PIECES } from '../game/pieces';
import type { BattlefieldHandlers, BattlefieldViewState } from './state';
import type { BattlefieldRenderer } from './renderer';

export function BattlefieldView({ state, onSiteSelect, onLaneSelect, onAnimationChange, onUnavailable }: { state: BattlefieldViewState; onUnavailable?(): void } & BattlefieldHandlers) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<BattlefieldRenderer | null>(null);
  const current = useRef({ state, onSiteSelect, onLaneSelect, onAnimationChange, onUnavailable });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  current.current = { state, onSiteSelect, onLaneSelect, onAnimationChange, onUnavailable };
  useEffect(() => {
    let cancelled = false;
    const fail = () => {
      renderer.current?.dispose(); renderer.current = null;
      if (!cancelled) { setStatus('error'); current.current.onAnimationChange?.(false); current.current.onUnavailable?.(); }
    };
    void import('./renderer').then(({ createBattlefield }) => {
      if (cancelled) return;
      renderer.current = createBattlefield(host.current!, current.current.state, fail, {
        onSiteSelect: site => current.current.onSiteSelect(site),
        onLaneSelect: lane => current.current.onLaneSelect(lane),
        onAnimationChange: active => current.current.onAnimationChange?.(active),
      });
      setStatus('ready');
    }).catch(fail);
    return () => { cancelled = true; renderer.current?.dispose(); renderer.current = null; };
  }, []);
  useEffect(() => {
    try { renderer.current?.update(state); }
    catch { renderer.current?.dispose(); renderer.current = null; setStatus('error'); current.current.onAnimationChange?.(false); current.current.onUnavailable?.(); }
  }, [state]);
  const interaction = state.interaction;
  const setup = state.phase === 'setup';
  return <section className={'battlefield-panel battlefield-' + status} aria-label="三次元戦場">
    <div className="battlefield-header"><strong>{setup ? '三次元配置戦場' : '三次元戦場'} <small>{setup ? `${state.pieces.length} / 23枚` : `${state.moveCount}手目`}</small></strong><button disabled={status !== 'ready'} onClick={() => renderer.current?.reset()}>視点を戻す</button></div>
    <div className="battlefield-cameras" aria-label="カメラ視点">
      <button disabled={status !== 'ready'} onClick={() => renderer.current?.setCamera('full')}>全景</button>
      <button disabled={status !== 'ready'} onClick={() => renderer.current?.setCamera('top')}>真上</button>
      <button disabled={status !== 'ready'} onClick={() => renderer.current?.setCamera('front')}>自軍正面</button>
      <button disabled={status !== 'ready' || !interaction.selectedSite} onClick={() => renderer.current?.setCamera('selected')}>選択中の駒</button>
    </div>
    <div className="battlefield-stage" ref={host} aria-label="現在の戦場">
      {status !== 'ready' && <p className="battlefield-status" role={status === 'error' ? 'alert' : 'status'}>{status === 'error' ? '三次元表示を利用できません。二次元盤面で続けられます。' : '戦場を読み込んでいます…'}</p>}
    </div>
    <div className="battlefield-guide"><span>{setup ? '自軍を選択・金枠の駒をタップして交換' : 'タップで選択・目的地を再タップで確定'}</span><span>ドラッグで回転 · 2本指／ホイールで拡大</span></div>
    {interaction.laneCandidates.length > 1 && <div className="battlefield-lanes" aria-label="三次元の使用列">{interaction.laneCandidates.map(lane => <button key={lane} aria-pressed={interaction.selectedLane === lane} disabled={!interaction.interactionEnabled} onClick={() => onLaneSelect(lane)}>三次元 {lane}列</button>)}</div>}
    <p className="battlefield-selection" role="status">{setup ? interaction.selectedSite ? `${interaction.selectedSite}を選択中・金枠が交換先` : '自軍23枚のみ表示・CPU配置は非表示' : state.finished ? '終局・全駒公開' : !interaction.interactionEnabled ? 'CPUの手番' : interaction.pendingSite ? interaction.pendingSite + 'へ移動予定' + (interaction.laneCandidates.length > 1 && !interaction.selectedLane ? '・使用列を選択' : '・同じ地点で確定') : interaction.selectedSite ? interaction.selectedSite + 'を選択中・金枠が移動先' : '青＝自軍 / 赤＝敵軍'}</p>
    <ul className="battlefield-sr" aria-label="三次元表示中の駒">{state.pieces.map(piece => <li key={piece.position}>{piece.position} {piece.owner === state.viewer ? '自軍' : '敵軍'} {piece.unknown ? '不明' : PIECES[piece.type].label}</li>)}</ul>
  </section>;
}
