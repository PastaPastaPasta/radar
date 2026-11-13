import { QueryClient } from '@tanstack/query-core'
import { delay, http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { core } from '@/data/core'
import { healthRegistry, resetHealthRegistry } from '@/data/health'
import {
  addressPrefetch,
  mempoolPrefetch,
  proposalPrefetch,
  proposalsPrefetch,
} from '@/data/query/route-prefetch'
import { server } from '@/test/server'

describe('prefetch for a page that reads one index or the other', () => {
  const ADDRESS = 'yX6ZaQMNNaMvNEYrpuwYV7BnMJpZaMQpZa'
  let urls: string[] = []
  const record = ({ request }: { request: Request }) => void urls.push(request.url)
  const hyphenReads = (what: string) => urls.filter((u) => u.includes('/x/hy/') && u.includes(what))
  const insightReads = (what: string) =>
    urls.filter((u) => u.includes('insight') && u.includes(what))
  const run = async (items: ReturnType<typeof proposalsPrefetch>) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await Promise.all(items.map((i) => i.start(client)))
    return client
  }

  beforeEach(() => {
    urls = []
    resetHealthRegistry()
    server.events.on('request:start', record)
  })
  afterEach(() => {
    server.events.removeListener('request:start', record)
    vi.restoreAllMocks()
  })

  it('waits for the probe on a first visit and then reads only Insight’s list on a stale network', async () => {
    vi.spyOn(core, 'tip').mockResolvedValue({
      source: 'dapi',
      asOf: 0,
      fetchedAt: 0,
      proved: false,
      data: { height: 1_589_232, hash: '00', time: 0 },
    })
    await run(proposalsPrefetch('testnet'))
    expect(insightReads('/gobject/list')).toHaveLength(1)
    expect(hyphenReads('/proposals')).toEqual([])
    urls = []
    await run(addressPrefetch('testnet', ADDRESS))
    expect(insightReads(`/addr/${ADDRESS}`)).toHaveLength(1)
    expect(hyphenReads('/address/')).toEqual([])
  })

  it('reads Hyphen’s list on a fresh network, and never Insight’s', async () => {
    vi.spyOn(core, 'tip').mockResolvedValue({
      source: 'dapi',
      asOf: 0,
      fetchedAt: 0,
      proved: false,
      data: { height: 2_571_151, hash: '00', time: 0 },
    })
    await run(proposalsPrefetch('mainnet'))
    await run(
      proposalPrefetch(
        'mainnet',
        '0f44c3013cb2703ba00b226457189374c8881f855ec1232b24251fe039d6159c',
      ),
    )
    expect(hyphenReads('/proposal')).not.toHaveLength(0)
    expect(urls.filter((u) => u.includes('insight'))).toEqual([])
  })

  it('does not wait for a probe it has already learned the answer to', async () => {
    healthRegistry.setLag('testnet', 'hyphen', { blocks: 20, detail: 'indexed to block 1' })
    server.use(
      http.get('*/x/hy/testnet/status', async () => {
        await delay('infinite')
        return HttpResponse.json({})
      }),
    )
    const wait = proposalsPrefetch('testnet').filter((i) => i.wait)
    expect(wait).toHaveLength(1)
    await wait[0]!.start(new QueryClient())
    expect(insightReads('/gobject/list')).toHaveLength(1)
    expect(hyphenReads('/proposals')).toEqual([])
  })

  it('waits for the probe before the mempool read, and reads none on a stale network', async () => {
    vi.spyOn(core, 'tip').mockResolvedValue({
      source: 'dapi',
      asOf: 0,
      fetchedAt: 0,
      proved: false,
      data: { height: 1_589_232, hash: '00', time: 0 },
    })
    const items = mempoolPrefetch('testnet')
    expect(items.filter((i) => i.wait)).toHaveLength(1)
    await run(items)
    expect(hyphenReads('/status')).not.toHaveLength(0)
    expect(hyphenReads('/mempool')).toEqual([])
  })

  it('reads the mempool summary once the probe finds a fresh index', async () => {
    vi.spyOn(core, 'tip').mockResolvedValue({
      source: 'dapi',
      asOf: 0,
      fetchedAt: 0,
      proved: false,
      data: { height: 2_571_151, hash: '00', time: 0 },
    })
    await run(mempoolPrefetch('mainnet'))
    expect(hyphenReads('/mempool')).not.toHaveLength(0)
  })
})
