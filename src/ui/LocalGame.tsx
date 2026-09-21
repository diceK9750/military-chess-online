import { useState } from 'react';
import { applyMove } from '../game/game';
import { legalMoves } from '../game/movement';
import type { EndReason, GameEvent, GameState, Move, Player, Site } from '../game/types';
import { Board } from './Board';

const reasons: Record<EndReason, string> = { HQ_CAPTURE: '敵司令部を占領', CAPTURERS_ELIMINATED: '片側の占領可能駒が全滅', BOTH_CAPTURERS_ELIMINATED: '双方の占領可能駒が全滅', NO_LEGAL_MOVES_BOTH: '双方に合法手なし', FIFTY_NONCOMBAT_MOVES: '戦闘なし50手' };
function eventText(event: GameEvent): string {
  if (event.kind === 'START') return `P${event.firstPlayer}を先手として開始`;
  if (event.kind === 'AUTO_PASS') return `P${event.actor}は合法手がないため自動で手番を送りました`;
  if (event.kind === 'END') return `終局：${reasons[event.result.reason]}`;
  return `${event.moveNumber}手目 P${event.actor} ${event.move.from} → ${event.move.to}${event.move.lane ? `（${event.move.lane}列）` : ''}${event.battle ? `：${{ ATTACKER: '攻撃側勝利', DEFENDER: '防御側勝利', MUTUAL: '相打ち' }[event.battle]}` : ''}`;
}
export function LocalGame({ initial, onChange }: { initial: GameState; onChange?(game: GameState): void }) {
  const [game, setGame] = useState(initial);
  const [perspective, setPerspective] = useState<Player>(1);
  const [selected, setSelected] = useState<Site | null>(null);
  const [pending, setPending] = useState<Move[]>([]);
  const [lane, setLane] = useState<'C' | 'D' | undefined>();
  const [error, setError] = useState('');
  const moves = game.turn ? legalMoves(game.pieces, game.turn) : [];
  const targets = moves.filter(m => m.from === selected).map(m => m.to);
  function select(site: Site) {
    if (game.result) return;
    const candidates = moves.filter(m => m.from === selected && m.to === site);
    if (candidates.length) { setPending(candidates); setLane(candidates.length === 1 ? candidates[0].lane : undefined); return; }
    setPending([]); setLane(undefined);
    setSelected(game.pieces.some(p => p.position === site && p.owner === game.turn) ? site : null);
  }
  const chosen = pending.find(m => m.lane === lane);
  function execute() {
    if (!chosen) return;
    try { const next = applyMove(game, chosen); setGame(next); onChange?.(next); setSelected(null); setPending([]); setLane(undefined); setError(''); }
    catch { setError('この手は実行できません。駒と移動先を選び直してください。'); }
  }
  return <section>
    <div className="section-heading"><div><p className="eyebrow">02 / LOCAL GAME</p><h2>{game.result ? '対局終了' : `P${game.turn}の手番`}</h2></div><span className="badge">{game.moveCount}手</span></div>
    {game.result && <div role="status" className="result"><strong>{game.result.winner ? `P${game.result.winner}の勝利` : '引き分け'}</strong><p>{reasons[game.result.reason]}</p></div>}
    <div className="toolbar"><label>盤面の向き <select aria-label="盤面の向き" value={perspective} onChange={e => setPerspective(Number(e.target.value) as Player)}><option value="1">P1を下側</option><option value="2">P2を下側</option></select></label><span className="muted">戦闘なし {game.noncombatCount} / 50手</span></div>
    <Board pieces={game.pieces} perspective={perspective} selected={selected} targets={targets} onSelect={select} />
    {pending.length > 0 ? <div className="confirm" aria-label="着手確認">
      <h3>この手を実行しますか？</h3><p>{pending[0].from} → {pending[0].to}</p>
      {pending.length === 2 && <fieldset><legend>通る列を選択</legend>{(['C', 'D'] as const).map(c => <label key={c}><input type="radio" name="lane" value={c} checked={lane === c} onChange={() => setLane(c)} />{c}列</label>)}</fieldset>}
      {pending.length === 1 && lane && <p>{lane}列を通ります（合法な列を自動選択）。</p>}
      <div className="actions"><button className="secondary" onClick={() => { setPending([]); setLane(undefined); }}>選び直す</button><button className="primary" disabled={!chosen} onClick={execute}>確定して実行</button></div>
    </div> : !game.result && <p className="notice">{selected ? '枠で示した移動先を選択してください。' : '手番側の駒を選ぶと、合法な移動先を表示します。'}</p>}
    {error && <p role="alert">{error}</p>}
    <div className="history"><h3>直近の出来事</h3><ol aria-live="polite">{game.events.slice(-5).map((e, i) => <li key={`${game.events.length}-${i}`}>{eventText(e)}</li>)}</ol>{!game.events.length && <p>検証用の盤面です。駒を選んで開始できます。</p>}</div>
  </section>;
}
