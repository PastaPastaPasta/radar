import { describe, expect, it } from 'vitest'
import {
  parseSearch,
  stringifySearch,
  zBool01,
  zCsv,
  zCsvEnum,
  zIsoDate,
  zLimit,
  zPage,
  zRange,
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

  it('writes booleans as 1, numbers as digits and arrays comma-joined and sorted', () => {
    expect(stringifySearch({ banned: true, page: 3, type: ['regular', 'evo'] })).toBe(
      '?banned=1&page=3&type=evo,regular',
    )
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
    expect(zLimit.parse('50')).toBe(50)
    expect(zLimit.safeParse('30').success).toBe(false)
    expect(zBool01.parse('1')).toBe(true)
    expect(zBool01.safeParse('0').success).toBe(false)
  })
})
