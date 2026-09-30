import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SITES } from '../game/board';
import { PIECES } from '../game/pieces';
import { BRIDGES, sitePoint } from './state';
import type { BattlefieldHandlers, BattlefieldViewState, CameraPreset } from './state';
import type { Site } from '../game/types';
import { TapGesture } from './gesture';
import { createBackend } from './backend';
import { identity } from './identity';
import { allowBattleCamera, motionProfile } from './presentation';

export interface BattlefieldRenderer {
  readonly backend: 'webgpu' | 'webgl2';
  update(state: BattlefieldViewState): void;
  reset(): void;
  setCamera(preset: CameraPreset): void;
  dispose(): void;
}

/** Render-only adapter: no GameState, IDs, legal moves, CPU, or persistence. */
export async function createBattlefield(host: HTMLElement, initial: BattlefieldViewState, onFailure: () => void, handlers: BattlefieldHandlers, forceWebGL = false): Promise<BattlefieldRenderer> {
  const backend = await createBackend(onFailure, forceWebGL);
  const { canvas, engine: renderer } = backend;
  canvas.dataset.backend = backend.kind;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#24383d');
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = false; // Event-driven frames, no idle animation loop.
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI / 2.6;
  controls.minDistance = 7;
  controls.maxDistance = 34;
  controls.rotateSpeed = 0.7;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const billboards: THREE.Object3D[] = [];
  const labelPosition=new THREE.Vector3();
  let busy = false;
  function animationStatus(active: boolean) { if (busy !== active) { busy = active; handlers.onAnimationChange?.(active); } }
  const labelCache = new Map<string, THREE.MeshBasicMaterial>();
  const units = new THREE.Group();
  const overlays = new THREE.Group();
  const pickables: THREE.Object3D[] = [];
  const raycaster = new THREE.Raycaster();
  const gesture = new TapGesture();
  let animateFrame: ((now: number) => boolean) | undefined;
  let effectsFrame: ((now:number)=>boolean)|undefined;
  let restoreFocus: (() => void) | undefined;
  let lastManual=-Infinity;
  let dragStart:{id:number;x:number;y:number}|null=null;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let state = initial;
  let disposed = false;
  let frame = 0;
  let resizeFrame = 0;
  let lastSize = '';
  let observer: ResizeObserver | undefined;
  let cameraPreset: CameraPreset = 'full';
  function geometry<T extends THREE.BufferGeometry>(value: T): T { geometries.add(value); return value; }
  function material(color: string) {
    const value = new THREE.MeshLambertMaterial({ color, flatShading: true }); materials.add(value); return value;
  }
  function mesh(shape: THREE.BufferGeometry, surface: THREE.Material, x: number, y: number, z: number, group: THREE.Object3D = scene) {
    const object = new THREE.Mesh(shape, surface); object.position.set(x, y, z); group.add(object); return object;
  }
  function label(text: string, ink: string, background: string, wide = false) {
    const key = `${text}/${ink}/${background}/${wide}`;
    const cached = labelCache.get(key); if (cached) return cached;
    const bitmap = document.createElement('canvas'); bitmap.width = 256; bitmap.height = wide ? 96 : 256;
    const ctx = bitmap.getContext('2d'); if (!ctx) throw new Error('Canvas2D unavailable');
    ctx.fillStyle = background; ctx.fillRect(0, 0, 256, bitmap.height);
    ctx.strokeStyle = ink; ctx.lineWidth = 4; ctx.strokeRect(4, 4, 248, bitmap.height - 8);
    ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      ctx.font = `700 ${lines.length === 1 ? (wide ? 72 : 68) : index === 0 ? 78 : 50}px "Yu Gothic", "Meiryo", sans-serif`;
      ctx.fillText(line, 128, wide ? 50 : lines.length === 1 ? 132 : index === 0 ? 85 : 182, 225);
    });
    const texture = new THREE.CanvasTexture(bitmap); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
    const surface = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }); materials.add(surface); labelCache.set(key, surface); return surface;
  }
  function requestDraw() {
    if (disposed || frame) return;
    frame = requestAnimationFrame(now => {
      frame = 0;
      if (disposed) return;
      try {
        const moving = animateFrame?.(now) ?? false;
        const effects = effectsFrame?.(now) ?? false;
        const active = moving || effects;
        billboards.forEach(label => {label.quaternion.copy(camera.quaternion);label.getWorldPosition(labelPosition);label.scale.setScalar(Math.min(1.12,Math.max(.85,labelPosition.distanceTo(camera.position)/15)));});
        renderer.render(scene, camera);
        if (!moving) { animateFrame=undefined; animationStatus(false); }
        if (!effects) effectsFrame=undefined;
        if (active) requestDraw();
      } catch { onFailure(); }
    });
  }
  function setCamera(preset: CameraPreset, manual=false) {
    if(manual)lastManual=performance.now();
    cameraPreset = preset;
    const distance = Math.min(30, Math.max(13, 11 / camera.aspect));
    const side = state.viewer === 1 ? 1 : -1;
    if (preset === 'top') {
      controls.target.set(0, 0, 0);
      camera.position.set(0, Math.min(34, Math.max(13, 10 / camera.aspect)), side * .001);
    } else if (preset === 'front' || preset === 'selected') {
      const point = preset === 'selected' && state.interaction.selectedSite ? sitePoint(state.interaction.selectedSite) : { x: 0, z: side * 2 };
      const near = Math.min(24, Math.max(7, 7 / camera.aspect));
      controls.target.set(point.x, .3, point.z);
      camera.position.set(point.x, near * .78, point.z + side * near * .7);
    } else {
      controls.target.set(0, 0, 0);
      camera.position.set(0, distance * .78, side * distance * .7);
    }
    controls.update(); requestDraw();
  }
  function reset() { setCamera('full',true); }
  function resize() {
    if (disposed) return;
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, width < 600 ? 1.25 : 1.5);
    const size = `${width}/${height}/${ratio}`;
    if (size === lastSize) return;
    lastSize = size;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); setCamera(cameraPreset);
  }
  function lost(event: Event) { event.preventDefault(); onFailure(); }
  function down(event: PointerEvent) { if (event.button === 0) {if(dragStart)lastManual=performance.now();else dragStart={id:event.pointerId,x:event.clientX,y:event.clientY};gesture.down(event.pointerId, event.clientX, event.clientY);} }
  function movePointer(event: PointerEvent) { if(dragStart&&Math.hypot(event.clientX-dragStart.x,event.clientY-dragStart.y)>6)lastManual=performance.now();gesture.move(event.pointerId, event.clientX, event.clientY); }
  function wheel(){lastManual=performance.now();}
  function cancelPointer(event: PointerEvent) { gesture.cancel(event.pointerId); }
  function up(event: PointerEvent) {
    dragStart=null;
    if (!gesture.up(event.pointerId, event.clientX, event.clientY) || !state.interaction.interactionEnabled || animateFrame) return;
    const bounds = canvas.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return;
    raycaster.setFromCamera(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1), camera);
    const hit = raycaster.intersectObjects([...units.children, ...overlays.children, ...pickables], true).find(value => value.object.userData.site || value.object.userData.lane);
    if (!hit) return;
    if (hit.object.userData.lane) handlers.onLaneSelect(hit.object.userData.lane as 'C' | 'D');
    else handlers.onSiteSelect(hit.object.userData.site as Site);
  }
  function dispose() {
    if (disposed) return; disposed = true;
    cancelAnimationFrame(frame); cancelAnimationFrame(resizeFrame); observer?.disconnect();
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', movePointer);
    canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', cancelPointer);
    canvas.removeEventListener('wheel',wheel);
    controls.removeEventListener('change', requestDraw); controls.dispose();
    geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
    scene.clear(); labelCache.clear(); backend.dispose(); canvas.remove();
  }
  try {
    scene.add(new THREE.HemisphereLight('#fff8df', '#45574e', 2.4));
    const sun = new THREE.DirectionalLight('#fff0c9', 2.2); sun.position.set(-5, 10, 7); scene.add(sun);
    const soil = material('#594535'), grass = material('#b5b08a'), alternate = material('#aaa77e');
    const wood = material('#aa8a59'), river = material('#658d92');
    const blue = material('#375f78'), red = material('#86534b');
    const tile = geometry(new THREE.BoxGeometry(0.96, 0.06, 0.96));
    const wideTile = geometry(new THREE.BoxGeometry(1.96, 0.06, 0.96));
    mesh(geometry(new THREE.BoxGeometry(7.3, 0.5, 9.3)), soil, 0, -0.34, 0);
    mesh(geometry(new THREE.BoxGeometry(7.2, 0.1, 9.2)), grass, 0, -0.05, 0);
    const lacquer = material('#423329'), ink = material('#5a5845');
    for (const x of [-3.6, 3.6]) mesh(geometry(new THREE.BoxGeometry(.2, .18, 9.4)), lacquer, x, -.04, 0);
    for (const z of [-4.6, 4.6]) mesh(geometry(new THREE.BoxGeometry(7.4, .18, .2)), lacquer, 0, -.04, z);
    for (let row = 0; row <= 8; row++) mesh(geometry(new THREE.BoxGeometry(6.05, .008, .012)), ink, 0, .078, row - 4);
    for (let col = 0; col <= 6; col++) mesh(geometry(new THREE.BoxGeometry(.012, .008, 8.05)), ink, col - 3, .078, 0);
    // A shallow boundary channel with exactly two crossing bridges.
    mesh(geometry(new THREE.BoxGeometry(7.2, 0.04, 0.28)), river, 0, 0.025, 0);
    for (const site of SITES) {
      const { x, z } = sitePoint(site);
      const ground = mesh(site.startsWith('HQ') ? wideTile : tile, (Math.round(x + z) % 2 === 0) ? grass : alternate, x, 0.04, z);
      ground.userData = { site }; pickables.push(ground);
    }
    const bridge = geometry(new THREE.BoxGeometry(0.65, 0.09, 0.56));
    const rail = geometry(new THREE.BoxGeometry(0.045, 0.1, 0.56));
    for (const crossing of BRIDGES) {
      const { x } = sitePoint(crossing.from);
      mesh(bridge, wood, x, 0.12, 0);
      for (const offset of [-0.31, 0.31]) mesh(rail, wood, x + offset, 0.2, 0);
    }
    const face = geometry(new THREE.PlaneGeometry(0.8, 0.29));
    const body = geometry(new THREE.CylinderGeometry(.13, .19, .27, 6));
    const headShape = geometry(new THREE.IcosahedronGeometry(.13, 0));
    const helmet = geometry(new THREE.CylinderGeometry(.17, .18, .1, 6));
    const limb = geometry(new THREE.BoxGeometry(.09, .19, .1));
    const insignia = geometry(new THREE.BoxGeometry(.09, .055, .045));
    const equipment = geometry(new THREE.BoxGeometry(.34, .08, .12));
    const skin = material('#d9c8a7'), dark = material('#273a40'), brass = material('#d8b85e');
    const shape = new THREE.Shape(); shape.moveTo(-.36, -.36); shape.lineTo(.36, -.36); shape.lineTo(.39, .16); shape.lineTo(0, .49); shape.lineTo(-.39, .16); shape.closePath();
    const badge = geometry(new THREE.ExtrudeGeometry(shape, { depth: .14, bevelEnabled: false })); badge.rotateX(-Math.PI / 2);
    const baseWood = material('#b08b58');
    const baseName = geometry(new THREE.PlaneGeometry(.54, .18));
    const armor = geometry(new THREE.BoxGeometry(.4, .33, .24));
    const tool = geometry(new THREE.BoxGeometry(.05, .38, .05));
    const horse = geometry(new THREE.BoxGeometry(.32, .22, .48));
    const cloak = geometry(new THREE.ConeGeometry(.23, .35, 5));
    const pole = geometry(new THREE.CylinderGeometry(0.025, 0.025, 0.85, 5));
    const curtain = geometry(new THREE.BoxGeometry(1.85, 0.5, 0.04));
    for (const owner of [1, 2] as const) {
      const z = owner === 1 ? 4.1 : -4.1, surface = owner === state.viewer ? blue : red;
      mesh(curtain, surface, 0, 0.38, z);
      for (const x of [-0.94, 0.94]) mesh(pole, wood, x, 0.45, z);
      const sign = mesh(geometry(new THREE.PlaneGeometry(0.8, 0.4)), label(`本陣 P${owner}`, '#ece4cd', owner === state.viewer ? '#375f78' : '#86534b'), 0, 0.48, z + (owner === 1 ? -0.03 : 0.03));
      sign.rotation.y = owner === 1 ? Math.PI : 0;
    }
    // Fixed scenery independent of every piece and its type.
    const trunk = geometry(new THREE.CylinderGeometry(0.035, 0.05, 0.4, 5));
    const foliage = geometry(new THREE.ConeGeometry(0.26, 0.75, 5));
    const leaves = material('#425d4b');
    for (const x of [-3.35, 3.35]) for (const z of [-3.6, -2.1, 2.1, 3.6]) {
      mesh(trunk, wood, x, 0.15, z); mesh(foliage, leaves, x, 0.6, z);
    }
    const marker = geometry(new THREE.PlaneGeometry(0.38, 0.38));
    for (let col = 0; col < 6; col++) {
      const tag = mesh(marker, label('ABCDEF'[col], '#eee5c9', '#786247'), col - 2.5, 0.012, 4.43); tag.rotation.x = -Math.PI / 2;
    }
    for (let row = 1; row <= 8; row++) {
      const tag = mesh(marker, label(String(row), '#eee5c9', '#786247'), -3.25, 0.012, 4.5 - row); tag.rotation.x = -Math.PI / 2;
    }
    const arrowMaterial = material('#e9c977');
    const arrowShaft = geometry(new THREE.CylinderGeometry(0.026, 0.026, 1, 6));
    const arrowHead = geometry(new THREE.ConeGeometry(0.12, 0.28, 6));
    const gold = material('#efd16a'), selectedMaterial = material('#65d6df'), pendingMaterial = material('#ffa656');
    const ring = geometry(new THREE.TorusGeometry(0.44, 0.035, 4, 24));
    const wideRing = geometry(new THREE.TorusGeometry(0.7, 0.035, 4, 24));
    const pathShape = geometry(new THREE.BoxGeometry(0.12, 0.04, 6));
    const scan = new THREE.MeshBasicMaterial({color:'#bce8ef',transparent:true,opacity:.6}); materials.add(scan);
    const fxGroup=new THREE.Group();scene.add(fxGroup);
    const inkFx=new THREE.MeshBasicMaterial({color:'#252521',transparent:true,opacity:.8});materials.add(inkFx);
    const lightFx=new THREE.MeshBasicMaterial({color:'#e9bf64',transparent:true,opacity:.85});materials.add(lightFx);
    const splatter=geometry(new THREE.BoxGeometry(.22,.04,.1));
    const particle=geometry(new THREE.IcosahedronGeometry(.035,0));
    scene.add(units, overlays);
    function update(next: BattlefieldViewState) {
      if (disposed) return;
      const previous = state;
      const transition = next.moveCount === previous.moveCount + 1 && next.lastMove ? next.lastMove : null;
      const movingPiece = transition ? previous.pieces.find(piece => piece.position === transition.from) : undefined;
      animateFrame = undefined;
      state = next; units.clear(); overlays.clear(); billboards.length = 0;
      const moving = new THREE.Group();
      for (const piece of state.pieces) {
        const { x, z } = sitePoint(piece.position), own = piece.owner === state.viewer;
        const group = transition && movingPiece && piece.position === transition.to && piece.owner === movingPiece.owner ? moving : units;
        const base = mesh(badge, baseWood, x, .075, z, group); base.rotation.y = piece.owner === 1 ? 0 : Math.PI; base.userData = { site: piece.position };
        const uniform = own ? blue : red;
        const part = (shape: THREE.BufferGeometry, surface: THREE.Material, dx: number, y: number, dz = 0) => {
          const object = mesh(shape, surface, x + dx, y, z + dz, group);
          object.userData = { site: piece.position }; return object;
        };
        part(body, uniform, 0, .4);
        part(headShape, skin, 0, .63);
        part(helmet, uniform, 0, .74);
        for (const side of [-1, 1]) {
          part(limb, dark, side * .09, .23);
          const arm = part(limb, uniform, side * .21, .42); arm.rotation.z = side * .2;
        }
        // Only the allowlisted visible type can affect geometry. Unknown enemies share every part.
        const style = identity(piece);
        if (!piece.unknown) {
          if (style.rank) {
            for (let i = 0; i < Math.ceil(style.rank / 3); i++) {
              const badge = part(insignia, brass, (i - 1) * .1, .5, .15);
              badge.scale.x = .8 + ((style.rank - 1) % 3) * .15;
            }
            if (style.rank >= 7) part(equipment, brass, .2, .4, -.1).rotation.z = -.4;
          } else if (piece.type === 'aircraft') {
            part(equipment, brass, 0, .47, -.16).scale.x = 1.6;
          } else if (piece.type === 'tank') {
            part(armor, dark, 0, .43); part(equipment, brass, 0, .46, .18);
          } else if (piece.type === 'engineer') {
            part(equipment, wood, .23, .26); part(tool, dark, -.23, .45);
          } else if (piece.type === 'cavalry') {
            part(horse, wood, 0, .27, -.18); part(headShape, wood, 0, .48, -.38);
          } else if (piece.type === 'spy') {
            part(cloak, dark, 0, .43);
          } else if (piece.type === 'flag') {
            part(pole, wood, .24, .52); part(equipment, uniform, .36, .86);
          } else if (piece.type === 'mine') {
            part(equipment, dark, 0, .23, .24); part(insignia, brass, 0, .29, .24);
          }
        }
        const text = piece.unknown ? '?' : PIECES[piece.type].label;
        const engraving = mesh(baseName, label(text, '#2b251d', '#c8a779', true), x, .223, z + .22, group); engraving.rotation.x = -Math.PI / 2; engraving.userData = { site: piece.position };
        const plaque = mesh(face, label(text, own ? '#173547' : '#fff3df', own ? '#f2e8ca' : '#743e36', true), x, 1.01, z, group);
        plaque.userData = { site: piece.position }; billboards.push(plaque);
      }
      units.add(moving);
      if (transition && movingPiece && !reducedMotion.matches) {
        const profile=motionProfile(movingPiece);
        const from = sitePoint(transition.from), to = sitePoint(transition.to);
        const ghost = !moving.children.length;
        if (ghost) {
          // An eliminated attacker uses only the previously visible representation.
          mesh(badge, movingPiece.owner === state.viewer ? blue : red, to.x, 0.16, to.z, moving);
        }
        const start = performance.now();
        animateFrame = now => {
          const progress = Math.min(1, (now - start) / profile.duration);
          const travel=profile.easing==='rush'?1-Math.pow(1-progress,2):profile.easing==='heavy'?progress*progress*(3-2*progress):progress;
          moving.position.set((from.x - to.x) * (1 - travel), Math.sin(progress * Math.PI) * profile.height, (from.z - to.z) * (1 - travel));
          if (progress === 1 && ghost) moving.clear();
          return progress < 1;
        };
        animateFrame(start);
      }
      if(transition&&state.battleSite&&state.battleOutcome&&!reducedMotion.matches){
        restoreFocus?.();
        fxGroup.clear();const at=sitePoint(state.battleSite),started=performance.now(),outcome=state.battleOutcome;
        canvas.dataset.battleEffect=outcome;
        const flash=mesh(ring,lightFx,at.x,.24,at.z,fxGroup);flash.rotation.x=-Math.PI/2;
        const count=host.clientWidth<600?6:12;
        const drops=Array.from({length:count},(_,i)=>mesh(i%2?splatter:particle,i%2?inkFx:scan,at.x,.3,at.z,fxGroup));
        const slashes = Array.from({ length: outcome === 'MUTUAL' ? 2 : 1 }, (_, i) => {
          const slash = mesh(splatter, inkFx, at.x, 1.1, at.z, fxGroup);
          slash.rotation.y = i === 0 ? Math.PI / 4 : -Math.PI / 4;
          return slash;
        });
        const cameraPosition=camera.position.clone(),cameraTarget=controls.target.clone();
        const focus=allowBattleCamera(false,started-lastManual);
        restoreFocus = () => {
          if (focus && lastManual <= started) {
            camera.position.copy(cameraPosition); controls.target.copy(cameraTarget); controls.update();
          }
          restoreFocus = undefined;
        };
        canvas.dataset.cameraDirector=focus?'focus':'manual';
        effectsFrame=now=>{
          const t=Math.min(1,(now-started)/800);
          drops.forEach((drop,i)=>{const angle=i/count*Math.PI*2;drop.position.set(at.x+Math.cos(angle)*t*.85,.5+Math.sin(t*Math.PI)*.7,at.z+Math.sin(angle)*t*.85);drop.rotation.y=angle;drop.scale.setScalar(1-t);});
          slashes.forEach(slash => { slash.scale.set(4 * (1 - t), 1, 1); slash.position.y = 1.1 + Math.sin(t * Math.PI) * .2; });
          flash.scale.setScalar(.8+t*.9);lightFx.opacity=(1-t)*.8;inkFx.opacity=(1-t)*.8;
          if(outcome==='MUTUAL'){flash.scale.x*=1.4;flash.rotation.z=t*Math.PI;}
          if(focus&&lastManual<=started){const zoom=Math.sin(t*Math.PI)*.45;camera.position.copy(cameraPosition).lerp(new THREE.Vector3(at.x,5,at.z+(state.viewer===1?4:-4)),zoom);controls.target.copy(cameraTarget).lerp(new THREE.Vector3(at.x,.3,at.z),zoom);controls.update();}
          if(t===1){restoreFocus?.();fxGroup.clear();delete canvas.dataset.battleEffect;return false;}return true;
        };
      } else if(next.moveCount!==previous.moveCount&&!transition){restoreFocus?.();fxGroup.clear();effectsFrame=undefined;delete canvas.dataset.battleEffect;}
      animationStatus(!!animateFrame);
      if (cameraPreset === 'selected' || next.viewer !== previous.viewer) setCamera(cameraPreset);
      const interaction = state.interaction;
      canvas.dataset.analysisCount=String(state.analysis?.hypotheses.length??0);
      if(state.analysis) {
        for(const hypothesis of state.analysis.hypotheses) {
          const p=sitePoint(hypothesis.position), mark=mesh(ring,scan,p.x,.25,p.z,overlays);
          mark.rotation.x=-Math.PI/2; mark.scale.setScalar(hypothesis.count<=3?1.13:.9); mark.userData={site:hypothesis.position};
        }
        for(const route of state.analysis.routes) {
          const a=sitePoint(route.from),b=sitePoint(route.to),direction=new THREE.Vector3(b.x-a.x,0,b.z-a.z);
          const line=mesh(arrowShaft,scan,(a.x+b.x)/2,.3,(a.z+b.z)/2,overlays); line.scale.y=direction.length();line.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
        }
      }
      for (const site of new Set([...interaction.legalTargets, ...(interaction.selectedSite ? [interaction.selectedSite] : []), ...(interaction.pendingSite ? [interaction.pendingSite] : [])])) {
        const { x, z } = sitePoint(site);
        const mark = mesh(site.startsWith('HQ') ? wideRing : ring, site === interaction.pendingSite ? pendingMaterial : site === interaction.selectedSite ? selectedMaterial : gold, x, 0.13, z, overlays);
        mark.rotation.x = -Math.PI / 2; mark.userData = { site };
      }
      for (const lane of interaction.laneCandidates) {
        const path = mesh(pathShape, lane === interaction.selectedLane ? pendingMaterial : gold, lane === 'C' ? -0.5 : 0.5, 0.72, 0, overlays);
        path.userData = { lane };
      }
      if (state.battleSite) {
        const point = sitePoint(state.battleSite);
        const mark = mesh(wideRing, pendingMaterial, point.x, .16, point.z, overlays);
        mark.rotation.x = -Math.PI / 2;
        const sign = mesh(face, label('戦', '#fff3df', '#87392b', true), point.x + .3, .4, point.z, overlays);
        billboards.push(sign);
      }
      if (state.lastMove) {
        const from = sitePoint(state.lastMove.from), to = sitePoint(state.lastMove.to);
        const direction = new THREE.Vector3(to.x - from.x, 0, to.z - from.z), length = direction.length(); direction.normalize();
        const shaft = mesh(arrowShaft, arrowMaterial, (from.x + to.x) / 2, 0.65, (from.z + to.z) / 2, units);
        shaft.scale.y = length; shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        const head = mesh(arrowHead, arrowMaterial, to.x, 0.65, to.z, units); head.quaternion.copy(shaft.quaternion);
      }
      requestDraw();
    }
    canvas.setAttribute('aria-label', '操作可能な三次元戦場'); canvas.setAttribute('role', 'img');
    host.append(canvas); canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', movePointer);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', cancelPointer);
    canvas.addEventListener('wheel',wheel,{passive:true});
    controls.addEventListener('change', requestDraw);
    // Do not mutate canvas dimensions inside a ResizeObserver delivery cycle.
    observer = new ResizeObserver(() => {
      if (!disposed && !resizeFrame) resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; resize(); });
    }); observer.observe(host);
    update(initial); resize();
    return { backend: backend.kind, update, reset, setCamera:preset=>setCamera(preset,true), dispose };
  } catch (error) { dispose(); throw error; }
}
