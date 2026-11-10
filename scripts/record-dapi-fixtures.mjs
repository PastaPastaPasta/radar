// Records DAPI Core fixtures by running the Core façade against live evonodes and keeping every exchange.
// Read-only: getBlockchainStatus, getBlock, getTransaction, and the header and transaction streams.
// Budget: at most 40 requests a minute and 4 in flight per node, spread over the bundled seed nodes.
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { format, resolveConfig } from 'prettier'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WEB = join(ROOT, 'apps/web')
const OUT = join(WEB, 'src/test/fixtures/dapi')

const USAGE = `Usage: node scripts/record-dapi-fixtures.mjs --net mainnet|testnet [options]

Runs the Core façade against live nodes (seeds in apps/web/src/data/dapi-core/seed.<net>.json) and writes
apps/web/src/test/fixtures/dapi/<net>/<method>/<sha256 of the request>.json plus manifest.json.

Entities come from scripts/dapi-fixture-picks.<net>.json.

Options:
  --net <net>            mainnet or testnet (required)
  --discover             scan recent blocks for one transaction of each special type, print them, record nothing
  --blocks <n>           how many blocks --discover scans, newest first (default 1500)
  --from <height>        --discover starts here instead of the tip
  --dry                  run the scenarios but write nothing`

const args = { net: undefined, discover: false, blocks: 1500, from: undefined, dry: false }
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--net') args.net = argv[++i]
  else if (a === '--discover') args.discover = true
  else if (a === '--blocks') args.blocks = Number(argv[++i])
  else if (a === '--from') args.from = Number(argv[++i])
  else if (a === '--dry') args.dry = true
  else {
    console.error(USAGE)
    process.exit(a === '--help' ? 0 : 2)
  }
}
if (args.net !== 'mainnet' && args.net !== 'testnet') {
  console.error(USAGE)
  process.exit(2)
}
const net = args.net

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

const wasm = await import(pathToFileURL(join(ROOT, 'packages/core-decode/dist/core_decode.js')).href)
wasm.initSync({ module: readFileSync(join(ROOT, 'packages/core-decode/dist/core_decode_bg.wasm')) })

const load = (p) => server.ssrLoadModule(p)
const [{ LiveDapiTransport, RecordingDapiTransport }, scenarios, decodeMod, clientMod] = await Promise.all([
  load('/src/test/msw/dapi-recording.ts'),
  load('/src/test/msw/dapi-scenarios.ts'),
  load('/src/data/core/decode.ts'),
  load('/src/data/core/client.ts'),
])

const seeds = JSON.parse(readFileSync(join(WEB, `src/data/dapi-core/seed.${net}.json`), 'utf8'))
const live = new LiveDapiTransport(net, seeds.nodes)
const decoder = decodeMod.createCoreDecoder(async () => wasm)
const say = (m) => console.log(m)

async function finish(code = 0) {
  await server.close()
  process.exit(code)
}

if (args.discover) {
  const { createDapiRpc } = await load('/src/data/dapi-core/rpc.ts')
  const tip = args.from ?? (await createDapiRpc(live).bestHeight(net)).message.height
  say(`${net}: scanning ${args.blocks} blocks down from ${tip}`)
  const found = await scenarios.discoverTxTypes(live, decoder, net, tip, tip - args.blocks + 1, say)
  for (const [kind, f] of [...found].sort()) say(`${kind}\t${f.txid}\t${f.height}`)
  say(`${live.requestCount} requests`)
  await finish()
}

const picksFile = join(ROOT, `scripts/dapi-fixture-picks.${net}.json`)
const picks = JSON.parse(readFileSync(picksFile, 'utf8'))

const recording = new RecordingDapiTransport(live)
const core = clientMod.createCoreClient({
  transport: () => recording,
  decoder,
  hyphen: new Proxy({}, { get: () => () => Promise.reject(new Error('Hyphen is not used while recording DAPI')) }),
  health: { get: () => ({ state: 'ok' }) },
  now: Date.now,
})

const entries = []
const startedAt = new Date()
try {
  await scenarios.runScenarios(core, net, picks, recording, {
    entry: (e) => {
      entries.push(e)
      say(`  ${e.id}: ${e.purpose.slice(0, 80)}`)
    },
    say,
  })
} catch (e) {
  console.error(e)
  await finish(1)
}

const tip = entries.find((e) => e.id === 'tip')
const manifest = {
  net,
  recordedAt: startedAt.toISOString(),
  tip: { height: tip.height, hash: tip.hash },
  entries,
  gaps: picks.gaps ?? [],
}
const prettierOptions = (await resolveConfig(join(ROOT, 'package.json'))) ?? {}
const write = async (file, value) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, await format(JSON.stringify(value), { ...prettierOptions, parser: 'json' }))
}

say(`${recording.exchanges.size} exchanges, ${live.requestCount} requests over ${live.requests.size} nodes`)
if (!args.dry) {
  const dir = join(OUT, net)
  if (existsSync(dir)) rmSync(dir, { recursive: true })
  for (const x of recording.exchanges.values()) {
    await write(join(dir, x.method, `${x.key}.json`), x.fixture)
  }
  await write(join(dir, 'manifest.json'), manifest)
  say(`wrote ${dir}`)
}
await finish()
