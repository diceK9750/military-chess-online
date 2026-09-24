import { legalMoves } from '../game/movement';
import { validateState } from '../game/game';
import type { GameEvent, GameState, Move, Outcome, PieceType, Player, Site } from '../game/types';

export type CpuKnownPiece = Readonly<{ id: string; owner: Player; type: PieceType; position: Site; known: true }>;
export type CpuUnknownPiece = Readonly<{ owner: Player; position: Site; known: false }>;
export type CpuVisiblePiece = CpuKnownPiece | CpuUnknownPiece;
export type PublicEvent =
  | Readonly<{ kind: 'START'; firstPlayer: Player }>
  | Readonly<{ kind: 'MOVE'; actor: Player; move: Move; moveNumber: number; battle: Outcome | null }>
  | Readonly<{ kind: 'AUTO_PASS'; actor: Player }>
  | Readonly<{ kind: 'END'; winner: Player | null; reason: string }>;
export interface CpuObservation {
  readonly side: Player;
  readonly turn: Player | null;
  readonly pieces: readonly CpuVisiblePiece[];
  readonly legalMoves: readonly Move[];
  readonly history: readonly PublicEvent[];
  readonly noncombatCount: number;
  readonly moveCount: number;
}

function publicEvent(event: GameEvent): PublicEvent {
  if (event.kind === 'START') return { kind: 'START', firstPlayer: event.firstPlayer };
  if (event.kind === 'AUTO_PASS') return { kind: 'AUTO_PASS', actor: event.actor };
  if (event.kind === 'END') return { kind: 'END', winner: event.result.winner, reason: event.result.reason };
  return { kind: 'MOVE', actor: event.actor, move: { ...event.move }, moveNumber: event.moveNumber, battle: event.battle };
}

/** The only adapter allowed to read the full position before CPU deliberation. */
export function observeForCpu(state: GameState, side: Player): CpuObservation {
  validateState(state);
  return {
    side,
    turn: state.turn,
    pieces: state.pieces.filter(piece => piece.position !== null).map(piece => piece.owner === side
      ? { id: piece.id, owner: piece.owner, type: piece.type, position: piece.position!, known: true as const }
      : { owner: piece.owner, position: piece.position!, known: false as const }),
    legalMoves: state.turn === side && !state.result ? legalMoves(state.pieces, side).map(move => ({ ...move })) : [],
    history: state.events.map(publicEvent),
    noncombatCount: state.noncombatCount,
    moveCount: state.moveCount,
  };
}
