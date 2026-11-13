import type { decodeWithWasm } from '@/data/sdk/worker/decode'
import { beforeAll, describe, expect, it } from 'vitest'
import { parseGroveProof, resetGroveParser } from '@/features/tools/decoders/grove-proof'
import { wasmBytes } from '@/features/tools/decoders/proof-fixtures'
import { hexBytes, loadVectors } from '@/features/tools/decoders/vectors'

const vectors = loadVectors()
let decode: typeof decodeWithWasm

beforeAll(async () => {
  // The SDK's wasm loader reads through Blob.stream, which jsdom's Blob lacks.
  globalThis.Blob = (await import('node:buffer')).Blob as unknown as typeof Blob
  decode = (await import('@/data/sdk/worker/decode')).decodeWithWasm
  resetGroveParser()
}, 60_000)

const normal = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)))

describe('recorded decoder vectors', () => {
  it('covers each decoder and several transition types', () => {
    const kinds = new Set(vectors.map((v) => v.kind))
    expect([...kinds].sort()).toEqual([
      'dataContract',
      'document',
      'identity',
      'proof',
      'stateTransition',
    ])
    expect(vectors.filter((v) => v.kind === 'stateTransition').length).toBeGreaterThanOrEqual(6)
    for (const v of vectors) expect(v.source.length, v.id).toBeGreaterThan(10)
  })

  for (const v of vectors) {
    it(`decodes ${v.id} to what was recorded`, async () => {
      const bytes = hexBytes(v.hex)
      if (v.kind === 'proof') {
        expect((await parseGroveProof(bytes, wasmBytes())).trimEnd()).toBe(v.expected)
        return
      }
      const opts =
        v.contractHex && v.type ? { contract: hexBytes(v.contractHex), type: v.type } : {}
      expect(normal(await decode(v.kind, bytes, opts))).toEqual(v.expected)
    }, 30_000)
  }
})
