import { describe, expect, it } from 'vitest'
import { base58CheckEncode } from '@/lib/base58'
import coreVectorFile from './dashcore-vectors.json'
import vectorFile from './vectors.json'
import { messageDigest, verifySignedMessage } from './verify'

interface Vector {
  msg: string
  pub: string
  r: string
  s: string
  hash: string
  mainnet: string
  testnet: string
}

const vectors: Vector[] = vectorFile

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex')

/** The compact signature for a vector: header 31 + recovery id, then r and s. */
function signature(v: Vector, recovery: number, compressed = true): string {
  const bytes = Buffer.concat([
    Buffer.from([27 + recovery + (compressed ? 4 : 0)]),
    Buffer.from(v.r, 'hex'),
    Buffer.from(v.s, 'hex'),
  ])
  return bytes.toString('base64')
}

function validRecovery(v: Vector): number {
  const ok = [0, 1, 2, 3].filter(
    (rec) =>
      verifySignedMessage({ address: v.mainnet, message: v.msg, signature: signature(v, rec) })
        .kind === 'valid',
  )
  expect(ok).toHaveLength(1)
  return ok[0] ?? 0
}

describe('messageDigest', () => {
  it('matches the digest computed independently for each vector @IN-08', () => {
    for (const v of vectors) expect(hex(messageDigest(v.msg))).toBe(v.hash)
  })
})

describe('verifySignedMessage', () => {
  it.each(vectors.map((v, i) => [i, v] as const))(
    'accepts a signature made by the address (vector %i) on mainnet and testnet @IN-08 @IN-16',
    (_i, v) => {
      const rec = validRecovery(v)
      expect(
        verifySignedMessage({ address: v.mainnet, message: v.msg, signature: signature(v, rec) }),
      ).toEqual({ kind: 'valid', network: 'mainnet' })
      expect(
        verifySignedMessage({ address: v.testnet, message: v.msg, signature: signature(v, rec) }),
      ).toEqual({ kind: 'valid', network: 'testnet' })
    },
  )

  const v = vectors[0]!

  it('rejects a changed message and says who did sign it @IN-08', () => {
    const rec = validRecovery(v)
    const result = verifySignedMessage({
      address: v.mainnet,
      message: `${v.msg} `,
      signature: signature(v, rec),
    })
    expect(result.kind).toBe('mismatch')
    if (result.kind === 'mismatch') expect(result.signedBy).not.toBe(v.mainnet)
  })

  it('rejects another address @IN-08', () => {
    const rec = validRecovery(v)
    const other = vectors[1]!
    expect(
      verifySignedMessage({ address: other.mainnet, message: v.msg, signature: signature(v, rec) })
        .kind,
    ).toBe('mismatch')
  })

  it('does not accept the signature as an uncompressed key signature @IN-08', () => {
    const rec = validRecovery(v)
    expect(
      verifySignedMessage({
        address: v.mainnet,
        message: v.msg,
        signature: signature(v, rec, false),
      }).kind,
    ).toBe('mismatch')
  })

  it('ignores whitespace and line breaks inside the pasted signature @IN-08', () => {
    const rec = validRecovery(v)
    const sig = signature(v, rec)
    const wrapped = `  ${sig.slice(0, 30)}\n${sig.slice(30)}\n`
    expect(
      verifySignedMessage({ address: ` ${v.mainnet} `, message: v.msg, signature: wrapped }).kind,
    ).toBe('valid')
  })

  it.each([
    ['not an address', 'hello', 'address'],
    [
      'a corrupted checksum',
      `${vectors[0]!.mainnet.slice(0, -1)}${vectors[0]!.mainnet.endsWith('a') ? 'b' : 'a'}`,
      'address',
    ],
  ])('reports %s as a problem with the address @IN-08', (_name, address, problem) => {
    expect(verifySignedMessage({ address, message: v.msg, signature: signature(v, 0) })).toEqual({
      kind: 'error',
      problem,
    })
  })

  it('says a script address cannot sign a message @IN-08', () => {
    const script = base58CheckEncode(0x10, new Uint8Array(20).fill(5))
    expect(script.startsWith('7')).toBe(true)
    expect(
      verifySignedMessage({ address: script, message: v.msg, signature: signature(v, 0) }),
    ).toEqual({ kind: 'error', problem: 'script-address' })
  })

  it.each([
    ['text that is not base64', 'not a signature'],
    ['a signature that is too short', 'AAAA'],
    [
      'a header byte out of range',
      Buffer.concat([Buffer.from([99]), Buffer.alloc(64, 1)]).toString('base64'),
    ],
    [
      'an all-zero r and s',
      Buffer.concat([Buffer.from([31]), Buffer.alloc(64)]).toString('base64'),
    ],
  ])('reports %s as a problem with the signature @IN-08', (_name, sig) => {
    expect(verifySignedMessage({ address: v.mainnet, message: v.msg, signature: sig })).toEqual({
      kind: 'error',
      problem: 'signature',
    })
  })
})

interface CoreVector {
  name: string
  compressed: boolean
  msg: string
  signature: string
  mainnet: string
  testnet: string
}

/** Signed by `signmessagewithprivkey` and checked with `verifymessage` on a Dash Core v24.1 regtest node. */
const CORE_VECTORS: CoreVector[] = coreVectorFile

describe('signatures made by Dash Core', () => {
  it.each(CORE_VECTORS.map((c) => [c.name, c] as const))(
    'accepts what signmessagewithprivkey produced: %s @IN-08 @IN-16',
    (_name, c) => {
      const { signature, msg } = c
      expect(verifySignedMessage({ address: c.mainnet, message: msg, signature })).toEqual({
        kind: 'valid',
        network: 'mainnet',
      })
      expect(verifySignedMessage({ address: c.testnet, message: msg, signature })).toEqual({
        kind: 'valid',
        network: 'testnet',
      })
    },
  )

  it.each(CORE_VECTORS.map((c) => [c.name, c] as const))(
    'rejects an altered message for %s @IN-08',
    (_name, c) => {
      const result = verifySignedMessage({
        address: c.mainnet,
        message: `${c.msg}!`,
        signature: c.signature,
      })
      expect(result.kind).toBe('mismatch')
    },
  )

  it('reads the header byte the way Dash Core writes it @IN-08', () => {
    const header = (c: CoreVector) => Buffer.from(c.signature, 'base64')[0] ?? 0
    for (const c of CORE_VECTORS) {
      expect(header(c) >= 31, c.name).toBe(c.compressed)
      expect(header(c)).toBeGreaterThanOrEqual(27)
      expect(header(c)).toBeLessThanOrEqual(34)
    }
  })
})
