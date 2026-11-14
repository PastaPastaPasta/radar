export type ByteFormat = 'hex' | 'base64' | 'bytes'
export type ByteFormatChoice = 'auto' | ByteFormat

/** Larger input is refused: no Platform object this page decodes is near it. */
const MAX_INPUT_BYTES = 1_048_576

export type ParsedBytes =
  | { ok: true; bytes: Uint8Array<ArrayBuffer>; format: ByteFormat }
  | { ok: false; reason: 'empty' | 'hex' | 'base64' | 'bytes' | 'too-large' }

const HEX = /^[0-9a-f]+$/i
const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/
const NUMBER_LIST = /^[[\s]*(?:(?:0x[0-9a-f]{1,2}|\d{1,3})[\s,]*)+\]?$/i

function fromHex(text: string): Uint8Array<ArrayBuffer> | undefined {
  const hex = text.replace(/\s+/g, '').replace(/^0x/i, '')
  if (hex === '' || !HEX.test(hex) || hex.length % 2 !== 0) return undefined
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> | undefined {
  const compact = text.replace(/\s+/g, '')
  if (!BASE64.test(compact)) return undefined
  const plain = compact.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')
  if (plain.length % 4 === 1) return undefined
  try {
    const binary = atob(plain.padEnd(plain.length + ((4 - (plain.length % 4)) % 4), '='))
    return Uint8Array.from(binary, (c) => c.charCodeAt(0))
  } catch {
    return undefined
  }
}

function fromList(text: string): Uint8Array<ArrayBuffer> | undefined {
  if (!NUMBER_LIST.test(text.trim())) return undefined
  const items = text
    .replace(/[[\]]/g, ' ')
    .split(/[\s,]+/)
    .filter((s) => s !== '')
  if (items.length === 0) return undefined
  const out = new Uint8Array(items.length)
  for (const [i, item] of items.entries()) {
    const n = /^0x/i.test(item) ? parseInt(item.slice(2), 16) : Number(item)
    if (!Number.isInteger(n) || n < 0 || n > 255) return undefined
    out[i] = n
  }
  return out
}

function guess(text: string): ByteFormat[] {
  if (/[,[\]]/.test(text)) return ['bytes']
  const tokens = text.split(/\s+/)
  const hexLike =
    fromHex(text) !== undefined && tokens.every((t) => t.replace(/^0x/i, '').length % 2 === 0)
  if (hexLike) return ['hex']
  if (tokens.length > 1 && fromList(text)) return ['bytes']
  return ['base64', 'hex']
}

/**
 * Reads pasted bytes as hex (with or without 0x), base64 (standard or URL-safe) or a list of numbers
 * (`[1, 2, 3]`, `1 2 3`). Auto picks hex when every character is a hex digit and the length is even, a list when it is
 * only numbers and separators, and base64 otherwise.
 */
export function parseBytes(text: string, choice: ByteFormatChoice = 'auto'): ParsedBytes {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: false, reason: 'empty' }
  if (trimmed.length > MAX_INPUT_BYTES * 4) return { ok: false, reason: 'too-large' }
  const order: ByteFormat[] = choice === 'auto' ? guess(trimmed) : [choice]
  for (const format of order) {
    const bytes =
      format === 'hex'
        ? fromHex(trimmed)
        : format === 'base64'
          ? fromBase64(trimmed)
          : fromList(trimmed)
    if (bytes) {
      return bytes.length > MAX_INPUT_BYTES
        ? { ok: false, reason: 'too-large' }
        : { ok: true, bytes, format }
    }
  }
  return { ok: false, reason: choice === 'auto' ? 'base64' : choice }
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}
