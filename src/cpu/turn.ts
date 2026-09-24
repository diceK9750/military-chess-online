import { applyMove, settleTurn, validateState } from '../game/game';
import { legalMoves } from '../game/movement';
import { RuleError, type GameState, type Player } from '../game/types';
import { observeForCpu } from './observation';
import { chooseCpuMove, type Difficulty } from './strategy';

/** The CPU uses the same authoritative transition as a human move. */
export function playCpuTurn(state: GameState, side: Player, difficulty: Difficulty, seed: number): GameState {
  validateState(state);
  if (state.result) return state;
  if (state.turn !== side) throw new RuleError('NOT_CPU_TURN');
  if (legalMoves(state.pieces, side).length === 0) return settleTurn(state, side);
  const view = observeForCpu(state, side);
  const move = chooseCpuMove(view, difficulty, seed);
  if (!move) throw new RuleError('CPU_NO_MOVE');
  return applyMove(state, move);
}
