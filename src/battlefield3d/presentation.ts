import type { BattlefieldPiece } from './state';
export function motionProfile(piece: BattlefieldPiece) {
  const type=piece.unknown?null:piece.type;
  return type==='aircraft'?{duration:300,height:.7,easing:'linear' as const}:type==='cavalry'?{duration:220,height:.18,easing:'rush' as const}:type==='tank'?{duration:340,height:.035,easing:'heavy' as const}:type==='engineer'?{duration:240,height:.09,easing:'linear' as const}:{duration:300,height:.12,easing:'linear' as const};
}
export const allowBattleCamera=(reduced:boolean,elapsedSinceManual:number)=>!reduced&&elapsedSinceManual>3000;
