import { expect, test } from 'vitest';
import { anchors, rotate, siteAt, territory } from '../game/board';
import { validatePlacement } from '../game/placement';
import { PIECES, PIECE_TYPES } from '../game/pieces';
import type { Player, Site } from '../game/types';
import { FORMATION_TEMPLATES, generateFormationPlacement, materializeFormation, selectFormation } from './templates';

test('the collection has four strategic categories and eight distinct candidates', () => {
  expect(FORMATION_TEMPLATES).toHaveLength(8);
  expect(new Set(FORMATION_TEMPLATES.map(template => template.category))).toEqual(new Set(['balanced', 'rush', 'defense', 'flag-guard']));
  expect(new Set(FORMATION_TEMPLATES.map(template => template.id)).size).toBe(8);
  expect(new Set(FORMATION_TEMPLATES.map(template => JSON.stringify(template.placements))).size).toBe(8);
});

for (const template of FORMATION_TEMPLATES) for (const side of [1, 2] as const) {
  test(`${template.id} is a complete and legal Player ${side} placement`, () => {
    const pieces = materializeFormation(template, side);
    expect(pieces).toHaveLength(23);
    expect(new Set(pieces.map(piece => piece.type)).size).toBe(16);
    expect(new Set(pieces.map(piece => piece.position))).toEqual(new Set(territory(side)));
    for (const type of PIECE_TYPES) expect(pieces.filter(piece => piece.type === type)).toHaveLength(PIECES[type].count);
    expect(pieces.filter(piece => piece.position === (side === 1 ? 'HQ-P1' : 'HQ-P2'))).toHaveLength(1);
    expect(pieces.filter(piece => ['mine', 'flag'].includes(piece.type) && (side === 1 ? ['B4', 'E4'] : ['B5', 'E5']).includes(piece.position!))).toHaveLength(0);
    expect(pieces.filter(piece => piece.type === 'flag' && anchors(piece.position!)[0].y === (side === 1 ? 1 : 8))).toHaveLength(0);
    expect(() => validatePlacement(pieces, side)).not.toThrow();
  });
}

test('right variants mirror every type and Player 2 rotates both variants by 180 degrees', () => {
  for (const category of new Set(FORMATION_TEMPLATES.map(template => template.category))) {
    const left = FORMATION_TEMPLATES.find(template => template.id === `${category}-left`)!;
    const right = FORMATION_TEMPLATES.find(template => template.id === `${category}-right`)!;
    const rightBySite = new Map(right.placements.map(placement => [placement.site, placement.type]));
    for (const { site, type } of left.placements) {
      const point = anchors(site)[0];
      expect(rightBySite.get(siteAt(5 - point.x, point.y) as Site)).toBe(type);
    }
    for (const template of [left, right]) {
      const p1 = materializeFormation(template, 1);
      const p2 = materializeFormation(template, 2);
      expect(p2.map(piece => [piece.position, piece.type])).toEqual(p1.map(piece => [rotate(piece.position!), piece.type]));
    }
  }
});

test('fixed seeds reproduce candidates and generated sides, while seeds vary the candidate', () => {
  const ids = new Set<string>();
  for (let seed = 0; seed < 128; seed++) {
    ids.add(selectFormation(seed).id);
    expect(selectFormation(seed).id).toBe(selectFormation(seed).id);
    for (const side of [1, 2] as Player[]) {
      expect(generateFormationPlacement(side, seed)).toEqual(generateFormationPlacement(side, seed));
      expect(generateFormationPlacement(side, seed)).toEqual(materializeFormation(selectFormation(seed), side));
    }
  }
  expect(ids.size).toBe(FORMATION_TEMPLATES.length);
});
