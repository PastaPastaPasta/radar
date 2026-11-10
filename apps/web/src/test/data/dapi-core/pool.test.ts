import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SourceError } from '@/data/errors'
import { bestHeightReply, fakeFetch, grpcFail, grpcOk, hang, type FakeCall } from '@/test/grpc-fake'
import {
  ATTEMPT_TIMEOUT_MS,
  HEDGE_AFTER_MS,
  PoolDapiTransport,
  QUEUE_TIMEOUT_MS,
} from '@/data/dapi-core/pool'

const NET = 'devnet-t' as const
const hosts = (n: number) => Array.from({ length: n }, (_, i) => `10.1.0.${i}:443`)
const request = new Uint8Array([1])

function setup(opts: {
  nodes?: number
  handler: (call: FakeCall, init?: RequestInit) => Response | Promise<Response>
}) {
  const addresses = hosts(opts.nodes ?? 12)
  const fetcher = fakeFetch(opts.handler)
  const health = { report: vi.fn(), setBudget: vi.fn() }
  const transport = new PoolDapiTransport({
    fetch: fetcher.fetch,
    now: () => Date.now(),
    random: () => 0.5,
    devnets: () => [{ name: 't', dapiAddresses: addresses }],
    health,
  })
  return { transport, health, ...fetcher }
}

