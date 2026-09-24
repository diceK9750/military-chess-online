// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { defaultPlacement } from '../dev/fixtures';
import { applyMove, startGame } from '../game/game';
import { legalMoves } from '../game/movement';
import { observeForCpu } from '../cpu/observation';
import { chooseCpuMove } from '../cpu/strategy';
import { advanceSavedMatch, advanceSavedSetup, createSavedMatch, createSavedSetup, loadSavedMatch, loadSavedSetup, MATCH_STORAGE_KEY, SETUP_STORAGE_KEY, storeSavedMatch, storeSavedSetup, validateSavedMatch } from './match';

afterEach(() => localStorage.clear());
const beginning = () => createSavedMatch(startGame(defaultPlacement(1), defaultPlacement(2), 1), 'normal', 9750);
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

test('new game stores full initial and current state, then restores after reload', () => {
  const match = beginning();
  expect(match.game.pieces).toHaveLength(46);
  expect(match.initialPlacements.p1).toHaveLength(23);
  expect(match.initialPlacements.p2).toHaveLength(23);
  expect(storeSavedMatch(match)).toBe(true);
  expect(loadSavedMatch()).toEqual({ kind: 'valid', match });
});

test('setup draft stores difficulty, seed and every legal placement change for resume', () => {
  const pieces = defaultPlacement(1);
  const setup = createSavedSetup(pieces, 'normal', 9750);
  expect(storeSavedSetup(setup)).toBe(true);
  expect(loadSavedSetup()).toEqual({ kind: 'valid', setup });
  const changed = pieces.map(piece => ({ ...piece, position: piece.position === 'B1' ? 'E1' as const : piece.position === 'E1' ? 'B1' as const : piece.position }));
  const next = advanceSavedSetup(setup, changed);
  expect(storeSavedSetup(next)).toBe(true);
  expect(loadSavedSetup()).toEqual({ kind: 'valid', setup: next });
  expect(createSavedMatch(startGame(next.pieces, defaultPlacement(2), 1), next.difficulty, next.cpuSeed, next).localGameId).toBe(setup.localGameId);
});

test('invalid setup draft cannot be resumed', () => {
  localStorage.setItem(SETUP_STORAGE_KEY, '{broken');
  expect(loadSavedSetup()).toEqual({ kind: 'invalid', code: 'INVALID_SAVE' });
});

test('human move, CPU move, and terminal state all persist as replayable commits', () => {
  let match = beginning();
  let game = match.game;
  for (let index = 0; index < 1000 && !game.result; index++) {
    const moves = legalMoves(game.pieces, game.turn!);
    expect(moves.length).toBeGreaterThan(0);
    game = applyMove(game, moves[index % moves.length]);
    match = advanceSavedMatch(match, game);
    expect(storeSavedMatch(match)).toBe(true);
    if (index < 2 || game.result) expect(loadSavedMatch()).toEqual({ kind: 'valid', match });
  }
  expect(game.moveCount).toBeGreaterThan(1);
  expect(game.result).not.toBeNull();
  expect(loadSavedMatch()).toMatchObject({ kind: 'valid', match: { game: { result: game.result, turn: null } } });
});

test('restored CPU sees the same public information and makes the same decision', () => {
  const first = startGame(defaultPlacement(1), defaultPlacement(2), 2);
  const match = createSavedMatch(first, 'normal', 9750);
  storeSavedMatch(match);
  const loaded = loadSavedMatch();
  expect(loaded.kind).toBe('valid');
  if (loaded.kind !== 'valid') return;
  const before = observeForCpu(first, 2);
  const after = observeForCpu(loaded.match.game, loaded.match.cpuSide);
  expect(after).toEqual(before);
  expect(chooseCpuMove(after, 'normal', loaded.match.cpuSeed)).toEqual(chooseCpuMove(before, 'normal', 9750));
  expect(after.pieces.filter(piece => piece.owner === 1).every(piece => !('type' in piece) && !('id' in piece))).toBe(true);
});

test.each([
  ['missing game', (save: any) => { delete save.game; }],
  ['wrong count', (save: any) => { save.initialPlacements.p1.pop(); }],
  ['duplicate id', (save: any) => { save.initialPlacements.p1[1].id = save.initialPlacements.p1[0].id; }],
  ['unknown type', (save: any) => { save.initialPlacements.p1[0].type = 'dragon'; }],
  ['invalid position', (save: any) => { save.game.pieces[0].position = 'Z9'; }],
  ['duplicate position', (save: any) => { save.game.pieces[0].position = save.game.pieces[1].position; }],
  ['inconsistent turn', (save: any) => { save.game.turn = 2; }],
  ['inconsistent result', (save: any) => { save.game.result = { winner: 1, reason: 'HQ_CAPTURE' }; }],
  ['inconsistent history', (save: any) => { save.game.events.pop(); }],
  ['invalid counter', (save: any) => { save.game.noncombatCount = -1; }],
] as const)('rejects %s without destroying existing autosave', (_name, mutate) => {
  const good = beginning();
  storeSavedMatch(good);
  const bad = copy(good);
  mutate(bad);
  expect(() => validateSavedMatch(bad)).toThrow();
  expect(loadSavedMatch()).toEqual({ kind: 'valid', match: good });
});

test('corrupt and unknown-version browser data safely disables resume', () => {
  localStorage.setItem(MATCH_STORAGE_KEY, '{broken');
  expect(loadSavedMatch()).toEqual({ kind: 'invalid', code: 'INVALID_SAVE' });
  const save = copy(beginning());
  (save as { saveFormatVersion: number }).saveFormatVersion = 99;
  localStorage.setItem(MATCH_STORAGE_KEY, JSON.stringify(save));
  expect(loadSavedMatch()).toEqual({ kind: 'invalid', code: 'UNSUPPORTED_SAVE_FORMAT' });
});
