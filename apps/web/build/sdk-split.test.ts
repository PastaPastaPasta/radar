import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SDK_VERSION } from '../src/data/sdk/worker/version'
import { evoSdkDist, evoSdkSourceFile, missingSplitFiles, sdkSplit } from './sdk-split'

describe('split SDK build', () => {
  it('finds every file it aliases, so an SDK bump that moves one fails here and not in production', () => {
    expect(missingSplitFiles()).toEqual([])
  })

  it('aliases the package entry and its wasm entry', () => {
    const config = sdkSplit().config as () => { resolve: { alias: { replacement: string }[] } }
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
})
