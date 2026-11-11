import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BACKOFF_MAX_MS,
  DEGRADE_AFTER_FAILURES,
  SharedStream,
  STREAM_LINGER_MS,
  backoffMs,
  type SessionContext,
} from '@/data/dapi-core/streams'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const settle = (ms = 0) => vi.advanceTimersByTimeAsync(ms)

describe('backoff', () => {
  it('doubles from 1 s up to 30 s', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(backoffMs)).toEqual([
      1000,
      2000,
      4000,
      8000,
      16000,
      BACKOFF_MAX_MS,
      BACKOFF_MAX_MS,
    ])
  })
})

describe('SharedStream', () => {
  it('opens one connection for any number of holders and closes it 10 s after the last leaves', async () => {
    const opened: SessionContext[] = []
    const stream = new SharedStream({
      session: (ctx) =>
        new Promise<void>((resolve) => {
          opened.push(ctx)
          ctx.signal.addEventListener('abort', () => resolve())
        }),
    })
    const a = stream.retain()
    const b = stream.retain()
    await settle()
    expect(opened).toHaveLength(1)
    a()
    await settle(STREAM_LINGER_MS + 1)
    expect(opened[0]!.signal.aborted).toBe(false)
    b()
    await settle(STREAM_LINGER_MS - 1)
    expect(opened[0]!.signal.aborted).toBe(false)
    await settle(2)
    expect(opened[0]!.signal.aborted).toBe(true)
    expect(stream.state).toBe('idle')
  })

  it('keeps the connection when a holder returns during the linger', async () => {
    const opened: SessionContext[] = []
    const stream = new SharedStream({
      session: (ctx) =>
        new Promise<void>((resolve) => {
          opened.push(ctx)
          ctx.signal.addEventListener('abort', () => resolve())
        }),
    })
    stream.retain()()
    await settle(STREAM_LINGER_MS - 100)
    const again = stream.retain()
    await settle(STREAM_LINGER_MS * 2)
    expect(opened).toHaveLength(1)
    expect(opened[0]!.signal.aborted).toBe(false)
    again()
  })

  it('reopens after a failure with backoff 1, 2, 4 s and asks to avoid the node that failed', async () => {
    const contexts: SessionContext[] = []
    const times: number[] = []
    const stream = new SharedStream({
      session: (ctx) => {
        contexts.push(ctx)
        times.push(Date.now())
        ctx.markLive(`node-${contexts.length}`)
        return Promise.reject(new Error('dropped'))
      },
    })
    stream.retain()
    await settle(0)
    // A drop soon after opening is a failure however many messages came first, so the wait doubles.
    await settle(1000)
    expect(contexts).toHaveLength(2)
    expect(contexts[1]!.avoidNode).toBe('node-1')
    await settle(1999)
    expect(contexts).toHaveLength(2)
    await settle(1)
    expect(contexts).toHaveLength(3)
    expect(contexts[2]!.failures).toBe(2)
  })

  it('doubles the wait while connections fail before delivering anything', async () => {
    const times: number[] = []
    const stream = new SharedStream({
      session: () => {
        times.push(Date.now())
        return Promise.reject(new Error('refused'))
      },
    })
    stream.retain()
    await settle(1 + 1000 + 2000 + 4000 + 8000)
    expect(times.slice(1).map((t, i) => t - times[i]!)).toEqual([1000, 2000, 4000, 8000])
  })

  it('treats a connection the server cuts after its 601 s as a clean reconnect, not a failure', async () => {
    const failures: number[] = []
    const avoided: (string | undefined)[] = []
    const stream = new SharedStream({
      session: async (ctx) => {
        failures.push(ctx.failures)
        avoided.push(ctx.avoidNode)
        ctx.markLive('n')
        await new Promise((r) => setTimeout(r, 601_000))
      },
    })
    stream.retain()
    await settle(601_000 * 3)
    expect(failures.length).toBeGreaterThanOrEqual(3)
    expect(failures.every((f) => f === 0)).toBe(true)
    expect(stream.state).not.toBe('degraded')
  })

  it('backs off when a connection ends cleanly but early, instead of reopening at once', async () => {
    let n = 0
    const avoided: (string | undefined)[] = []
    const stream = new SharedStream({
      session: (ctx) => {
        n++
        avoided.push(ctx.avoidNode)
        ctx.markLive('same-node')
        return Promise.resolve()
      },
    })
    stream.retain()
    await settle(60_000)
    expect(n).toBeLessThanOrEqual(8)
    expect(avoided[1]).toBe('same-node')
  })

  it('starts the backoff over only once a connection has stayed up for a minute', async () => {
    const failures: number[] = []
    let n = 0
    const stream = new SharedStream({
      session: async (ctx) => {
        failures.push(ctx.failures)
        n++
        ctx.markLive('x')
        if (n === 1) throw new Error('early')
        await new Promise((r) => setTimeout(r, 90_000))
        throw new Error('late')
      },
    })
    stream.retain()
    await settle(1_000 + 90_000 + 5)
    expect(failures.slice(0, 2)).toEqual([0, 1])
    await settle(1_000)
    expect(failures[2]).toBe(1)
  })

  it('hands over to its fallback after three failures in a row, then tries again', async () => {
    let sessions = 0
    const degraded = vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 120_000)
          signal.addEventListener('abort', () => resolve())
        }),
    )
    const stream = new SharedStream({
      session: () => {
        sessions++
        return Promise.reject(new Error('down'))
      },
      degraded,
    })
    stream.retain()
    await settle(1 + 1000 + 2000)
    expect(sessions).toBe(DEGRADE_AFTER_FAILURES)
    expect(degraded).toHaveBeenCalledTimes(1)
    expect(stream.state).toBe('degraded')
    await settle(120_000)
    expect(sessions).toBe(DEGRADE_AFTER_FAILURES + 1)
  })
})
