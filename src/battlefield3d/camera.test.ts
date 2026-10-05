import { expect, test } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { SITES, territory } from '../game/board';
import type { Site } from '../game/types';
import { fullCameraDistance, selectionCameraFrame, selectionCameraUpdate } from './camera';
import { SELECTED_PIECE_SCALE, selectionMarker } from './selectionPresentation';
import { sitePoint, type BattlefieldViewState } from './state';

function view(selected: Site | null, legalTargets: Site[] = ['B5']): BattlefieldViewState {
  return {
    viewer: 1, playerTurn: 1, moveCount: 0, finished: false, battleSite: null, lastMove: null,
    pieces: [{ owner: 1, position: 'B4', unknown: false, type: 'general' }, { owner: 1, position: 'E4', unknown: false, type: 'engineer' }, { owner: 2, position: 'F6', unknown: true }],
    interaction: { selectedSite: selected, legalTargets, pendingSite: null, laneCandidates: [], selectedLane: undefined, interactionEnabled: true },
  };
}

test.each([.38, .55, .8, 1, 1.8, 3])('selection and every legal footprint stay in frame at aspect %s', aspect => {
  for (const viewer of [1, 2] as const) for (const [selected, targets] of [
    ['A1', ['A2', 'B1']], ['F8', ['F7', 'E8']], ['B4', ['B5', 'A4', 'C4']],
    ['HQ-P1', ['HQ-P2', 'C2', 'D2', 'C7', 'D7']], ['D5', ['D2', 'D3', 'D4', 'D6', 'D7']],
    ['B1', territory(viewer)], ['A1', SITES],
  ] as const) {
    const frame = selectionCameraFrame(aspect, viewer, selected, targets);
    const camera = new PerspectiveCamera(42, aspect, .1, 200);
    camera.position.set(...frame.position); camera.lookAt(...frame.target); camera.updateMatrixWorld();
    for (const site of frame.sites) {
      const point = sitePoint(site), halfWidth = site.startsWith('HQ') ? 1.08 : site === selected ? .78 : .64;
      for (const dx of [-halfWidth, halfWidth]) for (const dz of [-.65, .65]) for (const y of [0, site === selected ? 2.2 : 1.8]) {
        const projected = new Vector3(point.x + dx, y, point.z + dz).project(camera);
        expect(Math.abs(projected.x), `${viewer} ${selected} ${site} horizontal`).toBeLessThanOrEqual(.890001);
        expect(Math.abs(projected.y), `${viewer} ${selected} ${site} vertical`).toBeLessThanOrEqual(.840001);
        expect(projected.z).toBeGreaterThan(-1); expect(projected.z).toBeLessThan(1);
      }
    }
  }
});

test.each([1, 2] as const)('focus retains own-side approach and minimum board context for viewer %s', viewer => {
  const frame = selectionCameraFrame(.7, viewer, 'F8', []);
  expect((frame.position[2] - frame.target[2]) * (viewer === 1 ? 1 : -1)).toBeGreaterThan(0);
  expect(frame.position[0]).toBe(frame.target[0]);
  expect(frame.bounds.maxX - frame.bounds.minX).toBeGreaterThanOrEqual(3.14999);
  expect(frame.bounds.maxZ - frame.bounds.minZ).toBeGreaterThanOrEqual(3.14999);
  expect(frame.bounds.maxX).toBeLessThanOrEqual(3.650001); expect(frame.bounds.minZ).toBeGreaterThanOrEqual(-4.700001);
});

