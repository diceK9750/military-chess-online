import { validatePlacement } from '../game/placement';
import type { Piece, Player } from '../game/types';

export interface DraftStore { load(side: Player): Piece[] | null; save(side: Player, pieces: readonly Piece[]): boolean }
/** Replaceable local demo adapter. Never an authoritative game store. */
export const localDraftStore: DraftStore = {
  load(side) {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(`military-chess:dev-draft:v1:${side}`) ?? 'null');
      if (!Array.isArray(value)) return null;
      validatePlacement(value, side);
      return value as Piece[];
    } catch { return null; }
  },
  save(side, pieces) {
    try { localStorage.setItem(`military-chess:dev-draft:v1:${side}`, JSON.stringify(pieces)); return true; }
    catch { return false; }
  },
};
