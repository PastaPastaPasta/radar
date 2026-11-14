// The census figures' arithmetic, ported from dash-nodes' overview page (MIT, github.com/PastaPastaPasta/dash-nodes).
import type { RadarHistory, RadarReleases, RadarScope } from '@/data/radar/schemas'

export type CensusScope = 'all' | 'mn' | 'evo' | 'other'

export const CENSUS_SCOPES: readonly CensusScope[] = ['all', 'mn', 'evo', 'other']

/** The route's scope names one of Radar's; "other full nodes" is Radar's `nonmn`. */
export const radarScope = (scope: CensusScope): RadarScope => (scope === 'other' ? 'nonmn' : scope)

/** A crawl older than this is called stale (Radar's own rule, `STALE_AFTER` in `data/health.ts`). */
export const STALE_CRAWL_MS = 45 * 60_000

export type DistRow = readonly [key: string, count: number]

export const total = (rows: readonly DistRow[]): number => rows.reduce((a, r) => a + r[1], 0)

export const UNKNOWN = 'Unknown'

/** A share of `sum` as a fraction; a few nodes in a very large set stay above zero. */
export const fraction = (n: number, sum: number): number => (sum > 0 ? n / sum : 0)

/** True for a share that would print as 0.0%, so the page can say "<0.1%" instead. */
export const isTiny = (n: number, sum: number): boolean => n > 0 && n / sum < 0.0005

// ---- hosting ----

export interface HostRow {
  org: string
  n: number
  /** Autonomous system numbers, digits only (the `host` filter's values). */
  asns: string[]
}

/** "Hetzner Online GmbH" from "AS24940 Hetzner Online GmbH". */
const orgOf = (asn: string): string => asn.replace(/^AS\d+\s*/, '') || asn

/** One provider can run several ASNs: rows grouped by organisation, largest first. */
export function byOrg(rows: readonly DistRow[]): HostRow[] {
  const groups = new Map<string, HostRow>()
  for (const [key, n] of rows) {
    const org = key === UNKNOWN ? key : orgOf(key)
    const entry = groups.get(org) ?? { org, n: 0, asns: [] }
    entry.n += n
    const asn = key === UNKNOWN ? undefined : /^AS(\d+)/.exec(key)?.[1]
    if (asn) entry.asns.push(asn)
    groups.set(org, entry)
  }
  return [...groups.values()].sort((a, b) => b.n - a.n)
}

// ---- versions ----

const parts = (v: string): number[] => v.split('.').map((n) => parseInt(n, 10) || 0)

