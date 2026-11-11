import { describe, expect, it, vi } from 'vitest'
import type { Sourced } from '@/data/envelope'
import type { HyStreamEvent, HyTxDetail } from '@/data/hyphen/schemas'
import { effectOn, watchAddress, type PendingTx } from './live'

const ADDRESS = 'XnT33zjrFKjt3ymfyQZs2FPiKNer3WVj14'
const OTHER = 'XmzJZQ5tib4NUwqXDH2fAg6jXUkYo4Gwmd'
const txid = (n: number) => n.toString(16).padStart(64, '0')

function detail(id: string, outs: [string, bigint][], ins: [string, bigint][] = []): HyTxDetail {
  return {
    txHash: id,
    txVersion: 3,
    txType: 'normal',
    txSize: 200,
    valueOut: outs.reduce((s, [, v]) => s + v, 0n),
    inputCount: ins.length,
    outputCount: outs.length,
    vin: ins.map(([address, value], n) => ({ n, sequence: 0, address, value })),
    vout: outs.map(([address, value], n) => ({ n, value, scriptPubKey: { hex: '' }, address })),
  }
}

const sourced = (data: HyTxDetail | null): Sourced<HyTxDetail | null> => ({
  source: 'hyphen',
  asOf: 1,
  fetchedAt: 1,
  proved: false,
  data,
})

const mempool = (id: string): HyStreamEvent => ({
  type: 'mempool_tx',
  ts: 1,
  payload: { txid: id },
})

async function* feed(events: HyStreamEvent[]): AsyncGenerator<HyStreamEvent> {
  await Promise.resolve()
  for (const e of events) yield e
}

describe('effectOn', () => {
  it('adds what an address receives and subtracts what it spends', () => {
    const tx = detail(
      txid(1),
      [
        [ADDRESS, 500n],
        [OTHER, 300n],
      ],
      [[ADDRESS, 900n]],
    )
    expect(effectOn(ADDRESS, tx)).toBe(-400n)
    expect(effectOn(OTHER, tx)).toBe(300n)
  })

  it('is undefined for a transaction that does not touch the address', () => {
    expect(effectOn(ADDRESS, detail(txid(2), [[OTHER, 1n]]))).toBeUndefined()
  })
})

