import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Sourced } from '@/data/envelope'
import {
  DPNS_CONTRACT,
  dpnsName,
  identityBalance,
  platformAddressInfo,
  tokenBalance,
} from '@/data/sdk/batchers'
import type { DocumentDto } from '@/data/sdk/methods/shared'

const { call } = vi.hoisted(() => ({
  call: vi.fn<(net: string, method: string, args: Record<string, unknown>) => Promise<unknown>>(),
}))
vi.mock('@/data/sdk/client', () => ({ sdk: { call } }))
const sourced = <T>(data: T, asOf = 1_700_000_000_000): Sourced<T> => ({
  data,
  source: 'sdk',
  asOf,
  fetchedAt: asOf,
  proved: true,
})
const domain = (label: string, identity: string, createdAt: number | null): DocumentDto => ({
  id: `${label}-doc`,
  ownerId: identity,
  contractId: DPNS_CONTRACT,
  type: 'domain',
  revision: 1n,
  createdAt,
  updatedAt: null,
  transferredAt: null,
  createdAtBlockHeight: null,
  updatedAtBlockHeight: null,
  transferredAtBlockHeight: null,
  createdAtCoreBlockHeight: null,
  updatedAtCoreBlockHeight: null,
  transferredAtCoreBlockHeight: null,
  data: { label, normalizedParentDomainName: 'dash', records: { identity } },
})

beforeEach(() => {
  vi.useFakeTimers()
  call.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('SDK batchers', () => {
  it('reads many identity balances in one call and gives each asker its own', async () => {
    call.mockResolvedValue(sourced(new Map([['a', 5n]])))
    const a = identityBalance.fetch('mainnet', 'a')
    const b = identityBalance.fetch('mainnet', 'b')
    await vi.advanceTimersByTimeAsync(15)
    expect((await a).data).toBe(5n)
    expect((await b).data).toBe(null)
    expect(call).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledWith('mainnet', 'identities.balances', { ids: ['a', 'b'] })
  })

  it('keeps the per-key queries under the sdk source, one per key', () => {
    expect(identityBalance.queryOptions('testnet', 'a').queryKey).toEqual([
      'testnet',
      'sdk',
      'identity-balance',
      { id: 'a' },
    ])
    expect(platformAddressInfo.queryOptions('mainnet', 'dash1x').queryKey).toEqual([
      'mainnet',
      'sdk',
      'platform-address-info',
      { address: 'dash1x' },
    ])
  })

  it('asks for the balances of one token at a time, and answers each token and identity pair', async () => {
    call.mockImplementation((_net, _m, args) =>
      Promise.resolve(
        sourced(
          new Map([['i1', (args as { tokenId: string }).tokenId === 't1' ? 1n : 2n]]),
          (args as { tokenId: string }).tokenId === 't1' ? 20 : 10,
        ),
      ),
    )
    const k = (tokenId: string, identityId: string) => ({ tokenId, identityId })
    const a = tokenBalance.fetch('mainnet', k('t1', 'i1'))
    const b = tokenBalance.fetch('mainnet', k('t2', 'i1'))
    const c = tokenBalance.fetch('mainnet', k('t2', 'i2'))
    await vi.advanceTimersByTimeAsync(15)
    expect([(await a).data, (await b).data, (await c).data]).toEqual([1n, 2n, null])
    expect(call).toHaveBeenCalledTimes(2)
    expect((await a).asOf).toBe(10)
  })

  describe('dpnsName', () => {
    it('queries the records.identity index once and gives an identity its oldest name', async () => {
      call.mockResolvedValue(
        sourced([
          domain('newer', 'i1', 200),
          domain('older', 'i1', 100),
          domain('only', 'i2', null),
        ]),
      )
      const names = ['i1', 'i2', 'i3'].map((id) => dpnsName.fetch('mainnet', id))
      await vi.advanceTimersByTimeAsync(15)
      expect((await Promise.all(names)).map((n) => n.data)).toEqual([
        'older.dash',
        'only.dash',
        null,
      ])
      expect(call).toHaveBeenCalledTimes(1)
      expect(call).toHaveBeenCalledWith('mainnet', 'documents.query', {
        contractId: DPNS_CONTRACT,
        type: 'domain',
        where: [['records.identity', 'in', ['i1', 'i2', 'i3']]],
        orderBy: [['records.identity', 'asc']],
        limit: 100,
      })
    })

    it('asks dpns.usernames, four at a time, for the identities a full page may have cut off', async () => {
      const ids = Array.from({ length: 6 }, (_, i) => `i${i}`)
      const full = Array.from({ length: 100 }, (_, i) => domain(`n${i}`, 'i0', i))
      let inFlight = 0
      let peak = 0
      call.mockImplementation(async (_net, method) => {
        if (method === 'documents.query') return sourced(full)
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await new Promise((r) => setTimeout(r, 5))
        inFlight -= 1
        return sourced(['late.dash'])
      })
      const names = ids.map((id) => dpnsName.fetch('mainnet', id))
      await vi.advanceTimersByTimeAsync(40)
      const got = (await Promise.all(names)).map((n) => n.data)
      expect(got).toEqual(['n0.dash', ...Array.from({ length: 5 }, () => 'late.dash')])
      expect(peak).toBe(4)
    })
  })
})
