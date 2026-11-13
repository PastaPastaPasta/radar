import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { filterMnRows, type MnFilter } from '@/data/masternodes/filter'
import type { MnRow } from '@/data/masternodes/rows'
import type { RadarGeo } from '@/data/radar/schemas'

export const COLOR_MODES = ['reach', 'pose', 'version', 'type'] as const
export type ColorMode = (typeof COLOR_MODES)[number]

/** A colour role on the plate. The values are in `TONE_COLOR`; donuts, chips and points all read them from there. */
export type Tone =
  'good' | 'critical' | 'serious' | 'axis' | 'evo' | 's1' | 's2' | 's3' | 's4' | 's5' | 'other'

export const TONES: readonly Tone[] = [
  'good',
  'critical',
  'serious',
  'axis',
  'evo',
  's1',
  's2',
  's3',
  's4',
  's5',
  'other',
]

/** Fixed hex values: the map is on the plate in both themes, and a canvas cannot read custom properties. */
export const TONE_COLOR: Record<Tone, string> = {
  good: '#4CC38A',
  critical: '#FF8F86',
  serious: '#F29C5F',
  axis: '#7A9DB4',
  evo: '#25B8A6',
  s1: '#E4F3FC',
  s2: '#A6D8F7',
  s3: '#62B8F3',
  s4: '#2B90DA',
  s5: '#4F86B5',
  other: '#9BBDD2',
}

export const CATEGORY_LABEL: Record<string, MessageDescriptor> = {
  reachable: msg`Reachable`,
  unreachable: msg`Unreachable`,
  unchecked: msg`Not checked`,
  enabled: msg`Enabled`,
  banned: msg`PoSe-banned`,
  regular: msg`Masternodes`,
  evo: msg`Evonodes`,
  other: msg`Other versions`,
  unknown: msg`Unknown version`,
}

export interface ColorScheme {
  mode: ColorMode
  keyOf: (row: MnRow) => string
  /** Every category the legend can show, in order. */
  order: string[]
  toneOf: (key: string) => Tone
}

const VERSION_TONES: Tone[] = ['s1', 's2', 's3', 's4', 's5']
const TOP_VERSIONS = VERSION_TONES.length

/** Versions by how many rows run them, most first; ties by the higher version. */
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

/** `rows` is every masternode, not the filtered list: the five common versions keep their colours whatever is filtered. */
export function colorScheme(mode: ColorMode, rows: readonly MnRow[]): ColorScheme {
  switch (mode) {
    case 'reach': {
      const tone: Record<string, Tone> = {
        reachable: 'good',
        unreachable: 'critical',
        unchecked: 'axis',
      }
      return {
        mode,
        keyOf: (r) =>
          r.crawl?.reachable == null
            ? 'unchecked'
            : r.crawl.reachable
              ? 'reachable'
              : 'unreachable',
        order: ['reachable', 'unreachable', 'unchecked'],
        toneOf: (k) => tone[k] ?? 'axis',
      }
    }
    case 'pose':
      return {
        mode,
        keyOf: (r) => (r.status === 'pose-banned' ? 'banned' : 'enabled'),
        order: ['enabled', 'banned'],
        toneOf: (k) => (k === 'banned' ? 'serious' : 's2'),
      }
    case 'type':
      return {
        mode,
        keyOf: (r) => r.type,
        order: ['regular', 'evo'],
        toneOf: (k) => (k === 'evo' ? 'evo' : 's2'),
      }
    case 'version': {
      const top = topVersions(rows)
      const slot = new Map(top.map((v, i) => [v, VERSION_TONES[i]!]))
      return {
        mode,
        keyOf: (r) => {
          const v = r.crawl?.version
          return !v ? 'unknown' : slot.has(v) ? v : 'other'
        },
        order: [...top, 'other', 'unknown'],
        toneOf: (k) => slot.get(k) ?? (k === 'unknown' ? 'axis' : 'other'),
      }
    }
  }
}

