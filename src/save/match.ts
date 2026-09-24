import { applyMove, startGame, validateState } from '../game/game';
import { validatePlacement } from '../game/placement';
import { RULESET_VERSION } from '../game/pieces';
import type { GameState, Piece } from '../game/types';
import type { Difficulty } from '../cpu/strategy';

export const SAVE_FORMAT_VERSION = 1;
export const MATCH_STORAGE_KEY = 'military-chess:cpu-match:v1';
export const SETUP_STORAGE_KEY = 'military-chess:cpu-setup:v1';
export const MAX_SAVE_TEXT_LENGTH = 8 * 1024 * 1024;
const byteLength = (text: string) => new TextEncoder().encode(text).byteLength;

export interface SavedCpuMatch {
  readonly saveFormatVersion: typeof SAVE_FORMAT_VERSION;
  readonly rulesetVersion: string;
  readonly localGameId: string;
  readonly createdAt: string;
  readonly savedAt: string;
  readonly difficulty: Difficulty;
  readonly humanSide: 1;
  readonly cpuSide: 2;
  readonly cpuSeed: number;
  readonly stateVersion: number;
  readonly initialPlacements: { readonly p1: readonly Piece[]; readonly p2: readonly Piece[] };
  readonly game: GameState;
}

export interface SavedCpuSetup {
  readonly saveFormatVersion: typeof SAVE_FORMAT_VERSION;
  readonly status: 'SETUP';
  readonly localGameId: string;
  readonly createdAt: string;
  readonly savedAt: string;
  readonly difficulty: Difficulty;
  readonly cpuSeed: number;
  readonly pieces: readonly Piece[];
}

export class SaveError extends Error {
  constructor(public readonly code: 'INVALID_SAVE' | 'UNSUPPORTED_SAVE_FORMAT' | 'UNSUPPORTED_RULESET') {
    super(code);
    this.name = 'SaveError';
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}
function validTime(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return false;
  try { return new Date(value).toISOString() === value; }
  catch { return false; }
}
function sameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((entry, index) => sameData(entry, b[index]));
  if (!record(a) || !record(b)) return false;
  const keys = Object.keys(a).sort();
  return exactKeys(b, keys) && keys.every(key => sameData(a[key], b[key]));
}

