// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { combat, COMBAT_TYPES } from '../game/combat';
import { PIECES } from '../game/pieces';
import { RuleReference } from './RuleReference';

afterEach(cleanup);

test('reference uses the canonical rank order and v0.2 movement and victory rules', () => {
  render(<RuleReference />);
  const reference = screen.getByRole('complementary', { name: 'ルール早見表' });
  expect(reference.querySelector('.rank-order')?.textContent).toBe('大将 ＞ 中将 ＞ 少将 ＞ 大佐 ＞ 中佐 ＞ 少佐 ＞ 大尉 ＞ 中尉 ＞ 少尉');
  expect(reference).toHaveTextContent('大将・中将・少将・大佐・中佐・少佐のいずれかで敵司令部を占領');
  expect(reference).toHaveTextContent('敵の司令部占領可能駒をすべて除去');
  expect(reference).toHaveTextContent('途中の敵味方駒を飛び越え可能');
  expect(reference).toHaveTextContent('途中の駒を飛び越え不可');
  expect(reference).toHaveTextContent('軍旗：直後の味方駒の戦闘性能を継承');
});

test('every displayed special matchup is derived from the combat table', () => {
  render(<RuleReference />);
  const cards = [...document.querySelectorAll('.special-matchup')];
  expect(cards).toHaveLength(COMBAT_TYPES.length - 9);
  for (const [index, type] of COMBAT_TYPES.slice(9).entries()) {
    const card = cards[index];
    expect(card.querySelector('h5')).toHaveTextContent(PIECES[type].label);
    const lists = [...card.querySelectorAll('ul')];
    expect(lists).toHaveLength(type === 'mine' ? 1 : 2);
    for (const [listIndex, list] of lists.entries()) {
      const defending = type === 'mine' || listIndex === 1;
      const rows = [...list.querySelectorAll('li')];
      expect(rows).toHaveLength(3);
      for (const opponent of COMBAT_TYPES) {
        const outcome = defending ? combat(opponent, type) : combat(type, opponent);
        const resultIndex = outcome === 'MUTUAL' ? 2 : outcome === (defending ? 'DEFENDER' : 'ATTACKER') ? 0 : 1;
        expect(rows[resultIndex]).toHaveTextContent(PIECES[opponent].label);
      }
    }
  }
});
