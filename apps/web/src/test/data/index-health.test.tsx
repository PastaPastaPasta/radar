import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import { setActiveNetwork } from '@/data/active-network'
import { resetIndexState } from '@/data/index-state'
import { useIndexHealth } from '@/data/index-health'
import { server } from '@/test/server'

const dapi = vi.hoisted(() => ({ tip: 0, fallback: undefined as string | undefined }))

vi.mock('@/data/core/client', async (original) => {
  const actual = await original<typeof ClientModule>()
  return {
    ...actual,
    core: {
      ...actual.core,
      tip: () =>
        dapi.tip === 0
          ? Promise.reject(new Error('no DAPI'))
          : Promise.resolve({
              source: 'dapi',
              asOf: 0,
              fetchedAt: 0,
              proved: false,
              fallback: dapi.fallback,
              data: { height: dapi.tip, hash: '00', time: 0 },
            }),
    },
  }
})

const INDEXED = 1_577_999

function status(blockHeight: number) {
  const at = '2026-10-23T16:06:28Z'
  return {
    syncStatus: 'synced',
    blockHeight,
    indices: { block: { indexedHeight: blockHeight, updatedAt: at } },
  }
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

beforeEach(() => {
  setActiveNetwork('testnet')
  resetIndexState()
  dapi.tip = 0
  dapi.fallback = undefined
})
afterEach(() => setActiveNetwork('mainnet'))

async function settled(indexed: number, tip: number) {
  server.use(http.get('*/x/hy/testnet/status', () => HttpResponse.json(status(indexed))))
  dapi.tip = tip
  const hook = renderHook(() => useIndexHealth('testnet'), { wrapper })
  await waitFor(() => expect(hook.result.current.pending).toBe(false))
  return hook
}

describe('useIndexHealth', () => {
  it('reads Insight while Hyphen is more than six blocks below DAPI’s best height', async () => {
    const { result } = await settled(INDEXED, INDEXED + 7)
    expect(result.current).toMatchObject({
      state: 'stale',
      readFrom: 'insight',
      behind: 7,
      indexedHeight: INDEXED,
    })
    expect(result.current.lag).toContain('1,577,999')
  })

  it('stays on Hyphen at six blocks behind, and comes back to it at two', async () => {
    expect((await settled(INDEXED, INDEXED + 6)).result.current).toMatchObject({
      state: 'fresh',
      readFrom: 'hyphen',
    })
    resetIndexState()
    expect((await settled(INDEXED, INDEXED + 2)).result.current.readFrom).toBe('hyphen')
  })

  it('does not flip back to Hyphen until it is within two blocks', async () => {
    expect((await settled(INDEXED, INDEXED + 20)).result.current.readFrom).toBe('insight')
    for (const behind of [6, 4, 3]) {
      expect((await settled(INDEXED, INDEXED + behind)).result.current.readFrom).toBe('insight')
    }
    expect((await settled(INDEXED, INDEXED + 2)).result.current.readFrom).toBe('hyphen')
    expect((await settled(INDEXED, INDEXED + 5)).result.current.readFrom).toBe('hyphen')
  })

  it('measures against Radar’s crawled height when DAPI gives no tip, and ignores a tip Hyphen supplied', async () => {
    dapi.fallback = 'dapi-down'
    const { result } = await settled(INDEXED, INDEXED + 500)
    expect(result.current.behind).toBeGreaterThan(6)
    expect(result.current.state).toBe('stale')
  })

  it('is unknown, and reads Hyphen as before, when no tip can be found', async () => {
    server.use(
      http.get('https://radar.dashhq.org/api/v1/status', () =>
        HttpResponse.json({ error: 'down' }, { status: 502 }),
      ),
    )
    const { result } = await settled(INDEXED, 0)
    expect(result.current).toMatchObject({ state: 'unknown', readFrom: 'hyphen', probed: true })
  })

  it('has nothing to say on a devnet', () => {
    const { result } = renderHook(() => useIndexHealth('devnet-ruby'), { wrapper })
    expect(result.current).toMatchObject({ state: 'unknown', pending: false, readFrom: 'hyphen' })
  })
})