/** Replays every accepted move through the canonical rules and compares all resulting state and events. */
export function validateSavedMatch(value: unknown): SavedCpuMatch {
  if (!record(value)) throw new SaveError('INVALID_SAVE');
  if (value.saveFormatVersion !== SAVE_FORMAT_VERSION) throw new SaveError('UNSUPPORTED_SAVE_FORMAT');
  if (!exactKeys(value, ['saveFormatVersion', 'rulesetVersion', 'localGameId', 'createdAt', 'savedAt', 'difficulty', 'humanSide', 'cpuSide', 'cpuSeed', 'stateVersion', 'initialPlacements', 'game'])) throw new SaveError('INVALID_SAVE');
  if (value.rulesetVersion !== RULESET_VERSION) throw new SaveError('UNSUPPORTED_RULESET');
  if (typeof value.localGameId !== 'string' || !/^[0-9a-f]{32}$/.test(value.localGameId) || !validTime(value.createdAt) || !validTime(value.savedAt)) throw new SaveError('INVALID_SAVE');
  if (Date.parse(value.savedAt) < Date.parse(value.createdAt)) throw new SaveError('INVALID_SAVE');
  if (!['easy', 'normal'].includes(value.difficulty as string) || value.humanSide !== 1 || value.cpuSide !== 2) throw new SaveError('INVALID_SAVE');
  if (!Number.isSafeInteger(value.cpuSeed) || (value.cpuSeed as number) < 0 || (value.cpuSeed as number) > 0xffffffff || !Number.isSafeInteger(value.stateVersion) || (value.stateVersion as number) < 1) throw new SaveError('INVALID_SAVE');
  if (!record(value.initialPlacements) || !exactKeys(value.initialPlacements, ['p1', 'p2']) || !Array.isArray(value.initialPlacements.p1) || !Array.isArray(value.initialPlacements.p2)) throw new SaveError('INVALID_SAVE');
  if (!record(value.game) || !Array.isArray(value.game.events) || !Number.isSafeInteger(value.game.firstPlayer)) throw new SaveError('INVALID_SAVE');
  try {
    for (const side of [1, 2] as const) {
      const pieces = value.initialPlacements[side === 1 ? 'p1' : 'p2'] as unknown[];
      if (pieces.some(piece => !record(piece) || !exactKeys(piece, ['id', 'owner', 'type', 'position']))) throw new SaveError('INVALID_SAVE');
      validatePlacement(pieces as Piece[], side);
    }
    const game = value.game as unknown as GameState;
    validateState(game);
    if ((value.stateVersion as number) < game.moveCount + 1) throw new SaveError('INVALID_SAVE');
    let replay = startGame(value.initialPlacements.p1 as Piece[], value.initialPlacements.p2 as Piece[], game.firstPlayer);
    const replayEvents = [...replay.events];
    for (const event of game.events) if (record(event) && event.kind === 'MOVE') {
      const step = applyMove({ ...replay, events: [] }, event.move);
      replayEvents.push(...step.events);
      replay = { ...step, events: [] };
    }
    if (!sameData({ ...replay, events: replayEvents }, game)) throw new SaveError('INVALID_SAVE');
  } catch (error) {
    if (error instanceof SaveError) throw error;
    throw new SaveError('INVALID_SAVE');
  }
  return value as unknown as SavedCpuMatch;
}

function newId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createSavedMatch(game: GameState, difficulty: Difficulty, cpuSeed: number, setup?: SavedCpuSetup): SavedCpuMatch {
  if (setup) {
    validateSavedSetup(setup);
    if (setup.difficulty !== difficulty || setup.cpuSeed !== cpuSeed || !sameData(setup.pieces, game.pieces.filter(piece => piece.owner === 1))) throw new SaveError('INVALID_SAVE');
  }
  const now = new Date().toISOString();
  return validateSavedMatch({
    saveFormatVersion: SAVE_FORMAT_VERSION,
    rulesetVersion: RULESET_VERSION,
    localGameId: setup?.localGameId ?? newId(), createdAt: setup?.createdAt ?? now, savedAt: now, difficulty,
    humanSide: 1, cpuSide: 2, cpuSeed, stateVersion: 1,
    initialPlacements: {
      p1: game.pieces.filter(piece => piece.owner === 1).map(piece => ({ ...piece })),
      p2: game.pieces.filter(piece => piece.owner === 2).map(piece => ({ ...piece })),
    },
    game,
  });
}

export function advanceSavedMatch(match: SavedCpuMatch, game: GameState): SavedCpuMatch {
  return { ...match, game, savedAt: new Date().toISOString(), stateVersion: match.stateVersion + 1 };
}

export type LoadResult = { kind: 'empty' } | { kind: 'valid'; match: SavedCpuMatch } | { kind: 'invalid'; code: SaveError['code'] };

export function loadSavedMatch(): LoadResult {
  try {
    const raw = localStorage.getItem(MATCH_STORAGE_KEY);
    if (raw === null) return { kind: 'empty' };
    if (byteLength(raw) > MAX_SAVE_TEXT_LENGTH) return { kind: 'invalid', code: 'INVALID_SAVE' };
    return { kind: 'valid', match: validateSavedMatch(JSON.parse(raw)) };
  } catch (error) {
    return { kind: 'invalid', code: error instanceof SaveError ? error.code : 'INVALID_SAVE' };
  }
}

