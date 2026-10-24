import { PerspectiveCamera, Vector3 } from 'three';
import { sitePoint, type BattlefieldViewState, type CameraPreset } from './state';
import type { Player, Site } from '../game/types';

export interface SelectionCameraFrame {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly sites: readonly Site[];
  readonly bounds: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number; readonly maxY: number };
}

/** Keep the whole legal region, including both physical halves of either HQ, in view. */
export function selectionCameraFrame(aspect: number, viewer: Player, selected: Site, legalTargets: readonly Site[], pending: Site | null = null): SelectionCameraFrame {
  const sites = [...new Set([selected, ...legalTargets, ...(pending ? [pending] : [])])];
  const points = sites.map(site => ({ ...sitePoint(site), halfWidth: site.startsWith('HQ') ? 1.08 : site === selected ? .78 : .64, height: site === selected ? 2.2 : 1.8 }));
  function contextRange(min: number, max: number, boardMin: number, boardMax: number): readonly [number, number] {
    // A little surrounding board prevents a single immobile piece becoming a disorienting close-up.
    const width = Math.max(3.15, max - min);
    const center = Math.max(boardMin + width / 2, Math.min(boardMax - width / 2, (min + max) / 2));
    return [center - width / 2, center + width / 2];
  }
  const [minX, maxX] = contextRange(Math.min(...points.map(p => p.x - p.halfWidth)), Math.max(...points.map(p => p.x + p.halfWidth)), -3.65, 3.65);
  const [minZ, maxZ] = contextRange(Math.min(...points.map(p => p.z - .65)), Math.max(...points.map(p => p.z + .65)), -4.7, 4.7);
  const target = [(minX + maxX) / 2, .35, (minZ + maxZ) / 2] as const;
  const side = viewer === 1 ? 1 : -1;
  const camera = new PerspectiveCamera(42, Math.max(.15, Number.isFinite(aspect) ? aspect : 1), .1, 200);
  // Fit actual pieces/nameplates, not a tall imaginary box over the entire surrounding board.
  const corners = [minX, maxX].flatMap(x => [minZ, maxZ].map(z => new Vector3(x, 0, z)));
  for(const point of points)for(const dx of [-point.halfWidth,point.halfWidth])for(const dz of [-.65,.65])for(const y of [0,point.height])corners.push(new Vector3(point.x+dx,y,point.z+dz));
  const place = (distance: number) => {
    // Identical compass direction to the overview, with a slightly steeper view for separated targets.
    camera.position.set(target[0], target[1] + distance * .94, target[2] + side * distance * .56);
    camera.lookAt(...target); camera.updateMatrixWorld();
  };
  let low = 3.8, high = 100;
  for (let step = 0; step < 28; step++) {
    const distance = (low + high) / 2; place(distance);
    const fits = corners.every(corner => {
      const projected = corner.clone().project(camera);
      return Math.abs(projected.x) <= .89 && Math.abs(projected.y) <= .84 && projected.z > -1 && projected.z < 1;
    });
    if (fits) high = distance; else low = distance;
  }
  place(high);
  return { position: [camera.position.x, camera.position.y, camera.position.z], target, sites, bounds: { minX, maxX, minZ, maxZ, maxY: 2.2 } };
}

/** Display-only selection lifecycle. A manual overview stays put until a different piece is selected. */
export function selectionCameraUpdate(previous: BattlefieldViewState | null, next: BattlefieldViewState, current: CameraPreset, dragging = false): CameraPreset | null {
  if (next.phase === 'replay' || dragging) return null;
  const selected = next.interaction.selectedSite;
  const previousSelected = previous?.interaction.selectedSite;
  const own = selected && next.pieces.some(piece => piece.position === selected && piece.owner === next.viewer && !piece.unknown);
  const changedTurn = previous && (previous.viewer !== next.viewer || previous.playerTurn !== next.playerTurn || previous.moveCount !== next.moveCount);
  if (previous?.viewer !== undefined && previous.viewer !== next.viewer) return 'full';
  if ((!own || next.finished || !next.interaction.interactionEnabled || changedTurn) && (previousSelected || current === 'selected')) return 'full';
  if (own && next.interaction.interactionEnabled && !next.finished && (selected !== previousSelected || current === 'selected')) return 'selected';
  return null;
}

/** Fit the entire board and nameplates; display-only, shared with browser picking tests. */
export function fullCameraDistance(aspect: number, top = false): number {
  const camera = new PerspectiveCamera(42, aspect, .1, 100);
  for (let distance = 8; distance <= 34; distance += .1) {
    camera.position.set(0, top ? distance : distance * .86, top ? .001 : distance * .6);
    camera.lookAt(0, .25, 0); camera.updateMatrixWorld();
    const fits = [-3.65, 3.65].every(x => [-4.7, 4.7].every(z => [0, 1.2].every(y => {
      const point = new Vector3(x, y, z).project(camera);
      return Math.abs(point.x) <= .93 && Math.abs(point.y) <= .93;
    })));
    if (fits) return distance;
  }
  return 34;
}

/** Display-only fit. HQ contributes both physical halves, not an extra logical cell. */
export function selectionFit(sites:readonly Site[],width:number,height:number,viewer:Player=1){
  const points=sites.flatMap(site=>{const p=sitePoint(site),half=site.startsWith('HQ')?1:.52;return [-half,half].flatMap(dx=>[-.52,.52].flatMap(dz=>[0,1.6].map(y=>new Vector3(p.x+dx,y,p.z+dz))));});
  if(!points.length)points.push(new Vector3());
  const x=(Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2,z=(Math.min(...points.map(p=>p.z))+Math.max(...points.map(p=>p.z)))/2;
  const target=new Vector3(x,.6,z),camera=new PerspectiveCamera(42,width/height,.1,100),side=viewer===1?1:-1;
  let distance=6;
  for(;distance<34;distance+=.1){
    camera.position.set(x,distance*.82,z+side*distance*.7);camera.lookAt(target);camera.updateMatrixWorld();
    if(points.every(p=>{const v=p.clone().project(camera);return Math.abs(v.x)<=.9&&v.y<=1-2*Math.min(72,height*.15)/height&&v.y>=-1+32/height;}))break;
  }
  return {position:camera.position.clone(),target,distance};
}

/** Screen-space expansion only for legal targets; ties stay unselected. */
export function closestTouchTarget<T>(x:number,y:number,targets:readonly {x:number;y:number;value:T}[],radius=22):T|undefined{
  const sorted=targets.map(t=>({...t,d:Math.hypot(t.x-x,t.y-y)})).filter(t=>t.d<=radius).sort((a,b)=>a.d-b.d);
  if(!sorted.length||sorted.length>1&&sorted[1].d-sorted[0].d<4)return undefined;
  return sorted[0].value;
}

/** 42-degree aerial overview, fitted to HQ flags and the whole terrain. */
export function aerialDistance(aspect:number){
 const camera=new PerspectiveCamera(42,aspect,.1,100);
 for(let d=8;d<=40;d+=.1){camera.position.set(d*.08,d*.8,d*.9);camera.lookAt(0,.3,0);camera.updateMatrixWorld();if([-3.8,3.8].every(x=>[-4.8,4.8].every(z=>[0,2.5].every(y=>{const v=new Vector3(x,y,z).project(camera);return Math.abs(v.x)<=.92&&Math.abs(v.y)<=.78;}))))return d;}
 return 40;
}
