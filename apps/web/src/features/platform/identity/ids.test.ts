import { describe, expect, it } from 'vitest'
import { base58Encode } from '@/lib/base58'
import {
  isHashKeyType,
  keyPurposeName,
  keyTypeName,
  readIdentityInput,
  readKeyHash,
  securityLevelName,
} from './ids'

const ID = '5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk'

describe('readIdentityInput', () => {
  it('accepts a base58 ID and converts 64 hex characters to it', () => {
    expect(readIdentityInput(ID)).toEqual({ kind: 'id', id: ID })
    const hex = 'ab'.repeat(32)
    const out = readIdentityInput(` ${hex.toUpperCase()} `)
    expect(out).toEqual({
      kind: 'hex',
      id: base58Encode(Uint8Array.from({ length: 32 }, () => 0xab)),
    })
  })

  it('refuses anything else', () => {
    expect(readIdentityInput('')).toEqual({ kind: 'invalid' })
    expect(readIdentityInput('pshenmic.dash')).toEqual({ kind: 'invalid' })
    expect(readIdentityInput(ID.slice(0, 20))).toEqual({ kind: 'invalid' })
  })
})

describe('readKeyHash', () => {
  it('takes 40 hex characters, with or without 0x, in either case', () => {
    const hash = '7dc0c939f8dcc2775a4069776774c1b623eb1498'
    expect(readKeyHash(hash)).toEqual({ ok: true, pkh: hash })
    expect(readKeyHash(`0x${hash.toUpperCase()}`)).toEqual({ ok: true, pkh: hash })
  })

  it('says why a value is not a key hash', () => {
    expect(readKeyHash('  ')).toEqual({ ok: false, reason: 'empty' })
    expect(readKeyHash('abcd')).toEqual({ ok: false, reason: 'length' })
    expect(readKeyHash('z'.repeat(40))).toEqual({ ok: false, reason: 'chars' })
  })
})

describe('key names', () => {
  it('names the SDK numbers and keeps unknown ones visible', () => {
    expect(keyTypeName(0)).toBe('ECDSA_SECP256K1')
    expect(keyTypeName(9)).toBe('TYPE_9')
    expect(keyPurposeName(3)).toBe('TRANSFER')
    expect(securityLevelName(1)).toBe('CRITICAL')
    expect(isHashKeyType(2)).toBe(true)
    expect(isHashKeyType(0)).toBe(false)
  })
})
