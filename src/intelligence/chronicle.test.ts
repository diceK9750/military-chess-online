import { expect, test } from 'vitest';
import { applyMove, startGame } from '../game/game';
import { defaultPlacement } from '../dev/fixtures';
import { chooseCpuMove } from '../cpu/strategy';
import { observeForCpu } from '../cpu/observation';
import { chronicleFrames, chronicleView } from './chronicle';
import { allowBattleCamera, motionProfile } from '../battlefield3d/presentation';
import { PIECE_TYPES } from '../game/pieces';
function finished(){const initial={p1:defaultPlacement(1),p2:defaultPlacement(2)};let game=startGame(initial.p1,initial.p2,1);for(let i=0;i<1000&&!game.result;i++)game=applyMove(game,chooseCpuMove(observeForCpu(game,game.turn!),'normal',9750+i)!);if(!game.result)throw new Error('No terminal fixture');return {game,initial};}
test('chronicle reconstructs the exact initial, arbitrary and final positions without changing source',()=>{
 const {game,initial}=finished(),before=JSON.stringify({game,initial}),frames=chronicleFrames(game,initial);
 expect(frames).toHaveLength(game.moveCount+1);expect(frames[0]).toEqual(startGame(initial.p1,initial.p2,1));expect(frames.at(-1)).toEqual(game);
 for(let i=1;i<frames.length;i++)expect(frames[i].moveCount).toBe(i);
 expect(JSON.stringify({game,initial})).toBe(before);expect(frames[0].pieces).not.toBe(initial.p1);
});
test('replay disclosure rejects ongoing games and reveals every historical frame only after source ended',()=>{
 const {game,initial}=finished(),frames=chronicleFrames(game,initial);expect(()=>chronicleFrames(frames[0],initial)).toThrow('REPLAY_NOT_FINISHED');expect(()=>chronicleView(frames[0],frames[0])).toThrow('REPLAY_NOT_FINISHED');
 expect(chronicleView(frames[0],game).pieces.every(p=>!p.unknown)).toBe(true);expect(chronicleView(frames[0],game).interaction.interactionEnabled).toBe(false);
});
test('tampered history is refused rather than inventing replay rules',()=>{const {game,initial}=finished();expect(()=>chronicleFrames({...game,events:game.events.filter(e=>e.kind!=='MOVE'||e.moveNumber!==1)},initial)).toThrow();});
test('hidden enemy motion is identical for every secretly changed type',()=>{for(const type of PIECE_TYPES){const p={owner:2 as const,position:'B5' as const,unknown:true as const,type};expect(motionProfile(p)).toEqual({duration:300,height:.12,easing:'linear'});}expect(motionProfile({owner:1,position:'B1',unknown:false,type:'aircraft'}).height).toBe(.7);expect(motionProfile({owner:1,position:'B1',unknown:false,type:'tank'}).easing).toBe('heavy');});
test('director respects reduced motion and recent manual camera movement',()=>{expect(allowBattleCamera(true,10000)).toBe(false);expect(allowBattleCamera(false,2999)).toBe(false);expect(allowBattleCamera(false,3001)).toBe(true);});
