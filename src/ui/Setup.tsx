import { useState } from 'react';
import { defaultPlacement } from '../dev/fixtures';
import { localDraftStore, type DraftStore } from '../dev/storage';
import { startGame } from '../game/game';
import { validatePlacement } from '../game/placement';
import type { GameState, Piece, Player, Site } from '../game/types';
import { Board } from './Board';

export function Setup({ onStart, store = localDraftStore }: { onStart(game: GameState): void; store?: DraftStore }) {
  const [drafts, setDrafts] = useState<Record<Player, Piece[]>>(() => ({ 1: store.load(1) ?? defaultPlacement(1), 2: store.load(2) ?? defaultPlacement(2) }));
  const [side, setSide] = useState<Player>(1);
  const [first, setFirst] = useState<Player>(1);
  const [ready, setReady] = useState<Record<Player, boolean>>({ 1: false, 2: false });
  const [selected, setSelected] = useState<Site | null>(null);
  const [notice, setNotice] = useState('2枚の駒を順にタップすると配置を交換できます。');
  function select(site: Site) {
    if (ready[side] || !drafts[side].some(p => p.position === site)) return;
    if (!selected || selected === site) { setSelected(selected === site ? null : site); return; }
    const updated = drafts[side].map(p => ({ ...p, position: p.position === selected ? site : p.position === site ? selected : p.position }));
    try {
      validatePlacement(updated, side);
      setDrafts({ ...drafts, [side]: updated });
      setNotice(store.save(side, updated) ? '開発用の配置をこのブラウザに自動保存しました。' : '一時保存できません。この画面内では配置を保持しています。');
    } catch { setNotice('交換できません。地雷・軍旗は突破口入口不可、軍旗は最後列不可です。'); }
    setSelected(null);
  }
  function confirm() {
    validatePlacement(drafts[side], side);
    const updated = { ...ready, [side]: true };
    setReady(updated); setSelected(null);
    if (updated[1] && updated[2]) onStart(startGame(drafts[1], drafts[2], first));
    else setNotice(`P${side}の配置を確定しました。もう一方の配置を確認してください。`);
  }
  return <section>
    <div className="section-heading"><div><p className="eyebrow">01 / SETUP</p><h2>陣形を整える</h2></div><span className="badge">各23枚</span></div>
    <div className="toolbar"><label>配置する側 <select aria-label="配置する側" value={side} onChange={e => { setSide(Number(e.target.value) as Player); setSelected(null); }}><option value="1">P1 あなた</option><option value="2">P2 対戦相手</option></select></label>
      <label>検証用の先手 <select aria-label="検証用の先手" value={first} onChange={e => setFirst(Number(e.target.value) as Player)}><option value="1">P1</option><option value="2">P2</option></select></label></div>
    <p className="muted">正式対局の先手は、双方の配置確定後にサーバーが抽選します。</p>
    <Board pieces={drafts[side]} perspective={side} selected={selected} onSelect={select} />
    <p role="status" className="notice">{notice}</p>
    <div className="status-line"><span>P1：{ready[1] ? '確定済み' : '編集中'}</span><span>P2：{ready[2] ? '確定済み' : '編集中'}</span></div>
    {ready[side] ? <button className="secondary wide" onClick={() => { setReady({ ...ready, [side]: false }); setNotice('確定を解除しました。再編集できます。'); }}>確定を解除して編集</button> : <button className="primary wide" onClick={confirm}>この配置で確定</button>}
    <p className="muted">配置の交換を自動保存します。保存対象は開発用の配置だけです。対局の進行・確定状態は再読込でリセットされます。</p>
  </section>;
}
