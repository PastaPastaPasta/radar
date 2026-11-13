import { describe, expect, it } from 'vitest'
import {
  isPlatformId,
  base58CheckDecode,
  base58CheckEncode,
  base58Decode,
  base58Encode,
  isBase58,
} from './base58'
import { bytesToHex, hexToBytes } from './hex'

describe('base58', () => {
  it.each([
    ['', ''],
    ['00', '1'],
    ['0000287fb4cd', '11233QC4'],
    ['48656c6c6f20576f726c6421', '2NEpo7TZRRrLZSi2U'],
    ['626262', 'a3gV'],
  ])('encodes %s', (hex, text) => {
    expect(base58Encode(hexToBytes(hex))).toBe(text)
    expect(bytesToHex(base58Decode(text))).toBe(hex)
  })

  it('rejects characters outside the alphabet', () => {
    expect(isBase58('0OIl')).toBe(false)
    expect(() => base58Decode('0abc')).toThrow()
  })

  it('verifies base58check', () => {
    const genesis = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
    const decoded = base58CheckDecode(genesis)
    expect(decoded?.version).toBe(0)
    expect(bytesToHex(decoded?.payload ?? new Uint8Array())).toBe(
      '62e907b15cbf27d5425399ebf6f0fb50ebb88f18',
    )
    expect(base58CheckEncode(0, decoded?.payload ?? new Uint8Array())).toBe(genesis)
    expect(base58CheckDecode('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb')).toBeNull()
    expect(base58CheckDecode('abc')).toBeNull()
  })
})

describe('isPlatformId', () => {
  it('accepts 32 bytes in base58, including the all-zero id, and nothing else', () => {
    expect(isPlatformId('5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk')).toBe(true)
    expect(isPlatformId('11111111111111111111111111111111')).toBe(true)
    for (const bad of ['', 'notbase58', '0OIl'.repeat(11), '5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFy']) {
      expect(isPlatformId(bad), bad).toBe(false)
    }
  })
})
