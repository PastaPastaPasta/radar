/**
 * The one age at which Radar's crawl counts as stale, everywhere: the hero, every source line, the /nodes notice and
 * the /status page. A crawl starts every 15 minutes (dash-nodes' `CRAWL_INTERVAL`) and takes a few, so a crawl this
 * old means the next one is overdue.
 */
export const CRAWL_STALE_MS = 30 * 60_000

/** True when a crawl that finished `ageMs` ago counts as stale. */
export const isCrawlStale = (ageMs: number): boolean => ageMs > CRAWL_STALE_MS

/** How often a page that shows crawl figures reads them again while it is visible, so it picks up each new crawl. */
export const CRAWL_REFRESH_MS = 5 * 60_000

/** How soon a document that trailed Radar's latest crawl is read again: Radar publishes each document a little after the crawl. */
export const CRAWL_CATCH_UP_MS = 60_000

/** How many quick reads a document that keeps trailing gets before it falls back to `CRAWL_REFRESH_MS`. */
export const CRAWL_CATCH_UPS = 2

interface CrawlQuery {
  state: { data?: { radarTime?: string }; dataUpdatedAt: number }
}

const catchUps = new WeakMap<object, { at: number; n: number }>()

/**
 * A crawl document's `refetchInterval`: once per `CRAWL_REFRESH_MS`, or after `CRAWL_CATCH_UP_MS` while it trails the
 * latest crawl, at most `CRAWL_CATCH_UPS` times in a row, so a Radar that stops publishing is not asked every minute.
 */
export function crawlRefreshMs(query: CrawlQuery): number {
  const { data, dataUpdatedAt } = query.state
  if (data?.radarTime !== 'earlier-crawl') {
    catchUps.delete(query)
    return CRAWL_REFRESH_MS
  }
  const seen = catchUps.get(query)
  const n = !seen ? 1 : seen.at === dataUpdatedAt ? seen.n : seen.n + 1
  catchUps.set(query, { at: dataUpdatedAt, n })
  return n <= CRAWL_CATCH_UPS ? CRAWL_CATCH_UP_MS : CRAWL_REFRESH_MS
}
