import { useMemo } from 'react'
import { useThemeSignal } from '@/ui'

export interface CensusColors {
  /** The layer's own hue, then the ramp: a rank's slice or series. */
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
  rank: ['#0a2a3d', '#0080D0', '#39A2E8', '#86C4F0', '#C2E0F7'],
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
    rank: [
      v('--rx-net-line', FALLBACK.rank[0]!),
      v('--dh-ramp-2', FALLBACK.rank[1]!),
      v('--dh-ramp-3', FALLBACK.rank[2]!),
      v('--dh-ramp-4', FALLBACK.rank[3]!),
      v('--dh-ramp-5', FALLBACK.rank[4]!),
    ],
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
