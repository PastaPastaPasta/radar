import type { MnFilter } from '@/data/masternodes/filter'
import type { MnRow } from '@/data/masternodes/rows'
import type { RadarGeo, RadarSummary } from '@/data/radar/schemas'
import { byOrg, UNKNOWN } from '../nodes/census-math'

/** What the page counts: enabled masternodes, enabled evonodes, or every node that answered the crawl. */
export type Scope = 'mn' | 'evo' | 'nodes'

export interface MapScopeSearch extends MnFilter {
  layer: 'mn' | 'nodes'
}

export function scopeOf(search: MapScopeSearch): Scope {
  if (search.layer === 'nodes') return 'nodes'
  const type = search.type
  return type?.length === 1 && type[0] === 'evo' ? 'evo' : 'mn'
}

/** The address change that switches to a scope; the masternode filters stay, `type` follows the scope. */
export function scopeChange(scope: Scope): { layer: 'mn' | 'nodes'; type: ['evo'] | undefined } {
  return scope === 'nodes'
    ? { layer: 'nodes', type: undefined }
    : { layer: 'mn', type: scope === 'evo' ? ['evo'] : undefined }
}

/**
 * The filter behind the page's masternodes. A PoSe-banned masternode serves nothing, so it is left out unless the
 * address asks for it with `status`.
 */
export function populationFilter(filter: MnFilter): MnFilter {
  return filter.status ? filter : { ...filter, status: ['enabled'] }
}

/** Whether the address narrows the masternodes beyond the scope itself (a search, a country, a host, …). */
export function isNarrowed(filter: MnFilter): boolean {
  return (
    filter.q !== undefined ||
    filter.reach !== undefined ||
    (filter.status !== undefined &&
      !(filter.status.length === 1 && filter.status[0] === 'enabled')) ||
    filter.country !== undefined ||
    filter.version !== undefined ||
    filter.host !== undefined ||
    filter.dkg !== undefined ||
    (filter.type !== undefined && !(filter.type.length === 1 && filter.type[0] === 'evo'))
  )
}

// ---- places ----

/** One city on the map. Districts the geolocation names apart ("Singapore (Pioneer)") are folded into their city. */
export interface Place {
  id: string
  city: string | null
  country: string | null
  lat: number
  lon: number
  n: number
  /** Masternodes only: how many are evonodes, how many answered the crawl, and who hosts them (largest first). */
  evo: number
  answering: number
  providers: { org: string; n: number }[]
}

/** "Frankfurt am Main (Innenstadt I)" is Frankfurt am Main. */
export const baseCity = (city: string | null | undefined): string | null =>
  city ? city.replace(/\s*\([^)]*\)\s*$/, '').trim() || city : null

const placeId = (
  country: string | null | undefined,
  city: string | null,
  lat: number,
  lon: number,
) => (city ? `${country ?? ''}:${city}` : `${lat.toFixed(2)},${lon.toFixed(2)}`)

interface Builder {
  place: Place
  /** Rows at each exact point, so the place sits where most of them are. */
  points: Map<string, { lat: number; lon: number; n: number }>
  providers: Map<string, number>
}

function addTo(
  builders: Map<string, Builder>,
  at: {
    lat: number
    lon: number
    city: string | null | undefined
    country: string | null | undefined
  },
  n: number,
): Builder {
  const city = baseCity(at.city)
  const id = placeId(at.country, city, at.lat, at.lon)
  let b = builders.get(id)
  if (!b) {
    b = {
      place: {
        id,
        city,
        country: at.country ?? null,
        lat: at.lat,
        lon: at.lon,
        n: 0,
        evo: 0,
        answering: 0,
        providers: [],
      },
      points: new Map(),
      providers: new Map(),
    }
    builders.set(id, b)
  }
  b.place.n += n
  const key = `${at.lat},${at.lon}`
  const p = b.points.get(key) ?? { lat: at.lat, lon: at.lon, n: 0 }
  p.n += n
  b.points.set(key, p)
  return b
}

function finish(builders: Map<string, Builder>): Place[] {
  return [...builders.values()]
    .map(({ place, points, providers }) => {
      const where = [...points.values()].sort((a, b) => b.n - a.n)[0]!
      return {
        ...place,
        lat: where.lat,
        lon: where.lon,
        providers: [...providers]
          .map(([org, n]) => ({ org, n }))
          .sort((a, b) => b.n - a.n || a.org.localeCompare(b.org)),
      }
    })
    .sort(byCount)
}

