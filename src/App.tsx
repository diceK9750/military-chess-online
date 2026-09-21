import { useState } from 'react';
import { scenario } from './dev/fixtures';
import type { GameState } from './game/types';
import { LocalGame } from './ui/LocalGame';
import { Setup } from './ui/Setup';

export default function App() {
  const [screen, setScreen] = useState<'home' | 'list' | 'new' | 'local'>('home');
  const [game, setGame] = useState<GameState | null>(null);
  const [revision, setRevision] = useState(0);
  function demo(kind: 'aircraft' | 'capture') { setGame(scenario(kind)); setRevision(r => r + 1); }
  return <div className="app-shell">
    <header><button className="brand" onClick={() => setScreen('home')}><span className="brand-mark">将</span><span>軍人将棋<small>MILITARY CHESS</small></span></button><span className="version">LOCAL / v0.1</span></header>
    <main>
      {screen === 'home' ? <>
        <section className="hero"><p className="eyebrow">一手を、じっくり。</p><h1>見えない陣形を、<br />読み解く。</h1><p>日本の軍人将棋を基礎にした戦略ゲーム。<br />まずはローカル盤面で、駒の動きを確かめましょう。</p><button className="primary" onClick={() => setScreen('local')}>開発用ローカル対局を開く <span aria-hidden="true">→</span></button></section>
        <div className="feature-strip"><div><strong>23</strong><span>枚の駒 / 陣営</span></div><div><strong>2</strong><span>つの突破口</span></div><div><strong>∞</strong><span>手番期限なし</span></div></div>
        <section className="future"><p className="eyebrow">ONLINE — 準備中</p><h2>離れていても、同じ盤面で。</h2><p>将来は招待した相手と、好きなタイミングで一手ずつ。オンライン機能はまだ利用できません。</p><div className="actions"><button className="secondary" onClick={() => setScreen('list')}>対局一覧</button><button className="secondary" onClick={() => setScreen('new')}>新しい対局</button></div></section>
      </> : screen === 'local' ? <>
        <div className="dev-banner"><strong>開発用ローカル対局</strong><p>全駒の種類を表示する検証画面です。実際のオンライン対戦や秘密情報保護には対応していません。</p></div>
        {game ? <LocalGame key={revision} initial={game} onChange={setGame} /> : <Setup onStart={g => { setGame(g); setRevision(r => r + 1); }} />}
        <details className="debug-tools"><summary>検証用の盤面を開く</summary><p>少数の架空駒で動作を確かめます。現在のローカル対局は置き換わります。</p><div className="actions"><button className="secondary" onClick={() => demo('aircraft')}>飛行機のC/D経路</button><button className="secondary" onClick={() => demo('capture')}>司令部占領</button><button className="secondary" onClick={() => { setGame(null); setRevision(r => r + 1); }}>初期配置へ戻る</button></div></details>
      </> : <section className="placeholder"><p className="eyebrow">ONLINE — 準備中</p><h1>{screen === 'list' ? '対局一覧' : '新しい対局'}</h1><p>オンライン対局・ログイン・招待は今後の実装です。現在は開発用ローカル対局をご利用ください。</p><button className="primary" onClick={() => setScreen('local')}>ローカル対局を開く</button></section>}
    </main>
    <footer><a href="https://github.com/diceK9750/military-chess-online/blob/main/docs/GAME_RULES.md" target="_blank" rel="noreferrer">正式ゲームルール ↗</a><span>第1・第2段階 / ローカル検証版</span></footer>
  </div>;
}
