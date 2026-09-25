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
import { applyMove, startGame } from '../game/game';
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
  await user.click(screen.getByRole('button', { name: /コンピューターと対戦/ }));
  expect(screen.getByRole('dialog', { name: '新しい対局の確認' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'キャンセル' }));
  expect(localStorage.getItem(MATCH_STORAGE_KEY)).not.toBeNull();
});
test('corrupt autosave shows error but leaves new game available', () => {
  localStorage.setItem(MATCH_STORAGE_KEY, '{broken');
  render(<App />);
  expect(screen.getByRole('alert')).toHaveTextContent('復元できません');
  expect(screen.getByRole('button', { name: '続きから' })).toBeDisabled();
  expect(screen.getByRole('button', { name: /コンピューターと対戦/ })).toBeEnabled();
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
  await user.click(screen.getByText('開発用・将来の機能'));
  await user.click(screen.getByRole('button', { name: '対局一覧' }));
  expect(screen.getByText(/オンライン対局・ログイン・招待は将来の拡張/)).toBeInTheDocument();
});
test('move requires lane selection and explicit confirmation', async () => {
  render(<LocalGame initial={scenario('aircraft')} />); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'HQ-P1 P1 飛行機' }));
  await user.click(screen.getByRole('button', { name: 'HQ-P2 P2 工兵' }));
  expect(screen.getByRole('button', { name: '確定して実行' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'HQ-P1 P1 飛行機' })).toBeInTheDocument();
  await user.click(screen.getByRole('radio', { name: 'D列を通る' }));
  expect(document.querySelectorAll('.board .cell.route')).toHaveLength(6);
  await user.click(screen.getByRole('button', { name: '確定して実行' }));
  expect(screen.getByRole('button', { name: 'HQ-P2 P1 飛行機' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'P2の手番' })).toBeInTheDocument();
  expect(screen.getAllByText(/（D列）：攻撃側勝利/)).toHaveLength(2);
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

test('CPU setup shows all 23 pieces, legal exchanges and a specific forbidden-placement reason', async () => {
  const { container } = render(<CpuSetup difficulty="easy" seed={2} onStart={vi.fn()} store={{ load: () => null, save: () => true }} />);
  const user = userEvent.setup();
  expect(screen.getByText('✓ 配置完了。この配置で対局を始められます。')).toBeInTheDocument();
  await user.click(screen.getByText('自軍の駒一覧・枚数を見る'));
  expect(container.querySelectorAll('.inventory-type')).toHaveLength(16);
  expect(container.querySelectorAll('.inventory-type button')).toHaveLength(23);
  await user.click(screen.getByRole('button', { name: 'A2 P1 軍旗' }));
  expect(container.querySelectorAll('.board .cell.legal').length).toBeGreaterThan(0);
  await user.click(screen.getByRole('button', { name: /B4 P1/ }));
  expect(screen.getByText(/地雷・軍旗は自軍の突破口入口/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'A2 P1 軍旗' })).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: '選択を解除' }));
  expect(screen.getByRole('button', { name: 'この配置で確定' })).toBeEnabled();
});

test('setup board and inventory show the same icon above every formal piece name', async () => {
  const expected = [
    ['general', '大将', '⭐'], ['lieutenantGeneral', '中将', '⭐'], ['majorGeneral', '少将', '⭐'],
    ['colonel', '大佐', '🛡️'], ['lieutenantColonel', '中佐', '🛡️'], ['major', '少佐', '🛡️'],
    ['captain', '大尉', '🪖'], ['lieutenant', '中尉', '🪖'], ['secondLieutenant', '少尉', '🪖'],
    ['aircraft', '飛行機', '✈️'], ['tank', 'タンク', '◼️'], ['engineer', '工兵', '🔧'],
    ['mine', '地雷', '💣'], ['cavalry', '騎兵', '🐎'], ['spy', 'スパイ', '🕵️'], ['flag', '軍旗', '🚩'],
  ] as const;
  const { container } = render(<CpuSetup difficulty="easy" seed={2} onStart={vi.fn()} store={{ load: () => null, save: () => true }} />);
  const placement = defaultPlacement(1);
  expect(container.querySelectorAll('.board .cell.side-1 .piece-face')).toHaveLength(23);
  for (const [type, name, icon] of expected) {
    const site = placement.find(piece => piece.type === type)?.position;
    const face = container.querySelector(`.board [data-site="${site}"] .piece-face`);
    expect(face?.children[0]).toHaveTextContent(icon);
    expect(face?.children[1]).toHaveTextContent(name);
  }
  await userEvent.setup().click(screen.getByText('自軍の駒一覧・枚数を見る'));
  const inventory = container.querySelectorAll('.inventory-type > .piece-face');
  expect(inventory).toHaveLength(expected.length);
  expected.forEach(([, name, icon]) => {
    const face = Array.from(inventory).find(element => element.querySelector('.piece-name')?.textContent === name);
    expect(face?.children[0]).toHaveTextContent(icon);
    expect(face?.children[1]).toHaveTextContent(name);
  });
});

test('CPU match shows own icon and name without adding an enemy icon or name', () => {
  const { container } = render(<LocalGame initial={scenario('aircraft')} mode="cpu" />);
  const own = screen.getByRole('button', { name: 'HQ-P1 P1 飛行機' });
  expect(own.querySelector('.piece-icon')).toHaveTextContent('✈️');
  expect(own.querySelector('.piece-name')).toHaveTextContent('飛行機');
  const enemy = screen.getByRole('button', { name: 'HQ-P2 P2 不明駒' });
  expect(enemy.querySelector('.piece-label')).toHaveTextContent('？');
  expect(enemy.querySelector('.piece-face')).toBeNull();
  expect(container.querySelector('.board')).not.toHaveTextContent('工兵');
  expect(container.querySelector('.board')).not.toHaveTextContent('🔧');
});

