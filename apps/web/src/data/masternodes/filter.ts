import { z } from 'zod'
import { zCsv, zCsvEnum, zOpt } from '@/lib/search-schemas'
import type { MnRow } from './rows'

/**
 * The masternode filter fields the list (`/masternodes`) and the map (`/map`) share, in the URL's string forms.
 * `host` holds autonomous system numbers (`16509`), not organisation names: the names carry commas ("Amazon.com, Inc.").
 * `mnHostLabels` gives the name to show for each.
 */
export const mnFilterSearch = z.object({
  q: zOpt(z.string()),
  type: zOpt(zCsvEnum(['regular', 'evo'])),
  status: zOpt(zCsvEnum(['enabled', 'pose-banned'])),
  reach: zOpt(z.enum(['reachable', 'unreachable'])),
  country: zOpt(zCsv),
  version: zOpt(zCsv),
  host: zOpt(zCsv),
  dkg: zOpt(zCsv),
})

export type MnFilter = z.output<typeof mnFilterSearch>

const csv = (v: string | readonly string[] | undefined): ReadonlySet<string> | undefined =>
  v === undefined
    ? undefined
    : typeof v === 'string'
      ? new Set([v])
      : v.length > 0
        ? new Set(v)
        : undefined

const reachOf = (row: MnRow): 'reachable' | 'unreachable' | undefined =>
  row.crawl?.reachable == null ? undefined : row.crawl.reachable ? 'reachable' : 'unreachable'

const asnOf = (r: MnRow): string | undefined =>
  r.crawl?.asn == null ? undefined : String(r.crawl.asn)

/** The value of each facet for a row; a row the crawl has not seen has none for the crawl's. */
export const facetValues = {
  type: (r: MnRow) => r.type,
  status: (r: MnRow) => r.status,
  reach: reachOf,
  country: (r: MnRow) => r.crawl?.country ?? undefined,
  version: (r: MnRow) => r.crawl?.version ?? undefined,
  host: asnOf,
  dkg: (r: MnRow) => r.crawl?.dkg_readiness?.overall,
} satisfies Record<Exclude<keyof MnFilter, 'q'>, (r: MnRow) => string | undefined>

const searchText = (r: MnRow): string =>
  [
    r.protx,
    r.service,
    r.crawl?.country,
    r.crawl?.city,
    r.crawl?.version,
    r.crawl?.as_org,
    asnOf(r) && `as${asnOf(r)}`,
    r.crawl?.user_agent,
    r.crawl?.platform_node_id,
    r.crawl?.payout_address,
  ]
    .filter((v): v is string => typeof v === 'string')
    .join('\n')
    .toLowerCase()

/**
 * `dkg` takes the crawl's overall verdict (`pass`, `fail`, `unknown`; the census says `ready` for `pass`), or the id of one
 * check, which keeps the rows where that check fails.
 */
function dkgMatches(row: MnRow, wanted: ReadonlySet<string>): boolean {
  const readiness = row.crawl?.dkg_readiness
  if (!readiness) return false
  return [...wanted].some(
    (v) => (v === 'ready' ? 'pass' : v) === readiness.overall || readiness.checks[v] === 'fail',
  )
}

const CRAWL_FACETS: ReadonlySet<keyof typeof facetValues> = new Set([
  'reach',
  'country',
  'version',
  'host',
  'dkg',
])

/**
 * A row passes when it matches every field the filter sets; within a field, any of its values will do. The search
 * text is words, and a row must hold each of them ("hetzner falkenstein"). While no row
 * carries a crawl (Radar refused or down), the crawl's facets are ignored: they could only empty the list.
 */
export function filterMnRows(rows: readonly MnRow[], filter: MnFilter): MnRow[] {
  const terms = filter.q?.trim().toLowerCase().split(/\s+/).filter(Boolean) ?? []
  const crawled = rows.some((r) => r.crawl)
  const sets = (Object.keys(facetValues) as (keyof typeof facetValues)[]).flatMap((k) => {
    const wanted = !crawled && CRAWL_FACETS.has(k) ? undefined : csv(filter[k])
    return wanted ? [[k, wanted] as const] : []
  })
  return rows.filter(
    (row) =>
      (terms.length === 0 || terms.every((term) => searchText(row).includes(term))) &&
      sets.every(([k, wanted]) => {
        if (k === 'dkg') return dkgMatches(row, wanted)
        const v = facetValues[k](row)
        return v !== undefined && wanted.has(v)
      }),
  )
}
