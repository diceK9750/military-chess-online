// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { applyMove, startGame } from '../game/game';
import { defaultPlacement } from '../dev/fixtures';
import { chooseCpuMove } from '../cpu/strategy';
import { observeForCpu } from '../cpu/observation';
import { Chronicle } from './Chronicle';
vi.mock('../battlefield3d/renderer',()=>({createBattlefield:()=>({backend:'webgl2',update:()=>{},reset:()=>{},setCamera:()=>{},dispose:()=>{}})}));
afterEach(()=>{cleanup();vi.useRealTimers();});
function fixture(){const initial={p1:defaultPlacement(1),p2:defaultPlacement(2)};let game=startGame(initial.p1,initial.p2,1);for(let i=0;i<1000&&!game.result;i++)game=applyMove(game,chooseCpuMove(observeForCpu(game,game.turn!),'normal',9750+i)!);return {game,initial};}
test('replay controls seek, step, change speed, pause and return without modifying source',async()=>{
 vi.useFakeTimers();const {game,initial}=fixture(),before=JSON.stringify(game),close=vi.fn();render(<Chronicle game={game} initial={initial} onClose={close}/>);await act(async()=>{});
 expect(screen.getByRole('status',{name:'再現中の手'})).toHaveTextContent('第0手');fireEvent.click(screen.getByRole('button',{name:'次の手'}));expect(screen.getByRole('status',{name:'再現中の手'})).toHaveTextContent('第1手');fireEvent.click(screen.getByRole('button',{name:'前の手'}));expect(screen.getByRole('status',{name:'再現中の手'})).toHaveTextContent('第0手');
 fireEvent.change(screen.getByRole('combobox',{name:'再現速度'}),{target:{value:'2'}});fireEvent.click(screen.getByRole('button',{name:'再生'}));await act(async()=>{await vi.advanceTimersByTimeAsync(500);});expect(screen.getByRole('status',{name:'再現中の手'})).toHaveTextContent('第1手');fireEvent.click(screen.getByRole('button',{name:'一時停止'}));await act(async()=>{await vi.advanceTimersByTimeAsync(1500);});expect(screen.getByRole('status',{name:'再現中の手'})).toHaveTextContent('第1手');
 fireEvent.change(screen.getByRole('slider',{name:'再現手数'}),{target:{value:String(game.moveCount)}});expect(screen.getByRole('status',{name:'再現中の手'})).toHaveTextContent(`第${game.moveCount}手`);expect(screen.getByRole('button',{name:'次の手'})).toBeDisabled();expect(document.querySelector('.board')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'結果画面へ戻る'}));expect(close).toHaveBeenCalledOnce();expect(JSON.stringify(game)).toBe(before);
});
test('unfinished source cannot be opened for replay',()=>{const initial={p1:defaultPlacement(1),p2:defaultPlacement(2)};render(<Chronicle game={startGame(initial.p1,initial.p2,1)} initial={initial} onClose={vi.fn()}/>);expect(screen.getByRole('alert')).toHaveTextContent('棋譜を再現できません');expect(screen.queryByLabelText('再現手数')).not.toBeInTheDocument();});
