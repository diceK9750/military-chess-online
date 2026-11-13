import { expect, test } from 'vitest';
import { PIECE_TYPES } from '../game/pieces';
import { motionProfile } from './presentation';
import { frameUv, spriteFrame, spritePhase, spriteSheet, spriteUrl, travelPose, travelProfile } from './sprites';
import { SPRITE_SHEETS } from './spriteSheets';

test('every hidden enemy uses the one neutral sheet, phase and travel whatever its real type', () => {
  for (const type of PIECE_TYPES) {
    const hidden = { owner: 2 as const, position: 'B5' as const, unknown: true as const, type };
    expect(spriteSheet(hidden)).toBe('unknown');
    expect(spritePhase(hidden, 1)).toBe(0);
    expect(travelProfile(motionProfile(hidden))).toEqual(travelProfile(motionProfile({ owner: 2, position: 'A1', unknown: true })));
  }
});

test('each public type has its own sheet and own pieces get a stable per-site phase', () => {
  const sheets = new Set(PIECE_TYPES.map(type => spriteSheet({ owner: 1, position: 'A1', unknown: false, type })));
  expect(sheets.size).toBe(PIECE_TYPES.length); expect(sheets.has('unknown')).toBe(false);
  for (const sheet of [...sheets, 'unknown' as const]) expect(SPRITE_SHEETS[sheet].durations.length).toBeGreaterThanOrEqual(10);
  const own = { owner: 1 as const, position: 'C3' as const, unknown: false as const, type: 'major' as const };
  expect(spritePhase(own, 1)).toBe(spritePhase(own, 1));
  expect(spritePhase({ ...own, owner: 2 }, 1)).toBe(0);
  expect(spriteUrl('general', '/military-chess-online/')).toBe('/military-chess-online/sprites/anime-board-v1/general.webp');
});

test('frames loop by their durations and stay inside the atlas', () => {
  const durations = SPRITE_SHEETS.general.durations as readonly number[], loop = durations.reduce((a, b) => a + b, 0);
  expect(spriteFrame('general', 0)).toBe(0);
  expect(spriteFrame('general', durations[0])).toBe(1);
  expect(spriteFrame('general', loop + durations[0])).toBe(1);
  expect(spriteFrame('general', loop - 1)).toBe(durations.length - 1);
  for (const [sheet, value] of Object.entries(SPRITE_SHEETS)) {
    const last = frameUv(sheet as keyof typeof SPRITE_SHEETS, value.durations.length - 1);
    expect(Math.min(...last)).toBeGreaterThanOrEqual(0); expect(Math.max(...last)).toBeLessThanOrEqual(1);
  }
});

test('travel is longer than the old hop, eased, and settles at the destination', () => {
  const profile = travelProfile({ duration: 300, height: .12, easing: 'linear' });
  expect(profile.duration).toBeGreaterThanOrEqual(520);
  expect(travelPose(profile, 0)).toMatchObject({ travel: 0, hop: 0, squash: 0 });
  const mid = travelPose(profile, .41); expect(mid.travel).toBeCloseTo(.5, 2); expect(mid.hop).toBeGreaterThan(.1);
  expect(travelPose(profile, .1).travel).toBeLessThan(.1);
  expect(travelPose(profile, .9).squash).toBeGreaterThan(0);
  expect(travelPose(profile, 1)).toMatchObject({ travel: 1, squash: 0 });
  expect(travelPose(profile, 1).hop).toBeCloseTo(0, 9);
});
