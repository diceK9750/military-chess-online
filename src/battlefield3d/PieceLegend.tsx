import {PIECE_TYPES} from '../game/pieces';
import {PieceFace} from '../ui/PieceFace';
import {identity} from './identity';
import {officerLook} from './regalia';
const hints={general:'三本の大兜・最長の外套',lieutenantGeneral:'双角兜・厚い肩装備',majorGeneral:'一本の兜飾り・短い外套',colonel:'背旗・三段の肩章',lieutenantColonel:'頭部飾り・二段の肩章',major:'平帽・一段の肩章',captain:'三つの帽章・長い銃剣',lieutenant:'二つの帽章・長銃',secondLieutenant:'一つの帽章・短銃',aircraft:'大きな翼・尾翼・プロペラ',tank:'履帯・砲塔・長い砲身',engineer:'黄帽・工具・背負い袋',cavalry:'馬の首と耳・騎手',spy:'黒いフード・細身の隠密姿勢',mine:'低い設置器・警告色・突起',flag:'大きな旗と旗手'} as const;
const families = {
  3: {label:'将官', color:'金色', mark:'⬡'},
  2: {label:'佐官', color:'銀色', mark:'●'},
  1: {label:'尉官', color:'水色', mark:'■'},
} as const;

export function PieceLegend() {
  return <div className="piece-legend" role="list" aria-label="駒の種類と見分け方">
    {PIECE_TYPES.map(type => {
      // These are public reference pieces; use the renderers' shared rank mapping.
      const {rank} = identity({type, unknown:false, owner:1, position:'HQ-P1'});
      const {family, tier, accent} = officerLook(rank);
      const insignia = family ? families[family as keyof typeof families] : null;
      return <div className="piece-legend-entry" role="listitem" key={type}>
        <strong><PieceFace type={type}/></strong>
        {insignia && <span className={`piece-legend-insignia piece-legend-insignia--${accent}`} role="img" aria-label={`${insignia.label}・${insignia.color}の印${tier}個`}>
          <span className="piece-legend-marks" aria-hidden="true">{insignia.mark.repeat(tier)}</span>
          <span aria-hidden="true">{insignia.label}・印{tier}個</span>
        </span>}
        <span className="piece-legend-hint">{hints[type]}</span>
      </div>;
    })}
  </div>;
}
