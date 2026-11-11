import { describe, expect, it, vi } from 'vitest'
import type { HyAddressTx, HyTxDetail } from '@/data/hyphen/schemas'
import {
  findSpender,
  limiter,
  outputSpends,
  SPENDER_MAX_CANDIDATES,
  UNSPENT_LAG_BLOCKS,
  type SpenderDeps,
} from './spend'

const OUT = { txid: 'aa'.repeat(32), vout: 1, address: 'XaddrA', height: 100 }
const id = (n: number) => n.toString(16).padStart(64, '0')

function addressTx(n: number, height: number, direction: 'in' | 'out' = 'out'): HyAddressTx {
  return {
    txHash: id(n),
    blockHeight: height,
    blockPos: 0,
    blockTime: 0,
    txType: 'normal',
    valueOut: 0n,
    netValue: 0n,
    direction,
  }
}

function deps(
  pages: { items: HyAddressTx[]; nextCursor?: string }[],
  inputs: Record<string, { n: number; txHash?: string; vout?: number }[]>,
): SpenderDeps & { opened: string[] } {
  const opened: string[] = []
  return {
    opened,
    addressTxs: (_a, cursor) =>
      Promise.resolve(pages[cursor ? Number(cursor) : 0] ?? { items: [] }),
    inputsOf: (txid) => {
      opened.push(txid)
      return Promise.resolve(inputs[txid] ?? null)
    },
  }
}

describe('findSpender @IN-05', () => {
  it('names the later transaction whose input is the output, and which input', async () => {
    const d = deps([{ items: [addressTx(3, 300), addressTx(2, 200)] }], {
      [id(2)]: [
        { n: 0, txHash: 'bb'.repeat(32), vout: 0 },
        { n: 1, txHash: OUT.txid, vout: 1 },
      ],
    })
    expect(await findSpender(d, OUT)).toEqual({ txid: id(2), vin: 1 })
  })

  it('opens the oldest candidate first and stops at the hit', async () => {
    const d = deps([{ items: [addressTx(4, 400), addressTx(3, 300), addressTx(2, 200)] }], {
      [id(2)]: [{ n: 0, txHash: OUT.txid, vout: 1 }],
    })
    await findSpender(d, OUT)
    expect(d.opened).toEqual([id(2)])
  })

  it('ignores transactions before the output, the output’s own transaction and receipts', async () => {
    const d = deps(
      [
        {
          items: [
            addressTx(5, 500, 'in'),
            { ...addressTx(6, 600), txHash: OUT.txid },
            addressTx(1, 50),
          ],
        },
      ],
      {},
    )
    expect(await findSpender(d, OUT)).toBeNull()
    expect(d.opened).toEqual([])
  })

  it('does not take a transaction that spends another output of the same transaction', async () => {
    const d = deps([{ items: [addressTx(2, 200)] }], {
      [id(2)]: [{ n: 0, txHash: OUT.txid, vout: 0 }],
    })
    expect(await findSpender(d, OUT)).toBeNull()
  })

  it('follows the history to the next page while it still reaches back to the output', async () => {
    const d = deps(
      [{ items: [addressTx(9, 900)], nextCursor: '1' }, { items: [addressTx(2, 200)] }],
      { [id(2)]: [{ n: 3, txHash: OUT.txid, vout: 1 }] },
    )
    expect(await findSpender(d, OUT)).toEqual({ txid: id(2), vin: 3 })
  })

  it('stops paging once the history is older than the output', async () => {
    const addressTxs = vi.fn((_a: string, cursor: string | undefined) =>
      Promise.resolve(
        cursor ? { items: [addressTx(1, 10)] } : { items: [addressTx(8, 80)], nextCursor: '1' },
      ),
    )
    const found = await findSpender({ addressTxs, inputsOf: () => Promise.resolve(null) }, OUT)
    expect(found).toBeNull()
    expect(addressTxs).toHaveBeenCalledTimes(1)
  })

  it('gives up after a bounded number of candidates', async () => {
    const items = Array.from({ length: SPENDER_MAX_CANDIDATES + 5 }, (_, i) =>
      addressTx(i + 1, 200 + i),
    )
    const d = deps([{ items }], {})
    expect(await findSpender(d, OUT)).toBeNull()
    expect(d.opened).toHaveLength(SPENDER_MAX_CANDIDATES)
  })

  it('has nothing to look up for an output without an address', async () => {
    const d = deps([{ items: [addressTx(2, 200)] }], {})
    expect(await findSpender(d, { ...OUT, address: undefined })).toBeNull()
  })
})

