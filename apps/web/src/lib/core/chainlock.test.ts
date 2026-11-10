import { describe, expect, it } from 'vitest'
import { bytesToHex, hexToBytes } from '../hex'
import { parseChainLock } from './chainlock'

describe('parseChainLock', () => {
  it('reads height, block hash in display order, and the signature', () => {
    const bytes = new Uint8Array(132)
    bytes.set(hexToBytes('5e372700'), 0)
    bytes.set(hexToBytes('f97337aca6654673dc4efb2c790d6286c42eba3c0a50aa5f1300000000000000'), 4)
    bytes.fill(0xab, 36)
    const lock = parseChainLock(bytes)
    expect(lock.height).toBe(2570078)
    expect(lock.hash).toBe('00000000000000135faa500a3cba2ec486620d792cfb4edc734665a6ac3773f9')
    expect(lock.signature).toBe(bytesToHex(new Uint8Array(96).fill(0xab)))
  })

  it('refuses a message of the wrong size', () => {
    expect(() => parseChainLock(new Uint8Array(131))).toThrow('132 bytes')
  })
})