/** Only call after a complete rules transition; never persist in-progress UI selections. */
export function storeSavedMatch(match: SavedCpuMatch): boolean {
  try {
    const raw = JSON.stringify(match);
    if (byteLength(raw) > MAX_SAVE_TEXT_LENGTH) return false;
    localStorage.setItem(MATCH_STORAGE_KEY, raw);
    return true;
  } catch { return false; }
}

export function clearSavedMatch(): boolean {
  try { localStorage.removeItem(MATCH_STORAGE_KEY); return true; }
  catch { return false; }
}

export function validateSavedSetup(value: unknown): SavedCpuSetup {
  if (!record(value)) throw new SaveError('INVALID_SAVE');
  if (value.saveFormatVersion !== SAVE_FORMAT_VERSION) throw new SaveError('UNSUPPORTED_SAVE_FORMAT');
  if (!exactKeys(value, ['saveFormatVersion', 'status', 'localGameId', 'createdAt', 'savedAt', 'difficulty', 'cpuSeed', 'pieces'])) throw new SaveError('INVALID_SAVE');
  if (value.status !== 'SETUP' || typeof value.localGameId !== 'string' || !/^[0-9a-f]{32}$/.test(value.localGameId) || !validTime(value.createdAt) || !validTime(value.savedAt)) throw new SaveError('INVALID_SAVE');
  if (Date.parse(value.savedAt) < Date.parse(value.createdAt) || !['easy', 'normal'].includes(value.difficulty as string) || !Number.isSafeInteger(value.cpuSeed) || (value.cpuSeed as number) < 0 || (value.cpuSeed as number) > 0xffffffff || !Array.isArray(value.pieces)) throw new SaveError('INVALID_SAVE');
  try {
    if (value.pieces.some(piece => !record(piece) || !exactKeys(piece, ['id', 'owner', 'type', 'position']))) throw new SaveError('INVALID_SAVE');
    validatePlacement(value.pieces as Piece[], 1);
  } catch (error) {
    if (error instanceof SaveError) throw error;
    throw new SaveError('INVALID_SAVE');
  }
  return value as unknown as SavedCpuSetup;
}

export function createSavedSetup(pieces: readonly Piece[], difficulty: Difficulty, cpuSeed: number): SavedCpuSetup {
  const now = new Date().toISOString();
  return validateSavedSetup({ saveFormatVersion: SAVE_FORMAT_VERSION, status: 'SETUP', localGameId: newId(), createdAt: now, savedAt: now, difficulty, cpuSeed, pieces: pieces.map(piece => ({ ...piece })) });
}

export function advanceSavedSetup(setup: SavedCpuSetup, pieces: readonly Piece[]): SavedCpuSetup {
  return validateSavedSetup({ ...setup, pieces: pieces.map(piece => ({ ...piece })), savedAt: new Date().toISOString() });
}

export type SetupLoadResult = { kind: 'empty' } | { kind: 'valid'; setup: SavedCpuSetup } | { kind: 'invalid'; code: SaveError['code'] };
export function loadSavedSetup(): SetupLoadResult {
  try {
    const raw = localStorage.getItem(SETUP_STORAGE_KEY);
    if (raw === null) return { kind: 'empty' };
    if (byteLength(raw) > MAX_SAVE_TEXT_LENGTH) return { kind: 'invalid', code: 'INVALID_SAVE' };
    return { kind: 'valid', setup: validateSavedSetup(JSON.parse(raw)) };
  } catch (error) { return { kind: 'invalid', code: error instanceof SaveError ? error.code : 'INVALID_SAVE' }; }
}
export function storeSavedSetup(setup: SavedCpuSetup): boolean {
  try {
    const raw = JSON.stringify(setup);
    if (byteLength(raw) > MAX_SAVE_TEXT_LENGTH) return false;
    localStorage.setItem(SETUP_STORAGE_KEY, raw);
    return true;
  } catch { return false; }
}
export function clearSavedSetup(): boolean {
  try { localStorage.removeItem(SETUP_STORAGE_KEY); return true; }
  catch { return false; }
}