const ok = () => grpcOk([bestHeightReply(100)])
const settle = (ms = 0) => vi.advanceTimersByTimeAsync(ms)
const caught = (p: Promise<unknown>) => p.catch((e: unknown) => e)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-10T12:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('PoolDapiTransport unary', () => {
  it('answers from a node and names it', async () => {
    const { transport, health } = setup({ handler: ok })
    const reply = await transport.unary(NET, 'getBestBlockHeight', request)
    expect(reply.node).toMatch(/^10\.1\.0\.\d+:443$/)
    expect(reply.response.length).toBeGreaterThan(0)
    expect(health.report).toHaveBeenCalledWith(NET, 'dapi', expect.objectContaining({ ok: true }))
  })

  it('sends the same request to a node a second time only within its 50-a-minute budget', async () => {
    const { transport, calls } = setup({ nodes: 1, handler: ok })
    for (let i = 0; i < 50; i++) await transport.unary(NET, 'getBestBlockHeight', request)
    expect(calls).toHaveLength(50)
    const late = transport.unary(NET, 'getBestBlockHeight', request)
    await settle(59_000)
    expect(calls).toHaveLength(50)
    await settle(2_000)
    await late
    expect(calls).toHaveLength(51)
  })

  it('treats NOT_FOUND as an answer: one call, no bench, no retry', async () => {
    const { transport, calls, health } = setup({ handler: () => grpcFail(5, 'not found') })
    const e = await caught(transport.unary(NET, 'getTransaction', request))
    expect(e).toMatchObject({ kind: 'http', status: 5 })
    expect(calls).toHaveLength(1)
    expect(transport.budget.snapshot(NET).benched).toBe(0)
    expect(health.report).toHaveBeenCalledWith(NET, 'dapi', expect.objectContaining({ ok: true }))
  })

  it('benches a node that cannot be reached for the session and retries on another', async () => {
    let first: string | undefined
    const { transport, calls } = setup({
      handler: (c) => {
        first ??= c.host
        return c.host === first ? Promise.reject(new TypeError('Failed to fetch')) : ok()
      },
    })
    const reply = await transport.unary(NET, 'getBestBlockHeight', request)
    expect(reply.node).not.toBe(first)
    expect(calls).toHaveLength(2)
    expect(transport.budget.snapshot(NET).benched).toBe(1)
    await settle(24 * 3_600_000)
    expect(transport.budget.snapshot(NET).benched).toBe(1)
  })

  it('tries at most 3 distinct nodes, then fails with the last error', async () => {
    const { transport, calls } = setup({ handler: () => grpcFail(14, 'unavailable') })
    const e = await caught(transport.unary(NET, 'getBestBlockHeight', request))
    expect(e).toBeInstanceOf(SourceError)
    expect(e).toMatchObject({ kind: 'http', status: 14 })
    expect(calls).toHaveLength(3)
    expect(new Set(calls.map((c) => c.host)).size).toBe(3)
  })

  it('benches a rate-limited node until ratelimit-reset and moves on', async () => {
    let limited: string | undefined
    const { transport, calls } = setup({
      handler: (c) => {
        limited ??= c.host
        return c.host === limited ? grpcFail(8, 'rate limited', { 'ratelimit-reset': '17' }) : ok()
      },
    })
    await transport.unary(NET, 'getBestBlockHeight', request)
    expect(calls).toHaveLength(2)
    expect(transport.budget.snapshot(NET).benched).toBe(1)
    await settle(17_001)
    expect(transport.budget.snapshot(NET).benched).toBe(0)
  })

  it('gives each attempt 8 s, then times out and tries another node', async () => {
    let first: string | undefined
    const { transport, calls } = setup({
      handler: (c) => {
        first ??= c.host
        return c.host === first ? hang() : ok()
      },
    })
    const pending = transport.unary(NET, 'getBestBlockHeight', request)
    // The hedge goes first (1.5 s); stop it from answering so the timeout is what ends the attempt.
    await settle(ATTEMPT_TIMEOUT_MS + 100)
    const reply = await pending
    expect(reply.node).not.toBe(first)
    expect(calls.length).toBeGreaterThanOrEqual(2)
  })

  it('sends a hedge to a second node after 1.5 s and takes the first answer', async () => {
    let first: string | undefined
    const { transport, calls } = setup({
      handler: (c) => {
        first ??= c.host
        return c.host === first ? hang() : ok()
      },
    })
    const pending = transport.unary(NET, 'getBestBlockHeight', request)
    await settle(HEDGE_AFTER_MS - 10)
    expect(calls).toHaveLength(1)
    await settle(20)
    const reply = await pending
    expect(calls).toHaveLength(2)
    expect(reply.node).toBe(calls[1]!.host)
    expect(transport.budget.snapshot(NET).usedLastMinute).toBe(2)
  })

  it('does not hedge when pressure is not ok', async () => {
    const bad = new Set<string>()
    let phase: 'break' | 'slow' = 'break'
    const { transport, calls } = setup({
      nodes: 12,
      handler: (c) => {
        if (phase === 'break') {
          bad.add(c.host)
          return grpcFail(14, 'unavailable')
        }
        return new Promise<Response>((r) => setTimeout(() => r(ok()), 3_000))
      },
    })
    await caught(transport.unary(NET, 'getBestBlockHeight', request))
    expect(bad.size).toBe(3)
    expect(transport.budget.snapshot(NET).pressure).toBe('tight')
    phase = 'slow'
    const before = calls.length
    const pending = transport.unary(NET, 'getBestBlockHeight', request)
    await settle(HEDGE_AFTER_MS + 10)
    expect(calls.length - before).toBe(1)
    await settle(3_000)
    await pending
  })

  it('serves detail requests before list and prefetch ones when the budget is short', async () => {
    const order: string[] = []
    const { transport } = setup({ nodes: 1, handler: ok })
    for (let i = 0; i < 50; i++) await transport.unary(NET, 'getBestBlockHeight', request)
    const waits = [
      transport
        .unary(NET, 'getBlock', new Uint8Array([2]), { priority: 'prefetch' })
        .then(() => order.push('prefetch')),
      transport
        .unary(NET, 'getBlock', new Uint8Array([3]), { priority: 'list' })
        .then(() => order.push('list')),
      transport
        .unary(NET, 'getBlock', new Uint8Array([4]), { priority: 'detail' })
        .then(() => order.push('detail')),
    ]
    await settle(61_000)
    await Promise.all(waits)
    expect(order).toEqual(['detail', 'list', 'prefetch'])
  })

  it('never goes out early: a node that is spent stays unused, and the waiting request gives up after 70 s', async () => {
    const { transport, calls } = setup({
      nodes: 1,
      handler: () =>
        grpcOk([bestHeightReply(5)], { 'ratelimit-remaining': '0', 'ratelimit-reset': '300' }),
    })
    await transport.unary(NET, 'getBestBlockHeight', request)
    const waiting = caught(transport.unary(NET, 'getBlock', new Uint8Array([9])))
    await settle(QUEUE_TIMEOUT_MS + 100)
    expect(await waiting).toMatchObject({ kind: 'rate-limited' })
    expect(calls).toHaveLength(1)
  })

  it('keeps at most 4 requests in flight on a node', async () => {
    const { transport, calls } = setup({ nodes: 1, handler: () => hang() })
    const ctrl = new AbortController()
    const all = Array.from({ length: 6 }, (_, i) =>
      caught(transport.unary(NET, 'getBlock', new Uint8Array([i]), { signal: ctrl.signal })),
    )
    await settle(10)
    expect(calls.length).toBe(4)
    ctrl.abort()
    await Promise.all(all)
  })

  it('stops using a node for the rest of the window once the server says fewer than 30 are left', async () => {
    const { transport, calls } = setup({
      nodes: 1,
      handler: () =>
        grpcOk([bestHeightReply(5)], { 'ratelimit-remaining': '12', 'ratelimit-reset': '20' }),
    })
    await transport.unary(NET, 'getBestBlockHeight', request)
    const next = transport.unary(NET, 'getBestBlockHeight', request)
    await settle(19_000)
    expect(calls).toHaveLength(1)
    await settle(1_500)
    await next
    expect(calls).toHaveLength(2)
  })

  it('reports the budget snapshot to the health registry as it changes', async () => {
    const { transport, health } = setup({ handler: ok })
    await transport.unary(NET, 'getBestBlockHeight', request)
    expect(health.setBudget).toHaveBeenCalled()
    const last = health.setBudget.mock.calls.at(-1)!
    expect(last[0]).toBe(NET)
    expect(last[1]).toMatchObject({ capacity: 400, usedLastMinute: 1 })
  })

  it('asks the node it was told to, for a node status', async () => {
    const { transport, calls } = setup({ handler: ok })
    await transport.unary(NET, 'getMasternodeStatus', request, { nodeUrl: 'https://9.9.9.9:443' })
    expect(calls.map((c) => c.host)).toEqual(['9.9.9.9:443'])
  })

  it('rejects when the network has no known node', async () => {
    const transport = new PoolDapiTransport({
      fetch: fakeFetch(ok).fetch,
      devnets: () => [],
      health: { report: vi.fn(), setBudget: vi.fn() },
    })
    expect(await caught(transport.unary(NET, 'getBestBlockHeight', request))).toMatchObject({
      kind: 'unavailable',
    })
  })

  it('aborts a waiting request when its signal fires', async () => {
    const { transport } = setup({ nodes: 1, handler: () => hang() })
    const ctrl = new AbortController()
    const p = caught(transport.unary(NET, 'getBlock', request, { signal: ctrl.signal }))
    await settle(10)
    ctrl.abort()
    expect(await p).toMatchObject({ kind: 'aborted' })
  })

  it('before any call, reports a budget with room so a first list is not sent to Hyphen', () => {
    const { transport } = setup({ handler: ok })
    expect(transport.budget.snapshot(NET).pressure).toBe('ok')
    expect(transport.budget.canAfford(NET, 21)).toBe(true)
  })
})

