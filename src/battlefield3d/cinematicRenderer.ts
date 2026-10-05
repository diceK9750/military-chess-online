import * as THREE from 'three';
import {createBackend} from './backend';
import {sitePoint} from './state';
import type {BattlefieldViewState,BattlefieldPiece,BattlefieldHandlers,CameraPreset} from './state';
import type {BattlefieldRenderer} from './renderer';
import {qualityProfile} from './settings';
import {PIECES} from '../game/pieces';
import {identity} from './identity';
import {addOfficerRegalia,officerLook} from './regalia';
import {cinemaPose,cinemaManualPose,cinemaRetime,cinemaRoute,cinemaRoutePoint,type CinemaPose} from './cinemaDirector';

import {cinemaTiming} from './cinemaPresentation';
/** Dedicated terrain and squads. Receives only a finished-source, allowlisted display adapter. */
export async function createBattlefield(host:HTMLElement,initial:BattlefieldViewState,onFailure:()=>void,handlers:BattlefieldHandlers,forceWebGL=false):Promise<BattlefieldRenderer>{
 if(initial.phase!=='replay'||!initial.finished||!initial.result||!initial.cinematic||initial.pieces.some(p=>p.unknown))throw new Error('終局後の正式戦史のみ再現できます');
 const backend=await createBackend(onFailure,forceWebGL),canvas=backend.canvas,engine=backend.engine;
 canvas.dataset.backend=backend.kind;canvas.dataset.mode='cinematic';canvas.setAttribute('aria-label','操作可能な三次元戦場');canvas.setAttribute('role','img');
 const scene=new THREE.Scene();scene.background=new THREE.Color('#263d43');scene.fog=new THREE.Fog('#263d43',32,100);
 const camera=new THREE.PerspectiveCamera(42,1,.1,150),target=new THREE.Vector3(0,.3,0);
 const terrain=new THREE.Group(),units=new THREE.Group(),effects=new THREE.Group(),routes=new THREE.Group();scene.add(terrain,units,effects,routes);
 scene.add(new THREE.HemisphereLight('#fff1d0','#385a49',2.7));const sun=new THREE.DirectionalLight('#ffe9be',2.5);sun.position.set(-5,12,7);scene.add(sun);
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
 const geo=<T extends THREE.BufferGeometry>(g:T)=>{geometries.add(g);return g;};
 const mat=(c:string)=>{const m=new THREE.MeshLambertMaterial({color:c,flatShading:true});materials.add(m);return m;};
 const box=geo(new THREE.BoxGeometry(1,1,1)),cylinder=geo(new THREE.CylinderGeometry(.5,.5,1,6)),cone=geo(new THREE.ConeGeometry(.5,1,6)),head=geo(new THREE.IcosahedronGeometry(.5,0)),plane=geo(new THREE.PlaneGeometry(1,1));
 const soil=mat('#887552'),grass=mat('#73845c'),road=mat('#b49a70'),wood=mat('#604731'),river=mat('#537f87'),blue=mat('#477aa0'),red=mat('#9b4d43'),skin=mat('#d4c4a4'),dark=mat('#263232'),gold=mat('#e4c060'),silver=mat('#cbd9d8'),pale=mat('#9bcdd4'),amber=mat('#e4b352'),olive=mat('#626e48');
 function mesh(g:THREE.BufferGeometry,m:THREE.Material,x:number,y:number,z:number,sx:number,sy:number,sz:number,parent:THREE.Object3D){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);parent.add(o);return o;}
 const textCache=new Map<string,THREE.MeshBasicMaterial>(),labels:THREE.Object3D[]=[];
 function text(value:string,tone='plain'){const key=tone+value;if(textCache.has(key))return textCache.get(key)!;const c=document.createElement('canvas');c.width=Math.max(144,value.length*56+32);c.height=96;const x=c.getContext('2d')!;x.fillStyle=tone==='general'?'#e4c060':tone==='colonel'?'#cbd9d8':'#162e34e8';x.fillRect(0,0,c.width,96);x.fillStyle=tone==='plain'?'#fff1c7':'#192f33';x.font='bold 56px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(value,c.width/2,50,c.width-20);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;textures.add(t);const m=new THREE.MeshBasicMaterial({map:t,transparent:true,depthTest:false,depthWrite:false});materials.add(m);textCache.set(key,m);return m;}
 function sign(value:string,x:number,y:number,z:number,width:number,parent:THREE.Object3D){const label=text(value),o=mesh(plane,label,x,y,z,width,width*96/(label.map!.image as HTMLCanvasElement).width,1,parent);o.renderOrder=10;labels.push(o);return o;}
 mesh(box,soil,0,-.3,0,12,.5,13,terrain);mesh(box,grass,0,-.08,0,7,.12,9,terrain);
 // No chess grid or piece bases: an abstract encampment with two actual crossing roads.
 mesh(box,river,0,.015,0,10,.055,.35,terrain);
 for(const x of [-1.5,1.5]){mesh(box,road,x,.01,0,.65,.045,8.6,terrain);mesh(box,wood,x,.08,0,.8,.1,.62,terrain);for(const dx of [-.4,.4])mesh(box,wood,x+dx,.19,0,.04,.2,.62,terrain);}
 for(const owner of [1,2] as const){const z=owner===1?4.1:-4.1,m=owner===1?blue:red;mesh(box,m,0,.55,z,2.1,1,.05,terrain);for(const x of [-1.1,1.1])mesh(cylinder,wood,x,.72,z,.045,1.5,.045,terrain);mesh(cone,m,0,.75,z+ (owner===1?.3:-.3),1.8,1.15,1.1,terrain);sign(owner===1?'自軍本陣':'敵軍本陣',0,1.65,z,1.8,terrain);}
 for(const x of [-5,5])for(let i=0;i<6;i++){const z=-5+i*2;mesh(cone,grass,x,.5,z,2,1.4+i%2,2.5,terrain);mesh(cylinder,wood,x*.7,.3,z,.09,.6,.09,terrain);mesh(cone,grass,x*.7,.9,z,.7,1.1,.7,terrain);}
 const dustMaterial=new THREE.MeshBasicMaterial({color:'#deceb1',transparent:true,opacity:.55,depthWrite:false});materials.add(dustMaterial);
 const smokeGeo=geo(new THREE.IcosahedronGeometry(.18,0)),routeRing=geo(new THREE.RingGeometry(.29,.34,24));
 const routeMaterial=new THREE.MeshBasicMaterial({color:'#ffdc8c',depthWrite:false});materials.add(routeMaterial);
 let state=initial,disposed=false,raf=0,lastSize='',frameNumber=0,animation:((now:number)=>boolean)|undefined,started=0,paused:number|null=null,preset:CameraPreset='full',reportedPreset:CameraPreset='full',manualUntil=-Infinity,manualCamera=false,populated=false;
 let activeTiming:ReturnType<typeof cinemaTiming>|undefined,actionPose:CinemaPose,overviewPose:CinemaPose,shotStart:CinemaPose,shotProgress=1,settled=true;
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 const observer=new ResizeObserver(resize);
 // An idle WebGL canvas may be discarded while off-screen. Repaint on return,
 // without turning the event-driven renderer into a permanent animation loop.
 const visibility=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))requestDraw();});
 function visible(){if(document.visibilityState==='visible')requestDraw();}
 function reportCamera(value:CameraPreset){canvas.dataset.cameraPreset=value;if(value!==reportedPreset){reportedPreset=value;handlers.onCameraChange?.(value);}}
 function applyPose(pose:CinemaPose){if(!manualCamera)reportCamera(pose.framing==='overview'?'full':'last');camera.position.set(...pose.position);target.set(...pose.target);camera.lookAt(target);canvas.dataset.shot=pose.shot;canvas.dataset.framing=pose.framing;canvas.dataset.cameraPose=camera.position.toArray().join('/')+'/'+target.toArray().join('/');}
 function currentPose():CinemaPose{return {position:camera.position.toArray(),target:target.toArray(),shot:state.cinematic?.shot??'opening',framing:'action'};}
 function refreshShots(){actionPose=cinemaPose(state,camera.aspect);overviewPose=cinemaPose(state,camera.aspect,true);}
 function blendPose(from:CinemaPose,to:CinemaPose,progress:number){reportCamera(to.framing==='overview'?'full':'last');const t=Math.max(0,Math.min(1,progress)),ease=t*t*(3-2*t);camera.position.set(...from.position).lerp(new THREE.Vector3(...to.position),ease);target.set(...from.target).lerp(new THREE.Vector3(...to.target),ease);camera.lookAt(target);canvas.dataset.shot=to.shot;canvas.dataset.framing=to.framing;canvas.dataset.cameraPose=camera.position.toArray().join('/')+'/'+target.toArray().join('/');}
 function cameraShot(overview=false){applyPose(overview?overviewPose:actionPose);}
 function setCamera(value:CameraPreset){preset=value;manualUntil=performance.now()+3000;manualCamera=true;applyPose(cinemaManualPose(state,camera.aspect,preset));canvas.dataset.cameraDirector='manual';reportCamera(preset);requestDraw();}
 function resize(){if(disposed)return;const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight),ratio=Math.min(window.devicePixelRatio||1,qualityProfile(state.quality??'standard').pixelRatio),key=`${w}/${h}/${ratio}`;if(key===lastSize)return;lastSize=key;engine.setPixelRatio(ratio);engine.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();canvas.dataset.quality=state.quality??'standard';canvas.dataset.pixelRatio=String(ratio);refreshShots();if(manualCamera)applyPose(cinemaManualPose(state,camera.aspect,preset));else{shotStart=overviewPose;cameraShot(settled||shotProgress>=1);}requestDraw();}
 function draw(){const orientation=new THREE.Quaternion();labels.forEach(o=>{if(o.parent)o.parent.getWorldQuaternion(orientation);else orientation.identity();o.quaternion.copy(orientation.invert().multiply(camera.quaternion));});engine.render(scene,camera);canvas.dataset.frame=String(++frameNumber);const info=(engine as unknown as {info?:{render?:{calls?:number;triangles?:number;drawCalls?:number}}}).info?.render;if(info){canvas.dataset.drawCalls=String(info.calls??info.drawCalls??0);canvas.dataset.triangles=String(info.triangles??0);}}
 function requestDraw(){if(disposed||raf)return;raf=requestAnimationFrame(now=>{raf=0;if(disposed)return;try{const active=paused===null&&!!animation?.(now);draw();if(active)requestDraw();else if(paused===null)animation=undefined;}catch{onFailure();}});}
 function unit(piece:BattlefieldPiece,parent:THREE.Object3D):THREE.Group{
  const g=new THREE.Group(),p=sitePoint(piece.position);g.position.set(p.x,0,p.z);g.rotation.y=piece.owner===1?0:Math.PI;g.name='historical-squad';g.userData.piece=piece;parent.add(g);
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
  const plaque=sign(piece.unknown?'不明駒':PIECES[piece.type].label,0,Math.max(1.45,1.26*officerLook(style.rank).height),0,piece.unknown?.76:Math.min(.98,.45+PIECES[piece.type].label.length*.13),g);plaque.rotation.y=-g.rotation.y;
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
 function clearUnits(){batches.forEach(b=>b.dispose());batches.length=0;for(let i=labels.length-1;i>=2;i--){let parent:THREE.Object3D|null=labels[i];while(parent&&parent!==units)parent=parent.parent;if(parent===units)labels.splice(i,1);}units.clear();}
 function populateUnits(pieces:readonly BattlefieldPiece[]){clearUnits();const groups=pieces.map(p=>unit(p,units));batchStatic(groups);canvas.dataset.renderedSquads=String(groups.length);}
 function update(next:BattlefieldViewState){
  if(disposed)return;if(next.phase!=='replay'||!next.finished||!next.result||!next.cinematic||next.pieces.some(p=>p.unknown))throw new Error('未終局の映画は禁止されています');
  const previous=state,hadFrame=populated;state=next;
  if(hadFrame&&next.moveCount===previous.moveCount&&next.quality===previous.quality&&next.pieces===previous.pieces){
   const now=performance.now();
   if(animation&&activeTiming&&next.cinematic.speed!==previous.cinematic?.speed){const reference=paused??now,updated=cinemaTiming(next.cinematic.speed,!!next.battleOutcome,next.cinematic.shot==='decisive');started=reference-cinemaRetime(reference-started,activeTiming,updated);activeTiming=updated;}
   if(previous.cinematic?.playing&&!next.cinematic.playing&&animation)paused=now;
   else if(!previous.cinematic?.playing&&next.cinematic.playing&&paused!==null){started+=now-paused;paused=null;requestDraw();}
   return;
  }
  populated=true;animation=undefined;activeTiming=undefined;paused=null;settled=true;shotProgress=1;effects.clear();clearUnits();routes.clear();labels.length=2;delete canvas.dataset.battleEffect;delete canvas.dataset.battlePhase;
  const last=next.lastMove,sequential=hadFrame&&next.moveCount===previous.moveCount+1&&last&&!reduced.matches,mover=sequential?previous.pieces.find(p=>p.position===last.from):undefined,defender=sequential?previous.pieces.find(p=>p.position===last.to):undefined;
  const outcome=next.battleOutcome,battle=!!sequential&&next.battleSite===last?.to&&!!outcome;
  const staticGroups:THREE.Group[]=[];
  for(const p of next.pieces){if(mover&&p.position===last!.to)continue;staticGroups.push(unit(p,units));}
  batchStatic(staticGroups);
  canvas.dataset.unitCount=String(next.pieces.length);canvas.dataset.renderedSquads=String(staticGroups.length);canvas.dataset.followers=String(qualityProfile(next.quality??'standard').followers);
  if(last){const path=cinemaRoute(last),a=path[0],b=path[path.length-1];for(let i=1;i<path.length;i++){const from=path[i-1],to=path[i],dx=to.x-from.x,dz=to.z-from.z;const line=mesh(box,routeMaterial,(from.x+to.x)/2,.12,(from.z+to.z)/2,.055,.025,Math.hypot(dx,dz),routes);line.rotation.y=Math.atan2(dx,dz);}
   const prior=path[path.length-2],direction=new THREE.Vector3(b.x-prior.x,0,b.z-prior.z).normalize(),tip=mesh(cone,routeMaterial,b.x,.14,b.z,.24,.3,.1,routes);tip.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);
   for(const p of [a,b])mesh(routeRing,routeMaterial,p.x,.12,p.z,1,1,1,routes).rotation.x=-Math.PI/2;
   sign('発',a.x,.24,a.z,.35,routes);sign('着',b.x,.24,b.z,.35,routes);canvas.dataset.lastMove=`${last.from}/${last.to}`;
  }else delete canvas.dataset.lastMove;
  // A manual view survives resize/quality/pause. Only a new recorded move can resume direction.
  if(hadFrame&&next.moveCount!==previous.moveCount&&performance.now()>manualUntil)manualCamera=false;
  refreshShots();shotStart=currentPose();canvas.dataset.cameraDirector=manualCamera?'manual':'focus';
  if(manualCamera)applyPose(cinemaManualPose(next,camera.aspect,preset));else if(!sequential||!mover)cameraShot(!!next.cinematic.ending||reduced.matches);else if(next.cinematic.shot==='march')cameraShot();
  if(sequential&&mover&&last){
   const attacker=unit(mover,units),defending=defender?unit(defender,units):undefined,path=cinemaRoute(last),a=path[0],b=path[path.length-1],direction=new THREE.Vector3(b.x-a.x,0,b.z-a.z).normalize();
   activeTiming=cinemaTiming(next.cinematic.speed,battle,next.cinematic.shot==='decisive');settled=false;shotProgress=0;
   attacker.rotation.y=Math.atan2(direction.x,direction.z);if(defending)defending.rotation.y=attacker.rotation.y+Math.PI;
   canvas.dataset.renderedSquads=String(staticGroups.length+1+(defending?1:0));
   const dust=battle?Array.from({length:qualityProfile(next.quality??'standard').particles},()=>mesh(smokeGeo,dustMaterial,b.x,.25,b.z,1,1,1,effects)):[];
   if(battle){canvas.dataset.battleEffect=outcome;canvas.dataset.battlePhase='approach';}
   started=performance.now();
   animation=now=>{
    const timing=activeTiming!,duration=timing.march+timing.clash+timing.exit,elapsed=Math.max(0,now-started),travel=Math.min(1,elapsed/timing.march),kind=mover.unknown?'soldier':mover.type;
    const t=kind==='cavalry'?1-Math.pow(1-travel,2):kind==='engineer'?travel:travel*travel*(3-2*travel),point=cinemaRoutePoint(path,t);
    const bob=kind==='aircraft'?Math.sin(t*Math.PI)*1.1:kind==='tank'||kind==='spy'?0:Math.sin(travel*Math.PI*12)*(kind==='cavalry'?.07:kind==='engineer'?.04:.02)*(1-travel);
    attacker.position.set(point.x,bob,point.z);
    const clash=Math.max(0,Math.min(1,(elapsed-timing.march)/Math.max(1,timing.clash))),exit=Math.max(0,Math.min(1,(elapsed-timing.march-timing.clash)/Math.max(1,timing.exit)));
    if(battle){canvas.dataset.battlePhase=elapsed<timing.march?'approach':elapsed<timing.march+timing.clash?'contact':'resolution';
     // Keep both forces readable at contact; only formal removals disappear.
     attacker.position.addScaledVector(direction,-.3*travel*(1-exit));if(defending)defending.position.set(b.x+direction.x*.22*travel*(1-exit),0,b.z+direction.z*.22*travel*(1-exit));
     dustMaterial.opacity=clash>0?(1-exit)*.35:0;dust.forEach((o,i)=>{const angle=i/dust.length*Math.PI*2;o.position.set(b.x+Math.cos(angle)*clash*.5,.15+Math.sin(clash*Math.PI)*.35,b.z+Math.sin(angle)*clash*.5);o.scale.setScalar(.5+clash*1.1);});
     attacker.rotation.z=clash>0&&clash<1?Math.sin(clash*Math.PI*6)*.055:0;if(defending)defending.rotation.z=-attacker.rotation.z;
     if(outcome==='DEFENDER'||outcome==='MUTUAL'){attacker.scale.setScalar(1-exit);attacker.position.y-=exit*.25;}
     if(defending&&(outcome==='ATTACKER'||outcome==='MUTUAL')){defending.scale.setScalar(1-exit);defending.position.y=-exit*.25;}
    }
    shotProgress=exit;
    if(!manualCamera){if(exit>0)blendPose(actionPose,overviewPose,exit);else if(next.cinematic?.shot!=='march')blendPose(shotStart,actionPose,Math.min(1,travel/.7));}
    if(elapsed>=duration){effects.clear();delete canvas.dataset.battleEffect;delete canvas.dataset.battlePhase;populateUnits(next.pieces);settled=true;if(!manualCamera)cameraShot(true);return false;}return true;
   };
   animation(started);
  }
  if(next.quality!==previous.quality)lastSize='';resize();requestDraw();
 }
 function motionChanged(){if(reduced.matches&&animation){animation=undefined;activeTiming=undefined;paused=null;effects.clear();delete canvas.dataset.battleEffect;delete canvas.dataset.battlePhase;populateUnits(state.pieces);settled=true;if(!manualCamera)cameraShot(true);requestDraw();}}
 function lost(e:Event){e.preventDefault();onFailure();}
 function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);observer.disconnect();visibility.disconnect();document.removeEventListener('visibilitychange',visible);canvas.removeEventListener('webglcontextlost',lost);reduced.removeEventListener('change',motionChanged);batches.forEach(b=>b.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());scene.clear();backend.dispose();canvas.remove();}
 try{
  host.append(canvas);canvas.addEventListener('webglcontextlost',lost);observer.observe(host);visibility.observe(canvas);document.addEventListener('visibilitychange',visible);reduced.addEventListener('change',motionChanged);resize();
  // The first frame is the exact historical snapshot, never an invented predecessor.
  update(initial);
  return {backend:backend.kind,update,reset:()=>setCamera('full'),setCamera,dispose,capture:async()=>{if(disposed)throw new Error('戦場は閉じられています');if(backend.kind==='webgpu'&&engine.renderAsync)await engine.renderAsync(scene,camera);else draw();const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;const context=copy.getContext('2d');if(!context)throw new Error('画像作成に失敗しました');context.drawImage(canvas,0,0);return copy;}};
 }catch(error){dispose();throw error;}
}
