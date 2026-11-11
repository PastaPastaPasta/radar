import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '../hex'

const sha256d = (bytes: Uint8Array): Uint8Array => sha256(sha256(bytes))

const reverseHex = (hex: string): Uint8Array => hexToBytes(hex).reverse()

/** The transaction id of a serialized transaction, in the display order every explorer prints. */
export function txidOfBytes(bytes: Uint8Array): string {
  return bytesToHex(sha256d(bytes).reverse())
}

/**
 * The merkle root over transaction ids in display order, as Dash Core computes it. `mutated` is true when two
 * equal hashes sit side by side at a level, the shape that lets different transaction lists share one root.
 */
export function merkleRootOf(txids: string[]): { root: string; mutated: boolean } {
  if (txids.length === 0) return { root: '0'.repeat(64), mutated: false }
  let level = txids.map(reverseHex)
  let mutated = false
  while (level.length > 1) {
    const next: Uint8Array[] = []
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!
      const right = level[i + 1] ?? left
      if (i + 1 < level.length && bytesToHex(left) === bytesToHex(right)) mutated = true
      const joined = new Uint8Array(64)
      joined.set(left)
      joined.set(right, 32)
      next.push(sha256d(joined))
    }
    level = next
  }
  return { root: bytesToHex(level[0]!.reverse()), mutated }
}

/** 0x0fffff followed by 27 zero bytes: the easiest target mainnet and testnet allow. */
const POW_LIMIT = 0x0fffffn << (8n * 27n)

/** The 256-bit target a compact `bits` value stands for; nothing for a negative, zero or overflowing one. */
export function targetOfBits(bits: number): bigint | undefined {
  const exponent = bits >>> 24
  const mantissa = bits & 0x007fffff
  if (bits & 0x00800000 || mantissa === 0) return undefined
  const target =
    exponent <= 3
      ? BigInt(mantissa) >> (8n * BigInt(3 - exponent))
      : BigInt(mantissa) << (8n * BigInt(exponent - 3))
  if (target === 0n || target >= 1n << 256n) return undefined
  return target
}

/**
 * True when a block hash (display order) meets the target its header claims. Mainnet and testnet also refuse a target
 * easier than the network's limit, so a forger cannot pick a trivial one; a devnet may set its own.
 */
export function meetsProofOfWork(hash: string, bits: number, opts: { limit: boolean }): boolean {
  const target = targetOfBits(bits)
  if (target === undefined) return false
  if (opts.limit && target > POW_LIMIT) return false
  return BigInt(`0x${hash}`) <= target
}
