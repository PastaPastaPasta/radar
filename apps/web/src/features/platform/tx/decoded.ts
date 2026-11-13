import { sha256 } from '@noble/hashes/sha2.js'
import { base58CheckEncode, base58Decode } from '@/lib/base58'
import { encodePlatformAddress, PLATFORM_HRP } from '@/lib/bech32'
import { bytesToHex, hexToBytes } from '@/lib/hex'
import type { NetworkId } from '@/lib/network'

export type Json = Record<string, unknown>

export const isRecord = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
export const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
export const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)
export const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
export const records = (v: unknown): Json[] => list(v).filter(isRecord)

export function fromBase64(value: string): Uint8Array | undefined {
  try {
    return Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
  } catch {
    return undefined
  }
}

/** A credit amount from the SDK's JSON, where it is a number or a numeric string. */
export function bigintOf(v: unknown): bigint | undefined {
  if (typeof v === 'bigint') return v
  if (typeof v === 'number' && Number.isFinite(v)) return BigInt(Math.trunc(v))
  if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v)
  return undefined
}

/** A Platform address as the SDK writes it (a type byte, 0 for P2PKH and 1 for P2SH, then the 20-byte hash) in its bech32m text. */
export function platformAddressOf(hex: string, net: NetworkId): string | undefined {
  if (!/^[0-9a-f]{42}$/i.test(hex)) return undefined
  const bytes = hexToBytes(hex)
  const type = bytes[0] === 0 ? 'p2pkh' : bytes[0] === 1 ? 'p2sh' : undefined
  if (!type) return undefined
  const hrp = net === 'mainnet' ? PLATFORM_HRP.mainnet : PLATFORM_HRP.testnet
  return encodePlatformAddress({ hrp, type, hash: bytes.slice(1) })
}

const CORE_VERSION = {
  mainnet: { p2pkh: 76, p2sh: 16 },
  testnet: { p2pkh: 140, p2sh: 19 },
} as const

/** The Core address a standard output script pays, from the script as base64; `undefined` for any other script. */
export function scriptAddressOf(base64: string, net: NetworkId): string | undefined {
  const script = fromBase64(base64)
  if (!script) return undefined
  const v = net === 'mainnet' ? CORE_VERSION.mainnet : CORE_VERSION.testnet
  if (
    script.length === 25 &&
    script[0] === 0x76 &&
    script[1] === 0xa9 &&
    script[2] === 0x14 &&
    script[23] === 0x88 &&
    script[24] === 0xac
  ) {
    return base58CheckEncode(v.p2pkh, script.slice(3, 23))
  }
  if (script.length === 23 && script[0] === 0xa9 && script[1] === 0x14 && script[22] === 0x87) {
    return base58CheckEncode(v.p2sh, script.slice(2, 22))
  }
  return undefined
}

/** A ProTxHash the SDK writes as a base58 identifier, in hex. */
export function proTxHashHex(base58: string): string | undefined {
  try {
    const bytes = base58Decode(base58)
    return bytes.length === 32 ? bytesToHex(bytes) : undefined
  } catch {
    return undefined
  }
}

export interface FundingRef {
  kind: 'instant' | 'chain'
  /** The Core transaction that locked the funds, when it can be read from the proof. */
  txid?: string
  vout?: number
  /** The chain-locked height a chain proof names. */
  coreHeight?: number
}

const HEX64 = /^[0-9a-f]{64}$/i

/** What an asset-lock proof says about the Core transaction behind it. */
export function fundingOf(proof: unknown): FundingRef | undefined {
  if (!isRecord(proof)) return undefined
  const type = str(proof.$type)
  if (type === 'chain') {
    const [txid, vout] = (str(proof.outPoint) ?? '').split(':')
    return {
      kind: 'chain',
      ...(txid && HEX64.test(txid) ? { txid: txid.toLowerCase() } : {}),
      ...(vout !== undefined && /^\d+$/.test(vout) ? { vout: Number(vout) } : {}),
      ...(num(proof.coreChainLockedHeight) !== undefined
        ? { coreHeight: num(proof.coreChainLockedHeight)! }
        : {}),
    }
  }
  if (type === 'instant') {
    const raw = str(proof.transaction)
    const bytes = raw ? fromBase64(raw) : undefined
    const txid = bytes ? bytesToHex(sha256(sha256(bytes)).reverse()) : undefined
    return {
      kind: 'instant',
      ...(txid ? { txid } : {}),
      ...(num(proof.outputIndex) !== undefined ? { vout: num(proof.outputIndex)! } : {}),
    }
  }
  return undefined
}

/** `SOME_NEW_TYPE` as "Some new type". */
export function humanize(raw: string): string {
  const text = raw.toLowerCase().split('_').join(' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}