test('invalid destination keeps selection, confirmation names own piece, and cancel keeps the game unchanged', async () => {
  const { container } = render(<LocalGame initial={scenario('capture')} />); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'C7 P1 大将' }));
  await user.click(screen.getByRole('button', { name: 'B8 空き' }));
  expect(screen.getByRole('button', { name: 'C7 P1 大将' })).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: 'HQ-P2 空き' }));
  expect(container.querySelector('.confirm')).toHaveTextContent('大将を C7 から HQ-P2 へ');
  expect(screen.getByRole('heading', { name: 'この手を実行しますか？' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: '選び直す' }));
  expect(screen.getByText('0手', { exact: true })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '選択を解除' }));
  expect(screen.getByRole('button', { name: 'C7 P1 大将' })).toHaveAttribute('aria-pressed', 'false');
});

test('CPU thinking locks board and public move text never names its piece', async () => {
  const game = scenario('aircraft');
  const { container } = render(<LocalGame initial={{ ...game, turn: 2 }} mode="cpu" cpuSeed={2} />);
  expect(container.querySelector('.thinking')).toHaveTextContent('コンピューターが考えています');
  expect(container.querySelectorAll('.board .cell:not(:disabled)')).toHaveLength(0);
  expect(screen.getByRole('button', { name: 'HQ-P2 P2 不明駒' })).toBeDisabled();
});

test('auto PASS and a finished CPU match explain result and reveal postgame positions only at the end', async () => {
  const initial = scenario('capture');
  const passed = { ...initial, events: [{ kind: 'START' as const, firstPlayer: 1 as const }, { kind: 'AUTO_PASS' as const, actor: 2 as const }] };
  const { rerender, container } = render(<LocalGame initial={passed} mode="cpu" />);
  expect(container.querySelector('.pass-event')).toHaveTextContent('コンピューターは合法な移動がないため、自動的に手番が移りました');
  expect(screen.queryByText('終局後の全駒・初期配置・戦闘を確認')).not.toBeInTheDocument();
  const ended = applyMove(initial, { from: 'C7', to: 'HQ-P2' });
  rerender(<LocalGame key="ended" initial={ended} mode="cpu" initialPlacements={{ p1: initial.pieces.filter(piece => piece.owner === 1), p2: initial.pieces.filter(piece => piece.owner === 2) }} onNewGame={vi.fn()} />);
  expect(screen.getByText('あなたの勝利')).toBeInTheDocument();
  expect(screen.getByText(/終局理由：あなたがコンピューターの司令部を占領/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '新しい対局' })).toBeEnabled();
  expect(screen.getByText('終局後の全駒・初期配置・戦闘を確認')).toBeInTheDocument();
});

test('home dialogue receives focus and Escape cancels replacement', async () => {
  storeSavedMatch(createSavedMatch(startGame(defaultPlacement(1), defaultPlacement(2), 1), 'easy', 7));
  render(<App />); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /コンピューターと対戦/ }));
  const dialog = screen.getByRole('dialog', { name: '新しい対局の確認' });
  expect(dialog).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /コンピューターと対戦/ })).toHaveFocus();
  expect(screen.getByRole('button', { name: '続きから' })).toBeEnabled();
});

test('battle confirmation and history conceal the enemy type until the CPU match ends', async () => {
  const initial = scenario('aircraft');
  const { container, rerender } = render(<LocalGame initial={initial} mode="cpu" />); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'HQ-P1 P1 飛行機' }));
  await user.click(screen.getByRole('button', { name: 'HQ-P2 P2 不明駒' }));
  expect(container.querySelector('.confirm')).toHaveTextContent('戦闘になります');
  expect(container.querySelector('.confirm')).not.toHaveTextContent('工兵');
  expect(screen.queryByText('終局後の全駒・初期配置・戦闘を確認')).not.toBeInTheDocument();
  const fought = applyMove(initial, { from: 'HQ-P1', to: 'HQ-P2', lane: 'C' });
  rerender(<LocalGame key="finished" initial={{ ...fought, turn: null, result: { winner: 1, reason: 'CAPTURERS_ELIMINATED' } }} mode="cpu" initialPlacements={{ p1: initial.pieces.filter(piece => piece.owner === 1), p2: initial.pieces.filter(piece => piece.owner === 2) }} />);
  await user.click(screen.getByText('終局後の全駒・初期配置・戦闘を確認'));
  expect(screen.getByText(/飛行機 対 工兵/)).toBeInTheDocument();
});

test.each([
  [{ winner: 2 as const, reason: 'HQ_CAPTURE' as const }, 'あなたの敗北'],
  [{ winner: null, reason: 'FIFTY_NONCOMBAT_MOVES' as const }, '引き分け'],
])('CPU final result %j is understandable', (result, label) => {
  const game = scenario('capture');
  render(<LocalGame initial={{ ...game, result, turn: null }} mode="cpu" />);
  expect(screen.getByText(label)).toBeInTheDocument();
  expect(screen.getByText(`終局理由：${result.reason === 'HQ_CAPTURE' ? 'コンピューターがあなたの司令部を占領' : '戦闘なし50手'}`)).toBeInTheDocument();
});
