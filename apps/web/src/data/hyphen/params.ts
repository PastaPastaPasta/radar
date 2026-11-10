import type { HyphenParam } from '../../../../../workers/edge/src/hyphen-path'

export interface HyCursor {
  asOfHeight: number
  height: number
}

const HEX = '0123456789abcdef'

function toHex(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) out += HEX[b >> 4]! + HEX[b & 15]!
  return out
}

function fromHex(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) return null
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

/**
 * Cursor for `/blocks`, as Hyphen builds it: hex-encoded `{"asOfHeight":H,"height":h}`.
 * The page that follows starts one block below `height` and runs downward, and `asOfHeight`
 * may not exceed the chain height Hyphen has indexed.
 */
export function cursorFromHeight(asOfHeight: number, height: number): string {
  return toHex(new TextEncoder().encode(JSON.stringify({ asOfHeight, height })))
}

export function decodeCursor(cursor: string): Record<string, unknown> | null {
  const bytes = fromHex(cursor)
  if (!bytes) return null
  try {
    const v: unknown = JSON.parse(new TextDecoder().decode(bytes))
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Only names the edge Worker forwards, so a client call cannot send a parameter that is silently dropped. */
export type HyQueryParams = Partial<Record<HyphenParam, string | number>>

export interface HyListQuery extends HyQueryParams {
  limit?: number
  cursor?: string
  status?: string
  type?: 'regular' | 'evonode'
}
