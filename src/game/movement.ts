import { anchors, isHQ, isSite, siteAt, SITES, type Point } from './board';
import { forward, RuleError, type Move, type Piece, type Player, type Site } from './types';

function straightPath(a: Point, b: Point): Site[] | null {
  if ((a.x !== b.x && a.y !== b.y) || (a.x === b.x && a.y === b.y)) return null;
  const distance = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  return Array.from({ length: distance + 1 }, (_, i) => siteAt(a.x + Math.sign(b.x - a.x) * i, a.y + Math.sign(b.y - a.y) * i)!);
}
/** Returns a stable reason, without mutating inputs. Caller validates the board structure. */
export function moveError(pieces: readonly Piece[], side: Player, move: Move): string | null {
  if (!isSite(move.from) || !isSite(move.to)) return 'INVALID_SITE';
  if (move.from === move.to) return 'SAME_SITE';
  const actor = pieces.find(p => p.position === move.from);
  if (!actor || actor.owner !== side) return 'NOT_OWN_PIECE';
  if (actor.type === 'mine' || actor.type === 'flag') return 'IMMOBILE';
  if (pieces.some(p => p.position === move.to && p.owner === side)) return 'FRIENDLY_DESTINATION';
  const betweenHQs = isHQ(move.from) && isHQ(move.to);
  if (betweenHQs && actor.type === 'aircraft') {
    if (move.lane !== 'C' && move.lane !== 'D') return 'LANE_REQUIRED';
  } else if (move.lane !== undefined) return 'UNEXPECTED_LANE';
  let reason = 'GEOMETRY';
  for (const a of anchors(move.from)) for (const b of anchors(move.to)) {
    if (betweenHQs && actor.type === 'aircraft' && (a.x !== 'ABCDEF'.indexOf(move.lane!) || b.x !== a.x)) continue;
    const path = straightPath(a, b);
    if (!path) continue;
    // Includes attempted C↔D internal traversal at either endpoint.
    if (path.slice(1, -1).some(isHQ)) { reason = 'HQ_TRANSIT'; continue; }
    const dx = b.x - a.x, dy = b.y - a.y, distance = Math.abs(dx) + Math.abs(dy);
    const ability = actor.type === 'engineer' || (actor.type === 'aircraft' ? dx === 0 || (dy === 0 && Math.abs(dx) === 1) : distance === 1 || ((actor.type === 'tank' || actor.type === 'cavalry') && dx === 0 && dy === 2 * forward(side)));
    if (!ability) { reason = 'DISTANCE'; continue; }
    if (actor.type !== 'aircraft' && Math.min(a.y, b.y) <= 4 && Math.max(a.y, b.y) >= 5 && a.x !== 1 && a.x !== 4) { reason = 'BOUNDARY'; continue; }
    const blocked = path.slice(1, -1).some(site => pieces.some(p => p.position === site && (actor.type !== 'aircraft' || p.owner !== side)));
    if (blocked) { reason = 'BLOCKED'; continue; }
    return null;
  }
  return reason;
}
export function assertMove(pieces: readonly Piece[], side: Player, move: Move): void {
  const reason = moveError(pieces, side, move);
  if (reason) throw new RuleError(reason);
}
export function legalMoves(pieces: readonly Piece[], side: Player): Move[] {
  const moves: Move[] = [];
  for (const piece of pieces) {
    if (piece.owner !== side || piece.position === null || piece.type === 'mine' || piece.type === 'flag') continue;
    for (const to of SITES) {
      const candidates: Move[] = isHQ(piece.position) && isHQ(to) && piece.type === 'aircraft'
        ? (['C', 'D'] as const).map(lane => ({ from: piece.position!, to, lane })) : [{ from: piece.position, to }];
      for (const move of candidates) if (moveError(pieces, side, move) === null) moves.push(move);
    }
  }
  return moves;
}
