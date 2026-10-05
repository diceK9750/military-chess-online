import { useLayoutEffect, type RefObject } from 'react';

/** Document-space top stays stable when a finger scrolls; browser chrome changes the available height. */
export function viewportBudget(height: number, top: number): number {
  return Math.max(430, Math.round(height - Math.max(0, top)));
}
export function useBattlefieldViewport(ref: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const viewport = window.visualViewport;
      // Do not counteract accessibility pinch zoom or the OS magnifier.
      if (viewport && viewport.scale !== 1) return;
      const top = element.getBoundingClientRect().top + window.scrollY;
      element.style.setProperty('--battlefield-height', `${viewportBudget(viewport?.height ?? window.innerHeight, top)}px`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    const shell = element.closest('.app-shell');
    if (shell) observer?.observe(shell);
    return () => { window.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('resize', schedule); observer?.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, [ref]);
}
