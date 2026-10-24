// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { applyMove, startGame } from '../game/game';
import { defaultPlacement } from '../dev/fixtures';
import { chooseCpuMove } from '../cpu/strategy';
import { observeForCpu } from '../cpu/observation';
import { Chronicle } from './Chronicle';
import { chronicleFrames } from '../intelligence/chronicle';
import { chronicleStory } from '../intelligence/chronicleStory';
import { cinemaDelay, cinemaPlaybackRetime, cinemaPlaybackSchedule } from '../battlefield3d/cinemaPresentation';
vi.mock('../battlefield3d/renderer',()=>({createBattlefield:()=>({backend:'webgl2',update:()=>{},reset:()=>{},setCamera:()=>{},dispose:()=>{}})}));
const replayMock=vi.hoisted(()=>({complete:undefined as ((moveCount:number)=>void)|undefined}));
vi.mock('../battlefield3d/cinematicRenderer',()=>({createBattlefield:(_host:unknown,_state:unknown,_fail:unknown,handlers:{onReplayComplete?:(n:number)=>void})=>{replayMock.complete=handlers.onReplayComplete;return {backend:'webgl2',update:()=>{},reset:()=>{},setCamera:()=>{},dispose:()=>{}};}}));
afterEach(()=>{cleanup();vi.useRealTimers();});
function fixture(){const initial={p1:defaultPlacement(1),p2:defaultPlacement(2)};let game=startGame(initial.p1,initial.p2,1);for(let i=0;i<1000&&!game.result;i++)game=applyMove(game,chooseCpuMove(observeForCpu(game,game.turn!),'normal',9750+i)!);return {game,initial};}
test('replay controls seek, step, change speed, pause and return without modifying source',async()=>{
 vi.useFakeTimers();const {game,initial}=fixture(),before=JSON.stringify(game),close=vi.fn();render(<Chronicle game={game} initial={initial} onClose={close}/>);await act(async()=>{});
 expect(document.querySelector('.chronicle-provenance')).toBeInTheDocument();expect(document.querySelector('.chronicle-event')).toHaveTextContent('0');
 fireEvent.click(document.querySelectorAll('.chronicle-controls button.secondary')[1]!);expect(document.querySelector('.chronicle-event')).toHaveTextContent('1');fireEvent.click(document.querySelectorAll('.chronicle-controls button.secondary')[0]!);expect(document.querySelector('.chronicle-event')).toHaveTextContent('0');
 fireEvent.change(screen.getByRole('combobox',{name:'再現速度'}),{target:{value:'2'}});fireEvent.click(document.querySelector('.chronicle-controls .primary')!);await act(async()=>{await vi.advanceTimersByTimeAsync(500);});expect(document.querySelector('.chronicle-event')).toHaveTextContent('1');fireEvent.click(document.querySelector('.chronicle-controls .primary')!);await act(async()=>{await vi.advanceTimersByTimeAsync(1500);});expect(document.querySelector('.chronicle-event')).toHaveTextContent('1');
 fireEvent.change(screen.getByRole('slider'),{target:{value:String(game.moveCount)}});expect(document.querySelector('.chronicle-event')).toHaveTextContent(String(game.moveCount));expect(document.querySelectorAll('.chronicle-controls button.secondary')[1]).toBeDisabled();expect(document.querySelector('.board')).toBeNull();fireEvent.click(document.querySelector('.command-deck .actions button.secondary')!);expect(close).toHaveBeenCalledOnce();expect(JSON.stringify(game)).toBe(before);
});
test('unfinished source cannot be opened for replay',()=>{const initial={p1:defaultPlacement(1),p2:defaultPlacement(2)};render(<Chronicle game={startGame(initial.p1,initial.p2,1)} initial={initial} onClose={vi.fn()}/>);expect(screen.getByRole('alert')).toHaveTextContent('棋譜を再現できません');expect(screen.queryByLabelText('再現手数')).not.toBeInTheDocument();});

test('final recorded move has a full dwell and pausing it does not restart the war', async()=>{
 vi.useFakeTimers();const {game,initial}=fixture();const frames=chronicleFrames(game,initial),{scenes}=chronicleStory(frames);
 render(<Chronicle game={game} initial={initial} onClose={vi.fn()}/>);await act(async()=>{});
 const previous=frames.length-2;fireEvent.change(screen.getByRole('slider',{name:'再現手数'}),{target:{value:String(previous)}});
 fireEvent.click(document.querySelector('.chronicle-controls .primary')!);
 const event=[...frames[previous].events].reverse().find(e=>e.kind==='MOVE');
 await act(async()=>{await vi.advanceTimersByTimeAsync(cinemaDelay(scenes[previous],1,previous>0,!!event?.battle));});
 expect(screen.getByRole('status',{name:'再現中の手'})).toHaveTextContent(`第${game.moveCount}手`);
 expect(screen.getByRole('button',{name:'一時停止'})).toBeInTheDocument();
 fireEvent.click(document.querySelector('.chronicle-controls .primary')!);
 expect(screen.getByRole('slider',{name:'再現手数'})).toHaveValue(String(game.moveCount));
 expect(screen.getByRole('button',{name:'最初から再生'})).toBeInTheDocument();
 fireEvent.click(document.querySelector('.chronicle-controls .primary')!);
 expect(screen.getByRole('slider',{name:'再現手数'})).toHaveValue('0');
});

