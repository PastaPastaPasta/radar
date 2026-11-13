import { describe, expect, it } from 'vitest'
import {
  effectiveOrder,
  fieldType,
  filterIndices,
  opsAt,
  sdkWhere,
  servingIndex,
  validateQuery,
} from './doc-filters'
import { DASHPAY, DPNS, recordedContract, WITHDRAWALS } from './test-contracts'
import type { WhereClause } from '@/lib/search-schemas'

const dpns = recordedContract('mainnet', DPNS)
const dashpay = recordedContract('mainnet', DASHPAY)
const withdrawals = recordedContract('mainnet', WITHDRAWALS)

const domain = filterIndices(dpns.indices.domain)
const schema = dpns.documentSchemas.domain as Record<string, unknown>
const c = (field: string, op: WhereClause['op'], value: string | string[]): WhereClause => ({
  field,
  op,
  value,
})
const rules = (clauses: WhereClause[], order: string[] = [], indices = domain, s = schema) =>
  validateQuery(clauses, order, indices, s).map((p) => p.rule)

describe('indices as filters', () => {
  it('offers a type’s own indices, in property order, and the primary key', () => {
    expect(domain.map((i) => [i.name, i.properties.map((p) => p.field)])).toEqual([
      ['parentNameAndLabel', ['normalizedParentDomainName', 'normalizedLabel']],
      ['identityId', ['records.identity']],
      ['$id', ['$id']],
    ])
  })

  it('reads real indices of DashPay and withdrawals', () => {
    const contact = filterIndices(dashpay.indices.contactRequest).map((i) => i.name)
    expect(contact).toContain('$id')
    expect(contact.length).toBeGreaterThan(2)
    const withdrawal = filterIndices(withdrawals.indices.withdrawal)
    expect(withdrawal.some((i) => i.properties.some((p) => p.field === 'status'))).toBe(true)
  })

  it('knows what a field holds from the schema, including nested and system fields', () => {
    expect(fieldType(schema, 'normalizedLabel')).toBe('string')
    expect(fieldType(schema, 'records.identity')).toBe('identifier')
    expect(fieldType(schema, '$createdAt')).toBe('integer')
    expect(fieldType(schema, 'nothing')).toBe('other')
  })
})

describe('what a position may be asked with', () => {
  const index = domain[0]!
  it('offers = and in on every property and ranges only on the last one used', () => {
    expect(opsAt(index, 'normalizedParentDomainName', 'string', [])).toEqual([
      'eq',
      'in',
      'lt',
      'lte',
      'gt',
      'gte',
      'sw',
    ])
    const withLabel = [c('normalizedLabel', 'sw', 'bo')]
    expect(opsAt(index, 'normalizedParentDomainName', 'string', withLabel)).toEqual(['eq', 'in'])
    expect(
      opsAt(index, 'normalizedLabel', 'string', [c('normalizedParentDomainName', 'eq', 'dash')]),
    ).toContain('sw')
  })

  it('offers starts with only on text and nothing on a field the index lacks', () => {
    expect(opsAt(domain[2]!, '$id', 'identifier', [])).not.toContain('sw')
    expect(opsAt(index, 'records.identity', 'identifier', [])).toEqual([])
  })

  it('offers no second in or range once one is used elsewhere', () => {
    const clauses = [c('normalizedParentDomainName', 'in', ['dash'])]
    expect(opsAt(index, 'normalizedLabel', 'string', clauses)).not.toContain('in')
    const ranged = [c('normalizedLabel', 'gt', 'a')]
    expect(opsAt(index, 'normalizedParentDomainName', 'string', ranged)).not.toContain('gt')
  })
})

