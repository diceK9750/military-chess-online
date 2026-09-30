export type Quality = 'high' | 'standard' | 'light';
export type QualityChoice = 'auto' | Quality;
export const VISUAL_SETTINGS_KEY = 'military-chess:visual-settings:v1';
export interface VisualSettings { readonly quality: QualityChoice; readonly overlay: boolean }
export const qualityProfile = (quality: Quality) => quality === 'high' ? { pixelRatio: 2, particles: 20, confetti: 144, followers: 3 } : quality === 'light' ? { pixelRatio: 1, particles: 6, confetti: 40, followers: 1 } : { pixelRatio: 1.5, particles: 12, confetti: 88, followers: 2 };
export function autoQuality(env: { width: number; dpr: number; memory?: number }): Quality {
  if (env.width < 700 || env.memory !== undefined && env.memory <= 4) return 'light';
  return env.width >= 1400 && env.dpr <= 2 && env.memory !== undefined && env.memory >= 8 ? 'high' : 'standard';
}
export function readVisualSettings(): VisualSettings {
  try { const v=JSON.parse(localStorage.getItem(VISUAL_SETTINGS_KEY)??'null'); if(v && ['auto','high','standard','light'].includes(v.quality) && typeof v.overlay==='boolean')return {quality:v.quality,overlay:v.overlay}; } catch { /* Optional only. */ }
  return {quality:'auto',overlay:false};
}
