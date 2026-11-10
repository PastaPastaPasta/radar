import { ripemd160 } from '@noble/hashes/legacy.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { recoverPublicKey } from '@noble/secp256k1'
import { base58CheckDecode, base58CheckEncode } from '@/lib/base58'

const MAGIC = new TextEncoder().encode('DarkCoin Signed Message:\n')

/** Address version bytes: `[mainnet, testnet]`. Only key-hash addresses can sign. */
const P2PKH = { mainnet: 0x4c, testnet: 0x8c } as const
const P2SH = new Set([0x10, 0x13])

export type VerifyOutcome =
  | { kind: 'valid'; network: 'mainnet' | 'testnet' }
  | { kind: 'mismatch'; signedBy: string; network: 'mainnet' | 'testnet' }
  | { kind: 'error'; problem: 'address' | 'script-address' | 'signature' }

function varint(n: number): Uint8Array {
  if (n < 0xfd) return Uint8Array.of(n)
  if (n <= 0xffff) return Uint8Array.of(0xfd, n & 0xff, n >> 8)
  return Uint8Array.of(0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff)
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** The digest Dash Core signs: sha256d of the length-prefixed magic and message. */
export function messageDigest(message: string): Uint8Array {
  const body = new TextEncoder().encode(message)
  return sha256(sha256(concat(varint(MAGIC.length), MAGIC, varint(body.length), body)))
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

function decodeSignature(text: string): Uint8Array | undefined {
  const clean = text.replace(/\s+/g, '')
  if (clean.length !== 88 || !BASE64.test(clean)) return undefined
  try {
    const raw = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0))
    return raw.length === 65 ? raw : undefined
  } catch {
    return undefined
  }
}

function hash160(pubkey: Uint8Array): Uint8Array {
  return ripemd160(sha256(pubkey))
}

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i])

/**
 * Checks a Dash signed message the way Dash Core's `verifymessage` does: recover the public key from the
 * 65-byte compact signature and compare its address with the one given. Everything runs in this browser.
 */
export function verifySignedMessage(input: {
  address: string
  message: string
  signature: string
}): VerifyOutcome {
  const decoded = base58CheckDecode(input.address.trim())
  if (decoded?.payload.length !== 20) return { kind: 'error', problem: 'address' }
  if (P2SH.has(decoded.version)) return { kind: 'error', problem: 'script-address' }
  const network =
    decoded.version === P2PKH.mainnet
      ? 'mainnet'
      : decoded.version === P2PKH.testnet
        ? 'testnet'
        : undefined
  if (!network) return { kind: 'error', problem: 'address' }

  const sig = decodeSignature(input.signature)
  const header = sig?.[0]
  if (!sig || header === undefined || header < 27 || header > 34) {
    return { kind: 'error', problem: 'signature' }
  }
  const compressed = header >= 31
  const recovery = (header - 27) & 3

  let pubkey: Uint8Array
  try {
    pubkey = recoverPublicKey(
      concat(Uint8Array.of(recovery), sig.subarray(1)),
      messageDigest(input.message),
      { prehash: false, isCompressed: compressed },
    )
  } catch {
    return { kind: 'error', problem: 'signature' }
  }

  const found = hash160(pubkey)
  if (sameBytes(found, decoded.payload)) return { kind: 'valid', network }
  return { kind: 'mismatch', signedBy: base58CheckEncode(decoded.version, found), network }
}
