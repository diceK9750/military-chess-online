import { anchors, isHQ, SITES } from '../game/board';
import { PIECES } from '../game/pieces';
import type { Piece, Player, Site } from '../game/types';

interface Props { pieces: readonly Piece[]; perspective: Player; selected: Site | null; targets?: readonly Site[]; concealOwner?: Player; onSelect(site: Site): void }
export function Board({ pieces, perspective, selected, targets = [], concealOwner, onSelect }: Props) {
  const rows = Array.from({ length: 8 }, (_, i) => perspective === 1 ? 8 - i : i + 1);
  return <div className="board" aria-label={concealOwner ? '対CPU盤面' : '開発用盤面（全駒表示）'}>
    <div className="columns" aria-hidden="true">{(perspective === 1 ? 'ABCDEF' : 'FEDCBA').split('').map(c => <span key={c}>{c}</span>)}</div>
    {rows.map((row, index) => <div className={`board-row ${index === 3 ? 'border-row' : ''}`} key={row}>
      {SITES.filter(s => anchors(s)[0].y === row).sort((a, b) => (anchors(a)[0].x - anchors(b)[0].x) * (perspective === 1 ? 1 : -1)).map(site => {
        const piece = pieces.find(p => p.position === site);
        const hidden = piece?.owner === concealOwner;
        const label = piece ? `P${piece.owner} ${hidden ? '不明駒' : PIECES[piece.type].label}` : '空き';
        return <button key={site} type="button" data-site={site} aria-label={`${site} ${label}`} aria-pressed={selected === site}
          className={`cell ${isHQ(site) ? 'hq' : ''} ${piece ? `side-${piece.owner}` : 'empty'} ${targets.includes(site) ? 'legal' : ''} ${selected === site ? 'selected' : ''} ${index === 3 && ['B', 'E'].includes(site[0]) ? 'gate' : ''}`}
          onClick={() => onSelect(site)}>
          <span className="coordinate">{site}</span>
          <span className="piece-label">{piece ? hidden ? '？' : PIECES[piece.type].label : targets.includes(site) ? '●' : isHQ(site) ? '司令部' : '·'}</span>
          <span className="owner-label">{piece ? `P${piece.owner}` : '\u00a0'}</span>
        </button>;
      })}
    </div>)}
  </div>;
}
