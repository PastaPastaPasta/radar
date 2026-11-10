import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@/lib/hex'

/**
 * JSON for values the SDK returns: `bigint`, `Map` and `Uint8Array` are written as tagged objects and read back as
 * themselves. Plain objects and arrays pass through.
 */
export function encodeValue(value: unknown): unknown {
  if (typeof value === 'bigint') return { $bigint: value.toString() }
  if (value instanceof Uint8Array) return { $u8: toBase64(value) }
  if (value instanceof Map) {
    return { $map: [...value.entries()].map(([k, v]) => [encodeValue(k), encodeValue(v)]) }
  }
  if (Array.isArray(value)) return value.map(encodeValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, encodeValue(v)]),
    )
  }
  return value
}

export function decodeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeValue)
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    if (typeof o.$bigint === 'string') return BigInt(o.$bigint)
    if (typeof o.$u8 === 'string') return fromBase64(o.$u8)
    if (Array.isArray(o.$map)) {
      return new Map(
        (o.$map as [unknown, unknown][]).map(([k, v]) => [decodeValue(k), decodeValue(v)]),
      )
    }
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, decodeValue(v)]))
  }
  return value
}

/** Key order and `undefined` never change a recording's name. */
export function stableJson(value: unknown): string {
  if (value === undefined) return 'null'
  return JSON.stringify(sortKeys(encodeValue(value)))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)]),
    )
  }
  return value
}

/** `<sha256 of the stable JSON of the args>`: the file name of a recording. */
export function argsKey(args: unknown): string {
  return bytesToHex(sha256(new TextEncoder().encode(stableJson(args))))
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
