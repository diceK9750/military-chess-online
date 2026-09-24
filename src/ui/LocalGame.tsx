import { useEffect, useRef, useState } from 'react';
import { playCpuTurn } from '../cpu/turn';
import type { Difficulty } from '../cpu/strategy';
import { applyMove } from '../game/game';
import { legalMoves } from '../game/movement';
import { PIECES } from '../game/pieces';
import type { EndReason, GameEvent, GameState, Move, Piece, Player, Result, Site } from '../game/types';
import { Board } from './Board';

const reasons: Record<EndReason, string> = { HQ_CAPTURE: '敵司令部を占領', CAPTURERS_ELIMINATED: '片側の占領可能駒が全滅', BOTH_CAPTURERS_ELIMINATED: '双方の占領可能駒が全滅', NO_LEGAL_MOVES_BOTH: '双方に合法手なし', FIFTY_NONCOMBAT_MOVES: '戦闘なし50手' };
function reasonText(result: Result, mode: 'debug' | 'cpu'): string {
  if (mode === 'cpu' && result.reason === 'HQ_CAPTURE') return result.winner === 1 ? 'あなたがコンピューターの司令部を占領' : 'コンピューターがあなたの司令部を占領';
  if (mode === 'cpu' && result.reason === 'CAPTURERS_ELIMINATED') return result.winner === 1 ? 'コンピューターの司令部占領可能駒が全滅' : 'あなたの司令部占領可能駒が全滅';
  return reasons[result.reason];
}
function eventText(event: GameEvent, mode: 'debug' | 'cpu'): string {
  const side = (actor: Player) => mode === 'cpu' ? actor === 1 ? 'あなた' : 'コンピューター' : `P${actor}`;
  if (event.kind === 'START') return `${side(event.firstPlayer)}が先手で開始`;
  if (event.kind === 'AUTO_PASS') return `${side(event.actor)}は合法な移動がないため、自動的に手番が移りました`;
  if (event.kind === 'END') return `終局：${reasonText(event.result, mode)}`;
  const battle = event.battle ? mode === 'cpu' ? {
    ATTACKER: event.actor === 1 ? 'あなたの駒が勝利' : 'あなたの駒が敗北',
    DEFENDER: event.actor === 1 ? 'あなたの駒が敗北' : 'あなたの駒が勝利',
    MUTUAL: '相打ち',
  }[event.battle] : { ATTACKER: '攻撃側勝利', DEFENDER: '防御側勝利', MUTUAL: '相打ち' }[event.battle] : null;
  return `${event.moveNumber}手目 ${side(event.actor)} ${event.move.from} → ${event.move.to}${event.move.lane ? `（${event.move.lane}列）` : ''}${battle ? `：${battle}` : '：移動'}`;
}

/** The complete initial position is used only after a local CPU match ends. */
function battleDisclosures(events: readonly GameEvent[], initialPieces: readonly Piece[]): string[] {
  const positions = new Map(initialPieces.map(piece => [piece.id, piece.position]));
  const lines: string[] = [];
  for (const event of events) {
    if (event.kind !== 'MOVE') continue;
    const attacker = initialPieces.find(piece => positions.get(piece.id) === event.move.from);
    const defender = initialPieces.find(piece => positions.get(piece.id) === event.move.to);
    if (!attacker) continue;
    if (defender && event.battle) lines.push(`${event.moveNumber}手目 ${event.move.to}：${PIECES[attacker.type].label} 対 ${PIECES[defender.type].label}（${{ ATTACKER: '攻撃側勝利', DEFENDER: '防御側勝利', MUTUAL: '相打ち' }[event.battle]}）`);
    positions.set(attacker.id, event.battle === 'DEFENDER' || event.battle === 'MUTUAL' ? null : event.move.to);
    if (defender && event.battle !== 'DEFENDER') positions.set(defender.id, null);
  }
  return lines;
}

