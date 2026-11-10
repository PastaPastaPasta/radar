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

const mempool = (id: string): HyStreamEvent => ({ type: 'mempool_tx', ts: 1, payload: { txid: id } })

async function* feed(events: HyStreamEvent[]): AsyncGenerator<HyStreamEvent> {
  for (const e of events) yield e
}

describe('effectOn', () => {
  it('adds what an address receives and subtracts what it spends', () => {
    const tx = detail(txid(1), [[ADDRESS, 500n], [OTHER, 300n]], [[ADDRESS, 900n]])
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
    const r = run([{ type: 'chain_lock', ts: 1, payload: { blockHash: txid(1), blockHeight: 5 } }], {})
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
})
