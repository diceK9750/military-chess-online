// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { BattlefieldView } from './BattlefieldView';
import { toBattlefieldView } from './state';
import type { BattlefieldHandlers, BattlefieldViewState } from './state';
import { scenario } from '../dev/fixtures';
import { LocalGame } from '../ui/LocalGame';
import { CpuSetup } from '../ui/CpuSetup';
import { useState } from 'react';
import type { GameState } from '../game/types';

const mock = vi.hoisted(() => ({ create: vi.fn(), reset: vi.fn(), dispose: vi.fn(), update: vi.fn() }));
vi.mock('./renderer', () => ({ createBattlefield: mock.create }));
vi.mock('./cinematicRenderer', () => ({createBattlefield:mock.create}));
beforeEach(() => {
  vi.clearAllMocks();
  mock.create.mockImplementation(() => ({ reset: mock.reset, dispose: mock.dispose, update: mock.update }));
});
afterEach(cleanup);
const state = () => toBattlefieldView(scenario('highFlight'), 1);
const handlers = { onSiteSelect: vi.fn(), onLaneSelect: vi.fn() };
const latest = (): BattlefieldViewState => mock.update.mock.calls.at(-1)?.[0] ?? mock.create.mock.calls.at(-1)![1];
const input = (): BattlefieldHandlers => mock.create.mock.calls.at(-1)![3];
test('automatically loads on mount, resets and disposes on every departure', async () => {
  for (let i = 1; i <= 3; i++) {
    const view = render(<BattlefieldView state={state()} {...handlers} />);
    await waitFor(() => expect(mock.create).toHaveBeenCalledTimes(i));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '戦場ビュー' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '視点を戻す' }));
    expect(mock.reset).toHaveBeenCalledTimes(i);
    expect(screen.getByRole('list', { name: '三次元表示中の駒' })).toHaveTextContent('HQ-P2 敵軍 不明');
    view.unmount();
    expect(mock.dispose).toHaveBeenCalledTimes(i);
    expect(document.body.style.overflow).toBe('');
  }
});
test('receives safe live updates without creating a second renderer', async () => {
  const view = render(<BattlefieldView state={state()} {...handlers} />);
  await waitFor(() => expect(mock.create).toHaveBeenCalledTimes(1));
  const next = { ...state(), moveCount: 4 };
  view.rerender(<BattlefieldView state={next} {...handlers} />);
  expect(mock.update).toHaveBeenLastCalledWith(expect.objectContaining(next));
  expect(latest().quality).toMatch(/light|standard|high/);
  expect(mock.create).toHaveBeenCalledTimes(1);
});
test('unsupported rendering and context loss preserve the surrounding game', async () => {
  mock.create.mockImplementationOnce(() => { throw new Error('No WebGL'); });
  const view = render(<BattlefieldView state={state()} {...handlers} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('二次元盤面で続けられます');
  view.unmount();
  render(<BattlefieldView state={state()} {...handlers} />);
  await waitFor(() => expect(mock.create).toHaveBeenCalledTimes(2));
  act(() => mock.create.mock.calls[1][2]());
  expect(mock.dispose).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: '視点を戻す' })).toBeDisabled();
});
test('departing before lazy loading resolves never creates a renderer', async () => {
  const view = render(<BattlefieldView state={state()} {...handlers} />);
  view.unmount();
  await act(async () => {});
  expect(mock.create).not.toHaveBeenCalled();
});