describe('explaining an invalid filter before running it', () => {
  it('accepts the DPNS name search: the parent by =, the label by starts with', () => {
    const q = [c('normalizedParentDomainName', 'eq', 'dash'), c('normalizedLabel', 'sw', 'bob')]
    expect(rules(q)).toEqual([])
    expect(servingIndex(q, [], domain)?.name).toBe('parentNameAndLabel')
  })

  it('refuses a field no index holds', () => {
    expect(rules([c('label', 'eq', 'bob')])).toEqual(['unknown-field'])
  })

  it('refuses a second property used without the first', () => {
    const problems = validateQuery([c('normalizedLabel', 'eq', 'bob')], [], domain, schema)
    expect(problems).toEqual([
      {
        rule: 'skips-property',
        field: 'normalizedLabel',
        other: 'normalizedParentDomainName',
        index: 'parentNameAndLabel',
      },
    ])
  })

  it('refuses a range that is not on the last property used', () => {
    const q = [c('normalizedParentDomainName', 'gt', 'a'), c('normalizedLabel', 'eq', 'bob')]
    expect(rules(q)).toEqual(['range-not-last'])
  })

  it('refuses two properties both ranged, and two in clauses', () => {
    expect(
      rules([c('normalizedParentDomainName', 'gt', 'a'), c('normalizedLabel', 'lt', 'z')]),
    ).toEqual(['two-range-fields'])
    expect(
      rules([c('normalizedParentDomainName', 'in', ['dash']), c('normalizedLabel', 'in', ['a'])]),
    ).toEqual(['two-in'])
  })

  it('lets one field carry a lower and an upper bound, and no other pair', () => {
    const between = [
      c('normalizedParentDomainName', 'eq', 'dash'),
      c('normalizedLabel', 'gte', 'a'),
      c('normalizedLabel', 'lt', 'f'),
    ]
    expect(rules(between)).toEqual([])
    expect(rules([c('$id', 'eq', 'x'), c('$id', 'in', ['y'])])).toContain('duplicate-field')
  })

  it('refuses empty values, text for a number and starts with on a number', () => {
    expect(rules([c('normalizedParentDomainName', 'eq', '')])).toEqual(['empty-value'])
    const status = filterIndices(withdrawals.indices.withdrawal)
    const wSchema = withdrawals.documentSchemas.withdrawal as Record<string, unknown>
    expect(rules([c('status', 'eq', 'done')], [], status, wSchema)).toEqual(['bad-number'])
    expect(rules([c('status', 'sw', '1')], [], status, wSchema)).toEqual(['starts-with-type'])
    expect(rules([c('status', 'eq', '2')], [], status, wSchema)).toEqual([])
  })

  it('refuses an identifier that is not one, and too many or repeated in values', () => {
    expect(rules([c('records.identity', 'eq', 'nope')])).toEqual(['bad-identifier'])
    const many = Array.from({ length: 101 }, (_, i) => String(i))
    expect(rules([c('$id', 'in', many)])).toContain('in-too-many')
    expect(rules([c('$id', 'in', ['a', 'a'])])).toContain('in-duplicate')
  })

  it('checks the order against the index’s property order', () => {
    const parent = [c('normalizedParentDomainName', 'eq', 'dash')]
    expect(rules(parent, ['normalizedLabel'])).toEqual([])
    expect(rules([], ['normalizedLabel'])).toEqual(['order-sequence'])
    expect(rules(parent, ['-normalizedLabel'])).toEqual([])
    expect(rules(parent, ['createdAt'])).toEqual(['order-unknown'])
    const range = [c('normalizedParentDomainName', 'eq', 'dash'), c('normalizedLabel', 'sw', 'a')]
    expect(rules(range, ['normalizedParentDomainName'])).toEqual(['order-missing'])
  })

  it('accepts no filter at all, and finds a query no index serves', () => {
    expect(rules([])).toEqual([])
    const q = [c('records.identity', 'eq', DPNS), c('normalizedLabel', 'eq', 'a')]
    expect(rules(q)).toEqual(['no-index'])
  })
})

describe('the query the SDK gets', () => {
  const q = [c('normalizedParentDomainName', 'eq', 'dash'), c('normalizedLabel', 'sw', 'bob')]

  it('spells operators as the SDK does and keeps typed values', () => {
    expect(sdkWhere(q, schema)).toEqual([
      ['normalizedParentDomainName', '==', 'dash'],
      ['normalizedLabel', 'startsWith', 'bob'],
    ])
    const w = withdrawals.documentSchemas.withdrawal as Record<string, unknown>
    expect(sdkWhere([c('status', 'in', ['1', '2'])], w)).toEqual([['status', 'in', [1, 2]]])
  })

  it('orders by the filtered index properties when Platform needs an order, else by what the URL names', () => {
    const index = servingIndex(q, [], domain)
    expect(effectiveOrder(q, [], index)).toEqual([
      ['normalizedParentDomainName', 'asc'],
      ['normalizedLabel', 'asc'],
    ])
    expect(effectiveOrder([c('normalizedParentDomainName', 'eq', 'dash')], [], domain[0])).toEqual(
      [],
    )
    expect(effectiveOrder(q, ['-normalizedLabel'], index)).toEqual([['normalizedLabel', 'desc']])
  })
})
