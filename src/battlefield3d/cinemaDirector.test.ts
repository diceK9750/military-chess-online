import { expect, test } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { SITES } from '../game/board';
import { cinemaActionBounds, cinemaCorners, cinemaManualPose, cinemaPose, cinemaRetime, cinemaRoute, cinemaRoutePoint, CINEMA_BOARD, type CinemaPose, type CinemaShot } from './cinemaDirector';
import type { BattlefieldViewState } from './state';
const film = (shot: CinemaShot, from: NonNullable<BattlefieldViewState['lastMove']>['from'] = 'B4', to: NonNullable<BattlefieldViewState['lastMove']>['to'] = 'B5') => ({ lastMove: { from, to }, cinematic: { shot, speed: 1, playing: true, title: '', ending: shot === 'decisive' } });
function assertFits(pose: CinemaPose, aspect: number, bounds: typeof CINEMA_BOARD) {
  const camera = new PerspectiveCamera(42, aspect, .1, 150); camera.position.set(...pose.position); camera.lookAt(new Vector3(...pose.target)); camera.updateMatrixWorld();
  for (const corner of cinemaCorners(bounds)) { const p = corner.project(camera); expect(Math.abs(p.x)).toBeLessThanOrEqual(.901); expect(Math.abs(p.y)).toBeLessThanOrEqual(.881); expect(p.z).toBeGreaterThan(-1); expect(p.z).toBeLessThan(1); }
}
test.each([.45, .6, .78, 1, 1.6, 2.3])('opening, summary and all manual whole-board presets fit at aspect %s', aspect => {
  for (const shot of ['opening', 'march', 'summary'] as const) assertFits(cinemaPose(film(shot), aspect), aspect, CINEMA_BOARD);
  for (const preset of ['full', 'top', 'front', 'enemy'] as const) assertFits(cinemaManualPose(film('battle'), aspect, preset), aspect, CINEMA_BOARD);
});
test('ordinary advances keep an identical master camera instead of tracking every unit', () => {
  expect(cinemaPose(film('march', 'A2', 'A3'), .65)).toEqual(cinemaPose(film('march', 'F7', 'F6'), .65));
});
test.each([.45, .7, 1.8])('action framing includes both real endpoints and tall figures at every board edge (%s)', aspect => {
  for (const destination of SITES) for (const shot of ['battle', 'breach', 'pressure', 'decisive'] as const) {
    const state = film(shot, 'HQ-P1', destination);
    assertFits(cinemaPose(state, aspect), aspect, cinemaActionBounds(state));
  }
});
test('short contact is closer but stays overhead, and resolution restores the global board', () => {
  const state = film('battle'), close = cinemaPose(state, 1), wide = cinemaPose(state, 1, true);
  expect(close.framing).toBe('action'); expect(close.position[1]).toBeLessThan(wide.position[1] * .85);
  expect(close.position[1] - close.target[1]).toBeGreaterThan(Math.abs(close.position[2] - close.target[2]));
  expect(wide.framing).toBe('overview'); expect(cinemaPose(film('decisive'), 1, true).shot).toBe('summary');
});
test('retiming preserves approach/contact/resolution progress and clamps complete phases', () => {
  const slow = { march: 2400, clash: 1500, exit: 450 }, fast = { march: 600, clash: 750, exit: 450 };
  expect(cinemaRetime(1200, slow, fast)).toBe(300);
  expect(cinemaRetime(3150, slow, fast)).toBe(975);
  expect(cinemaRetime(4125, slow, fast)).toBe(1575);
  expect(cinemaRetime(10000, slow, fast)).toBe(1800);
  expect(cinemaRetime(-100, slow, fast)).toBe(0);
});
test.each(['C', 'D'] as const)('HQ flight route follows only the recorded %s lane', lane => {
  const route = cinemaRoute({ from: 'HQ-P1', to: 'HQ-P2', lane });
  expect(cinemaRoutePoint(route, 0)).toEqual({ x: 0, z: 3.5 });
  expect(cinemaRoutePoint(route, .5)).toEqual({ x: lane === 'C' ? -.5 : .5, z: 0 });
  expect(cinemaRoutePoint(route, 1)).toEqual({ x: 0, z: -3.5 });
});
