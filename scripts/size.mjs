import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const BUDGET_BYTES = 220 * 1000

const distDir = resolve(process.argv[2] ?? 'apps/web/dist')
const manifest = JSON.parse(readFileSync(join(distDir, '.vite', 'manifest.json'), 'utf8'))

const entryKey = Object.keys(manifest).find((key) => manifest[key].isEntry)
if (!entryKey) {
  console.error(`No entry chunk found in ${distDir}/.vite/manifest.json`)
  process.exit(1)
}

const files = new Set()
const visited = new Set()
function collect(key) {
  if (visited.has(key)) return
  visited.add(key)
  const chunk = manifest[key]
  files.add(chunk.file)
  for (const dep of chunk.imports ?? []) collect(dep)
}
collect(entryKey)

// Classic scripts in index.html (the vendored dashhq shell) block first paint and are not in the manifest.
const html = readFileSync(join(distDir, 'index.html'), 'utf8')
for (const [tag] of html.matchAll(/<script\b[^>]*>/g)) {
  const src = /\bsrc="([^"]+)"/.exec(tag)?.[1]
  if (!src || /\btype="module"/.test(tag) || /^https?:/.test(src)) continue
  files.add(src.replace(/^\//, '').split('?')[0])
}

let total = 0
for (const file of [...files].sort()) {
  const gzipped = gzipSync(readFileSync(join(distDir, file)), { level: 9 }).length
  total += gzipped
  console.log(`${(gzipped / 1000).toFixed(2).padStart(8)} kB  ${file}`)
}

const kb = (bytes) => `${(bytes / 1000).toFixed(2)} kB`
console.log(`Initial JS: ${kb(total)} gzipped (budget ${kb(BUDGET_BYTES)})`)
if (total > BUDGET_BYTES) {
  console.error('Initial JS exceeds the budget')
  process.exit(1)
}
