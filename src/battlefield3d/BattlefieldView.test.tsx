// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { BattlefieldView } from './BattlefieldView';
import { toBattlefieldView } from './state';
import { scenario } from '../dev/fixtures';

const mock = vi.hoisted(() => ({ create: vi.fn(), reset: vi.fn(), dispose: vi.fn(), update: vi.fn() }));
vi.mock('./renderer', () => ({ createBattlefield: mock.create }));
beforeEach(() => {
  vi.clearAllMocks();
  mock.create.mockImplementation(() => ({ reset: mock.reset, dispose: mock.dispose, update: mock.update }));
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);
const state = () => toBattlefieldView(scenario('highFlight'), 1);
test('loads only on open, resets, restores scrolling and disposes on each close', async () => {
  render(<BattlefieldView state={state()} />);
  expect(mock.create).not.toHaveBeenCalled();
  for (let i = 1; i <= 3; i++) {
    fireEvent.click(screen.getByRole('button', { name: '戦場ビュー' }));
    await waitFor(() => expect(mock.create).toHaveBeenCalledTimes(i));
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: '視点を戻す' }));
    expect(mock.reset).toHaveBeenCalledTimes(i);
    expect(screen.getByRole('list', { name: '三次元表示中の駒' })).toHaveTextContent('HQ-P2 敵軍 不明');
    fireEvent.click(screen.getByRole('button', { name: '二次元盤面へ戻る' }));
    expect(mock.dispose).toHaveBeenCalledTimes(i);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  }
});
test('receives safe updates while open and the latest state when reopened', async () => {
  const view = render(<BattlefieldView state={state()} />);
  fireEvent.click(screen.getByRole('button', { name: '戦場ビュー' }));
  await waitFor(() => expect(mock.create).toHaveBeenCalledTimes(1));
  const next = { ...state(), moveCount: 4 };
  view.rerender(<BattlefieldView state={next} />);
  expect(mock.update).toHaveBeenLastCalledWith(next);
  fireEvent.click(screen.getByRole('button', { name: '二次元盤面へ戻る' }));
  fireEvent.click(screen.getByRole('button', { name: '戦場ビュー' }));
  await waitFor(() => expect(mock.create).toHaveBeenCalledTimes(2));
  expect(mock.create.mock.calls[1][1]).toEqual(next);
});
test('unsupported rendering and context loss leave the return action usable', async () => {
  mock.create.mockImplementationOnce(() => { throw new Error('No WebGL'); });
  render(<BattlefieldView state={state()} />);
  fireEvent.click(screen.getByRole('button', { name: '戦場ビュー' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('二次元盤面でゲームを続けられます');
  fireEvent.click(screen.getByRole('button', { name: '二次元盤面へ戻る' }));
  fireEvent.click(screen.getByRole('button', { name: '戦場ビュー' }));
  await waitFor(() => expect(mock.create).toHaveBeenCalledTimes(2));
  act(() => mock.create.mock.calls[1][2]());
  expect(mock.dispose).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: '視点を戻す' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '二次元盤面へ戻る' }));
  expect(mock.dispose).toHaveBeenCalledTimes(1);
});
test('closing before lazy loading resolves never creates a renderer', async () => {
  render(<BattlefieldView state={state()} />);
  fireEvent.click(screen.getByRole('button', { name: '戦場ビュー' }));
  fireEvent.click(screen.getByRole('button', { name: '二次元盤面へ戻る' }));
  await act(async () => {});
  expect(mock.create).not.toHaveBeenCalled();
});
