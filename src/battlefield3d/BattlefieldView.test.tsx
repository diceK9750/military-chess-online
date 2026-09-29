// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { BattlefieldView } from './BattlefieldView';
import { toBattlefieldView } from './state';
import type { BattlefieldHandlers, BattlefieldViewState } from './state';
import { scenario } from '../dev/fixtures';
import { LocalGame } from '../ui/LocalGame';

const mock = vi.hoisted(() => ({ create: vi.fn(), reset: vi.fn(), dispose: vi.fn(), update: vi.fn() }));
vi.mock('./renderer', () => ({ createBattlefield: mock.create }));
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
  expect(mock.update).toHaveBeenLastCalledWith(next);
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
test('3D selection and pending synchronize with 2D, and retap commits only once', async () => {
  const changed = vi.fn();
  render(<LocalGame initial={scenario('highFlight')} onChange={changed} />);
  await waitFor(() => expect(mock.create).toHaveBeenCalled());
  act(() => input().onSiteSelect('D5'));
  expect(latest().interaction.selectedSite).toBe('D5');
  expect(latest().interaction.legalTargets).toContain('HQ-P2');
  expect(screen.getByRole('button', { name: 'D5 P1 飛行機' })).toHaveClass('selected');
  act(() => input().onSiteSelect('HQ-P2'));
  expect(latest().interaction.pendingSite).toBe('HQ-P2');
  expect(changed).not.toHaveBeenCalled();
  act(() => { input().onSiteSelect('HQ-P2'); input().onSiteSelect('HQ-P2'); });
  expect(changed).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'HQ-P2 P1 飛行機' })).toBeInTheDocument();
});
test('2D selection and 3D destination use the same confirm button', async () => {
  const changed = vi.fn();
  render(<LocalGame initial={scenario('highFlight')} onChange={changed} />);
  await waitFor(() => expect(mock.create).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'D5 P1 飛行機' }));
  expect(latest().interaction.selectedSite).toBe('D5');
  act(() => input().onSiteSelect('HQ-P2'));
  fireEvent.click(screen.getByRole('button', { name: '確定して実行' }));
  expect(changed).toHaveBeenCalledTimes(1);
});
test('HQ lane selection is shared, required, and recorded in MOVE', async () => {
  const changed = vi.fn();
  render(<LocalGame initial={scenario('aircraft')} onChange={changed} />);
  await waitFor(() => expect(mock.create).toHaveBeenCalled());
  act(() => input().onSiteSelect('HQ-P1'));
  fireEvent.click(screen.getByRole('button', { name: 'HQ-P2 P2 工兵' }));
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
});
