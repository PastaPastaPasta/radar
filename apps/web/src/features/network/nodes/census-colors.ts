import { useMemo } from 'react'
import { useThemeSignal } from '@/ui'

export interface CensusColors {
  /** The six categorical slots in their fixed order: a rank's slice, or the slot a key holds (`useSeriesSlots`). */
  rank: string[]
  other: string
  axis: string
  good: string
  warn: string
  bad: string
  ink: string
  ink2: string
  surface: string
}

const FALLBACK: CensusColors = {
  rank: ['#008DE4', '#D95926', '#1E9586', '#BD7F00', '#D55181', '#6B8E00'],
  other: '#7A8B98',
  axis: '#7A8B98',
  good: '#1a7f4f',
  warn: '#b8590f',
  bad: '#c0392b',
  ink: '#0C1D2B',
  ink2: '#4A5D6B',
  surface: '#FFFFFF',
}

function read(el: Element): CensusColors {
  const style = getComputedStyle(el)
  const v = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    rank: FALLBACK.rank.map((fallback, i) => v(`--rx-s${String(i + 1)}`, fallback)),
    other: v('--dh-line-2', FALLBACK.other),
    axis: v('--dh-line-2', FALLBACK.axis),
    good: v('--dh-good', FALLBACK.good),
    warn: v('--dh-warn', FALLBACK.warn),
    bad: v('--dh-bad', FALLBACK.bad),
    ink: v('--dh-ink', FALLBACK.ink),
    ink2: v('--dh-ink-2', FALLBACK.ink2),
    surface: v('--dh-surface', FALLBACK.surface),
  }
}

/** The page's resolved colours (a canvas cannot read custom properties), read again when the theme changes. */
export function useCensusColors(): CensusColors {
  const theme = useThemeSignal()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `theme` is the signal that the tokens' values changed
  return useMemo(() => read(document.documentElement), [theme])
}
