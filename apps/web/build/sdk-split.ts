import { existsSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))

const evoSdkDir = () => realpathSync(join(here, '../node_modules/@dashevo/evo-sdk'))

/** Next to the app when it's a direct dependency, else beside the SDK in pnpm's store. */
function wasmSdkDir(): string {
  const direct = join(here, '../node_modules/@dashevo/wasm-sdk')
  return existsSync(direct) ? realpathSync(direct) : join(evoSdkDir(), '../wasm-sdk')
}

/** The tsc output of the package, which `exports` hides. Its wasm entry is aliased to the shim below. */
export function evoSdkSourceFile(): string {
  return join(evoSdkDir(), 'dist/sdk.js')
}

export const evoSdkDist = (): string => join(evoSdkDir(), 'dist')

export const WASM_SHIM = join(here, '../src/data/sdk/worker/wasm-split.ts')

/** Every file the split build depends on, so a test can fail when an SDK bump moves one. */
export function splitBuildFiles(): string[] {
  return [evoSdkSourceFile(), WASM_SHIM, join(wasmSdkDir(), 'dist/raw/wasm_sdk_bg.wasm')]
}

/**
 * Loads the SDK's wasm as its own hashed asset instead of the copy inlined in the package's JS (5.8 MB brotli instead
 * of 9.1 MB over the wire, and Chrome keeps its compiled code). It routes around the package's `exports` map, so it
 * depends on the 5.0.x file layout; `sdk-split.test.ts` fails when that layout changes.
 */
export function sdkSplit(opts: { fixtures?: boolean } = {}): Plugin {
  return {
    name: 'radar:sdk-split',
    enforce: 'pre',
    // Fixture builds replay recorded answers, so the worker, the SDK and its 25 MiB wasm stay out of their output.
    load(id) {
      if (!opts.fixtures) return null
      const file = id.split('?')[0]!
      if (file.endsWith('/data/sdk/transport-worker.ts')) {
        return 'export const createWorkerTransport = () => Promise.reject(new Error("[radar-fixtures] no SDK worker in fixture builds"))'
      }
      if (file.endsWith('/data/sdk/transport-inline.ts')) {
        return 'export const createInlineTransport = () => Promise.reject(new Error("[radar-fixtures] no inline SDK in fixture builds"))'
      }
      return null
    },
    config() {
      return {
        resolve: {
          alias: [
            { find: /^@dashevo\/evo-sdk$/, replacement: evoSdkSourceFile() },
            { find: /^@dashevo\/wasm-sdk\/compressed$/, replacement: WASM_SHIM },
            {
              find: /^@dashevo\/wasm-sdk\/raw$/,
              replacement: join(wasmSdkDir(), 'dist/raw/wasm_sdk.js'),
            },
            {
              find: /^@dashevo\/wasm-sdk\/raw\/(.*)$/,
              replacement: `${join(wasmSdkDir(), 'dist/raw')}/$1`,
            },
          ],
        },
      }
    },
  }
}

export const missingSplitFiles = (): string[] => splitBuildFiles().filter((f) => !existsSync(f))
