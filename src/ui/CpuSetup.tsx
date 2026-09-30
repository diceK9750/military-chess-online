import { useMemo, useState } from 'react';
import { BattlefieldView } from '../battlefield3d/BattlefieldView';
import { toSetupBattlefieldView } from '../battlefield3d/state';
import { generateCpuPlacement } from '../cpu/placement';
import type { Difficulty } from '../cpu/strategy';
import { cpuDraftStore, type DraftStore } from '../dev/storage';
import { FORMATION_TEMPLATES, generateFormationPlacement, materializeFormation } from '../formation/templates';
import { territory } from '../game/board';
import { startGame } from '../game/game';
import { validatePlacement } from '../game/placement';
import { PIECES, PIECE_TYPES } from '../game/pieces';
import { RuleError, type GameState, type Piece, type Site } from '../game/types';
import { Board } from './Board';
import { PieceFace } from './PieceFace';
import { RuleReference } from './RuleReference';

function exchange(pieces: readonly Piece[], from: Site, to: Site): Piece[] {
  return pieces.map(piece => ({ ...piece, position: piece.position === from ? to : piece.position === to ? from : piece.position }));
}

function placementError(error: unknown): string {
  if (error instanceof RuleError) {
    if (error.code === 'FORBIDDEN_ENTRANCE') return '地雷・軍旗は自軍の突破口入口（B4・E4）に置けません。';
    if (error.code === 'FLAG_LAST_ROW') return '軍旗は最後列（司令部を含む）に置けません。';
    if (error.code === 'PIECE_COUNT' || error.code === 'INVENTORY') return '23枚すべてを正しい枚数で配置してください。';
  }
  return 'この地点には配置できません。';
}

