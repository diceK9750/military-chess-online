// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { createBackend } from './backend';
import { identity } from './identity';
import { PIECE_TYPES } from '../game/pieces';
const mock = vi.hoisted(() => ({ gl: vi.fn(), gpu: vi.fn(), init: vi.fn(), dispose: vi.fn(), force: vi.fn() }));
vi.mock('three', () => ({ WebGLRenderer: class { dispose = mock.dispose; forceContextLoss = mock.force; constructor() { mock.gl(); } } }));
vi.mock('three/webgpu', () => ({ WebGPURenderer: class { backend = { isWebGPUBackend: true }; init = mock.init; dispose = mock.dispose; constructor() { mock.gpu(); } } }));
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); Reflect.deleteProperty(navigator, 'gpu'); });
function gl() { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as WebGL2RenderingContext); }
test('WebGPU initializes before use and is preferred', async () => {
  Object.defineProperty(navigator, 'gpu', { value: { requestAdapter: async () => ({}) }, configurable: true });
  const backend = await createBackend(vi.fn()); expect(backend.kind).toBe('webgpu'); expect(mock.init).toHaveBeenCalledOnce(); expect(mock.gl).not.toHaveBeenCalled(); backend.dispose();
});
test('missing GPU uses established WebGL2', async () => { gl(); expect((await createBackend(vi.fn())).kind).toBe('webgl2'); expect(mock.gpu).not.toHaveBeenCalled(); });
test('failed GPU initialization falls back using a new GL canvas', async () => {
  gl(); Object.defineProperty(navigator, 'gpu', { value: { requestAdapter: async () => ({}) }, configurable: true }); mock.init.mockRejectedValueOnce(new Error('device failed'));
  expect((await createBackend(vi.fn())).kind).toBe('webgl2'); expect(mock.dispose).toHaveBeenCalledOnce(); expect(mock.gl).toHaveBeenCalledOnce();
});
test('forced GL retry skips GPU and fails only if GL is also unavailable', async () => {
  Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true }); vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  await expect(createBackend(vi.fn(), true)).rejects.toThrow('WebGL2 unavailable'); expect(mock.gpu).not.toHaveBeenCalled();
});
test('every hidden enemy has the same silhouette even when malicious type fields differ', () => {
  const hidden = { owner: 2 as const, position: 'B5' as const, unknown: true as const };
  for (const type of PIECE_TYPES) { const altered = { ...hidden, type }; expect(identity(altered)).toEqual({ rank: 0, equipment: 'soldier' }); }
  expect(new Set(PIECE_TYPES.map(type => JSON.stringify(identity({ owner: 1, position: 'B1', unknown: false, type })))).size).toBe(16);
});
