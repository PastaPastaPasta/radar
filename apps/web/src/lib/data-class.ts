/** How an answer ages: sets its staleness, retention and whether it persists (`data/query/stale.ts`). */
export type DataClass =
  'immutable' | 'structural' | 'live' | 'tip' | 'crawl' | 'index' | 'latest' | 'rate'
