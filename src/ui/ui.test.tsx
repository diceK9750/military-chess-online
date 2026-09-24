// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { scenario } from '../dev/fixtures';
import { localDraftStore } from '../dev/storage';
import { LocalGame } from './LocalGame';
import { CpuSetup } from './CpuSetup';
import { Setup } from './Setup';
import { defaultPlacement } from '../dev/fixtures';
import { startGame } from '../game/game';
import { createSavedMatch, MATCH_STORAGE_KEY, storeSavedMatch } from '../save/match';
import { ExportPanel, ImportPanel } from './SaveFilePanels';

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });
test('title offers disabled resume, import, and instructions when no match is saved', async () => {
  render(<App />);
  expect(screen.getByRole('button', { name: '続きから' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '保存した対局を読み込む' })).toBeEnabled();
  await userEvent.setup().click(screen.getByRole('button', { name: '遊び方' }));
  expect(screen.getByRole('heading', { name: '遊び方' })).toBeInTheDocument();
});
test('saved match can resume and new match asks before replacement', async () => {
  const saved = createSavedMatch(startGame(defaultPlacement(1), defaultPlacement(2), 1), 'easy', 7);
  storeSavedMatch(saved);
  render(<App />); const user = userEvent.setup();
  expect(screen.getByRole('button', { name: '続きから' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: '続きから' }));
  expect(screen.getByRole('heading', { name: 'あなたの手番' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'タイトルへ' }));
  await user.click(screen.getByRole('button', { name: /CPUと対戦/ }));
  expect(screen.getByRole('dialog', { name: '新しい対局の確認' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'キャンセル' }));
  expect(localStorage.getItem(MATCH_STORAGE_KEY)).not.toBeNull();
});
test('corrupt autosave shows error but leaves new game available', () => {
  localStorage.setItem(MATCH_STORAGE_KEY, '{broken');
  render(<App />);
  expect(screen.getByRole('alert')).toHaveTextContent('復元できません');
  expect(screen.getByRole('button', { name: '続きから' })).toBeDisabled();
  expect(screen.getByRole('button', { name: /CPUと対戦/ })).toBeEnabled();
});
test('export requires matching passwords and can toggle visibility', async () => {
  const saved = createSavedMatch(startGame(defaultPlacement(1), defaultPlacement(2), 1), 'easy', 7);
  render(<ExportPanel match={saved} onClose={vi.fn()} />); const user = userEvent.setup();
  const password = Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => (byte % 10).toString()).join('');
  await user.type(screen.getByLabelText('パスワード', { exact: true }), password);
  await user.type(screen.getByLabelText('パスワード（確認）'), password + '0');
  await user.click(screen.getByRole('button', { name: 'ファイルを保存' }));
  expect(screen.getByRole('alert')).toHaveTextContent('一致しません');
  await user.click(screen.getByRole('checkbox', { name: 'パスワードを表示' }));
  expect(screen.getByLabelText('パスワード', { exact: true })).toHaveAttribute('type', 'text');
});
test('import rejects a wrong extension before decryption', async () => {
  render(<ImportPanel onLoaded={vi.fn()} onClose={vi.fn()} />); const user = userEvent.setup({ applyAccept: false });
  await user.upload(screen.getByLabelText('対局ファイル'), new File(['{}'], 'wrong.txt'));
  await user.type(screen.getByLabelText('パスワード', { exact: true }), Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => (byte % 10).toString()).join(''));
  await user.click(screen.getByRole('button', { name: '対局を読み込む' }));
  expect(screen.getByRole('alert')).toHaveTextContent('.mcsave');
});
test('home links to formal rules and clearly marks online placeholders', async () => {
  render(<App />); const user = userEvent.setup();
  expect(screen.getByRole('link', { name: /正式ゲームルール/ })).toHaveAttribute('href', expect.stringContaining('docs/GAME_RULES.md'));
  await user.click(screen.getByRole('button', { name: '対局一覧' }));
  expect(screen.getByText(/オンライン対局・ログイン・招待は将来の拡張/)).toBeInTheDocument();
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
test('CPU setup confirms one human placement and produces a valid full game', async () => {
  const onStart = vi.fn();
  const store = { load: () => null, save: vi.fn(() => true) };
  render(<CpuSetup difficulty="normal" seed={9751} onStart={onStart} store={store} />);
  const user = userEvent.setup();
  expect(screen.queryByRole('combobox', { name: '配置する側' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /B1 P1/ }));
  await user.click(screen.getByRole('button', { name: /E1 P1/ }));
  expect(store.save).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'この配置で確定' }));
  expect(onStart).toHaveBeenCalledOnce();
  expect(onStart.mock.calls[0][0].pieces).toHaveLength(46);
  expect(onStart.mock.calls[0][0].firstPlayer).toBe(2);
});
test('CPU match hides opponent types and automatically takes its turn', async () => {
  const game = scenario('aircraft');
  const onChange = vi.fn();
  render(<LocalGame initial={{ ...game, turn: 2 }} onChange={onChange} mode="cpu" difficulty="normal" cpuSeed={9750} />);
  expect(screen.getByRole('heading', { name: 'CPUの手番' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'HQ-P2 P2 不明駒' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'HQ-P2 P2 工兵' })).not.toBeInTheDocument();
  await waitFor(() => expect(onChange).toHaveBeenCalledOnce());
  expect(onChange.mock.calls[0][0].moveCount).toBe(1);
});
