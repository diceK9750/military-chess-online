import { generateFormationPlacement } from '../formation/templates';
import type { Piece, Player } from '../game/types';

/** CPU and human use the same legal candidates with separate deterministic choices. */
export function generateCpuPlacement(side: Player, seed: number): Piece[] {
  return generateFormationPlacement(side, seed ^ 0x9e3779b9, 'cpu');
}
