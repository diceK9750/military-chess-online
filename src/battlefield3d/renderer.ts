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
import { fullCameraDistance } from './camera';
import { qualityProfile } from './settings';
import { approachingEnemies, snapTarget } from './assistance';

export interface BattlefieldRenderer {
  readonly backend: 'webgpu' | 'webgl2';
  update(state: BattlefieldViewState): void;
  reset(): void;
  setCamera(preset: CameraPreset): void;
  capture?(): Promise<HTMLCanvasElement>;
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
  controls.enabled = false; // Presets alone move the camera; gestures belong to pieces or page scrolling.
  controls.enableRotate = false;
  controls.enableZoom = false;
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
  const hqSigns: { owner: 1 | 2; sign: THREE.Mesh; curtain: THREE.Mesh }[] = [];
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
  let pieceDrag: { id: number; from: Site; x: number; y: number; active: boolean; moveCount: number } | null = null;
  const dragGhost = new THREE.Group(); scene.add(dragGhost);
  const hover = new THREE.Group(); scene.add(hover);
  const winningLight=new THREE.SpotLight('#ffe6a4',0,18,Math.PI/7,.65);scene.add(winningLight,winningLight.target);
  const hoverRing = geometry(new THREE.TorusGeometry(.45,.025,4,20));
  const hoverSurface = material('#b9f0e9');
  const dragLabel = new THREE.Group(); scene.add(dragLabel);
  const dragTagShape=geometry(new THREE.PlaneGeometry(.5,.2));
  let hovered:Site|null=null;
  const pointerIds = new Set<number>();
  let scrollTouch: { id: number; y: number } | null = null;
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
    const surface = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, depthTest: false }); materials.add(surface); labelCache.set(key, surface); return surface;
  }
  const ghostShape=geometry(new THREE.ConeGeometry(.3,.65,5));
  const ghostSurface=new THREE.MeshBasicMaterial({color:'#a9f1ef',transparent:true,opacity:.55});materials.add(ghostSurface);
  function requestDraw() {
    if (disposed || frame) return;
    frame = requestAnimationFrame(now => {
      frame = 0;
      if (disposed) return;
      try {
        const moving = animateFrame?.(now) ?? false;
        const effects = effectsFrame?.(now) ?? false;
        const active = moving || effects;
        billboards.forEach(label => {label.quaternion.copy(camera.quaternion);label.getWorldPosition(labelPosition);label.scale.setScalar(Math.min(1.35,Math.max(.85,labelPosition.distanceTo(camera.position)/12)));});
        renderer.render(scene, camera);
        if (!moving) animateFrame=undefined;
        if (!active) animationStatus(false);
        if (!effects) effectsFrame=undefined;
        if (active) requestDraw();
      } catch { onFailure(); }
    });
  }
  function setCamera(preset: CameraPreset, manual=false) {
    if(manual)lastManual=performance.now();
    cameraPreset = preset;
    const distance = fullCameraDistance(camera.aspect);
    const side = state.viewer === 1 ? 1 : -1;
    if (preset === 'top') {
      controls.target.set(0, .25, 0);
      camera.position.set(0, fullCameraDistance(camera.aspect, true), side * .001);
    } else if (preset === 'front' || preset === 'enemy' || preset === 'selected') {
      const point = preset === 'selected' && state.interaction.selectedSite ? sitePoint(state.interaction.selectedSite) : { x: 0, z: (preset === 'enemy' ? -side : side) * 2 };
      const near = Math.min(24, Math.max(7, 7 / camera.aspect));
      controls.target.set(point.x, .3, point.z);
      camera.position.set(point.x, near * .78, point.z + (preset === 'enemy' ? -side : side) * near * .7);
    } else {
      const from = preset === 'last' && state.lastMove ? sitePoint(state.lastMove.from) : { x: 0, z: 0 };
      const to = preset === 'last' && state.lastMove ? sitePoint(state.lastMove.to) : from;
      const x = (from.x + to.x) * .25, z = (from.z + to.z) * .25;
      controls.target.set(x, .25, z);
      camera.position.set(x, distance * .86, z + side * distance * .6);
    }
    controls.update(); canvas.dataset.cameraPreset = preset;
    canvas.dataset.cameraPose = camera.position.toArray().join('/') + '/' + controls.target.toArray().join('/');
    requestDraw();
  }
  function reset() { setCamera('full',true); }
  function resize() {
    if (disposed) return;
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, qualityProfile(state.quality??'standard').pixelRatio);
    canvas.dataset.quality=state.quality??'standard';canvas.dataset.pixelRatio=String(ratio);
    const size = `${width}/${height}/${ratio}`;
    if (size === lastSize) return;
    lastSize = size;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); setCamera(cameraPreset);
  }
  function lost(event: Event) { event.preventDefault(); onFailure(); }
  function pick(event: PointerEvent, ground = false) {
    const bounds = canvas.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return;
    raycaster.setFromCamera(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1), camera);
    const floor=raycaster.intersectObjects(pickables,true)[0];
    if(ground)return floor;
    const hit=raycaster.intersectObjects([...units.children,...overlays.children,...pickables],true).find(value=>value.object.userData.site||value.object.userData.lane);
    if(hit?.object.userData.lane)return hit;
    // Upright labels can project over a farther cell. A legal floor target wins over that label.
    if(floor&&state.interaction.selectedSite&&state.interaction.legalTargets.includes(floor.object.userData.site as Site))return floor;
    return hit;
  }
  function cancelDrag() {
    pieceDrag = null; dragGhost.clear(); dragLabel.clear();
    canvas.style.cursor='default';
    delete canvas.dataset.dragging; delete canvas.dataset.dragTarget; requestDraw();
  }
  function dropTarget(event:PointerEvent) {
    const bounds=canvas.getBoundingClientRect();
    if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)return null;
    const hit=pick(event,true);
    if(hit)return {site:hit.object.userData.site as Site,point:hit.point};
    const point=raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-.07),new THREE.Vector3());
    if(!point)return null;
    const site=snapTarget(point,state.interaction.legalTargets.map(site=>({...sitePoint(site),site,halfWidth:site.startsWith('HQ')?.98:.48})));
    return site?{site,point:new THREE.Vector3(sitePoint(site).x,.07,sitePoint(site).z)}:null;
  }
  function down(event: PointerEvent) {
    if (event.button !== 0) return;
    pointerIds.add(event.pointerId);
    gesture.down(event.pointerId, event.clientX, event.clientY);
    if (pointerIds.size > 1) { cancelDrag(); scrollTouch=null; return; }
    const site = pick(event)?.object.userData.site as Site | undefined;
    const own = state.pieces.find(p => p.position === site && p.owner === state.viewer && !p.unknown);
    if (own && state.interaction.interactionEnabled && !animateFrame && !effectsFrame && handlers.onPieceDrop) {
      pieceDrag = { id: event.pointerId, from: own.position, x: event.clientX, y: event.clientY, active: false, moveCount: state.moveCount };
      canvas.setPointerCapture(event.pointerId);
    } else if (event.pointerType === 'touch') {
      scrollTouch = { id: event.pointerId, y: event.clientY };
    }
  }
  function movePointer(event: PointerEvent) {
    gesture.move(event.pointerId, event.clientX, event.clientY);
    if (pieceDrag?.id === event.pointerId) {
      if (!pieceDrag.active && Math.hypot(event.clientX-pieceDrag.x,event.clientY-pieceDrag.y)>6) {
        pieceDrag.active = true; handlers.onDragStart?.(pieceDrag.from);
        // A lightweight ghost uses only a known own piece's visible material.
        dragGhost.add(new THREE.Mesh(ghostShape,ghostSurface));
        canvas.dataset.dragging = pieceDrag.from;
      }
      if (pieceDrag.active) {
        const hit = dropTarget(event);dragLabel.clear();
        if (hit) { const legal=state.interaction.legalTargets.includes(hit.site),p=legal?sitePoint(hit.site):hit.point;dragGhost.position.set(p.x,.8,p.z);canvas.style.cursor=legal?'copy':'not-allowed';canvas.dataset.dragTarget=legal?hit.site:'禁止';const tag=new THREE.Mesh(dragTagShape,label(legal?'移':'禁止',legal?'#182b2b':'#fff',legal?'#ffe2a1':'#87392b',true));tag.position.set(p.x,.95,p.z);tag.quaternion.copy(camera.quaternion);dragLabel.add(tag); }
        else { dragGhost.position.set(0,-20,0); canvas.style.cursor='not-allowed'; }
        requestDraw();
      }
      return;
    }
    if (scrollTouch?.id === event.pointerId) { window.scrollBy(0, scrollTouch.y - event.clientY); scrollTouch.y=event.clientY; }
    if (!pointerIds.size) {
      const site=pick(event)?.object.userData.site as Site|undefined;
      const own=state.interaction.interactionEnabled && event.pointerType!=='touch' && state.pieces.some(p=>!p.unknown&&p.owner===state.viewer&&p.position===site);
      const next=own?site!:null;
      if(next!==hovered){hovered=next;hover.clear();if(next){const p=sitePoint(next),ring=new THREE.Mesh(hoverRing,hoverSurface);ring.rotation.x=-Math.PI/2;ring.position.set(p.x,.18,p.z);hover.add(ring);canvas.dataset.hoverSite=next;}else delete canvas.dataset.hoverSite;requestDraw();}
      canvas.style.cursor=own?'pointer':'default';
    }
  }
  function cancelPointer(event: PointerEvent) { gesture.cancel(event.pointerId); pointerIds.delete(event.pointerId); scrollTouch=null; cancelDrag(); }
  function leavePointer(){if(pieceDrag?.active)return;hovered=null;hover.clear();delete canvas.dataset.hoverSite;canvas.style.cursor='default';requestDraw();}
  function up(event: PointerEvent) {
    pointerIds.delete(event.pointerId);
    scrollTouch=null;
    const drag = pieceDrag;
    if (drag?.id === event.pointerId) {
      const hit = dropTarget(event); cancelDrag();
      if (drag.active) {
        gesture.cancel(event.pointerId);
        if (state.interaction.interactionEnabled && !animateFrame && !effectsFrame && state.moveCount === drag.moveCount && hit) {
          const to = hit.site;
          const lane = drag.from.startsWith('HQ') && to.startsWith('HQ') ? hit.point.x < 0 ? 'C' : 'D' : undefined;
          handlers.onPieceDrop?.(drag.from, to, lane);
        }
        return;
      }
    }
    if (!gesture.up(event.pointerId, event.clientX, event.clientY) || !state.interaction.interactionEnabled || animateFrame || effectsFrame) return;
    const hit = pick(event);
    if (!hit) return;
    if (hit.object.userData.lane) handlers.onLaneSelect(hit.object.userData.lane as 'C' | 'D');
    else handlers.onSiteSelect(hit.object.userData.site as Site);
  }
  function dispose() {
    if (disposed) return; disposed = true;
    cancelAnimationFrame(frame); cancelAnimationFrame(resizeFrame); observer?.disconnect();
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('pointerdown', down, true); canvas.removeEventListener('pointermove', movePointer);
    canvas.removeEventListener('pointerup', up, true); canvas.removeEventListener('pointercancel', cancelPointer, true);
    canvas.removeEventListener('pointerleave',leavePointer);
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
    const bridgeSign = geometry(new THREE.PlaneGeometry(.75,.23));
    for (const crossing of BRIDGES) {
      const { x } = sitePoint(crossing.from);
      mesh(bridge, wood, x, 0.12, 0);
      for (const offset of [-0.31, 0.31]) mesh(rail, wood, x + offset, 0.2, 0);
      const tag=mesh(bridgeSign,label(crossing.from[0]+' 突破口','#32281d','#ffe3a2',true),x,.26,0);tag.rotation.x=-Math.PI/2;
    }
    const face = geometry(new THREE.PlaneGeometry(0.8, 0.29));
    const geometryTag = geometry(new THREE.PlaneGeometry(.45,.19));
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
    const silver=material('#d4e0df'),pale=material('#9bcdd4'),olive=material('#647550'),amber=material('#e5b54a'),violet=material('#575177');
    const fuselage=geometry(new THREE.ConeGeometry(.12,.6,6));
    const propeller=geometry(new THREE.BoxGeometry(.08,.4,.035));
    const track=geometry(new THREE.BoxGeometry(.13,.2,.65));
    const shovel=geometry(new THREE.BoxGeometry(.15,.14,.05));
    const flagCloth=geometry(new THREE.BoxGeometry(.45,.28,.035));
    const mineDevice=geometry(new THREE.CylinderGeometry(.27,.32,.2,8));
    const rankBases = [geometry(new THREE.BoxGeometry(.65,.06,.65)), geometry(new THREE.CylinderGeometry(.36,.36,.06,16)), geometry(new THREE.CylinderGeometry(.39,.39,.08,6))];
    const rankPip = geometry(new THREE.IcosahedronGeometry(.075,0));
    const rankBand = geometry(new THREE.BoxGeometry(.47,.055,.1));
    const capPeak = geometry(new THREE.BoxGeometry(.35,.045,.22));
    const curtain = geometry(new THREE.BoxGeometry(1.85, 0.5, 0.04));
    for (const owner of [1, 2] as const) {
      const z = owner === 1 ? 4.1 : -4.1, surface = owner === state.viewer ? blue : red;
      const banner = mesh(curtain, surface, 0, 0.38, z);
      for (const x of [-0.94, 0.94]) mesh(pole, wood, x, 0.45, z);
      const sign = mesh(geometry(new THREE.PlaneGeometry(1.45, 0.3)), label(owner === state.viewer ? '自軍本陣' : '敵軍本陣', '#ece4cd', owner === state.viewer ? '#375f78' : '#86534b', true), 0, 0.64, z + (owner === 1 ? -0.03 : 0.03));
      sign.rotation.y = owner === 1 ? Math.PI : 0;
      hqSigns.push({ owner, sign, curtain: banner });
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
      animateFrame = undefined;hover.clear();hovered=null;delete canvas.dataset.hoverSite;
      state = next; units.clear(); overlays.clear(); billboards.length = 0;
      winningLight.intensity=next.freshVictory?16:0;
      if(next.freshVictory&&next.lastMove){const p=sitePoint(next.lastMove.to);winningLight.position.set(p.x,7,p.z+2);winningLight.target.position.set(p.x,.2,p.z);}else delete canvas.dataset.ceremony;
      canvas.dataset.overlay=String(!!state.overlay);
      if(previous.quality!==next.quality){lastSize='';resize();}
      if (pieceDrag && (next.moveCount !== pieceDrag.moveCount || !next.interaction.interactionEnabled)) cancelDrag();
      for (const hq of hqSigns) {
        const own = hq.owner === state.viewer;
        hq.curtain.material = own ? blue : red;
        hq.sign.material = label(own ? '自軍本陣' : '敵軍本陣', '#ece4cd', own ? '#375f78' : '#86534b', true);
      }
      const moving = new THREE.Group();
      for (const piece of state.pieces) {
        const { x, z } = sitePoint(piece.position), own = piece.owner === state.viewer;
        const group = transition && movingPiece && piece.position === transition.to && piece.owner === movingPiece.owner ? moving : units;
        const base = mesh(badge, baseWood, x, .075, z, group); base.rotation.y = piece.owner === 1 ? 0 : Math.PI; base.userData = { site: piece.position };
        const uniform = own ? blue : red;
        const style = identity(piece);
        const stature = style.rank ? .88 + style.rank * .027 : 1;
        const part = (shape: THREE.BufferGeometry, surface: THREE.Material, dx: number, y: number, dz = 0) => {
          const object = mesh(shape, surface, x + dx, .2 + (y-.2)*stature, z + dz, group);
          object.userData = { site: piece.position }; return object;
        };
        if (piece.unknown || !['mine','aircraft','tank','flag'].includes(piece.type)) {
          part(body, uniform, 0, .4);
          part(headShape, skin, 0, .63);
          part(helmet, uniform, 0, .74);
          for (const side of [-1, 1]) {
            part(limb, dark, side * .09, .23);
            const arm = part(limb, uniform, side * .21, .42); arm.rotation.z = side * .2;
          }
        }
        // Only the allowlisted visible type can affect geometry. Unknown enemies share every part.
        if (!piece.unknown) {
          if (style.rank) {
            const family = Math.ceil(style.rank / 3), tier = (style.rank - 1) % 3 + 1;
            const accent = family === 3 ? brass : family === 2 ? silver : pale;
            part(rankBases[family-1],accent,0,.24);
            // Large, non-text insignia repeat the 3/2/1 tier on the base and helmet.
            for(let i=0;i<tier;i++) part(rankPip,accent,(i-(tier-1)/2)*.18,.3,.3);
            part(capPeak,accent,0,.77,.08).scale.set(family===3?1.2:1,family===3?2:1,1);
            if(family===2)for(let i=0;i<tier;i++)part(rankBand,accent,0,.35+i*.085,.2);
            if(family===1)part(helmet,pale,0,.78).scale.set(1.25,1,1.25);
            // Family silhouettes: tall crested generals, broad epauletted colonels, compact officers.
            part(body, uniform, 0, .43).scale.set(family === 2 ? 1.55 : 1.15, family === 3 ? 1.55 : 1, 1);
            for (let i = 0; i < tier; i++) {
              part(insignia, accent, (i-(tier-1)/2)*.13, .53, .22).scale.set(1.25,1.4,1);
              const crest = part(insignia, accent, (i-(tier-1)/2)*.15, family === 3 ? .89 : .81);
              crest.scale.set(1.6, family === 3 ? 4.4 : family === 2 ? 2.2 : 1.2, 2.2);
            }
            for (const side of [-1,1]) part(equipment,accent,side*.2,.57).scale.set(.65,family===2?1.7:1,.8);
            if (family === 3) { part(cloak,accent,0,.38,-.16).scale.set(1.2,1.5,.65); part(tool,brass,.28,.48).rotation.z=-.3; }
            // Tier silhouettes: standard / twin horns / single plume, in addition to 3/2/1 pips.
            if(tier===3){part(flagCloth,accent,-.28,1.02,-.15).scale.set(.55,.8,1);part(pole,uniform,-.4,.66,-.15).scale.y=.9;}
            if(tier===2)for(const side of [-1,1])part(tool,accent,side*.22,.84).rotation.z=side*.55;
            if(tier===1)part(cloak,accent,0,.9).scale.set(.45,.7,.45);
          } else if (piece.type === 'aircraft') {
            part(fuselage, silver, 0, .56).rotation.x=Math.PI/2;
            part(equipment,silver,0,.6).scale.set(2.65,1,2.3);
            part(headShape,uniform,0,.67).scale.set(.8,.65,1.2);
            part(equipment,brass,0,.78,-.23).scale.set(.8,2,1);
            part(propeller,dark,0,.61,.27);
            part(equipment,uniform,0,.56,-.28).scale.set(1.7,.6,1.3);
          } else if (piece.type === 'tank') {
            part(armor, olive, 0, .35).scale.set(1.5,1,2);
            for(const side of [-1,1]) part(track,dark,side*.28,.27);
            part(helmet,olive,0,.62).scale.set(1.3,1.5,1.3);
            const barrel=part(tool,brass,0,.61,.25);barrel.rotation.x=Math.PI/2;barrel.scale.y=1.3;
          } else if (piece.type === 'engineer') {
            part(helmet,amber,0,.77).scale.set(1.5,1.8,1.5);
            part(armor,wood,0,.39,-.16).scale.set(.9,.9,.65);
            part(tool,silver,.27,.46).rotation.z=-.35;part(equipment,silver,.33,.67).scale.set(.9,1.6,1);
            part(tool,wood,-.27,.45).rotation.z=.3;part(shovel,silver,-.33,.25);
          } else if (piece.type === 'cavalry') {
            part(horse,wood,0,.38).scale.set(1.2,1.2,1.3);
            for(const dx of [-.14,.14])for(const dz of [-.2,.2])part(limb,dark,dx,.2,dz).scale.y=1.5;
            part(cloak,wood,0,.59,.23).scale.set(.55,1.1,.75);part(headShape,wood,0,.79,.25).scale.set(.85,1,1.5);
            part(tool,brass,-.28,.66).scale.y=1.7;
          } else if (piece.type === 'spy') {
            part(cloak,violet,0,.4).scale.set(1.6,2,1.3);part(cloak,dark,0,.77).scale.set(1.1,1.2,1.1);
            part(insignia,silver,0,.64,.14).scale.x=2.1;
          } else if (piece.type === 'flag') {
            part(pole,wood,-.2,.67).scale.y=1.3;
            part(flagCloth,brass,.02,.94).scale.set(1.4,1.15,1);part(insignia,uniform,.02,.94,.03).scale.set(3,3,1);
          } else if (piece.type === 'mine') {
            // A device silhouette, rather than another standing infantryman.
            part(mineDevice,dark,0,.31);for(let i=0;i<6;i++){const angle=i/6*Math.PI*2;part(insignia,amber,Math.cos(angle)*.22,.36,Math.sin(angle)*.22).scale.y=2;}
          }
        }
        const text = piece.unknown ? piece.position.startsWith('HQ') ? '敵駒' : '?' : PIECES[piece.type].label;
        const engraving = mesh(baseName, label(text, '#2b251d', '#c8a779', true), x, .223, z + .22, group); engraving.rotation.x = -Math.PI / 2; engraving.userData = { site: piece.position };
        const plaque = mesh(face, label(text, own ? '#173547' : '#fff3df', own ? '#fff7dc' : '#743e36', true), x, 1.14, z, group);
        plaque.renderOrder=5;
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
          const progress = Math.min(1, (now - start) / (next.freshVictory ? 1200 : profile.duration * (next.phase === 'replay' ? 1.5 : 1)));
          const travel=profile.easing==='rush'?1-Math.pow(1-progress,2):profile.easing==='heavy'?progress*progress*(3-2*progress):progress;
          moving.position.set((from.x - to.x) * (1 - travel), Math.sin(progress * Math.PI) * profile.height, (from.z - to.z) * (1 - travel));
          if (progress === 1 && ghost) moving.clear();
          return progress < 1;
        };
        animateFrame(start);
        if(next.freshVictory){canvas.dataset.ceremony='decisive-replay';setCamera('last');}
      }
      if(transition&&state.battleSite&&state.battleOutcome&&!reducedMotion.matches){
        restoreFocus?.();
        fxGroup.clear();const at=sitePoint(state.battleSite),started=performance.now(),outcome=state.battleOutcome;
        canvas.dataset.battleEffect=outcome;
        const flash=mesh(ring,lightFx,at.x,.24,at.z,fxGroup);flash.rotation.x=-Math.PI/2;
        const count=qualityProfile(state.quality??'standard').particles;
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
      animationStatus(!!animateFrame || !!effectsFrame);
      if (cameraPreset === 'selected' || cameraPreset === 'last' || next.viewer !== previous.viewer) setCamera(cameraPreset === 'selected' && !next.interaction.selectedSite ? 'full' : cameraPreset);
      const interaction = state.interaction;
      if(state.overlay){
        for(const site of approachingEnemies(state)){
          const p=sitePoint(site),mark=mesh(wideRing,pendingMaterial,p.x,.19,p.z,overlays);mark.rotation.x=-Math.PI/2;
          const tag=mesh(geometryTag,label('接近','#fff','#87392b',true),p.x,.9,p.z,overlays);billboards.push(tag);
        }
        for(const crossing of BRIDGES){const p=sitePoint(crossing.from),tag=mesh(geometryTag,label('突破','#25241f','#ffe18a',true),p.x,.45,0,overlays);billboards.push(tag);}
      }
      if(interaction.selectedSite&&state.phase!=='setup')for(const site of new Set(interaction.legalTargets)){
        const a=sitePoint(interaction.selectedSite),b=sitePoint(site),direction=new THREE.Vector3(b.x-a.x,0,b.z-a.z);
        const line=mesh(arrowShaft,scan,(a.x+b.x)/2,.16,(a.z+b.z)/2,overlays);line.scale.set(.4,direction.length(),.4);line.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
      }
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
        if (site === interaction.selectedSite || site === interaction.pendingSite) mark.scale.setScalar(1.16);
        const text=site===interaction.pendingSite?(interaction.laneCandidates.length<2||interaction.selectedLane?'確定':'予定'):site===interaction.selectedSite?'選択':state.phase==='setup'?'交換':'移';
        const tag=mesh(geometryTag,label(text,'#29261d',site===interaction.pendingSite?'#ffd58d':site===interaction.selectedSite?'#adf5f0':'#ffe18a',true),x,.3,z+.34,overlays);
        tag.userData={site};tag.renderOrder=6;billboards.push(tag);
      }
      if(interaction.selectedSite&&interaction.pendingSite){const a=sitePoint(interaction.selectedSite),b=sitePoint(interaction.pendingSite),dir=new THREE.Vector3(b.x-a.x,0,b.z-a.z);const shaft=mesh(arrowShaft,pendingMaterial,(a.x+b.x)/2,.25,(a.z+b.z)/2,overlays);shaft.scale.y=dir.length();shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());}
      for (const lane of interaction.laneCandidates) {
        const path = mesh(pathShape, lane === interaction.selectedLane ? pendingMaterial : gold, lane === 'C' ? -0.5 : 0.5, 0.72, 0, overlays);
        path.userData = { lane };
        const tag=mesh(geometryTag,label(lane+'列','#25241f','#ffe18a',true),lane==='C'?-.5:.5,.82,0,overlays);tag.userData={lane};billboards.push(tag);
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
        for (const [point, text] of [[from, '発'], [to, '着']] as const) {
          const mark = mesh(ring, arrowMaterial, point.x, .15, point.z, overlays); mark.rotation.x = -Math.PI / 2;
          const tag = mesh(geometryTag, label(text, '#272b29', '#f7d57a', true), point.x, .38, point.z - .3, overlays);
          tag.renderOrder=4; billboards.push(tag);
        }
        canvas.dataset.lastMove = `${state.lastMove.from}/${state.lastMove.to}`;
      } else {
        delete canvas.dataset.lastMove;
      }
      requestDraw();
    }
    canvas.setAttribute('aria-label', '操作可能な三次元戦場'); canvas.setAttribute('role', 'img');
    host.append(canvas); canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('pointerdown', down, true); canvas.addEventListener('pointermove', movePointer);
    canvas.addEventListener('pointerup', up, true); canvas.addEventListener('pointercancel', cancelPointer, true);
    canvas.addEventListener('pointerleave',leavePointer);
    canvas.style.touchAction = 'none'; // Own-piece touch drag stays captured; blank-area touch scrolls the page.
    controls.addEventListener('change', requestDraw);
    // Do not mutate canvas dimensions inside a ResizeObserver delivery cycle.
    observer = new ResizeObserver(() => {
      if (!disposed && !resizeFrame) resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; resize(); });
    }); observer.observe(host);
    update(initial); resize();
    return { backend: backend.kind, update, reset, setCamera:preset=>setCamera(preset,true), dispose,
      capture:async()=>{if(disposed)throw new Error('戦場は閉じられています');if(backend.kind==='webgpu'&&renderer.renderAsync)await renderer.renderAsync(scene,camera);else renderer.render(scene,camera);const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;const context=copy.getContext('2d');if(!context)throw new Error('画像を作成できません');context.drawImage(canvas,0,0);return copy;} };
  } catch (error) { dispose(); throw error; }
}
