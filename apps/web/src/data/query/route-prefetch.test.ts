import { QueryClient } from '@tanstack/query-core'
import { describe, expect, it, vi } from 'vitest'
import { core } from '../core'
import { blockPrefetch, blocksPrefetch, homePrefetch, txPrefetch } from './route-prefetch'

const HASH = 'ab'.repeat(32)

describe('route prefetch items', () => {
  it('starts the block read for a height or a hash, as the one DAPI read of a detail route', () => {
    for (const id of ['2570000', HASH.toUpperCase()]) {
      const dapi = blockPrefetch('mainnet', id).filter((i) => i.cost === 'dapi')
      expect(dapi).toHaveLength(1)
      expect(dapi[0]).toMatchObject({ detail: true, wait: true })
    }
  })

  it('queues a router preload as prefetch and a real navigation as detail', async () => {
    const block = vi.spyOn(core, 'block').mockRejectedValue(new Error('stop'))
    const tx = vi.spyOn(core, 'tx').mockRejectedValue(new Error('stop'))
    const run = async (items: ReturnType<typeof blockPrefetch>) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      await items.find((i) => i.cost === 'dapi')?.start(client)
    }
    await run(blockPrefetch('mainnet', '2570000', true))
    await run(blockPrefetch('mainnet', '2570000'))
    await run(txPrefetch('mainnet', HASH, true))
    await run(txPrefetch('mainnet', HASH))
    expect(block.mock.calls.map((c) => c[3])).toEqual([
      { priority: 'prefetch' },
      { priority: 'detail' },
    ])
    expect(tx.mock.calls.map((c) => c[3])).toEqual([
      { priority: 'prefetch' },
      { priority: 'detail' },
    ])
    vi.restoreAllMocks()
  })

  it('starts nothing for an id that names no block or transaction', () => {
    expect(blockPrefetch('mainnet', 'not-a-block')).toEqual([])
    expect(txPrefetch('mainnet', 'abc')).toEqual([])
  })

  it('starts the transaction read for a txid', () => {
    expect(txPrefetch('mainnet', HASH).filter((i) => i.cost === 'dapi')).toHaveLength(1)
  })

  it('never starts a DAPI list read for the blocks page, only the Hyphen probe', () => {
    expect(blocksPrefetch('mainnet').map((i) => i.cost)).toEqual(['http'])
  })

  it('asks no source on a devnet, which has none of them', () => {
    expect(homePrefetch('devnet-ruby')).toEqual([])
    expect(blocksPrefetch('devnet-ruby')).toEqual([])
  })

  it('reads the census, Platform Explorer and the Hyphen probe for the home page, all over HTTP', () => {
    expect(homePrefetch('mainnet').map((i) => i.cost)).toEqual(['http', 'http', 'http'])
  })
})