test('device loss clears animation busy and retries GL once before emergency fallback', async () => {
  const animation = vi.fn(), unavailable = vi.fn();
  mock.create.mockImplementationOnce(() => ({ backend: 'webgpu', reset: mock.reset, dispose: mock.dispose, update: mock.update }));
  render(<BattlefieldView state={state()} {...handlers} onAnimationChange={animation} onUnavailable={unavailable} />);
  await waitFor(() => expect(screen.getByRole('button', { name: '視点を戻す' })).toBeEnabled());
  act(() => input().onAnimationChange?.(true));
  act(() => mock.create.mock.calls[0][2]());
  expect(animation).toHaveBeenLastCalledWith(false);
  await waitFor(() => expect(mock.create).toHaveBeenCalledTimes(2));
  expect(mock.create.mock.calls[1][4]).toBe(true);
  expect(unavailable).not.toHaveBeenCalled();
  act(() => mock.create.mock.calls[1][2]());
  expect(unavailable).toHaveBeenCalledOnce();
  expect(mock.create).toHaveBeenCalledTimes(2);
});
test('3D selection and pending synchronize with assist UI, and retap commits only once', async () => {
  const changed = vi.fn();
  render(<LocalGame initial={scenario('highFlight')} onChange={changed} />);
  await waitFor(() => expect(mock.create).toHaveBeenCalled());
  act(() => input().onSiteSelect('D5'));
  expect(latest().interaction.selectedSite).toBe('D5');
  expect(latest().interaction.legalTargets).toContain('HQ-P2');
  expect(screen.getByText(/飛行機（D5）を選択中/)).toBeInTheDocument();
  expect(document.querySelector('.board')).toBeNull();
  act(() => input().onSiteSelect('HQ-P2'));
  expect(latest().interaction.pendingSite).toBe('HQ-P2');
  expect(changed).not.toHaveBeenCalled();
  act(() => { input().onSiteSelect('HQ-P2'); input().onSiteSelect('HQ-P2'); });
  expect(changed).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('list', { name: '三次元表示中の駒' })).toHaveTextContent('HQ-P2 自軍 飛行機');
});
test('3D selection and destination use the same confirm button', async () => {
  const changed = vi.fn();
  render(<LocalGame initial={scenario('highFlight')} onChange={changed} />);
  await waitFor(() => expect(mock.create).toHaveBeenCalled());
  act(() => input().onSiteSelect('D5'));
  expect(latest().interaction.selectedSite).toBe('D5');
  act(() => input().onSiteSelect('HQ-P2'));
  fireEvent.click(screen.getByRole('button', { name: '確定して実行' }));
  expect(changed).toHaveBeenCalledTimes(1);
});

