import { expect, test } from 'vitest';
import { applyMove, startGame } from '../game/game';
import { defaultPlacement } from '../dev/fixtures';
import { chooseCpuMove } from '../cpu/strategy';
import { observeForCpu } from '../cpu/observation';
import { chronicleFrames } from './chronicle';
import { chronicleDelay, chronicleStory } from './chronicleStory';
import { PIECES } from '../game/pieces';

const initial = { p1: defaultPlacement(1), p2: defaultPlacement(2) };
let game = startGame(initial.p1, initial.p2, 1);
for (let i = 0; i < 1000 && !game.result; i++) game = applyMove(game, chooseCpuMove(observeForCpu(game, game.turn!), 'normal', 9750 + i)!);
const frames = chronicleFrames(game, initial);
test('fast replay completes motion and battle effects; important commentary gets extra dwell', () => {
  const ordinary = { title: '', text: '', move: '', kinds: [] };
  expect(chronicleDelay(ordinary, 2, true, false)).toBeGreaterThan(510);
  expect(chronicleDelay(ordinary, 2, true, true)).toBeGreaterThan(800);
  expect(chronicleDelay({ ...ordinary, kinds: ['contact'] }, 1, true, true)).toBe(2500);
  expect(chronicleDelay({ ...ordinary, kinds: ['opening'] }, 2, false, false)).toBe(500);
  expect(chronicleDelay(ordinary, .5, true, false)).toBe(2000);
});
test('no commentary or full-type story for unfinished games', () => {
  expect(() => chronicleStory([])).toThrow('REPLAY_NOT_FINISHED');
  expect(() => chronicleStory(frames.slice(0, -1))).toThrow('REPLAY_NOT_FINISHED');
});
test('every scene identifies the actual mover, route and battle without mutating or copying IDs', () => {
  const before = JSON.stringify(frames), story = chronicleStory(frames);
  expect(story.scenes).toHaveLength(frames.length);
  for (let i = 1; i < frames.length; i++) {
    const event = frames[i].events.filter(e => e.kind === 'MOVE').at(-1)!;
    const mover = frames[i - 1].pieces.find(p => p.position === event.move.from)!;
    expect(story.scenes[i].move).toContain(`${PIECES[mover.type].label} ${event.move.from} → ${event.move.to}`);
    if (event.battle) expect(story.scenes[i].text).toContain({ ATTACKER: '攻撃側勝利', DEFENDER: '防御側勝利', MUTUAL: '相打ち' }[event.battle]);
  }
  expect(JSON.stringify(frames)).toBe(before);
  expect(JSON.stringify(story)).not.toContain('"id"');
  expect(chronicleStory(frames)).toEqual(story);
});
test('chapter markers cover actual turning points and final summary; no invented decisive victory in draw', () => {
  const story = chronicleStory(frames), kinds = story.scenes.flatMap(s => s.kinds);
  for (const kind of ['opening', 'contact', 'breakthrough', 'pressure', 'loss', 'decisive', 'summary']) expect(kinds).toContain(kind);
  const first = game.events.find(e => e.kind === 'MOVE' && e.battle)!;
  expect(story.chapters.find(c => c.title === '初接触')?.index).toBe(first.kind === 'MOVE' ? first.moveNumber : -1);
  expect(story.scenes.at(-1)?.text).toContain(`全${game.moveCount}手`);
  const draw = chronicleStory([...frames.slice(0, -1), { ...game, result: { winner: null, reason: 'FIFTY_NONCOMBAT_MOVES' } }]);
  expect(draw.scenes.at(-1)?.kinds).not.toContain('decisive');
  expect(draw.scenes.at(-1)?.text).toContain('非戦闘50手により引き分け');
});
