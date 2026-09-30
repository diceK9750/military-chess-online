import { applyMove, startGame } from '../game/game';
import { RuleError, type GameState, type Piece } from '../game/types';
import { toBattlefieldView } from '../battlefield3d/state';
/** Replay is available only for a finished source. The authoritative engine reconstructs every frame. */
export function chronicleFrames(final:GameState,initial:{readonly p1:readonly Piece[];readonly p2:readonly Piece[]}):readonly GameState[] {
  if(!final.result)throw new RuleError('REPLAY_NOT_FINISHED');
  let state=startGame(initial.p1,initial.p2,final.firstPlayer);const frames=[state];
  for(const event of final.events)if(event.kind==='MOVE') {
    state=applyMove(state,event.move);
    const actual=state.events.find(e=>e.kind==='MOVE'&&e.moveNumber===event.moveNumber);
    if(actual?.kind!=='MOVE'||actual.actor!==event.actor||actual.battle!==event.battle)throw new RuleError('REPLAY_MISMATCH');
    frames.push(state);
  }
  if(JSON.stringify(state)!==JSON.stringify(final))throw new RuleError('REPLAY_MISMATCH');
  return frames;
}
export function chronicleView(frame:GameState,finishedSource:GameState,initialPieces:readonly Piece[] = []) {
  if(!finishedSource.result)throw new RuleError('REPLAY_NOT_FINISHED');
  // Finished-source permission applies to every historical frame; never change the replay's game state.
  return { ...toBattlefieldView({...frame,result:finishedSource.result},1,undefined,undefined,initialPieces), phase: 'replay' as const };
}
