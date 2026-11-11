import { create, fromBinary, toBinary } from '@bufbuild/protobuf'
import { QueryClient } from '@tanstack/query-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCoreLive, type CoreLiveDeps } from '@/data/core/live'
import type { DapiStreamHandle, DapiTransport } from '@/data/dapi-core'
import {
  BlockHeadersWithChainLocksRequestSchema,
  BlockHeadersWithChainLocksResponseSchema,
} from '@/data/dapi-core/gen/core/v0/core_pb'
import type { Sourced } from '@/data/envelope'
import { SourceError } from '@/data/errors'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const settle = (ms = 0) => vi.advanceTimersByTimeAsync(ms)
const NET = 'mainnet' as const

function header(timeS: number): Uint8Array {
  const out = new Uint8Array(80)
  new DataView(out.buffer).setUint32(68, timeS, true)
  return out
}
const headersMessage = (...times: number[]) =>
  toBinary(
    BlockHeadersWithChainLocksResponseSchema,
    create(BlockHeadersWithChainLocksResponseSchema, {
      responses: { case: 'blockHeaders', value: { headers: times.map(header) } },
    }),
  )
const chainLockMessage = (height: number) => {
  const lock = new Uint8Array(132)
  new DataView(lock.buffer).setUint32(0, height, true)
  return toBinary(
    BlockHeadersWithChainLocksResponseSchema,
    create(BlockHeadersWithChainLocksResponseSchema, {
      responses: { case: 'chainLock', value: lock },
    }),
  )
}

interface Script {
  messages: Uint8Array[]
  then: 'hold' | 'end' | Error
  /** Wait this long, then end (for `then: 'end'`). */
  afterMs?: number
}

function scriptedTransport(scripts: Script[]) {
  const opened: { fromHeight: number; avoidNode?: string; signal?: AbortSignal; node: string }[] =
    []
  const transport = {
    budget: { snapshot: () => ({}), canAfford: () => true, subscribe: () => () => undefined },
    unary: () => Promise.reject(new Error('unused')),
    stream(
      _net: string,
      _method: string,
      request: Uint8Array,
      opts?: { signal?: AbortSignal; avoidNode?: string },
    ): DapiStreamHandle {
      const script = scripts.shift() ?? { messages: [], then: 'hold' }
      const node = `10.0.0.${opened.length + 1}:443`
      const req = fromBinary(BlockHeadersWithChainLocksRequestSchema, request)
      opened.push({
        fromHeight: req.fromBlock.case === 'fromBlockHeight' ? req.fromBlock.value : -1,
        avoidNode: opts?.avoidNode,
        signal: opts?.signal,
        node,
      })
      return {
        node,
        messages: (async function* () {
          for (const m of script.messages) yield m
          if (script.then instanceof Error) throw script.then
          if (script.then === 'end') {
            if (script.afterMs) await new Promise((r) => setTimeout(r, script.afterMs))
            return
          }
          await new Promise<void>((_, reject) => {
            opts?.signal?.addEventListener('abort', () =>
              reject(new SourceError({ source: 'dapi', kind: 'aborted', message: 'aborted' })),
            )
          })
        })(),
      }
    },
  } as unknown as DapiTransport
  return { transport, opened }
}

function setup(scripts: Script[], overrides: Partial<CoreLiveDeps> = {}) {
  const { transport, opened } = scriptedTransport(scripts)
  const tipCalls: number[] = []
  const lag = vi.fn()
  const deps: CoreLiveDeps = {
    transport: () => transport,
    tip: () => {
      tipCalls.push(Date.now())
      return Promise.resolve({
        source: 'dapi',
        asOf: 0,
        fetchedAt: 0,
        proved: false,
        data: { height: 100, hash: 'h100', time: 1_000 },
      } as Sourced<{ height: number; hash: string; time: number }>)
    },
    headerHash: (h) =>
      Promise.resolve(`hash-${new DataView(h.buffer, h.byteOffset).getUint32(68, true)}`),
    decodeTx: () => Promise.reject(new Error('unused')),
    decodeIsLock: () => Promise.reject(new Error('unused')),
    now: () => Date.now(),
    health: { setLag: lag },
    ...overrides,
  }
  const live = createCoreLive(deps)
  const qc = new QueryClient()
  return { live, qc, opened, tipCalls, lag }
}

