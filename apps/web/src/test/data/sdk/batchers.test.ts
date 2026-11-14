import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Sourced } from '@/data/envelope'
import { dpnsNameKey } from '@/data/query'
import {
  DPNS_CONTRACT,
  dpnsName,
  identityBalance,
  platformAddressInfo,
  tokenBalance,
} from '@/data/sdk/batchers'
import type { DocumentDto } from '@/data/sdk/methods/shared'
import { base58Encode } from '@/lib/base58'

/** A valid identifier (32 bytes in base58), different for each n. */
const id = (n: number) => base58Encode(new Uint8Array(32).fill(n))

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
  it('keeps the dpnsName query under the key useIdentityName reads', () => {
    expect(dpnsName.queryOptions('testnet', 'i1').queryKey).toEqual(dpnsNameKey('testnet', 'i1'))
  })

  it('reads many identity balances in one call and gives each asker its own', async () => {
    call.mockResolvedValue(sourced(new Map([[id(1), 5n]])))
    const a = identityBalance.fetch('mainnet', id(1))
    const b = identityBalance.fetch('mainnet', id(2))
    await vi.advanceTimersByTimeAsync(15)
    expect((await a).data).toBe(5n)
    expect((await b).data).toBe(null)
    expect(call).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledWith('mainnet', 'identities.balances', { ids: [id(1), id(2)] })
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

  describe('tokenBalance', () => {
    const k = (tokenId: string, identityId: string) => ({ tokenId, identityId })

    it('asks for the balances of each token, and answers each token and identity pair', async () => {
      call.mockImplementation((_net, _m, args) => {
        const { tokenId } = args as { tokenId: string }
        return Promise.resolve(
          sourced(new Map([[id(11), tokenId === id(1) ? 1n : 2n]]), tokenId === id(1) ? 20 : 10),
        )
      })
      const a = tokenBalance.fetch('mainnet', k(id(1), id(11)))
      const b = tokenBalance.fetch('mainnet', k(id(2), id(11)))
      const c = tokenBalance.fetch('mainnet', k(id(2), id(12)))
      const d = tokenBalance.fetch('mainnet', k(id(1), id(12)))
      await vi.advanceTimersByTimeAsync(15)
      expect([(await a).data, (await b).data, (await c).data, (await d).data]).toEqual([
        1n,
        2n,
        null,
        null,
      ])
      expect(call).toHaveBeenCalledTimes(2)
      expect(call).toHaveBeenCalledWith('mainnet', 'tokens.balances', {
        tokenId: id(1),
        identityIds: [id(11), id(12)],
      })
      expect((await a).asOf).toBe(10)
    })

    it('makes one identityBalances call for one identity across many tokens', async () => {
      const tokens = [1, 2, 3, 4, 5, 6].map(id)
      call.mockResolvedValue(sourced(new Map(tokens.map((t, i) => [t, BigInt(i)]))))
      const all = tokens.map((t) => tokenBalance.fetch('mainnet', k(t, id(11))))
      await vi.advanceTimersByTimeAsync(15)
      expect((await Promise.all(all)).map((r) => r.data)).toEqual([0n, 1n, 2n, 3n, 4n, 5n])
      expect(call).toHaveBeenCalledTimes(1)
      expect(call).toHaveBeenCalledWith('mainnet', 'tokens.identityBalances', {
        identityId: id(11),
        tokenIds: tokens,
      })
    })

    it('runs at most four calls at once', async () => {
      let inFlight = 0
      let peak = 0
      call.mockImplementation(async () => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await new Promise((r) => setTimeout(r, 5))
        inFlight -= 1
        return sourced(new Map())
      })
      const all = [1, 2, 3, 4, 5, 6, 7].flatMap((t) =>
        [21, 22].map((i) => tokenBalance.fetch('mainnet', k(id(t), id(i)))),
      )
      await vi.advanceTimersByTimeAsync(100)
      await Promise.all(all)
      expect(call).toHaveBeenCalledTimes(2)
      expect(peak).toBeLessThanOrEqual(4)
    })

    it('fails only the group that failed, and only the malformed key', async () => {
      call.mockImplementation((_net, _m, args) =>
        (args as { tokenId: string }).tokenId === id(2)
          ? Promise.reject(new Error('token 2 is down'))
          : Promise.resolve(sourced(new Map([[id(11), 7n]]))),
      )
      const good = tokenBalance.fetch('mainnet', k(id(1), id(11)))
      const down = tokenBalance.fetch('mainnet', k(id(2), id(11))).catch((e: unknown) => e)
      const bad = tokenBalance.fetch('mainnet', k(id(1), 'notbase58')).catch((e: unknown) => e)
      const other = tokenBalance.fetch('mainnet', k(id(1), id(12)))
      await vi.advanceTimersByTimeAsync(15)
      expect((await good).data).toBe(7n)
      expect((await other).data).toBe(null)
      expect(await down).toMatchObject({ message: 'token 2 is down' })
      expect(await bad).toMatchObject({ message: expect.stringContaining('Not an ID') as string })
    })

    it('keeps one entry for a key however its properties are ordered', () => {
      const a = tokenBalance.queryOptions('mainnet', { tokenId: id(1), identityId: id(2) })
      const b = tokenBalance.queryOptions('mainnet', { identityId: id(2), tokenId: id(1) })
      expect(a.queryKey).toEqual(b.queryKey)
    })
  })

  it('answers a malformed identity only with its own error', async () => {
    call.mockResolvedValue(sourced(new Map([[id(1), 5n]])))
    const good = identityBalance.fetch('mainnet', id(1))
    const bad = identityBalance.fetch('mainnet', 'notbase58').catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(15)
    expect((await good).data).toBe(5n)
    expect(await bad).toMatchObject({ message: expect.stringContaining('identity ID') as string })
    expect(call).toHaveBeenCalledWith('mainnet', 'identities.balances', { ids: [id(1)] })
  })

  describe('dpnsName', () => {
    it('queries the records.identity index once and gives an identity its oldest name', async () => {
      call.mockResolvedValue(
        sourced([
          domain('newer', id(1), 200),
          domain('older', id(1), 100),
          domain('only', id(2), null),
          {
            ...domain('dash', id(9), 1),
            data: { label: 'dash', normalizedParentDomainName: '', records: { identity: id(9) } },
          },
        ]),
      )
      const names = [id(1), id(2), id(3)].map((i) => dpnsName.fetch('mainnet', i))
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
        where: [['records.identity', 'in', [id(1), id(2), id(3)]]],
        orderBy: [['records.identity', 'asc']],
        limit: 100,
      })
    })

    it('asks dpns.usernames, four at a time, for the identities a full page may have cut off', async () => {
      const ids = Array.from({ length: 6 }, (_, i) => id(i + 30))
      const full = Array.from({ length: 100 }, (_, i) => domain(`n${i}`, id(30), i))
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
      const names = ids.map((i) => dpnsName.fetch('mainnet', i))
      await vi.advanceTimersByTimeAsync(40)
      const got = (await Promise.all(names)).map((n) => n.data)
      expect(got).toEqual(['n0.dash', ...Array.from({ length: 5 }, () => 'late.dash')])
      expect(peak).toBe(4)
    })

    it('keeps the names the query found when a fallback fails, and fails only that identity', async () => {
      const full = Array.from({ length: 100 }, (_, i) => domain(`n${i}`, id(30), i))
      call.mockImplementation((_net, method, args) => {
        if (method === 'documents.query') return Promise.resolve(sourced(full))
        return (args as { identityId: string }).identityId === id(31)
          ? Promise.reject(new Error('down'))
          : Promise.resolve(sourced(['late.dash']))
      })
      const found = dpnsName.fetch('mainnet', id(30))
      const failed = dpnsName.fetch('mainnet', id(31)).catch((e: unknown) => e)
      const late = dpnsName.fetch('mainnet', id(32))
      await vi.advanceTimersByTimeAsync(40)
      expect((await found).data).toBe('n0.dash')
      expect(await failed).toMatchObject({ message: 'down' })
      expect((await late).data).toBe('late.dash')
    })
  })
})
