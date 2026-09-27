import { describe, expect, test } from 'vitest';
import { anchors, rotate, SITES, territory } from './board';
import { legalMoves, moveError } from './movement';
import { PIECE_TYPES } from './pieces';
import type { Move, Piece, PieceType, Player, Site } from './types';

function actor(type: PieceType, position: Site, owner: Player = 1): Piece { return { id: 'actor', owner, type, position }; }
function mirror(p: Piece): Piece { return { ...p, owner: p.owner === 1 ? 2 : 1, position: p.position ? rotate(p.position) : null }; }
function mirrorMove(m: Move): Move { return { from: rotate(m.from), to: rotate(m.to), ...(m.lane ? { lane: m.lane === 'C' ? 'D' as const : 'C' as const } : {}) }; }
test('46 sites / 23 each / no anchor is a site', () => {
  expect(SITES).toHaveLength(46); expect(territory(1)).toHaveLength(23); expect(territory(2)).toHaveLength(23);
  expect(SITES).not.toContain('C1'); expect(SITES).not.toContain('D8');
  for (const site of SITES) expect(rotate(rotate(site))).toBe(site);
});
const cases: [PieceType, Site, Site, boolean][] = [
  ['general', 'C3', 'C4', true], ['general', 'C3', 'C2', true], ['spy', 'C3', 'B3', true], ['spy', 'C3', 'D3', true],
  ['general', 'C3', 'D4', false], ['general', 'C3', 'C5', false], ['general', 'A4', 'A5', false],
  ['general', 'B4', 'B5', true], ['general', 'E4', 'E5', true], ['general', 'C4', 'C5', false], ['general', 'D4', 'D5', false], ['general', 'F4', 'F5', false],
  ['tank', 'C2', 'C4', true], ['tank', 'C4', 'C2', false], ['cavalry', 'B3', 'B5', true], ['cavalry', 'C3', 'C5', false],
  ['tank', 'HQ-P1', 'C3', true], ['tank', 'HQ-P1', 'D3', true], ['cavalry', 'C6', 'HQ-P2', true], ['cavalry', 'D6', 'HQ-P2', true],
  ['tank', 'C3', 'HQ-P1', false], ['tank', 'B3', 'D3', false],
  ['engineer', 'A2', 'F2', true], ['engineer', 'B2', 'B8', true], ['engineer', 'E2', 'E8', true],
  ['engineer', 'C2', 'C6', false], ['engineer', 'HQ-P1', 'C4', true], ['engineer', 'HQ-P1', 'D4', true],
  ['engineer', 'C4', 'HQ-P1', true], ['engineer', 'HQ-P1', 'A1', true], ['engineer', 'HQ-P1', 'F1', true],
  ['engineer', 'A1', 'E1', false], ['engineer', 'B1', 'F1', false], ['engineer', 'C4', 'E1', false], ['engineer', 'HQ-P1', 'HQ-P2', false],
  ['aircraft', 'C2', 'C7', true], ['aircraft', 'C7', 'C2', true], ['aircraft', 'B3', 'C3', true], ['aircraft', 'A3', 'C3', false],
  ['aircraft', 'C4', 'C5', true], ['aircraft', 'HQ-P1', 'C7', true], ['aircraft', 'HQ-P1', 'D7', true],
  ['aircraft', 'HQ-P1', 'B1', true], ['aircraft', 'HQ-P1', 'E1', true], ['aircraft', 'HQ-P1', 'A1', false],
  ['flag', 'B3', 'B4', false], ['mine', 'B3', 'B4', false], ['spy', 'B3', 'B3', false],
];
describe('movement and rotated P2 counterparts', () => {
  for (const [type, from, to, allowed] of cases) for (const rotated of [false, true]) test(`${type} ${from}→${to} rotated=${rotated}`, () => {
    const p = actor(type, from); const m: Move = { from, to };
    expect(moveError([rotated ? mirror(p) : p], rotated ? 2 : 1, rotated ? mirrorMove(m) : m) === null).toBe(allowed);
  });
  for (const type of PIECE_TYPES.filter(t => !['mine', 'flag'].includes(t))) for (const to of ['B1', 'C2', 'D2', 'E1'] as const) test(`${type} HQ adjacency ${to} in both directions`, () => {
    expect(moveError([actor(type, 'HQ-P1')], 1, { from: 'HQ-P1', to })).toBeNull();
    expect(moveError([actor(type, to)], 1, { from: to, to: 'HQ-P1' })).toBeNull();
  });
  for (const type of ['tank', 'cavalry', 'engineer', 'aircraft'] as const) for (const owner of [1, 2] as const) test(`${type} middle blocker ${owner}`, () => {
    const pieces = [actor(type, 'C2'), { id: 'block', owner, type: 'spy' as const, position: 'C3' as const }];
    expect(moveError(pieces, 1, { from: 'C2', to: 'C4' }) === null).toBe(type === 'aircraft');
  });
  test('friendly destination rejected, enemy destination allowed, wrong owner rejected', () => {
    const p = actor('general', 'B3'); const target = { ...actor('spy', 'B4'), id: 'target' };
    expect(moveError([p, target], 1, { from: 'B3', to: 'B4' })).toBe('FRIENDLY_DESTINATION');
    expect(moveError([p, { ...target, owner: 2 }], 1, { from: 'B3', to: 'B4' })).toBeNull();
    expect(moveError([p], 2, { from: 'B3', to: 'B4' })).toBe('NOT_OWN_PIECE');
    expect(moveError([p], 1, { from: 'B3', to: 'G3' as Site })).toBe('INVALID_SITE');
  });
});
test('aircraft flies forward and backward over friendly, enemy, and mixed intermediate pieces', () => {
  const obstacles = [
    { id: 'friendly-a', owner: 1, type: 'mine', position: 'D3' },
    { id: 'enemy', owner: 2, type: 'spy', position: 'D4' },
    { id: 'friendly-b', owner: 1, type: 'flag', position: 'D5' },
  ] as const satisfies readonly Piece[];
  for (const selected of [obstacles.slice(0, 1), obstacles.slice(1, 2), obstacles]) {
    expect(moveError([actor('aircraft', 'D2'), ...selected], 1, { from: 'D2', to: 'D6' })).toBeNull();
    expect(moveError([actor('aircraft', 'D6'), ...selected], 1, { from: 'D6', to: 'D2' })).toBeNull();
  }
  expect(moveError([actor('aircraft', 'D2'), ...obstacles, { id: 'land', owner: 2, type: 'engineer', position: 'D6' }], 1, { from: 'D2', to: 'D6' })).toBeNull();
  expect(moveError([actor('aircraft', 'D2'), ...obstacles, { id: 'land', owner: 1, type: 'engineer', position: 'D6' }], 1, { from: 'D2', to: 'D6' })).toBe('FRIENDLY_DESTINATION');
  expect(moveError([actor('aircraft', 'D2')], 1, { from: 'D2', to: 'E2' })).toBeNull();
  expect(moveError([actor('aircraft', 'D2')], 1, { from: 'D2', to: 'F2' })).toBe('DISTANCE');
  expect(moveError([actor('aircraft', 'D4'), { id: 'block', owner: 2, type: 'spy', position: 'D5' }], 1, { from: 'D4', to: 'D6' })).toBeNull();
  expect(moveError([actor('engineer', 'D2'), ...obstacles], 1, { from: 'D2', to: 'D4' })).toBe('BLOCKED');
});

