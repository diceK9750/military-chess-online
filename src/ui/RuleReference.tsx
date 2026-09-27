import { combat, COMBAT_TYPES } from '../game/combat';
import { PIECES } from '../game/pieces';
import type { EffectiveType, Outcome } from '../game/types';

const RANKS = COMBAT_TYPES.slice(0, 9);
const SPECIALS = COMBAT_TYPES.slice(9);

function ownResult(type: EffectiveType, opponent: EffectiveType, defending: boolean): '勝つ' | '負ける' | '相打ち' {
  const outcome: Outcome = defending ? combat(opponent, type) : combat(type, opponent);
  if (outcome === 'MUTUAL') return '相打ち';
  return outcome === (defending ? 'DEFENDER' : 'ATTACKER') ? '勝つ' : '負ける';
}

function matchups(type: EffectiveType, defending: boolean) {
  return (['勝つ', '負ける', '相打ち'] as const).map(result => {
    const opponents = COMBAT_TYPES.filter(opponent => ownResult(type, opponent, defending) === result);
    return <li key={result}><strong>{result}：</strong>{opponents.map(opponent => PIECES[opponent].label).join('・')}</li>;
  });
}

export function RuleReference() {
  return <aside className="rule-reference" aria-label="ルール早見表">
    <h3>ルール早見表</h3>
    <section><h4>勝利</h4><p>大将・中将・少将・大佐・中佐・少佐のいずれかで敵司令部を占領するか、敵の司令部占領可能駒をすべて除去します。ほかの駒は敵司令部に入れても、それだけでは勝利しません。</p></section>
    <section><h4>通常階級（強い順）</h4><p className="rank-order">{RANKS.map((type, index) => <span key={type}>{index > 0 && <span aria-hidden="true"> ＞ </span>}{PIECES[type].label}</span>)}</p></section>
    <section><h4>特殊駒の強弱</h4><p>戦闘表から表示。攻撃時と防御時で結果が異なる場合があります。</p>
      {SPECIALS.map(type => <div className="special-matchup" key={type}><h5>{PIECES[type].label}</h5>
        {type !== 'mine' && <><strong>攻撃時</strong><ul>{matchups(type, false)}</ul></>}
        <strong>防御時</strong><ul>{matchups(type, true)}</ul>
      </div>)}
      <p><strong>軍旗：</strong>直後の味方駒の戦闘性能を継承。直後に味方がいなければ戦闘で負けます。</p>
    </section>
    <section><h4>特殊な移動</h4><ul>
      <li><strong>飛行機：</strong>前後に任意距離。途中の敵味方駒を飛び越え可能。左右1マス。突破口不要。</li>
      <li><strong>工兵：</strong>前後左右の直線を任意距離。途中の駒を飛び越え不可。</li>
      <li><strong>タンク・騎兵：</strong>前後左右1マス、または前方2マス。前方2マスは途中に駒があると不可。</li>
      <li><strong>地雷・軍旗：</strong>移動不可。その他は前後左右1マス。</li>
    </ul></section>
    <section><h4>盤面の要点</h4><p>対CPU戦では敵駒の種類は対局中見えません。通常駒はB列・E列の突破口から越境します。戦闘は自動判定、同種は相打ちです。</p></section>
    <a href="https://github.com/diceK9750/military-chess-online/blob/main/docs/GAME_RULES.md" target="_blank" rel="noreferrer">詳しいゲームルール ↗</a>
  </aside>;
}