test('drag and retap share official validation and reject duplicate or illegal drops', async () => {
  const changed=vi.fn();
  render(<LocalGame initial={scenario('highFlight')} onChange={changed}/>);
  await waitFor(()=>expect(mock.create).toHaveBeenCalled());
  act(()=>input().onDragStart?.('D5'));
  expect(latest().interaction.selectedSite).toBe('D5');
  act(()=>input().onPieceDrop?.('D5','A2'));
  expect(changed).not.toHaveBeenCalled();
  expect(latest().pieces).toContainEqual({owner:1,position:'D5',unknown:false,type:'aircraft'});
  act(()=>{input().onPieceDrop?.('D5','HQ-P2');input().onPieceDrop?.('D5','HQ-P2');});
  expect(changed).toHaveBeenCalledOnce();
  expect(changed.mock.calls[0][0].events.at(-1).move).toEqual({from:'D5',to:'HQ-P2'});
});
test.each(['C','D'] as const)('HQ drag uses official %s lane and preserves secrecy',async column=>{
  const changed=vi.fn();render(<LocalGame initial={scenario('aircraft')} onChange={changed}/>);
  await waitFor(()=>expect(mock.create).toHaveBeenCalled());
  act(()=>input().onDragStart?.('HQ-P1'));
  act(()=>input().onPieceDrop?.('HQ-P1','HQ-P2',column));
  expect(changed).toHaveBeenCalledOnce();expect(changed.mock.calls[0][0].events.at(-1).move.lane).toBe(column);
});
test('ambiguous HQ drop waits for the same lane selection and confirmation',async()=>{
  const changed=vi.fn();render(<LocalGame initial={scenario('aircraft')} onChange={changed}/>);
  await waitFor(()=>expect(mock.create).toHaveBeenCalled());
  act(()=>input().onPieceDrop?.('HQ-P1','HQ-P2'));
  expect(changed).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'確定して実行'})).toBeDisabled();
  act(()=>input().onLaneSelect('C'));fireEvent.click(screen.getByRole('button',{name:'確定して実行'}));expect(changed).toHaveBeenCalledOnce();
});
test('animation, CPU turn and terminal state block drag callbacks as well as click',async()=>{
  const changed=vi.fn(),view=render(<LocalGame initial={scenario('highFlight')} onChange={changed}/>);
  await waitFor(()=>expect(mock.create).toHaveBeenCalled());
  act(()=>input().onAnimationChange?.(true));act(()=>{input().onDragStart?.('D5');input().onPieceDrop?.('D5','HQ-P2');});expect(changed).not.toHaveBeenCalled();
  view.unmount();render(<LocalGame initial={{...scenario('highFlight'),result:{winner:1,reason:'HQ_CAPTURE'},turn:null}} onChange={changed}/>);
  await waitFor(()=>expect(mock.create).toHaveBeenCalledTimes(2));act(()=>input().onPieceDrop?.('D5','HQ-P2'));expect(changed).not.toHaveBeenCalled();
});
test('HQ lane selection is shared, required, and recorded in MOVE', async () => {
  const changed = vi.fn();
  render(<LocalGame initial={scenario('aircraft')} onChange={changed} />);
  await waitFor(() => expect(mock.create).toHaveBeenCalled());
  act(() => input().onSiteSelect('HQ-P1'));
  act(() => input().onSiteSelect('HQ-P2'));
  expect(latest().interaction.laneCandidates).toEqual(['C', 'D']);
  act(() => input().onSiteSelect('HQ-P2'));
  expect(changed).not.toHaveBeenCalled();
  act(() => input().onLaneSelect('D'));
  expect(screen.getByRole('radio', { name: 'D列を通る' })).toBeChecked();
  act(() => input().onSiteSelect('HQ-P2'));
  expect(changed.mock.calls[0][0].events.at(-1).move.lane).toBe('D');
});
test('illegal enemy selection, CPU turn and finished game cannot execute', async () => {
  const changed = vi.fn();
  const view = render(<LocalGame initial={scenario('highFlight')} onChange={changed} />);
  await waitFor(() => expect(mock.create).toHaveBeenCalled());
  act(() => { input().onSiteSelect('D7'); input().onSiteSelect('D7'); });
  expect(latest().interaction.pendingSite).toBeNull();
  expect(changed).not.toHaveBeenCalled();
  view.unmount(); mock.update.mockClear();
  const finished = render(<LocalGame initial={{ ...scenario('highFlight'), result: { winner: 1, reason: 'HQ_CAPTURE' }, turn: null }} onChange={changed} />);
  await waitFor(() => expect(mock.create).toHaveBeenCalledTimes(2));
  expect(latest().interaction.interactionEnabled).toBe(false);
  act(() => input().onSiteSelect('D5'));
  expect(changed).not.toHaveBeenCalled();
  finished.unmount(); mock.update.mockClear();
  render(<LocalGame initial={{ ...scenario('highFlight'), turn: 2 }} mode="cpu" onChange={changed} />);
  await waitFor(() => expect(mock.create).toHaveBeenCalledTimes(3));
  expect(latest().interaction.interactionEnabled).toBe(false);
  act(() => input().onSiteSelect('D5'));
  expect(changed).not.toHaveBeenCalled();
  act(() => { input().onDragStart?.('D5'); input().onPieceDrop?.('D5','HQ-P2'); });
  expect(changed).not.toHaveBeenCalled();
});

test('animation feedback disables all move paths without restarting the scene; context loss enables fallback', async () => {
  const changed = vi.fn();
  render(<LocalGame initial={scenario('highFlight')} onChange={changed} />);
  await waitFor(() => expect(mock.create).toHaveBeenCalled());
  act(() => input().onSiteSelect('D5'));
  act(() => input().onSiteSelect('HQ-P2'));
  const updates = mock.update.mock.calls.length;
  act(() => input().onAnimationChange?.(true));
  expect(mock.update).toHaveBeenCalledTimes(updates);
  expect(screen.getByRole('button', { name: '確定して実行' })).toBeDisabled();
  act(() => input().onSiteSelect('HQ-P2'));
  expect(changed).not.toHaveBeenCalled();
  act(() => mock.create.mock.calls[0][2]());
  expect(screen.getByRole('button', { name: '確定して実行' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'D5 P1 飛行機' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '確定して実行' }));
  expect(changed).toHaveBeenCalledTimes(1);
});

