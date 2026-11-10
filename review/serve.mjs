#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const edgeDir = path.join(root, 'workers', 'edge')

const { values } = parseArgs({
  options: {
    dist: { type: 'string', default: path.join(root, 'apps', 'web', 'dist') },
    port: { type: 'string', default: '8890' },
    host: { type: 'string', default: '127.0.0.1' },
  },
})

const dist = path.resolve(values.dist)
if (!existsSync(path.join(dist, 'index.html'))) {
  console.error(`no index.html in ${dist}; build the tag first (pnpm --filter @radar/web build)`)
  process.exit(1)
}

const { Miniflare } = createRequire(path.join(edgeDir, 'package.json'))('miniflare')
const wrangler = JSON.parse(
  readFileSync(path.join(edgeDir, 'wrangler.jsonc'), 'utf8').replace(/,(\s*[}\]])/g, '$1'),
)
const patterns = wrangler.assets.run_worker_first
const outdir = mkdtempSync(path.join(tmpdir(), 'radar-serve-'))

execFileSync(
  process.execPath,
  [
    path.join(edgeDir, 'node_modules/wrangler/bin/wrangler.js'),
    'deploy',
    '--dry-run',
    '--outdir',
    outdir,
  ],
  {
    cwd: edgeDir,
    stdio: 'pipe',
  },
)

const mf = new Miniflare({
  modules: [
    {
      type: 'ESModule',
      path: 'index.js',
      contents: readFileSync(path.join(outdir, 'index.js'), 'utf8'),
    },
  ],
  compatibilityDate: wrangler.compatibility_date,
  bindings: wrangler.vars,
  host: values.host,
  port: Number(values.port),
  assets: {
    directory: dist,
    binding: wrangler.assets.binding,
    routerConfig: {
      has_user_worker: true,
      static_routing: {
        user_worker: patterns.filter((p) => !p.startsWith('!')),
        asset_worker: patterns.filter((p) => p.startsWith('!')).map((p) => p.slice(1)),
      },
    },
  },
})
await mf.ready

console.log(`serving ${dist}`)
console.log(`http://radar.localhost:${values.port}  (also http://127.0.0.1:${values.port})`)

const stop = async () => {
  await mf.dispose().catch(() => {})
  rmSync(outdir, { recursive: true, force: true })
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
