// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { PerspectiveCamera, Vector3, type Camera, type Object3D } from 'three';
import { createBattlefield, type BattlefieldRenderer } from './renderer';
import { sitePoint, type BattlefieldViewState } from './state';

const backend = vi.hoisted(() => ({ render: vi.fn(), dispose: vi.fn() }));
vi.mock('./backend', () => ({
  createBackend: async () => {
    const canvas = document.createElement('canvas');
    canvas.setPointerCapture = vi.fn();
    canvas.getBoundingClientRect = () => new DOMRect(0, 0, 390, 430);
    return { kind: 'webgl2', canvas, dispose: backend.dispose, engine: { setPixelRatio: vi.fn(), setSize: vi.fn(), render: backend.render, dispose: vi.fn() } };
  },
}));

let reduced = false;
let renderer: BattlefieldRenderer | undefined;
let nextFrame = 0;
let frames = new Map<number, FrameRequestCallback>();
beforeEach(() => {
  frames = new Map(); nextFrame = 0; reduced = false;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); disconnect = vi.fn(); });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: reduced })));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn() } as unknown as CanvasRenderingContext2D);
  backend.render.mockImplementation((scene: Object3D, camera: Camera) => { scene.updateMatrixWorld(); camera.updateMatrixWorld(); });
});
afterEach(() => { renderer?.dispose(); renderer = undefined; document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function view(selected = false): BattlefieldViewState {
  return { viewer: 1, playerTurn: 1, moveCount: 0, finished: false, battleSite: null, lastMove: null,
    pieces: [{ owner: 1, position: 'B4', unknown: false, type: 'general' }, { owner: 1, position: 'E4', unknown: false, type: 'engineer' }],
    interaction: { selectedSite: selected ? 'B4' : null, legalTargets: selected ? ['B5', 'A4', 'C4'] : [], pendingSite: null, laneCandidates: [], selectedLane: undefined, interactionEnabled: true },
  };
}
function host() {
  const element = document.createElement('div'); document.body.append(element);
  Object.defineProperties(element, { clientWidth: { value: 390 }, clientHeight: { value: 430 } }); return element;
}
function draw() {
  const pending = [...frames]; frames.clear(); pending.forEach(([, callback]) => callback(performance.now()));
}

test.each([false, true])('selection snaps without an animation lock or idle frame loop (reduced motion: %s)', async preference => {
  reduced = preference;
  const element = host(), fail = vi.fn(), onCameraChange = vi.fn(), onAnimationChange = vi.fn();
  renderer = await createBattlefield(element, view(), fail, { onSiteSelect: vi.fn(), onLaneSelect: vi.fn(), onCameraChange, onAnimationChange });
  draw(); const canvas = element.querySelector('canvas')!, initial = canvas.dataset.cameraPose;
  renderer.update(view(true));
  expect(canvas.dataset.cameraPreset).toBe('selected');
  expect(canvas.dataset.cameraPose).not.toBe(initial);
  expect(canvas.dataset.focusSites).toBe('B4/B5/A4/C4');
  expect(canvas.dataset.selectedPieceScale).toBe('1.24');
  expect(canvas.dataset.focusMotion).toBe('static');
  expect(onCameraChange).toHaveBeenLastCalledWith('selected');
  expect(onAnimationChange).not.toHaveBeenCalledWith(true);
  draw(); expect(frames.size).toBe(0); expect(fail).not.toHaveBeenCalled();
});

test('manual overview survives pending confirmation and clearing/turn change restores overview', async () => {
  const element = host();
  renderer = await createBattlefield(element, view(), vi.fn(), { onSiteSelect: vi.fn(), onLaneSelect: vi.fn() });
  const canvas = element.querySelector('canvas')!, selected = view(true);
  renderer.update(selected); expect(canvas.dataset.cameraPreset).toBe('selected');
  renderer.reset(); const overview = canvas.dataset.cameraPose;
  renderer.update({ ...selected, interaction: { ...selected.interaction, pendingSite: 'B5' } });
  expect(canvas.dataset.cameraPreset).toBe('full'); expect(canvas.dataset.cameraPose).toBe(overview);
  renderer.setCamera('selected'); expect(canvas.dataset.cameraPreset).toBe('selected');
  renderer.update(view()); expect(canvas.dataset.cameraPreset).toBe('full'); expect(canvas.dataset.cameraPose).toBe(overview);
  renderer.update(selected); renderer.update({ ...selected, playerTurn: 2, interaction: { ...selected.interaction, interactionEnabled: false } });
  expect(canvas.dataset.cameraPreset).toBe('full'); expect(canvas.dataset.cameraPose).toBe(overview);
});

test('touch drag keeps the camera stationary and invalid release safely applies deferred focus', async () => {
  const element = host(), onPieceDrop = vi.fn();
  renderer = await createBattlefield(element, view(), vi.fn(), {
    onSiteSelect: vi.fn(), onLaneSelect: vi.fn(), onPieceDrop,
    onDragStart: () => renderer!.update(view(true)),
  });
  draw(); const canvas = element.querySelector('canvas')!, overview = canvas.dataset.cameraPose!;
  const pose = overview.split('/').map(Number), camera = new PerspectiveCamera(42, 390 / 430, .1, 200);
  camera.position.set(pose[0], pose[1], pose[2]); camera.lookAt(pose[3], pose[4], pose[5]); camera.updateMatrixWorld();
  const p = sitePoint('B4'), projected = new Vector3(p.x, .38, p.z).project(camera);
  const x = (projected.x + 1) * 195, y = (1 - projected.y) * 215;
  const pointer = (type: string, clientX: number, clientY: number) => canvas.dispatchEvent(Object.assign(new MouseEvent(type, { button: 0, clientX, clientY, bubbles: true }), { pointerId: 1, pointerType: 'touch' }));
  pointer('pointerdown', x, y); pointer('pointermove', x + 12, y + 12);
  expect(canvas.dataset.dragging).toBe('B4'); expect(canvas.dataset.selectedSite).toBe('B4');
  expect(canvas.dataset.cameraPose).toBe(overview); expect(canvas.dataset.cameraPreset).toBe('full');
  pointer('pointerup', -50, -50);
  expect(canvas.dataset.dragging).toBeUndefined(); expect(onPieceDrop).not.toHaveBeenCalled();
  expect(canvas.dataset.cameraPreset).toBe('selected'); expect(canvas.dataset.cameraPose).not.toBe(overview);
});

test('legal destination and its confirmation retap keep identical framing and site callbacks', async () => {
  const element = host(), chosen: string[] = [];
  let current = view();
  renderer = await createBattlefield(element, current, vi.fn(), {
    onLaneSelect: vi.fn(),
    onSiteSelect: site => {
      chosen.push(site);
      if (site === 'B4') current = view(true);
      else if (site === 'B5') current = current.interaction.pendingSite
        ? { ...view(), moveCount: 1, playerTurn: 2 }
        : { ...current, interaction: { ...current.interaction, pendingSite: site } };
      renderer!.update(current);
    },
  });
  draw(); const canvas = element.querySelector('canvas')!;
  function tap(site: 'B4' | 'B5') {
    const pose = canvas.dataset.cameraPose!.split('/').map(Number), camera = new PerspectiveCamera(42, 390 / 430, .1, 200);
    camera.position.set(pose[0], pose[1], pose[2]); camera.lookAt(pose[3], pose[4], pose[5]); camera.updateMatrixWorld();
    const p = sitePoint(site), projected = new Vector3(p.x, .1, p.z).project(camera);
    for (const type of ['pointerdown', 'pointerup']) canvas.dispatchEvent(Object.assign(new MouseEvent(type, { button: 0, clientX: (projected.x + 1) * 195, clientY: (1 - projected.y) * 215, bubbles: true }), { pointerId: 1, pointerType: 'touch' }));
    draw();
  }
  tap('B4'); const selectedPose = canvas.dataset.cameraPose;
  expect(canvas.dataset.cameraPreset).toBe('selected');
  tap('B5'); expect(canvas.dataset.pendingSite).toBe('B5'); expect(canvas.dataset.cameraPose).toBe(selectedPose);
  tap('B5'); expect(chosen).toEqual(['B4', 'B5', 'B5']); expect(canvas.dataset.cameraPreset).toBe('full');
});