test('complete CPU game from 3D setup to terminal through 3D callbacks alone, with no Board ever mounted', async () => {
  vi.useFakeTimers();
  try {
    const { defaultPlacement } = await import('../dev/fixtures');
    const { legalMoves } = await import('../game/movement');
    const p1 = defaultPlacement(1);
    let game: GameState | null = null;
    function Journey() {
      const [started, setStarted] = useState<GameState | null>(null);
      return started
        ? <LocalGame initial={started} mode="cpu" cpuSeed={12} initialPlacements={{ p1, p2: started.pieces.filter(piece => piece.owner === 2) }} onChange={next => { game = next; }} />
        : <CpuSetup seed={12} difficulty="easy" initialPieces={p1} store={{ load: () => null, save: () => true }} onStart={next => { game = next; setStarted(next); }} />;
    }
    let boardMounted = false;
    const observer = new MutationObserver(records => {
      if (records.some(record => [...record.addedNodes].some(node => node instanceof Element && (node.matches('.board') || node.querySelector('.board'))))) boardMounted = true;
    });
    observer.observe(document, { childList: true, subtree: true });
    render(<Journey />);
    await act(async () => {});
    expect(latest().phase).toBe('setup');
    expect(latest().pieces).toHaveLength(23);
    fireEvent.click(screen.getByRole('button', { name: 'この配置で確定' }));
    await act(async () => {});
    const current = () => game!;
    for (let turns = 0; turns < 1200 && !current().result; turns++) {
      if (current().turn === 1) {
        const move = legalMoves(current().pieces, 1)[0];
        act(() => input().onSiteSelect(move.from));
        act(() => input().onSiteSelect(move.to));
        if (move.lane) act(() => input().onLaneSelect(move.lane!));
        act(() => input().onSiteSelect(move.to));
      }
      await act(async () => { await vi.advanceTimersByTimeAsync(80); });
      expect(document.querySelector('.board')).toBeNull();
    }
    observer.disconnect();
    expect(boardMounted).toBe(false);
    expect(current().result).not.toBeNull();
    expect(current().moveCount).toBeGreaterThan(1);
    expect(screen.getByRole('heading', { name: '対局終了' })).toBeInTheDocument();
    expect(document.querySelector('.board')).toBeNull();
    expect(latest().pieces.every(piece => !piece.unknown)).toBe(true);
    fireEvent.click(screen.getByText('終局後の全駒・初期配置・戦闘を確認'));
    expect(screen.getByText('コンピューターの初期配置')).toBeInTheDocument();
  } finally { vi.useRealTimers(); }
}, 20000); // Full match has a bounded 1,200-ply loop; allow shared CI CPU contention.

test.each([
  [{ winner: 1, reason: 'HQ_CAPTURE' }, 'あなたの勝利', 'あなたがコンピューターの司令部を占領'],
  [{ winner: 2, reason: 'CAPTURERS_ELIMINATED' }, 'あなたの敗北', 'あなたの司令部占領可能駒が全滅'],
  [{ winner: null, reason: 'BOTH_CAPTURERS_ELIMINATED' }, '引き分け', '双方の占領可能駒が全滅'],
  [{ winner: null, reason: 'NO_LEGAL_MOVES_BOTH' }, '引き分け', '双方に合法手なし'],
  [{ winner: null, reason: 'FIFTY_NONCOMBAT_MOVES' }, '引き分け', '戦闘なし50手'],
] as const)('battlefield result %j is prominent, named and noninteractive', async (result, label, reason) => {
  const initial = scenario('highFlight');
  render(<LocalGame mode="cpu" initial={{ ...initial, result, turn: null }} onNewGame={vi.fn()} onSave={vi.fn()} />);
  await waitFor(() => expect(mock.create).toHaveBeenCalled());
  const panel = screen.getByRole('status', { name: '対局結果' });
  expect(panel).toHaveTextContent(label);
  expect(panel).toHaveTextContent(reason);
  expect(panel.parentElement).toHaveClass('battlefield-stage');
  expect(screen.getByRole('button', { name: '新しい対局' })).toBeEnabled();
  expect(screen.getByRole('button', { name: '結果を保存' })).toBeEnabled();
  expect(latest().interaction.interactionEnabled).toBe(false);
  act(() => input().onPieceDrop?.('D5', 'HQ-P2'));
  expect(latest().moveCount).toBe(0);
});