export function LocalGame({ initial, onChange, mode = 'debug', difficulty = 'easy', cpuSeed = 0, initialPlacements, onNewGame }: {
  initial: GameState; onChange?(game: GameState): void; mode?: 'debug' | 'cpu'; difficulty?: Difficulty; cpuSeed?: number;
  initialPlacements?: { readonly p1: readonly Piece[]; readonly p2: readonly Piece[] }; onNewGame?(): void;
}) {
  const [game, setGame] = useState(initial);
  const [perspective, setPerspective] = useState<Player>(1);
  const [selected, setSelected] = useState<Site | null>(null);
  const [pending, setPending] = useState<Move[]>([]);
  const [lane, setLane] = useState<'C' | 'D' | undefined>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const confirmRef = useRef<HTMLHeadingElement>(null);
  const cpuThinking = mode === 'cpu' && game.turn === 2 && game.result === null;
  const moves = game.turn && !cpuThinking ? legalMoves(game.pieces, game.turn) : [];
  const targets = moves.filter(m => m.from === selected).map(m => m.to);
  const latestMove = [...game.events].reverse().find(event => event.kind === 'MOVE');
  const latestEvent = game.events.at(-1);
  const latestPass = latestEvent?.kind === 'AUTO_PASS' ? latestEvent : game.events.at(-2)?.kind === 'AUTO_PASS' ? game.events.at(-2) : null;
  const selectedPiece = selected === null ? undefined : game.pieces.find(piece => piece.position === selected);
  const targetPiece = pending.length ? game.pieces.find(piece => piece.position === pending[0].to) : null;

  useEffect(() => {
    if (!cpuThinking) return;
    const timer = setTimeout(() => {
      try {
        const next = playCpuTurn(game, 2, difficulty, (cpuSeed + Math.imul(game.moveCount + 1, 0x9e3779b9)) >>> 0);
        setGame(next); onChange?.(next); setError('');
      } catch { setError('コンピューターの着手を処理できませんでした。'); }
    }, 80);
    return () => clearTimeout(timer);
  }, [cpuThinking, game, difficulty, cpuSeed, onChange]);
  useEffect(() => { if (pending.length) confirmRef.current?.focus(); }, [pending]);

  function select(site: Site) {
    if (game.result || cpuThinking) return;
    const own = game.pieces.find(piece => piece.position === site && piece.owner === game.turn);
    if (own) {
      setSelected(selected === site ? null : site); setPending([]); setLane(undefined); setNotice('');
      return;
    }
    const candidates = moves.filter(move => move.from === selected && move.to === site);
    if (candidates.length) { setPending(candidates); setLane(candidates.length === 1 ? candidates[0].lane : undefined); setNotice(''); return; }
    setNotice(selected ? 'ここへは移動できません。枠の付いた移動先を選んでください。' : '先に自分の駒を選んでください。');
  }
  const chosen = pending.find(move => move.lane === lane);
  function execute() {
    if (!chosen) return;
    try { const next = applyMove(game, chosen); setGame(next); onChange?.(next); setSelected(null); setPending([]); setLane(undefined); setError(''); setNotice(''); }
    catch { setError('この手は実行できません。駒と移動先を選び直してください。'); }
  }
  function cancel() { setSelected(null); setPending([]); setLane(undefined); setNotice('選択を解除しました。'); }
  const resultLabel = game.result ? game.result.winner ? mode === 'cpu' ? game.result.winner === 1 ? 'あなたの勝利' : 'あなたの敗北' : `P${game.result.winner}の勝利` : '引き分け' : null;
  return <section className="game-screen">
    <div className="section-heading"><div><p className="eyebrow">02 / {mode === 'cpu' ? '対CPU戦' : '開発用対局'}</p><h2>{game.result ? '対局終了' : cpuThinking ? 'CPUの手番' : mode === 'cpu' ? 'あなたの手番' : `P${game.turn}の手番`}</h2></div><span className="badge">{game.moveCount}手</span></div>
    {game.result && <div role="status" className="result"><strong>{resultLabel}</strong><p>終局理由：{reasonText(game.result, mode)}</p>{mode === 'cpu' && onNewGame && <button className="primary" onClick={onNewGame}>新しい対局</button>}</div>}
    {cpuThinking && <p className="thinking" role="status">コンピューターが考えています。盤面は着手後に操作できます。</p>}
    {latestMove?.kind === 'MOVE' && <p className="latest-event" role="status"><strong>直前の着手</strong><span>{eventText(latestMove, mode)}</span></p>}
    {latestPass && <p className="pass-event" role="status">{eventText(latestPass, mode)}</p>}
    <div className="toolbar">{mode === 'debug' && <label>盤面の向き <select aria-label="盤面の向き" value={perspective} onChange={event => setPerspective(Number(event.target.value) as Player)}><option value="1">P1を下側</option><option value="2">P2を下側</option></select></label>}<span className="muted">戦闘なし {game.noncombatCount} / 50手</span></div>
    <p className="board-guide">上が{mode === 'cpu' ? 'コンピューター' : 'P2'}側、下が{mode === 'cpu' ? 'あなた' : 'P1'}側。B列・E列が突破口です。</p>
    <Board pieces={game.pieces} perspective={mode === 'cpu' ? 1 : perspective} selected={selected} targets={targets} concealOwner={mode === 'cpu' && !game.result ? 2 : undefined} humanSide={mode === 'cpu' ? 1 : undefined} lastMove={latestMove?.kind === 'MOVE' ? latestMove.move : undefined} battleSite={latestMove?.kind === 'MOVE' && latestMove.battle ? latestMove.move.to : undefined} routeLane={pending.length ? lane : undefined} disabled={cpuThinking || !!game.result} onSelect={select} />
    <div className="board-legend" aria-label="盤面の記号"><span>太枠＝選択中</span><span>金枠＝移動先</span><span>発／着＝直前の移動</span><span>戦＝戦闘地点</span></div>
    {pending.length > 0 ? <div className="confirm" aria-label="着手確認">
      <h3 ref={confirmRef} tabIndex={-1}>この手を実行しますか？</h3><p><strong>{selectedPiece ? PIECES[selectedPiece.type].label : '駒'}</strong>を <strong>{pending[0].from}</strong> から <strong>{pending[0].to}</strong> へ動かします。</p>
      {targetPiece && <p className="battle-warning">戦闘になります。相手の駒種類は分かりません。</p>}
      {pending.length === 2 && <fieldset><legend>通る列を選択</legend>{(['C', 'D'] as const).map(column => <label key={column}><input type="radio" name="lane" value={column} checked={lane === column} onChange={() => setLane(column)} />{column}列を通る</label>)}</fieldset>}
      {pending.length === 1 && lane && <p>{lane}列を通ります（合法な列を自動選択）。</p>}
      <div className="actions"><button className="secondary" onClick={() => { setPending([]); setLane(undefined); }}>選び直す</button><button className="primary" disabled={!chosen} onClick={execute}>確定して実行</button></div>
    </div> : !game.result && <div className="move-prompt"><p className="notice" role="status">{cpuThinking ? 'コンピューターが考えています。' : notice || (selectedPiece ? `${PIECES[selectedPiece.type].label}（${selected}）を選択中。金枠の移動先を選んでください。` : '自分の駒を選ぶと、移動できる地点を金枠で表示します。')}</p>{selected && !cpuThinking && <button className="secondary" onClick={cancel}>選択を解除</button>}</div>}
    {error && <p role="alert">{error}</p>}
    <details className="history" aria-label="対局履歴"><summary>対局履歴（{game.events.length}件）</summary><ol>{game.events.map((event, index) => <li key={index}>{eventText(event, mode)}</li>)}</ol>{!game.events.length && <p>検証用の盤面です。駒を選んで開始できます。</p>}</details>
    {game.result && mode === 'cpu' && initialPlacements && <details className="postgame"><summary>終局後の全駒・初期配置・戦闘を確認</summary><p>この対局は終了したため、両軍の情報を表示します。</p>{([1, 2] as const).map(side => <div key={side}><h3>{side === 1 ? 'あなた' : 'コンピューター'}の初期配置</h3><ul>{initialPlacements[side === 1 ? 'p1' : 'p2'].map(piece => <li key={piece.id}>{piece.position}：{PIECES[piece.type].label}</li>)}</ul></div>)}<h3>戦闘の双方の駒種類</h3><ol>{battleDisclosures(game.events, [...initialPlacements.p1, ...initialPlacements.p2]).map((line, index) => <li key={index}>{line}</li>)}</ol><p>全着手は上の対局履歴で確認できます。</p></details>}
  </section>;
}
