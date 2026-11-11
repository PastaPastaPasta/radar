import { describe, expect, it } from 'vitest'
import { merkleRootOf, meetsProofOfWork, targetOfBits, txidOfBytes } from './verify'

const GENESIS_HASH = '00000ffd590b1485b3caadc19b22e6379c733355108f107a430458cdf3407ab6'
const GENESIS_MERKLE = 'e0028eb9648db56b1ac77cf090b99048a8007e2bb64b68f092c03c7f56a662c7'

describe('targetOfBits', () => {
  it('expands the compact form', () => {
    expect(targetOfBits(0x1e0ffff0)).toBe(0x0ffff0n << (8n * 27n))
    expect(targetOfBits(0x03123456)).toBe(0x123456n)
    expect(targetOfBits(0x01123456)).toBe(0x12n)
  })

  it('refuses a negative, zero or overflowing target', () => {
    expect(targetOfBits(0x04923456)).toBeUndefined()
    expect(targetOfBits(0x1e000000)).toBeUndefined()
    expect(targetOfBits(0x21010000)).toBeUndefined()
    expect(targetOfBits(0x00000001)).toBeUndefined()
  })
})

describe('meetsProofOfWork', () => {
  it('accepts the genesis hash at its own bits', () => {
    expect(meetsProofOfWork(GENESIS_HASH, 0x1e0ffff0, { limit: true })).toBe(true)
  })

  it('refuses a hash above the target', () => {
    expect(meetsProofOfWork('0'.repeat(5) + 'f'.repeat(59), 0x1d00ffff, { limit: true })).toBe(
      false,
    )
  })

  it('refuses a target easier than the network limit, unless the network sets its own', () => {
    const easy = '00ffff' + '0'.repeat(58)
    expect(meetsProofOfWork(easy, 0x207fffff, { limit: true })).toBe(false)
    expect(meetsProofOfWork(easy, 0x207fffff, { limit: false })).toBe(true)
  })
})

describe('merkleRootOf', () => {
  it('is the txid itself for one transaction', () => {
    expect(merkleRootOf([GENESIS_MERKLE]).root).toBe(GENESIS_MERKLE)
  })

  it('pairs and duplicates an odd leaf like Dash Core', () => {
    const a = 'aa'.repeat(32)
    const b = 'bb'.repeat(32)
    const c = 'cc'.repeat(32)
    const three = merkleRootOf([a, b, c])
    const four = merkleRootOf([a, b, c, c])
    expect(three.root).toBe(four.root)
    expect(three.mutated).toBe(false)
  })

  it('flags a list that repeats a pair to reach the same root', () => {
    const a = 'aa'.repeat(32)
    const b = 'bb'.repeat(32)
    const c = 'cc'.repeat(32)
    expect(merkleRootOf([a, b, c, c]).mutated).toBe(true)
  })
})

describe('txidOfBytes', () => {
  it('double-hashes and reverses', () => {
    expect(txidOfBytes(new Uint8Array(0))).toBe(
      '56944c5d3f98413ef45cf54545538103cc9f298e0575820ad3591376e2e0f65d',
    )
  })
})
