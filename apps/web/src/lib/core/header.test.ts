import { describe, expect, it } from 'vitest'
import { hexToBytes } from '../hex'
import { HEADER_BYTES, headerAsEmptyBlock, parseHeader } from './header'

// Mainnet block 1 (0000000000...), 80 bytes.
const HEADER =
  '02000000b67a40f3cd5804437a108f105533739c37e6229bc1adcab385140b59fd0f0000a71c1aade44bf8425bec0deb611c20b16da3442818ef20489ca1e2512be43eef814cdb52f0ff0f1edbf70100'

describe('parseHeader', () => {
  it('reads the fixed fields and prints hashes in display order', () => {
    const h = parseHeader(hexToBytes(HEADER.slice(0, HEADER_BYTES * 2)))
    expect(h.version).toBe(2)
    expect(h.prevHash).toBe('00000ffd590b1485b3caadc19b22e6379c733355108f107a430458cdf3407ab6')
    expect(h.time).toBe(0x52db4c81)
    expect(h.bits).toBe(0x1e0ffff0)
    expect(h.nonce).toBe(0x0001f7db)
  })

  it('refuses anything but 80 bytes', () => {
    expect(() => parseHeader(new Uint8Array(79))).toThrow('80 bytes')
  })
})

describe('headerAsEmptyBlock', () => {
  it('appends a zero transaction count', () => {
    const out = headerAsEmptyBlock(new Uint8Array(HEADER_BYTES).fill(7))
    expect(out).toHaveLength(HEADER_BYTES + 1)
    expect(out[HEADER_BYTES]).toBe(0)
  })
})
