import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFetchGuard, SDK_MAX_WAIT_MS } from '@/data/sdk/worker/fetch-guard'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-10T12:00:00Z'))
})
afterEach(() => vi.useRealTimers())

const node = (host: string, method = 'getIdentity') =>
  `https://${host}/org.dash.platform.dapi.v0.Platform/${method}`
const ok = () => Promise.resolve(new Response('x'))

describe('the SDK worker’s fetch guard', () => {
  it('passes anything that is not a Platform call to a node straight through, unrecorded', async () => {
    const base = vi.fn(ok)
    const guard = createFetchGuard(base)
    await guard.fetch('https://quorums.example/masternodes')
    await guard.fetch('http://localhost:8080/org.dash.platform.dapi.v0.Platform/getIdentity')
    expect(base).toHaveBeenCalledTimes(2)
    expect(guard.drain()).toEqual([])
  })

  it('records each Platform request with its node, and hands the record over once', async () => {
    const guard = createFetchGuard(vi.fn(ok))
    await guard.fetch(node('1.1.1.1'))
    await guard.fetch(node('2.2.2.2'))
    expect(guard.drain().map((u) => u.host)).toEqual(['1.1.1.1', '2.2.2.2'])
    expect(guard.drain()).toEqual([])
  })

  it('holds a request that would pass the per-node minute budget until the window moves', async () => {
    const base = vi.fn(ok)
    const guard = createFetchGuard(base, { perNode: 3 })
    for (let i = 0; i < 3; i++) await guard.fetch(node('1.1.1.1'))
    const fourth = guard.fetch(node('1.1.1.1'))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(base).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(SDK_MAX_WAIT_MS)
    const res = await fourth
    expect(res.headers.get('grpc-status')).toBe('8')
    expect(base).toHaveBeenCalledTimes(3)
  })

  it('serves the held request when the window frees up inside the wait limit', async () => {
    const base = vi.fn(ok)
    const guard = createFetchGuard(base, { perNode: 2 })
    await guard.fetch(node('1.1.1.1'))
    await vi.advanceTimersByTimeAsync(50_000)
    await guard.fetch(node('1.1.1.1'))
    const third = guard.fetch(node('1.1.1.1'))
    await vi.advanceTimersByTimeAsync(11_000)
    expect((await third).headers.get('grpc-status')).toBeNull()
    expect(base).toHaveBeenCalledTimes(3)
  })

  it('does not slow a second node because the first is spent', async () => {
    const base = vi.fn(ok)
    const guard = createFetchGuard(base, { perNode: 1 })
    await guard.fetch(node('1.1.1.1'))
    await guard.fetch(node('2.2.2.2'))
    expect(base).toHaveBeenCalledTimes(2)
  })

  it('keeps at most four requests in flight on a node', async () => {
    const release: (() => void)[] = []
    const base = vi.fn(
      () => new Promise<Response>((resolve) => release.push(() => resolve(new Response('x')))),
    )
    const guard = createFetchGuard(base)
    const all = Array.from({ length: 6 }, () => guard.fetch(node('1.1.1.1')))
    await vi.advanceTimersByTimeAsync(10)
    expect(base).toHaveBeenCalledTimes(4)
    release.splice(0).forEach((r) => r())
    await vi.advanceTimersByTimeAsync(300)
    expect(base).toHaveBeenCalledTimes(6)
    release.splice(0).forEach((r) => r())
    await Promise.all(all)
  })

  it('leaves a node alone until its window resets once it says it is nearly spent', async () => {
    const base = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('x', { headers: { 'ratelimit-remaining': '5', 'ratelimit-reset': '10' } }),
      )
      .mockImplementation(ok)
    const guard = createFetchGuard(base)
    await guard.fetch(node('1.1.1.1'))
    const next = guard.fetch(node('1.1.1.1'))
    await vi.advanceTimersByTimeAsync(9_000)
    expect(base).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2_000)
    await next
    expect(base).toHaveBeenCalledTimes(2)
  })

  it('pauses a node that answers rate limited, for the reset it names (at most two minutes)', async () => {
    const base = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { headers: { 'grpc-status': '8', 'ratelimit-reset': '1700000000' } }),
      )
      .mockImplementation(ok)
    const guard = createFetchGuard(base)
    await guard.fetch(node('1.1.1.1'))
    const next = guard.fetch(node('1.1.1.1'))
    await vi.advanceTimersByTimeAsync(SDK_MAX_WAIT_MS + 1_000)
    expect((await next).headers.get('grpc-status')).toBe('8')
    expect(base).toHaveBeenCalledTimes(1)
  })
})
