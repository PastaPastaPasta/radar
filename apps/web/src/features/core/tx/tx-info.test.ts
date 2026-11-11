import { describe, expect, it } from 'vitest'
import type { DecodedTx, PrevOut } from '@/data/core/types'
import { layoutFlow, limitNodes, movesNoValue, totals, type FlowNode, FLOW } from './tx-info'

const tx = (over: Partial<DecodedTx>): DecodedTx => ({
  txid: 'a'.repeat(64),
  type: 'transfer',
  version: 2,
  lockTime: 0,
  size: 200,
  inputs: [{ txid: 'b'.repeat(64), vout: 0, scriptSig: '', sequence: 0 }],
  outputs: [
    { value: 90n, scriptPubKey: '' },
    { value: 9n, scriptPubKey: '' },
  ],
  ...over,
})

const prev = (value: bigint): PrevOut => ({ value, scriptPubKey: '' })

describe('totals', () => {
  it('takes the fee as inputs minus outputs once every previous output is known', () => {
    const t = tx({})
    expect(totals(t, new Map([[`${'b'.repeat(64)}:0`, prev(100n)]]))).toEqual({
      in: 100n,
      out: 99n,
      fee: 1n,
    })
  })
  it('gives no fee while a previous output is missing', () => {
    expect(totals(tx({}), new Map())).toEqual({ out: 99n })
  })
  it('gives a coinbase no fee', () => {
    const cb = tx({
      inputs: [
        { txid: '0'.repeat(64), vout: 4294967295, scriptSig: '', sequence: 0, coinbase: '03' },
      ],
    })
    expect(totals(cb, undefined)).toEqual({ out: 99n })
  })
  it('gives a transaction with no inputs a zero fee @HY-07', () => {
    const signal = tx({ inputs: [], outputs: [], payload: { kind: 'mnhfTx' } })
    expect(totals(signal, undefined)).toEqual({ in: 0n, out: 0n, fee: 0n })
  })
  it('reads an asset unlock fee from its payload', () => {
    const unlock = tx({ inputs: [], payload: { kind: 'assetUnlockTx', fee: 7n } })
    expect(totals(unlock, undefined)).toEqual({ out: 99n, fee: 7n })
  })
})

describe('movesNoValue @HY-07', () => {
  it('is true for a transaction with no inputs and no outputs', () => {
    expect(movesNoValue(tx({ inputs: [], outputs: [], payload: { kind: 'qcTx' } }))).toBe(true)
  })
  it('is false when coins move, and for an asset unlock', () => {
    expect(movesNoValue(tx({}))).toBe(false)
    expect(movesNoValue(tx({ inputs: [], payload: { kind: 'assetUnlockTx', fee: 7n } }))).toBe(
      false,
    )
    expect(movesNoValue(tx({ inputs: [], outputs: [], payload: { kind: 'assetUnlockTx' } }))).toBe(
      false,
    )
  })
})

const node = (key: string, value: bigint, kind: FlowNode['kind'] = 'out'): FlowNode => ({
  key,
  label: key,
  value,
  kind,
})

describe('layoutFlow', () => {
  it('keeps both columns inside the drawing area and draws a ribbon per pairing', () => {
    const l = layoutFlow({
      inputs: [node('i0', 5000n, 'in'), node('i1', 1n, 'in')],
      outputs: [node('o0', 5000n), node('o1', 1n, 'change')],
    })
    for (const n of [...l.left, ...l.right]) {
      expect(n.y).toBeGreaterThanOrEqual(FLOW.top - 0.001)
      expect(n.y + n.h).toBeLessThanOrEqual(FLOW.top + FLOW.area + 0.001)
      expect(n.h).toBeGreaterThanOrEqual(FLOW.min)
    }
    expect(l.raised).toBe(true)
    expect(l.ribbons.length).toBeGreaterThan(0)
    expect(l.ribbons.every((r) => r.d.startsWith('M') && r.d.endsWith('Z'))).toBe(true)
  })
  it('does not flag a raise when every node is big enough', () => {
    const l = layoutFlow({
      inputs: [node('a', 100n, 'in')],
      outputs: [node('b', 60n), node('c', 40n)],
    })
    expect(l.raised).toBe(false)
  })
})

describe('limitNodes', () => {
  it('folds the tail into one node that keeps the total', () => {
    const many = Array.from({ length: 12 }, (_, i) => node(`n${i}`, 10n))
    const out = limitNodes(many, (n) => `${n} more`)
    expect(out).toHaveLength(8)
    expect(out.at(-1)).toMatchObject({ label: '5 more', value: 50n })
  })
  it('leaves a short list alone', () => {
    const few = [node('a', 1n)]
    expect(limitNodes(few, String)).toBe(few)
  })
})
