export type Player = 1 | 2;
export type Column = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type Row = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type OrdinarySite = Exclude<`${Column}${Row}`, 'C1' | 'D1' | 'C8' | 'D8'>;
export type Site = OrdinarySite | 'HQ-P1' | 'HQ-P2';
export type PieceType = 'general' | 'lieutenantGeneral' | 'majorGeneral' | 'colonel' | 'lieutenantColonel' | 'major' | 'captain' | 'lieutenant' | 'secondLieutenant' | 'aircraft' | 'tank' | 'engineer' | 'cavalry' | 'spy' | 'mine' | 'flag';
export type EffectiveType = Exclude<PieceType, 'flag'>;
export interface Piece { readonly id: string; readonly owner: Player; readonly type: PieceType; readonly position: Site | null }
export interface Move { readonly from: Site; readonly to: Site; readonly lane?: 'C' | 'D' }
export type Outcome = 'ATTACKER' | 'DEFENDER' | 'MUTUAL';
export type EndReason = 'HQ_CAPTURE' | 'CAPTURERS_ELIMINATED' | 'BOTH_CAPTURERS_ELIMINATED' | 'NO_LEGAL_MOVES_BOTH' | 'FIFTY_NONCOMBAT_MOVES';
export interface Result { readonly winner: Player | null; readonly reason: EndReason }
export type GameEvent =
  | { readonly kind: 'START'; readonly firstPlayer: Player }
  | { readonly kind: 'MOVE'; readonly actor: Player; readonly move: Move; readonly moveNumber: number; readonly battle: Outcome | null }
  | { readonly kind: 'AUTO_PASS'; readonly actor: Player }
  | { readonly kind: 'END'; readonly result: Result };
export interface GameState {
  readonly rulesetVersion: string;
  readonly pieces: readonly Piece[];
  readonly firstPlayer: Player;
  readonly turn: Player | null;
  readonly moveCount: number;
  readonly noncombatCount: number;
  readonly result: Result | null;
  readonly events: readonly GameEvent[];
}
export class RuleError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'RuleError'; }
}
export const other = (side: Player): Player => side === 1 ? 2 : 1;
export const forward = (side: Player): number => side === 1 ? 1 : -1;
