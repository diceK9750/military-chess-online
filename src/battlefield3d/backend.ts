import { WebGLRenderer } from 'three';
import type { Camera, Object3D } from 'three';

export interface RenderEngine {
  setPixelRatio(ratio: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: Object3D, camera: Camera): void;
  dispose(): void;
}
export interface RenderBackend { engine: RenderEngine; canvas: HTMLCanvasElement; kind: 'webgpu' | 'webgl2'; dispose(): void }

/** No game data crosses this boundary. A failed GPU attempt uses a fresh WebGL canvas. */
export async function createBackend(onFailure: () => void, forceWebGL = false): Promise<RenderBackend> {
  if (!forceWebGL && 'gpu' in navigator) {
    let gpu: import('three/webgpu').WebGPURenderer | undefined;
    try {
      const capability = navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } };
      if (!await capability.gpu.requestAdapter()) throw new Error('No GPU adapter');
      const { WebGPURenderer } = await import('three/webgpu');
      const canvas = document.createElement('canvas');
      gpu = new WebGPURenderer({ canvas, antialias: true });
      await gpu.init();
      // Three can internally choose GL; keep the established GL renderer in that case.
      if (!(gpu.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend) throw new Error('GPU unavailable');
      let disposed = false;
      gpu.onDeviceLost = () => { if (!disposed) onFailure(); };
      gpu.onError = () => { if (!disposed) onFailure(); };
      return { engine: gpu, canvas, kind: 'webgpu', dispose: () => { disposed = true; gpu!.dispose(); } };
    } catch { try { gpu?.dispose(); } catch { /* Failed initialization owns no usable scene. */ } }
  }
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2', { antialias: true, alpha: false });
  if (!context) throw new Error('WebGL2 unavailable');
  const engine = new WebGLRenderer({ canvas, context, antialias: true });
  return { engine, canvas, kind: 'webgl2', dispose: () => { engine.dispose(); engine.forceContextLoss(); } };
}
