import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';
import {PerspectiveCamera} from 'three';
import {fullCameraDistance} from '../src/battlefield3d/camera';

/** Project against the real preset/automatic fit, never an assumed full view. */
export async function displayedCamera(canvas:Locator,width:number,height:number,top=false){
 await expect(canvas).not.toHaveAttribute('data-camera-fitting','true');
 const c=new PerspectiveCamera(42,width/height,.1,100),pose=(await canvas.getAttribute('data-camera-pose'))?.split('/').map(Number);
 if(pose?.length===6){c.position.set(pose[0],pose[1],pose[2]);c.lookAt(pose[3],pose[4],pose[5]);}
 else{const d=fullCameraDistance(c.aspect,top);c.position.set(0,top?d:d*.86,top?.001:d*.6);c.lookAt(0,.25,0);}
 c.updateMatrixWorld();return c;
}
