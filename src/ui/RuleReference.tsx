import { combat, COMBAT_TYPES } from '../game/combat';
import { PIECES } from '../game/pieces';
import type { EffectiveType, Outcome } from '../game/types';

const RANKS = COMBAT_TYPES.slice(0, 9);
const SPECIALS = COMBAT_TYPES.slice(9);
const RESULT_ORDER: readonly Outcome[] = ['ATTACKER', 'DEFENDER', 'MUTUAL'];
const RESULT_LABEL: Record<Outcome, string> = { ATTACKER: '勝', DEFENDER: '負', MUTUAL: '相' };

function ownResult(type: EffectiveType, opponent: EffectiveType, defending: boolean): Outcome {
  const outcome = defending ? combat(opponent, type) : combat(type, opponent);
  if (outcome === 'MUTUAL') return outcome;
  return outcome === (defending ? 'DEFENDER' : 'ATTACKER') ? 'ATTACKER' : 'DEFENDER';
}

function compressedNames(types: readonly EffectiveType[]): string {
  const selected = new Set(types);
  const groups: string[] = [];
  let start = -1;
  for (let index = 0; index <= RANKS.length; index++) {
    const included = index < RANKS.length && selected.has(RANKS[index]);
    if (included && start < 0) start = index;
    if (!included && start >= 0) {
      groups.push(index - start > 1 ? `${PIECES[RANKS[start]].label}〜${PIECES[RANKS[index - 1]].label}` : PIECES[RANKS[start]].label);
      start = -1;
    }
  }
  groups.push(...SPECIALS.filter(type => selected.has(type)).map(type => PIECES[type].label));
  return groups.join('・') || 'なし';
}

function outcomeSummary(type: EffectiveType, defending: boolean): string {
  const groups = RESULT_ORDER.map(result => {
    const types = COMBAT_TYPES.filter(opponent => opponent !== type && ownResult(type, opponent, defending) === result);
    return `${RESULT_LABEL[result]} ${compressedNames(types)}`;
  });
  return groups.join(' / ');
}

function LeftRules({ placement }: { placement: boolean }) {
  return <>
    <section><h4>勝利条件</h4><p>大将・中将・少将・大佐・中佐・少佐で敵司令部を占領するか、敵の占領可能駒を全滅させます。他の駒が司令部へ入っても勝利ではありません。</p></section>
    <section><h4>移動</h4><ul>
      <li><strong>通常駒：</strong>前後左右1マス</li>
      <li><strong>飛行機：</strong>前後任意距離、敵味方を飛越。左右1マス、突破口不要</li>
      <li><strong>工兵：</strong>直線を任意距離、飛越不可</li>
      <li><strong>タンク・騎兵：</strong>1マスまたは前方2マス（途中に駒があれば不可）</li>
      <li><strong>地雷・軍旗：</strong>移動不可</li>
    </ul></section>
    <section><h4>{placement ? '盤面・配置' : '盤面の要点'}</h4><ul>
      <li>対CPU戦の敵駒は対局中、種類が見えません</li>
      <li>通常駒の突破口はB列・E列。戦闘は自動判定、同種は相打ち</li>
      {placement && <><li>自軍23枚をすべて配置します</li><li>地雷・軍旗は突破口入口へ置けません</li><li>軍旗は最後列（司令部を含む）に置けません</li></>}
    </ul></section>
  </>;
}

function RightRules() {
  return <>
    <section><h4>通常階級（強い順）</h4><p className="rank-order">{RANKS.map((type, index) => <span key={type}>{index > 0 && <span aria-hidden="true"> ＞ </span>}{PIECES[type].label}</span>)}</p></section>
    <section><h4>特殊駒の戦闘</h4><p className="matchup-key">攻＝攻撃時、守＝防御時、相＝相打ち</p>
      <div className="matchup-table" role="table" aria-label="特殊駒の攻撃時・防御時の戦闘関係">
        {SPECIALS.map(type => <div className="matchup-row" role="row" key={type}>
          <strong role="cell">{PIECES[type].label}</strong>
          <span role="cell"><b>攻</b> {type === 'mine' ? '移動不可' : outcomeSummary(type, false)}</span>
          <span role="cell"><b>守</b> {outcomeSummary(type, true)}</span>
        </div>)}
      </div>
      <p className="flag-rule"><strong>軍旗：</strong>直後の味方駒の戦闘性能を継承。後ろに味方がいなければ負けます。</p>
    </section>
  </>;
}

export function RuleReference({ side, placement = false }: { side: 'left' | 'right'; placement?: boolean }) {
  return <aside className={`rule-reference rule-reference--${side}`} aria-label={side === 'left' ? '基本ルール' : '駒の強弱早見'}>
    {side === 'left' ? <><h3>{placement ? '配置・基本ルール' : '勝ち方・移動'}</h3><LeftRules placement={placement} /></> : <><h3>駒の強弱早見</h3><RightRules /></>}
    <a href="https://github.com/diceK9750/military-chess-online/blob/main/docs/GAME_RULES.md" target="_blank" rel="noreferrer">詳しいゲームルール ↗</a>
  </aside>;
}
