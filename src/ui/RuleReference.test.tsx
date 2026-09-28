// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { combat, COMBAT_TYPES } from '../game/combat';
import { PIECES } from '../game/pieces';
import { RuleReference } from './RuleReference';

afterEach(cleanup);

test('shared reference shows placement notes and the v0.2 essentials', () => {
  render(<><RuleReference side="left" placement /><RuleReference side="right" /></>);
  const left = screen.getByRole('complementary', { name: '基本ルール' });
  const right = screen.getByRole('complementary', { name: '駒の強弱早見' });
  expect(left).toHaveTextContent('自軍23枚をすべて配置');
  expect(left).toHaveTextContent('地雷・軍旗は突破口入口へ置けません');
  expect(left).toHaveTextContent('軍旗は最後列（司令部を含む）に置けません');
  expect(left).toHaveTextContent('大将・中将・少将・大佐・中佐・少佐で敵司令部を占領');
  expect(left).toHaveTextContent('飛行機：前後任意距離、敵味方を飛越');
  expect(left).toHaveTextContent('通常駒の突破口はB列・E列');
  expect(right.querySelector('.rank-order')?.textContent).toBe('大将 ＞ 中将 ＞ 少将 ＞ 大佐 ＞ 中佐 ＞ 少佐 ＞ 大尉 ＞ 中尉 ＞ 少尉');
  expect(right).toHaveTextContent('軍旗：直後の味方駒の戦闘性能を継承');
});

test('special strength summaries preserve asymmetric attack and defense outcomes', () => {
  render(<RuleReference side="right" />);
  const rows = [...document.querySelectorAll('.matchup-row')];
  expect(rows).toHaveLength(COMBAT_TYPES.length - 9);
  const rowFor = (type: string) => rows.find(row => row.querySelector('strong')?.textContent === PIECES[type as keyof typeof PIECES].label)!;
  const linesFor = (type: string) => [...rowFor(type).querySelectorAll('span')].map(line => line.textContent ?? '');
  expect(linesFor('aircraft')[0]).toContain('負 大将〜少将');
  expect(linesFor('aircraft')[0]).toContain('勝 大佐〜少尉');
  expect(linesFor('spy')[0]).toContain('勝 大将');
  expect(linesFor('spy')[1]).toContain('勝 大将');
  expect(combat('spy', 'general')).toBe('ATTACKER');
  expect(combat('general', 'spy')).toBe('DEFENDER');
  for (const type of COMBAT_TYPES.slice(9)) expect(rowFor(type)).toHaveTextContent(PIECES[type].label);
  expect(rows.find(row => row.textContent?.startsWith(PIECES.mine.label))).toHaveTextContent('移動不可');
  expect(screen.getByRole('complementary', { name: '駒の強弱早見' })).toHaveTextContent('攻＝攻撃時、守＝防御時、相＝相打ち');
  expect(screen.getByRole('complementary', { name: '駒の強弱早見' })).toHaveTextContent('後ろに味方がいなければ負けます');
});

test('placement and play can reuse the same left and right reference components', () => {
  render(<><RuleReference side="left" placement /><RuleReference side="left" /><RuleReference side="right" /><RuleReference side="right" /></>);
  expect(screen.getAllByRole('complementary', { name: '基本ルール' })).toHaveLength(2);
  expect(screen.getAllByRole('complementary', { name: '駒の強弱早見' })).toHaveLength(2);
  expect(screen.getAllByRole('link', { name: /詳しいゲームルール/ })).toHaveLength(4);
  expect(combat('engineer', 'mine')).toBe('ATTACKER');
  expect(combat('mine', 'engineer')).toBe('DEFENDER');
});
