import type {PieceType} from '../game/types';
/** Cosmetic members of one logical unit; no new pieces or occupancy. */
export function squadFormation(type:PieceType,followers:number){
 if(['mine','spy','aircraft'].includes(type))return [];
 return Array.from({length:type==='tank'?Math.min(2,followers):followers},(_,i)=>({
  x:type==='engineer'?0:type==='tank'?(i%2?-.27:.27):(i%2?-.28:.28),
  z:type==='engineer'?-.28-i*.21:type==='cavalry'?-.1-Math.floor(i/2)*.21:type==='tank'?-.24-i*.12:-.26-Math.floor(i/2)*.2,
  scale:type==='tank'?.55:type==='cavalry'?.7:.8,
  type:type==='engineer'||type==='cavalry'||type==='tank'?type:'soldier',
 }));
}
