import { useCallback, useRef, useState } from 'react';
import type { Difficulty } from './cpu/strategy';
import { defaultPlacement, scenario } from './dev/fixtures';
import { cpuDraftStore } from './dev/storage';
import type { GameState, Piece } from './game/types';
import { advanceSavedMatch, advanceSavedSetup, clearSavedMatch, clearSavedSetup, createSavedMatch, createSavedSetup, loadSavedMatch, loadSavedSetup, storeSavedMatch, storeSavedSetup, type SavedCpuMatch, type SavedCpuSetup } from './save/match';
import { CpuSetup } from './ui/CpuSetup';
import { LocalGame } from './ui/LocalGame';
import { ExportPanel, ImportPanel } from './ui/SaveFilePanels';
import { Setup } from './ui/Setup';

type Screen = 'home' | 'list' | 'new' | 'local' | 'cpu-select' | 'cpu-setup' | 'cpu-game' | 'export' | 'import' | 'howto';

export default function App() {
  const [initialLoad] = useState(loadSavedMatch);
  const [initialSetupLoad] = useState(loadSavedSetup);
  const [screen, setScreen] = useState<Screen>('home');
  const [game, setGame] = useState<GameState | null>(null);
  const [match, setMatch] = useState<SavedCpuMatch | null>(initialLoad.kind === 'valid' ? initialLoad.match : null);
  const matchRef = useRef(match);
  const [setup, setSetup] = useState<SavedCpuSetup | null>(initialLoad.kind === 'valid' ? null : initialSetupLoad.kind === 'valid' ? initialSetupLoad.setup : null);
  const setupRef = useRef(setup);
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [cpuSeed, setCpuSeed] = useState(0);
  const [revision, setRevision] = useState(0);
  const [saveError, setSaveError] = useState(initialLoad.kind === 'invalid' || initialLoad.kind !== 'valid' && initialSetupLoad.kind === 'invalid' ? 'ブラウザ内の保存データを復元できません。新規対局またはファイル読み込みを選べます。' : '');
  const [pendingNew, setPendingNew] = useState(false);
  const [pendingImport, setPendingImport] = useState<SavedCpuMatch | null>(null);
  const [exportReturn, setExportReturn] = useState<'home' | 'cpu-game'>('home');

  function demo(kind: 'aircraft' | 'capture') {
    setGame(scenario(kind));
    setRevision(value => value + 1);
  }

  function activateMatch(next: SavedCpuMatch): boolean {
    if (!storeSavedMatch(next)) {
      setSaveError('ブラウザへ対局を保存できませんでした。容量や保存設定を確認してください。');
      return false;
    }
    matchRef.current = next;
    setMatch(next);
    setupRef.current = null; setSetup(null); clearSavedSetup();
    setSaveError('');
    setPendingImport(null);
    setPendingNew(false);
    setScreen('cpu-game');
    return true;
  }

  const commitCpuGame = useCallback((nextGame: GameState) => {
    const current = matchRef.current;
    if (!current) return;
    const next = advanceSavedMatch(current, nextGame);
    if (!storeSavedMatch(next)) setSaveError('最新の対局をブラウザへ保存できませんでした。対局ファイルへの保存をお勧めします。');
    else setSaveError('');
    matchRef.current = next;
    setMatch(next);
  }, []);

  function requestNewGame() {
    if ((matchRef.current && !matchRef.current.game.result) || setupRef.current) { setPendingNew(true); setScreen('home'); }
    else setScreen('cpu-select');
  }

  function newCpuGame(level: Difficulty) {
    if (!clearSavedMatch() || !clearSavedSetup()) { setSaveError('現在の保存データを置き換えられません。ブラウザの保存設定を確認してください。'); return; }
    matchRef.current = null; setMatch(null); setSaveError('');
    const random = new Uint32Array(1); crypto.getRandomValues(random);
    const nextSetup = createSavedSetup(cpuDraftStore.load(1) ?? defaultPlacement(1), level, random[0]);
    setupRef.current = nextSetup; setSetup(nextSetup);
    if (!storeSavedSetup(nextSetup)) setSaveError('初期配置をブラウザへ保存できませんでした。');
    setCpuSeed(random[0]); setDifficulty(level);
    setScreen('cpu-setup'); setRevision(current => current + 1);
  }

  function startCpuGame(started: GameState) {
    try { activateMatch(createSavedMatch(started, difficulty, cpuSeed, setupRef.current ?? undefined)); }
    catch { setSaveError('対局の開始状態を保存できませんでした。'); }
  }

  function commitSetup(pieces: readonly Piece[]) {
    const current = setupRef.current;
    if (!current) return;
    const next = advanceSavedSetup(current, pieces);
    if (!storeSavedSetup(next)) setSaveError('初期配置をブラウザへ保存できませんでした。');
    else setSaveError('');
    setupRef.current = next; setSetup(next);
  }

  function continueCpuGame() {
    if (matchRef.current) setScreen('cpu-game');
    else if (setupRef.current) { setDifficulty(setupRef.current.difficulty); setCpuSeed(setupRef.current.cpuSeed); setScreen('cpu-setup'); }
  }

  function openExport(from: 'home' | 'cpu-game') { setExportReturn(from); setScreen('export'); }
  function loadedFile(next: SavedCpuMatch) {
    setPendingNew(false);
    if (matchRef.current || setupRef.current) { setPendingImport(next); setScreen('home'); }
    else activateMatch(next);
  }

  return <div className="app-shell">
    <header><button className="brand" onClick={() => setScreen('home')}><span className="brand-mark">将</span><span>軍人将棋<small>MILITARY CHESS</small></span></button><span className="version">CPU / v0.1</span></header>
    <main>
      {saveError && <p role="alert" className="save-error">{saveError}</p>}
      {screen === 'home' ? <>
        <section className="hero"><p className="eyebrow">一手を、じっくり。</p><h1>見えない陣形を、<br />読み解く。</h1><p>日本の軍人将棋を基礎にした戦略ゲーム。<br />CPUを相手に、自分のペースで一手ずつ。</p>
          <button className="primary" onClick={requestNewGame}>CPUと対戦 <span aria-hidden="true">→</span></button>
          <div className="home-save-actions"><button className="secondary" disabled={!match && !setup} onClick={continueCpuGame}>続きから</button><button className="secondary" onClick={() => { setPendingNew(false); setScreen('import'); }}>保存した対局を読み込む</button><button className="secondary" onClick={() => setScreen('howto')}>遊び方</button></div>
          {match && <p className="save-summary">保存日時：{new Date(match.savedAt).toLocaleString('ja-JP')}／{match.game.result ? '終局済み' : match.game.turn === 1 ? 'あなたの手番' : 'CPUの手番'}／{match.difficulty === 'easy' ? 'かんたん' : 'ふつう'}</p>}
          {!match && setup && <p className="save-summary">配置中の対局／保存日時：{new Date(setup.savedAt).toLocaleString('ja-JP')}／{setup.difficulty === 'easy' ? 'かんたん' : 'ふつう'}</p>}
        </section>
        {pendingNew && <section className="save-confirm" role="dialog" aria-label="新しい対局の確認"><h2>現在の対局があります</h2><p>新しい対局を始めると、ブラウザ内の現在の対局または配置下書きは置き換わります。確定済みの対局は必要なら先にファイルへ保存してください。</p><div className="actions">{match && <button className="secondary" onClick={() => openExport('home')}>対局を保存</button>}<button className="primary" onClick={() => { setPendingNew(false); setScreen('cpu-select'); }}>新しい対局を開始</button><button className="secondary" onClick={() => setPendingNew(false)}>キャンセル</button></div></section>}
        {pendingImport && <section className="save-confirm" role="dialog" aria-label="読み込みの確認"><h2>現在の対局を置き換えますか？</h2><p>読み込んだ対局は検証済みです。置き換えるとブラウザ内の現在の対局は失われます。</p><div className="actions"><button className="primary" onClick={() => activateMatch(pendingImport)}>読み込んだ対局へ置き換える</button><button className="secondary" onClick={() => setPendingImport(null)}>キャンセル</button></div></section>}
        <div className="feature-strip"><div><strong>23</strong><span>枚の駒 / 陣営</span></div><div><strong>2</strong><span>つの突破口</span></div><div><strong>∞</strong><span>手番期限なし</span></div></div>
        <section className="future"><p className="eyebrow">DEVELOPMENT</p><h2>盤面とルールを確かめる。</h2><p>全駒を見ながら検証するための開発用画面です。</p><button className="secondary" onClick={() => setScreen('local')}>開発用ローカル対局を開く</button></section>
        <section className="future"><p className="eyebrow">ONLINE — 将来拡張</p><h2>離れていても、同じ盤面で。</h2><p>オンライン対人戦、ログイン、招待は将来の拡張です。</p><div className="actions"><button className="secondary" onClick={() => setScreen('list')}>対局一覧</button><button className="secondary" onClick={() => setScreen('new')}>新しい対局</button></div></section>
      </> : screen === 'cpu-select' ? <section className="placeholder"><p className="eyebrow">CPU MATCH / 01</p><h1>難易度を選ぶ</h1><p>あなたはPlayer 1。CPUはPlayer 2です。どちらが先手かは配置確定後に決まります。</p><div className="difficulty-grid"><button className="choice-card" onClick={() => newCpuGame('easy')}><strong>かんたん</strong><span>合法な手から選びます</span></button><button className="choice-card" onClick={() => newCpuGame('normal')}><strong>ふつう</strong><span>公開情報から局面を評価します</span></button></div><button className="secondary" onClick={() => setScreen('home')}>戻る</button></section>
      : screen === 'cpu-setup' ? <><div className="cpu-banner"><strong>CPUと対戦</strong><p>あなたの駒だけを確認して配置します。CPUの駒種類は対局中、盤面に表示しません。</p></div><CpuSetup key={revision} difficulty={difficulty} seed={cpuSeed} initialPieces={setup?.pieces} onPlacementChange={commitSetup} onStart={startCpuGame} /></>
      : screen === 'cpu-game' && match ? <><div className="cpu-banner"><strong>対CPU戦・{match.difficulty === 'easy' ? 'かんたん' : 'ふつう'}</strong><p>相手の駒種類は対局中は不明です。確定した着手ごとにブラウザへ自動保存します。</p></div><div className="save-toolbar"><button className="secondary" onClick={() => openExport('cpu-game')}>対局を保存</button><button className="secondary" onClick={() => setScreen('home')}>タイトルへ</button></div><LocalGame initial={match.game} onChange={commitCpuGame} mode="cpu" difficulty={match.difficulty} cpuSeed={match.cpuSeed} /></>
      : screen === 'export' && match ? <ExportPanel match={match} onClose={() => setScreen(exportReturn)} />
      : screen === 'import' ? <ImportPanel onLoaded={loadedFile} onClose={() => setScreen('home')} />
      : screen === 'howto' ? <section className="placeholder"><h1>遊び方</h1><p>23枚を自陣に配置し、1手ずつ駒を動かします。自軍駒を選び、移動先を選んで着手を確定してください。CPUの駒種類は対局中は不明です。</p><p>占領できる駒で敵司令部を占領するか、相手の占領可能駒をすべて除去すると勝利です。</p><a href="https://github.com/diceK9750/military-chess-online/blob/main/docs/GAME_RULES.md" target="_blank" rel="noreferrer">正式ゲームルール ↗</a><div><button className="secondary" onClick={() => setScreen('home')}>タイトルへ戻る</button></div></section>
      : screen === 'local' ? <><div className="dev-banner"><strong>開発用ローカル対局</strong><p>全駒の種類を表示する検証画面です。実際のオンライン対戦や秘密情報保護には対応していません。</p></div>{game ? <LocalGame key={revision} initial={game} onChange={setGame} /> : <Setup onStart={started => { setGame(started); setRevision(value => value + 1); }} />}<details className="debug-tools"><summary>検証用の盤面を開く</summary><p>少数の架空駒で動作を確かめます。現在のローカル対局は置き換わります。</p><div className="actions"><button className="secondary" onClick={() => demo('aircraft')}>飛行機のC/D経路</button><button className="secondary" onClick={() => demo('capture')}>司令部占領</button><button className="secondary" onClick={() => { setGame(null); setRevision(value => value + 1); }}>初期配置へ戻る</button></div></details></>
      : <section className="placeholder"><p className="eyebrow">ONLINE — 将来拡張</p><h1>{screen === 'list' ? '対局一覧' : '新しい対局'}</h1><p>オンライン対局・ログイン・招待は将来の拡張です。初回公開は対CPU戦を目標にします。</p><button className="primary" onClick={requestNewGame}>CPUと対戦</button></section>}
    </main>
    <footer><a href="https://github.com/diceK9750/military-chess-online/blob/main/docs/GAME_RULES.md" target="_blank" rel="noreferrer">正式ゲームルール ↗</a><span>第4段階 / ローカル保存</span></footer>
  </div>;
}