const tipOf = (qc: QueryClient) =>
  qc.getQueryData<Sourced<{ height: number; hash: string; time: number }>>([NET, 'dapi', 'tip'])

describe('coreLive.tip', () => {
  it('starts at the current tip and writes each new header into the tip query', async () => {
    const { live, qc, opened } = setup([
      { messages: [headersMessage(1_000), headersMessage(1_157)], then: 'hold' },
    ])
    live.tip(NET, qc)
    await settle(0)
    expect(opened[0]!.fromHeight).toBe(100)
    expect(tipOf(qc)).toMatchObject({
      source: 'dapi',
      proved: false,
      height: 101,
      data: { height: 101, hash: 'hash-1157', time: 1_157_000 },
    })
    expect(live.status(NET).state).toBe('live')
  })

  it('stamps the tip with the time we learned it, never the block time', async () => {
    const { live, qc } = setup([{ messages: [headersMessage(5)], then: 'hold' }])
    vi.setSystemTime(new Date('2026-11-10T12:00:00Z'))
    live.tip(NET, qc)
    await settle(0)
    const tip = tipOf(qc)!
    expect(tip.asOf).toBe(Date.parse('2026-11-10T12:00:00Z'))
    expect(tip.data.time).toBe(5_000)
  })

  it('writes ChainLocks into the chainlock query', async () => {
    const { live, qc } = setup([{ messages: [chainLockMessage(99)], then: 'hold' }])
    live.tip(NET, qc)
    await settle(0)
    expect(
      qc.getQueryData<Sourced<{ height: number }>>([NET, 'dapi', 'chainlock'])?.data.height,
    ).toBe(99)
  })

  it('invalidates the latest blocks view on every header', async () => {
    const { live, qc } = setup([{ messages: [headersMessage(1), headersMessage(2)], then: 'hold' }])
    const spy = vi.spyOn(qc, 'invalidateQueries')
    live.tip(NET, qc)
    await settle(0)
    expect(spy).toHaveBeenCalledWith({ queryKey: [NET, 'view', 'latest-blocks'] })
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('reconnects on another node from the last height when the stream drops', async () => {
    const { live, qc, opened } = setup([
      {
        messages: [headersMessage(1), headersMessage(2)],
        then: new SourceError({ source: 'dapi', kind: 'network', message: 'cut' }),
      },
      { messages: [headersMessage(3)], then: 'hold' },
    ])
    live.tip(NET, qc)
    await settle(0)
    expect(live.status(NET).state).toBe('reconnecting')
    await settle(1_000)
    expect(opened).toHaveLength(2)
    expect(opened[1]!.fromHeight).toBe(101)
    expect(opened[1]!.avoidNode).toBe(opened[0]!.node)
    expect(live.status(NET).state).toBe('live')
  })

  it('does not call the server cutting a stream at its 601 s a failure', async () => {
    const { live, qc, opened } = setup([
      { messages: [headersMessage(1)], then: 'end', afterMs: 601_000 },
      { messages: [], then: 'hold' },
    ])
    live.tip(NET, qc)
    await settle(601_500)
    expect(opened).toHaveLength(2)
    expect(opened[1]!.avoidNode).toBeUndefined()
  })

  it('reopens on another node, after a pause, when a stream ends cleanly at once', async () => {
    const { live, qc, opened } = setup([
      { messages: [headersMessage(1)], then: 'end' },
      { messages: [headersMessage(2)], then: 'hold' },
    ])
    live.tip(NET, qc)
    await settle(500)
    expect(opened).toHaveLength(1)
    await settle(600)
    expect(opened).toHaveLength(2)
    expect(opened[1]!.avoidNode).toBe(opened[0]!.node)
  })

  it('reopens a connection that goes silent for six minutes on mainnet', async () => {
    const { live, qc, opened } = setup([
      { messages: [headersMessage(1)], then: 'hold' },
      { messages: [headersMessage(2)], then: 'hold' },
    ])
    live.tip(NET, qc)
    await settle(5 * 60_000)
    expect(opened).toHaveLength(1)
    await settle(61_000 + 1_100)
    expect(opened).toHaveLength(2)
    expect(opened[1]!.avoidNode).toBe(opened[0]!.node)
  })

  it('does not close a quiet devnet connection', async () => {
    const { live, qc, opened } = setup([{ messages: [headersMessage(1)], then: 'hold' }])
    live.tip('devnet-x', qc)
    await settle(30 * 60_000)
    expect(opened).toHaveLength(1)
  })

  it('polls the tip every 30 s after three failures and says so', async () => {
    const down = () =>
      ({
        messages: [],
        then: new SourceError({ source: 'dapi', kind: 'network', message: 'down' }),
      }) as Script
    const { live, qc, tipCalls } = setup([down(), down(), down()])
    live.tip(NET, qc)
    await settle(1 + 1000 + 2000 + 100)
    expect(live.status(NET).state).toBe('polling')
    const before = tipCalls.length
    await settle(30_000)
    expect(tipCalls.length).toBeGreaterThan(before)
    expect(tipOf(qc)?.data.height).toBe(100)
  })

  it('says live updates stopped when neither the stream nor polling gets through', async () => {
    const down = () =>
      ({
        messages: [],
        then: new SourceError({ source: 'dapi', kind: 'network', message: 'down' }),
      }) as Script
    let polls = 0
    const { live, qc } = setup([down(), down(), down(), down()], {
      tip: () => {
        polls++
        return polls === 1
          ? Promise.resolve({
              source: 'dapi',
              asOf: 0,
              fetchedAt: 0,
              proved: false,
              data: { height: 100, hash: 'h', time: 1 },
            } as Sourced<{ height: number; hash: string; time: number }>)
          : Promise.reject(new SourceError({ source: 'dapi', kind: 'network', message: 'down' }))
      },
    })
    live.tip(NET, qc)
    await settle(1 + 1000 + 2000 + 100)
    expect(live.status(NET).state).toBe('stopped')
  })

  it('shares one stream between holders, closes it after the linger, and reports idle', async () => {
    const { live, qc, opened } = setup([{ messages: [headersMessage(1)], then: 'hold' }])
    const a = live.tip(NET, qc)
    const b = live.tip(NET, qc)
    await settle(0)
    expect(opened).toHaveLength(1)
    a()
    b()
    await settle(10_100)
    expect(opened[0]!.signal?.aborted).toBe(true)
    expect(live.status(NET).state).toBe('idle')
  })

  it('tells subscribers when the status changes', async () => {
    const { live, qc } = setup([{ messages: [headersMessage(1)], then: 'hold' }])
    const seen: string[] = []
    live.subscribe(() => seen.push(live.status(NET).state))
    live.tip(NET, qc)
    await settle(0)
    expect(seen).toContain('connecting')
    expect(seen).toContain('live')
  })

  it('marks DAPI stale after 20 quiet minutes', async () => {
    const { live, qc, lag } = setup([{ messages: [headersMessage(1)], then: 'hold' }])
    live.tip('devnet-x', qc)
    await settle(0)
    await settle(21 * 60_000)
    expect(lag).toHaveBeenCalledWith(
      'devnet-x',
      'dapi',
      expect.objectContaining({ ms: expect.any(Number) as number }),
    )
  })
})
