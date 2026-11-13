import { describe, expect, it } from 'vitest'
import type { DecodedTx } from '@/data/core/types'
import { stepInputs } from './queries'

const inputs = (...parents: string[]): DecodedTx['inputs'] =>
  parents.map((txid, i) => ({ txid, vout: i, sequence: 0 }) as DecodedTx['inputs'][number])

describe('stepInputs @IN-05', () => {
  it('reads each parent once, in the step where it first appears, with every output spent from it', () => {
    const all = inputs('a', 'b', 'a', 'c', 'b', 'a')
    expect(stepInputs(all, 0, 2).map((i) => i.vout)).toEqual([0, 1, 2, 4, 5])
    expect(stepInputs(all, 2, 4).map((i) => i.txid)).toEqual(['c'])
    expect(stepInputs(all, 4, 6)).toEqual([])
  })

  it('asks for nothing twice across steps', () => {
    const all = inputs('a', 'a', 'a', 'b', 'b', 'c')
    const seen = new Set<string>()
    for (const [from, to] of [
      [0, 2],
      [2, 4],
      [4, 6],
    ] as const) {
      for (const parent of new Set(stepInputs(all, from, to).map((i) => i.txid))) {
        expect(seen.has(parent)).toBe(false)
        seen.add(parent)
      }
    }
    expect([...seen].sort()).toEqual(['a', 'b', 'c'])
  })
})
