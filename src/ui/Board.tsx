import { anchors, isHQ, SITES } from '../game/board';
import { PIECES } from '../game/pieces';
import type { Move, Piece, Player, Site } from '../game/types';

interface Props { pieces: readonly Piece[]; perspective: Player; selected: Site | null; targets?: readonly Site[]; concealOwner?: Player; humanSide?: Player; lastMove?: Move; battleSite?: Site; routeLane?: 'C' | 'D'; disabled?: boolean; onSelect(site: Site): void }
export function Board({ pieces, perspective, selected, targets = [], concealOwner, humanSide, lastMove, battleSite, routeLane, disabled = false, onSelect }: Props) {
  const rows = Array.from({ length: 8 }, (_, i) => perspective === 1 ? 8 - i : i + 1);
  return <div className="board" aria-label={humanSide ? '対コンピューター盤面' : '開発用盤面（全駒表示）'}>
    <div className="columns" aria-hidden="true">{(perspective === 1 ? 'ABCDEF' : 'FEDCBA').split('').map(c => <span key={c}>{c}</span>)}</div>
    {rows.map((row, index) => <div className={`board-row ${index === 3 ? 'border-row' : ''}`} key={row}>
      {SITES.filter(s => anchors(s)[0].y === row).sort((a, b) => (anchors(a)[0].x - anchors(b)[0].x) * (perspective === 1 ? 1 : -1)).map(site => {
        const piece = pieces.find(p => p.position === site);
        const hidden = piece?.owner === concealOwner;
        const label = piece ? `P${piece.owner} ${hidden ? '不明駒' : PIECES[piece.type].label}` : '空き';
        const marker = site === battleSite ? '戦' : site === lastMove?.to ? '着' : site === lastMove?.from ? '発' : null;
        const onRoute = routeLane && site.startsWith(routeLane) && /^[2-7]$/.test(site.slice(1));
        const entrance = ['B4', 'B5', 'E4', 'E5'].includes(site);
        const description = [isHQ(site) ? '司令部' : null, entrance ? '突破口入口' : null, targets.includes(site) ? '選択できる地点' : null, marker === '戦' ? '直前の戦闘地点' : marker === '発' ? '直前の出発地点' : marker === '着' ? '直前の到着地点' : null].filter(Boolean).join('、');
        return <button key={site} type="button" data-site={site} aria-label={`${site} ${label}`} aria-description={description || undefined} aria-pressed={selected === site}
          disabled={disabled}
          className={`cell ${isHQ(site) ? 'hq' : ''} ${piece ? `side-${piece.owner}` : 'empty'} ${targets.includes(site) ? 'legal' : ''} ${selected === site ? 'selected' : ''} ${entrance ? 'entrance' : ''} ${index === 3 && entrance ? 'gate' : ''} ${lastMove?.from === site ? 'last-from' : ''} ${lastMove?.to === site ? 'last-to' : ''} ${battleSite === site ? 'last-battle' : ''} ${onRoute ? 'route' : ''}`}
          onClick={() => onSelect(site)}>
          <span className="coordinate">{site}</span>
          <span className="piece-label">{piece ? hidden ? '？' : PIECES[piece.type].label : targets.includes(site) ? '●' : isHQ(site) ? '司令部' : '·'}</span>
          <span className="owner-label">{piece ? humanSide ? piece.owner === humanSide ? '自軍' : '敵軍' : `P${piece.owner}` : isHQ(site) ? '司令部' : entrance ? '突破口' : '\u00a0'}</span>
          {marker && <span className="cell-marker" aria-hidden="true">{marker}</span>}
        </button>;
      })}
    </div>)}
  </div>;
}
