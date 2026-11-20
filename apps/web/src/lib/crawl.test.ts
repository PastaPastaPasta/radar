import { describe, expect, it } from 'vitest'
import {
  CRAWL_CATCH_UP_MS,
  CRAWL_CATCH_UPS,
  CRAWL_REFRESH_MS,
  CRAWL_STALE_MS,
  crawlRefreshMs,
  isCrawlStale,
} from './crawl'

const query = (radarTime: string | undefined, dataUpdatedAt: number) => ({
  state: { data: radarTime ? { radarTime } : undefined, dataUpdatedAt },
})

describe('the crawl threshold @RA-12', () => {
  it('turns a crawl stale past 30 minutes, everywhere', () => {
    expect(isCrawlStale(CRAWL_STALE_MS)).toBe(false)
    expect(isCrawlStale(CRAWL_STALE_MS + 1)).toBe(true)
  })
})

describe('refreshing crawl documents', () => {
  it('reads a current document again once per crawl period', () => {
    expect(crawlRefreshMs(query('crawl', 1))).toBe(CRAWL_REFRESH_MS)
    expect(crawlRefreshMs(query(undefined, 0))).toBe(CRAWL_REFRESH_MS)
  })

  it('catches up quickly on a document that trailed the latest crawl, a bounded number of times', () => {
    const q = query('earlier-crawl', 1)
    const intervals: number[] = []
    for (let answer = 1; answer <= CRAWL_CATCH_UPS + 2; answer++) {
      q.state.dataUpdatedAt = answer
      intervals.push(crawlRefreshMs(q))
      // The interval is asked for on every render, not only after each answer.
      expect(crawlRefreshMs(q)).toBe(intervals.at(-1))
    }
    expect(intervals).toEqual([
      ...Array<number>(CRAWL_CATCH_UPS).fill(CRAWL_CATCH_UP_MS),
      CRAWL_REFRESH_MS,
      CRAWL_REFRESH_MS,
    ])
  })

  it('catches up again after the document has caught up once', () => {
    const q = query('earlier-crawl', 1)
    for (let answer = 1; answer <= CRAWL_CATCH_UPS + 1; answer++) {
      q.state.dataUpdatedAt = answer
      crawlRefreshMs(q)
    }
    q.state.data = { radarTime: 'crawl' }
    expect(crawlRefreshMs(q)).toBe(CRAWL_REFRESH_MS)
    q.state.data = { radarTime: 'earlier-crawl' }
    q.state.dataUpdatedAt = 100
    expect(crawlRefreshMs(q)).toBe(CRAWL_CATCH_UP_MS)
  })
})
