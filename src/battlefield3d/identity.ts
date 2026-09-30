import type { BattlefieldPiece } from './state';

/** Only a public type may select a silhouette. Unknown opponents always use the same descriptor. */
export function identity(piece: BattlefieldPiece) {
  const type = piece.unknown ? null : piece.type;
  const officers = ['general','lieutenantGeneral','majorGeneral','colonel','lieutenantColonel','major','captain','lieutenant','secondLieutenant'];
  const rank = type ? officers.indexOf(type) : -1;
  return { rank: rank < 0 ? 0 : 9 - rank, equipment: type && rank < 0 ? type : 'soldier' };
}
