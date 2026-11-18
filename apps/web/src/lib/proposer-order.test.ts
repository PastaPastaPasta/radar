import { describe, expect, it } from 'vitest'
import { proposerTurns, type ValidatorSet, type ValidatorSets } from './proposer-order'

const id = (n: number) => n.toString(16).padStart(64, '0')
const set = (name: number, members: number[], banned: number[] = []): ValidatorSet => ({
  quorumHash: id(1000 + name),
  members: members.map((m) => ({ proTxHash: id(m), banned: banned.includes(m) })),
})
const order = (q: ValidatorSets) =>
  proposerTurns(q).map((t): [number, number] => [parseInt(t.proTxHash, 16), t.slot])

describe('proposerTurns', () => {
  const a = set(1, [1, 2, 3, 4])
  const b = set(2, [5, 6, 7])
  const c = set(3, [8, 9])

  it('continues the active set after the last proposer, then the next sets in rotation order', () => {
    const q = {
      order: [a, b, c].map((s) => s.quorumHash),
      current: a.quorumHash,
      sets: [a, b, c],
      lastProposer: id(2),
    }
    expect(order(q)).toEqual([
      [3, 1],
      [4, 2],
      [5, 3],
      [6, 4],
      [7, 5],
      [8, 6],
      [9, 7],
    ])
  })

  it('wraps round the rotation to the sets before the active one', () => {
    const q = {
      order: [a, b, c].map((s) => s.quorumHash),
      current: b.quorumHash,
      sets: [a, b, c],
      lastProposer: id(6),
    }
    expect(order(q).map(([m]) => m)).toEqual([7, 8, 9, 1, 2, 3, 4])
  })

  it('skips banned members without giving them a slot', () => {
    const banned = set(1, [1, 2, 3, 4], [3])
    const q = {
      order: [banned.quorumHash, b.quorumHash],
      current: banned.quorumHash,
      sets: [banned, b],
      lastProposer: id(1),
    }
    expect(order(q)).toEqual([
      [2, 1],
      [4, 2],
      [5, 3],
      [6, 4],
      [7, 5],
    ])
  })

  it('lists an evonode in two sets once, at its first turn, and keeps counting slots', () => {
    const twice = set(2, [3, 5])
    const q = {
      order: [a.quorumHash, twice.quorumHash],
      current: a.quorumHash,
      sets: [a, twice],
      lastProposer: id(1),
    }
    expect(order(q)).toEqual([
      [2, 1],
      [3, 2],
      [4, 3],
      [5, 5],
    ])
  })

  it('never moves into the two oldest sets when the rotation has more than ten', () => {
    const sets = Array.from({ length: 12 }, (_, i) => set(i, [100 + i]))
    const q = {
      order: sets.map((s) => s.quorumHash),
      current: sets[9]!.quorumHash,
      sets,
      lastProposer: id(109),
    }
    expect(order(q).map(([m]) => m - 100)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('starts the rotation over when the active set is one of the two oldest', () => {
    const sets = Array.from({ length: 12 }, (_, i) => set(i, [100 + i]))
    const q = {
      order: sets.map((s) => s.quorumHash),
      current: sets[11]!.quorumHash,
      sets,
      lastProposer: id(111),
    }
    expect(order(q).map(([m]) => m - 100)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('has no turns without a rotation, and ignores rotation entries with no set', () => {
    expect(
      proposerTurns({ order: [], current: a.quorumHash, sets: [a], lastProposer: id(1) }),
    ).toEqual([])
    const q = {
      order: [id(77), a.quorumHash, a.quorumHash],
      current: a.quorumHash,
      sets: [a],
      lastProposer: id(3),
    }
    expect(order(q)).toEqual([[4, 1]])
  })
})
