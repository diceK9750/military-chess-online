import type { Site } from '../game/types';
import type { BattlefieldInteraction } from './state';

export const SELECTED_PIECE_SCALE = 1.24;

/** Shape and wording distinguish a possible target from the destination awaiting confirmation. */
export function selectionMarker(site: Site, interaction: BattlefieldInteraction, setup = false) {
  if (site === interaction.pendingSite) return {
    kind: 'pending' as const, shape: 'square' as const,
    text: interaction.laneCandidates.length > 1 && !interaction.selectedLane ? '予定' : '再タップ',
  };
  if (site === interaction.selectedSite) return { kind: 'selected' as const, shape: 'ring' as const, text: '選択' };
  return { kind: 'legal' as const, shape: 'ring' as const, text: setup ? '交換' : '移' };
}
