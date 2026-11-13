import { describe, expect, it } from 'vitest'
import type { EntityKind } from '@/ui'
import { groupHits, kindRuns } from './groups'

const hit = (kind: EntityKind, id: string, rank: number, speculative?: true) => ({
  kind,
  id,
  rank,
  ...(speculative && { speculative }),
})

describe('groupHits', () => {
  it('splits a layer by kind, the kind with the best hit first @X-01 @NX-05', () => {
    const hits = [
      hit('identity', 'i1', 100),
      hit('block', 'b1', 80),
      hit('contract', 'c2', 80),
      hit('contract', 'c1', 50),
      hit('token', 't1', 50),
    ]

    const { groups } = groupHits(hits)

    expect(groups.map(([g]) => g)).toEqual(['core', 'platform'])
    const platform = groups[1]?.[1] ?? []
    expect(kindRuns(platform).map((r) => [r.kind, r.items.map((h) => h.id)])).toEqual([
      ['identity', ['i1']],
      ['contract', ['c2', 'c1']],
      ['token', ['t1']],
    ])
    expect(platform.map((h) => h.id)).toEqual(['i1', 'c2', 'c1', 't1'])
  })

  it('breaks a tie between kinds by the chain-first order @X-01', () => {
    const runs = kindRuns([hit('token', 't', 50), hit('identity', 'i', 50), hit('name', 'n', 50)])
    expect(runs.map((r) => r.kind)).toEqual(['identity', 'name', 'token'])
  })

  it('keeps readings nobody confirmed apart @X-01', () => {
    const { groups, guesses } = groupHits([hit('name', 'n', 80, true), hit('identity', 'i', 100)])
    expect(groups.map(([g]) => g)).toEqual(['platform'])
    expect(guesses.map((h) => h.id)).toEqual(['n'])
  })
})
