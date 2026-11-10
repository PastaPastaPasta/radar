// Live check of the production DAPI transport. Read-only, about a dozen requests: tip, ChainLock, a block, its
// coinbase, a header range, then the header stream for a few seconds (the best ChainLock arrives at once).
// Usage: node scripts/dapi-smoke.mjs mainnet|testnet
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WEB = join(ROOT, 'apps/web')
const net = process.argv[2]
if (net !== 'mainnet' && net !== 'testnet') {
  console.error('Usage: node scripts/dapi-smoke.mjs mainnet|testnet')
  process.exit(2)
}

const require = createRequire(join(WEB, 'package.json'))
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)
const server = await createServer({
  root: WEB,
  configFile: false,
  logLevel: 'warn',
  appType: 'custom',
  resolve: { alias: [{ find: '@', replacement: join(WEB, 'src') }] },
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
})
const wasm = await import(
  pathToFileURL(join(ROOT, 'packages/core-decode/dist/core_decode.js')).href
)
wasm.initSync({ module: readFileSync(join(ROOT, 'packages/core-decode/dist/core_decode_bg.wasm')) })

const load = (p) => server.ssrLoadModule(p)
const [
  { PoolDapiTransport },
  { createCoreClient },
  { createCoreDecoder },
  { createDapiRpc },
  { createCoreLive },
  { QueryClient },
] = await Promise.all([
  load('/src/data/dapi-core/pool.ts'),
  load('/src/data/core/client.ts'),
  load('/src/data/core/decode.ts'),
  load('/src/data/dapi-core/rpc.ts'),
  load('/src/data/core/live.ts'),
  import(pathToFileURL(require.resolve('@tanstack/query-core')).href),
])

const health = []
const transport = new PoolDapiTransport({
  health: {
    report: (_n, _s, r) => health.push(r),
    setBudget: () => undefined,
  },
})
const core = createCoreClient({
  transport: () => transport,
  decoder: createCoreDecoder(async () => wasm),
  hyphen: new Proxy({}, { get: () => () => Promise.reject(new Error('Hyphen is not used')) }),
  health: { get: () => ({ state: 'ok' }) },
  now: Date.now,
})

let failed = false
async function step(name, run) {
  const started = performance.now()
  try {
    const out = await run()
    console.log(`ok   ${name} (${Math.round(performance.now() - started)} ms) ${out ?? ''}`)
  } catch (e) {
    failed = true
    console.log(`FAIL ${name}: ${e instanceof Error ? e.message : e}`)
  }
}

let tip
await step('tip', async () => {
  const r = await core.tip(net)
  tip = r.data
  return `height ${tip.height} via ${r.node}`
})
await step('chainLock', async () => {
  const r = await core.chainLock(net)
  if (r.data.height > tip.height + 1) throw new Error('ChainLock above the tip')
  return `height ${r.data.height}`
})
await step('block', async () => {
  const r = await core.block(net, { height: tip.height - 20 })
  return `${r.data.txs.length} txs, chainLocked ${r.data.chainLocked}, immutable ${r.immutable === true}`
})
await step('coinbase tx', async () => {
  const b = await core.block(net, { height: tip.height - 20 })
  const r = await core.tx(net, b.data.txs[0].txid)
  return `type ${r.data.type}, ${r.data.confirmations} confirmations`
})
await step('headers', async () => {
  const r = await core.headers(net, tip.height - 9, 10)
  return `${r.data.length} headers`
})
await step('header stream', async () => {
  const ctrl = new AbortController()
  const handle = createDapiRpc(transport).headerStream(
    net,
    { fromHeight: tip.height, count: 0 },
    { signal: ctrl.signal },
  )
  const kinds = []
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    for await (const e of handle.events) {
      kinds.push(e.kind)
      if (kinds.includes('chainLock') && kinds.includes('headers')) break
    }
  } catch (e) {
    if (!(e && e.kind === 'aborted')) throw e
  } finally {
    clearTimeout(timer)
    ctrl.abort()
  }
  if (kinds.length === 0) throw new Error('no message in 8 s')
  return `${kinds.join(', ')} from ${handle.node}`
})
await step('coreLive.tip', async () => {
  const decoder = createCoreDecoder(async () => wasm)
  const live = createCoreLive({
    transport: () => transport,
    tip: (n, signal) => core.tip(n, signal),
    headerHash: (h, n) => decoder.headerHash(h, n),
    decodeTx: (b, n) => decoder.tx(b, n),
    decodeIsLock: (b) => decoder.isLock(b),
    now: Date.now,
    health: { setLag: () => undefined },
  })
  const qc = new QueryClient()
  const release = live.tip(net, qc)
  const deadline = Date.now() + 8000
  while (!qc.getQueryData([net, 'dapi', 'chainlock']) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100))
  }
  const state = live.status(net).state
  const chainLock = qc.getQueryData([net, 'dapi', 'chainlock'])
  release()
  if (!chainLock) throw new Error('no ChainLock in 8 s')
  return `${state}, ChainLock ${chainLock.data.height}`
})

const snap = transport.budget.snapshot(net)
console.log(
  `budget ${snap.pressure}: ${snap.usedLastMinute} requests used of ${snap.capacity}, ${snap.benched} nodes resting`,
)
console.log(
  `health reports: ${health.filter((h) => h.ok).length} ok, ${health.filter((h) => !h.ok).length} failed`,
)
await server.close()
process.exit(failed ? 1 : 0)