const byCount = (a: Place, b: Place) =>
  b.n - a.n || (a.city ?? '').localeCompare(b.city ?? '') || a.id.localeCompare(b.id)

/** The cities of these masternodes, largest first. A row the crawl could not place is left out (see `unplaced`). */
export function placesOfRows(rows: readonly MnRow[]): Place[] {
  const builders = new Map<string, Builder>()
  for (const r of rows) {
    const c = r.crawl
    if (c?.lat == null || c.lon == null) continue
    const b = addTo(builders, { lat: c.lat, lon: c.lon, city: c.city, country: c.country }, 1)
    if (r.type === 'evo') b.place.evo++
    if (c.reachable === true) b.place.answering++
    const org = c.as_org ?? UNKNOWN
    b.providers.set(org, (b.providers.get(org) ?? 0) + 1)
  }
  return finish(builders)
}

/** The cities of every node that answered the crawl, from Radar's geo document. */
export function placesOfGeo(geo: RadarGeo): Place[] {
  const builders = new Map<string, Builder>()
  for (const p of geo.points) if (p.nodes > 0) addTo(builders, p, p.nodes)
  return finish(builders)
}

export const unplaced = (rows: readonly MnRow[]): number =>
  rows.filter((r) => r.crawl?.lat == null || r.crawl.lon == null).length

export const findPlace = (places: readonly Place[], id: string | undefined): Place | undefined =>
  id === undefined ? undefined : places.find((p) => p.id === id)

/** The place a masternode is counted in. */
export function placeOfRow(places: readonly Place[], row: MnRow): Place | undefined {
  const c = row.crawl
  if (c?.lat == null || c.lon == null) return undefined
  return findPlace(places, placeId(c.country, baseCity(c.city), c.lat, c.lon))
}

// ---- concentration ----

/** One group in a share bar: a city, a country or a hosting provider. `filter` narrows the page to it, when it can. */
export interface Share {
  key: string
  n: number
  /** Autonomous system numbers for a provider, so the group can be filtered by `host`. */
  asns?: string[]
}

export interface Concentration {
  /** Every group the crawl could name, largest first. */
  ranked: Share[]
  /** The nodes no group holds: no location (Tor, I2P, no address), or no hosting record. */
  unknown: number
  /** Every node counted, the unknown ones included: the shares' denominator. */
  total: number
  /** The fewest groups that together hold at least half of `total`; undefined when even all of them hold less. */
  toHalf: number | undefined
}

export function concentration(groups: readonly Share[], unknown: number): Concentration {
  const ranked = groups
    .filter((g) => g.n > 0)
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key))
  const total = ranked.reduce((a, g) => a + g.n, 0) + unknown
  let held = 0
  let toHalf: number | undefined
  for (let i = 0; i < ranked.length; i++) {
    held += ranked[i]!.n
    if (held * 2 >= total) {
      toHalf = i + 1
      break
    }
  }
  return { ranked, unknown, total, toHalf: total === 0 ? undefined : toHalf }
}

export interface Concentrations {
  city: Concentration
  country: Concentration
  provider: Concentration
}

function counted<K>(items: readonly K[], keyOf: (k: K) => string | null | undefined) {
  const m = new Map<string, number>()
  let unknown = 0
  for (const it of items) {
    const k = keyOf(it)
    if (k) m.set(k, (m.get(k) ?? 0) + 1)
    else unknown++
  }
  return { groups: [...m].map(([key, n]) => ({ key, n })), unknown }
}

/** Cities, countries and hosting providers of these masternodes. */
export function concentrationsOfRows(
  rows: readonly MnRow[],
  places: readonly Place[],
): Concentrations {
  const countries = counted(rows, (r) => (r.crawl?.lat == null ? null : r.crawl.country))
  const asns = new Map<string, Set<string>>()
  const providers = counted(rows, (r) => {
    const org = r.crawl?.as_org
    if (org && r.crawl?.asn != null) {
      const set = asns.get(org) ?? new Set()
      set.add(String(r.crawl.asn))
      asns.set(org, set)
    }
    return org
  })
  return {
    city: concentration(
      places.map((p) => ({ key: p.id, n: p.n })),
      unplaced(rows),
    ),
    country: concentration(countries.groups, countries.unknown),
    provider: concentration(
      providers.groups.map((g) => ({ ...g, asns: [...(asns.get(g.key) ?? [])].sort() })),
      providers.unknown,
    ),
  }
}

