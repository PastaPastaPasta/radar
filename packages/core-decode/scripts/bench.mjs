// Decode-time benchmark on the large mainnet blocks in tests/fixtures/large/.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { initSync, decodeBlock } from '../dist/core_decode.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const t0 = performance.now()
initSync({ module: readFileSync(path.join(root, 'dist', 'core_decode_bg.wasm')) })
console.log(`wasm instantiate: ${(performance.now() - t0).toFixed(1)} ms`)

const dir = path.join(root, 'tests', 'fixtures', 'large')
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
for (const f of readdirSync(dir).sort()) {
  const bytes = Buffer.from(readFileSync(path.join(dir, f), 'utf8').trim(), 'hex')
  const first = performance.now()
  let b = decodeBlock(bytes, 'mainnet')
  const cold = performance.now() - first
  const times = []
  for (let i = 0; i < 30; i++) {
    const s = performance.now()
    b = decodeBlock(bytes, 'mainnet')
    times.push(performance.now() - s)
  }
  const med = median(times)
  console.log(
    `${f.slice(0, 22)}  ${(bytes.length / 1024).toFixed(0)} KiB  ${b.txCount} txs  first ${cold.toFixed(1)} ms  median ${med.toFixed(1)} ms  min ${Math.min(...times).toFixed(1)} ms  ${(bytes.length / 1048576 / (med / 1000)).toFixed(1)} MiB/s`,
  )
}
