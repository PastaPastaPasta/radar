import { describe, expect, it } from 'vitest'
import { bech32Decode, bech32Encode, decodePlatformAddress, encodePlatformAddress } from './bech32'
import { bytesToHex } from './hex'

describe('bech32', () => {
  it.each([
    'A1LQFN3A',
    'a1lqfn3a',
    'abcdef1l7aum6echk45nj3s0wdvt2fg8x9yrzpqzd3ryx',
    'split1checkupstagehandshakeupstreamerranterredcaperredlc445v',
  ])('accepts the bech32m vector %s', (value) => {
    expect(bech32Decode(value)?.variant).toBe('bech32m')
  })

  it.each(['A12UEL5L', 'abcdef1qpzry9x8gf2tvdw0s3jn54khce6mua7lmqqqxw'])(
    'reads the bech32 vector %s as bech32',
    (value) => {
      expect(bech32Decode(value)?.variant).toBe('bech32')
    },
  )

  it.each(['A1LQFN3A'.replace('3', '4'), 'a1LQFN3A', '1qyrz8wqd2c9m', 'abc1', 'abc1qqqqqq0'])(
    'rejects %s',
    (value) => {
      expect(bech32Decode(value)).toBeNull()
    },
  )

  it('round-trips bytes', () => {
    const bytes = Uint8Array.from([1, 2, 3, 250, 251])
    const text = bech32Encode('tdash', bytes, 'bech32m')
    expect(bech32Decode(text)).toEqual({ hrp: 'tdash', bytes, variant: 'bech32m' })
  })
})

describe('platform addresses', () => {
  const vectors = [
    {
      text: 'dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs',
      hrp: 'dash',
      type: 'p2pkh',
    },
    {
      text: 'tdash1krma5z3ttj75la4m93xcndna9ullamq9y5fzq2j7',
      hrp: 'tdash',
      type: 'p2pkh',
    },
    {
      text: 'dash1sppl5xpu70aka8nacc4kj2htflydspzkxch4cad6',
      hrp: 'dash',
      type: 'p2sh',
    },
    {
      text: 'tdash1sppl5xpu70aka8nacc4kj2htflydspzkxc8jtru5',
      hrp: 'tdash',
      type: 'p2sh',
    },
  ] as const

  it.each(vectors)('decodes and re-encodes $text', ({ text, hrp, type }) => {
    const parts = decodePlatformAddress(text)
    expect(parts?.hrp).toBe(hrp)
    expect(parts?.type).toBe(type)
    expect(parts?.hash).toHaveLength(20)
    expect(bytesToHex(parts?.hash ?? new Uint8Array())).toHaveLength(40)
    if (parts) expect(encodePlatformAddress(parts)).toBe(text)
  })

  it('rejects other HRPs, bad checksums and wrong lengths', () => {
    expect(decodePlatformAddress('tdash1abc123def456ghi789jkl012mno345pqr678st')).toBeNull()
    expect(decodePlatformAddress('dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rt')).toBeNull()
    expect(decodePlatformAddress(bech32Encode('bc', new Uint8Array(21), 'bech32m'))).toBeNull()
    expect(decodePlatformAddress(bech32Encode('dash', new Uint8Array(21), 'bech32m'))).toBeNull()
    expect(decodePlatformAddress(bech32Encode('dash', new Uint8Array(20), 'bech32m'))).toBeNull()
  })
})
