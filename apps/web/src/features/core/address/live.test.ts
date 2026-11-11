import { describe, expect, it, vi } from 'vitest'
import type { LiveTxEvent, LiveTxStatus } from '@/data/core/live'
import type { DecodedTx } from '@/data/core/types'
import type { Sourced } from '@/data/envelope'
import type { HyAddressTx } from '@/data/hyphen/schemas'
import { effectOn, watchAddress, type PendingTx, type WatchOptions } from './live'

const ADDRESS = 'XnT33zjrFKjt3ymfyQZs2FPiKNer3WVj14'
const OTHER = 'XmzJZQ5tib4NUwqXDH2fAg6jXUkYo4Gwmd'
const txid = (n: number) => n.toString(16).padStart(64, '0')
const nothing = () => undefined

function tx(id: string, outs: [string, bigint][], ins: string[] = []): DecodedTx {
  return {
    txid: id,
    type: 'transfer',
    version: 2,
    lockTime: 0,
    size: 200,
    inputs: ins.map((outpoint) => {
      const [prev, vout] = outpoint.split(':')
      return { txid: prev!, vout: Number(vout), scriptSig: '', sequence: 0 }
    }),
    outputs: outs.map(([address, value]) => ({ address, value, scriptPubKey: '' })),
  }
}

function row(id: string, netValue: bigint, blockHeight = 100): HyAddressTx {
  return {
    txHash: id,
    blockHeight,
    blockTime: 1_000,
    txType: 'normal',
    valueOut: netValue,
    netValue,
    direction: 'in',
  }
}

const page = (rows: HyAddressTx[]): Sourced<HyAddressTx[]> => ({
  source: 'hyphen',
  asOf: 1,
  fetchedAt: 1,
  proved: false,
  data: rows,
})

function fakeDapi(initial: LiveTxStatus = { state: 'live', fallbackHint: false }) {
  let status = initial
  const listeners = new Set<(e: LiveTxEvent) => void>()
  const watchers = new Set<() => void>()
  return {
    api: {
      transactions(listener: (e: LiveTxEvent) => void) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      status: () => status,
      subscribe(cb: () => void) {
        watchers.add(cb)
        return () => watchers.delete(cb)
      },
    },
    emit: (e: LiveTxEvent) => {
      for (const l of [...listeners]) l(e)
    },
    set(next: LiveTxStatus) {
      status = next
      for (const cb of [...watchers]) cb()
    },
    get open() {
      return listeners.size
    },
  }
}

function run(overrides: Partial<WatchOptions> = {}, dapi = fakeDapi()) {
  const controller = new AbortController()
  const pending: PendingTx[] = []
  const status: string[] = []
  const onBlock = vi.fn()
  const recent =
    overrides.recent ?? vi.fn((): Promise<Sourced<HyAddressTx[]>> => Promise.resolve(page([])))
  watchAddress({
    address: ADDRESS,
    signal: controller.signal,
    dapi: dapi.api,
    spendable: () => undefined,
    every: 30_000,
    onStatus: (s) => status.push(s),
    onPending: (p) => pending.push(p),
    onBlock,
    ...overrides,
    recent,
  })
  return { controller, dapi, pending, status, onBlock, recent }
}

describe('effectOn', () => {
  it('adds what an address receives and subtracts the outputs of it that are spent', () => {
    const spendable = (o: string) => (o === `${txid(1)}:0` ? 900n : undefined)
    const t = tx(
      txid(2),
      [
        [ADDRESS, 500n],
        [OTHER, 300n],
      ],
      [`${txid(1)}:0`],
    )
    expect(effectOn(ADDRESS, t, spendable)).toBe(-400n)
    expect(effectOn(OTHER, t, () => undefined)).toBe(300n)
  })

  it('is undefined for a transaction that does not touch the address', () => {
    expect(effectOn(ADDRESS, tx(txid(3), [[OTHER, 1n]]), () => undefined)).toBeUndefined()
  })
})

