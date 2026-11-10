import { QueryClient } from '@tanstack/query-core'
import { describe, expect, it, vi } from 'vitest'
import {
  allowedItems,
  prefetchForRoute,
  registerSdkReadyProbe,
  defaultGates,
  routeNetwork,
  prefetchItem,
  type PrefetchGates,
  type PrefetchItem,
} from './loader'

const open: PrefetchGates = { dapi: () => true, sdkReady: () => true }
const closed: PrefetchGates = { dapi: () => false, sdkReady: () => false }

const item = (
  cost: PrefetchItem['cost'],
  key: string,
  flags: { wait?: boolean; detail?: boolean } = {},
  fn: () => Promise<unknown> = () => Promise.resolve(key),
  staleTime?: number,
): PrefetchItem =>
  prefetchItem(cost, { queryKey: ['mainnet', 'x', key], queryFn: fn, staleTime }, flags)

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

describe('allowedItems', () => {
  it('always lets HTTP through', () => {
    expect(allowedItems('mainnet', [item('http', 'a')], closed)).toHaveLength(1)
  })

  it('lets DAPI through only for a detail route, one call, with budget room', () => {
    const list = item('dapi', 'list')
    const one = item('dapi', 'one', { detail: true })
    const two = item('dapi', 'two', { detail: true })
    expect(allowedItems('mainnet', [list], open)).toEqual([])
    expect(allowedItems('mainnet', [one, two], open)).toEqual([one])
    expect(allowedItems('mainnet', [one], closed)).toEqual([])
  })

  it('lets the SDK through only when it is ready', () => {
    const sdk = item('sdk', 's')
    expect(allowedItems('mainnet', [sdk], closed)).toEqual([])
    expect(allowedItems('mainnet', [sdk], open)).toEqual([sdk])
  })

  it('asks the gate about the network the route names', () => {
    const dapi = vi.fn(() => true)
    allowedItems('testnet', [item('dapi', 'd', { detail: true })], { dapi, sdkReady: () => true })
    expect(dapi).toHaveBeenCalledWith('testnet')
  })
})

describe('defaultGates', () => {
  it('treats an unavailable budget as no room', () => {
    expect(defaultGates.dapi('mainnet')).toBe(false)
  })

  it('reads SDK readiness from the registered probe', () => {
    expect(defaultGates.sdkReady('mainnet')).toBe(false)
    registerSdkReadyProbe((net) => net === 'mainnet')
    expect(defaultGates.sdkReady('mainnet')).toBe(true)
    expect(defaultGates.sdkReady('testnet')).toBe(false)
    registerSdkReadyProbe(() => false)
  })
})

describe('prefetchForRoute', () => {
  it('fills the cache for items it waits on', async () => {
    const qc = client()
    await prefetchForRoute(qc, 'mainnet', [item('http', 'a', { wait: true })], { gates: open })
    expect(qc.getQueryData(['mainnet', 'x', 'a'])).toBe('a')
  })

  it('starts but does not wait for items without wait', async () => {
    const qc = client()
    let release!: () => void
    const slow = item('http', 'slow', {}, () => new Promise((r) => (release = () => r('late'))))
    await prefetchForRoute(qc, 'mainnet', [slow], { gates: open })
    expect(qc.getQueryData(['mainnet', 'x', 'slow'])).toBeUndefined()
    release()
    await vi.waitFor(() => expect(qc.getQueryData(['mainnet', 'x', 'slow'])).toBe('late'))
  })

  it('gives up waiting at the deadline', async () => {
    const qc = client()
    const stuck = item('http', 'stuck', { wait: true }, () => new Promise(() => undefined))
    const t0 = Date.now()
    await prefetchForRoute(qc, 'mainnet', [stuck], { gates: open, deadlineMs: 40 })
    expect(Date.now() - t0).toBeLessThan(500)
  })

  it('never rejects when a source fails', async () => {
    const qc = client()
    const bad = item('http', 'bad', { wait: true }, () => Promise.reject(new Error('boom')))
    await expect(prefetchForRoute(qc, 'mainnet', [bad], { gates: open })).resolves.toBeUndefined()
    expect(qc.getQueryData(['mainnet', 'x', 'bad'])).toBeUndefined()
  })

  it('does not wait while the router is only preloading', async () => {
    const qc = client()
    const fn = vi.fn(() => new Promise(() => undefined))
    await prefetchForRoute(qc, 'mainnet', [item('http', 'p', { wait: true }, fn)], {
      gates: open,
      preload: true,
    })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('skips what the gates refuse and does not call its fetch', async () => {
    const qc = client()
    const fn = vi.fn(() => Promise.resolve(1))
    await prefetchForRoute(qc, 'mainnet', [item('sdk', 's', { wait: true }, fn)], { gates: closed })
    expect(fn).not.toHaveBeenCalled()
  })

  it('reuses fresh data instead of refetching', async () => {
    const qc = client()
    const fn = vi.fn(() => Promise.resolve(1))
    const fresh = item('http', 'f', { wait: true }, fn, 60_000)
    await prefetchForRoute(qc, 'mainnet', [fresh], { gates: open })
    await prefetchForRoute(qc, 'mainnet', [fresh], { gates: open })
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('routeNetwork', () => {
  it('reads network and the legacy net, defaulting to mainnet', () => {
    expect(routeNetwork({})).toBe('mainnet')
    expect(routeNetwork({ network: 'testnet' })).toBe('testnet')
    expect(routeNetwork({ net: 'testnet' })).toBe('testnet')
    expect(routeNetwork({ network: 'nonsense' })).toBe('mainnet')
  })
})
