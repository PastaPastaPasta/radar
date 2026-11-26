import { useMemo } from 'react'
import { useThemeSignal } from '@/ui'
import { lighterHex, mixHex, paintFor } from './census-paint'

export interface CensusColors {
  /** The six categorical slots in their fixed order: a rank's slice, or the slot a key holds (`useSeriesSlots`). */
  rank: string[]
  other: string
  /** Nodes we could not place (no country or provider): lighter than "other" in either theme, so the two read apart. */
  unknown: string
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
  unknown: '#BCC5CB',
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
  const other = v('--dh-line-2', FALLBACK.other)
  const ink = v('--dh-ink', FALLBACK.ink)
  const surface = v('--dh-surface', FALLBACK.surface)
  return {
    rank: FALLBACK.rank.map((fallback, i) => v(`--rx-s${String(i + 1)}`, fallback)),
    other,
    unknown: mixHex(other, lighterHex(surface, ink), 0.5),
    good: v('--dh-good', FALLBACK.good),
    warn: v('--dh-warn', FALLBACK.warn),
    bad: v('--dh-bad', FALLBACK.bad),
    ink,
    ink2: v('--dh-ink-2', FALLBACK.ink2),
    surface,
  }
}

/** A swatch's fill: the slot's colour as the bar draws it, so a legend matches its segment. */
export const swatchOf = (colors: CensusColors, fill: string): string =>
  paintFor(fill, colors.ink, colors.surface).background

/** The page's resolved colours (a canvas cannot read custom properties), read again when the theme changes. */
export function useCensusColors(): CensusColors {
  const theme = useThemeSignal()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `theme` is the signal that the tokens' values changed
  return useMemo(() => read(document.documentElement), [theme])
}
