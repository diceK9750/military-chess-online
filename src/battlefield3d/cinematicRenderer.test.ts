// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as THREE from 'three';
import { createBattlefield } from './cinematicRenderer';
import type { BattlefieldRenderer } from './renderer';
import type { BattlefieldPiece, BattlefieldViewState } from './state';
import { defaultPlacement } from '../dev/fixtures';
import { cinemaTiming } from './cinemaPresentation';

const rendered = vi.hoisted(() => ({ scene: null as THREE.Scene | null, camera: null as THREE.PerspectiveCamera | null, render: vi.fn(), dispose: vi.fn() }));
vi.mock('./backend', () => ({ createBackend: async () => {
  const canvas = document.createElement('canvas');
  return { canvas, kind: 'webgl2', dispose: rendered.dispose, engine: { setPixelRatio: vi.fn(), setSize: vi.fn(), render: (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => { scene.updateMatrixWorld(true); rendered.scene = scene; rendered.camera = camera; rendered.render(); } } };
} }));
let now = 0, token = 0, width = 390, height = 540, reduced = false, resize: () => void, motion: () => void;
let queue = new Map<number, FrameRequestCallback>();
let renderer: BattlefieldRenderer | undefined;
const failures = vi.fn(), cameraChanges = vi.fn();
beforeEach(() => {
  now = 0; token = 0; width = 390; height = 540; reduced = false; queue = new Map(); rendered.scene = null; rendered.camera = null; vi.clearAllMocks();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { queue.set(++token, fn); return token; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queue.delete(id));
  vi.stubGlobal('ResizeObserver', class { constructor(fn: () => void) { resize = fn; } observe() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ get matches() { return reduced; }, addEventListener: (_: string, listener: () => void) => { motion = listener; }, removeEventListener: vi.fn() }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn(), fillText: vi.fn() } as unknown as CanvasRenderingContext2D);
});
afterEach(() => { renderer?.dispose(); renderer = undefined; document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function frame(time: number) { now = time; const work = [...queue.values()]; queue.clear(); work.forEach(fn => fn(time)); expect(failures).not.toHaveBeenCalled(); }
const piece = (owner: 1 | 2, position: BattlefieldPiece['position'], type: 'major' | 'captain' | 'general' = 'major'): BattlefieldPiece => ({ owner, position, unknown: false, type });
function state(pieces: readonly BattlefieldPiece[], count = 0): BattlefieldViewState {
  return { phase: 'replay', viewer: 1, finished: true, result: { winner: 1, reason: 'HQ_CAPTURE' }, moveCount: count, pieces, battleSite: null, lastMove: null, quality: 'light',
    cinematic: { shot: 'opening', speed: 1, playing: true, ending: false, title: '開戦' }, interaction: { selectedSite: null, legalTargets: [], pendingSite: null, laneCandidates: [], selectedLane: undefined, interactionEnabled: false } };
}
function conflict(outcome: 'ATTACKER' | 'DEFENDER' | 'MUTUAL') {
  const attacker = piece(1, 'B4', outcome === 'DEFENDER' ? 'captain' : 'major'), defender = piece(2, 'B5', outcome === 'ATTACKER' ? 'captain' : 'major'), other = piece(1, 'A2', 'general');
  const before = state([attacker, defender, other]), next = { ...before, moveCount: 1, pieces: [...(outcome === 'MUTUAL' ? [] : [{ ...(outcome === 'ATTACKER' ? attacker : defender), position: 'B5' as const }]), other], lastMove: { from: 'B4' as const, to: 'B5' as const, actor: 1 as const }, battleSite: 'B5' as const, battleOutcome: outcome, cinematic: { ...before.cinematic!, shot: 'battle' as const } };
  return { before, next };
}
async function mount(initial: BattlefieldViewState) {
  const host = document.createElement('div'); document.body.append(host); Object.defineProperties(host, { clientWidth: { get: () => width }, clientHeight: { get: () => height } });
  renderer = await createBattlefield(host, initial, failures, { onSiteSelect: vi.fn(), onLaneSelect: vi.fn(), onCameraChange: cameraChanges }); frame(now);
  return host.querySelector('canvas')!;
}
function squads() { const found: THREE.Object3D[] = []; rendered.scene!.traverse(o => { if (o.name === 'historical-squad') found.push(o); }); return found; }
function pieces() { return squads().map(o => o.userData.piece as BattlefieldPiece).sort((a, b) => a.position.localeCompare(b.position)); }
function expectSnapshot(expected: readonly BattlefieldPiece[]) { expect(pieces()).toEqual([...expected].sort((a, b) => a.position.localeCompare(b.position))); for (const squad of squads()) expect(squad.scale.toArray()).toEqual([1, 1, 1]); }

test('the first rendered frame contains the exact complete historical deployment and then idles', async () => {
  const deployment = [...defaultPlacement(1), ...defaultPlacement(2)].map(p => ({ owner: p.owner, position: p.position!, unknown: false as const, type: p.type }));
  const initial = state(deployment), canvas = await mount(initial); expectSnapshot(deployment); expect(canvas.dataset.unitCount).toBe('46'); expect(canvas.dataset.renderedSquads).toBe('46'); expect(canvas.dataset.shot).toBe('opening'); expect(queue.size).toBe(0);
  const calls = rendered.render.mock.calls.length; frame(8000); expect(rendered.render).toHaveBeenCalledTimes(calls); expect(initial.pieces).toEqual(deployment);
});
test.each(['ATTACKER', 'DEFENDER', 'MUTUAL'] as const)('%s battle retains both real actors through contact and settles to the exact survivor count', async outcome => {
  const { before, next } = conflict(outcome), canvas = await mount(before); renderer!.update(next); frame(1500);
  expect(canvas.dataset.battlePhase).toBe('contact'); expect(squads()).toHaveLength(3); expect(canvas.dataset.renderedSquads).toBe('3');
  frame(2750); expectSnapshot(next.pieces); expect(canvas.dataset.renderedSquads).toBe(String(next.pieces.length)); expect(canvas.dataset.battleEffect).toBeUndefined(); expect(canvas.dataset.framing).toBe('overview'); expect(queue.size).toBe(0);
});
test('pause and a speed change preserve contact progress, then resume and stop drawing', async () => {
  const { before, next } = conflict('ATTACKER'), canvas = await mount(before); renderer!.update(next); frame(1600);
  const paused = { ...next, cinematic: { ...next.cinematic, playing: false } }; renderer!.update(paused); frame(1700); const pose = canvas.dataset.cameraPose, current = squads().map(o => o.position.toArray());
  const fast = { ...paused, cinematic: { ...paused.cinematic, speed: 2 } }; renderer!.update(fast); frame(10000); expect(canvas.dataset.battlePhase).toBe('contact'); expect(squads().map(o => o.position.toArray())).toEqual(current); expect(canvas.dataset.cameraPose).toBe(pose); expect(queue.size).toBe(0);
  renderer!.update({ ...fast, cinematic: { ...fast.cinematic, playing: true } }); frame(10001); expect(canvas.dataset.battlePhase).toBe('contact'); frame(10451); expect(canvas.dataset.battlePhase).toBe('resolution'); frame(10901); expectSnapshot(next.pieces); expect(queue.size).toBe(0);
});
test('seeking clears a partial battle and restarting the recorded move reconstructs its real actors', async () => {
  const { before, next } = conflict('MUTUAL'), canvas = await mount(before); renderer!.update(next); frame(1500); renderer!.update({ ...before, cinematic: { ...before.cinematic!, playing: false } }); frame(1501);
  expectSnapshot(before.pieces); expect(canvas.dataset.battleEffect).toBeUndefined(); expect(queue.size).toBe(0);
  renderer!.update({ ...next, cinematic: { ...next.cinematic, playing: false } }); frame(3001); expect(canvas.dataset.battlePhase).toBe('contact'); frame(4500); expectSnapshot(next.pieces);
});
test('opening directly at a late frame never invents a predecessor or replays its old battle', async () => {
  const { next } = conflict('DEFENDER'); const canvas = await mount({ ...next, moveCount: 42 }); expectSnapshot(next.pieces); expect(canvas.dataset.battleEffect).toBeUndefined(); expect(queue.size).toBe(0);
});
test('manual top view survives resize and quality changes even after its grace period', async () => {
  const { before, next } = conflict('ATTACKER'), canvas = await mount(before); renderer!.setCamera!('top'); frame(1); now = 6000; width = 320; resize(); frame(6001);
  expect(canvas.dataset.cameraDirector).toBe('manual'); expect(canvas.dataset.cameraPreset).toBe('top'); expect(Math.abs(rendered.camera!.position.z)).toBeLessThan(.01);
  renderer!.update({ ...before, quality: 'high' }); frame(6002); expect(Math.abs(rendered.camera!.position.z)).toBeLessThan(.01); expect(canvas.dataset.cameraDirector).toBe('manual');
  renderer!.update({ ...next, quality: 'high' }); frame(7502); expect(canvas.dataset.cameraDirector).toBe('focus'); expect(canvas.dataset.battlePhase).toBe('contact');
});
test('reduced motion gives the exact static frame, including when preference changes mid-contact', async () => {
  const { before, next } = conflict('ATTACKER'); reduced = true; const canvas = await mount(before); renderer!.update(next); frame(100); expectSnapshot(next.pieces); expect(canvas.dataset.battleEffect).toBeUndefined(); expect(queue.size).toBe(0);
  reduced = false; renderer!.update(before); frame(200); renderer!.update(next); frame(1700); expect(canvas.dataset.battlePhase).toBe('contact'); reduced = true; motion(); frame(1701); expectSnapshot(next.pieces); expect(queue.size).toBe(0); expect(canvas.dataset.battleEffect).toBeUndefined();
});
test('decisive animation reaches the final global summary before autoplay pauses', async () => {
  const { before, next } = conflict('ATTACKER'), final = { ...next, cinematic: { ...next.cinematic, shot: 'decisive' as const, ending: true, speed: 2 } }, canvas = await mount(before); renderer!.update(final); frame(1600); expect(canvas.dataset.battlePhase).toBe('contact');
  const t = cinemaTiming(2, true, true); frame(t.march + t.clash + t.exit + 1); renderer!.update({ ...final, cinematic: { ...final.cinematic, playing: false } }); frame(3000); expectSnapshot(final.pieces); expect(canvas.dataset.shot).toBe('summary'); expect(queue.size).toBe(0);
});
test('unknown or unfinished sources never reach the rendering backend', async () => {
  const bad = state([{ owner: 2, position: 'B5', unknown: true }]); await expect(mount(bad)).rejects.toThrow(); expect(rendered.render).not.toHaveBeenCalled();
});

test('the toolbar follows manual, directed action and final whole-board views', async () => {
  const { before, next } = conflict('ATTACKER'); await mount(before); renderer!.setCamera!('enemy'); frame(1); expect(cameraChanges).toHaveBeenLastCalledWith('enemy');
  now = 4000; renderer!.update(next); frame(5500); expect(cameraChanges).toHaveBeenLastCalledWith('last'); frame(6800); expect(cameraChanges).toHaveBeenLastCalledWith('full');
});
test('repeated seek/play cycles reuse route resources and release replaced instance batches', async () => {
  const { before, next } = conflict('ATTACKER'); await mount(before);
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  const collect = () => rendered.scene!.traverse(o => { if (o instanceof THREE.Mesh) { geometries.add(o.geometry); for (const material of Array.isArray(o.material) ? o.material : [o.material]) materials.add(material); } });
  renderer!.update(next); frame(1500); collect(); renderer!.update(before); frame(1501); collect(); const counts = [geometries.size, materials.size];
  const dispose = vi.spyOn(THREE.InstancedMesh.prototype, 'dispose');
  for (let i = 0; i < 16; i++) { renderer!.update(next); frame(now + 1500); collect(); frame(now + 1250); collect(); renderer!.update(before); frame(now + 1); collect(); }
  expect([geometries.size, materials.size]).toEqual(counts); expect(dispose).toHaveBeenCalled(); expect(queue.size).toBe(0); expectSnapshot(before.pieces);
});
test.each([320, 390, 1280])('initial unit nameplates stay inside the actual %s-pixel camera viewport', async viewportWidth => {
  width = viewportWidth;
  const deployment = [...defaultPlacement(1), ...defaultPlacement(2)].map(p => ({ owner: p.owner, position: p.position!, unknown: false as const, type: p.type }));
  await mount(state(deployment)); const camera = rendered.camera!; camera.updateMatrixWorld();
  for (const squad of squads()) squad.traverse(o => { if (!(o instanceof THREE.Mesh) || !(o.material instanceof THREE.MeshBasicMaterial) || !o.material.map) return;
    for (const x of [-.5, .5]) for (const y of [-.5, .5]) { const point = o.localToWorld(new THREE.Vector3(x, y, 0)).project(camera); expect(Math.abs(point.x)).toBeLessThan(1); expect(Math.abs(point.y)).toBeLessThan(1); }
    const top = o.localToWorld(new THREE.Vector3(0, .5, 0)).project(camera), bottom = o.localToWorld(new THREE.Vector3(0, -.5, 0)).project(camera); expect(Math.abs(top.y - bottom.y) * height / 2).toBeGreaterThan(10);
  });
});
