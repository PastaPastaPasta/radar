import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(process.cwd(), 'src/features/tools/decoders/vectors')

/**
 * A decoder test vector, recorded by `scripts/record-decoder-vectors.mjs`: real bytes (hex), where they came from
 * and what the SDK read out of them. Test code only.
 */
export interface DecoderVector {
  id: string
  kind: 'stateTransition' | 'dataContract' | 'identity' | 'document' | 'proof'
  network: 'mainnet' | 'testnet'
  source: string
  hex: string
  /** A document is decoded against this contract (hex) and type. */
  contractHex?: string
  type?: string
  /** The SDK's JSON for the bytes; a proof's parser text. */
  expected: unknown
}

export function loadVectors(): DecoderVector[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as DecoderVector)
}

export const hexBytes = (hex: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16))
