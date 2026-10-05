// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { useRef } from 'react';
import { useBattlefieldViewport, viewportBudget } from './viewport';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
test.each([[568,73,495],[844,73,771],[932,80,852],[620,73,547],[280,20,430]])('viewport height %i minus document top %i gives %i', (height,top,expected) => { expect(viewportBudget(height,top)).toBe(expected); });
test('browser-chrome resize budgets the arena while preserving accessibility zoom', () => {
  const viewport=new EventTarget() as EventTarget & {height:number;scale:number}; viewport.height=700;viewport.scale=1;
  vi.stubGlobal('visualViewport',viewport);
  let frame: FrameRequestCallback | null=null;
  vi.stubGlobal('requestAnimationFrame',vi.fn((callback:FrameRequestCallback)=>{frame=callback;return 1;}));
  vi.stubGlobal('cancelAnimationFrame',vi.fn());
  function Arena(){const ref=useRef<HTMLDivElement>(null);useBattlefieldViewport(ref);return <div ref={ref} data-testid="arena"/>;}
  const {getByTestId}=render(<Arena/>);const arena=getByTestId('arena');
  expect(arena.style.getPropertyValue('--battlefield-height')).toBe('700px');
  viewport.height=620;act(()=>{viewport.dispatchEvent(new Event('resize'));frame?.(0);});
  expect(arena.style.getPropertyValue('--battlefield-height')).toBe('620px');
  viewport.scale=2;viewport.height=310;act(()=>{viewport.dispatchEvent(new Event('resize'));frame?.(0);});
  expect(arena.style.getPropertyValue('--battlefield-height')).toBe('620px');
});
