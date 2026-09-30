import { expect, test } from 'vitest';
import { defaultPlacement, scenario } from '../dev/fixtures';
import { applyMove, startGame } from '../game/game';
import { PIECE_TYPES } from '../game/pieces';
import { chooseCpuMove, evaluateMove } from '../cpu/strategy';
import { observeForCpu } from '../cpu/observation';
import { toBattlefieldView } from '../battlefield3d/state';
import { tacticalView, recommendations, publicCpuExplanation } from './public';
import { inferEnemies } from './inference';
import type { GameState, PieceType } from '../game/types';

test('player adapter contains no enemy types, IDs, full state or enemy initial secrets',()=>{
 const game=startGame(defaultPlacement(1),defaultPlacement(2),1),view=tacticalView(game,1,[...game.pieces]);
 expect(view.ownInitial).toHaveLength(23); game.pieces.forEach(p=>expect(JSON.stringify(view)).not.toContain(p.id));
 expect(view.pieces.filter(p=>!p.known).every(p=>!('type'in p)&&!('id'in p))).toBe(true);
 expect(view).not.toHaveProperty('initialPlacements'); expect(view).not.toHaveProperty('events');
});
test('secret-only enemy type and ID changes cannot affect advice, inference, CPU public explanation or render analysis',()=>{
 let game=startGame(defaultPlacement(1),defaultPlacement(2),2); const own=game.pieces.filter(p=>p.owner===1);
 game=applyMove(game,chooseCpuMove(observeForCpu(game,2),'normal',9750)!);
 const enemyTypes=game.pieces.filter(p=>p.owner===2).map(p=>p.type);let enemyIndex=0;
 const changed:GameState={...game,pieces:game.pieces.map(p=>p.owner===2?{...p,id:`secret-change-${p.id}`,type:enemyTypes[(++enemyIndex)%enemyTypes.length]}:p)};
 const a=tacticalView(game,1,own),b=tacticalView(changed,1,own); expect(b).toEqual(a);
 expect(recommendations(b)).toEqual(recommendations(a)); expect(inferEnemies(b)).toEqual(inferEnemies(a));
 const event=a.history.find(e=>e.kind==='MOVE')!; if(event.kind!=='MOVE')throw new Error();
 expect(publicCpuExplanation(b,event)).toEqual(publicCpuExplanation(a,event));
 const analysis={routes:recommendations(a).map(e=>e.move),hypotheses:inferEnemies(a).map(h=>({position:h.position,count:h.candidates.length})),focusSite:null};
 expect(toBattlefieldView(changed,1,undefined,analysis)).toEqual(toBattlefieldView(game,1,undefined,analysis));
});
test('candidate recommendations are limited to three legal moves and never execute a move',()=>{
 const game=startGame(defaultPlacement(1),defaultPlacement(2),1),before=JSON.stringify(game),view=tacticalView(game,1);
 const choices=recommendations(view);expect(choices).toHaveLength(3);choices.forEach(c=>expect(view.legalMoves).toContainEqual(c.move)); expect(JSON.stringify(game)).toBe(before);
 expect(recommendations({...view,turn:2})).toEqual([]);
});
test('public non-bridge boundary crossing implies aircraft, never a fabricated probability',()=>{
 const game=scenario('highFlight'); const p2={...game,turn:2 as const,firstPlayer:2 as const,pieces:game.pieces.map(p=>p.position==='D7'?{...p,type:'aircraft' as const}:p)};
 const next=applyMove(p2,{from:'D7',to:'D3'}); const result=inferEnemies(tacticalView(next,1));
 expect(result.find(h=>h.position==='D3')!.candidates).toEqual(['aircraft']);expect(result.find(h=>h.position==='D3')!.evidence[0]).toContain('D7→D3');expect(JSON.stringify(result)).not.toContain('probability');
});
test('long movement along a bridge leaves engineer and aircraft as conservative alternatives',()=>{
 const game=startGame(defaultPlacement(1),defaultPlacement(2),2);
 const sparse={...game,pieces:[{id:'enemy',owner:2 as const,type:'engineer' as const,position:'B7' as const},{id:'self',owner:1 as const,type:'general' as const,position:'F2' as const},{id:'capturer',owner:2 as const,type:'general' as const,position:'F7' as const}]};
 const result=inferEnemies(tacticalView(applyMove(sparse,{from:'B7',to:'B4'}),1));
 expect(result.find(h=>h.position==='B4')!.candidates).toEqual(['aircraft','engineer']);
});
test('public combat against a known own officer excludes only inconsistent candidates',()=>{
 const game=scenario('highFlight');
 const before:GameState={...game,turn:2,firstPlayer:2,pieces:game.pieces.map(p=>p.position==='D7'?{...p,type:'aircraft' as const}:p.position==='D5'?{...p,type:'captain' as const}:p)};
 const own=before.pieces.filter(p=>p.owner===1);const next=applyMove(before,{from:'D7',to:'D5'});
 const hypothesis=inferEnemies(tacticalView(next,1,own)).find(h=>h.position==='D5')!;
 expect(hypothesis.candidates).toContain('aircraft');expect(hypothesis.candidates).not.toContain('engineer');expect(hypothesis.evidence).toHaveLength(2);
});
test('actual surviving enemy type always remains in conservative inference during generated games',()=>{
 for(let run=0;run<6;run++) {
  let game=startGame(defaultPlacement(1),defaultPlacement(2),2);const own=game.pieces.filter(p=>p.owner===1);
  for(let i=0;i<65&&!game.result;i++){
   game=applyMove(game,chooseCpuMove(observeForCpu(game,game.turn!),'easy',run*321+i)!);
   for(const h of inferEnemies(tacticalView(game,1,own))) expect(h.candidates,`run${run} move${i} ${h.position}`).toContain(game.pieces.find(p=>p.position===h.position)!.type);
  }
 }
});
test('forged unknown types cannot enter public evaluation or candidate inference',()=>{
 const view=tacticalView(startGame(defaultPlacement(1),defaultPlacement(2),1),1);
 const altered={...view,pieces:view.pieces.map(p=>p.known?p:{...p,type:'general' as PieceType,id:'not-public'})};
 expect(recommendations(altered)).toEqual(recommendations(view));expect(inferEnemies(altered)).toEqual(inferEnemies(view));expect(PIECE_TYPES).toHaveLength(16);
});

test('CPU public subtotal is exactly the public subset of its actual scoring terms', () => {
 const publicKeys = new Set(['approachEnemyHQ', 'defendOwnHQ', 'visibleCombat', 'repeatMove', 'avoidFiftyMoveDraw']);
 let game = startGame(defaultPlacement(1), defaultPlacement(2), 2);
 const own = game.pieces.filter(p => p.owner === 1);
 for (let i = 0; i < 100 && !game.result; i++) {
  const observation = observeForCpu(game, game.turn!);
  const move = chooseCpuMove(observation, 'normal', 9750 + i)!;
  const actual = evaluateMove(observation, move);
  const actor = game.turn;
  game = applyMove(game, move);
  if (actor !== 2) continue;
  const view = tacticalView(game, 1, own);
  const event = view.history.filter(e => e.kind === 'MOVE').at(-1)!;
  const publicScore = publicCpuExplanation(view, event);
  expect(publicScore.terms).toEqual(actual.terms.filter(t => publicKeys.has(t.key)));
  expect(publicScore.total).toBe(publicScore.terms.reduce((sum, t) => sum + t.value, 0));
 }
});
