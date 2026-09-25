import { PIECES } from '../game/pieces';
import type { PieceType } from '../game/types';

const PIECE_ICONS = {
  general: '⭐',
  lieutenantGeneral: '⭐',
  majorGeneral: '⭐',
  colonel: '🛡️',
  lieutenantColonel: '🛡️',
  major: '🛡️',
  captain: '🪖',
  lieutenant: '🪖',
  secondLieutenant: '🪖',
  aircraft: '✈️',
  tank: '◼️',
  engineer: '🔧',
  mine: '💣',
  cavalry: '🐎',
  spy: '🕵️',
  flag: '🚩',
} as const satisfies Record<PieceType, string>;

export function PieceFace({ type }: { type: PieceType }) {
  return <span className="piece-face">
    <span className="piece-icon" aria-hidden="true">{PIECE_ICONS[type]}</span>
    <span className="piece-name">{PIECES[type].label}</span>
  </span>;
}
