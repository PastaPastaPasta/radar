import { describe, expect, it } from 'vitest'
import { decodeGroupKey } from './group-key'

describe('decodeGroupKey', () => {
  it('reads a string property as UTF-8 @NX-70', () => {
    expect(decodeGroupKey('4353313031', 'string')).toBe('CS101')
    expect(decodeGroupKey('', 'string')).toBe('')
  })

  it('reads an integer property from eight bytes, signed or not @NX-70', () => {
    expect(decodeGroupKey('8000000000004f11', 'integer')).toBe('20241')
    expect(decodeGroupKey('0000000000004f11', 'integer')).toBe('20241')
    expect(decodeGroupKey('7ffffffffffffffb', 'integer')).toBe('-5')
  })

  it('keeps hex for other types and for bytes that do not fit the type @NX-70', () => {
    expect(decodeGroupKey('cafe', 'array')).toBe('cafe')
    expect(decodeGroupKey('cafe', undefined)).toBe('cafe')
    expect(decodeGroupKey('ff00', 'string')).toBe('ff00')
    expect(decodeGroupKey('01', 'integer')).toBe('01')
    expect(decodeGroupKey('not hex', 'string')).toBe('not hex')
  })
})
