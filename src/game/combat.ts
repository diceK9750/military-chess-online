import { rear } from './board';
import { RuleError, type EffectiveType, type Outcome, type Piece } from './types';

export const COMBAT_TYPES: readonly EffectiveType[] = ['general', 'lieutenantGeneral', 'majorGeneral', 'colonel', 'lieutenantColonel', 'major', 'captain', 'lieutenant', 'secondLieutenant', 'aircraft', 'tank', 'engineer', 'cavalry', 'spy', 'mine'];
// The literal matrix is the sole executable combat definition. Tests compare it to GAME_RULES.md.
const MATRIX = [
  '相 勝 勝 勝 勝 勝 勝 勝 勝 勝 勝 勝 勝 敗 相',
  '敗 相 勝 勝 勝 勝 勝 勝 勝 勝 勝 勝 勝 勝 相',
  '敗 敗 相 勝 勝 勝 勝 勝 勝 勝 勝 勝 勝 勝 相',
  '敗 敗 敗 相 勝 勝 勝 勝 勝 敗 敗 勝 勝 勝 相',
  '敗 敗 敗 敗 相 勝 勝 勝 勝 敗 敗 勝 勝 勝 相',
  '敗 敗 敗 敗 敗 相 勝 勝 勝 敗 敗 勝 勝 勝 相',
  '敗 敗 敗 敗 敗 敗 相 勝 勝 敗 敗 勝 勝 勝 相',
  '敗 敗 敗 敗 敗 敗 敗 相 勝 敗 敗 勝 勝 勝 相',
  '敗 敗 敗 敗 敗 敗 敗 敗 相 敗 敗 勝 勝 勝 相',
  '敗 敗 敗 勝 勝 勝 勝 勝 勝 相 勝 勝 勝 勝 勝',
  '敗 敗 敗 勝 勝 勝 勝 勝 勝 敗 相 敗 勝 勝 相',
  '敗 敗 敗 敗 敗 敗 敗 敗 敗 敗 勝 相 敗 勝 勝',
  '敗 敗 敗 敗 敗 敗 敗 敗 敗 敗 敗 勝 相 勝 相',
  '勝 敗 敗 敗 敗 敗 敗 敗 敗 敗 敗 敗 敗 相 相',
  '相 相 相 相 相 相 相 相 相 敗 相 敗 相 相 相',
].map(row => row.split(' '));
export function combat(attacker: EffectiveType, defender: EffectiveType): Outcome {
  const row = COMBAT_TYPES.indexOf(attacker), col = COMBAT_TYPES.indexOf(defender);
  if (row < 0 || col < 0) throw new RuleError('INVALID_EFFECTIVE_TYPE');
  return ({ 勝: 'ATTACKER', 敗: 'DEFENDER', 相: 'MUTUAL' } as const)[MATRIX[row][col] as '勝' | '敗' | '相'];
}
export function effectiveType(piece: Piece, pieces: readonly Piece[]): EffectiveType | null {
  if (piece.type !== 'flag') return piece.type;
  if (!piece.position) return null;
  const site = rear(piece.position, piece.owner);
  const support = site && pieces.find(p => p.position === site && p.owner === piece.owner);
  return support && support.type !== 'flag' ? support.type : null;
}
