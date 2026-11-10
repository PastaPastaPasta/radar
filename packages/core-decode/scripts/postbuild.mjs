// Runs after wasm-bindgen: shrink the wasm with wasm-opt when available and install the hand-written typings.
import { copyFileSync, readFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const wasm = path.join(root, 'dist', 'core_decode_bg.wasm')

copyFileSync(
  path.join(root, 'types', 'core_decode.d.ts'),
  path.join(root, 'dist', 'core_decode.d.ts'),
)

let wasmOpt = null
try {
  execFileSync('wasm-opt', ['--version'], { stdio: 'ignore' })
  wasmOpt = 'wasm-opt'
} catch {
  // wasm-opt is optional
}
const before = statSync(wasm).size
if (wasmOpt) {
  execFileSync(
    wasmOpt,
    [
      '-Oz',
      '--enable-bulk-memory',
      '--enable-sign-ext',
      '--enable-nontrapping-float-to-int',
      '--enable-mutable-globals',
      '--strip-debug',
      '--strip-producers',
      wasm,
      '-o',
      wasm,
    ],
    { stdio: 'inherit' },
  )
} else {
  console.warn('wasm-opt (binaryen) not on PATH; skipping the size pass')
}
const buf = readFileSync(wasm)
console.log(
  `core_decode_bg.wasm: ${before} -> ${buf.length} bytes, ${gzipSync(buf, { level: 9 }).length} gzipped${wasmOpt ? '' : " (not wasm-opt'd)"}`,
)
