import { facetValues } from './filter'
import type { MnRow } from './rows'

export type MnFacets = { [K in keyof typeof facetValues]: Record<string, number> }

/**
 * How many rows hold each value of each facet, for the filter's options. Pass the rows before the filter applies.
 * The `dkg` facet also counts, under each check's id, the rows where that check fails: the filter takes those ids.
 */
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
  for (const row of rows)
    for (const [check, verdict] of Object.entries(row.crawl?.dkg_readiness?.checks ?? {}))
      if (verdict === 'fail') out.dkg[check] = (out.dkg[check] ?? 0) + 1
  return out
}

/** The organisation name to show for each autonomous system number in the rows (`host` facet values). */
export function mnHostLabels(rows: readonly MnRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { crawl } of rows)
    if (crawl?.asn != null && crawl.as_org) out[String(crawl.asn)] ??= crawl.as_org
  return out
}
