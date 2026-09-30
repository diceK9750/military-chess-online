import { useEffect, useRef, useState } from 'react';
import { PIECES } from '../game/pieces';
import type { BattlefieldHandlers, BattlefieldViewState, CameraPreset } from './state';
import type { BattlefieldRenderer } from './renderer';

export function BattlefieldView({ state, onSiteSelect, onLaneSelect, onDragStart, onPieceDrop, onAnimationChange, onUnavailable, endgame }: { state: BattlefieldViewState; onUnavailable?(): void; endgame?: { label: string; reason: string; onNew?(): void; onReplay?(): void; onSave?(): void } } & BattlefieldHandlers) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<BattlefieldRenderer | null>(null);
  const resultPanel = useRef<HTMLDivElement>(null);
  const current = useRef({ state, onSiteSelect, onLaneSelect, onDragStart, onPieceDrop, onAnimationChange, onUnavailable });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [camera, setCamera] = useState<CameraPreset>('full');
  const [busy, setBusy] = useState(false);
  current.current = { state, onSiteSelect, onLaneSelect, onDragStart, onPieceDrop, onAnimationChange, onUnavailable };
  useEffect(() => {
    let cancelled = false;
    let restarting = false;
    const fail = () => {
      const retryGL = renderer.current?.backend === 'webgpu' && !restarting;
      renderer.current?.dispose(); renderer.current = null;
      if (!cancelled) { setBusy(false); current.current.onAnimationChange?.(false); }
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
        onAnimationChange: active => { setBusy(active); current.current.onAnimationChange?.(active); },
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
    catch { renderer.current?.dispose(); renderer.current = null; setBusy(false); setStatus('error'); current.current.onAnimationChange?.(false); current.current.onUnavailable?.(); }
  }, [state]);
  const interaction = state.interaction;
  const setup = state.phase === 'setup';
  const selected = state.pieces.find(piece => piece.position === interaction.selectedSite);
  useEffect(() => { if (camera === 'selected' && !interaction.selectedSite) setCamera('full'); }, [camera, interaction.selectedSite]);
  const name = selected && !selected.unknown ? PIECES[selected.type].label : null;
  useEffect(() => {
    if (!state.finished || !endgame) return;
    const frame=requestAnimationFrame(() => resultPanel.current?.scrollIntoView?.({ block: 'center', behavior: 'instant' }));
    return () => cancelAnimationFrame(frame);
  }, [state.finished, endgame?.label, status]);
  const last = state.lastMove;
  const lastText = last ? `${last.actor === state.viewer ? '自軍' : 'CPU'} ${last.from} → ${last.to}${last.lane ? `（${last.lane}列）` : ''} ${last.type ? PIECES[last.type].label : '不明駒'}` : 'まだ着手はありません';
  const presets: readonly [CameraPreset, string][] = [['full','全景'],['front','自軍正面'],['enemy','敵軍正面'],['top','真上'],['selected','選択中の駒'],['last','直前の手を追う']];
  return <section className={'battlefield-panel battlefield-' + status} aria-label="三次元戦場">
    <div className="battlefield-header"><strong>{setup ? '三次元配置戦場' : '三次元戦場'} <small>{setup ? `${state.pieces.length} / 23枚` : `${state.moveCount}手目`}</small></strong><span className={'battlefield-turn'+(state.finished?' is-ended':'')} role="status">{setup ? '配置中' : state.finished ? '終局' : state.playerTurn === state.viewer ? busy ? '移動・戦闘を表示中' : 'あなたの手番' : 'CPU手番'}</span><button disabled={status !== 'ready'} onClick={() => { setCamera('full'); renderer.current?.reset(); }}>視点を戻す</button></div>
    <div className="battlefield-cameras" aria-label="カメラ視点">
      {presets.map(([preset,label]) => <button key={preset} aria-pressed={camera === preset} disabled={status !== 'ready' || preset === 'selected' && !interaction.selectedSite || preset === 'last' && !last} onClick={() => { setCamera(preset); renderer.current?.setCamera(preset); }}>{label}</button>)}
    </div>
    <div className="battlefield-stage" ref={host} aria-label="現在の戦場">
      <div className="battlefield-hq" aria-label="本陣の所属と駒">{([state.viewer, state.viewer === 1 ? 2 : 1] as const).map(owner => {
        const own = owner === state.viewer, site = `HQ-P${owner}`;
        const piece = state.pieces.find(p => p.position === site);
        return <span key={owner} className={own ? 'own-hq' : 'enemy-hq'}><strong>{own ? '自軍本陣' : '敵軍本陣'}</strong><small>{site} · {piece ? `${piece.owner === state.viewer ? '自軍' : '敵軍'} ${piece.unknown ? '不明駒' : PIECES[piece.type].label}` : '空き'}</small></span>;
      })}</div>
      {!setup && <p className="battlefield-last" aria-label="直前の手"><strong>{state.finished ? '最後の手' : '直前の手'}</strong><span>{lastText}</span><small>発 → 着{state.battleSite ? ' · 着地点で戦闘' : ''}</small></p>}
      {state.finished && endgame && <div ref={resultPanel} className="result battlefield-result" role="status" aria-label="対局結果"><small>対局終了 · 全駒公開</small><strong>{endgame.label}</strong><p>終局理由：{endgame.reason}</p><p className="endgame-last">最後の手：{lastText}</p><div className="actions">{endgame.onNew && <button className="primary" onClick={endgame.onNew}>新しい対局</button>}{endgame.onReplay && <button onClick={endgame.onReplay}>戦史再現</button>}{endgame.onSave && <button onClick={endgame.onSave}>結果を保存</button>}</div></div>}
      {status !== 'ready' && <p className="battlefield-status" role={status === 'error' ? 'alert' : 'status'}>{status === 'error' ? '三次元表示を利用できません。二次元盤面で続けられます。' : '戦場を読み込んでいます…'}</p>}
    </div>
    <div className="battlefield-guide"><span>{setup ? '2枚をタップ／駒をドラッグして交換' : state.finished ? '最後の手を確認し、戦史再現や保存へ' : '駒→移動先→再タップで確定／ドラッグで着手'}</span><span>視点は上のボタンで変更 · 回転・拡大の誤操作なし</span></div>
    <details className="battlefield-key"><summary>駒の見分け方</summary><p><span className="rank-key generals">⬡ 金＝将官</span><span className="rank-key colonels">● 銀＝佐官</span><span className="rank-key officers">■ 水色＝尉官</span> · 各群の印は強い順に3・2・1。飛行機は翼、騎兵は馬、工兵は黄ヘルメットと工具、スパイは黒いフード、軍旗は大きな旗。敵の不明駒は共通外見です。</p></details>
    {interaction.laneCandidates.length > 1 && <div className="battlefield-lanes" aria-label="三次元の使用列">{interaction.laneCandidates.map(lane => <button key={lane} aria-pressed={interaction.selectedLane === lane} disabled={!interaction.interactionEnabled} onClick={() => onLaneSelect(lane)}>三次元 {lane}列</button>)}</div>}
    <p className="battlefield-selection" role="status">{setup ? interaction.selectedSite ? `${name} ${interaction.selectedSite}・金枠が交換先` : '自軍23枚のみ表示・CPU配置は非表示' : state.finished ? '終局・全駒公開' : busy ? '移動・戦闘を表示中・操作は少しお待ちください' : !interaction.interactionEnabled ? 'CPUの手番' : interaction.pendingSite ? `${name} ${interaction.selectedSite} → ${interaction.pendingSite}・確定待ち` + (interaction.laneCandidates.length > 1 && !interaction.selectedLane ? '・使用列を選択' : `${interaction.selectedLane ? `・${interaction.selectedLane}列` : ''}・再タップで実行`) : interaction.selectedSite ? `${name} ${interaction.selectedSite}・移動可能 ${new Set(interaction.legalTargets).size}地点` : '青＝自軍 / 赤＝敵軍 · 金枠＋移＝合法移動先'}</p>
    <ul className="battlefield-sr" aria-label="三次元表示中の駒">{state.pieces.map(piece => <li key={piece.position}>{piece.position} {piece.owner === state.viewer ? '自軍' : '敵軍'} {piece.unknown ? '不明' : PIECES[piece.type].label}</li>)}</ul>
  </section>;
}
