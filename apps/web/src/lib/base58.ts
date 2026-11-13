import { sha256 } from '@noble/hashes/sha2.js'

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const INDEX = new Map([...ALPHABET].map((c, i) => [c, i]))
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/

export function isBase58(value: string): boolean {
  return BASE58.test(value)
}

export function base58Encode(bytes: Uint8Array): string {
  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++
  const digits: number[] = []
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i] ?? 0
    for (let j = 0; j < digits.length; j++) {
      carry += (digits[j] ?? 0) << 8
      digits[j] = carry % 58
      carry = Math.floor(carry / 58)
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = Math.floor(carry / 58)
    }
  }
  let out = '1'.repeat(zeros)
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i] ?? 0]
  return out
}

export function base58Decode(value: string): Uint8Array {
  if (value === '') return new Uint8Array()
  if (!isBase58(value)) throw new Error('Invalid base58 string')
  let zeros = 0
  while (zeros < value.length && value[zeros] === '1') zeros++
  const bytes: number[] = []
  for (let i = zeros; i < value.length; i++) {
    let carry = INDEX.get(value[i] ?? '') ?? 0
    for (let j = 0; j < bytes.length; j++) {
      carry += (bytes[j] ?? 0) * 58
      bytes[j] = carry & 0xff
      carry >>= 8
    }
    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }
  const out = new Uint8Array(zeros + bytes.length)
  for (let i = 0; i < bytes.length; i++) out[zeros + bytes.length - 1 - i] = bytes[i] ?? 0
  return out
}

function checksum(data: Uint8Array): Uint8Array {
  return sha256(sha256(data)).slice(0, 4)
}

export function base58CheckEncode(version: number, payload: Uint8Array): string {
  const data = new Uint8Array(payload.length + 1)
  data[0] = version
  data.set(payload, 1)
  const out = new Uint8Array(data.length + 4)
  out.set(data)
  out.set(checksum(data), data.length)
  return base58Encode(out)
}

/** Returns null when the string is not base58, is too short, or its checksum fails. */
export function base58CheckDecode(value: string): { version: number; payload: Uint8Array } | null {
  if (!isBase58(value)) return null
  const raw = base58Decode(value)
  if (raw.length < 5) return null
  const data = raw.slice(0, -4)
  const sum = raw.slice(-4)
  const expected = checksum(data)
  for (let i = 0; i < 4; i++) if (sum[i] !== expected[i]) return null
  return { version: data[0] ?? 0, payload: data.slice(1) }
}

/** A Platform identifier (identity, contract, token, document id): 32 bytes in base58, up to 44 characters (leading zero bytes are `1`s). */
export function isPlatformId(value: string): boolean {
  if (value.length < 32 || value.length > 44 || !isBase58(value)) return false
  return base58Decode(value).length === 32
}