describe('watchAddress', () => {
  function run(events: HyStreamEvent[], txs: Record<string, HyTxDetail | null>) {
    const controller = new AbortController()
    const pending: PendingTx[] = []
    const status: string[] = []
    const onBlock = vi.fn()
    const fetchTx = vi.fn((id: string) => Promise.resolve(sourced(txs[id] ?? null)))
    const done = watchAddress({
      address: ADDRESS,
      signal: controller.signal,
      open: () => Promise.resolve(feed(events)),
      fetchTx,
      onStatus: (s) => {
        status.push(s)
        if (s === 'reconnecting') controller.abort()
      },
      onPending: (p) => pending.push(p),
      onBlock,
      sleep: () => Promise.resolve(),
    })
    return { done, pending, status, onBlock, fetchTx }
  }

  it('reports a new transaction that pays the address, and ignores one that does not @IN-06', async () => {
    const mine = txid(10)
    const theirs = txid(11)
    const r = run([mempool(mine), mempool(theirs)], {
      [mine]: detail(mine, [[ADDRESS, 1_000n]]),
      [theirs]: detail(theirs, [[OTHER, 1_000n]]),
    })
    await r.done
    await vi.waitFor(() => expect(r.fetchTx).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(r.pending.map((p) => p.txid)).toEqual([mine]))
    expect(r.pending[0]?.net).toBe(1_000n)
    expect(r.status[0]).toBe('live')
  })

  it('fetches each transaction once even if the stream repeats it', async () => {
    const id = txid(20)
    const r = run([mempool(id), mempool(id)], { [id]: detail(id, [[ADDRESS, 1n]]) })
    await r.done
    await vi.waitFor(() => expect(r.pending).toHaveLength(1))
    expect(r.fetchTx).toHaveBeenCalledTimes(1)
  })

  it('tells the page a block was chain-locked', async () => {
    const r = run(
      [{ type: 'chain_lock', ts: 1, payload: { blockHash: txid(1), blockHeight: 5 } }],
      {},
    )
    await r.done
    expect(r.onBlock).toHaveBeenCalledTimes(1)
  })

  it('reconnects after the stream ends', async () => {
    const controller = new AbortController()
    let opens = 0
    const statuses: string[] = []
    await watchAddress({
      address: ADDRESS,
      signal: controller.signal,
      open: () => {
        opens++
        return Promise.resolve(feed([]))
      },
      fetchTx: () => Promise.resolve(sourced(null)),
      onStatus: (s) => {
        statuses.push(s)
        if (opens >= 2 && s === 'live') controller.abort()
      },
      onPending: () => undefined,
      onBlock: () => undefined,
      sleep: () => Promise.resolve(),
    })
    expect(opens).toBe(2)
    expect(statuses).toEqual(['live', 'reconnecting', 'live'])
  })

  it('fetches nothing while the tab is hidden and refreshes once when it returns', async () => {
    const controller = new AbortController()
    const fetchTx = vi.fn(() => Promise.resolve(sourced(null)))
    const onBlock = vi.fn()
    const statuses: string[] = []
    let hidden = true
    let change: () => void = () => undefined
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    async function* events(): AsyncGenerator<HyStreamEvent> {
      yield mempool(txid(30))
      yield mempool(txid(31))
      await gate
    }
    const done = watchAddress({
      address: ADDRESS,
      signal: controller.signal,
      open: () => Promise.resolve(events()),
      fetchTx,
      onStatus: (s) => statuses.push(s),
      onPending: () => undefined,
      onBlock,
      visibility: {
        hidden: () => hidden,
        subscribe: (cb) => {
          change = cb
          return () => undefined
        },
      },
      sleep: () => Promise.resolve(),
    })
    await vi.waitFor(() => expect(statuses).toContain('paused'))
    expect(fetchTx).not.toHaveBeenCalled()

    hidden = false
    change()

    expect(onBlock).toHaveBeenCalledTimes(1)
    expect(statuses.at(-1)).toBe('live')
    controller.abort()
    release()
    await done
  })

  it('stops fetching past the per-minute cap and says it is busy', async () => {
    const ids = Array.from({ length: 80 }, (_, i) => txid(100 + i))
    const controller = new AbortController()
    const fetchTx = vi.fn(() => Promise.resolve(sourced(null)))
    const statuses: string[] = []
    await watchAddress({
      address: ADDRESS,
      signal: controller.signal,
      open: () => Promise.resolve(feed(ids.map(mempool))),
      fetchTx,
      onStatus: (s) => {
        statuses.push(s)
        if (s === 'reconnecting') controller.abort()
      },
      onPending: () => undefined,
      onBlock: () => undefined,
      now: () => 1_000,
      sleep: () => Promise.resolve(),
    })
    expect(fetchTx.mock.calls.length).toBeLessThanOrEqual(60)
    expect(statuses).toContain('busy')
  })

  it('keeps backing off while a stream opens and ends at once', async () => {
    const controller = new AbortController()
    const waits: number[] = []
    let opens = 0
    await watchAddress({
      address: ADDRESS,
      signal: controller.signal,
      open: () => {
        opens++
        return Promise.resolve(feed([]))
      },
      fetchTx: () => Promise.resolve(sourced(null)),
      onStatus: () => undefined,
      onPending: () => undefined,
      onBlock: () => undefined,
      now: () => 0,
      sleep: (ms) => {
        waits.push(ms)
        if (waits.length === 5) controller.abort()
        return Promise.resolve()
      },
    })
    expect(opens).toBe(5)
    expect(waits).toEqual([2000, 4000, 8000, 16_000, 30_000])
  })

  it('goes back to the first delay once a stream has stayed open', async () => {
    const controller = new AbortController()
    const waits: number[] = []
    let clock = 0
    await watchAddress({
      address: ADDRESS,
      signal: controller.signal,
      open: () => {
        clock += 40_000
        return Promise.resolve(feed([]))
      },
      fetchTx: () => Promise.resolve(sourced(null)),
      onStatus: () => undefined,
      onPending: () => undefined,
      onBlock: () => undefined,
      now: () => clock,
      sleep: (ms) => {
        waits.push(ms)
        if (waits.length === 3) controller.abort()
        return Promise.resolve()
      },
    })
    expect(waits).toEqual([2000, 2000, 2000])
  })
})
