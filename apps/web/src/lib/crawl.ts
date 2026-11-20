/**
 * The one age at which Radar's crawl counts as stale, everywhere: the hero, every source line, the /nodes notice and
 * the /status page. A crawl takes a few minutes and a new one starts every ten to fifteen, so a crawl this old means
 * at least one was missed.
 */
export const CRAWL_STALE_MS = 30 * 60_000

/** How often a page that shows crawl figures reads them again while it is visible, so it picks up each new crawl. */
export const CRAWL_REFRESH_MS = 5 * 60_000

/** How soon a document that trailed Radar's latest crawl is read again: Radar publishes each document a little after the crawl. */
export const CRAWL_CATCH_UP_MS = 60_000