export interface MapView {
  /** Rows passing the search and selects. */
  filtered: MnRow[]
  /** `filtered` less the hidden categories: what the map draws and the headline counts. */
  visible: MnRow[]
  /** Rows per category among `filtered`. */
  counts: Map<string, number>
}

export function mapView(
  rows: readonly MnRow[],
  filter: MnFilter,
  scheme: ColorScheme,
  hidden: ReadonlySet<string>,
): MapView {
  const filtered = filterMnRows(rows, filter)
  const counts = new Map<string, number>()
  for (const r of filtered) {
    const k = scheme.keyOf(r)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return { filtered, visible: filtered.filter((r) => !hidden.has(scheme.keyOf(r))), counts }
}

export interface MapPoint {
  protx: string
  lon: number
  lat: number
  tone: Tone
  evo: boolean
}

export function mnPoints(visible: readonly MnRow[], scheme: ColorScheme): MapPoint[] {
  return visible.flatMap((r) => {
    const { lat, lon } = r.crawl ?? {}
    return lat == null || lon == null
      ? []
      : [{ protx: r.protx, lon, lat, tone: scheme.toneOf(scheme.keyOf(r)), evo: r.type === 'evo' }]
  })
}

export interface Headline {
  total: number
  answered: number
  enabled: { total: number; answered: number }
  banned: { total: number; answered: number }
  /** Masternodes drawn on no point: no address registered, or not crawled yet. */
  missing: number
}

export function headline(visible: readonly MnRow[]): Headline {
  const answered = (list: readonly MnRow[]) =>
    list.filter((r) => r.crawl?.reachable === true).length
  const banned = visible.filter((r) => r.status === 'pose-banned')
  const enabled = visible.filter((r) => r.status !== 'pose-banned')
  return {
    total: visible.length,
    answered: answered(visible),
    enabled: { total: enabled.length, answered: answered(enabled) },
    banned: { total: banned.length, answered: answered(banned) },
    missing: visible.filter((r) => r.crawl?.lat == null || r.crawl.lon == null).length,
  }
}

export interface GeoTotals {
  nodes: number
  masternodes: number
  places: number
  unlocated: number
}

export function geoTotals(geo: RadarGeo): GeoTotals {
  return {
    nodes: geo.points.reduce((a, p) => a + p.nodes, 0),
    masternodes: geo.points.reduce((a, p) => a + p.masternodes, 0),
    places: geo.points.length,
    unlocated: geo.unlocated,
  }
}

/**
 * The `/masternodes` filter for "Open these as a list": the map's filter, plus the one reachability or PoSe category
 * left showing when the colouring is by that and every other category is hidden.
 */
export function listFilter(
  filter: MnFilter,
  scheme: ColorScheme,
  hidden: ReadonlySet<string>,
): MnFilter {
  const shown = scheme.order.filter((k) => !hidden.has(k))
  const only = shown.length === 1 ? shown[0] : undefined
  const out: MnFilter = { ...filter }
  if (scheme.mode === 'reach' && (only === 'reachable' || only === 'unreachable')) out.reach = only
  if (scheme.mode === 'pose' && only) out.status = only === 'banned' ? ['pose-banned'] : ['enabled']
  return out
}

/** A filter as the `search` of a link: unset fields are left out. */
export function filterSearch(filter: MnFilter): Record<string, unknown> {
  return Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== undefined))
}

export function placeName(
  c: { city?: string | null; country?: string | null } | null | undefined,
): string {
  return [c?.city, c?.country].filter(Boolean).join(', ')
}

/** The rows at one point, answering ones first. */
export function sortGroup(group: readonly MnRow[]): MnRow[] {
  const rank = (r: MnRow) =>
    r.crawl?.reachable === true ? 0 : r.crawl?.reachable === false ? 1 : 2
  return [...group].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.service ?? '').localeCompare(b.service ?? '', 'en', { numeric: true }),
  )
}
