import { describe, expect, it } from 'vitest'
import {
  parseSearch,
  stringifySearch,
  zBool01,
  zCsv,
  zCsvEnum,
  zList,
  decodeWhere,
  encodeWhere,
  zHex40,
  zHex64,
  zInt,
  zIsoDate,
  zLimit,
  zWhere,
  zPage,
  zRange,
  type WhereClause,
} from './search'

describe('parseSearch and stringifySearch', () => {
  it('keeps every value a string', () => {
    expect(parseSearch('?q=1234&page=3&hex=00ff')).toEqual({ q: '1234', page: '3', hex: '00ff' })
    expect(parseSearch('')).toEqual({})
  })

  it('sorts keys and drops empty values', () => {
    expect(stringifySearch({ sort: '-balance', q: 'alice', page: undefined, tab: '' })).toBe(
      '?q=alice&sort=-balance',
    )
    expect(stringifySearch({})).toBe('')
    expect(stringifySearch({ a: undefined, b: null, c: false })).toBe('')
  })

  it('writes booleans as 1, numbers as digits and arrays comma-joined in their own order', () => {
    expect(stringifySearch({ banned: true, page: 3, type: ['evo', 'regular'] })).toBe(
      '?banned=1&page=3&type=evo,regular',
    )
    expect(stringifySearch({ order: ['toUserId:asc', '$createdAt:asc'] })).toBe(
      '?order=toUserId:asc,%24createdAt:asc',
    )
  })

  it('escapes commas and percent signs inside array items and reads them back', () => {
    const text = stringifySearch({ host: ['Amazon.com, Inc.', '50%'], prev: ['b', 'a', 'b'] })
    expect(text).toBe('?host=Amazon.com%252C Inc.,50%2525&prev=b,a,b'.replace(' ', '%20'))
    const read = parseSearch(text)
    expect(zCsv.parse(read.host)).toEqual(['50%', 'Amazon.com, Inc.'])
    expect(zList.parse(read.prev)).toEqual(['b', 'a', 'b'])
  })

  it('leaves mainnet implicit and keeps other networks', () => {
    expect(stringifySearch({ network: 'mainnet', q: 'x' })).toBe('?q=x')
    expect(stringifySearch({ network: 'testnet' })).toBe('?network=testnet')
    expect(stringifySearch({ network: 'devnet-paloma' })).toBe('?network=devnet-paloma')
  })

  it('keeps readable separators and round-trips awkward values', () => {
    const search = { cursor: '7b22', q: 'a b&c=d+e', range: '100..', ip: '1.2.3.4:9999' }
    const text = stringifySearch(search)
    expect(text).toContain('range=100..')
    expect(text).toContain('ip=1.2.3.4:9999')
    expect(parseSearch(text)).toEqual(search)
  })
})

describe('search schema helpers', () => {
  it('splits and sorts comma lists', () => {
    expect(zCsv.parse('b,a,b,')).toEqual(['a', 'b'])
    expect(zCsvEnum(['regular', 'evo']).parse('evo,bogus,regular')).toEqual(['evo', 'regular'])
  })

  it('keeps the order and repeats of an ordered list, and an item with a comma', () => {
    expect(zList.parse('toUserId:asc,$createdAt:asc')).toEqual(['toUserId:asc', '$createdAt:asc'])
    expect(zList.parse('b,a,b,')).toEqual(['b', 'a', 'b'])
    expect(zList.parse('a%2Cb,c')).toEqual(['a,b', 'c'])
    expect(zCsv.parse('Amazon.com%2C Inc.,x')).toEqual(['Amazon.com, Inc.', 'x'])
    expect(zList.parse(zList.parse('b,a'))).toEqual(['b', 'a'])
  })

  it('validates its own output again', () => {
    expect(zCsv.parse(zCsv.parse('b,a'))).toEqual(['a', 'b'])
    expect(zCsvEnum(['regular', 'evo']).parse(['evo'])).toEqual(['evo'])
    expect(zRange.parse(zRange.parse('1..9'))).toEqual({ min: 1, max: 9 })
    expect(stringifySearch({ bal: { min: 100 }, span: { min: 1, max: 9 } })).toBe(
      '?bal=100..&span=1..9',
    )
  })

  it('reads ranges with either side optional', () => {
    expect(zRange.parse('100..')).toEqual({ min: 100 })
    expect(zRange.parse('..2.5')).toEqual({ max: 2.5 })
    expect(zRange.parse('1..9')).toEqual({ min: 1, max: 9 })
    expect(zRange.parse('5..1')).toEqual({ min: 1, max: 5 })
    for (const bad of ['..', '5', 'a..b', '1..2..3']) {
      expect(zRange.safeParse(bad).success).toBe(false)
    }
  })

  it('accepts only real ISO dates', () => {
    expect(zIsoDate.safeParse('2026-10-31').success).toBe(true)
    expect(zIsoDate.safeParse('2026-02-30').success).toBe(false)
    expect(zIsoDate.safeParse('10/31/2026').success).toBe(false)
  })

  it('coerces page, limit and boolean flags', () => {
    expect(zPage.parse('3')).toBe(3)
    expect(zPage.safeParse('0').success).toBe(false)
    expect(zPage.safeParse('999999999').success).toBe(false)
    expect(zLimit.parse('50')).toBe(50)
    expect(zLimit.safeParse('30').success).toBe(false)
    expect(zBool01.parse('1')).toBe(true)
    expect(zBool01.safeParse('0').success).toBe(false)
  })
})

