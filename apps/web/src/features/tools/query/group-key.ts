import { hexToBytes } from '@/lib/hex'

const HEX = /^(?:[0-9a-f]{2})+$/i
const TWO_63 = 1n << 63n
const TWO_62 = 1n << 62n

/**
 * A GROUP BY key as the reader would write it. The SDK hands a key back as the hex of its stored bytes, so what the
 * bytes mean depends on the property's schema type: a string is UTF-8, an integer is eight big-endian bytes (a signed
 * one with its sign bit flipped). Any other type, and any key that does not fit its type, stays as hex.
 */
export function decodeGroupKey(hex: string, type: string | undefined): string {
  if (!HEX.test(hex)) return hex
  const bytes = hexToBytes(hex)
  if (type === 'string') {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      // eslint-disable-next-line no-control-regex -- a control character means the bytes were not text after all
      return /[\u0000-\u0008\u000e-\u001f]/.test(text) ? hex : text
    } catch {
      return hex
    }
  }
  if ((type === 'integer' || type === 'number') && bytes.length === 8) {
    const raw = BigInt(`0x${hex}`)
    if (raw >= TWO_63) return (raw - TWO_63).toString()
    return (raw >= TWO_62 ? raw - TWO_63 : raw).toString()
  }
  return hex
}
