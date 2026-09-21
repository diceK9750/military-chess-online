// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { scenario } from '../dev/fixtures';
import { localDraftStore } from '../dev/storage';
import { LocalGame } from './LocalGame';
import { Setup } from './Setup';

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });
test('home links to formal rules and clearly marks online placeholders', async () => {
  render(<App />); const user = userEvent.setup();
  expect(screen.getByRole('link', { name: /正式ゲームルール/ })).toHaveAttribute('href', expect.stringContaining('docs/GAME_RULES.md'));
  await user.click(screen.getByRole('button', { name: '対局一覧' }));
  expect(screen.getByText(/オンライン対局・ログイン・招待は今後/)).toBeInTheDocument();
});
test('move requires lane selection and explicit confirmation', async () => {
  render(<LocalGame initial={scenario('aircraft')} />); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'HQ-P1 P1 飛行機' }));
  await user.click(screen.getByRole('button', { name: 'HQ-P2 P2 工兵' }));
  expect(screen.getByRole('button', { name: '確定して実行' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'HQ-P1 P1 飛行機' })).toBeInTheDocument();
  await user.click(screen.getByRole('radio', { name: 'D列' }));
  await user.click(screen.getByRole('button', { name: '確定して実行' }));
  expect(screen.getByRole('button', { name: 'HQ-P2 P1 飛行機' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'P2の手番' })).toBeInTheDocument();
  expect(screen.getByText(/（D列）：攻撃側勝利/)).toBeInTheDocument();
});
test('single legal lane auto selected; cancel never moves', async () => {
  const initial = scenario('aircraft');
  render(<LocalGame initial={{ ...initial, pieces: [...initial.pieces, { id: 'block', owner: 2, type: 'spy', position: 'C4' }] }} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'HQ-P1 P1 飛行機' }));
  await user.click(screen.getByRole('button', { name: 'HQ-P2 P2 工兵' }));
  expect(screen.getByText(/D列を通ります/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '確定して実行' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: '選び直す' }));
  expect(screen.getByRole('button', { name: 'HQ-P1 P1 飛行機' })).toBeInTheDocument();
});
test('capture renders result and ends move entry', async () => {
  render(<LocalGame initial={scenario('capture')} />); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'C7 P1 大将' }));
  await user.click(screen.getByRole('button', { name: 'HQ-P2 空き' }));
  expect(screen.queryByText('P1の勝利')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '確定して実行' }));
  expect(screen.getByText('P1の勝利')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '確定して実行' })).not.toBeInTheDocument();
});
test('draft swaps autosave, READY blocks edits, unlock restores, both ready starts', async () => {
  const onStart = vi.fn(); const save = vi.fn(() => true);
  render(<Setup onStart={onStart} store={{ load: () => null, save }} />); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /B1 P1/ }));
  await user.click(screen.getByRole('button', { name: /E1 P1/ }));
  expect(save).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'この配置で確定' }));
  await user.click(screen.getByRole('button', { name: /B1 P1/ }));
  await user.click(screen.getByRole('button', { name: /E1 P1/ }));
  expect(save).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: '確定を解除して編集' }));
  await user.click(screen.getByRole('button', { name: 'この配置で確定' }));
  expect(onStart).not.toHaveBeenCalled();
  await user.selectOptions(screen.getByRole('combobox', { name: '配置する側' }), '2');
  await user.click(screen.getByRole('button', { name: 'この配置で確定' }));
  expect(onStart).toHaveBeenCalledOnce(); expect(onStart.mock.calls[0][0].pieces).toHaveLength(46);
});
test('storage rejects corrupt data and reports write failure', () => {
  localStorage.setItem('military-chess:dev-draft:v1:1', '{broken');
  expect(localDraftStore.load(1)).toBeNull();
  localStorage.setItem('military-chess:dev-draft:v1:1', '[{}]');
  expect(localDraftStore.load(1)).toBeNull();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(localDraftStore.save(1, [])).toBe(false);
});
