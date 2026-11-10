const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
const BECH32_CONST = 1
const BECH32M_CONST = 0x2bc830a3

export type Bech32Variant = 'bech32' | 'bech32m'

function polymod(values: number[]): number {
  let chk = 1
  for (const v of values) {
    const top = chk >>> 25
    chk = ((chk & 0x1ffffff) << 5) ^ v
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i] ?? 0
  }
  return chk >>> 0
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = []
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >>> 5)
  out.push(0)
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31)
  return out
}

export function convertBits(
  data: ArrayLike<number>,
  from: number,
  to: number,
  pad: boolean,
): number[] | null {
  let acc = 0
  let bits = 0
  const out: number[] = []
  const max = (1 << to) - 1
  for (let i = 0; i < data.length; i++) {
    const value = data[i] ?? 0
    if (value < 0 || value >> from !== 0) return null
    acc = (acc << from) | value
    bits += from
    while (bits >= to) {
      bits -= to
      out.push((acc >> bits) & max)
    }
    acc &= (1 << bits) - 1
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & max)
  } else if (bits >= from || ((acc << (to - bits)) & max) !== 0) {
    return null
  }
  return out
}

export function bech32Encode(hrp: string, bytes: Uint8Array, variant: Bech32Variant): string {
  const words = convertBits(bytes, 8, 5, true) ?? []
  const lower = hrp.toLowerCase()
  const constant = variant === 'bech32m' ? BECH32M_CONST : BECH32_CONST
  const mod = polymod([...hrpExpand(lower), ...words, 0, 0, 0, 0, 0, 0]) ^ constant
  const checksum = Array.from({ length: 6 }, (_, i) => (mod >>> (5 * (5 - i))) & 31)
  return `${lower}1${[...words, ...checksum].map((w) => CHARSET[w]).join('')}`
}

export interface Bech32Decoded {
  hrp: string
  bytes: Uint8Array
  variant: Bech32Variant
}

/** Returns null for anything that is not a valid bech32 or bech32m string. */
export function bech32Decode(value: string): Bech32Decoded | null {
  if (value.length < 8 || value.length > 120) return null
  if (value !== value.toLowerCase() && value !== value.toUpperCase()) return null
  const str = value.toLowerCase()
  const sep = str.lastIndexOf('1')
  if (sep < 1 || sep + 7 > str.length) return null
  const hrp = str.slice(0, sep)
  const words: number[] = []
  for (const ch of str.slice(sep + 1)) {
    const w = CHARSET.indexOf(ch)
    if (w < 0) return null
    words.push(w)
  }
  const check = polymod([...hrpExpand(hrp), ...words])
  const variant: Bech32Variant | null =
    check === BECH32M_CONST ? 'bech32m' : check === BECH32_CONST ? 'bech32' : null
  if (!variant) return null
  const bytes = convertBits(words.slice(0, -6), 5, 8, false)
  if (!bytes) return null
  return { hrp, bytes: Uint8Array.from(bytes), variant }
}

export const PLATFORM_HRP = { mainnet: 'dash', testnet: 'tdash' } as const
export type PlatformAddressType = 'p2pkh' | 'p2sh'
const PLATFORM_TYPE_BYTE: Record<number, PlatformAddressType> = { 0xb0: 'p2pkh', 0x80: 'p2sh' }

export interface PlatformAddressParts {
  hrp: 'dash' | 'tdash'
  type: PlatformAddressType
  hash: Uint8Array
}

/** Platform addresses are bech32m: HRP `dash` or `tdash`, then a type byte (0xb0 or 0x80) and a 20-byte hash. */
export function decodePlatformAddress(value: string): PlatformAddressParts | null {
  const decoded = bech32Decode(value)
  if (decoded?.variant !== 'bech32m') return null
  if (decoded.hrp !== 'dash' && decoded.hrp !== 'tdash') return null
  if (decoded.bytes.length !== 21) return null
  const type = PLATFORM_TYPE_BYTE[decoded.bytes[0] ?? -1]
  if (!type) return null
  return { hrp: decoded.hrp, type, hash: decoded.bytes.slice(1) }
}

export function encodePlatformAddress(parts: PlatformAddressParts): string {
  const out = new Uint8Array(21)
  out[0] = parts.type === 'p2pkh' ? 0xb0 : 0x80
  out.set(parts.hash, 1)
  return bech32Encode(parts.hrp, out, 'bech32m')
}
