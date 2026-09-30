import { expect, test } from 'vitest';
import { scenario } from '../dev/fixtures';
import { SITES } from '../game/board';
import type { GameState } from '../game/types';
import { BRIDGES, sitePoint, toBattlefieldView, toSetupBattlefieldView } from './state';
import { generateFormationPlacement } from '../formation/templates';

test('setup exposes exactly 23 named own pieces, never enemy pieces or internal IDs', () => {
  const own = generateFormationPlacement(1, 9751, 'human');
  const enemy = generateFormationPlacement(2, 9751, 'cpu');
  const view = toSetupBattlefieldView([...own, ...enemy], 'B1', ['E1']);
  expect(view.phase).toBe('setup');
  expect(view.pieces).toHaveLength(23);
  expect(view.pieces.every(piece => piece.owner === 1 && !piece.unknown && piece.type)).toBe(true);
  [...own, ...enemy].forEach(piece => expect(JSON.stringify(view)).not.toContain(piece.id));
  expect(view).not.toHaveProperty('events');
  expect(view).not.toHaveProperty('turn');
});

test('setup payload is detached and independent of enemy types and array order', () => {
  const own = generateFormationPlacement(1, 9751, 'human');
  const targets = ['E1' as const];
  const view = toSetupBattlefieldView(own, 'B1', targets);
  expect(toSetupBattlefieldView([...own].reverse(), 'B1', targets)).toEqual(view);
  expect(view.interaction.legalTargets).not.toBe(targets);
  view.pieces.forEach(piece => expect(own).not.toContain(piece));
  expect(view.interaction).toMatchObject({ selectedSite: 'B1', legalTargets: ['E1'], pendingSite: null, laneCandidates: [], interactionEnabled: true });
});

test('allowlists own types and conceals every enemy type and internal ID', () => {
  const game = scenario('highFlight');
  const view = toBattlefieldView(game, 1);
  expect(view.pieces.filter(piece => piece.owner === 1)).toContainEqual({ owner: 1, position: 'D5', type: 'aircraft', unknown: false });
  expect(view.pieces.filter(piece => piece.owner === 2)).toEqual([
    { owner: 2, position: 'A7', unknown: true }, { owner: 2, position: 'D7', unknown: true }, { owner: 2, position: 'HQ-P2', unknown: true },
  ]);
  game.pieces.forEach(piece => expect(JSON.stringify(view)).not.toContain(piece.id));
  expect(view).not.toHaveProperty('events');
  expect(view).not.toHaveProperty('turn');
});
test('enemy type, ID and array order cannot affect the render payload', () => {
  const game = scenario('highFlight');
  const changed: GameState = { ...game, pieces: [...game.pieces].reverse().map(piece => piece.owner === 2 ? { ...piece, id: `secret-${piece.id}`, type: 'mine' } : piece) };
  expect(toBattlefieldView(changed, 1)).toEqual(toBattlefieldView(game, 1));
});
test('finished matches reveal types, but never IDs or full state references', () => {
  const game: GameState = { ...scenario('highFlight'), result: { winner: 1, reason: 'HQ_CAPTURE' }, turn: null };
  const view = toBattlefieldView(game, 1);
  expect(view.finished).toBe(true);
  expect(view.pieces.every(piece => !piece.unknown)).toBe(true);
  expect(view.pieces).toContainEqual({ owner: 2, position: 'HQ-P2', unknown: false, type: 'engineer' });
  view.pieces.forEach(piece => expect(piece).not.toHaveProperty('id'));
});
test('viewer 2 has the same information boundary', () => {
  const view = toBattlefieldView(scenario('highFlight'), 2);
  expect(view.pieces.filter(piece => piece.owner === 1).every(piece => piece.unknown)).toBe(true);
  expect(view.pieces.filter(piece => piece.owner === 2).every(piece => !piece.unknown)).toBe(true);
});

