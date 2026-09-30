// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { VictoryCelebration } from './VictoryCelebration';
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
test('celebration stops once, survives rerenders, respects changing reduced motion and cleans up', () => {
  vi.useFakeTimers();
  let change = () => {};
  const remove = vi.fn(), preference = { matches: false, addEventListener: (_: string, f: () => void) => { change = f; }, removeEventListener: remove };
  vi.stubGlobal('matchMedia', () => preference);
  const view = render(<VictoryCelebration />);
  expect(view.container.querySelectorAll('i').length).toBeGreaterThan(0);
  act(() => { preference.matches = true; change(); });
  expect(view.container.querySelectorAll('i')).toHaveLength(0);
  act(() => { preference.matches = false; change(); });
  expect(view.container.querySelectorAll('i').length).toBeGreaterThan(0);
  act(() => vi.advanceTimersByTime(4200));
  view.rerender(<VictoryCelebration />);
  act(() => change());
  expect(view.container.querySelectorAll('i')).toHaveLength(0);
  view.unmount(); expect(remove).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
test('initial reduced motion renders no animated paper', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const view = render(<VictoryCelebration />);
  expect(view.container.querySelectorAll('i')).toHaveLength(0);
});
