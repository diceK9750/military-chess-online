import type { PieceType } from './types';

export const RULESET_VERSION = 'v0.1';
export const PIECES = {
  general: { label: '大将', count: 1, captures: true },
  lieutenantGeneral: { label: '中将', count: 1, captures: true },
  majorGeneral: { label: '少将', count: 1, captures: true },
  colonel: { label: '大佐', count: 1, captures: true },
  lieutenantColonel: { label: '中佐', count: 1, captures: true },
  major: { label: '少佐', count: 1, captures: true },
  captain: { label: '大尉', count: 2, captures: false },
  lieutenant: { label: '中尉', count: 2, captures: false },
  secondLieutenant: { label: '少尉', count: 2, captures: false },
  aircraft: { label: '飛行機', count: 2, captures: false },
  tank: { label: 'タンク', count: 2, captures: false },
  engineer: { label: '工兵', count: 2, captures: false },
  cavalry: { label: '騎兵', count: 1, captures: false },
  spy: { label: 'スパイ', count: 1, captures: false },
  mine: { label: '地雷', count: 2, captures: false },
  flag: { label: '軍旗', count: 1, captures: false },
} as const satisfies Record<PieceType, { label: string; count: number; captures: boolean }>;
export const PIECE_TYPES = Object.keys(PIECES) as PieceType[];
