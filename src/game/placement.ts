import { anchors, isSite, territory } from './board';
import { PIECES, PIECE_TYPES } from './pieces';
import { RuleError, type Piece, type Player } from './types';

/** Structural validation also accepts sparse synthetic test positions. */
export function validatePieces(pieces: readonly Piece[]): void {
  const ids = new Set<string>(); const occupied = new Set<string>();
  for (const p of pieces) {
    if (!p || !p.id || ![1, 2].includes(p.owner) || !PIECE_TYPES.includes(p.type)) throw new RuleError('INVALID_PIECE');
    if (ids.has(p.id)) throw new RuleError('DUPLICATE_ID');
    ids.add(p.id);
    if (p.position !== null) {
      if (!isSite(p.position)) throw new RuleError('INVALID_SITE');
      if (occupied.has(p.position)) throw new RuleError('OCCUPIED_SITE');
      occupied.add(p.position);
    }
  }
  for (const side of [1, 2] as const) for (const type of PIECE_TYPES) {
    if (pieces.filter(p => p.owner === side && p.type === type).length > PIECES[type].count) throw new RuleError('EXCESS_PIECES');
  }
}
export function validatePlacement(pieces: readonly Piece[], side: Player): void {
  validatePieces(pieces);
  if (pieces.length !== 23 || pieces.some(p => p.owner !== side)) throw new RuleError('PIECE_COUNT');
  for (const type of PIECE_TYPES) if (pieces.filter(p => p.type === type).length !== PIECES[type].count) throw new RuleError('INVENTORY');
  const sites = territory(side);
  for (const p of pieces) {
    if (!p.position || !sites.includes(p.position)) throw new RuleError('OUTSIDE_TERRITORY');
    const row = side === 1 ? 4 : 5;
    if ((p.type === 'flag' || p.type === 'mine') && [`B${row}`, `E${row}`].includes(p.position)) throw new RuleError('FORBIDDEN_ENTRANCE');
    if (p.type === 'flag' && anchors(p.position)[0].y === (side === 1 ? 1 : 8)) throw new RuleError('FLAG_LAST_ROW');
  }
}
