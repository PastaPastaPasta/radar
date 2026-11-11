import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin, ResolvedConfig } from 'vite'

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

export const WASM_PARTS_MODULE = 'virtual:radar-sdk-wasm-parts'
const RESOLVED_PARTS_MODULE = `\0${WASM_PARTS_MODULE}`

/** Cloudflare Workers refuses a static asset over 25 MiB and the wasm is 25.5 MiB, so production ships it in pieces. */
export const WASM_PART_BYTES = 16 * 1024 * 1024

/** The glue without its default `new URL('wasm_sdk_bg.wasm')`, which would make the bundler emit the whole wasm too. */
export const noUrlGlue = (): string => join(wasmSdkDir(), 'dist/raw/wasm_sdk.no_url.js')

export const wasmFile = (): string => join(wasmSdkDir(), 'dist/raw/wasm_sdk_bg.wasm')

export function splitBytes(bytes: Uint8Array, partBytes = WASM_PART_BYTES): Uint8Array[] {
  const parts: Uint8Array[] = []
  for (let at = 0; at < bytes.length; at += partBytes)
    parts.push(bytes.subarray(at, at + partBytes))
  return parts
}

export const sha256Hex = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex')

export const WASM_SHIM = join(here, '../src/data/sdk/worker/wasm-split.ts')

/** Every file the split build depends on, so a test can fail when an SDK bump moves one. */
export function splitBuildFiles(): string[] {
  return [evoSdkSourceFile(), WASM_SHIM, wasmFile(), noUrlGlue()]
}

/**
 * Loads the SDK's wasm as its own hashed asset instead of the copy inlined in the package's JS (5.8 MB brotli instead
 * of 9.1 MB over the wire, and Chrome keeps its compiled code). It routes around the package's `exports` map, so it
 * depends on the 5.0.x file layout; `sdk-split.test.ts` fails when that layout changes.
 */
export function sdkSplit(opts: { fixtures?: boolean } = {}): Plugin {
  let serving = false
  return {
    name: 'radar:sdk-split',
    enforce: 'pre',
    configResolved(config: ResolvedConfig) {
      serving = config.command === 'serve'
    },
    resolveId(id) {
      return id === WASM_PARTS_MODULE ? RESOLVED_PARTS_MODULE : null
    },
    // Fixture builds replay recorded answers, so the worker, the SDK and its 25 MiB wasm stay out of their output.
    load(id) {
      if (id === RESOLVED_PARTS_MODULE) {
        const bytes = readFileSync(wasmFile())
        if (serving) {
          return `import wasmUrl from ${JSON.stringify(`${wasmFile()}?url`)}\nexport default [{ url: wasmUrl, sha256: ${JSON.stringify(sha256Hex(bytes))} }]`
        }
        const parts = splitBytes(bytes).map((source, i) => {
          const ref = this.emitFile({ type: 'asset', name: `wasm_sdk_bg.part${i}.wasm`, source })
          return `{ url: import.meta.ROLLUP_FILE_URL_${ref}, sha256: ${JSON.stringify(sha256Hex(source))} }`
        })
        return `export default [${parts.join(', ')}]`
      }
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
              replacement: noUrlGlue(),
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