export function CpuSetup({ difficulty, seed, onStart, store = cpuDraftStore, initialPieces, onPlacementChange }: {
  difficulty: Difficulty;
  seed: number;
  onStart(game: GameState): void;
  store?: DraftStore;
  initialPieces?: readonly Piece[];
  onPlacementChange?(pieces: readonly Piece[]): boolean | void;
}) {
  const [pieces, setPieces] = useState<Piece[]>(() => initialPieces ? initialPieces.map(piece => ({ ...piece })) : store.load(1) ?? generateFormationPlacement(1, seed, 'human'));
  const [selected, setSelected] = useState<Site | null>(null);
  const [fallback, setFallback] = useState(false);
  const [formation, setFormation] = useState('');
  const [notice, setNotice] = useState('駒を選び、入れ替える地点を選んでください。');
  const selectedPiece = pieces.find(piece => piece.position === selected);
  const targets = useMemo(() => selected === null ? [] : territory(1).filter(site => {
    if (site === selected) return false;
    try { validatePlacement(exchange(pieces, selected, site), 1); return true; }
    catch { return false; }
  }), [pieces, selected]);
  const battlefield = useMemo(() => toSetupBattlefieldView(pieces, selected, targets), [pieces, selected, targets]);
  const placed = pieces.filter(piece => piece.position !== null).length;
  let valid = false;
  try { validatePlacement(pieces, 1); valid = true; } catch { /* Explain on confirmation below. */ }

  function select(site: Site) {
    if (!territory(1).includes(site)) return;
    if (selected === site) { setSelected(null); setNotice('選択を解除しました。'); return; }
    if (selected === null) {
      if (pieces.some(piece => piece.position === site)) { setSelected(site); setNotice(`${site} の駒を選びました。枠の付いた地点を選ぶと入れ替わります。`); }
      return;
    }
    swap(selected, site);
  }

  function swap(from: Site, to: Site) {
    if (from === to || !territory(1).includes(from) || !territory(1).includes(to)) return;
    const next = exchange(pieces, from, to);
    try {
      validatePlacement(next, 1);
      setPieces(next);
      setFormation('');
      const savedSetup = onPlacementChange?.(next);
      const savedDraft = store.save(1, next);
      setNotice(savedSetup !== false && savedDraft ? `${from} と ${to} を入れ替え、ブラウザへ保存しました。` : '配置は変更しましたが、ブラウザへ保存できませんでした。');
      setSelected(null);
    } catch (error) { setNotice(placementError(error)); }
  }

  function changeFormation(id: string) {
    const template = FORMATION_TEMPLATES.find(candidate => candidate.id === id);
    if (!template) return;
    const next = materializeFormation(template, 1, 'human');
    validatePlacement(next, 1);
    setPieces(next); setSelected(null); setFormation(id);
    const savedSetup = onPlacementChange?.(next);
    const savedDraft = store.save(1, next);
    setNotice(savedSetup !== false && savedDraft ? '陣形を変更し、ブラウザへ保存しました。' : '陣形は変更しましたが、ブラウザへ保存できませんでした。');
  }

  function confirm() {
    try { validatePlacement(pieces, 1); }
    catch (error) { setNotice(placementError(error)); return; }
    const cpuPieces = generateCpuPlacement(2, seed);
    onStart(startGame(pieces, cpuPieces, seed % 2 === 0 ? 1 : 2));
  }

  return <section className={'setup-screen setup-screen--3d' + (fallback ? ' has-fallback' : '')}><div className="triple-layout setup-layout">
    <RuleReference side="left" placement />
    <div className="setup-main">
    <div className="section-heading"><div><p className="eyebrow">01 / 初期配置</p><h2>あなたの陣形</h2></div><span className="badge">{placed} / 23枚配置済み</span></div>
    <p className="muted">難易度：{difficulty === 'easy' ? 'かんたん' : 'ふつう'}。23地点は最初から埋まっています。駒を2枚選ぶと配置を交換できます。</p>
    <p className="setup-progress" role="status">{valid ? '✓ 配置完了。この配置で対局を始められます。' : `配置中：${placed} / 23枚`}</p>
    <label className="formation-control">陣形を変更 <select aria-label="陣形を変更" value={formation} onChange={event => changeFormation(event.target.value)}><option value="">現在の配置</option>{FORMATION_TEMPLATES.map(template => <option key={template.id} value={template.id}>{{ balanced: '攻守分担', rush: '速攻', defense: '守備重視', 'flag-guard': '軍旗防御' }[template.category]} {template.id.endsWith('-left') ? '左' : '右'}</option>)}</select></label>
    <BattlefieldView state={battlefield} onSiteSelect={select} onLaneSelect={() => {}} onDragStart={site => { setSelected(site); setNotice('金枠へドラッグして交換できます。'); }} onPieceDrop={(from, to) => {
      swap(from, to);
    }} onUnavailable={() => setFallback(true)} />
    {fallback && <><p className="board-guide">下があなた側。B列・E列の境界が突破口です。</p><Board pieces={pieces} perspective={1} selected={selected} targets={targets} humanSide={1} onSelect={select} /><div className="board-legend" aria-label="盤面の記号"><span>太枠＝選択中</span><span>金枠＝交換可能</span><span>HQ＝司令部</span></div></>}
    {selectedPiece && <div className="selection-panel"><strong>選択中：{PIECES[selectedPiece.type].label}（{selected}）・交換可能 {targets.length}地点</strong><button className="secondary" onClick={() => { setSelected(null); setNotice('選択を解除しました。'); }}>選択を解除</button></div>}
    <p className="notice" role="status">{notice}</p>
    <details className="inventory"><summary>自軍の駒一覧・枚数を見る</summary><p>23枚はすべて盤面に配置済みです。駒の名前から選ぶこともできます。</p><div className="inventory-grid">{PIECE_TYPES.map(type => {
      const group = pieces.filter(piece => piece.type === type);
      return <div key={type} className="inventory-type"><PieceFace type={type} /><strong>{group.filter(piece => piece.position).length}/{PIECES[type].count}枚</strong><span>残り {PIECES[type].count - group.filter(piece => piece.position).length}枚</span><div>{group.map(piece => <button key={piece.id} className="secondary" aria-pressed={selected === piece.position} onClick={() => piece.position && select(piece.position)}>{piece.position ?? '未配置'}</button>)}</div></div>;
    })}</div></details>
    <button className="primary wide" disabled={!valid} onClick={confirm}>この配置で確定</button>
    <p className="muted setup-footnote">配置は自動保存され、「続きから」再開できます。</p>
    </div>
    <RuleReference side="right" />
  </div></section>;
}