test.each([.55, 1, 1.8])('local legal region and selected silhouette are visibly enlarged at aspect %s', aspect => {
  const frame = selectionCameraFrame(aspect, 1, 'B4', ['B5', 'A4', 'C4']);
  const focused = new PerspectiveCamera(42, aspect, .1, 200); focused.position.set(...frame.position); focused.lookAt(...frame.target); focused.updateMatrixWorld();
  const full = new PerspectiveCamera(42, aspect, .1, 200), distance = fullCameraDistance(aspect);
  full.position.set(0, distance * .86, distance * .6); full.lookAt(0, .25, 0); full.updateMatrixWorld();
  const p = sitePoint('B4');
  const height = (camera: PerspectiveCamera) => new Vector3(p.x, 1.2, p.z).project(camera).distanceTo(new Vector3(p.x, .1, p.z).project(camera));
  expect(height(focused) / height(full)).toBeGreaterThan(1.3);
  expect(SELECTED_PIECE_SCALE).toBeGreaterThan(1.2);
});

test('pending destination is included without duplicating a legal target or mutating inputs', () => {
  const targets: Site[] = ['B5', 'B5'];
  const frame = selectionCameraFrame(1, 1, 'B4', targets, 'HQ-P2');
  expect(frame.sites).toEqual(['B4', 'B5', 'HQ-P2']); expect(targets).toEqual(['B5', 'B5']);
  expect(selectionCameraFrame(1, 1, 'B4', targets, 'B5')).toEqual(selectionCameraFrame(1, 1, 'B4', targets));
});

test('automatic focus starts on selection, preserves manual overview, and follows a new own selection', () => {
  const idle = view(null), selected = view('B4');
  expect(selectionCameraUpdate(idle, selected, 'full')).toBe('selected');
  expect(selectionCameraUpdate(null, selected, 'full')).toBe('selected');
  expect(selectionCameraUpdate(selected, selected, 'full')).toBeNull();
  const pending = { ...selected, interaction: { ...selected.interaction, pendingSite: 'B5' as const } };
  expect(selectionCameraUpdate(selected, pending, 'full')).toBeNull();
  expect(selectionCameraUpdate(selected, pending, 'selected')).toBe('selected');
  expect(selectionCameraUpdate(pending, view('E4'), 'full')).toBe('selected');
});

test('clear, cancel, move, turn switch, lost interaction, and game end restore overview', () => {
  const selected = view('B4');
  const changes: BattlefieldViewState[] = [view(null), { ...selected, moveCount: 1 }, { ...selected, playerTurn: 2 }, { ...selected, viewer: 2 }, { ...selected, finished: true }, { ...selected, interaction: { ...selected.interaction, interactionEnabled: false } }];
  for (const next of changes) expect(selectionCameraUpdate(selected, next, 'selected')).toBe('full');
  expect(selectionCameraUpdate(selected, view(null), 'enemy')).toBe('full');
});

test('dragging, replay, and hidden enemy selection never trigger auto-focus', () => {
  const idle = view(null), selected = view('B4');
  expect(selectionCameraUpdate(idle, selected, 'full', true)).toBeNull();
  expect(selectionCameraUpdate(idle, { ...selected, phase: 'replay' }, 'full')).toBeNull();
  expect(selectionCameraUpdate(idle, view('F6'), 'full')).toBeNull();
  expect(selectionCameraUpdate(idle, { ...selected, interaction: { ...selected.interaction, interactionEnabled: false } }, 'full')).toBeNull();
});

test('legal, selected, and pending markers have independent shapes and explicit wording', () => {
  const interaction = { ...view('B4').interaction, pendingSite: 'B5' as const };
  expect(selectionMarker('A4', interaction)).toEqual({ kind: 'legal', shape: 'ring', text: '移' });
  expect(selectionMarker('A4', interaction, true).text).toBe('交換');
  expect(selectionMarker('B4', interaction)).toEqual({ kind: 'selected', shape: 'ring', text: '選択' });
  expect(selectionMarker('B5', interaction)).toEqual({ kind: 'pending', shape: 'square', text: '再タップ' });
  expect(selectionMarker('B5', { ...interaction, laneCandidates: ['C', 'D'] }).text).toBe('予定');
  expect(selectionMarker('B5', { ...interaction, laneCandidates: ['C', 'D'], selectedLane: 'C' }).text).toBe('再タップ');
});
