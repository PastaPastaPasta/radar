import { filterMnRows, type MnFilter } from '@/data/masternodes/filter'
import type { MnRow } from '@/data/masternodes/rows'

/**
 * The map used to colour its points by reachability, PoSe status, version or type (`color=`) and hide categories of
 * that colouring (`hide=`). Links made then still arrive. This turns such a link into the filter it meant, so the
 * page counts the same masternodes the old map drew.
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
 * The filter an old `color` + `hide` link meant: the link's own filter, narrowed to the categories it left shown
 * wherever the filter can say so (one reachability, one PoSe status, the types, or the versions still drawn).
 * Without `hide` the colouring changed nothing about which masternodes were drawn.
 */
export function legacyFilter(
  rows: readonly MnRow[],
  filter: MnFilter,
  mode: ColorMode,
  hide: readonly string[],
): MnFilter {
  if (hide.length === 0) return filter
  const hidden = new Set(hide)
  const keyOf = legacyKey(mode, rows)
  const shown = filterMnRows(rows, filter).filter((r) => !hidden.has(keyOf(r)))
  const kept = [...new Set(shown.map(keyOf))].sort()
  const out: MnFilter = { ...filter }
  switch (mode) {
    case 'reach': {
      const reach = kept.filter((k) => k !== 'unchecked')
      if (reach.length === 1 && (reach[0] === 'reachable' || reach[0] === 'unreachable'))
        out.reach = reach[0]
      break
    }
    case 'pose':
      if (kept.length === 1) out.status = kept[0] === 'banned' ? ['pose-banned'] : ['enabled']
      break
    case 'type':
      if (kept.length > 0)
        out.type = kept.filter((k): k is 'regular' | 'evo' => k === 'regular' || k === 'evo')
      break
    case 'version': {
      const versions = new Set(shown.flatMap((r) => r.crawl?.version ?? []))
      if (versions.size > 0) out.version = [...versions].sort()
      break
    }
  }
  return out
}
