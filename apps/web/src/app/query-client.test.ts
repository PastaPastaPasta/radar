import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import type { Sourced } from '@/data/envelope'
import { hyQueries } from '@/data/hyphen/queries'
import type { HyBlockDetail, HyTxDetail } from '@/data/hyphen/schemas'
import { onHyphenDetail, sawHyphenDetail } from '@/data/hyphen/seen'
import { queryDefaults } from '@/data/query'
import { writeSourceMode } from '@/lib/source-mode'
import { createQueryClient } from './query-client'

describe('createQueryClient', () => {
  it('takes the shared retry and polling defaults', () => {
    const queries = createQueryClient().getDefaultOptions().queries
    expect(queries?.retry).toBe(queryDefaults.queries?.retry)
    expect(queries?.retryDelay).toBe(queryDefaults.queries?.retryDelay)
    expect(queries?.refetchOnWindowFocus).toBe(false)
    expect(queries?.refetchIntervalInBackground).toBe(false)
  })

  it('persists through IndexedDB when it is available', () => {
    expect(createQueryClient().getDefaultOptions().queries?.persister).toBeTypeOf('function')
  })
})

const HASH = 'AB'.repeat(32)
const sourced = <T>(data: T): Sourced<T> => ({
  source: 'hyphen',
  asOf: 1_000,
  fetchedAt: 2_000,
  proved: false,
  data,
})

afterEach(() => onHyphenDetail(undefined))

describe('details the Core client read from Hyphen', () => {
  it('answer the page’s own Hyphen query, as of when they were read', () => {
    const client = createQueryClient()
    const block = sourced({ blockHeight: 7, blockHash: HASH } as HyBlockDetail)
    sawHyphenDetail('mainnet', { kind: 'block', ids: [HASH, HASH.toLowerCase()], read: block })
    expect(client.getQueryData(hyQueries.block('mainnet', HASH).queryKey)).toBe(block)
    expect(client.getQueryState(hyQueries.block('mainnet', HASH).queryKey)?.dataUpdatedAt).toBe(
      2_000,
    )
    expect(client.getQueryData(hyQueries.block('testnet', 7).queryKey)).toBeUndefined()
  })

  it('are left out of the cache in Decentralized only mode', () => {
    const client = createQueryClient()
    writeSourceMode('decentralized')
    sawHyphenDetail('mainnet', {
      kind: 'tx',
      ids: ['aa'],
      read: sourced({ txHash: 'a' } as unknown as HyTxDetail),
    })
    // Checked before the mode changes back, which resets Hyphen's queries anyway.
    expect(client.getQueryData(hyQueries.tx('mainnet', 'aa').queryKey)).toBeUndefined()
    writeSourceMode('all')
  })

  it('never replace an answer the query already has', () => {
    const client = createQueryClient()
    const mine = sourced({ txHash: 'a' } as unknown as HyTxDetail)
    client.setQueryData(hyQueries.tx('mainnet', 'aa').queryKey, mine)
    sawHyphenDetail('mainnet', {
      kind: 'tx',
      ids: ['AA'],
      read: sourced({ txHash: 'b' } as unknown as HyTxDetail),
    })
    expect(client.getQueryData(hyQueries.tx('mainnet', 'aa').queryKey)).toBe(mine)
  })
})
