import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PIECES } from '../game/pieces';
import type { BattlefieldViewState } from './state';
import type { BattlefieldRenderer } from './renderer';
import './battlefield.css';

const unavailable = 'この環境では三次元戦場ビューを表示できません。二次元盤面でゲームを続けられます。';

function BattlefieldDialog({ state, onClose }: { state: BattlefieldViewState; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<BattlefieldRenderer | null>(null);
  const current = useRef(state);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  current.current = state;
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    let cancelled = false;
    function fail() {
      renderer.current?.dispose(); renderer.current = null;
      if (!cancelled) setStatus('error');
    }
    void import('./renderer').then(({ createBattlefield }) => {
      if (cancelled) return;
      renderer.current = createBattlefield(host.current!, current.current, fail);
      setStatus('ready');
    }).catch(fail);
    return () => {
      cancelled = true;
      renderer.current?.dispose(); renderer.current = null;
      element.close(); document.body.style.overflow = overflow;
    };
  }, []);
  useEffect(() => { renderer.current?.update(state); }, [state]);
  return createPortal(<dialog ref={dialog} className="battlefield-dialog" aria-labelledby="battlefield-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="battlefield-header"><div><p className="battlefield-kicker">BATTLEFIELD / 閲覧専用</p><h2 id="battlefield-title">三次元戦場ビュー</h2></div><button autoFocus onClick={onClose}>二次元盤面へ戻る</button></header>
    <p className="battlefield-intro">現在局面を立体表示しています。着手は二次元盤面で行います。</p>
    <div className="battlefield-stage" ref={host} aria-label="現在の戦場">
      {status !== 'ready' && <p className="battlefield-status" role={status === 'error' ? 'alert' : 'status'}>{status === 'error' ? unavailable : '戦場を読み込んでいます…'}</p>}
    </div>
    <footer className="battlefield-footer"><div><strong>{state.moveCount}手目 · {state.finished ? '終局・全駒公開' : '青＝自軍 / 赤＝敵軍'}</strong><span>ドラッグで回転 · ホイール／2本指で拡大縮小</span></div><button disabled={status !== 'ready'} onClick={() => renderer.current?.reset()}>視点を戻す</button></footer>
    <ul className="battlefield-sr" aria-label="三次元表示中の駒">{state.pieces.map(piece => <li key={piece.position}>{piece.position} {piece.owner === state.viewer ? '自軍' : '敵軍'} {piece.unknown ? '不明' : PIECES[piece.type].label}</li>)}</ul>
  </dialog>, document.body);
}

export function BattlefieldView({ state }: { state: BattlefieldViewState }) {
  const [open, setOpen] = useState(false);
  return <><button className="battlefield-launch secondary" onClick={() => setOpen(true)}>戦場ビュー</button>{open && <BattlefieldDialog state={state} onClose={() => setOpen(false)} />}</>;
}
