import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PIECES } from '../game/pieces';
import type { BattlefieldHandlers, BattlefieldViewState, CameraPreset } from './state';
import type { BattlefieldRenderer } from './renderer';
import { VictoryCelebration } from './VictoryCelebration';
import { autoQuality, readVisualSettings, VISUAL_SETTINGS_KEY, type QualityChoice } from './settings';
import { approachingEnemies } from './assistance';
import {PieceLegend} from './PieceLegend';

export function BattlefieldView({ state, onSiteSelect, onLaneSelect, onDragStart, onPieceDrop, onAnimationChange, onUnavailable, endgame, commands, caption }: { state: BattlefieldViewState; commands?: ReactNode; caption?: ReactNode; onUnavailable?(): void; endgame?: { fresh?: boolean; label: string; reason: string; onNew?(): void; onReplay?(): void; onSave?(): void } } & BattlefieldHandlers) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<BattlefieldRenderer | null>(null);
  const resultPanel = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState(readVisualSettings);
  const [automatic] = useState(() => autoQuality({width:window.innerWidth,dpr:window.devicePixelRatio||1,memory:(navigator as Navigator & {deviceMemory?:number}).deviceMemory}));
  const [settingError,setSettingError] = useState('');
  const quality = settings.quality === 'auto' ? automatic : settings.quality;
  const renderState = useMemo(() => ({...state, quality, overlay:settings.overlay, freshVictory:!!endgame?.fresh && state.result?.winner===state.viewer}), [state,quality,settings.overlay,endgame?.fresh]);
  const current = useRef({ state:renderState, onSiteSelect, onLaneSelect, onDragStart, onPieceDrop, onAnimationChange, onUnavailable });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [camera, setCamera] = useState<CameraPreset>('full');
  const [busy, setBusy] = useState(false);
  const [captureBusy,setCaptureBusy]=useState(false),[captureNotice,setCaptureNotice]=useState('');
  async function saveScene(share=false){
    if(captureBusy||!renderer.current?.capture)return;setCaptureBusy(true);setCaptureNotice('');
    try{const snapshot=current.current.state;const image=await renderer.current.capture();const {captureScene}=await import('./capture');setCaptureNotice(await captureScene(image,snapshot,snapshot.cinematic?.title??(endgame?`${endgame.label} · ${endgame.reason}`:'軍議盤'),share));}
    catch{setCaptureNotice('画像を保存できません。対局と保存データは変更していません。');}
    finally{setCaptureBusy(false);}
  }
  current.current = { state:renderState, onSiteSelect, onLaneSelect, onDragStart, onPieceDrop, onAnimationChange, onUnavailable };
  useEffect(() => { try { localStorage.setItem(VISUAL_SETTINGS_KEY,JSON.stringify(settings)); setSettingError(''); } catch { setSettingError('表示設定を保存できません。対局は続けられます。'); } },[settings]);
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
      const { createBattlefield } = current.current.state.phase==='replay' ? await import('./cinematicRenderer') : await import('./renderer');
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
    try { renderer.current?.update(renderState); }
    catch { renderer.current?.dispose(); renderer.current = null; setBusy(false); setStatus('error'); current.current.onAnimationChange?.(false); current.current.onUnavailable?.(); }
  }, [renderState]);
  const interaction = state.interaction;
  const setup = state.phase === 'setup';
  const replay = state.phase === 'replay';
  const outcome = state.result?.winner === null ? 'draw' : state.result?.winner === state.viewer ? 'victory' : 'defeat';
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
    <div className="battlefield-header"><strong>{setup ? '三次元配置戦場' : '三次元戦場'} <small>{setup ? `${state.pieces.length} / 23枚` : `${state.moveCount}手目`}</small></strong><span className={'battlefield-turn'+(state.finished?' is-ended':'')} role="status">{setup ? '配置中' : replay ? '戦史再現 · 全駒公開' : state.finished ? '終局' : state.playerTurn === state.viewer ? busy ? '移動・戦闘を表示中' : 'あなたの手番' : 'CPU手番'}</span><button disabled={status !== 'ready'} onClick={() => { setCamera('full'); renderer.current?.reset(); }}>視点を戻す</button></div>
    <div className="battlefield-cameras" aria-label="カメラ視点">
      {presets.map(([preset,label]) => <button key={preset} aria-pressed={camera === preset} disabled={status !== 'ready' || preset === 'selected' && !interaction.selectedSite || preset === 'last' && !last} onClick={() => { setCamera(preset); renderer.current?.setCamera(preset);host.current?.scrollIntoView?.({block:'center',behavior:'instant'}); }}>{label}</button>)}
    </div>
    <details className="battlefield-settings"><summary>戦場設定 · {quality === 'light' ? '軽量' : quality === 'high' ? '高品質' : '標準'}</summary><label>描画品質 <select aria-label="描画品質" disabled={busy} value={settings.quality} onChange={e=>setSettings(v=>({...v,quality:e.target.value as QualityChoice}))}><option value="auto">自動</option><option value="high">高品質</option><option value="standard">標準</option><option value="light">軽量</option></select></label><label><input aria-label="戦況レイヤー" type="checkbox" checked={settings.overlay} disabled={busy} onChange={e=>setSettings(v=>({...v,overlay:e.target.checked}))}/>戦況レイヤー</label><small>敵の接近位置・突破口・公開情報の経路。敵の攻撃範囲や勝率ではありません。</small>{settings.overlay&&<p role="status">自軍本陣付近の敵 {approachingEnemies(state).length}枚 · 選択駒の合法地点 {new Set(state.interaction.legalTargets).size}か所</p>}{settingError&&<p role="status">{settingError}</p>}</details>
    {caption}
    <p className="next-action battlefield-next" role="status" aria-label="次の操作">{setup?(interaction.selectedSite?'② 金枠の入れ替え先を選ぶ → 軍議操作で陣形保存・配置確定':'① 自軍駒を選ぶ → ② 入れ替える → ③ 陣形保存・配置確定'):replay?'見どころで場面を選ぶ → 再生 → 速度を変更。操作は下の軍議操作へ。':state.finished?'対局終了。結果を確認し、新しい対局・戦史再現・保存へ。':busy?'移動・戦闘を表示中。完了するまでお待ちください。':state.playerTurn!==state.viewer?'CPUの手番。応手をお待ちください。':interaction.pendingSite?interaction.laneCandidates.length>1&&!interaction.selectedLane?'③ C列／D列を選ぶ → 再タップまたは「確定して実行」':'③ 移動先を再タップ、または「確定して実行」':interaction.selectedSite?'② 金枠の移動先を選ぶ':'あなたの手番 · ① 自軍駒を選ぶ'}{setup&&<button className="secondary" onClick={()=>host.current?.parentElement?.querySelector('.formation-library')?.scrollIntoView({block:'start',behavior:'instant'})}>陣形保存・読込へ</button>}</p>
    <div className="battlefield-stage" ref={host} aria-label="現在の戦場">
      <div className="battlefield-hq" aria-label="本陣の所属と駒">{([state.viewer, state.viewer === 1 ? 2 : 1] as const).map(owner => {
        const own = owner === state.viewer, site = `HQ-P${owner}`;
        const piece = state.pieces.find(p => p.position === site);
        return <span key={owner} className={own ? 'own-hq' : 'enemy-hq'}><strong>{own ? '自軍本陣' : '敵軍本陣'}</strong><small>{site} · {piece ? `${piece.owner === state.viewer ? '自軍' : '敵軍'} ${piece.unknown ? '不明駒' : PIECES[piece.type].label}` : '空き'}</small></span>;
      })}</div>
      {!setup && <p className="battlefield-last" aria-label="直前の手"><strong>{replay ? '再現中の手' : state.finished ? '最後の手' : '直前の手'}</strong><span>{lastText}</span><small>発 → 着{state.battleSite ? ' · 着地点で戦闘' : ''}</small></p>}
      {state.cinematic?.ending&&<div className="cinema-summary" role="status" aria-label="戦史映画の結末"><small>終章 · 正式棋譜の結末</small><strong>{outcome==='victory'?'自軍の勝利':outcome==='defeat'?'CPUの勝利':'引き分け'}</strong><span>{lastText}</span></div>}
      {state.finished && endgame && outcome === 'victory' && <VictoryCelebration quality={quality} fresh={endgame?.fresh}/>}
      {state.finished && endgame && <div ref={resultPanel} className={'result battlefield-result result-'+outcome} role="status" aria-label="対局結果"><span className="result-crest" aria-hidden="true">{outcome === 'victory' ? '★ 勝鬨 ★' : outcome === 'defeat' ? '◆ 戦いの終わり' : '◇ 両軍健闘'}</span><small>対局終了 · 全駒公開</small><strong>{endgame.label}</strong><p>終局理由：{endgame.reason}</p><p className="endgame-last">最後の手：{lastText}</p><div className="actions">{endgame.onNew && <button className="primary" onClick={endgame.onNew}>新しい対局</button>}{endgame.onReplay && <button onClick={endgame.onReplay}>戦史再現</button>}{endgame.onSave && <button onClick={endgame.onSave}>結果を保存</button>}</div></div>}
      {status !== 'ready' && <p className="battlefield-status" role={status === 'error' ? 'alert' : 'status'}>{status === 'error' ? '三次元表示を利用できません。二次元盤面で続けられます。' : '戦場を読み込んでいます…'}</p>}
    </div>
    <div className="battlefield-guide"><span>{setup ? '2枚をタップ／駒をドラッグして交換' : replay ? '発 → 着の軌跡と解説で追体験 · 見どころから移動できます' : state.finished ? '最後の手を確認し、戦史再現や保存へ' : '駒→移動先→再タップで確定／ドラッグで着手'}</span><span>視点は上のボタンで変更 · 回転・拡大の誤操作なし</span></div>
    <details className="battlefield-key"><summary>駒の見分け方</summary><p><span className="rank-key generals">⬡ 金＝将官・兜と外套</span><span className="rank-key colonels">● 銀＝佐官・肩章</span><span className="rank-key officers">■ 水色＝尉官・軽装と銃</span> · 各群の印は強い順に3・2・1。敵の不明駒は共通外見です。</p><PieceLegend/></details>
    {interaction.laneCandidates.length > 1 && <div className="battlefield-lanes" aria-label="三次元の使用列">{interaction.laneCandidates.map(lane => <button key={lane} aria-pressed={interaction.selectedLane === lane} disabled={!interaction.interactionEnabled} onClick={() => onLaneSelect(lane)}>三次元 {lane}列</button>)}</div>}
    <p className="battlefield-selection" role="status">{setup ? interaction.selectedSite ? `${name} ${interaction.selectedSite}・金枠が交換先` : '自軍23枚のみ表示・CPU配置は非表示' : replay ? '鑑賞専用・着手と保存状態は変更されません' : state.finished ? '終局・全駒公開' : busy ? '移動・戦闘を表示中・操作は少しお待ちください' : !interaction.interactionEnabled ? 'CPUの手番' : interaction.pendingSite ? `${name} ${interaction.selectedSite} → ${interaction.pendingSite}・確定待ち` + (interaction.laneCandidates.length > 1 && !interaction.selectedLane ? '・使用列を選択' : `${interaction.selectedLane ? `・${interaction.selectedLane}列` : ''}・再タップで実行`) : interaction.selectedSite ? `${name} ${interaction.selectedSite}・移動可能 ${new Set(interaction.legalTargets).size}地点` : '青＝自軍 / 赤＝敵軍 · 金枠＋移＝合法移動先'}</p>
    {commands}
    {(replay||state.finished)&&<div className="battlefield-capture actions"><button disabled={status!=='ready'||captureBusy} onClick={()=>void saveScene()}>名場面を保存</button><button disabled={status!=='ready'||captureBusy} onClick={()=>void saveScene(true)}>名場面を共有</button>{captureNotice&&<span role="status">{captureNotice}</span>}</div>}
    <ul className="battlefield-sr" aria-label="三次元表示中の駒">{state.pieces.map(piece => <li key={piece.position}>{piece.position} {piece.owner === state.viewer ? '自軍' : '敵軍'} {piece.unknown ? '不明' : PIECES[piece.type].label}</li>)}</ul>
  </section>;
}
