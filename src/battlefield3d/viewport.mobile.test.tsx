// @vitest-environment jsdom
import {act,cleanup,render} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {useVisualViewport} from './viewport';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function Probe(){useVisualViewport();return null;}
test('visual viewport resize and scroll are batched and listeners are removed',()=>{
 const viewport=Object.assign(new EventTarget(),{height:700,offsetTop:0});vi.stubGlobal('visualViewport',viewport);
 let frame:FrameRequestCallback=()=>{};const request=vi.fn((callback:FrameRequestCallback)=>{frame=callback;return 7;});const cancel=vi.fn();vi.stubGlobal('requestAnimationFrame',request);vi.stubGlobal('cancelAnimationFrame',cancel);
 const view=render(<Probe/>),style=document.documentElement.style;expect(style.getPropertyValue('--app-visual-height')).toBe('700px');
 act(()=>{viewport.height=580;viewport.offsetTop=25;viewport.dispatchEvent(new Event('resize'));viewport.dispatchEvent(new Event('scroll'));});expect(request).toHaveBeenCalledTimes(1);
 act(()=>frame(0));expect(style.getPropertyValue('--app-visual-height')).toBe('580px');expect(style.getPropertyValue('--app-visual-top')).toBe('25px');
 act(()=>viewport.dispatchEvent(new Event('resize')));view.unmount();expect(cancel).toHaveBeenCalledWith(7);expect(style.getPropertyValue('--app-visual-height')).toBe('');viewport.dispatchEvent(new Event('resize'));expect(request).toHaveBeenCalledTimes(2);
});
test('unsupported visual viewport uses window height without invalid CSS dimensions',()=>{
 vi.stubGlobal('visualViewport',undefined);render(<Probe/>);expect(document.documentElement.style.getPropertyValue('--app-visual-height')).toBe(`${window.innerHeight}px`);
});
test('invalid visual viewport height keeps the last valid height',()=>{
 const viewport=Object.assign(new EventTarget(),{height:600,offsetTop:0});vi.stubGlobal('visualViewport',viewport);let frame:FrameRequestCallback=()=>{};vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{frame=fn;return 1;});vi.stubGlobal('cancelAnimationFrame',vi.fn());render(<Probe/>);
 act(()=>{viewport.height=NaN;viewport.dispatchEvent(new Event('resize'));frame(0);});expect(document.documentElement.style.getPropertyValue('--app-visual-height')).toBe('600px');
});
