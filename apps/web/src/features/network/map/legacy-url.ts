import { facetValues, type MnFilter } from '@/data/masternodes/filter'
import type { MnRow } from '@/data/masternodes/rows'

/**
 * The map used to colour its points by reachability, PoSe status, version or type (`color=`) and hide categories of
 * that colouring (`hide=`). Links made then still arrive, and the page counts the masternodes the old map drew.
 */
export const COLOR_MODES = ['reach', 'pose', 'version', 'type'] as const
export type ColorMode = (typeof COLOR_MODES)[number]

const TOP_VERSIONS = 5

/** Versions by how many rows run them, most first; ties by the higher version. The old map coloured these five. */
export function topVersions(rows: readonly MnRow[], n = TOP_VERSIONS): string[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const v = r.crawl?.version
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0], 'en', { numeric: true }))
    .slice(0, n)
    .map(([v]) => v)
}

/** The category a row had under each colouring. */
export function legacyKey(mode: ColorMode, rows: readonly MnRow[]): (r: MnRow) => string {
  switch (mode) {
    case 'reach':
      return (r) =>
        r.crawl?.reachable == null ? 'unchecked' : r.crawl.reachable ? 'reachable' : 'unreachable'
    case 'pose':
      return (r) => (r.status === 'pose-banned' ? 'banned' : 'enabled')
    case 'type':
      return (r) => r.type
    case 'version': {
      const top = new Set(topVersions(rows))
      return (r) => {
        const v = r.crawl?.version
        return !v ? 'unknown' : top.has(v) ? v : 'other'
      }
    }
  }
}

/**
 * What an old `color` + `hide` link left out, as a test on a row. The page keeps the link's words in its address and
 * applies this test as it is, so a link that hid every row stays empty and one that kept unknown versions keeps them:
 * no list filter could say either.
 */
export function legacyHidden(
  mode: ColorMode,
  rows: readonly MnRow[],
  hide: readonly string[],
): ((r: MnRow) => boolean) | undefined {
  if (hide.length === 0) return undefined
  const hidden = new Set(hide)
  const keyOf = legacyKey(mode, rows)
  return (r) => hidden.has(keyOf(r))
}

/** The list facet each old colouring split the rows by. */
const LIST_FACET = { reach: 'reach', pose: 'status', type: 'type', version: 'version' } as const

/**
 * What an old link left out, said in the masternode list's own filters, or `undefined` when they cannot say exactly
 * the same thing: a kept row with no value for the facet (an unknown version, a node the crawl has not checked), a
 * value shared by kept and hidden rows, or two reachability states, which the list's `reach` cannot hold together.
 */
export function legacyListFilter(
  mode: ColorMode,
  rows: readonly MnRow[],
  hide: readonly string[],
): MnFilter | undefined {
  const hidden = legacyHidden(mode, rows, hide)
  if (!hidden || !rows.some(hidden)) return {}
  const facet = LIST_FACET[mode]
  const valueOf: (r: MnRow) => string | undefined = facetValues[facet]
  const kept = new Set<string>()
  for (const r of rows) {
    if (hidden(r)) continue
    const v = valueOf(r)
    if (v === undefined) return undefined
    kept.add(v)
  }
  if (kept.size === 0 || rows.some((r) => hidden(r) && kept.has(valueOf(r) ?? ''))) return undefined
  const values = [...kept].sort()
  if (facet === 'reach') {
    return values.length === 1 ? { reach: values[0] as 'reachable' | 'unreachable' } : undefined
  }
  return { [facet]: values }
}
