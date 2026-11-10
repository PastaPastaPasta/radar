// Builds dist/ the same way on every machine: absolute toolchain, cargo and checkout paths are
// remapped so they don't end up in the wasm, and the postbuild size pass must run (see postbuild.mjs).
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const cargoHome = process.env.CARGO_HOME ?? path.join(homedir(), '.cargo')
const rustupHome = process.env.RUSTUP_HOME ?? path.join(homedir(), '.rustup')

const rustflags = [
  `--remap-path-prefix=${cargoHome}=/cargo`,
  `--remap-path-prefix=${rustupHome}=/rustup`,
  `--remap-path-prefix=${root}=/radar-core-decode`,
]

const env = { ...process.env, CARGO_ENCODED_RUSTFLAGS: rustflags.join('\x1f') }
delete env.RUSTFLAGS
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, env, stdio: 'inherit' })

run('cargo', ['build', '--release', '--target', 'wasm32-unknown-unknown'])
run('wasm-bindgen', [
  '--target',
  'web',
  '--out-dir',
  'dist',
  '--out-name',
  'core_decode',
  'target/wasm32-unknown-unknown/release/radar_core_decode.wasm',
])
run(process.execPath, [path.join(root, 'scripts', 'postbuild.mjs')])
