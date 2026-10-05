import { sitePoint, type BattlefieldViewState } from './state';

/** A fixed own-side overview uses only the public display adapter, never true hidden types. */
export function BattlefieldOverview({ state }: { state: BattlefieldViewState }) {
  const sign = state.viewer === 1 ? 1 : -1;
  const point = (site: Parameters<typeof sitePoint>[0]) => {
    const p = sitePoint(site); return { x: 42 + p.x * sign * 9, y: 53 + p.z * sign * 9 };
  };
  const sites = new Set([state.interaction.selectedSite, ...state.interaction.legalTargets].filter(Boolean));
  return <aside className="battlefield-overview" aria-label="全体位置図・自軍が下">
    <small>敵軍 ↑</small>
    <svg viewBox="0 0 84 106" role="img" aria-label="全体位置図">
      <rect x="10" y="9" width="64" height="88" rx="3" fill="#142b32" stroke="#9ab4a7" />
      <path d="M10 53H74" stroke="#8ac7d5" strokeDasharray="3 3" />
      {state.pieces.map(piece => { const p=point(piece.position); return <circle key={piece.position} cx={p.x} cy={p.y} r="2.4" fill={piece.owner===state.viewer?'#9ddff2':'#efb5a4'} />; })}
      {[...sites].map(site => { const p=point(site!); return <rect key={site} x={p.x-3.5} y={p.y-3.5} width="7" height="7" fill="none" stroke={site===state.interaction.selectedSite?'#a8efff':site===state.interaction.pendingSite?'#ff976d':'#ffe79a'} strokeWidth="1.5" />; })}
      {state.lastMove && [state.lastMove.from,state.lastMove.to].map((site,i)=>{ const p=point(site);return <circle key={i} cx={p.x} cy={p.y} r="5" fill="none" stroke="#ffe79a" strokeWidth={i?2:1} strokeDasharray={i?undefined:'2 2'} />;})}
    </svg>
    <small>自軍 ↓ · 全体位置</small>
  </aside>;
}
