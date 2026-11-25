import { describe, expect, it } from 'vitest'
import { hasMore, homographSafe, planQuery } from './doc-query'
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
  it('knows a next page exists from the extra row, or a full 100', () => {
    expect(hasMore(26, 25)).toBe(true)
    expect(hasMore(25, 25)).toBe(false)
    expect(hasMore(100, 100)).toBe(true)
    expect(hasMore(99, 100)).toBe(false)
  })
})
