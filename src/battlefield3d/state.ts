import { SITES, anchors } from '../game/board';
import type { GameState, PieceType, Player, Site } from '../game/types';

export type BattlefieldPiece = { readonly owner: Player; readonly position: Site } & (
  { readonly unknown: true } | { readonly unknown: false; readonly type: PieceType }
);
export interface BattlefieldViewState {
  readonly viewer: Player;
  readonly moveCount: number;
  readonly finished: boolean;
  readonly battleSite: Site | null;
  readonly pieces: readonly BattlefieldPiece[];
  readonly lastMove: { readonly from: Site; readonly to: Site } | null;
  readonly interaction: BattlefieldInteraction;
}
export interface BattlefieldInteraction {
  readonly selectedSite: Site | null;
  readonly legalTargets: readonly Site[];
  readonly pendingSite: Site | null;
  readonly laneCandidates: readonly ('C' | 'D')[];
  readonly selectedLane: 'C' | 'D' | undefined;
  readonly interactionEnabled: boolean;
}
export interface BattlefieldHandlers {
  onSiteSelect(site: Site): void;
  onLaneSelect(lane: 'C' | 'D'): void;
  onAnimationChange?(active: boolean): void;
}
const idle: BattlefieldInteraction = { selectedSite: null, legalTargets: [], pendingSite: null, laneCandidates: [], selectedLane: undefined, interactionEnabled: false };

/** Copy allowlisted fields; never retain original objects or internal IDs. */
export function toBattlefieldView(game: GameState, viewer: Player, interaction: BattlefieldInteraction = idle): BattlefieldViewState {
  const last = [...game.events].reverse().find(event => event.kind === 'MOVE');
  const pieces: BattlefieldPiece[] = [];
  // Site order removes correlations with internal IDs and placement order.
  for (const position of SITES) {
    const piece = game.pieces.find(candidate => candidate.position === position);
    if (!piece) continue;
    pieces.push(piece.owner === viewer || game.result !== null
      ? { owner: piece.owner, position, unknown: false, type: piece.type }
      : { owner: piece.owner, position, unknown: true });
  }
  return { viewer, moveCount: game.moveCount, finished: game.result !== null, battleSite: last?.battle ? last.move.to : null, pieces,
    lastMove: last ? { from: last.move.from, to: last.move.to } : null,
    interaction: { selectedSite: interaction.selectedSite, legalTargets: [...interaction.legalTargets], pendingSite: interaction.pendingSite,
      laneCandidates: [...interaction.laneCandidates], selectedLane: interaction.selectedLane, interactionEnabled: interaction.interactionEnabled && !game.result } };
}

/** P1 is toward +Z; HQ has a single center at X=0. This is display geometry only. */
export function sitePoint(site: Site): { x: number; z: number } {
  const points = anchors(site);
  return { x: points.reduce((sum, point) => sum + point.x, 0) / points.length - 2.5, z: 4.5 - points[0].y };
}
export const BRIDGES = [{ from: 'B4', to: 'B5' }, { from: 'E4', to: 'E5' }] as const;
