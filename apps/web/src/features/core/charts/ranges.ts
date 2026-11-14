export const RANGES = ['1h', '1d', '1w', '1m', '1y', 'all'] as const
export type Range = (typeof RANGES)[number]
export const DEFAULT_RANGE: Range = '1d'

/** Dash targets 2.6 minutes a block; a range is a count of blocks because Hyphen's metrics are indexed by height. */
const BLOCKS: Record<Exclude<Range, 'all'>, { blocks: number; points: number }> = {
  '1h': { blocks: 24, points: 24 },
  '1d': { blocks: 576, points: 96 },
  '1w': { blocks: 4032, points: 84 },
  '1m': { blocks: 17_280, points: 120 },
  '1y': { blocks: 210_240, points: 120 },
}

const ALL_POINTS = 120

export function rangeWindow(
  range: Range,
  tipHeight: number | undefined,
): { blocks: number; points: number } | undefined {
  if (range !== 'all') return BLOCKS[range]
  return tipHeight === undefined ? undefined : { blocks: tipHeight, points: ALL_POINTS }
}
