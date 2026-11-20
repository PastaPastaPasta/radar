import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const BUDGET_BYTES = 220 * 1000

const distDir = resolve(process.argv[2] ?? 'apps/web/dist')
const manifest = JSON.parse(readFileSync(join(distDir, '.vite', 'manifest.json'), 'utf8'))

// The service worker is its own script at /sw.js, loaded after first paint; it is never the app's entry.
const entryKey = Object.keys(manifest).find(
  (key) => manifest[key].isEntry && manifest[key].file !== 'sw.js',
)
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

// What each route loads beside the entry before its first read (the edge preloads it): the route's graph and the
// English catalog. Core routes must not reach the Platform SDK.
const ROUTE_BUDGET_BYTES = Number(process.env.ROUTE_BUDGET_BYTES ?? 270 * 1000)
const CORE_ROUTES = [
  '/',
  '/tx/$txid',
  '/block/$id',
  '/blocks',
  '/address/$address',
  '/governance/',
  '/mempool',
  '/rich-list',
  '/status',
]
const SDK_MODULE = /node_modules\/@dashevo\//

let table
try {
  table = JSON.parse(readFileSync(join(distDir, 'route-preload.json'), 'utf8'))
} catch {
  console.error(`No route-preload.json in ${distDir}: the edge would preload nothing`)
  process.exit(1)
}
const missing = table.files.filter((f) => {
  try {
    readFileSync(join(distDir, f))
    return false
  } catch {
    return true
  }
})
if (missing.length > 0) {
  console.error(`route-preload.json names files the build does not have: ${missing.join(', ')}`)
  process.exit(1)
}
const sdkFiles = new Set(
  Object.entries(manifest)
    .filter(([key]) => SDK_MODULE.test(key))
    .map(([, chunk]) => chunk.file),
)
const gz = new Map()
const gzOf = (file) => {
  if (!gz.has(file)) gz.set(file, gzipSync(readFileSync(join(distDir, file)), { level: 9 }).length)
  return gz.get(file)
}
const always = table.locales.en ?? []
const routes = table.routes.map(([pattern, ix]) => {
  const files = [...new Set([...ix, ...always])].map((i) => table.files[i])
  return { pattern, files, bytes: files.reduce((s, f) => s + gzOf(f), 0) }
})
routes.sort((a, b) => b.bytes - a.bytes)
for (const r of routes.slice(0, 5))
  console.log(`${kb(r.bytes).padStart(10)}  ${r.pattern} (${r.files.length} files)`)
const over = routes.filter((r) => r.bytes > ROUTE_BUDGET_BYTES)
const coreWithSdk = routes.filter(
  (r) => CORE_ROUTES.includes(r.pattern) && r.files.some((f) => sdkFiles.has(f)),
)
const unknownCore = CORE_ROUTES.filter((p) => !routes.some((r) => r.pattern === p))
console.log(
  `Largest route preload: ${kb(routes[0]?.bytes ?? 0)} gzipped (budget ${kb(ROUTE_BUDGET_BYTES)})`,
)
if (over.length > 0) {
  console.error(`Routes over the preload budget: ${over.map((r) => r.pattern).join(', ')}`)
  process.exit(1)
}
if (coreWithSdk.length > 0 || unknownCore.length > 0) {
  console.error(
    `Core routes reach the Platform SDK: ${coreWithSdk.map((r) => r.pattern).join(', ') || '-'}; not in the table: ${unknownCore.join(', ') || '-'}`,
  )
  process.exit(1)
}