describe('watchAddress', () => {
  it('reports a new DAPI transaction that pays the address, without asking Hyphen @IN-06', () => {
    const r = run()
    r.dapi.emit({ kind: 'tx', tx: tx(txid(10), [[ADDRESS, 1_000n]]) })
    r.dapi.emit({ kind: 'tx', tx: tx(txid(11), [[OTHER, 1_000n]]) })
    expect(r.pending.map((p) => p.txid)).toEqual([txid(10)])
    expect(r.pending[0]).toMatchObject({ net: 1_000n, confirmed: false })
    expect(r.pending[0]!.stamp).toMatchObject({ source: 'dapi', proved: false })
    expect(r.status).toEqual(['live'])
    expect(r.recent).not.toHaveBeenCalled()
    r.controller.abort()
    expect(r.dapi.open).toBe(0)
  })

  it('reports each transaction once even if the feed repeats it', () => {
    const r = run()
    const t = tx(txid(20), [[ADDRESS, 5n]])
    r.dapi.emit({ kind: 'tx', tx: t })
    r.dapi.emit({ kind: 'tx', tx: t })
    expect(r.pending).toHaveLength(1)
  })

  it('counts a spend of an unspent output the page knows, or of an output it just saw @IN-06', () => {
    const r = run({ spendable: (o) => (o === `${txid(1)}:0` ? 1_000n : undefined) })
    r.dapi.emit({ kind: 'tx', tx: tx(txid(30), [[OTHER, 900n]], [`${txid(1)}:0`]) })
    r.dapi.emit({ kind: 'tx', tx: tx(txid(31), [[ADDRESS, 700n]]) })
    r.dapi.emit({ kind: 'tx', tx: tx(txid(32), [[OTHER, 600n]], [`${txid(31)}:0`]) })
    expect(r.pending.map((p) => p.net)).toEqual([-1_000n, 700n, -700n])
  })

  it('passes on the transactions a new block confirmed', () => {
    const r = run()
    r.dapi.emit({ kind: 'block', txids: [txid(40)] })
    expect(r.onBlock).toHaveBeenCalledWith(new Set([txid(40)]))
  })

  it('says connecting, then reconnecting, then live as the DAPI feed does', () => {
    const dapi = fakeDapi({ state: 'connecting', fallbackHint: false })
    const r = run({}, dapi)
    dapi.set({ state: 'reconnecting', fallbackHint: false })
    dapi.set({ state: 'live', fallbackHint: false })
    expect(r.status).toEqual(['connecting', 'reconnecting', 'live'])
  })

  it('lets go of the feed while the tab is hidden and refreshes once when it returns', () => {
    let hidden = true
    let change: () => void = nothing
    const r = run({
      visibility: {
        hidden: () => hidden,
        subscribe: (cb) => {
          change = cb
          return nothing
        },
      },
    })
    expect(r.status).toEqual(['paused'])
    expect(r.dapi.open).toBe(0)

    hidden = false
    change()
    expect(r.dapi.open).toBe(1)
    expect(r.onBlock).toHaveBeenCalledTimes(1)
    expect(r.onBlock).toHaveBeenCalledWith()
    expect(r.status.at(-1)).toBe('live')

    hidden = true
    change()
    expect(r.dapi.open).toBe(0)
    expect(r.status.at(-1)).toBe('paused')
  })
})

describe('watchAddress fallback', () => {
  /** A sleep that waits for the test to let the next read happen. */
  function stepper() {
    const wakes: (() => void)[] = []
    return {
      sleep: (_ms: number, signal: AbortSignal) =>
        new Promise<void>((resolve) => {
          wakes.push(resolve)
          signal.addEventListener('abort', () => resolve(), { once: true })
        }),
      async next() {
        await vi.waitFor(() => expect(wakes.length).toBeGreaterThan(0))
        wakes.shift()!()
      },
    }
  }

  it('reads the address history only once DAPI has given up, and reports what is new as confirmed @IN-06', async () => {
    const dapi = fakeDapi({ state: 'reconnecting', fallbackHint: false })
    const step = stepper()
    const looks = [[row(txid(2), 10n)], [row(txid(3), -4n), row(txid(2), 10n)]]
    const r = run(
      {
        sleep: step.sleep,
        recent: vi.fn(() => Promise.resolve(page(looks.shift() ?? []))),
      },
      dapi,
    )
    expect(r.recent).not.toHaveBeenCalled()

    dapi.set({ state: 'reconnecting', fallbackHint: true })
    expect(r.status.at(-1)).toBe('live')
    await vi.waitFor(() => expect(r.recent).toHaveBeenCalledTimes(1))
    expect(r.pending).toEqual([])

    await step.next()
    await vi.waitFor(() => expect(r.pending).toHaveLength(1))
    expect(r.pending[0]).toMatchObject({ txid: txid(3), net: -4n, confirmed: true })
    expect(r.pending[0]!.stamp.source).toBe('hyphen')
    expect(r.onBlock).toHaveBeenCalledWith(new Set([txid(3), txid(2)]))
    r.controller.abort()
  })

  it('stops reading Hyphen as soon as DAPI is live again @IN-06', async () => {
    const dapi = fakeDapi({ state: 'reconnecting', fallbackHint: true })
    const step = stepper()
    const r = run({ sleep: step.sleep }, dapi)
    await vi.waitFor(() => expect(r.recent).toHaveBeenCalledTimes(1))
    dapi.set({ state: 'live', fallbackHint: false })
    await step.next().catch(nothing)
    await Promise.resolve()
    expect(r.recent).toHaveBeenCalledTimes(1)
    r.controller.abort()
  })

  it('does not report again what DAPI already reported', async () => {
    const dapi = fakeDapi()
    const step = stepper()
    const looks = [[], [row(txid(5), 7n)]]
    const r = run(
      { sleep: step.sleep, recent: vi.fn(() => Promise.resolve(page(looks.shift() ?? []))) },
      dapi,
    )
    dapi.emit({ kind: 'tx', tx: tx(txid(5), [[ADDRESS, 7n]]) })
    dapi.set({ state: 'reconnecting', fallbackHint: true })
    await vi.waitFor(() => expect(r.recent).toHaveBeenCalledTimes(1))
    await step.next()
    await vi.waitFor(() => expect(r.onBlock).toHaveBeenCalledWith(new Set([txid(5)])))
    expect(r.pending).toHaveLength(1)
    r.controller.abort()
  })

  it('reads nothing while the tab is hidden', () => {
    const dapi = fakeDapi({ state: 'reconnecting', fallbackHint: true })
    const r = run({ visibility: { hidden: () => true, subscribe: () => nothing } }, dapi)
    expect(r.recent).not.toHaveBeenCalled()
    expect(r.status).toEqual(['paused'])
  })
})
