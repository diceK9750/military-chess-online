import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SITES } from '../game/board';
import { PIECES } from '../game/pieces';
import { PIECE_ICONS } from '../ui/PieceFace';
import { BRIDGES, sitePoint } from './state';
import type { BattlefieldViewState } from './state';

export interface BattlefieldRenderer {
  update(state: BattlefieldViewState): void;
  reset(): void;
  dispose(): void;
}

/** Render-only adapter: no GameState, IDs, legal moves, CPU, or persistence. */
export function createBattlefield(host: HTMLElement, initial: BattlefieldViewState, onFailure: () => void): BattlefieldRenderer {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2', { antialias: true, alpha: false });
  if (!context) throw new Error('WebGL2 unavailable');
  const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#24383d');
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = false; // Event-driven frames, no idle animation loop.
  controls.minPolarAngle = 0.18;
  controls.maxPolarAngle = Math.PI / 2.6;
  controls.minDistance = 7;
  controls.maxDistance = 34;
  controls.rotateSpeed = 0.7;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const labelCache = new Map<string, THREE.MeshBasicMaterial>();
  const units = new THREE.Group();
  let state = initial;
  let disposed = false;
  let frame = 0;
  let observer: ResizeObserver | undefined;
  function geometry<T extends THREE.BufferGeometry>(value: T): T { geometries.add(value); return value; }
  function material(color: string) {
    const value = new THREE.MeshLambertMaterial({ color, flatShading: true }); materials.add(value); return value;
  }
  function mesh(shape: THREE.BufferGeometry, surface: THREE.Material, x: number, y: number, z: number, group: THREE.Object3D = scene) {
    const object = new THREE.Mesh(shape, surface); object.position.set(x, y, z); group.add(object); return object;
  }
  function label(text: string, ink: string, background: string) {
    const key = `${text}/${ink}/${background}`;
    const cached = labelCache.get(key); if (cached) return cached;
    const bitmap = document.createElement('canvas'); bitmap.width = 256; bitmap.height = 256;
    const ctx = bitmap.getContext('2d'); if (!ctx) throw new Error('Canvas2D unavailable');
    ctx.fillStyle = background; ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = ink; ctx.lineWidth = 4; ctx.strokeRect(12, 12, 232, 232);
    ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      ctx.font = `${lines.length === 1 ? 68 : index === 0 ? 78 : 50}px "Yu Gothic", "Meiryo", sans-serif`;
      ctx.fillText(line, 128, lines.length === 1 ? 132 : index === 0 ? 85 : 182, 225);
    });
    const texture = new THREE.CanvasTexture(bitmap); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
    const surface = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }); materials.add(surface); labelCache.set(key, surface); return surface;
  }
  function requestDraw() {
    if (disposed || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (disposed) return;
      try { renderer.render(scene, camera); } catch { onFailure(); }
    });
  }
  function reset() {
    const distance = Math.min(30, Math.max(13, 11 / camera.aspect));
    camera.position.set(0, distance * 0.78, (state.viewer === 1 ? 1 : -1) * distance * 0.7);
    controls.target.set(0, 0, 0); controls.update(); requestDraw();
  }
  function resize() {
    if (disposed) return;
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 600 ? 1.25 : 1.5));
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); reset();
  }
  function lost(event: Event) { event.preventDefault(); onFailure(); }
  function dispose() {
    if (disposed) return; disposed = true;
    cancelAnimationFrame(frame); observer?.disconnect();
    canvas.removeEventListener('webglcontextlost', lost);
    controls.removeEventListener('change', requestDraw); controls.dispose();
    geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
    scene.clear(); labelCache.clear(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
  }
  try {
    scene.add(new THREE.HemisphereLight('#fff8df', '#45574e', 2.4));
    const sun = new THREE.DirectionalLight('#fff0c9', 2.2); sun.position.set(-5, 10, 7); scene.add(sun);
    const soil = material('#786247'), grass = material('#728362'), alternate = material('#788968');
    const wood = material('#aa8a59'), river = material('#658d92');
    const blue = material('#375f78'), red = material('#86534b');
    const tile = geometry(new THREE.BoxGeometry(0.96, 0.06, 0.96));
    const wideTile = geometry(new THREE.BoxGeometry(1.96, 0.06, 0.96));
    mesh(geometry(new THREE.BoxGeometry(7.3, 0.5, 9.3)), soil, 0, -0.34, 0);
    mesh(geometry(new THREE.BoxGeometry(7.2, 0.1, 9.2)), grass, 0, -0.05, 0);
    // A shallow boundary channel with exactly two crossing bridges.
    mesh(geometry(new THREE.BoxGeometry(7.2, 0.04, 0.28)), river, 0, 0.025, 0);
    for (const site of SITES) {
      const { x, z } = sitePoint(site);
      mesh(site.startsWith('HQ') ? wideTile : tile, (Math.round(x + z) % 2 === 0) ? grass : alternate, x, 0.04, z);
    }
    const bridge = geometry(new THREE.BoxGeometry(0.65, 0.09, 0.56));
    const rail = geometry(new THREE.BoxGeometry(0.045, 0.1, 0.56));
    for (const crossing of BRIDGES) {
      const { x } = sitePoint(crossing.from);
      mesh(bridge, wood, x, 0.12, 0);
      for (const offset of [-0.31, 0.31]) mesh(rail, wood, x + offset, 0.2, 0);
    }
    const face = geometry(new THREE.PlaneGeometry(0.65, 0.74));
    const badge = geometry(new THREE.CylinderGeometry(0.39, 0.45, 0.17, 5));
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
    scene.add(units);
    function update(next: BattlefieldViewState) {
      if (disposed) return;
      state = next; units.clear();
      for (const piece of state.pieces) {
        const { x, z } = sitePoint(piece.position), own = piece.owner === state.viewer;
        mesh(badge, own ? blue : red, x, 0.16, z, units);
        const text = piece.unknown ? '?' : `${PIECE_ICONS[piece.type]}\n${PIECES[piece.type].label}`;
        const plaque = mesh(face, label(text, own ? '#223f52' : '#f1e5d4', own ? '#eee1bb' : '#86534b'), x, 0.31, z, units);
        plaque.rotation.set(-Math.PI / 2 + (state.viewer === 1 ? 0.2 : -0.2), 0, state.viewer === 1 ? 0 : Math.PI);
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
    canvas.setAttribute('aria-label', '閲覧専用の三次元戦場'); canvas.setAttribute('role', 'img');
    host.append(canvas); canvas.addEventListener('webglcontextlost', lost);
    controls.addEventListener('change', requestDraw);
    observer = new ResizeObserver(resize); observer.observe(host);
    update(initial); resize();
    return { update, reset, dispose };
  } catch (error) { dispose(); throw error; }
}
