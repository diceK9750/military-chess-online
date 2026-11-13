import type { PieceType } from '../game/types';
import type { BattlefieldPiece } from './state';
import { SPRITE_SHEETS, type SpriteSheetKey } from './spriteSheets';

export const SPRITE_COLUMNS = 4;
/** Idle sprites advance on a slow timer rather than a 60 fps loop. */
export const IDLE_TICK_MS = 1000 / 12;

const SHEET_BY_TYPE: Readonly<Record<PieceType, SpriteSheetKey>> = {
  general: 'general', lieutenantGeneral: 'lieutenant-general', majorGeneral: 'major-general', colonel: 'colonel',
  lieutenantColonel: 'lieutenant-colonel', major: 'major', captain: 'captain', lieutenant: 'lieutenant',
  secondLieutenant: 'second-lieutenant', aircraft: 'aircraft', tank: 'tank', engineer: 'engineer',
  cavalry: 'cavalry', spy: 'spy', mine: 'mine', flag: 'flag',
};

/** Only a public type selects art. Every unrevealed enemy shares one neutral sheet. */
export function spriteSheet(piece: BattlefieldPiece): SpriteSheetKey {
  return piece.unknown ? 'unknown' : SHEET_BY_TYPE[piece.type];
}
export function spriteUrl(sheet: SpriteSheetKey, base = import.meta.env.BASE_URL) {
  return `${base}sprites/anime-board-v1/${sheet}.webp`;
}
const loopLength = (sheet: SpriteSheetKey) => (SPRITE_SHEETS[sheet].durations as readonly number[]).reduce((sum, ms) => sum + ms, 0);
/** Frame index for a looping sheet at `elapsed` ms. */
export function spriteFrame(sheet: SpriteSheetKey, elapsed: number) {
  const durations = SPRITE_SHEETS[sheet].durations as readonly number[];
  let t = ((elapsed % loopLength(sheet)) + loopLength(sheet)) % loopLength(sheet);
  for (let index = 0; index < durations.length; index++) { if (t < durations[index]) return index; t -= durations[index]; }
  return 0;
}
/**
 * Own pieces start at different points of their loop so a formation does not move in lockstep.
 * Unrevealed enemies all use phase 0, so timing cannot differ by hidden type or identity.
 */
export function spritePhase(piece: BattlefieldPiece, viewer: number) {
  if (piece.unknown || piece.owner !== viewer) return 0;
  let hash = 0;
  for (const char of piece.position) hash = (hash * 31 + char.charCodeAt(0)) % 9973;
  return hash * 37;
}
/** UV rectangle [u0, v0, u1, v1] of a frame inside its atlas (flipY texture space). */
export function frameUv(sheet: SpriteSheetKey, index: number) {
  const rows = SPRITE_SHEETS[sheet].rows, col = index % SPRITE_COLUMNS, row = Math.floor(index / SPRITE_COLUMNS);
  return [col / SPRITE_COLUMNS, 1 - (row + 1) / rows, (col + 1) / SPRITE_COLUMNS, 1 - row / rows] as const;
}

export interface TravelProfile { readonly duration: number; readonly hop: number; readonly lean: number; readonly settle: number; readonly easing: 'smooth' | 'rush' | 'heavy' | 'glide' }
/** Longer, eased travel derived from the public motion profile (unknown pieces stay identical). */
export function travelProfile(profile: { duration: number; height: number; easing: 'linear' | 'rush' | 'heavy' }): TravelProfile {
  const glide = profile.height >= .5;
  return {
    duration: Math.round(Math.max(520, profile.duration * 2.1)),
    hop: glide ? profile.height : Math.max(.1, profile.height * 1.2),
    lean: profile.easing === 'heavy' ? .05 : profile.easing === 'rush' ? .16 : .11,
    settle: profile.easing === 'heavy' ? .035 : .07,
    easing: glide ? 'glide' : profile.easing === 'linear' ? 'smooth' : profile.easing,
  };
}
export function travelEase(easing: TravelProfile['easing'], p: number) {
  if (easing === 'rush') return 1 - Math.pow(1 - p, 3);
  if (easing === 'heavy') return p * p * (3 - 2 * p);
  if (easing === 'glide') return p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  return p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}
/** Travel occupies the first 82% of the move; the remainder is a small landing settle. */
export function travelPose(profile: TravelProfile, progress: number) {
  const travelEnd = .82, p = Math.min(1, progress / travelEnd), travel = travelEase(profile.easing, p);
  const hop = Math.sin(p * Math.PI) * profile.hop;
  const lean = Math.sin(p * Math.PI) * profile.lean;
  const s = progress <= travelEnd ? 0 : (progress - travelEnd) / (1 - travelEnd);
  const squash = s && s < 1 ? Math.sin(s * Math.PI) * profile.settle * (1 - s * .4) : 0;
  return { travel, hop, lean, squash };
}
