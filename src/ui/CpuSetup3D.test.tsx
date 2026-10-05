// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { CpuSetup } from './CpuSetup';
import { FORMATION_TEMPLATES, generateFormationPlacement, materializeFormation } from '../formation/templates';
import { validatePlacement } from '../game/placement';
import { territory } from '../game/board';
import type { BattlefieldHandlers, BattlefieldViewState } from '../battlefield3d/state';
const mock = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), dispose: vi.fn(), reset: vi.fn(), camera: vi.fn() }));
vi.mock('../battlefield3d/renderer', () => ({ createBattlefield: mock.create }));
beforeEach(() => { vi.clearAllMocks(); mock.create.mockImplementation(() => ({ update: mock.update, dispose: mock.dispose, reset: mock.reset, setCamera: mock.camera })); });
afterEach(cleanup);
const latest = (): BattlefieldViewState => mock.update.mock.calls.at(-1)?.[0] ?? mock.create.mock.calls.at(-1)![1];
const input = (): BattlefieldHandlers => mock.create.mock.calls.at(-1)![3];
const ready = () => waitFor(() => expect(mock.create).toHaveBeenCalled());
const store = () => ({ load: () => null, save: vi.fn(() => true) });

test('normal setup is 3D only with all 23 named own characters and no CPU placement', async () => {
  render(<CpuSetup difficulty="easy" seed={2} store={store()} onStart={vi.fn()} />); await ready();
  expect(document.querySelector('.board')).toBeNull();
  expect(latest().phase).toBe('setup');
  expect(latest().pieces).toHaveLength(23);
  expect(latest().pieces.every(piece => piece.owner === 1 && !piece.unknown)).toBe(true);
  expect(screen.getByRole('list', { name: '三次元表示中の駒' }).children).toHaveLength(23);
  expect(screen.getByRole('list', { name: '三次元表示中の駒' })).toHaveTextContent('軍旗');
  expect(screen.getByRole('button', { name: 'この配置で確定' })).toBeEnabled();
});
test('selection marks legal exchanges, swap validates and saves, cancel never saves', async () => {
  const saved = store(), changed = vi.fn();
  render(<CpuSetup difficulty="normal" seed={2} store={saved} onStart={vi.fn()} onPlacementChange={changed} />); await ready();
  const before = latest().pieces;
  act(() => input().onSiteSelect('B1'));
  expect(latest().interaction.selectedSite).toBe('B1'); expect(latest().interaction.legalTargets).toContain('E1');
  expect(screen.getByText(/交換可能 .*地点/)).toBeInTheDocument();
  act(() => input().onSiteSelect('E1'));
  expect(saved.save).toHaveBeenCalledTimes(1); expect(changed).toHaveBeenCalledTimes(1);
  expect(latest().pieces.find(piece => piece.position === 'E1')).toEqual({ ...before.find(piece => piece.position === 'B1'), position: 'E1' });
  expect(() => validatePlacement(changed.mock.calls[0][0], 1)).not.toThrow();
  act(() => input().onSiteSelect('B1')); fireEvent.click(screen.getByRole('button', { name: '選択を解除' }));
  expect(latest().interaction.selectedSite).toBeNull(); expect(changed).toHaveBeenCalledTimes(1);
});
test('flag and mine forbidden exchanges are rejected without changing pieces or saving', async () => {
  const saved = store(), changed = vi.fn(); const initial = generateFormationPlacement(1, 2, 'human');
  render(<CpuSetup difficulty="easy" seed={2} initialPieces={initial} store={saved} onStart={vi.fn()} onPlacementChange={changed} />); await ready();
  const before = latest().pieces;
  const flag = initial.find(piece => piece.type === 'flag')!.position!;
  act(() => input().onSiteSelect(flag));
  expect(latest().interaction.legalTargets).not.toContain('B4');
  for (const site of ['B4', 'E4', 'HQ-P1', 'A1'] as const) act(() => input().onSiteSelect(site));
  expect(latest().pieces).toEqual(before); expect(saved.save).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '選択を解除' }));
  act(() => input().onSiteSelect(initial.find(piece => piece.type === 'mine')!.position!));
  act(() => input().onSiteSelect('B4')); expect(latest().pieces).toEqual(before);
  act(() => input().onSiteSelect('A5')); expect(latest().pieces).toEqual(before); expect(saved.save).not.toHaveBeenCalled();
});
test('all eight selectable formations preserve seed, valid pieces and the existing start path', async () => {
  const started = vi.fn(), saved = store(), changed = vi.fn();
  render(<CpuSetup difficulty="normal" seed={9751} store={saved} onStart={started} onPlacementChange={changed} />); await ready();
  for (const template of FORMATION_TEMPLATES) {
    fireEvent.change(screen.getByRole('combobox', { name: '陣形を変更' }), { target: { value: template.id } });
    expect(changed.mock.calls.at(-1)![0]).toEqual(materializeFormation(template, 1, 'human'));
    expect(latest().pieces).toHaveLength(23);
  }
  fireEvent.click(screen.getByRole('button', { name: 'この配置で確定' }));
  expect(started).toHaveBeenCalledTimes(1); expect(started.mock.calls[0][0].pieces).toHaveLength(46);
  expect(started.mock.calls[0][0].firstPlayer).toBe(2);
  expect(territory(1)).toHaveLength(23);
});
test('persisted edited placement is rendered directly on remount', async () => {
  const changed = vi.fn(); const view = render(<CpuSetup difficulty="easy" seed={2} store={store()} onStart={vi.fn()} onPlacementChange={changed} />); await ready();
  act(() => input().onSiteSelect('B1')); act(() => input().onSiteSelect('E1'));
  const pieces = changed.mock.calls[0][0], visible = latest().pieces;
  view.unmount(); mock.update.mockClear();
  render(<CpuSetup difficulty="easy" seed={2} initialPieces={pieces} store={store()} onStart={vi.fn()} />);
  await waitFor(() => expect(mock.create).toHaveBeenCalledTimes(2));
  expect(latest().pieces).toEqual(visible); expect(document.querySelector('.board')).toBeNull();
});
test('compact camera toolbar keeps every preset and routes detail choices without saving', async () => {
  const saved = store(); render(<CpuSetup difficulty="easy" seed={2} store={saved} onStart={vi.fn()} />); await ready();
  const toolbar = within(document.querySelector('.battlefield-cameras') as HTMLElement);
  expect(toolbar.getAllByRole('button').map(button => button.textContent)).toEqual(['全景', '選択中の駒', '視点を戻す']);
  expect(toolbar.getByRole('button', { name: '選択中の駒' })).toBeDisabled();
  const detail = toolbar.getByRole('combobox', { name: 'カメラの詳細視点' });
  expect(within(detail).getAllByRole('option').map(option => option.textContent)).toEqual(['全景', '自軍正面', '敵軍正面', '真上', '選択中の駒', '直前の手を追う']);
  expect(within(detail).getByRole('option', { name: '選択中の駒' })).toBeDisabled();
  expect(within(detail).getByRole('option', { name: '直前の手を追う' })).toBeDisabled();
  for (const preset of ['full', 'top', 'front', 'enemy']) {
    fireEvent.change(detail, { target: { value: preset } });
    expect(mock.camera).toHaveBeenLastCalledWith(preset); expect(detail).toHaveValue(preset);
  }
  act(() => input().onSiteSelect('B1'));
  expect(within(detail).getByRole('option', { name: '選択中の駒' })).toBeEnabled();
  fireEvent.change(detail, { target: { value: 'selected' } });
  expect(mock.camera).toHaveBeenLastCalledWith('selected');
  fireEvent.click(toolbar.getByRole('button', { name: '全景' }));
  expect(mock.camera).toHaveBeenLastCalledWith('full');
  fireEvent.click(toolbar.getByRole('button', { name: '選択中の駒' }));
  expect(mock.camera).toHaveBeenLastCalledWith('selected');
  fireEvent.click(toolbar.getByRole('button', { name: '視点を戻す' }));
  expect(mock.reset).toHaveBeenCalledOnce(); expect(detail).toHaveValue('full');
  expect(saved.save).not.toHaveBeenCalled();
});
test('renderer selection focus shows an orientation overview and clears without changing placement', async () => {
  const saved = store(); render(<CpuSetup difficulty="easy" seed={2} store={saved} onStart={vi.fn()} />); await ready();
  const before = latest().pieces;
  expect(screen.queryByRole('complementary', { name: '全体位置図・自軍が下' })).not.toBeInTheDocument();
  act(() => { input().onSiteSelect('B1'); input().onCameraChange?.('selected'); });
  expect(screen.getByRole('button', { name: '選択中の駒' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('combobox', { name: 'カメラの詳細視点' })).toHaveValue('selected');
  expect(screen.getByRole('complementary', { name: '全体位置図・自軍が下' })).toHaveTextContent('自軍 ↓');
  const primary = within(document.querySelector('.battlefield-viewport .battlefield-primary') as HTMLElement);
  expect(primary.getByRole('button', { name: 'この配置で確定' })).toBeEnabled();
  fireEvent.click(primary.getByRole('button', { name: '選択を解除' }));
  expect(screen.queryByRole('complementary', { name: '全体位置図・自軍が下' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '全景' })).toHaveAttribute('aria-pressed', 'true');
  expect(latest().pieces).toEqual(before); expect(saved.save).not.toHaveBeenCalled();
});
test('WebGL failure and context loss enable fallback, which can swap and start', async () => {
  mock.create.mockImplementationOnce(() => { throw new Error('No WebGL'); });
  const started = vi.fn(), saved = store();
  const view = render(<CpuSetup difficulty="easy" seed={2} store={saved} onStart={started} />);
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: /^B1 P1/ })); fireEvent.click(screen.getByRole('button', { name: /^E1 P1/ }));
  expect(saved.save).toHaveBeenCalledTimes(1); fireEvent.click(screen.getByRole('button', { name: 'この配置で確定' })); expect(started).toHaveBeenCalledTimes(1);
  view.unmount(); render(<CpuSetup difficulty="easy" seed={2} store={store()} onStart={vi.fn()} />);
  await waitFor(() => expect(mock.create).toHaveBeenCalledTimes(2)); expect(document.querySelector('.board')).toBeNull();
  act(() => mock.create.mock.calls[1][2]()); expect(document.querySelector('.board')).not.toBeNull();
});
test('storage failure retains the valid edit and reports unsaved state', async () => {
  render(<CpuSetup difficulty="easy" seed={2} store={{ load: () => null, save: () => false }} onStart={vi.fn()} onPlacementChange={() => false} />); await ready();
  const before = latest().pieces;
  act(() => input().onSiteSelect('B1')); act(() => input().onSiteSelect('E1'));
  expect(latest().pieces).not.toEqual(before); expect(screen.getByText(/配置は変更しましたが/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'この配置で確定' })).toBeEnabled();
});
