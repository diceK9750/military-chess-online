import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { combat, COMBAT_TYPES, effectiveType } from './combat';
import { PIECES } from './pieces';
import type { Piece, Player, Site } from './types';

const specification = readFileSync(new URL('../../docs/GAME_RULES.md', import.meta.url), 'utf8');
const matrixLines = specification.split(/\r?\n/).filter(line => /^\| [^|]+ \| [相勝敗] \|/.test(line));
describe('formal 15 × 15 matrix', () => {
  test('specification contains exactly 15 full rows', () => {
    expect(matrixLines).toHaveLength(15);
    for (const line of matrixLines) expect(line.split('|').slice(1, -1)).toHaveLength(16);
  });
  for (const [row, attacker] of COMBAT_TYPES.entries()) for (const [col, defender] of COMBAT_TYPES.entries()) {
    test(`${PIECES[attacker].label} → ${PIECES[defender].label}`, () => {
      const cells = matrixLines[row].split('|').slice(1, -1).map(s => s.trim());
      expect(cells[0]).toBe(PIECES[attacker].label);
      expect(combat(attacker, defender)).toBe(({ 勝: 'ATTACKER', 敗: 'DEFENDER', 相: 'MUTUAL' })[cells[col + 1]]);
    });
  }
});
describe('flag evaluated at battle time', () => {
  for (const [owner, position, support] of [[1, 'C2', 'HQ-P1'], [1, 'D2', 'HQ-P1'], [2, 'C7', 'HQ-P2'], [2, 'D7', 'HQ-P2'], [1, 'B3', 'B2'], [2, 'B6', 'B7']] as [Player, Site, Site][]) {
    for (const type of COMBAT_TYPES) test(`${owner} ${position} inherits ${type}`, () => {
      const flag: Piece = { id: 'flag', owner, type: 'flag', position };
      const rear: Piece = { id: 'support', owner, type, position: support };
      expect(effectiveType(flag, [flag, rear])).toBe(type);
      expect(effectiveType(flag, [flag, { ...rear, position: null }])).toBeNull();
      expect(effectiveType(flag, [flag, { ...rear, owner: owner === 1 ? 2 : 1 }])).toBeNull();
    });
  }
  test('flag never acquires capture qualification', () => expect(PIECES.flag.captures).toBe(false));
});
