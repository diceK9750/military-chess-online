import * as THREE from 'three';
import {createBackend} from './backend';
import {sitePoint} from './state';
import type {BattlefieldViewState,BattlefieldPiece,BattlefieldHandlers,CameraPreset} from './state';
import type {BattlefieldRenderer} from './renderer';
import {qualityProfile} from './settings';
import {PIECES} from '../game/pieces';
import {identity} from './identity';
import {addOfficerRegalia,officerLook} from './regalia';
import {fullCameraDistance} from './camera';

import {cinemaTiming} from './cinemaPresentation';
/** Dedicated terrain and squads. Receives only a finished-source, allowlisted display adapter. */
export async function createBattlefield(host:HTMLElement,initial:BattlefieldViewState,onFailure:()=>void,_handlers:BattlefieldHandlers,forceWebGL=false):Promise<BattlefieldRenderer>{
 if(initial.phase!=='replay'||!initial.finished||!initial.result||!initial.cinematic||initial.pieces.some(p=>p.unknown))throw new Error('終局後の正式戦史のみ再現できます');
 const backend=await createBackend(onFailure,forceWebGL),canvas=backend.canvas,engine=backend.engine;
 canvas.dataset.backend=backend.kind;canvas.dataset.mode='cinematic';canvas.setAttribute('aria-label','操作可能な三次元戦場');canvas.setAttribute('role','img');
 const scene=new THREE.Scene();scene.background=new THREE.Color('#263d43');scene.fog=new THREE.Fog('#263d43',20,55);
 const camera=new THREE.PerspectiveCamera(42,1,.1,100),target=new THREE.Vector3(0,.3,0);
 const terrain=new THREE.Group(),units=new THREE.Group(),effects=new THREE.Group(),routes=new THREE.Group();scene.add(terrain,units,effects,routes);
 scene.add(new THREE.HemisphereLight('#fff1d0','#385a49',2.7));const sun=new THREE.DirectionalLight('#ffe9be',2.5);sun.position.set(-5,12,7);scene.add(sun);
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
 const geo=<T extends THREE.BufferGeometry>(g:T)=>{geometries.add(g);return g;};
 const mat=(c:string)=>{const m=new THREE.MeshLambertMaterial({color:c,flatShading:true});materials.add(m);return m;};
 const box=geo(new THREE.BoxGeometry(1,1,1)),cylinder=geo(new THREE.CylinderGeometry(.5,.5,1,6)),cone=geo(new THREE.ConeGeometry(.5,1,6)),head=geo(new THREE.IcosahedronGeometry(.5,0)),plane=geo(new THREE.PlaneGeometry(1,1));
 const soil=mat('#887552'),grass=mat('#73845c'),road=mat('#b49a70'),wood=mat('#604731'),river=mat('#537f87'),blue=mat('#477aa0'),red=mat('#9b4d43'),skin=mat('#d4c4a4'),dark=mat('#263232'),gold=mat('#e4c060'),silver=mat('#cbd9d8'),pale=mat('#9bcdd4'),amber=mat('#e4b352'),olive=mat('#626e48');
 function mesh(g:THREE.BufferGeometry,m:THREE.Material,x:number,y:number,z:number,sx:number,sy:number,sz:number,parent:THREE.Object3D){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);parent.add(o);return o;}
 const textCache=new Map<string,THREE.Material>(),labels:THREE.Object3D[]=[];
 function text(value:string,tone='plain'){const key=tone+value;if(textCache.has(key))return textCache.get(key)!;const c=document.createElement('canvas');c.width=512;c.height=96;const x=c.getContext('2d')!;x.fillStyle=tone==='general'?'#e4c060':tone==='colonel'?'#cbd9d8':'#162e34e8';x.fillRect(0,0,512,96);x.fillStyle=tone==='plain'?'#fff1c7':'#192f33';x.font='bold 54px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(value,256,50,495);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;textures.add(t);const m=new THREE.MeshBasicMaterial({map:t,transparent:true,depthTest:false});materials.add(m);textCache.set(key,m);return m;}
 function sign(value:string,x:number,y:number,z:number,width:number,parent:THREE.Object3D){const o=mesh(plane,text(value),x,y,z,width,width*.1875,1,parent);o.renderOrder=10;labels.push(o);return o;}
 mesh(box,soil,0,-.3,0,12,.5,13,terrain);mesh(box,grass,0,-.08,0,7,.12,9,terrain);
 // No chess grid or piece bases: an abstract encampment with two actual crossing roads.
 mesh(box,river,0,.015,0,10,.055,.35,terrain);
 for(const x of [-1.5,1.5]){mesh(box,road,x,.01,0,.65,.045,8.6,terrain);mesh(box,wood,x,.08,0,.8,.1,.62,terrain);for(const dx of [-.4,.4])mesh(box,wood,x+dx,.19,0,.04,.2,.62,terrain);}
 for(const owner of [1,2] as const){const z=owner===1?4.1:-4.1,m=owner===1?blue:red;mesh(box,m,0,.55,z,2.1,1,.05,terrain);for(const x of [-1.1,1.1])mesh(cylinder,wood,x,.72,z,.045,1.5,.045,terrain);mesh(cone,m,0,.75,z+ (owner===1?.3:-.3),1.8,1.15,1.1,terrain);sign(owner===1?'自軍本陣':'敵軍本陣',0,1.65,z,1.8,terrain);}
 for(const x of [-5,5])for(let i=0;i<6;i++){const z=-5+i*2;mesh(cone,grass,x,.5,z,2,1.4+i%2,2.5,terrain);mesh(cylinder,wood,x*.7,.3,z,.09,.6,.09,terrain);mesh(cone,grass,x*.7,.9,z,.7,1.1,.7,terrain);}
 const dustMaterial=new THREE.MeshBasicMaterial({color:'#deceb1',transparent:true,opacity:.55,depthWrite:false});materials.add(dustMaterial);
 const smokeGeo=geo(new THREE.IcosahedronGeometry(.18,0));
 let state=initial,disposed=false,raf=0,lastSize='',frameNumber=0,animation:((now:number)=>boolean)|undefined,started=0,paused:number|null=null,preset:CameraPreset='full',manualUntil=-Infinity;
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 const observer=new ResizeObserver(resize);
 // An idle WebGL canvas may be discarded while off-screen. Repaint on return,
 // without turning the event-driven renderer into a permanent animation loop.
 const visibility=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))requestDraw();});
 function visible(){if(document.visibilityState==='visible')requestDraw();}
 function cameraShot(ending=false){
  const shot=ending?'summary':state.cinematic?.shot??'opening',last=state.lastMove,from=last?sitePoint(last.from):{x:0,z:0},to=last?sitePoint(last.to):{x:0,z:0};
  const portrait=camera.aspect<.9,close=portrait?Math.max(7,6/camera.aspect):6;
  target.set(to.x*.7,.35,to.z*.7);
  if(shot==='opening'||shot==='summary'){const d=fullCameraDistance(camera.aspect);camera.position.set(d*.1,d*.95,d*.66);target.set(0,.3,0);}
  else if(shot==='breach')camera.position.set(to.x+close*.55,close*.45,to.z+close*.75);
  else if(shot==='pressure'||shot==='decisive')camera.position.set(to.x+close*.35,close*.52,to.z+close*.8);
  else if(shot==='battle')camera.position.set(to.x+close*.45,close*.55,to.z+close*.65);
  else {target.set((from.x+to.x)*.5,.3,(from.z+to.z)*.5);camera.position.set(target.x+close*.2,close*.9,target.z+close*.7);}
  canvas.dataset.shot=shot;camera.lookAt(target);canvas.dataset.cameraPose=camera.position.toArray().join('/')+'/'+target.toArray().join('/');
 }
 function setCamera(value:CameraPreset){preset=value;manualUntil=performance.now()+3000;const d=fullCameraDistance(camera.aspect);target.set(0,.3,0);if(value==='top')camera.position.set(0,fullCameraDistance(camera.aspect,true),.001);else if(value==='enemy')camera.position.set(0,d*.7,-d*.7);else if(value==='last'&&state.lastMove){const p=sitePoint(state.lastMove.to);target.set(p.x,.3,p.z);camera.position.set(p.x,8,p.z+7);}else camera.position.set(0,d*.8,d*.65);camera.lookAt(target);canvas.dataset.cameraPreset=preset;requestDraw();}
 function resize(){if(disposed)return;const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight),ratio=Math.min(window.devicePixelRatio||1,qualityProfile(state.quality??'standard').pixelRatio),key=`${w}/${h}/${ratio}`;if(key===lastSize)return;lastSize=key;engine.setPixelRatio(ratio);engine.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();canvas.dataset.quality=state.quality??'standard';canvas.dataset.pixelRatio=String(ratio);cameraShot(!animation&&!!state.cinematic?.ending);requestDraw();}
 function draw(){labels.forEach(o=>{const parent=o.parent?.getWorldQuaternion(new THREE.Quaternion())??new THREE.Quaternion();o.quaternion.copy(parent.invert().multiply(camera.quaternion));});engine.render(scene,camera);canvas.dataset.frame=String(++frameNumber);const info=(engine as unknown as {info?:{render?:{calls?:number;triangles?:number;drawCalls?:number}}}).info?.render;if(info){canvas.dataset.drawCalls=String(info.calls??info.drawCalls??0);canvas.dataset.triangles=String(info.triangles??0);}}
 function requestDraw(){if(disposed||raf)return;raf=requestAnimationFrame(now=>{raf=0;if(disposed)return;try{const active=paused===null&&!!animation?.(now);draw();if(active)requestDraw();else if(paused===null)animation=undefined;}catch{onFailure();}});}
 function unit(piece:BattlefieldPiece,parent:THREE.Object3D):THREE.Group{
  const g=new THREE.Group(),p=sitePoint(piece.position);g.position.set(p.x,0,p.z);g.rotation.y=piece.owner===1?0:Math.PI;parent.add(g);
  const uniform=piece.owner===1?blue:red,style=identity(piece),type=piece.unknown?'unknown':piece.type;
  const model=(kind:string,dx:number,dz:number,commander:boolean)=>{
   const b=new THREE.Group();b.position.set(dx,0,dz);g.add(b);
   const part=(shape:THREE.BufferGeometry,m:THREE.Material,x:number,y:number,z:number,sx:number,sy:number,sz:number)=>mesh(shape,m,x,y,z,sx,sy,sz,b);
   if(kind==='aircraft'){part(cone,silver,0,.72,0,.23,1,.23).rotation.x=Math.PI/2;part(box,silver,0,.74,0,1.16,.07,.29);part(box,uniform,0,.85,-.4,.06,.32,.23);part(box,uniform,0,.75,-.4,.46,.06,.2);part(head,dark,0,.72,.48,.14,.14,.14);part(box,dark,0,.72,.53,.045,.65,.04);return;}
   if(kind==='tank'){part(box,olive,0,.32,0,.65,.3,.8);for(const x of [-.34,.34]){part(box,dark,x,.19,0,.15,.25,.9);for(const z of [-.3,0,.3])part(cylinder,silver,x,.2,z,.12,.06,.12).rotation.z=Math.PI/2;}part(cylinder,olive,0,.56,0,.42,.25,.42);part(cylinder,dark,0,.59,.37,.07,.7,.07).rotation.x=Math.PI/2;return;}
   if(kind==='mine'){for(const x of [-.17,.17]){part(cylinder,dark,x,.09,0,.27,.14,.27);part(cylinder,amber,x,.17,0,.22,.025,.22);for(const dz of [-.08,.08])part(cone,silver,x,.24,dz,.045,.12,.045);}return;}
   if(kind==='cavalry'){part(box,wood,0,.44,0,.31,.31,.65);part(box,dark,0,.64,.19,.09,.26,.25);part(cone,wood,0,.73,.26,.19,.39,.24);part(box,wood,0,.87,.34,.16,.13,.24);for(const x of [-.06,.06])part(cone,dark,x,.98,.29,.05,.16,.05);for(const x of [-.1,.1])for(const z of [-.22,.22])part(box,dark,x,.19,z,.06,.4,.07);}
   const y=kind==='cavalry'?.35:0,low=kind==='spy'?.78:1;
   part(kind==='spy'?cone:cylinder,kind==='spy'?dark:uniform,0,(.33+y)*low,0,kind==='spy'?.19:.24,.37,.19);part(head,skin,0,(.58+y)*low,0,.16,.16,.16);part(kind==='spy'?cone:cylinder,kind==='spy'?dark:kind==='engineer'?amber:uniform,0,(.71+y)*low,0,kind==='engineer'?.34:.23,kind==='spy'?.26:.12,.24);
   if(kind!=='cavalry')for(const x of [-.07,.07])part(box,dark,x,.1,0,.06,.2,.07);
   for(const x of [-.16,.16])part(box,uniform,x,(.34+y)*low,0,.07,.27,.08);
   if(kind==='flag'){part(cylinder,wood,-.3,.75,0,.035,1.5,.035);part(box,gold,.05,1.19,0,.69,.57,.035);part(box,uniform,.05,1.19,.025,.55,.43,.02);part(cone,gold,-.3,1.55,0,.09,.15,.09);}
   if(kind==='engineer'){part(box,amber,0,.37,.08,.27,.19,.06);part(box,wood,0,.35,-.18,.3,.3,.18);part(cylinder,olive,0,.55,-.18,.33,.12,.12).rotation.z=Math.PI/2;part(box,wood,.2,.35,.05,.06,.57,.06);part(box,silver,.2,.67,.05,.32,.06,.07);part(box,silver,-.21,.19,.08,.19,.2,.05);}
   if(kind==='spy'){part(cone,dark,0,.33,-.08,.23,.55,.25);part(box,silver,.16,.23,.12,.025,.18,.04).rotation.z=.4;b.rotation.x=-.12;}
   if(style.rank&&commander){b.scale.y=officerLook(style.rank).height;const shapes={box,cylinder,cone},colors={gold,silver,pale,uniform,dark};addOfficerRegalia(style.rank,(shape,color,x,y,z,sx,sy,sz,rz=0)=>{part(shapes[shape],colors[color],x,y,z,sx,sy,sz).rotation.z=rz;});}
  };
  model(type,0,0,true);
  const followers=['aircraft','tank','mine','spy'].includes(type)?0:qualityProfile(state.quality??'standard').followers;
  for(let i=0;i<followers;i++)model(type==='cavalry'?'cavalry':type==='engineer'?'engineer':'soldier',(i%2===0?-.24:.24),-.28-Math.floor(i/2)*.22,false);
  const plaque=sign(piece.unknown?'不明駒':PIECES[piece.type].label,0,Math.max(1.45,1.26*officerLook(style.rank).height),0,.76,g);plaque.rotation.y=-g.rotation.y;
  if(!piece.unknown&&style.rank>=4)plaque.material=text(PIECES[piece.type].label,style.rank>=7?'general':'colonel');
  return g;
 }
 /** Static squads share geometry/material draw calls. Moving actors remain separate groups. */
 const batches:THREE.InstancedMesh[]=[];
 function batchStatic(groups:readonly THREE.Group[]){
  const collected=new Map<THREE.BufferGeometry,Map<THREE.Material,THREE.Mesh[]>>();scene.updateMatrixWorld(true);
  for(const group of groups)group.traverse(o=>{if(!(o instanceof THREE.Mesh)||Array.isArray(o.material)||!(o.material instanceof THREE.MeshLambertMaterial))return;let byMaterial=collected.get(o.geometry);if(!byMaterial){byMaterial=new Map();collected.set(o.geometry,byMaterial);}const list=byMaterial.get(o.material)??[];list.push(o);byMaterial.set(o.material,list);});
  for(const [geometry,byMaterial] of collected)for(const [material,meshes] of byMaterial){const batch=new THREE.InstancedMesh(geometry,material,meshes.length);meshes.forEach((o,i)=>{batch.setMatrixAt(i,o.matrixWorld);o.removeFromParent();});batch.instanceMatrix.needsUpdate=true;batch.computeBoundingSphere();units.add(batch);batches.push(batch);}
 }
 function update(next:BattlefieldViewState){
  if(disposed)return;if(next.phase!=='replay'||!next.finished||!next.result||!next.cinematic||next.pieces.some(p=>p.unknown))throw new Error('未終局の映画は禁止されています');
  const previous=state;state=next;
  if(next.moveCount===previous.moveCount&&next.quality===previous.quality&&next.pieces===previous.pieces){
   if(previous.cinematic?.playing&&!next.cinematic.playing&&animation)paused=performance.now();
   else if(!previous.cinematic?.playing&&next.cinematic.playing&&paused!==null){started+=performance.now()-paused;paused=null;requestDraw();}
   return;
  }
  animation=undefined;paused=null;effects.clear();batches.forEach(b=>b.dispose());batches.length=0;units.clear();routes.clear();labels.length=2;delete canvas.dataset.battleEffect;delete canvas.dataset.battlePhase;
  const last=next.lastMove,sequential=next.moveCount===previous.moveCount+1&&last&&!reduced.matches,mover=sequential?previous.pieces.find(p=>p.position===last.from):undefined,defender=sequential?previous.pieces.find(p=>p.position===last.to):undefined;
  const outcome=next.battleOutcome,battle=!!sequential&&next.battleSite===last?.to&&!!outcome;
  const staticGroups:THREE.Group[]=[];
  for(const p of next.pieces){if(mover&&p.position===last!.to)continue;staticGroups.push(unit(p,units));}
  batchStatic(staticGroups);
  canvas.dataset.unitCount=String(next.pieces.length);canvas.dataset.followers=String(qualityProfile(next.quality??'standard').followers);
  if(last){const a=sitePoint(last.from),b=sitePoint(last.to),direction=new THREE.Vector3(b.x-a.x,0,b.z-a.z),arrow=new THREE.ArrowHelper(direction.clone().normalize(),new THREE.Vector3(a.x,.18,a.z),direction.length(),0xffd479,.25,.14);geometries.add((arrow.line as THREE.Line).geometry);geometries.add(arrow.cone.geometry);[arrow.line.material,arrow.cone.material].flat().forEach(m=>materials.add(m));routes.add(arrow);sign('発',a.x,.2,a.z,.3,routes);sign('着',b.x,.2,b.z,.3,routes);canvas.dataset.lastMove=`${last.from}/${last.to}`;}else delete canvas.dataset.lastMove;
  if(performance.now()>manualUntil){cameraShot(!sequential&&next.cinematic.ending);canvas.dataset.cameraDirector='focus';}else canvas.dataset.cameraDirector='manual';
  if(sequential&&mover&&last){
   const attacker=unit(mover,units),defending=defender?unit(defender,units):undefined,a=sitePoint(last.from),b=sitePoint(last.to),timing=cinemaTiming(next.cinematic.speed,battle,next.cinematic.shot==='decisive'),duration=timing.march+timing.clash+timing.exit;
   const dust=battle?Array.from({length:qualityProfile(next.quality??'standard').particles},()=>mesh(smokeGeo,dustMaterial,b.x,.25,b.z,1,1,1,effects)):[];
   if(battle){canvas.dataset.battleEffect=outcome;canvas.dataset.battlePhase='approach';}
   started=performance.now();
   animation=now=>{
    const elapsed=Math.max(0,now-started),travel=Math.min(1,elapsed/timing.march),kind=mover.unknown?'soldier':mover.type;
    const t=kind==='cavalry'?1-Math.pow(1-travel,2):kind==='engineer'?travel:travel*travel*(3-2*travel);
    const bob=kind==='aircraft'?Math.sin(t*Math.PI)*1.8:kind==='tank'||kind==='spy'?0:Math.sin(travel*Math.PI*12)*(kind==='cavalry'?.07:kind==='engineer'?.04:.02)*(1-travel);
    attacker.position.set(a.x+(b.x-a.x)*t,bob,a.z+(b.z-a.z)*t);
    if(defending&&elapsed<timing.march)defending.rotation.z=Math.sin(travel*Math.PI)*.04;
    const clash=Math.max(0,Math.min(1,(elapsed-timing.march)/Math.max(1,timing.clash))),exit=Math.max(0,Math.min(1,(elapsed-timing.march-timing.clash)/Math.max(1,timing.exit)));
    if(battle){canvas.dataset.battlePhase=elapsed<timing.march?'approach':elapsed<timing.march+timing.clash?'contact':'retreat';
     dustMaterial.opacity=clash>0?(1-exit)*.45:0;dust.forEach((o,i)=>{const angle=i/dust.length*Math.PI*2;o.position.set(b.x+Math.cos(angle)*clash*.55,.15+Math.sin(clash*Math.PI)*.45,b.z+Math.sin(angle)*clash*.55);o.scale.setScalar(.5+clash*1.4);});
     if(clash>0&&clash<1){attacker.rotation.z=Math.sin(clash*Math.PI*6)*.07;if(defending)defending.rotation.z=-attacker.rotation.z;}
     if(outcome==='DEFENDER'||outcome==='MUTUAL'){attacker.scale.setScalar(1-exit);attacker.position.y-=exit*.25;}
     if(defending&&(outcome==='ATTACKER'||outcome==='MUTUAL')){defending.scale.setScalar(1-exit);defending.position.y=-exit*.25;}
    }
    if(performance.now()>manualUntil&&next.cinematic?.shot==='march'){target.set(attacker.position.x*.65,.35,attacker.position.z*.65);camera.lookAt(target);}
    if(elapsed>=duration){effects.clear();delete canvas.dataset.battleEffect;delete canvas.dataset.battlePhase;if(outcome==='DEFENDER'||outcome==='MUTUAL')attacker.visible=false;if(defending&&(outcome==='ATTACKER'||outcome==='MUTUAL'))defending.visible=false;if(next.cinematic?.ending)cameraShot(true);return false;}return true;
   };
   animation(started);
  }
  if(next.quality!==previous.quality)lastSize='';resize();requestDraw();
 }
 function lost(e:Event){e.preventDefault();onFailure();}
 function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);observer.disconnect();visibility.disconnect();document.removeEventListener('visibilitychange',visible);canvas.removeEventListener('webglcontextlost',lost);batches.forEach(b=>b.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());scene.clear();backend.dispose();canvas.remove();}
 try{
  host.append(canvas);canvas.addEventListener('webglcontextlost',lost);observer.observe(host);visibility.observe(canvas);document.addEventListener('visibilitychange',visible);resize();
  // Force the first frame population, preserving a genuine public predecessor only on later updates.
  const first={...initial,moveCount:-1};state=first;update(initial);
  return {backend:backend.kind,update,reset:()=>setCamera('full'),setCamera,dispose,capture:async()=>{if(disposed)throw new Error('戦場は閉じられています');if(backend.kind==='webgpu'&&engine.renderAsync)await engine.renderAsync(scene,camera);else draw();const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;const context=copy.getContext('2d');if(!context)throw new Error('画像作成に失敗しました');context.drawImage(canvas,0,0);return copy;}};
 }catch(error){dispose();throw error;}
}
