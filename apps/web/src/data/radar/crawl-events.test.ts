import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { announceNewerCrawl, watchCrawls } from './crawl-events'

function seed(client: QueryClient, key: unknown[], asOf: number, dataClass = 'crawl') {
  const query = client.getQueryCache().build(client, {
    queryKey: key,
    queryFn: () => ({ asOf }),
    meta: { dataClass },
  })
  query.setData({ asOf })
  return query
}

describe('a newer crawl', () => {
  it('re-reads only that network’s crawl documents from before it', () => {
    const client = new QueryClient()
    const stop = watchCrawls(client)
    const older = seed(client, ['mainnet', 'radar', 'geo'], 1_000)
    const current = seed(client, ['mainnet', 'radar', 'summary'], 2_000)
    const otherNet = seed(client, ['testnet', 'radar', 'geo'], 1_000)
    const notCrawl = seed(client, ['mainnet', 'radar', 'bench'], 1_000, 'live')
    announceNewerCrawl('mainnet', 2_000)
    expect(older.state.isInvalidated).toBe(true)
    expect(current.state.isInvalidated).toBe(false)
    expect(otherNet.state.isInvalidated).toBe(false)
    expect(notCrawl.state.isInvalidated).toBe(false)
    stop()
    client.clear()
  })
})
