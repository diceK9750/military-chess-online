import { SITES, anchors } from '../game/board';
import type { GameState, Move, Outcome, Piece, PieceType, Player, Result, Site } from '../game/types';

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
  readonly result?: Result;
  readonly playerTurn?: Player | null;
  readonly battleSite: Site | null;
  readonly pieces: readonly BattlefieldPiece[];
  readonly lastMove: { readonly from: Site; readonly to: Site; readonly actor?: Player; readonly type?: PieceType; readonly lane?: 'C' | 'D' } | null;
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
  onDragStart?(site: Site): void;
  onPieceDrop?(from: Site, to: Site, lane?: 'C' | 'D'): void;
  onAnimationChange?(active: boolean): void;
}
export type CameraPreset = 'full' | 'top' | 'front' | 'enemy' | 'selected' | 'last';
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
export function toBattlefieldView(game: GameState, viewer: Player, interaction: BattlefieldInteraction = idle, analysis?: BattlefieldAnalysis, initialPieces: readonly Piece[] = []): BattlefieldViewState {
  const last = [...game.events].reverse().find(event => event.kind === 'MOVE');
  // Track only disclosed types through public events, including a mover removed in its last battle.
  const known = new Map<Site, PieceType>(initialPieces.filter(p => p.position && (p.owner === viewer || game.result !== null)).map(p => [p.position!, p.type]));
  let lastType: PieceType | undefined;
  for (const event of game.events) {
    if (event.kind !== 'MOVE') continue;
    const type = known.get(event.move.from);
    if (event === last) lastType = type;
    known.delete(event.move.from);
    if (event.battle !== 'DEFENDER') known.delete(event.move.to);
    if (type && event.battle !== 'DEFENDER' && event.battle !== 'MUTUAL') known.set(event.move.to, type);
  }
  if (!lastType && last && (last.actor === viewer || game.result !== null) && last.battle !== 'DEFENDER' && last.battle !== 'MUTUAL') {
    lastType = game.pieces.find(p => p.position === last.move.to && p.owner === last.actor)?.type;
  }
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
    playerTurn: game.turn, ...(game.result ? { result: { winner: game.result.winner, reason: game.result.reason } } : {}),
    lastMove: last ? { from: last.move.from, to: last.move.to, actor: last.actor, ...(last.move.lane ? { lane: last.move.lane } : {}), ...(lastType ? { type: lastType } : {}) } : null,
    interaction: { selectedSite: interaction.selectedSite, legalTargets: [...interaction.legalTargets], pendingSite: interaction.pendingSite,
      laneCandidates: [...interaction.laneCandidates], selectedLane: interaction.selectedLane, interactionEnabled: interaction.interactionEnabled && !game.result } };
}

/** P1 is toward +Z; HQ has a single center at X=0. This is display geometry only. */
export function sitePoint(site: Site): { x: number; z: number } {
  const points = anchors(site);
  return { x: points.reduce((sum, point) => sum + point.x, 0) / points.length - 2.5, z: 4.5 - points[0].y };
}
export const BRIDGES = [{ from: 'B4', to: 'B5' }, { from: 'E4', to: 'E5' }] as const;
