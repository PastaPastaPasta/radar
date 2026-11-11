import { describe, expect, it, vi } from 'vitest'
import {
  discoverNodes,
  NODE_LIST_TTL_MS,
  nodeFromHost,
  parseQuorumNodes,
  type NodeListStore,
} from '@/data/dapi-core/discovery'

const body = {
  success: true,
  data: [
    {
      proTxHash: 'a',
      address: '1.1.1.1:9999',
      status: 'ENABLED',
      versionCheck: 'success',
      platformHTTPPort: 443,
    },
    { proTxHash: 'b', address: '2.2.2.2:9999', status: 'ENABLED', versionCheck: 'success' },
    { proTxHash: 'c', address: '3.3.3.3:9999', status: 'POSE_BANNED', versionCheck: 'fail' },
    { proTxHash: 'd', address: '4.4.4.4:9999', status: 'ENABLED', versionCheck: 'fail' },
    {
      proTxHash: 'e',
      address: '[2001:db8::1]:9999',
      status: 'ENABLED',
      versionCheck: 'success',
      platformHTTPPort: 1443,
    },
  ],
}

describe('parseQuorumNodes', () => {
  it('keeps enabled, version-checked nodes and builds their https url', () => {
    expect(parseQuorumNodes(body, 'testnet').map((n) => n.url)).toEqual([
      'https://1.1.1.1:443',
      'https://2.2.2.2:1443',
      'https://[2001:db8::1]:1443',
    ])
  })

  it('has nothing to say about a body without a list', () => {
    expect(parseQuorumNodes({}, 'mainnet')).toEqual([])
    expect(parseQuorumNodes(null, 'mainnet')).toEqual([])
  })
})

describe('nodeFromHost', () => {
  it('reads ip:port and urls', () => {
    expect(nodeFromHost('1.2.3.4:443')?.url).toBe('https://1.2.3.4:443')
    expect(nodeFromHost('https://1.2.3.4:1443')?.host).toBe('1.2.3.4:1443')
    expect(nodeFromHost('nonsense')).toBeUndefined()
  })
})

function memoryStore(initial?: {
  nodes: ReturnType<typeof parseQuorumNodes>
  at: number
}): NodeListStore & { saved: unknown[] } {
  let value = initial
  const saved: unknown[] = []
  return {
    saved,
    get: () => Promise.resolve(value),
    put: (_net, nodes, at) => {
      value = { nodes, at }
      saved.push(nodes)
      return Promise.resolve()
    },
  }
}

const okFetch = () =>
  vi.fn<(url: string) => Promise<Response>>(() =>
    Promise.resolve(new Response(JSON.stringify(body))),
  )

describe('discoverNodes', () => {
  it('starts from the bundled seeds and refreshes from the quorum service behind them', async () => {
    const fetch = okFetch()
    const store = memoryStore()
    const found = await discoverNodes('testnet', {
      fetch,
      now: () => 1000,
      store,
      devnets: () => [],
    })
    expect(found.source).toBe('seed')
    expect(found.nodes.length).toBeGreaterThan(5)
    const live = await found.refreshed
    expect(live).toHaveLength(3)
    expect(fetch.mock.calls[0]![0]).toBe('https://quorums.testnet.networks.dash.org/masternodes')
    expect(store.saved).toHaveLength(1)
  })

  it('uses a cached list younger than an hour without asking the network', async () => {
    const fetch = okFetch()
    const cached = { nodes: parseQuorumNodes(body, 'testnet'), at: 1000 }
    const found = await discoverNodes('testnet', {
      fetch,
      now: () => 1000 + NODE_LIST_TTL_MS - 1,
      store: memoryStore(cached),
      devnets: () => [],
    })
    expect(found.source).toBe('cache')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('uses a cached list older than an hour while the live one loads, ahead of the seeds', async () => {
    const fetch = okFetch()
    const cached = { nodes: parseQuorumNodes(body, 'testnet'), at: 1000 }
    const found = await discoverNodes('testnet', {
      fetch,
      now: () => 1000 + NODE_LIST_TTL_MS + 1,
      store: memoryStore(cached),
      devnets: () => [],
    })
    expect(found.source).toBe('cache')
    expect(found.refreshed).toBeDefined()
  })

  it('falls back to the seeds when the quorum service is down', async () => {
    const fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
    const found = await discoverNodes('mainnet', { fetch, now: () => 0, devnets: () => [] })
    expect(found.source).toBe('seed')
    expect(await found.refreshed).toBeUndefined()
  })

  it("uses a devnet's configured addresses", async () => {
    const found = await discoverNodes('devnet-x', {
      fetch: okFetch(),
      now: () => 0,
      devnets: () => [{ name: 'x', dapiAddresses: ['9.9.9.9:2443'] }],
    })
    expect(found).toMatchObject({ source: 'devnet', nodes: [{ url: 'https://9.9.9.9:2443' }] })
  })

  it('refuses a devnet with no address', async () => {
    await expect(
      discoverNodes('devnet-x', { fetch: okFetch(), now: () => 0, devnets: () => [] }),
    ).rejects.toMatchObject({ kind: 'unavailable' })
  })
})
