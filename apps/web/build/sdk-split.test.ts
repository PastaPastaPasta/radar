import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SDK_VERSION } from '../src/data/sdk/worker/version'
import {
  WASM_PART_BYTES,
  evoSdkDist,
  evoSdkSourceFile,
  missingSplitFiles,
  sdkSplit,
  sha256Hex,
  splitBytes,
  wasmFile,
} from './sdk-split'

describe('split SDK build', () => {
  it('finds every file it aliases, so an SDK bump that moves one fails here and not in production', () => {
    expect(missingSplitFiles()).toEqual([])
  })

  it('aliases the package entry and its wasm entry', () => {
    const config = sdkSplit().config as unknown as () => {
      resolve: { alias: { replacement: string }[] }
    }
    const aliases = config().resolve.alias.map((a) => a.replacement)
    expect(aliases).toContain(evoSdkSourceFile())
    expect(aliases.some((a) => a.endsWith('wasm-split.ts'))).toBe(true)
  })

  it('still reaches the wasm through the entry the shim replaces', () => {
    const wasmJs = readFileSync(join(evoSdkDist(), 'wasm.js'), 'utf8')
    expect(wasmJs).toContain("'@dashevo/wasm-sdk/compressed'")
  })

  it('names the installed SDK version', () => {
    const pkg = JSON.parse(readFileSync(join(evoSdkDist(), '../package.json'), 'utf8')) as {
      version: string
    }
    expect(SDK_VERSION).toBe(pkg.version)
  })

  it('cuts the wasm into pieces that rejoin to the same bytes and stay under the Workers asset limit', () => {
    const bytes = readFileSync(wasmFile())
    const parts = splitBytes(bytes)
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(WASM_PART_BYTES)
    expect(WASM_PART_BYTES).toBeLessThan(25 * 1024 * 1024)
    expect(Buffer.concat(parts).equals(bytes)).toBe(true)
  })
})

describe('split SDK build digests', () => {
  it('emits a SHA-256 for each wasm part that matches the part’s bytes', () => {
    const bytes = readFileSync(wasmFile())
    const parts = splitBytes(bytes)
    const emitted: Uint8Array[] = []
    const plugin = sdkSplit()
    const load = plugin.load as unknown as (
      this: { emitFile: (f: { source: Uint8Array }) => string },
      id: string,
    ) => string | null
    const code = load.call(
      {
        emitFile: (f) => {
          emitted.push(f.source)
          return String(emitted.length - 1)
        },
      },
      '\0virtual:radar-sdk-wasm-parts',
    )
    expect(code).not.toBeNull()
    const digests = [...code!.matchAll(/sha256: "([0-9a-f]{64})"/g)].map((m) => m[1])
    expect(digests).toEqual(parts.map(sha256Hex))
    expect(emitted).toHaveLength(parts.length)
  })
})
