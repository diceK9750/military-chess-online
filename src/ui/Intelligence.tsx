import { anchors, hq } from '../game/board';
import { PIECES } from '../game/pieces';
import type { Site } from '../game/types';
import type { EnemyHypothesis } from '../intelligence/inference';
import { publicCpuExplanation, recommendations, scoreLabels, type TacticalView } from '../intelligence/public';
import type { MoveEvaluation } from '../cpu/strategy';
export const INTELLIGENCE_KEY = 'military-chess-intelligence-v1';
export function readIntelligence(): boolean { try { return localStorage.getItem(INTELLIGENCE_KEY)==='true'; } catch { return false; } }
function Score({evaluation,cpu=false}:{evaluation:MoveEvaluation;cpu?:boolean}) {
  return <div><strong>{evaluation.move.from} → {evaluation.move.to}{evaluation.move.lane ? `（${evaluation.move.lane}列）`:''}</strong><ul>{evaluation.terms.filter(t=>t.value!==0).slice(0,4).map(t=><li key={t.key}>{scoreLabels[t.key]} {t.value>0?'+':''}{t.value}</li>)}</ul><small>{cpu?'公開要素小計':'総合'} {evaluation.total>0?'+':''}{evaluation.total}</small></div>;
}
export function Intelligence({view,enabled,onToggle,hypotheses,focus,onFocus}:{view:TacticalView;enabled:boolean;onToggle():void;hypotheses:readonly EnemyHypothesis[];focus:Site|null;onFocus(site:Site):void}) {
  const options=enabled?recommendations(view):[];
  const lastCpu=[...view.history].reverse().find(e=>e.kind==='MOVE'&&e.actor!==view.side);
  const target=hypotheses.find(h=>h.position===focus);
  const ownHQ=hq(view.side), pressure=view.pieces.filter(p=>!p.known&&anchors(p.position).some(a=>anchors(ownHQ).some(b=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)<=3))).length;
  return <section className={'intelligence-panel'+(enabled?' is-active':'')} aria-label="AI参謀"><div className="intelligence-heading"><strong>AI参謀</strong><small>公開情報のみから解析</small><button className="secondary" aria-pressed={enabled} onClick={onToggle}>AI参謀 {enabled?'OFFにする':'ONにする'}</button></div>
    {enabled&&<><p className="intelligence-metrics">占領戦力 {view.pieces.filter(p=>p.known&&PIECES[p.type].captures).length}枚 · 本陣周辺の敵 {pressure}枚 · 戦闘なし {view.noncombatCount}/50</p>
      <div className="intelligence-cards">{options.map((evaluation,i)=><article key={i} aria-label={`戦術候補${i+1}`}><small>候補 {i+1} · 助言のみ</small><Score evaluation={evaluation}/></article>)}{lastCpu?.kind==='MOVE'&&<article aria-label="CPU判断の公開理由"><small>CPUの着手理由{ /* Private total would reveal the unknown actor's equipment. */ }</small><Score evaluation={publicCpuExplanation(view,lastCpu)} cpu/><small>種類に依存する内部点数は非公開{view.turn!==null&&view.turn!==view.side?' · 思考中':''}</small></article>}</div>
      <details className="enemy-analysis"><summary>未知敵駒の候補を調べる</summary><div className="actions">{hypotheses.map(h=><button className="secondary" key={h.position} onClick={()=>onFocus(h.position)} aria-pressed={focus===h.position}>{h.position} · 候補{h.candidates.length}種</button>)}</div></details>
      {target&&<p className="hypothesis" role="status">{target.position} · 候補 {target.candidates.length}種：{target.candidates.map(t=>PIECES[t].label).join(' / ')}<br/>{target.evidence.join('。')||'初期配置の公開制約のみ。確率・正体の断定ではありません。'}</p>}
    </>}
  </section>;
}
