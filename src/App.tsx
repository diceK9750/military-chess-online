import { useCallback, useEffect, useRef, useState } from 'react';
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
  const mainRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const importButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { mainRef.current?.focus(); }, [screen]);
  useEffect(() => { if (pendingNew || pendingImport) dialogRef.current?.focus(); }, [pendingNew, pendingImport]);
  function cancelNew() { setPendingNew(false); newButtonRef.current?.focus(); }
  function cancelImport() { setPendingImport(null); importButtonRef.current?.focus(); }

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
    if (matchRef.current || setupRef.current) { setPendingNew(true); setScreen('home'); }
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
    if (!current) return false;
    const next = advanceSavedSetup(current, pieces);
    const saved = storeSavedSetup(next);
    if (!saved) setSaveError('初期配置をブラウザへ保存できませんでした。');
    else setSaveError('');
    setupRef.current = next; setSetup(next);
    return saved;
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
    <header><button className="brand" onClick={() => setScreen('home')}><span className="brand-mark">将</span><span>軍人将棋<small>MILITARY CHESS</small></span></button><span className="version">ひとり用</span></header>
    <main ref={mainRef} tabIndex={-1}>
      {saveError && <p role="alert" className="save-error">{saveError}</p>}
      {screen === 'home' ? <>
        <section className="hero"><p className="eyebrow">一手を、じっくり。</p><h1>見えない陣形を、<br />読み解く。</h1><p>日本の軍人将棋を基礎にした戦略ゲーム。<br />CPUを相手に、自分のペースで一手ずつ。</p>
          <button ref={newButtonRef} className="primary home-primary" onClick={requestNewGame}>コンピューターと対戦 <span aria-hidden="true">→</span></button>
          <div className="home-save-actions"><button className="secondary" disabled={!match && !setup} onClick={continueCpuGame}>続きから</button><button ref={importButtonRef} className="secondary" onClick={() => { setPendingNew(false); setScreen('import'); }}>保存した対局を読み込む</button><button className="secondary" onClick={() => setScreen('howto')}>遊び方</button></div>
          {match && <p className="save-summary">保存日時：{new Date(match.savedAt).toLocaleString('ja-JP')}／{match.game.result ? '終局済み' : match.game.turn === 1 ? 'あなたの手番' : 'CPUの手番'}／{match.difficulty === 'easy' ? 'かんたん' : 'ふつう'}</p>}
          {!match && setup && <p className="save-summary">配置中の対局／保存日時：{new Date(setup.savedAt).toLocaleString('ja-JP')}／{setup.difficulty === 'easy' ? 'かんたん' : 'ふつう'}</p>}
        </section>
        {pendingNew && <section ref={dialogRef} tabIndex={-1} className="save-confirm" role="dialog" aria-label="新しい対局の確認" onKeyDown={event => { if (event.key === 'Escape') cancelNew(); }}><h2>現在の対局があります</h2><p>新しい対局を始めると、ブラウザ内の現在の対局または配置下書きは置き換わります。確定済みの対局は必要なら先にファイルへ保存してください。</p><div className="actions">{match && <button className="secondary" onClick={() => openExport('home')}>対局を保存</button>}<button className="primary" onClick={() => { setPendingNew(false); setScreen('cpu-select'); }}>新しい対局を開始</button><button className="secondary" onClick={cancelNew}>キャンセル</button></div></section>}
        {pendingImport && <section ref={dialogRef} tabIndex={-1} className="save-confirm" role="dialog" aria-label="読み込みの確認" onKeyDown={event => { if (event.key === 'Escape') cancelImport(); }}><h2>現在の対局を置き換えますか？</h2><p>読み込んだ対局は検証済みです。置き換えるとブラウザ内の現在の対局は失われます。</p><div className="actions"><button className="primary" onClick={() => activateMatch(pendingImport)}>読み込んだ対局へ置き換える</button><button className="secondary" onClick={cancelImport}>キャンセル</button></div></section>}
        <div className="feature-strip"><div><strong>23</strong><span>枚の駒 / 陣営</span></div><div><strong>2</strong><span>つの突破口</span></div><div><strong>∞</strong><span>手番期限なし</span></div></div>
        <details className="dev-entry"><summary>開発用・将来の機能</summary><section className="future"><h2>開発用の盤面検証</h2><p>全駒の種類が見える開発用画面です。</p><button className="secondary" onClick={() => setScreen('local')}>開発用ローカル対局を開く</button></section><section className="future"><h2>オンライン対人戦（将来拡張）</h2><p>ログインと招待を使う対人戦は今後の開発対象です。</p><div className="actions"><button className="secondary" onClick={() => setScreen('list')}>対局一覧</button><button className="secondary" onClick={() => setScreen('new')}>新しい対局</button></div></section></details>
      </> : screen === 'cpu-select' ? <section className="placeholder"><p className="eyebrow">対CPU戦 / 01</p><h1>難易度を選ぶ</h1><p>あなたの23枚を配置した後、先手を決めて対局を始めます。</p><div className="difficulty-grid"><button className="choice-card" onClick={() => newCpuGame('easy')}><strong>かんたん</strong><span>初めて遊ぶ人向け。合法な手から比較的ランダムに選びます。</span></button><button className="choice-card" onClick={() => newCpuGame('normal')}><strong>ふつう</strong><span>公開情報を使って、有利な手を考えます。</span></button></div><button className="secondary" onClick={() => setScreen('home')}>戻る</button></section>
      : screen === 'cpu-setup' ? <><div className="cpu-banner"><strong>CPUと対戦</strong><p>あなたの駒だけを確認して配置します。CPUの駒種類は対局中、盤面に表示しません。</p></div><CpuSetup key={revision} difficulty={difficulty} seed={cpuSeed} initialPieces={setup?.pieces} onPlacementChange={commitSetup} onStart={startCpuGame} /></>
      : screen === 'cpu-game' && match ? <><div className="cpu-banner"><strong>対コンピューター・{match.difficulty === 'easy' ? 'かんたん' : 'ふつう'}</strong><p>相手の駒種類は対局中は不明です。確定した着手ごとにブラウザへ自動保存します。</p></div><div className="save-toolbar"><button className="secondary" onClick={() => openExport('cpu-game')}>対局を保存</button><button className="secondary" onClick={() => setScreen('home')}>タイトルへ</button></div><LocalGame initial={match.game} onChange={commitCpuGame} mode="cpu" difficulty={match.difficulty} cpuSeed={match.cpuSeed} initialPlacements={match.initialPlacements} onNewGame={requestNewGame} /></>
      : screen === 'export' && match ? <ExportPanel match={match} onClose={() => setScreen(exportReturn)} />
      : screen === 'import' ? <ImportPanel onLoaded={loadedFile} onClose={() => setScreen('home')} />
      : screen === 'howto' ? <section className="placeholder howto"><h1>遊び方</h1><ol><li><strong>23枚を配置</strong><p>自軍の駒を2枚選ぶと場所を交換できます。地雷・軍旗は突破口入口へ、軍旗は最後列へ置けません。</p></li><li><strong>1手ずつ動かす</strong><p>自分の駒を選び、金枠の移動先を押します。内容を確認してから実行します。</p></li><li><strong>敵の正体を推理</strong><p>対局中、敵の駒種類は見えません。ぶつかった時の戦闘は自動で判定します。</p></li><li><strong>勝利を目指す</strong><p>大将から少佐までの駒で敵司令部を占領するか、敵の占領可能な駒をすべて除去すると勝利です。</p></li></ol><p>飛行機・タンク・工兵・騎兵・スパイ・地雷・軍旗には特別な動きや戦闘能力があります。</p><a className="rules-link" href="https://github.com/diceK9750/military-chess-online/blob/main/docs/GAME_RULES.md" target="_blank" rel="noreferrer">詳しいゲームルールを見る ↗</a><div><button className="secondary" onClick={() => setScreen('home')}>タイトルへ戻る</button></div></section>
      : screen === 'local' ? <><div className="dev-banner"><strong>開発用ローカル対局</strong><p>全駒の種類を表示する検証画面です。実際のオンライン対戦や秘密情報保護には対応していません。</p></div>{game ? <LocalGame key={revision} initial={game} onChange={setGame} /> : <Setup onStart={started => { setGame(started); setRevision(value => value + 1); }} />}<details className="debug-tools"><summary>検証用の盤面を開く</summary><p>少数の架空駒で動作を確かめます。現在のローカル対局は置き換わります。</p><div className="actions"><button className="secondary" onClick={() => demo('aircraft')}>飛行機のC/D経路</button><button className="secondary" onClick={() => demo('capture')}>司令部占領</button><button className="secondary" onClick={() => { setGame(null); setRevision(value => value + 1); }}>初期配置へ戻る</button></div></details></>
      : <section className="placeholder"><p className="eyebrow">ONLINE — 将来拡張</p><h1>{screen === 'list' ? '対局一覧' : '新しい対局'}</h1><p>オンライン対局・ログイン・招待は将来の拡張です。初回公開は対CPU戦を目標にします。</p><button className="primary" onClick={requestNewGame}>コンピューターと対戦</button></section>}
    </main>
    <footer><a href="https://github.com/diceK9750/military-chess-online/blob/main/docs/GAME_RULES.md" target="_blank" rel="noreferrer">正式ゲームルール ↗</a><span>対コンピューター戦・テストプレイ版</span></footer>
  </div>;
}