describe('PoolDapiTransport streams', () => {
  const messages = [new Uint8Array([1]), new Uint8Array([2])]

  it('opens a stream on one node and yields its messages', async () => {
    const { transport, calls } = setup({ handler: () => grpcOk(messages) })
    const handle = transport.stream(NET, 'subscribeToBlockHeadersWithChainLocks', request)
    const got: number[] = []
    for await (const m of handle.messages) got.push(m[0]!)
    expect(got).toEqual([1, 2])
    expect(handle.node).toBe(calls[0]!.host)
    expect(transport.budget.snapshot(NET).usedLastMinute).toBe(1)
  })

  it('does not hold an in-flight slot while the stream is open', async () => {
    const { transport, calls } = setup({ nodes: 1, handler: () => grpcOk(messages) })
    const handles = Array.from({ length: 5 }, () =>
      transport.stream(NET, 'subscribeToBlockHeadersWithChainLocks', request),
    )
    const iterators = handles.map((h) => h.messages[Symbol.asyncIterator]())
    for (const it of iterators) await it.next()
    expect(calls).toHaveLength(5)
  })

  it('opens on a different node when told to avoid the last one', async () => {
    const { transport, calls } = setup({ handler: () => grpcOk(messages) })
    const first = transport.stream(NET, 'subscribeToBlockHeadersWithChainLocks', request)
    for await (const m of first.messages) void m
    const again = transport.stream(NET, 'subscribeToBlockHeadersWithChainLocks', request, {
      avoidNode: first.node,
    })
    for await (const m of again.messages) void m
    expect(calls[1]!.host).not.toBe(calls[0]!.host)
  })

  it('fails over when a node cannot open the stream', async () => {
    let first: string | undefined
    const { transport, calls } = setup({
      handler: (c) => {
        first ??= c.host
        return c.host === first ? grpcFail(14, 'no healthy upstream') : grpcOk(messages)
      },
    })
    const handle = transport.stream(NET, 'subscribeToTransactionsWithProofs', request)
    const got: number[] = []
    for await (const m of handle.messages) got.push(m[0]!)
    expect(got).toEqual([1, 2])
    expect(calls).toHaveLength(2)
  })

  it('stops on abort without reporting a failure', async () => {
    const { transport, health } = setup({
      handler: (_c, init) =>
        new Response(
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener('abort', () =>
                controller.error(new DOMException('aborted', 'AbortError')),
              )
            },
          }),
          { status: 200 },
        ),
    })
    const ctrl = new AbortController()
    const handle = transport.stream(NET, 'subscribeToBlockHeadersWithChainLocks', request, {
      signal: ctrl.signal,
    })
    const next = caught(handle.messages[Symbol.asyncIterator]().next())
    await settle(10)
    ctrl.abort()
    expect(await next).toMatchObject({ kind: 'aborted' })
    expect(health.report.mock.calls.some((c) => (c[2] as { ok: boolean }).ok === false)).toBe(false)
  })
})
