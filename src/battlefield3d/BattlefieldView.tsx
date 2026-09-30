import { useEffect, useRef, useState } from 'react';
import { PIECES } from '../game/pieces';
import type { BattlefieldHandlers, BattlefieldViewState } from './state';
import type { BattlefieldRenderer } from './renderer';

export function BattlefieldView({ state, onSiteSelect, onLaneSelect, onDragStart, onPieceDrop, onAnimationChange, onUnavailable }: { state: BattlefieldViewState; onUnavailable?(): void } & BattlefieldHandlers) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<BattlefieldRenderer | null>(null);
  const current = useRef({ state, onSiteSelect, onLaneSelect, onDragStart, onPieceDrop, onAnimationChange, onUnavailable });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  current.current = { state, onSiteSelect, onLaneSelect, onDragStart, onPieceDrop, onAnimationChange, onUnavailable };
  useEffect(() => {
    let cancelled = false;
    let restarting = false;
    const fail = () => {
      const retryGL = renderer.current?.backend === 'webgpu' && !restarting;
      renderer.current?.dispose(); renderer.current = null;
      if (!cancelled) current.current.onAnimationChange?.(false);
      if (!cancelled && retryGL) { restarting = true; setStatus('loading'); void load(true); return; }
      if (!cancelled) { setStatus('error'); current.current.onUnavailable?.(); }
    };
    async function load(forceWebGL = false) {
      try {
      const { createBattlefield } = await import('./renderer');
      if (cancelled) return;
      const created = await createBattlefield(host.current!, current.current.state, fail, {
        onSiteSelect: site => current.current.onSiteSelect(site),
        onLaneSelect: lane => current.current.onLaneSelect(lane),
        onDragStart: site => current.current.onDragStart?.(site),
        onPieceDrop: (from, to, lane) => current.current.onPieceDrop?.(from, to, lane),
        onAnimationChange: active => current.current.onAnimationChange?.(active),
      }, forceWebGL);
      if (cancelled) { created.dispose(); return; }
      renderer.current = created;
      created.update(current.current.state);
      setStatus('ready');
      } catch { fail(); }
    }
    void load();
    return () => { cancelled = true; renderer.current?.dispose(); renderer.current = null; };
  }, []);
  useEffect(() => {
    try { renderer.current?.update(state); }
    catch { renderer.current?.dispose(); renderer.current = null; setStatus('error'); current.current.onAnimationChange?.(false); current.current.onUnavailable?.(); }
  }, [state]);
  const interaction = state.interaction;
  const setup = state.phase === 'setup';
  const selected = state.pieces.find(piece => piece.position === interaction.selectedSite);
  const name = selected && !selected.unknown ? PIECES[selected.type].label : null;
  return <section className={'battlefield-panel battlefield-' + status} aria-label="三次元戦場">
    <div className="battlefield-header"><strong>{setup ? '三次元配置戦場' : '三次元戦場'} <small>{setup ? `${state.pieces.length} / 23枚` : `${state.moveCount}手目`}</small></strong><button disabled={status !== 'ready'} onClick={() => renderer.current?.reset()}>視点を戻す</button></div>
    <div className="battlefield-cameras" aria-label="カメラ視点">
      <button disabled={status !== 'ready'} onClick={() => renderer.current?.setCamera('full')}>全景</button>
      <button disabled={status !== 'ready'} onClick={() => renderer.current?.setCamera('top')}>真上</button>
      <button disabled={status !== 'ready'} onClick={() => renderer.current?.setCamera('front')}>自軍正面</button>
      <button disabled={status !== 'ready' || !interaction.selectedSite} onClick={() => renderer.current?.setCamera('selected')}>選択中の駒</button>
    </div>
    <div className="battlefield-stage" ref={host} aria-label="現在の戦場">
      <div className="battlefield-hq" aria-label="本陣の所属と駒">{([state.viewer, state.viewer === 1 ? 2 : 1] as const).map(owner => {
        const own = owner === state.viewer, site = `HQ-P${owner}`;
        const piece = state.pieces.find(p => p.position === site);
        return <span key={owner} className={own ? 'own-hq' : 'enemy-hq'}><strong>{own ? '自軍本陣' : '敵軍本陣'}</strong><small>{site} · {piece ? `${piece.owner === state.viewer ? '自軍' : '敵軍'} ${piece.unknown ? '不明駒' : PIECES[piece.type].label}` : '空き'}</small></span>;
      })}</div>
      {status !== 'ready' && <p className="battlefield-status" role={status === 'error' ? 'alert' : 'status'}>{status === 'error' ? '三次元表示を利用できません。二次元盤面で続けられます。' : '戦場を読み込んでいます…'}</p>}
    </div>
    <div className="battlefield-guide"><span>{setup ? '2枚をタップ／駒をドラッグして交換' : '駒→移動先→再タップで確定／ドラッグで着手'}</span><span>空き領域をドラッグで回転 · 2本指／ホイールで拡大</span></div>
    {interaction.laneCandidates.length > 1 && <div className="battlefield-lanes" aria-label="三次元の使用列">{interaction.laneCandidates.map(lane => <button key={lane} aria-pressed={interaction.selectedLane === lane} disabled={!interaction.interactionEnabled} onClick={() => onLaneSelect(lane)}>三次元 {lane}列</button>)}</div>}
    <p className="battlefield-selection" role="status">{setup ? interaction.selectedSite ? `${name} ${interaction.selectedSite}・金枠が交換先` : '自軍23枚のみ表示・CPU配置は非表示' : state.finished ? '終局・全駒公開' : !interaction.interactionEnabled ? 'CPUの手番' : interaction.pendingSite ? `${name} ${interaction.selectedSite} → ${interaction.pendingSite}・確定待ち` + (interaction.laneCandidates.length > 1 && !interaction.selectedLane ? '・使用列を選択' : '・再タップで実行') : interaction.selectedSite ? `${name} ${interaction.selectedSite}・移動可能 ${new Set(interaction.legalTargets).size}地点` : '青＝自軍 / 赤＝敵軍 · 金枠＋移＝合法移動先'}</p>
    <ul className="battlefield-sr" aria-label="三次元表示中の駒">{state.pieces.map(piece => <li key={piece.position}>{piece.position} {piece.owner === state.viewer ? '自軍' : '敵軍'} {piece.unknown ? '不明' : PIECES[piece.type].label}</li>)}</ul>
  </section>;
}