test('D5 to enemy HQ stays legal over an enemy at D7, including the rotated P2 case', () => {
  const pieces: Piece[] = [actor('aircraft', 'D5'), { id: 'middle', owner: 2, type: 'spy', position: 'D7' }, { id: 'landing', owner: 2, type: 'engineer', position: 'HQ-P2' }];
  expect(legalMoves(pieces, 1)).toContainEqual({ from: 'D5', to: 'HQ-P2' });
  expect(moveError(pieces, 1, { from: 'D5', to: 'HQ-P2' })).toBeNull();
  const rotated = pieces.map(mirror);
  expect(legalMoves(rotated, 2)).toContainEqual({ from: 'C4', to: 'HQ-P1' });
  expect(moveError(rotated, 2, { from: 'C4', to: 'HQ-P1' })).toBeNull();
});
describe('HQ aircraft lanes', () => {
  for (const from of ['HQ-P1', 'HQ-P2'] as const) for (const lane of ['C', 'D'] as const) {
    const to = from === 'HQ-P1' ? 'HQ-P2' : 'HQ-P1';
    for (const row of [2, 3, 4, 5, 6, 7]) for (const owner of [1, 2] as const) test(`${from} ${lane}${row} blocker owner ${owner}`, () => {
      const p = actor('aircraft', from); const block = { id: 'block', type: 'spy' as const, owner, position: `${lane}${row}` as Site };
      expect(moveError([p, block], 1, { from, to, lane })).toBeNull();
      expect(moveError([p, block], 1, { from, to, lane: lane === 'C' ? 'D' : 'C' })).toBeNull();
    });
    test(`${from} ${lane} empty and enemy/friendly destination`, () => {
      const p = actor('aircraft', from);
      expect(moveError([p], 1, { from, to, lane })).toBeNull();
      expect(moveError([p, { ...actor('engineer', to, 2), id: 'target' }], 1, { from, to, lane })).toBeNull();
      expect(moveError([p, { ...actor('engineer', to), id: 'target' }], 1, { from, to, lane })).toBe('FRIENDLY_DESTINATION');
    });
  }
  test('no lane, invalid lane, and implicit switching rejected', () => {
    const pieces = [actor('aircraft', 'HQ-P1'), { ...actor('spy', 'C3', 2), id: 'enemy' }];
    expect(moveError(pieces, 1, { from: 'HQ-P1', to: 'HQ-P2' })).toBe('LANE_REQUIRED');
    expect(moveError(pieces, 1, { from: 'HQ-P1', to: 'HQ-P2', lane: 'C-D' as 'C' })).toBe('LANE_REQUIRED');
    expect(moveError(pieces, 1, { from: 'HQ-P1', to: 'HQ-P2', lane: 'C' })).toBeNull();
    expect(moveError(pieces, 1, { from: 'HQ-P1', to: 'C7', lane: 'D' })).toBe('UNEXPECTED_LANE');
  });
  test('enemy pieces on both intermediate lanes leave both HQ routes legal', () => {
    const pieces = [actor('aircraft', 'HQ-P1'), { ...actor('spy', 'C3', 2), id: 'c' }, { ...actor('mine', 'D7', 2), id: 'd' }];
    expect(legalMoves(pieces, 1).filter(m => m.to === 'HQ-P2')).toEqual([{ from: 'HQ-P1', to: 'HQ-P2', lane: 'C' }, { from: 'HQ-P1', to: 'HQ-P2', lane: 'D' }]);
  });
});
test('all kinds at every site have symmetric legal move sets', () => {
  for (const type of PIECE_TYPES) for (const site of SITES) {
    const pieces = [actor(type, site)];
    const encode = (m: Move) => `${m.from}/${m.to}/${m.lane ?? ''}`;
    expect(legalMoves(pieces.map(mirror), 2).map(encode).sort()).toEqual(legalMoves(pieces, 1).map(mirrorMove).map(encode).sort());
    expect(anchors(site).length).toBe(site.startsWith('HQ') ? 2 : 1);
  }
});
