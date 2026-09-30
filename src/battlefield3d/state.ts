import { SITES, anchors } from '../game/board';
import type { GameState, Move, Outcome, Piece, PieceType, Player, Site } from '../game/types';

export type BattlefieldPiece = { readonly owner: Player; readonly position: Site } & (
  { readonly unknown: true } | { readonly unknown: false; readonly type: PieceType }
);
export interface BattlefieldViewState {
  readonly battleOutcome?: Outcome;
  readonly analysis?: BattlefieldAnalysis;
  readonly phase?: 'setup';
  readonly viewer: Player;
  readonly moveCount: number;
  readonly finished: boolean;
  readonly battleSite: Site | null;
  readonly pieces: readonly BattlefieldPiece[];
  readonly lastMove: { readonly from: Site; readonly to: Site } | null;
  readonly interaction: BattlefieldInteraction;
}
export interface BattlefieldAnalysis { readonly routes: readonly Move[]; readonly hypotheses: readonly {position:Site;count:number}[]; readonly focusSite: Site|null }
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
export type CameraPreset = 'full' | 'top' | 'front' | 'selected';
const idle: BattlefieldInteraction = { selectedSite: null, legalTargets: [], pendingSite: null, laneCandidates: [], selectedLane: undefined, interactionEnabled: false };

/** Setup has no CPU placement or GameState. Copy only human pieces and public interaction. */
export function toSetupBattlefieldView(pieces: readonly Piece[], selected: Site | null, targets: readonly Site[]): BattlefieldViewState {
  return {
    phase: 'setup', viewer: 1, moveCount: 0, finished: false, battleSite: null, lastMove: null,
    pieces: SITES.flatMap(position => {
      const piece = pieces.find(candidate => candidate.owner === 1 && candidate.position === position);
      return piece ? [{ owner: 1 as const, position, unknown: false as const, type: piece.type }] : [];
    }),
    interaction: { selectedSite: selected, legalTargets: [...targets], pendingSite: null,
      laneCandidates: [], selectedLane: undefined, interactionEnabled: true },
  };
}

/** Copy allowlisted fields; never retain original objects or internal IDs. */
export function toBattlefieldView(game: GameState, viewer: Player, interaction: BattlefieldInteraction = idle, analysis?: BattlefieldAnalysis): BattlefieldViewState {
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
  return { ...(last?.battle?{battleOutcome:last.battle}:{}), ...(analysis?{analysis:{routes:analysis.routes.map(m=>({from:m.from,to:m.to,...(m.lane?{lane:m.lane}:{})})),hypotheses:analysis.hypotheses.map(h=>({position:h.position,count:h.count})),focusSite:analysis.focusSite}}:{}), viewer, moveCount: game.moveCount, finished: game.result !== null, battleSite: last?.battle ? last.move.to : null, pieces,
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
