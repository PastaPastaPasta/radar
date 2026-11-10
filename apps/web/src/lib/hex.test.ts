import { describe, expect, it } from 'vitest'
import { bytesToHex, hexToBytes, isHex, normalizeHex } from './hex'

describe('hex', () => {
  it('round-trips bytes', () => {
    const bytes = Uint8Array.from([0, 1, 15, 16, 255])
    expect(bytesToHex(bytes)).toBe('00010f10ff')
    expect(hexToBytes('00010F10ff')).toEqual(bytes)
  })

  it('checks hex strings and their byte length', () => {
    expect(isHex('abcdef0123')).toBe(true)
    expect(isHex('abc')).toBe(false)
    expect(isHex('zz')).toBe(false)
    expect(isHex('ab'.repeat(32), 32)).toBe(true)
    expect(isHex('ab'.repeat(20), 32)).toBe(false)
  })

  it('rejects malformed hex when decoding', () => {
    expect(() => hexToBytes('abc')).toThrow()
    expect(() => hexToBytes('xx')).toThrow()
  })

  it('normalizes case, whitespace and a 0x prefix', () => {
    expect(normalizeHex('  0xABCDEF ')).toBe('abcdef')
  })
})