describe('F0 search helpers', () => {
  it('accepts 75 as a page length', () => {
    expect(zLimit.parse('75')).toBe(75)
    expect(zLimit.safeParse('30').success).toBe(false)
  })

  it('reads non-negative integers only', () => {
    expect(zInt.parse('0')).toBe(0)
    expect(zInt.parse('2569992')).toBe(2569992)
    for (const bad of ['-1', '1.5', 'x', '']) expect(zInt.safeParse(bad).success, bad).toBe(false)
  })

  it('reads fixed-length hex and lower-cases it', () => {
    expect(zHex64.parse('AB'.repeat(32))).toBe('ab'.repeat(32))
    expect(zHex40.parse('ab'.repeat(20))).toBe('ab'.repeat(20))
    expect(zHex64.safeParse('ab'.repeat(20)).success).toBe(false)
    expect(zHex40.safeParse('zz'.repeat(20)).success).toBe(false)
  })

  const clauses: WhereClause[] = [
    { field: 'normalizedLabel', op: 'sw', value: 'ali ce' },
    { field: '$ownerId', op: 'in', value: ['a,b', 'c|d', 'e~f'] },
    { field: 'age', op: 'gte', value: '18' },
  ]

  it('round-trips documents filters, however awkward the values', () => {
    const text = encodeWhere(clauses)
    expect(text.split(',')).toHaveLength(3)
    expect(decodeWhere(text)).toEqual(clauses)
    expect(zWhere.parse(text)).toEqual(clauses)
    expect(zWhere.parse(zWhere.parse(text))).toEqual(clauses)
  })

  it('leaves out a clause it could not read back', () => {
    expect(
      encodeWhere([
        { field: 'a', op: 'in', value: [] },
        { field: '', op: 'eq', value: 'x' },
        { field: 'b', op: 'eq', value: '' },
      ]),
    ).toBe('b~eq~')
  })

  it('drops malformed clauses and keeps the rest', () => {
    expect(decodeWhere('')).toEqual([])
    expect(decodeWhere('a~eq~1,b~nope~2,c~eq,~eq~3,d~eq~%E0,e~eq~1~2,f~lt~9')).toEqual([
      { field: 'a', op: 'eq', value: '1' },
      { field: 'f', op: 'lt', value: '9' },
    ])
  })

  it('writes the filter into the URL through stringifySearch', () => {
    const search = stringifySearch({ where: [{ field: 'a', op: 'eq', value: 'x' }] })
    expect(search).toBe('?where=a~eq~x')
    expect(decodeWhere(parseSearch(search).where ?? '')).toEqual([
      { field: 'a', op: 'eq', value: 'x' },
    ])
  })
})

describe('the documents route search', () => {
  it('keeps the order of `order` and `prev` through a round trip', async () => {
    const { Route } = await import('@/routes/contract.$id.documents.$type')
    const validate = Route.options.validateSearch as { parse(s: unknown): Record<string, unknown> }
    const search = validate.parse({ order: 'toUserId:asc,$createdAt:asc', prev: 'zz,aa,mm' })
    expect(search.order).toEqual(['toUserId:asc', '$createdAt:asc'])
    expect(search.prev).toEqual(['zz', 'aa', 'mm'])
    expect(validate.parse(parseSearch(stringifySearch(search)))).toMatchObject({
      order: ['toUserId:asc', '$createdAt:asc'],
      prev: ['zz', 'aa', 'mm'],
    })
  })
})
