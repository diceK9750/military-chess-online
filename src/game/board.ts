import { forward, type Player, type Site } from './types';

export interface Point { readonly x: number; readonly y: number }
export const isHQ = (site: Site): boolean => site.startsWith('HQ-');
export const hq = (side: Player): Site => side === 1 ? 'HQ-P1' : 'HQ-P2';
/** Geometry only: the four physical HQ coordinates are never occupiable sites. */
export function siteAt(x: number, y: number): Site | null {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 5 || y < 1 || y > 8) return null;
  if ((x === 2 || x === 3) && (y === 1 || y === 8)) return hq(y === 1 ? 1 : 2);
  return `${'ABCDEF'[x]}${y}` as Site;
}
export const SITES: readonly Site[] = [...new Set(Array.from({ length: 48 }, (_, i) => siteAt(i % 6, Math.floor(i / 6) + 1)!))];
export const isSite = (value: unknown): value is Site => typeof value === 'string' && SITES.includes(value as Site);
export function anchors(site: Site): readonly Point[] {
  if (isHQ(site)) return [{ x: 2, y: site === 'HQ-P1' ? 1 : 8 }, { x: 3, y: site === 'HQ-P1' ? 1 : 8 }];
  return [{ x: 'ABCDEF'.indexOf(site[0]), y: Number(site[1]) }];
}
export const territory = (side: Player): readonly Site[] => SITES.filter(s => (anchors(s)[0].y <= 4 ? 1 : 2) === side);
export function rear(site: Site, side: Player): Site | null {
  if (isHQ(site)) return null; // Flags cannot be placed at either last row and cannot move.
  const p = anchors(site)[0];
  return siteAt(p.x, p.y - forward(side));
}
export function rotate(site: Site): Site {
  const p = anchors(site)[0];
  return siteAt(5 - p.x, 9 - p.y)!;
}
