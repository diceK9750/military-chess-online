import { territory } from '../game/board';
import { PIECES, PIECE_TYPES } from '../game/pieces';
import { validatePlacement } from '../game/placement';
import type { Piece, PieceType, Player, Site } from '../game/types';
import { seededRandom } from './random';

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Strategy is optional; every returned setup must pass the canonical validator. */
export function generateCpuPlacement(side: Player, seed: number): Piece[] {
  const random = seededRandom(seed);
  const lastRow = side === 1 ? 1 : 8;
  const secondRow = side === 1 ? 2 : 7;
  const reserved = new Map<Site, PieceType>();
  const mineSites = shuffle(territory(side).filter(site => site === `HQ-P${side}` || site.endsWith(`${lastRow}`)), random).slice(0, 2);
  for (const site of mineSites) reserved.set(site, 'mine');
  const flagSite = shuffle(territory(side).filter(site => site.endsWith(`${secondRow}`)), random)[0];
  reserved.set(flagSite, 'flag');

  const remaining = PIECE_TYPES.flatMap(type => Array.from({ length: PIECES[type].count - (type === 'mine' ? 2 : type === 'flag' ? 1 : 0) }, () => type));
  const shuffled = shuffle(remaining, random);
  const pieces = territory(side).map((site, index) => ({
    id: `cpu-${side}-${index}`, owner: side, type: reserved.get(site) ?? shuffled.shift()!, position: site,
  } satisfies Piece));
  validatePlacement(pieces, side);
  return pieces;
}
