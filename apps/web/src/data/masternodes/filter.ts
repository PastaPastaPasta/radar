import { z } from 'zod'
import { zCsv, zCsvEnum, zOpt } from '@/lib/search-schemas'
import type { MnRow } from './rows'

/** The masternode filter fields the list (`/masternodes`) and the map (`/map`) share, in the URL's string forms. */
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

/** The value of each facet for a row; a row the crawl has not seen has none for the crawl's. */
const facetValues = {
  type: (r: MnRow) => r.type,
  status: (r: MnRow) => r.status,
  reach: reachOf,
  country: (r: MnRow) => r.crawl?.country ?? undefined,
  version: (r: MnRow) => r.crawl?.version ?? undefined,
  host: (r: MnRow) => r.crawl?.as_org ?? undefined,
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
    r.crawl?.payout_address,
  ]
    .filter((v): v is string => typeof v === 'string')
    .join('\n')
    .toLowerCase()

/** A row passes when it matches every field the filter sets; within a field, any of its values will do. */
export function filterMnRows(rows: readonly MnRow[], filter: MnFilter): MnRow[] {
  const q = filter.q?.trim().toLowerCase()
  const sets = (Object.keys(facetValues) as (keyof typeof facetValues)[]).flatMap((k) => {
    const wanted = csv(filter[k])
    return wanted ? [[k, wanted] as const] : []
  })
  return rows.filter(
    (row) =>
      (!q || searchText(row).includes(q)) &&
      sets.every(([k, wanted]) => {
        const v = facetValues[k](row)
        return v !== undefined && wanted.has(v)
      }),
  )
}

export type MnFacets = { [K in keyof typeof facetValues]: Record<string, number> }

/** How many rows hold each value of each facet, for the filter's options. Pass the rows before the filter applies. */
export function mnFilterFacets(rows: readonly MnRow[]): MnFacets {
  const out: MnFacets = {
    type: {},
    status: {},
    reach: {},
    country: {},
    version: {},
    host: {},
    dkg: {},
  }
  for (const row of rows)
    for (const k of Object.keys(facetValues) as (keyof typeof facetValues)[]) {
      const v = facetValues[k](row)
      if (v !== undefined) out[k][v] = (out[k][v] ?? 0) + 1
    }
  return out
}
