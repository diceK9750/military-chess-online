import { hq } from './board';
import { combat, effectiveType } from './combat';
import { assertMove, legalMoves } from './movement';
import { PIECES, RULESET_VERSION } from './pieces';
import { validatePieces, validatePlacement } from './placement';
import { other, RuleError, type GameState, type Move, type Piece, type Player, type Result } from './types';

export function validateState(state: GameState): void {
  validatePieces(state.pieces);
  if (state.rulesetVersion !== RULESET_VERSION) throw new RuleError('UNSUPPORTED_RULESET');
  if (![1, 2].includes(state.firstPlayer) || (state.result === null ? ![1, 2].includes(state.turn!) : state.turn !== null)) throw new RuleError('INVALID_TURN');
  if (![state.moveCount, state.noncombatCount].every(n => Number.isSafeInteger(n) && n >= 0) || state.noncombatCount > state.moveCount) throw new RuleError('INVALID_COUNTER');
}
function end(state: GameState, result: Result): GameState {
  return { ...state, turn: null, result, events: [...state.events, { kind: 'END', result }] };
}
/** Used at start and after a move. Does not invent player PASS moves. */
export function settleTurn(state: GameState, candidate: Player): GameState {
  const nextHasMoves = legalMoves(state.pieces, candidate).length > 0;
  const otherHasMoves = legalMoves(state.pieces, other(candidate)).length > 0;
  if (!nextHasMoves && !otherHasMoves) return end(state, { winner: null, reason: 'NO_LEGAL_MOVES_BOTH' });
  if (state.noncombatCount >= 50) return end(state, { winner: null, reason: 'FIFTY_NONCOMBAT_MOVES' });
  return nextHasMoves ? { ...state, turn: candidate } : { ...state, turn: other(candidate), events: [...state.events, { kind: 'AUTO_PASS', actor: candidate }] };
}
export function startGame(p1: readonly Piece[], p2: readonly Piece[], firstPlayer: Player): GameState {
  validatePlacement(p1, 1); validatePlacement(p2, 2);
  const state: GameState = { rulesetVersion: RULESET_VERSION, pieces: [...p1, ...p2].map(p => ({ ...p })), firstPlayer, turn: firstPlayer, moveCount: 0, noncombatCount: 0, result: null, events: [{ kind: 'START', firstPlayer }] };
  validateState(state);
  return settleTurn(state, firstPlayer);
}
export function applyMove(state: GameState, move: Move): GameState {
  validateState(state);
  if (state.result || !state.turn) throw new RuleError('GAME_FINISHED');
  assertMove(state.pieces, state.turn, move);
  const actor = state.pieces.find(p => p.position === move.from)!;
  const target = state.pieces.find(p => p.position === move.to);
  const defender = target ? effectiveType(target, state.pieces) : null;
  const outcome = target ? defender === null ? 'ATTACKER' : combat(effectiveType(actor, state.pieces)!, defender) : null;
  const pieces = state.pieces.map(p => p.id === actor.id ? { ...p, position: outcome === 'DEFENDER' || outcome === 'MUTUAL' ? null : move.to } : p.id === target?.id && outcome !== 'DEFENDER' ? { ...p, position: null } : { ...p });
  const updated: GameState = { ...state, pieces, moveCount: state.moveCount + 1, noncombatCount: target ? 0 : state.noncombatCount + 1, events: [...state.events, { kind: 'MOVE', actor: state.turn, move: { ...move }, moveNumber: state.moveCount + 1, battle: outcome }] };
  if (PIECES[actor.type].captures && move.to === hq(other(actor.owner)) && pieces.find(p => p.id === actor.id)!.position !== null) return end(updated, { winner: actor.owner, reason: 'HQ_CAPTURE' });
  const counts = ([1, 2] as const).map(side => pieces.filter(p => p.owner === side && p.position && PIECES[p.type].captures).length);
  if (counts[0] === 0 && counts[1] === 0) return end(updated, { winner: null, reason: 'BOTH_CAPTURERS_ELIMINATED' });
  if (counts[0] === 0 || counts[1] === 0) return end(updated, { winner: counts[0] === 0 ? 2 : 1, reason: 'CAPTURERS_ELIMINATED' });
  return settleTurn(updated, other(state.turn));
}