test.each([1,2] as const)('HQ territory never determines piece secrecy for viewer %s, even on a restored board',viewer=>{
  const own=viewer,enemy=viewer===1?2:1;
  const game:GameState={...scenario('highFlight'),pieces:[
    {id:'own-HQ',owner:own,type:'general',position:`HQ-P${enemy}`},
    {id:'enemy-HQ',owner:enemy,type:'aircraft',position:`HQ-P${own}`},
  ]};
  for(const restored of [game,JSON.parse(JSON.stringify(game)) as GameState]){
    const view=toBattlefieldView(restored,viewer);
    expect(view.pieces.find(p=>p.owner===own)).toMatchObject({unknown:false,type:'general'});
    expect(view.pieces.find(p=>p.owner===enemy)).toEqual({owner:enemy,position:`HQ-P${own}`,unknown:true});
  }
});
test('interaction is allowlisted, detached, and disabled at game end', () => {
  const interaction = { selectedSite: 'D5' as const, legalTargets: ['D6' as const], pendingSite: null, laneCandidates: ['C' as const, 'D' as const], selectedLane: undefined, interactionEnabled: true, secret: 'not allowed' };
  const view = toBattlefieldView(scenario('highFlight'), 1, interaction);
  expect(view.interaction).not.toHaveProperty('secret');
  expect(view.interaction.legalTargets).not.toBe(interaction.legalTargets);
  expect(view.interaction.laneCandidates).not.toBe(interaction.laneCandidates);
  expect(toBattlefieldView({ ...scenario('highFlight'), result: { winner: 1, reason: 'HQ_CAPTURE' } }, 1, interaction).interaction.interactionEnabled).toBe(false);
});
test('current sites exclude removed pieces and use exactly one HQ occupant', () => {
  const game = scenario('highFlight');
  const view = toBattlefieldView({ ...game, pieces: game.pieces.map(piece => piece.position === 'D7' ? { ...piece, position: null } : piece) }, 1);
  expect(view.pieces).toHaveLength(4);
  expect(view.pieces.filter(piece => piece.position === 'HQ-P2')).toHaveLength(1);
  expect(view.pieces.some(piece => piece.position === 'D7')).toBe(false);
});
test('latest public move copies endpoints, actor and used lane, even after a system event', () => {
  const view = toBattlefieldView({ ...scenario('highFlight'), moveCount: 1, events: [
    { kind: 'MOVE', actor: 1, move: { from: 'HQ-P1', to: 'HQ-P2', lane: 'C' }, moveNumber: 1, battle: 'ATTACKER' },
    { kind: 'AUTO_PASS', actor: 2 },
  ] }, 1);
  expect(view.lastMove).toEqual({ from: 'HQ-P1', to: 'HQ-P2', actor: 1, lane: 'C' });
  expect(view.moveCount).toBe(1);
});
test.each(SITES)('%s has the canonical board position, with merged HQ centered', site => {
  const point = sitePoint(site);
  if (site.startsWith('HQ')) expect(point).toEqual({ x: 0, z: site === 'HQ-P1' ? 3.5 : -3.5 });
  else expect(point).toEqual({ x: 'ABCDEF'.indexOf(site[0]) - 2.5, z: 4.5 - Number(site[1]) });
});
test('46 unique centers and exactly two bridges; P1 is toward the camera +Z', () => {
  expect(new Set(SITES.map(site => JSON.stringify(sitePoint(site)))).size).toBe(46);
  expect(BRIDGES).toEqual([{ from: 'B4', to: 'B5' }, { from: 'E4', to: 'E5' }]);
  for (const bridge of BRIDGES) {
    expect(sitePoint(bridge.from)).toEqual({ x: bridge.from[0] === 'B' ? -1.5 : 1.5, z: 0.5 });
    expect(sitePoint(bridge.to)).toEqual({ x: sitePoint(bridge.from).x, z: -0.5 });
  }
  expect(sitePoint('A1').z).toBeGreaterThan(sitePoint('A8').z);
});

test('last moving own piece remains named after its removal and a save round trip', () => {
  const initial = scenario('highFlight');
  const game: GameState = { ...initial, moveCount: 1, pieces: initial.pieces.map(p => p.position === 'D5' ? { ...p, position: null } : p), events: [{ kind: 'MOVE', actor: 1, move: { from: 'D5', to: 'HQ-P2' }, moveNumber: 1, battle: 'DEFENDER' }] };
  for (const restored of [game, JSON.parse(JSON.stringify(game)) as GameState]) {
    const view = toBattlefieldView(restored, 1, undefined, undefined, initial.pieces);
    expect(view.lastMove).toEqual({ from: 'D5', to: 'HQ-P2', actor: 1, type: 'aircraft' });
    initial.pieces.forEach(p => expect(JSON.stringify(view)).not.toContain(p.id));
  }
});
test('CPU last mover never discloses enemy type before termination, even with complete initial placements', () => {
  const initial = scenario('highFlight');
  const game: GameState = { ...initial, moveCount: 1, events: [{ kind: 'MOVE', actor: 2, move: { from: 'A7', to: 'A6' }, moveNumber: 1, battle: null }], pieces: initial.pieces.map(p => p.position === 'A7' ? { ...p, position: 'A6' } : p) };
  const view = toBattlefieldView(game, 1, undefined, undefined, initial.pieces);
  expect(view.lastMove).toEqual({ from: 'A7', to: 'A6', actor: 2 });
  const changed = initial.pieces.map(p => p.owner === 2 ? { ...p, type: 'mine' as const, id: 'hidden-'+p.id } : p);
  expect(toBattlefieldView({ ...game, pieces: game.pieces.map(p => p.owner === 2 ? { ...p, type: 'mine', id: 'changed' } : p) }, 1, undefined, undefined, changed)).toEqual(view);
  const finished = toBattlefieldView({ ...game, result: { winner: null, reason: 'FIFTY_NONCOMBAT_MOVES' }, turn: null }, 1, undefined, undefined, initial.pieces);
  expect(finished.lastMove).toHaveProperty('type', initial.pieces.find(p => p.position === 'A7')!.type);
  expect(finished.result).toEqual({ winner: null, reason: 'FIFTY_NONCOMBAT_MOVES' });
});
