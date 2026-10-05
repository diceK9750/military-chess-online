import { PerspectiveCamera, Vector3 } from 'three';
import { sitePoint, type BattlefieldViewState, type CameraPreset } from './state';

export type CinemaShot = NonNullable<BattlefieldViewState['cinematic']>['shot'];
export interface CinemaPose {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly shot: CinemaShot;
  readonly framing: 'overview' | 'action';
}
export interface CinemaBounds { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number; readonly height: number }
// Include the complete historical deployment, raised nameplates and the two HQ banners.
export const CINEMA_BOARD: CinemaBounds = { minX: -3.25, maxX: 3.25, minZ: -4.65, maxZ: 4.65, height: 2.1 };
export const cinemaCorners = (bounds: CinemaBounds) => [bounds.minX, bounds.maxX].flatMap(x => [bounds.minZ, bounds.maxZ].flatMap(z => [0, bounds.height].map(y => new Vector3(x, y, z))));

/** Deterministic fitting, only on an event/resize. No game rules or frame-by-frame camera search. */
function fit(bounds: CinemaBounds, aspect: number, direction: readonly [number, number, number], shot: CinemaShot, framing: CinemaPose['framing']): CinemaPose {
  const target = new Vector3((bounds.minX + bounds.maxX) / 2, .55, (bounds.minZ + bounds.maxZ) / 2);
  const bearing = new Vector3(...direction).normalize();
  const camera = new PerspectiveCamera(42, Math.max(.1, aspect || 1), .1, 150);
  const corners = cinemaCorners(bounds);
  const fits = (distance: number) => {
    camera.position.copy(target).addScaledVector(bearing, distance);
    camera.lookAt(target); camera.updateMatrixWorld();
    return corners.every(corner => { const p = corner.clone().project(camera); return Math.abs(p.x) <= .9 && Math.abs(p.y) <= .88 && p.z > -1 && p.z < 1; });
  };
  let low = 3, high = 100;
  for (let i = 0; i < 18; i++) { const mid = (low + high) / 2; if (fits(mid)) high = mid; else low = mid; }
  fits(high);
  return { position: camera.position.toArray(), target: target.toArray(), shot, framing };
}

/** Every close shot retains the real origin, destination, full squad and raised labels. */
export function cinemaActionBounds(state: Pick<BattlefieldViewState, 'lastMove'>): CinemaBounds {
  if (!state.lastMove) return CINEMA_BOARD;
  const from = sitePoint(state.lastMove.from), to = sitePoint(state.lastMove.to);
  const centerX = (from.x + to.x) / 2, centerZ = (from.z + to.z) / 2;
  const halfX = Math.max(1.85, Math.abs(from.x - to.x) / 2 + .85);
  const halfZ = Math.max(1.8, Math.abs(from.z - to.z) / 2 + .9);
  return { minX: centerX - halfX, maxX: centerX + halfX, minZ: centerZ - halfZ, maxZ: centerZ + halfZ, height: 2.85 };
}

export function cinemaPose(state: Pick<BattlefieldViewState, 'cinematic' | 'lastMove'>, aspect: number, overview = false): CinemaPose {
  const shot = overview ? state.cinematic?.ending ? 'summary' : state.cinematic?.shot === 'opening' ? 'opening' : 'march' : state.cinematic?.shot ?? 'opening';
  const wide = overview || !state.lastMove || shot === 'opening' || shot === 'march' || shot === 'summary';
  // A stable overhead master shot makes advances readable. Angles change only for a recorded event.
  const direction: readonly [number, number, number] = wide ? [0, 1, .6] : shot === 'breach' ? [.2, 1, .62] : shot === 'pressure' || shot === 'decisive' ? [.2, 1, .72] : [.18, 1, .7];
  return fit(wide ? CINEMA_BOARD : cinemaActionBounds(state), aspect, direction, shot, wide ? 'overview' : 'action');
}

export function cinemaManualPose(state: Pick<BattlefieldViewState, 'cinematic' | 'lastMove'>, aspect: number, preset: CameraPreset): CinemaPose {
  const shot = state.cinematic?.shot ?? 'opening';
  if (preset === 'last' && state.lastMove) return fit(cinemaActionBounds(state), aspect, [0, 1, .65], shot, 'action');
  return fit(CINEMA_BOARD, aspect, preset === 'top' ? [0, 1, .0001] : preset === 'enemy' ? [0, 1, -.72] : preset === 'front' ? [0, 1, .82] : [0, 1, .6], shot, 'overview');
}

/** Fixed stage progress permits pausing and speed changes without replaying or skipping contact. */
export function cinemaRetime(elapsed: number, before: { march: number; clash: number; exit: number }, after: { march: number; clash: number; exit: number }): number {
  let remaining = Math.max(0, elapsed), next = 0;
  for (const phase of ['march', 'clash', 'exit'] as const) {
    if (before[phase] > 0 && remaining < before[phase]) return next + remaining / before[phase] * after[phase];
    remaining -= before[phase]; next += after[phase];
  }
  return next;
}

/** Arc length along the recorded lane, including its approach from an HQ's logical center. */
export function cinemaRoute(move: NonNullable<BattlefieldViewState['lastMove']>): readonly { x: number; z: number }[] {
  const from = sitePoint(move.from), to = sitePoint(move.to);
  if (move.lane && move.from.startsWith('HQ-') && move.to.startsWith('HQ-')) {
    const x = move.lane === 'C' ? -.5 : .5;
    return [from, { x, z: from.z }, { x, z: to.z }, to];
  }
  return [from, to];
}
export function cinemaRoutePoint(route: ReturnType<typeof cinemaRoute>, progress: number): { x: number; z: number } {
  const lengths = route.slice(1).map((p, i) => Math.hypot(p.x - route[i].x, p.z - route[i].z));
  let remaining = lengths.reduce((a, b) => a + b, 0) * Math.max(0, Math.min(1, progress));
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) { const t = lengths[i] ? remaining / lengths[i] : 1; return { x: route[i].x + (route[i + 1].x - route[i].x) * t, z: route[i].z + (route[i + 1].z - route[i].z) * t }; }
    remaining -= lengths[i];
  }
  return route[route.length - 1];
}