/** Every reachable node: cities from the geo document, countries and providers from the crawl's summary. */
export function concentrationsOfNodes(
  places: readonly Place[],
  unlocated: number,
  summary: RadarSummary | undefined,
): Concentrations {
  const dist = summary?.dists.all
  const country = (dist?.country ?? []).filter(([k]) => k !== UNKNOWN)
  const orgs = byOrg(dist?.asn ?? [])
  return {
    city: concentration(
      places.map((p) => ({ key: p.id, n: p.n })),
      unlocated,
    ),
    country: concentration(
      country.map(([key, n]) => ({ key, n })),
      (dist?.country ?? []).filter(([k]) => k === UNKNOWN).reduce((a, [, n]) => a + n, 0),
    ),
    provider: concentration(
      orgs.filter((o) => o.org !== UNKNOWN).map((o) => ({ key: o.org, n: o.n, asns: o.asns })),
      orgs.filter((o) => o.org === UNKNOWN).reduce((a, o) => a + o.n, 0),
    ),
  }
}

/** The share bar's segments: the `top` largest groups, then the rest together, then the unknown. */
export function segments(
  c: Concentration,
  top = 5,
): { kind: 'group' | 'rest' | 'unknown'; share: Share | undefined; n: number; rank: number }[] {
  const named = c.ranked.slice(0, top).map((share, rank) => ({
    kind: 'group' as const,
    share,
    n: share.n,
    rank,
  }))
  const rest = c.ranked.slice(top).reduce((a, g) => a + g.n, 0)
  return [
    ...named,
    ...(rest > 0 ? [{ kind: 'rest' as const, share: undefined, n: rest, rank: top }] : []),
    ...(c.unknown > 0
      ? [{ kind: 'unknown' as const, share: undefined, n: c.unknown, rank: top + 1 }]
      : []),
  ]
}

// ---- the map's labels ----

export interface LabelBox {
  id: string
  /** The disc: centre and radius, in map units. */
  x: number
  y: number
  r: number
  /** The label's size in map units. */
  w: number
  h: number
}

export interface PlacedLabel {
  id: string
  /** Top-left corner of the label, in map units. */
  x: number
  y: number
  anchor: 'start' | 'end'
}

const overlaps = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** The square inside a disc: a label may graze the disc's edge but not cover its middle. */
const disc = (o: LabelBox) => {
  const h = o.r * 0.7
  return { x: o.x - h, y: o.y - h, w: 2 * h, h: 2 * h }
}

/**
 * Labels the largest places first, beside their disc (right, left, above, below), skipping any that would cover
 * a label already placed or a bigger city's disc, or run off the map. The rest are named on hover and in the list.
 */
export function placeLabels(
  boxes: readonly LabelBox[],
  bounds: { x: number; y: number; w: number; h: number },
  max: number,
): PlacedLabel[] {
  const placed: (PlacedLabel & { w: number; h: number })[] = []
  for (const b of boxes) {
    if (placed.length >= max) break
    const gap = b.r * 0.25 + b.h * 0.2
    const side = b.r + gap
    const diag = b.r * 0.72 + gap
    const tries: PlacedLabel[] = [
      { id: b.id, x: b.x + side, y: b.y - b.h / 2, anchor: 'start' },
      { id: b.id, x: b.x - side - b.w, y: b.y - b.h / 2, anchor: 'end' },
      { id: b.id, x: b.x - b.w / 2, y: b.y - side - b.h, anchor: 'start' },
      { id: b.id, x: b.x - b.w / 2, y: b.y + side, anchor: 'start' },
      { id: b.id, x: b.x + diag, y: b.y - diag - b.h, anchor: 'start' },
      { id: b.id, x: b.x - diag - b.w, y: b.y - diag - b.h, anchor: 'end' },
      { id: b.id, x: b.x + diag, y: b.y + diag, anchor: 'start' },
      { id: b.id, x: b.x - diag - b.w, y: b.y + diag, anchor: 'end' },
    ]
    // A label may lie over smaller cities, never over a bigger city's disc.
    const bigger = boxes.filter((o) => o.id !== b.id && o.r >= b.r).map(disc)
    const fit = tries.find((p) => {
      const box = { x: p.x, y: p.y, w: b.w, h: b.h }
      const inside =
        box.x >= bounds.x &&
        box.y >= bounds.y &&
        box.x + box.w <= bounds.x + bounds.w &&
        box.y + box.h <= bounds.y + bounds.h
      return (
        inside && !placed.some((q) => overlaps(box, q)) && !bigger.some((o) => overlaps(box, o))
      )
    })
    if (fit) placed.push({ ...fit, w: b.w, h: b.h })
  }
  return placed.map(({ id, x, y, anchor }) => ({ id, x, y, anchor }))
}
