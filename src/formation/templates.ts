import { anchors, rotate, siteAt } from '../game/board';
import { validatePlacement } from '../game/placement';
import type { Piece, PieceType, Player, Site } from '../game/types';
import { seededRandom } from '../cpu/random';

type BackRow = readonly [PieceType, PieceType, PieceType, PieceType, PieceType];
type FullRow = readonly [PieceType, PieceType, PieceType, PieceType, PieceType, PieceType];
type Rows = readonly [BackRow, FullRow, FullRow, FullRow];
type Category = 'balanced' | 'rush' | 'defense' | 'flag-guard';

interface Blueprint { readonly id: string; readonly category: Category; readonly rows: Rows }
export interface FormationTemplate {
  readonly id: string;
  readonly category: Category;
  readonly placements: readonly { readonly site: Site; readonly type: PieceType }[];
}

// Player 1's rear row has one logical HQ instead of separate C1/D1 sites.
const ROW_SITES = [
  ['A1', 'B1', 'HQ-P1', 'E1', 'F1'],
  ['A2', 'B2', 'C2', 'D2', 'E2', 'F2'],
  ['A3', 'B3', 'C3', 'D3', 'E3', 'F3'],
  ['A4', 'B4', 'C4', 'D4', 'E4', 'F4'],
] as const satisfies readonly (readonly Site[])[];

// Original candidates inspired by broad attack/defense ideas, not copied boards.
const BLUEPRINTS = [
  { id: 'balanced', category: 'balanced', rows: [
    ['mine', 'colonel', 'mine', 'lieutenantGeneral', 'spy'],
    ['captain', 'engineer', 'majorGeneral', 'flag', 'lieutenant', 'secondLieutenant'],
    ['general', 'tank', 'aircraft', 'captain', 'lieutenantColonel', 'major'],
    ['cavalry', 'aircraft', 'engineer', 'lieutenant', 'tank', 'secondLieutenant'],
  ] },
  { id: 'rush', category: 'rush', rows: [
    ['mine', 'spy', 'colonel', 'lieutenant', 'mine'],
    ['flag', 'captain', 'secondLieutenant', 'lieutenantGeneral', 'major', 'lieutenant'],
    ['general', 'tank', 'aircraft', 'engineer', 'lieutenantColonel', 'captain'],
    ['majorGeneral', 'tank', 'aircraft', 'engineer', 'secondLieutenant', 'cavalry'],
  ] },
  { id: 'defense', category: 'defense', rows: [
    ['mine', 'general', 'mine', 'lieutenantGeneral', 'colonel'],
    ['flag', 'engineer', 'captain', 'majorGeneral', 'spy', 'secondLieutenant'],
    ['lieutenantColonel', 'tank', 'aircraft', 'major', 'lieutenant', 'captain'],
    ['secondLieutenant', 'engineer', 'cavalry', 'aircraft', 'tank', 'lieutenant'],
  ] },
  { id: 'flag-guard', category: 'flag-guard', rows: [
    ['mine', 'captain', 'general', 'lieutenant', 'mine'],
    ['spy', 'secondLieutenant', 'flag', 'lieutenantGeneral', 'colonel', 'captain'],
    ['majorGeneral', 'engineer', 'tank', 'aircraft', 'lieutenantColonel', 'major'],
    ['secondLieutenant', 'aircraft', 'engineer', 'cavalry', 'tank', 'lieutenant'],
  ] },
] as const satisfies readonly Blueprint[];

function mirror(site: Site): Site {
  const point = anchors(site)[0];
  return siteAt(5 - point.x, point.y)!;
}

function placementsOf(blueprint: Blueprint): FormationTemplate['placements'] {
  return ROW_SITES.flatMap((sites, row) => sites.map((site, column) => ({ site, type: blueprint.rows[row][column] })));
}

export const FORMATION_TEMPLATES: readonly FormationTemplate[] = BLUEPRINTS.flatMap(blueprint => {
  const placements = placementsOf(blueprint);
  return [
    { id: `${blueprint.id}-left`, category: blueprint.category, placements },
    { id: `${blueprint.id}-right`, category: blueprint.category, placements: placements.map(({ site, type }) => ({ site: mirror(site), type })) },
  ];
});

export function materializeFormation(template: FormationTemplate, side: Player, idPrefix = 'formation'): Piece[] {
  return template.placements.map(({ site, type }, index) => ({
    id: `${idPrefix}-${side}-${index}`, owner: side, type, position: side === 1 ? site : rotate(site),
  }));
}

// A malformed candidate fails at module load instead of entering a live game.
for (const template of FORMATION_TEMPLATES) {
  validatePlacement(materializeFormation(template, 1), 1);
  validatePlacement(materializeFormation(template, 2), 2);
}

export function selectFormation(seed: number): FormationTemplate {
  return FORMATION_TEMPLATES[Math.floor(seededRandom(seed)() * FORMATION_TEMPLATES.length)];
}

export function generateFormationPlacement(side: Player, seed: number, idPrefix = 'formation'): Piece[] {
  return materializeFormation(selectFormation(seed), side, idPrefix);
}
