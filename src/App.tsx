import { useState } from 'react';
import type { Difficulty } from './cpu/strategy';
import { scenario } from './dev/fixtures';
import type { GameState } from './game/types';
import { CpuSetup } from './ui/CpuSetup';
import { LocalGame } from './ui/LocalGame';
import { Setup } from './ui/Setup';

type Screen = 'home' | 'list' | 'new' | 'local' | 'cpu-select' | 'cpu-setup' | 'cpu-game';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [game, setGame] = useState<GameState | null>(null);
  const [cpuGame, setCpuGame] = useState<GameState | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [cpuSeed, setCpuSeed] = useState(0);
  const [revision, setRevision] = useState(0);

  function demo(kind: 'aircraft' | 'capture') {
    setGame(scenario(kind));
    setRevision(value => value + 1);
  }

  function newCpuGame(level: Difficulty) {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    setCpuSeed(value[0]);
    setDifficulty(level);
    setCpuGame(null);
    setScreen('cpu-setup');
    setRevision(current => current + 1);
  }

  return <div className="app-shell">
    <header><button className="brand" onClick={() => setScreen('home')}><span className="brand-mark">将</span><span>軍人将棋<small>MILITARY CHESS</small></span></button><span className="version">CPU / v0.1</span></header>
    <main>
      {screen === 'home' ? <>
        <section className="hero"><p className="eyebrow">一手を、じっくり。</p><h1>見えない陣形を、<br />読み解く。</h1><p>日本の軍人将棋を基礎にした戦略ゲーム。<br />CPUを相手に、自分のペースで一手ずつ。</p><button className="primary" onClick={() => setScreen('cpu-select')}>CPUと対戦 <span aria-hidden="true">→</span></button>{cpuGame && <button className="secondary continue-button" onClick={() => setScreen('cpu-game')}>このタブの対局へ戻る</button>}</section>
        <div className="feature-strip"><div><strong>23</strong><span>枚の駒 / 陣営</span></div><div><strong>2</strong><span>つの突破口</span></div><div><strong>∞</strong><span>手番期限なし</span></div></div>
        <section className="future"><p className="eyebrow">DEVELOPMENT</p><h2>盤面とルールを確かめる。</h2><p>全駒を見ながら検証するための開発用画面です。</p><button className="secondary" onClick={() => setScreen('local')}>開発用ローカル対局を開く</button></section>
        <section className="future"><p className="eyebrow">ONLINE — 将来拡張</p><h2>離れていても、同じ盤面で。</h2><p>オンライン対人戦、ログイン、招待は将来の拡張です。</p><div className="actions"><button className="secondary" onClick={() => setScreen('list')}>対局一覧</button><button className="secondary" onClick={() => setScreen('new')}>新しい対局</button></div></section>
      </> : screen === 'cpu-select' ? <section className="placeholder"><p className="eyebrow">CPU MATCH / 01</p><h1>難易度を選ぶ</h1><p>あなたはPlayer 1。CPUはPlayer 2です。どちらが先手かは配置確定後に決まります。</p><div className="difficulty-grid"><button className="choice-card" onClick={() => newCpuGame('easy')}><strong>かんたん</strong><span>合法な手から選びます</span></button><button className="choice-card" onClick={() => newCpuGame('normal')}><strong>ふつう</strong><span>公開情報から局面を評価します</span></button></div></section>
      : screen === 'cpu-setup' ? <><div className="cpu-banner"><strong>CPUと対戦</strong><p>あなたの駒だけを確認して配置します。CPUの駒種類は対局中、盤面に表示しません。</p></div><CpuSetup key={revision} difficulty={difficulty} seed={cpuSeed} onStart={started => { setCpuGame(started); setScreen('cpu-game'); }} /></>
      : screen === 'cpu-game' && cpuGame ? <><div className="cpu-banner"><strong>対CPU戦・{difficulty === 'easy' ? 'かんたん' : 'ふつう'}</strong><p>相手の駒種類は対局中は不明です。対局の自動保存・再読込後の続行は次段階で実装します。</p></div><LocalGame initial={cpuGame} onChange={setCpuGame} mode="cpu" difficulty={difficulty} cpuSeed={cpuSeed} /></>
      : screen === 'local' ? <>
        <div className="dev-banner"><strong>開発用ローカル対局</strong><p>全駒の種類を表示する検証画面です。実際のオンライン対戦や秘密情報保護には対応していません。</p></div>
        {game ? <LocalGame key={revision} initial={game} onChange={setGame} /> : <Setup onStart={started => { setGame(started); setRevision(value => value + 1); }} />}
        <details className="debug-tools"><summary>検証用の盤面を開く</summary><p>少数の架空駒で動作を確かめます。現在のローカル対局は置き換わります。</p><div className="actions"><button className="secondary" onClick={() => demo('aircraft')}>飛行機のC/D経路</button><button className="secondary" onClick={() => demo('capture')}>司令部占領</button><button className="secondary" onClick={() => { setGame(null); setRevision(value => value + 1); }}>初期配置へ戻る</button></div></details>
      </> : <section className="placeholder"><p className="eyebrow">ONLINE — 将来拡張</p><h1>{screen === 'list' ? '対局一覧' : '新しい対局'}</h1><p>オンライン対局・ログイン・招待は将来の拡張です。初回公開は対CPU戦を目標にします。</p><button className="primary" onClick={() => setScreen('cpu-select')}>CPUと対戦</button></section>}
    </main>
    <footer><a href="https://github.com/diceK9750/military-chess-online/blob/main/docs/GAME_RULES.md" target="_blank" rel="noreferrer">正式ゲームルール ↗</a><span>第3段階 / 対CPU初期実装</span></footer>
  </div>;
}