test('a live victory remains fresh when parent autosave updates initial; resumed terminal is shortened',async()=>{
 function Parent(){const [game,setGame]=useState(scenario('capture'));return <LocalGame initial={game} mode="cpu" onChange={setGame}/>;}
 const view=render(<Parent/>);await waitFor(()=>expect(mock.create).toHaveBeenCalled());
 act(()=>input().onSiteSelect('C7'));act(()=>input().onSiteSelect('HQ-P2'));act(()=>input().onSiteSelect('HQ-P2'));
 expect(latest().finished).toBe(true);expect(latest().freshVictory).toBe(true);view.unmount();
 render(<LocalGame initial={{...scenario('capture'),result:{winner:1,reason:'HQ_CAPTURE'},turn:null}} mode="cpu"/>);
 await waitFor(()=>expect(mock.create).toHaveBeenCalledTimes(2));expect(latest().freshVictory).toBe(false);
});

test('primary confirmation lives below the canvas and outside optional commands', async () => {
 render(<LocalGame initial={scenario('highFlight')}/>);
 await waitFor(()=>expect(mock.create).toHaveBeenCalled());
 act(()=>input().onSiteSelect('D5')); act(()=>input().onSiteSelect('HQ-P2'));
 const confirm=screen.getByRole('button',{name:'確定して実行'});
 expect(confirm.closest('.battlefield-primary')).not.toBeNull();
 expect(confirm.closest('.command-deck')).toBeNull();
 expect(confirm.closest('.battlefield-stage')).toBeNull();
 const viewport=document.querySelector('.battlefield-viewport')!;
 expect(viewport.contains(confirm)).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'選び直す'}));
 expect(latest().interaction.selectedSite).toBe('D5');
 expect(latest().interaction.pendingSite).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'選択を解除'}));
 expect(latest().interaction.selectedSite).toBeNull();
});
test('automatic camera feedback updates compact toolbar and safe overview', async () => {
 const selected={...state(),interaction:{...state().interaction,selectedSite:'D5' as const,legalTargets:['D6' as const],interactionEnabled:true}};
 render(<BattlefieldView state={selected} {...handlers}/>);
 await waitFor(()=>expect(mock.create).toHaveBeenCalled());
 act(()=>input().onCameraChange?.('selected'));
 expect(screen.getByRole('button',{name:'選択中の駒'})).toHaveAttribute('aria-pressed','true');
 expect(screen.getByRole('img',{name:'全体位置図'})).toBeInTheDocument();
 act(()=>input().onCameraChange?.('full'));
 expect(screen.getByRole('button',{name:'全景'})).toHaveAttribute('aria-pressed','true');
 expect(screen.queryByRole('img',{name:'全体位置図'})).not.toBeInTheDocument();
});

test('rendering failure at game end keeps result actions available in the fallback stage', async () => {
 const onNewGame=vi.fn(),onSave=vi.fn();
 render(<LocalGame initial={{...scenario('capture'),turn:null,result:{winner:1,reason:'HQ_CAPTURE'}}} mode="cpu" onNewGame={onNewGame} onSave={onSave}/>);
 await waitFor(()=>expect(mock.create).toHaveBeenCalled());
 act(()=>mock.create.mock.calls[0][2]());
 const result=screen.getByRole('status',{name:'対局結果'});
 expect(result.closest('.battlefield-error')).not.toBeNull();
 expect(result.parentElement).toHaveClass('battlefield-stage');
 fireEvent.click(screen.getByRole('button',{name:'結果を保存'}));
 fireEvent.click(screen.getByRole('button',{name:'新しい対局'}));
 expect(onSave).toHaveBeenCalledOnce();expect(onNewGame).toHaveBeenCalledOnce();
});
