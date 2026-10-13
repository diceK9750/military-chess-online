// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { LocalGame } from './LocalGame';
import { scenario } from '../dev/fixtures';
import { playCpuTurn } from '../cpu/turn';
import type { GameState } from '../game/types';

vi.mock('../cpu/turn', () => ({ playCpuTurn: vi.fn() }));
vi.mock('./sound', () => ({ playCue: vi.fn(), playVictory: vi.fn() }));
vi.mock('../battlefield3d/BattlefieldView', () => ({ BattlefieldView: (props: any) => <div>
  {props.primaryControls}{props.commands}
  <button onClick={() => props.onAnimationChange(true)}>Start animation</button>
  <button onClick={() => props.onAnimationChange(false)}>Stop animation</button>
</div> }));
beforeEach(() => { vi.useFakeTimers(); vi.mocked(playCpuTurn).mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear(); });
const cpuGame = (): GameState => ({ ...scenario('aircraft'), turn: 2 });
const tick = () => act(() => { vi.advanceTimersByTime(100); });
function openPieces() { fireEvent.click(screen.getByText('自軍の駒から選ぶ')); return document.querySelector('.own-piece-list') as HTMLElement; }

test('own piece list selects and deselects with no enemy identities or captured pieces', () => {
  const initial = scenario('aircraft');
  render(<LocalGame initial={{...initial, pieces:[...initial.pieces,{id:'gone',owner:1,type:'spy',position:null}]}} mode="cpu" />);
  const list = openPieces();
  const buttons = within(list).getAllByRole('button');
  expect(buttons).toHaveLength(2);
  expect(list).not.toHaveTextContent('工兵'); expect(list).not.toHaveTextContent('スパイ');
  const air = within(list).getByRole('button', {name:/飛行機.*HQ-P1/});
  fireEvent.click(air); expect(air).toHaveAttribute('aria-pressed','true');
  expect(screen.getByText(/移動先一覧/)).toBeInTheDocument();
  fireEvent.click(air); expect(air).toHaveAttribute('aria-pressed','false');
});
test('piece buttons lock during animation and unlock afterward', () => {
  render(<LocalGame initial={scenario('aircraft')} mode="cpu" />);
  const list = openPieces();
  fireEvent.click(screen.getByText('Start animation'));
  for(const button of within(list).getAllByRole('button')) expect(button).toBeDisabled();
  fireEvent.click(screen.getByText('Stop animation'));
  for(const button of within(list).getAllByRole('button')) expect(button).toBeEnabled();
});
test.each(['cpu','end'] as const)('piece buttons lock on %s', phase => {
  const initial = phase === 'cpu' ? cpuGame() : {...scenario('aircraft'),turn:null,result:{winner:1 as const,reason:'HQ_CAPTURE' as const}};
  render(<LocalGame initial={initial} mode="cpu" />);
  for(const button of within(openPieces()).getAllByRole('button')) expect(button).toBeDisabled();
});
test('failed CPU waits for manual retry and keeps original state, difficulty, seed despite rerenders', () => {
  const initial = cpuGame(), notify = vi.fn();
  vi.mocked(playCpuTurn).mockImplementationOnce(() => {throw Error('compute');}).mockReturnValueOnce({...initial,turn:1,moveCount:1});
  const view = render(<StrictMode><LocalGame initial={initial} mode="cpu" difficulty="normal" cpuSeed={42} onChange={notify} /></StrictMode>);
  tick(); expect(playCpuTurn).toHaveBeenCalledTimes(1);
  const first = vi.mocked(playCpuTurn).mock.calls[0];
  expect(screen.getByRole('alert')).toHaveTextContent('再試行');
  act(() => {vi.advanceTimersByTime(5000);}); expect(playCpuTurn).toHaveBeenCalledTimes(1);
  view.rerender(<StrictMode><LocalGame initial={initial} mode="cpu" difficulty="easy" cpuSeed={99} onChange={notify} /></StrictMode>);
  tick(); expect(playCpuTurn).toHaveBeenCalledTimes(1);
  const retry = screen.getByRole('button',{name:'コンピューターの着手を再試行'});
  act(() => {fireEvent.click(retry);fireEvent.click(retry);fireEvent.click(retry);});
  tick(); expect(playCpuTurn).toHaveBeenCalledTimes(2);
  expect(vi.mocked(playCpuTurn).mock.calls[1]).toEqual(first);
  expect(notify).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button',{name:'コンピューターの着手を再試行'})).not.toBeInTheDocument();
});
test('notification failure after CPU success never offers retry or doubles the move', () => {
  const initial=cpuGame(); vi.mocked(playCpuTurn).mockReturnValue({...initial,turn:1,moveCount:1});
  const notify=vi.fn(() => {throw Error('storage');});
  const view=render(<LocalGame initial={initial} mode="cpu" onChange={notify} />);
  tick(); expect(screen.getByRole('alert')).toHaveTextContent('着手は完了');
  expect(screen.queryByRole('button',{name:'コンピューターの着手を再試行'})).not.toBeInTheDocument();
  view.rerender(<LocalGame initial={initial} mode="cpu" onChange={()=>{}} />);
  tick(); expect(playCpuTurn).toHaveBeenCalledTimes(1); expect(notify).toHaveBeenCalledTimes(1);
});
test('unmount cancels initial and retry timers', () => {
  const first=render(<LocalGame initial={cpuGame()} mode="cpu" />);first.unmount();tick();expect(playCpuTurn).not.toHaveBeenCalled();
  vi.mocked(playCpuTurn).mockImplementation(() => {throw Error('compute');});
  const second=render(<LocalGame initial={cpuGame()} mode="cpu" />);tick();
  fireEvent.click(screen.getByRole('button',{name:'コンピューターの着手を再試行'}));second.unmount();tick();
  expect(playCpuTurn).toHaveBeenCalledTimes(1);
});
test('a second calculation failure still requires another explicit retry', () => {
  const initial=cpuGame();
  vi.mocked(playCpuTurn).mockImplementationOnce(()=>{throw Error('first');}).mockImplementationOnce(()=>{throw Error('second');}).mockReturnValueOnce({...initial,turn:1,moveCount:1});
  render(<LocalGame initial={initial} mode="cpu" difficulty="normal" cpuSeed={123} />);tick();
  fireEvent.click(screen.getByRole('button',{name:'コンピューターの着手を再試行'}));tick();
  expect(playCpuTurn).toHaveBeenCalledTimes(2);expect(screen.getByRole('alert')).toHaveTextContent('再試行');
  act(()=>{vi.advanceTimersByTime(5000);});expect(playCpuTurn).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button',{name:'コンピューターの着手を再試行'}));tick();
  expect(playCpuTurn).toHaveBeenCalledTimes(3);
  expect(vi.mocked(playCpuTurn).mock.calls[1]).toEqual(vi.mocked(playCpuTurn).mock.calls[0]);
  expect(vi.mocked(playCpuTurn).mock.calls[2]).toEqual(vi.mocked(playCpuTurn).mock.calls[0]);
});
test('a successful CPU move followed by human auto-pass processes the new snapshot once', () => {
  const initial=cpuGame(), next={...initial,moveCount:1,events:[...initial.events,{kind:'AUTO_PASS' as const,actor:1 as const}]};
  const notify=vi.fn();
  vi.mocked(playCpuTurn).mockReturnValueOnce(next).mockReturnValueOnce({...next,turn:1,moveCount:2});
  render(<LocalGame initial={initial} mode="cpu" cpuSeed={123} onChange={notify} />);tick();tick();tick();
  expect(playCpuTurn).toHaveBeenCalledTimes(2);expect(notify).toHaveBeenCalledTimes(2);
  expect(vi.mocked(playCpuTurn).mock.calls[1][0]).toBe(next);
  expect(vi.mocked(playCpuTurn).mock.calls[1][3]).not.toBe(vi.mocked(playCpuTurn).mock.calls[0][3]);
});
