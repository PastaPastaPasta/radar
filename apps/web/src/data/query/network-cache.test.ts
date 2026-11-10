import 'fake-indexeddb/auto'
import { QueryClient } from '@tanstack/react-query'
import { createStore, entries } from 'idb-keyval'
import { describe, expect, it } from 'vitest'
import { resetNetworkCache } from './network-cache'
import { createPersister } from './persister'
import { dataClass } from './stale'

describe('resetNetworkCache', () => {
  it('drops one network from memory and from IndexedDB', async () => {
    const store = createStore('radar-query', 'queries')
    const persister = createPersister({ appVersion: '1', store, gc: false })
    const qc = new QueryClient({
      defaultOptions: { queries: { persister: persister.persisterFn, retry: false } },
    })
    for (const net of ['devnet-ruby', 'testnet'] as const) {
      await qc.fetchQuery({
        queryKey: [net, 'sdk', 'contract'],
        queryFn: () => ({ source: 'sdk', asOf: 1, fetchedAt: 1, proved: false, data: net }),
        ...dataClass('structural'),
      })
    }
    await new Promise((r) => setTimeout(r, 30))
    expect(await entries(store)).toHaveLength(2)

    await resetNetworkCache(qc, 'devnet-ruby')

    expect(qc.getQueryData(['devnet-ruby', 'sdk', 'contract'])).toBeUndefined()
    expect(qc.getQueryData(['testnet', 'sdk', 'contract'])).toBeDefined()
    expect(await entries(store)).toHaveLength(1)
  })
})
