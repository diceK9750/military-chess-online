// Generated from the anime-board-v1 sprite build. Frame durations in ms; atlas cells are 256px, 4 per row.
// `half` is the body's half-width; `top`/`foot` are the figure's highest pixel and the pedestal's bottom edge as fractions of the cell height (0 = top, 1 = bottom).
export const SPRITE_SHEETS = {
  'lieutenant-general': { half: 0.266, top: 0.020, rows: 3, foot: 0.984, durations: [900, 70, 300, 70, 90, 70, 1000, 70, 90, 70, 300, 70] },
  'major-general': { half: 0.201, top: 0.018, rows: 3, foot: 0.984, durations: [1000, 70, 90, 70, 400, 70, 900, 70, 400, 70, 90, 70] },
  'colonel': { half: 0.301, top: 0.018, rows: 6, foot: 0.982, durations: [900, 70, 500, 70, 120, 70, 90, 70, 500, 70, 90, 70, 1000, 70, 90, 70, 400, 70, 90, 70, 120, 70, 300, 70] },
  'lieutenant-colonel': { half: 0.246, top: 0.020, rows: 3, foot: 0.980, durations: [1000, 70, 400, 70, 90, 70, 900, 70, 90, 70, 400, 70] },
  'major': { half: 0.193, top: 0.018, rows: 3, foot: 0.984, durations: [1000, 70, 70, 400, 70, 70, 900, 70, 70, 400, 70, 70] },
  'captain': { half: 0.232, top: 0.037, rows: 4, foot: 0.963, durations: [900, 70, 90, 70, 350, 70, 90, 70, 900, 70, 90, 70, 350, 70, 90, 70] },
  'lieutenant': { half: 0.191, top: 0.016, rows: 3, foot: 0.982, durations: [1000, 70, 70, 1100, 70, 70, 900, 70, 70, 1100, 70, 70] },
  'second-lieutenant': { half: 0.230, top: 0.016, rows: 3, foot: 0.980, durations: [1000, 70, 70, 400, 70, 70, 900, 70, 70, 400, 70, 70] },
  'aircraft': { half: 0.479, top: 0.014, rows: 3, foot: 0.775, durations: [90, 70, 70, 90, 70, 70, 90, 70, 70, 90, 70, 70] },
  'tank': { half: 0.479, top: 0.018, rows: 3, foot: 0.873, durations: [900, 70, 70, 400, 70, 70, 900, 70, 70, 400, 70, 70] },
  'engineer': { half: 0.277, top: 0.016, rows: 5, foot: 0.984, durations: [800, 70, 90, 400, 70, 90, 70, 400, 70, 500, 70, 300, 90, 70, 500, 90, 70] },
  'cavalry': { half: 0.336, top: 0.018, rows: 3, foot: 0.980, durations: [900, 70, 400, 70, 90, 70, 700, 70, 90, 70, 400, 70] },
  'spy': { half: 0.246, top: 0.010, rows: 3, foot: 0.982, durations: [900, 70, 70, 400, 70, 70, 900, 70, 70, 400, 70, 70] },
  'mine': { half: 0.477, top: 0.018, rows: 3, foot: 0.625, durations: [900, 70, 70, 400, 70, 70, 700, 70, 70, 400, 70, 70] },
  'flag': { half: 0.377, top: 0.018, rows: 3, foot: 0.984, durations: [160, 70, 70, 160, 70, 70, 160, 70, 70, 160, 70, 70] },
  'general': { half: 0.211, top: 0.002, rows: 3, foot: 1.000, durations: [1700, 80, 80, 80, 90, 420, 90, 80, 80, 80] },
  'unknown': { half: 0.234, top: 0.066, rows: 3, foot: 0.986, durations: [110, 110, 110, 110, 110, 110, 110, 110, 110, 110] },
} as const;
export type SpriteSheetKey = keyof typeof SPRITE_SHEETS;