test('unmounting playback clears its pending timer',async()=>{
 vi.useFakeTimers();const {game,initial}=fixture();const mounted=render(<Chronicle game={game} initial={initial} onClose={vi.fn()}/>);await act(async()=>{});
 fireEvent.click(document.querySelector('.chronicle-controls .primary')!);await act(async()=>{await vi.advanceTimersByTimeAsync(250);});expect(vi.getTimerCount()).toBeGreaterThan(0);
 mounted.unmount();expect(vi.getTimerCount()).toBe(0);
});
test('hidden tabs pause replay time and resume without skipping a scene',async()=>{
 vi.useFakeTimers();const {game,initial}=fixture(),frames=chronicleFrames(game,initial),{scenes}=chronicleStory(frames),index=1,event=[...frames[index].events].reverse().find(e=>e.kind==='MOVE'),schedule=cinemaPlaybackSchedule(scenes[index],1,true,!!event?.battle),original=Object.getOwnPropertyDescriptor(document,'visibilityState');
 try{
  render(<Chronicle game={game} initial={initial} onClose={vi.fn()}/>);await act(async()=>{});
  fireEvent.change(screen.getByRole('slider'),{target:{value:String(index)}});fireEvent.click(document.querySelector('.chronicle-controls .primary')!);await act(async()=>{await vi.advanceTimersByTimeAsync(300);});
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});await act(async()=>{document.dispatchEvent(new Event('visibilitychange'));});
  await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});expect(screen.getByRole('slider')).toHaveValue(String(index));
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});await act(async()=>{document.dispatchEvent(new Event('visibilitychange'));});
  await act(async()=>{await vi.advanceTimersByTimeAsync(schedule.duration-300-1);});expect(screen.getByRole('slider')).toHaveValue(String(index));
  await act(async()=>{await vi.advanceTimersByTimeAsync(2);});expect(screen.getByRole('slider')).toHaveValue(String(index+1));
 }finally{if(original)Object.defineProperty(document,'visibilityState',original);else Reflect.deleteProperty(document, 'visibilityState');}
});
test('pausing and changing speed preserve the current scene timer progress',async()=>{
 vi.useFakeTimers();const {game,initial}=fixture(),frames=chronicleFrames(game,initial),{scenes}=chronicleStory(frames),index=1,event=[...frames[index].events].reverse().find(e=>e.kind==='MOVE');
 const before=cinemaPlaybackSchedule(scenes[index],1,true,!!event?.battle),after=cinemaPlaybackSchedule(scenes[index],2,true,!!event?.battle),elapsed=300,retimed=cinemaPlaybackRetime(elapsed,before,after),remaining=after.duration-retimed;
 render(<Chronicle game={game} initial={initial} onClose={vi.fn()}/>);await act(async()=>{});
 fireEvent.change(screen.getByRole('slider'),{target:{value:String(index)}});
 fireEvent.click(document.querySelector('.chronicle-controls .primary')!);await act(async()=>{await vi.advanceTimersByTimeAsync(elapsed);});
 fireEvent.click(document.querySelector('.chronicle-controls .primary')!);await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
 expect(screen.getByRole('slider')).toHaveValue(String(index));
 fireEvent.change(screen.getByRole('combobox',{name:'再現速度'}),{target:{value:'2'}});fireEvent.click(document.querySelector('.chronicle-controls .primary')!);
 await act(async()=>{await vi.advanceTimersByTimeAsync(Math.max(0,remaining-5));});expect(screen.getByRole('slider')).toHaveValue(String(index));
 await act(async()=>{await vi.advanceTimersByTimeAsync(10);});expect(screen.getByRole('slider')).toHaveValue(String(index+1));
});









test('the final playback clock waits for the renderer before stopping',async()=>{
 vi.useFakeTimers();const {game,initial}=fixture(),frames=chronicleFrames(game,initial),{scenes}=chronicleStory(frames);render(<Chronicle game={game} initial={initial} onClose={vi.fn()}/>);await act(async()=>{});const previous=frames.length-2;fireEvent.change(screen.getByRole('slider',{name:'再現手数'}),{target:{value:String(previous)}});fireEvent.click(screen.getByRole('button',{name:'再生'}));const event=[...frames[previous].events].reverse().find(e=>e.kind==='MOVE');await act(async()=>{await vi.advanceTimersByTimeAsync(cinemaDelay(scenes[previous],1,true,!!event?.battle));});await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});expect(screen.getByRole('button',{name:'一時停止'})).toBeInTheDocument();expect(screen.getByRole('slider',{name:'再現手数'})).toHaveValue(String(game.moveCount));act(()=>replayMock.complete?.(game.moveCount-1));expect(screen.getByRole('button',{name:'一時停止'})).toBeInTheDocument();act(()=>replayMock.complete?.(game.moveCount));expect(screen.getByRole('button',{name:'最初から再生'})).toBeInTheDocument();
});
