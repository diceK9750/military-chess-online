import { validatePlacement } from '../game/placement';
import type { Piece, Player } from '../game/types';

export interface DraftStore { load(side: Player): Piece[] | null; save(side: Player, pieces: readonly Piece[]): boolean }
/** Replaceable local draft adapter. It is never an authoritative online game store. */
function createLocalDraftStore(namespace: string): DraftStore { return {
  load(side) {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(`military-chess:${namespace}:v1:${side}`) ?? 'null');
      if (!Array.isArray(value)) return null;
      validatePlacement(value, side);
      return value as Piece[];
    } catch { return null; }
  },
  save(side, pieces) {
    try { localStorage.setItem(`military-chess:${namespace}:v1:${side}`, JSON.stringify(pieces)); return true; }
    catch { return false; }
  },
}; }
export const localDraftStore = createLocalDraftStore('dev-draft');
export const cpuDraftStore = createLocalDraftStore('cpu-draft');
