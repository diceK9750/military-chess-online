import { useLayoutEffect, useEffect, useState, type RefObject } from 'react';

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

/** Visual viewport changes do not observe our own layout, so CSS writes cannot form a resize loop. */
export function useVisualViewport(){
 useEffect(()=>{
  const viewport=window.visualViewport,root=document.documentElement;let raf=0;
  const update=()=>{raf=0;const height=viewport?.height??window.innerHeight,top=viewport?.offsetTop??0;
   if(Number.isFinite(height)&&height>0){const value=`${height}px`;if(root.style.getPropertyValue('--app-visual-height')!==value)root.style.setProperty('--app-visual-height',value);}
   const offset=`${Math.max(0,top)}px`;if(root.style.getPropertyValue('--app-visual-top')!==offset)root.style.setProperty('--app-visual-top',offset);
  };
  const schedule=()=>{if(!raf)raf=requestAnimationFrame(update);};update();
  window.addEventListener('resize',schedule);viewport?.addEventListener('resize',schedule);viewport?.addEventListener('scroll',schedule);
  return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',schedule);viewport?.removeEventListener('resize',schedule);viewport?.removeEventListener('scroll',schedule);root.style.removeProperty('--app-visual-height');root.style.removeProperty('--app-visual-top');};
 },[]);
}
export const COMPACT_SCREEN_QUERY='(max-width:600px), (max-width:1000px) and (max-height:500px), (min-width:1001px) and (max-height:800px)';
export function useMobileScreen(){
 const [mobile,setMobile]=useState(()=>window.matchMedia?.(COMPACT_SCREEN_QUERY).matches??false);
 useEffect(()=>{const media=window.matchMedia?.(COMPACT_SCREEN_QUERY);if(!media)return;const update=()=>setMobile(media.matches);update();media.addEventListener?.('change',update);return()=>media.removeEventListener?.('change',update);},[]);
 return mobile;
}
export const SELECTION_ZOOM_KEY='military-chess:selection-zoom:v1';
export function readSelectionZoom(){try{return localStorage.getItem(SELECTION_ZOOM_KEY)!=='false';}catch{return true;}}
