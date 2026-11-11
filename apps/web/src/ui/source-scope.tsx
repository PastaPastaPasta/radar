import { createContext, useContext } from 'react'
import type { SourceStamp } from '@/data/envelope'

/** Two stamps say the same thing about where a figure came from when only their times differ. */
export function sourceKey(stamp: SourceStamp): string {
  return [stamp.source, stamp.fallback ?? '', stamp.proved ? 'proved' : ''].join('|')
}

/** One stamp per distinct source: the oldest of each, so the age shown never flatters the group. */
export function distinctSources(stamps: readonly SourceStamp[]): SourceStamp[] {
  const byKey = new Map<string, SourceStamp>()
  for (const s of stamps) {
    const seen = byKey.get(sourceKey(s))
    if (!seen || s.asOf < seen.asOf) byKey.set(sourceKey(s), s)
  }
  return [...byKey.values()]
}

const Covered = createContext<ReadonlySet<string>>(new Set())

/** What the enclosing card already says about its sources, so its figures do not repeat it. */
export const SourceScope = Covered.Provider

/** True when an enclosing card's header already names this stamp's source. */
export function useCoveredSource(stamp: SourceStamp | undefined): boolean {
  const covered = useContext(Covered)
  return stamp !== undefined && covered.has(sourceKey(stamp))
}
