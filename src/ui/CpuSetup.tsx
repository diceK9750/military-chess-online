import { useState } from 'react';
import { generateCpuPlacement } from '../cpu/placement';
import type { Difficulty } from '../cpu/strategy';
import { cpuDraftStore, type DraftStore } from '../dev/storage';
import { defaultPlacement } from '../dev/fixtures';
import { startGame } from '../game/game';
import { validatePlacement } from '../game/placement';
import type { GameState, Piece, Site } from '../game/types';
import { Board } from './Board';

export function CpuSetup({ difficulty, seed, onStart, store = cpuDraftStore }: {
  difficulty: Difficulty;
  seed: number;
  onStart(game: GameState): void;
  store?: DraftStore;
}) {
  const [pieces, setPieces] = useState<Piece[]>(() => store.load(1) ?? defaultPlacement(1));
  const [selected, setSelected] = useState<Site | null>(null);
  const [notice, setNotice] = useState('2枚の駒を順にタップすると配置を交換できます。');

  function select(site: Site) {
    if (!pieces.some(piece => piece.position === site)) return;
    if (selected === null || selected === site) { setSelected(selected === site ? null : site); return; }
    const next = pieces.map(piece => ({ ...piece, position: piece.position === selected ? site : piece.position === site ? selected : piece.position }));
    try {
      validatePlacement(next, 1);
      setPieces(next);
      setNotice(store.save(1, next) ? '配置をこのブラウザへ保存しました。' : '保存できません。この画面内では配置を保持しています。');
    } catch { setNotice('交換できません。地雷・軍旗は突破口入口不可、軍旗は最後列不可です。'); }
    setSelected(null);
  }

  function confirm() {
    validatePlacement(pieces, 1);
    const cpuPieces = generateCpuPlacement(2, seed);
    // The random choice belongs to the local match controller, not the rules engine.
    onStart(startGame(pieces, cpuPieces, seed % 2 === 0 ? 1 : 2));
  }

  return <section>
    <div className="section-heading"><div><p className="eyebrow">01 / CPU SETUP</p><h2>あなたの陣形</h2></div><span className="badge">23枚</span></div>
    <p className="muted">難易度：{difficulty === 'easy' ? 'かんたん' : 'ふつう'}。CPUの配置は確定後に自動生成し、先手もランダムに決まります。</p>
    <Board pieces={pieces} perspective={1} selected={selected} onSelect={select} />
    <p className="notice" role="status">{notice}</p>
    <button className="primary wide" onClick={confirm}>この配置で確定</button>
    <p className="muted">配置の交換だけをこの端末へ一時保存します。対局の自動保存と再読込後の続行は次段階で実装します。</p>
  </section>;
}
