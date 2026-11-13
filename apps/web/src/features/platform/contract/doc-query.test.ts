import { describe, expect, it } from 'vitest'
import { hasMore, homographSafe, nextCursor, planQuery, prevCursor } from './doc-query'
import { DPNS, recordedContract } from './test-contracts'
import type { WhereClause } from '@/lib/search-schemas'

const dpns = recordedContract('mainnet', DPNS)
const plan = (where: WhereClause[] | undefined, over: object = {}) =>
  planQuery({
    contractId: DPNS,
    type: 'domain',
    indices: dpns.indices.domain,
    schema: dpns.documentSchemas.domain as Record<string, unknown>,
    search: { limit: 25, ...(where ? { where } : {}), ...over },
    dpnsDomain: true,
  })

describe('planning a documents query', () => {
  it('asks one row more than the page shows and no filter without one', () => {
    expect(plan(undefined).args).toEqual({ contractId: DPNS, type: 'domain', limit: 26 })
    expect(plan(undefined, { limit: 100 }).args?.limit).toBe(100)
  })

  it('reads a DPNS name search in the form DPNS stores, and says so', () => {
    const p = plan([
      { field: 'normalizedParentDomainName', op: 'eq', value: 'Dash' },
      { field: 'normalizedLabel', op: 'sw', value: 'Bob' },
    ])
    expect(p.problems).toEqual([])
    expect(p.args?.where).toEqual([
      ['normalizedParentDomainName', '==', 'dash'],
      ['normalizedLabel', 'startsWith', 'b0b'],
    ])
    expect(p.args?.orderBy).toEqual([
      ['normalizedParentDomainName', 'asc'],
      ['normalizedLabel', 'asc'],
    ])
    expect(p.conversions).toEqual([
      { field: 'normalizedParentDomainName', typed: 'Dash', searched: 'dash' },
      { field: 'normalizedLabel', typed: 'Bob', searched: 'b0b' },
    ])
  })

  it('names the broken rule and builds no query', () => {
    const p = plan([{ field: 'normalizedLabel', op: 'eq', value: 'bob' }])
    expect(p.args).toBeUndefined()
    expect(p.problems.map((x) => x.rule)).toEqual(['skips-property'])
  })

  it('resumes after the cursor in the address', () => {
    expect(plan(undefined, { after: 'abc' }).args?.startAfter).toBe('abc')
  })

  it('converts nothing outside DPNS names', () => {
    expect(homographSafe('Olivia')).toBe('011v1a')
    const p = planQuery({
      contractId: DPNS,
      type: 'domain',
      indices: dpns.indices.domain,
      schema: dpns.documentSchemas.domain as Record<string, unknown>,
      search: { limit: 25, where: [{ field: '$id', op: 'eq', value: 'Olive' }] },
      dpnsDomain: false,
    })
    expect(p.conversions).toEqual([])
  })
})

describe('cursor pages', () => {
  it('walks forward keeping each earlier cursor, and back the same way', () => {
    const page1 = {}
    const to2 = nextCursor(page1, 'A')
    expect(to2).toEqual({ after: 'A', prev: undefined })
    const to3 = nextCursor(to2, 'B')
    expect(to3).toEqual({ after: 'B', prev: ['A'] })
    const to4 = nextCursor(to3, 'C')
    expect(to4).toEqual({ after: 'C', prev: ['A', 'B'] })
    expect(prevCursor(to4)).toEqual({ after: 'B', prev: ['A'] })
    expect(prevCursor({ after: 'B', prev: ['A'] })).toEqual({ after: 'A', prev: undefined })
    expect(prevCursor({ after: 'A' })).toEqual({ after: undefined, prev: undefined })
    expect(prevCursor({})).toBeNull()
  })

  it('knows a next page exists from the extra row, or a full 100', () => {
    expect(hasMore(26, 25)).toBe(true)
    expect(hasMore(25, 25)).toBe(false)
    expect(hasMore(100, 100)).toBe(true)
    expect(hasMore(99, 100)).toBe(false)
  })
})
