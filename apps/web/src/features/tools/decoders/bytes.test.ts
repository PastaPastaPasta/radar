import { describe, expect, it } from 'vitest'
import { parseBytes, toBase64, toHex } from './bytes'

const bytes = (r: ReturnType<typeof parseBytes>) => (r.ok ? [...r.bytes] : r)

describe('parseBytes', () => {
  it('reads hex with or without 0x and with whitespace', () => {
    expect(bytes(parseBytes('0x01ff A0'))).toEqual([1, 255, 160])
    expect(parseBytes('deadbeef')).toMatchObject({ ok: true, format: 'hex' })
  })

  it('reads base64 in either alphabet, with or without padding', () => {
    expect(bytes(parseBytes('AQL/'))).toEqual([1, 2, 255])
    expect(bytes(parseBytes('AQL_'))).toEqual([1, 2, 255])
    expect(bytes(parseBytes('AQI'))).toEqual([1, 2])
    expect(parseBytes('AQI=')).toMatchObject({ ok: true, format: 'base64' })
  })

  it('reads a list of numbers', () => {
    expect(bytes(parseBytes('[1, 2, 255]'))).toEqual([1, 2, 255])
    expect(bytes(parseBytes('1 2 3'))).toEqual([1, 2, 3])
    expect(parseBytes('1, 2, 3')).toMatchObject({ ok: true, format: 'bytes' })
    expect(parseBytes('1, 2, 256')).toMatchObject({ ok: false })
  })

  it('honours a manual choice over the guess', () => {
    expect(bytes(parseBytes('abcd', 'hex'))).toEqual([0xab, 0xcd])
    expect(bytes(parseBytes('abcd', 'base64'))).toEqual([0x69, 0xb7, 0x1d])
    expect(parseBytes('xyz', 'hex')).toEqual({ ok: false, reason: 'hex' })
    expect(parseBytes('abc', 'hex')).toEqual({ ok: false, reason: 'hex' })
  })

  it('says why it cannot read the input', () => {
    expect(parseBytes('   ')).toEqual({ ok: false, reason: 'empty' })
    expect(parseBytes('not bytes at all!')).toMatchObject({ ok: false })
    expect(parseBytes('A', 'base64')).toEqual({ ok: false, reason: 'base64' })
  })

  it('refuses more than the limit', () => {
    expect(parseBytes('00'.repeat(1_048_577))).toEqual({ ok: false, reason: 'too-large' })
  })

  it('round-trips through hex and base64', () => {
    const data = Uint8Array.from({ length: 300 }, (_, i) => i % 256)
    expect(bytes(parseBytes(toHex(data), 'hex'))).toEqual([...data])
    expect(bytes(parseBytes(toBase64(data), 'base64'))).toEqual([...data])
  })
})
