import { afterEach, expect, test, vi } from 'vitest';
import { closeSound, enableSound, playCue } from './sound';
afterEach(()=>{closeSound();vi.unstubAllGlobals();});
test('sound remains inert before an explicit gesture and cannot break play if API is absent',async()=>{const create=vi.fn();vi.stubGlobal('AudioContext',create);playCue('battle');expect(create).not.toHaveBeenCalled();vi.stubGlobal('AudioContext',undefined);expect(await enableSound(true)).toBe(false);expect(()=>playCue('end')).not.toThrow();});
test('all five bounded cues use the unlocked context and OFF suspends it',async()=>{
 const start=vi.fn(),stop=vi.fn(),param={setValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()},suspend=vi.fn();
 vi.stubGlobal('AudioContext',class{state='running';currentTime=0;destination={};resume=async()=>{};suspend=suspend;close=async()=>{};createOscillator=()=>({type:'sine',frequency:param,connect:vi.fn(),start,stop,disconnect:vi.fn()});createGain=()=>({gain:param,connect:vi.fn(),disconnect:vi.fn()});});
 expect(await enableSound(true)).toBe(true);for(const cue of ['select','move','analysis','battle','end'] as const)playCue(cue);expect(start).toHaveBeenCalledTimes(5);expect(stop.mock.calls.every(([time])=>time<=.4)).toBe(true);await enableSound(false);playCue('battle');expect(start).toHaveBeenCalledTimes(5);expect(suspend).toHaveBeenCalled();
});

test('victory fanfare and salute require unlocked sound and finish within three seconds',async()=>{
 const start=vi.fn(),stop=vi.fn(),dispatch=vi.fn(),param={setValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()};
 vi.stubGlobal('window',{dispatchEvent:dispatch});vi.stubGlobal('CustomEvent',class{constructor(public type:string){}});
 vi.stubGlobal('AudioContext',class{state='running';currentTime=0;destination={};resume=async()=>{};suspend=async()=>{};close=async()=>{};createOscillator=()=>({type:'sine',frequency:param,connect:vi.fn(),start,stop,disconnect:vi.fn()});createGain=()=>({gain:param,connect:vi.fn(),disconnect:vi.fn()});});
 const {playVictory}=await import('./sound');playVictory();expect(start).not.toHaveBeenCalled();
 await enableSound(true);playVictory();expect(start).toHaveBeenCalledTimes(7);expect(dispatch).toHaveBeenCalledOnce();expect(stop.mock.calls.every(([time])=>time<3)).toBe(true);
 await enableSound(false);playVictory();expect(start).toHaveBeenCalledTimes(7);
});