/** Newest first: 24.0.0, 23.1.9, 23.1.8. */
export function byNewest(a: string, b: string): number {
  const x = parts(a)
  const y = parts(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (y[i] ?? 0) - (x[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/** Whether a version is Dash Core's ("23.1.9"), not another client's ("Lksc Core 5.18"). */
export const isCoreVersion = (v: string): boolean => /^\d+\./.test(v)

/** The version in a user agent: "/Dash Core:24.0.0/" gives "24.0.0". */
export const versionOf = (ua: string): string => /^\/Dash Core:([^/(]+)/.exec(ua)?.[1] ?? (ua || '')

export type ReleaseStatus = 'release' | 'candidate' | 'build'

export interface ReleaseBook {
  /** Whether Radar's release list is there at all; without it every version reads as a release. */
  known: boolean
  status(version: string): ReleaseStatus
  /** Dash Core's final releases, newest first. */
  finals: string[]
  published(version: string): number | undefined
}

export function releaseBook(doc: RadarReleases | undefined): ReleaseBook {
  const seen = new Map<string, { candidate: boolean; published: number }>()
  for (const r of doc?.releases ?? []) {
    const had = seen.get(r.version)
    // A version with a final release is a release, whatever candidates came before it.
    if (!had || had.candidate)
      seen.set(r.version, { candidate: r.prerelease, published: r.published })
  }
  const finals = [...seen]
    .filter(([, r]) => !r.candidate)
    .map(([v]) => v)
    .sort(byNewest)
  return {
    known: doc !== undefined,
    status: (v) => {
      if (doc === undefined) return 'release'
      const r = seen.get(v)
      return r === undefined ? 'build' : r.candidate ? 'candidate' : 'release'
    },
    finals,
    published: (v) => seen.get(v)?.published,
  }
}

/** What a version is, for ordering: 0 releases, 1 candidates, 2 other builds, 3 other clients. */
export type VersionKind = 0 | 1 | 2 | 3

export function kindOf(book: ReleaseBook, v: string): VersionKind {
  if (!isCoreVersion(v)) return 3
  const status = book.status(v)
  return status === 'release' ? 0 : status === 'candidate' ? 1 : 2
}

const stackKind = (book: ReleaseBook, k: string): number =>
  k === UNKNOWN ? 5 : k === 'Other' ? 4 : kindOf(book, k)

/** The ladder's order: the latest release first, older releases after it, then candidates, builds and other clients. */
const ladderOrder = (book: ReleaseBook, a: string, b: string): number =>
  stackKind(book, a) - stackKind(book, b) || byNewest(a, b)

export interface LadderRow {
  key: string
  n: number
  /** More than one version folded into this row. */
  folded?: number
}

export interface LadderGroup {
  kind: VersionKind
  rows: LadderRow[]
}

/**
 * The ladder's groups, the latest release always first (even if nothing runs it yet): releases newest first, those
 * under 1 % after the latest folded into one row; release candidates; builds that match no release; and other
 * clients folded into one row. Without the release list, one group by share.
 */
export function ladderGroups(
  book: ReleaseBook,
  versions: readonly DistRow[],
  sum: number,
): LadderGroup[] {
  const row = ([key, n]: DistRow): LadderRow => ({ key, n })
  const fold = (rows: DistRow[]): LadderRow =>
    rows.length === 1 ? row(rows[0]!) : { key: rows[0]![0], n: total(rows), folded: rows.length }
  if (!book.known) {
    const shown = versions.filter(([, n], i) => i < 8 && fraction(n, sum) >= 0.005)
    const rest = versions.filter((r) => !shown.includes(r))
    return [{ kind: 0, rows: [...shown.map(row), ...(rest.length ? [fold([...rest])] : [])] }]
  }
  const kinds: DistRow[][] = [[], [], [], []]
  for (const r of versions) kinds[kindOf(book, r[0])]!.push(r)
  for (const k of kinds) k.sort(([a], [b]) => byNewest(a, b))
  const latest = book.finals[0]
  if (latest !== undefined && !kinds[0]!.some(([v]) => v === latest)) kinds[0]!.unshift([latest, 0])
  const shown = kinds[0]!.filter(([v, n]) => v === latest || fraction(n, sum) >= 0.01)
  const older = kinds[0]!.filter((r) => !shown.includes(r))
  const groups: LadderGroup[] = [
    { kind: 0, rows: [...shown.map(row), ...(older.length ? [fold(older)] : [])] },
    { kind: 1, rows: kinds[1]!.map(row) },
    { kind: 2, rows: kinds[2]!.map(row) },
    { kind: 3, rows: kinds[3]!.length ? [fold(kinds[3]!)] : [] },
  ]
  return groups.filter((g) => g.rows.length > 0)
}

/**
 * Narrows a version history to `keep` named series, the latest release always among them (the API keeps the most
 * common over the whole range, which on a long range can leave out a new release); the rest fold into "Other".
 */
export function keepVersions(
  doc: RadarHistory,
  keep: number,
  latest: string | undefined,
): RadarHistory {
  const named = doc.series.filter((s) => s.key !== 'Other' && s.key !== UNKNOWN)
  const kept = named.slice(0, keep)
  const wanted = named.find((s) => s.key === latest)
  if (wanted && !kept.includes(wanted)) kept.splice(keep - 1, 1, wanted)
  const rest = named.filter((s) => !kept.includes(s))
  if (rest.length === 0) return doc
  const other = doc.series.find((s) => s.key === 'Other')
  const values = doc.t.map((_, i) =>
    rest.reduce((a, s) => a + (s.values[i] ?? 0), other?.values[i] ?? 0),
  )
  return {
    ...doc,
    series: [...kept, { key: 'Other', values }, ...doc.series.filter((s) => s.key === UNKNOWN)],
  }
}

/** A version history as shares of each time step, oldest series last in `order` so the latest release stacks on top. */
export function stackShares(
  doc: RadarHistory,
  book: ReleaseBook,
): { key: string; values: (number | null)[] }[] {
  const sum = (key: string) =>
    doc.series.find((s) => s.key === key)!.values.reduce<number>((a, v) => a + (v ?? 0), 0)
  return [...doc.series].sort((a, b) =>
    book.known
      ? ladderOrder(book, b.key, a.key)
      : stackKind(book, b.key) - stackKind(book, a.key) || sum(a.key) - sum(b.key),
  )
}

// ---- reach ----

export interface ReachShare {
  yes: number
  no: number
  unchecked: number
}

export function reachShare(rows: readonly DistRow[] | undefined): ReachShare {
  const m = new Map(rows)
  return { yes: m.get('yes') ?? 0, no: m.get('no') ?? 0, unchecked: m.get('unchecked') ?? 0 }
}

// ---- readiness ----

/** The checks of Radar's DKG readiness, in the order they are listed (`DKG_CHECKS` in dash-nodes' common.js). */
export const DKG_CHECK_IDS = ['reachable', 'platform_ban', 'protocol', 'relay', 'filters'] as const

// ---- platform ----

/** The quantity of a dist's version row, 0 when absent. */
export const countOf = (rows: readonly DistRow[], key: string): number =>
  rows.find(([k]) => k === key)?.[1] ?? 0

// ---- speed tests ----

export const GRADES = ['A', 'B', 'C', 'D', 'F'] as const

export const median = (values: readonly (number | null)[]): number | null => {
  const sorted = values.filter((v): v is number => v !== null).sort((a, b) => a - b)
  return sorted.length ? sorted[sorted.length >> 1]! : null
}