function detail(spent: (boolean | null | undefined)[]): HyTxDetail {
  return {
    txHash: OUT.txid,
    txVersion: 3,
    txType: 'normal',
    txSize: 1,
    valueOut: 0n,
    inputCount: 0,
    outputCount: spent.length,
    vin: [],
    vout: spent.map((s, n) => ({ n, value: 1n, scriptPubKey: { hex: '76' }, spent: s })),
  }
}

const tx = (scripts: string[]) => ({
  outputs: scripts.map((scriptPubKey) => ({ value: 1n, scriptPubKey })),
})

describe('outputSpends @HY-07', () => {
  const base = {
    mined: true,
    hyLoading: false,
    tipHeight: 1000,
    spenders: new Map<number, never>(),
  }

  it('calls an output unspent only while Hyphen’s index is close to the chain', () => {
    const near = outputSpends({
      ...base,
      tx: tx(['76']),
      hy: { detail: detail([false]), asOfHeight: 1000 - UNSPENT_LAG_BLOCKS },
    })
    expect(near[0]).toMatchObject({ state: 'unspent' })
    const far = outputSpends({
      ...base,
      tx: tx(['76']),
      hy: { detail: detail([false]), asOfHeight: 1000 - UNSPENT_LAG_BLOCKS - 1 },
    })
    expect(far[0]).toEqual({ state: 'unknown', reason: 'behind', behind: UNSPENT_LAG_BLOCKS + 1 })
  })

  it('still calls a spent output spent when the index is behind, because a spend does not undo', () => {
    const [state] = outputSpends({
      ...base,
      tx: tx(['76']),
      hy: { detail: detail([true]), asOfHeight: 10 },
    })
    expect(state).toEqual({ state: 'spent' })
  })

  it('says unknown, not unspent, when Hyphen has nothing or does not say', () => {
    expect(outputSpends({ ...base, tx: tx(['76']), hy: undefined })[0]).toEqual({
      state: 'unknown',
      reason: 'no-index',
    })
    expect(outputSpends({ ...base, tx: tx(['76']), hy: undefined, hyLoading: true })[0]).toEqual({
      state: 'unknown',
      reason: 'loading',
    })
    expect(
      outputSpends({
        ...base,
        tx: tx(['76']),
        hy: { detail: detail([null]), asOfHeight: 1000 },
      })[0],
    ).toEqual({ state: 'unknown', reason: 'not-reported' })
    expect(
      outputSpends({
        ...base,
        tx: tx(['76']),
        hy: { detail: detail([false]), asOfHeight: undefined },
      })[0],
    ).toEqual({ state: 'unknown', reason: 'not-reported' })
  })

  it('never calls an OP_RETURN output unspent, and an unmined transaction has no spend state', () => {
    const states = outputSpends({
      ...base,
      tx: tx(['6a', '76']),
      hy: { detail: detail([false, false]), asOfHeight: 1000 },
    })
    expect(states[0]).toEqual({ state: 'unspendable' })
    const pending = outputSpends({ ...base, mined: false, tx: tx(['76']), hy: undefined })
    expect(pending[0]).toEqual({ state: 'unknown', reason: 'unconfirmed' })
  })

  it('carries the spender, or that it is still being looked up', () => {
    const spenders = new Map<number, { txid: string; vin: number } | null | 'resolving'>([
      [0, { txid: id(2), vin: 4 }],
      [1, 'resolving'],
      [2, null],
    ])
    const states = outputSpends({
      ...base,
      tx: tx(['76', '76', '76']),
      hy: { detail: detail([true, true, true]), asOfHeight: 1000 },
      spenders,
    })
    expect(states).toEqual([
      { state: 'spent', by: { txid: id(2), vin: 4 } },
      { state: 'spent', resolving: true },
      { state: 'spent' },
    ])
  })
})

describe('limiter', () => {
  it('runs no more tasks at once than it was given', async () => {
    const run = limiter(2)
    let active = 0
    let peak = 0
    const task = async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      active--
    }
    await Promise.all(Array.from({ length: 7 }, () => run(task)))
    expect(peak).toBe(2)
  })
})
