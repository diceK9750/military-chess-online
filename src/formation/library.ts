import { isSite } from '../game/board';
import { validatePlacement } from '../game/placement';
import { PIECE_TYPES } from '../game/pieces';
import type { Piece, PieceType, Site } from '../game/types';

export const FORMATION_LIBRARY_KEY = 'military-chess:formation-library:v1';
export const FORMATION_LIMIT = 24;
export const FORMATION_NAME_LIMIT = 40;
export interface FormationPreset {
  readonly version: 1; readonly id: string; readonly name: string; readonly favorite: boolean;
  readonly createdAt: string; readonly updatedAt: string;
  readonly placements: readonly { readonly site: Site; readonly type: PieceType }[];
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: readonly string[]) => Object.keys(v).sort().join() === [...expected].sort().join();
const validDate = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
export function formationName(name: string): string {
  const value = name.trim();
  if (!value || [...value].length > FORMATION_NAME_LIMIT || /[\u0000-\u001f]/.test(value)) throw new Error('名前は1〜40文字で入力してください。');
  return value;
}
/** Own placement only; new game piece IDs are generated and never persisted in the library. */
export function materializePreset(preset: FormationPreset): Piece[] {
  const prefix = crypto.randomUUID();
  const pieces = preset.placements.map((p, i) => ({ id: `human-${prefix}-${i}`, owner: 1 as const, type: p.type, position: p.site }));
  validatePlacement(pieces, 1); return pieces;
}
export function validateLibrary(value: unknown): readonly FormationPreset[] {
  if (!Array.isArray(value) || value.length > FORMATION_LIMIT) throw new Error('陣形ライブラリを読み込めません。');
  const ids = new Set<string>();
  for (const p of value) {
    if (!record(p) || !keys(p, ['version','id','name','favorite','createdAt','updatedAt','placements']) || p.version !== 1 || typeof p.id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(p.id) || ids.has(p.id) || typeof p.name !== 'string' || formationName(p.name) !== p.name || typeof p.favorite !== 'boolean' || !validDate(p.createdAt) || !validDate(p.updatedAt) || p.updatedAt < p.createdAt || !Array.isArray(p.placements)) throw new Error('陣形ライブラリのデータが不正です。');
    ids.add(p.id);
    if (p.placements.some(a => !record(a) || !keys(a, ['site','type']) || !isSite(a.site) || !PIECE_TYPES.includes(a.type as PieceType))) throw new Error('陣形の配置が不正です。');
    materializePreset(p as unknown as FormationPreset);
  }
  return value as FormationPreset[];
}
export function readLibrary(storage: Pick<Storage,'getItem'> = localStorage): readonly FormationPreset[] {
  const text = storage.getItem(FORMATION_LIBRARY_KEY);
  if (text && text.length > 150_000) throw new Error('陣形ライブラリが大きすぎます。');
  return validateLibrary(text ? JSON.parse(text) : []);
}
export function writeLibrary(presets: readonly FormationPreset[], storage: Pick<Storage,'setItem'> = localStorage): void {
  validateLibrary(presets); storage.setItem(FORMATION_LIBRARY_KEY, JSON.stringify(presets));
}
export function createPreset(pieces: readonly Piece[], name: string): FormationPreset {
  validatePlacement(pieces, 1);
  if (pieces.some(p => p.owner !== 1)) throw new Error('自軍の陣形だけを保存できます。');
  const now = new Date().toISOString();
  return { version: 1, id: crypto.randomUUID(), name: formationName(name), favorite: false, createdAt: now, updatedAt: now,
    placements: pieces.map(p => ({ site: p.position!, type: p.type })) };
}
