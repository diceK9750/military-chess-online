import { PerspectiveCamera, Vector3 } from 'three';

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
