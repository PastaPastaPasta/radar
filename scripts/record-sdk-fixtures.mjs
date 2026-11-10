// Records SDK fixtures: runs the SDK worker's implementation against the live network and keeps each WireResult.
// Read-only: one connect (quorum list and keys), then a handful of proof-checked reads, about a dozen requests.
// Output: apps/web/src/test/fixtures/sdk/<net>/<method>/<sha256 of the stable JSON of the args>.json
// Usage: node scripts/record-sdk-fixtures.mjs --net mainnet|testnet [--dry]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { format, resolveConfig } from 'prettier'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WEB = join(ROOT, 'apps/web')
const OUT = join(WEB, 'src/test/fixtures/sdk')

const argv = process.argv.slice(2)
const net = argv[argv.indexOf('--net') + 1]
const dry = argv.includes('--dry')
if (net !== 'mainnet' && net !== 'testnet') {
  console.error('Usage: node scripts/record-sdk-fixtures.mjs --net mainnet|testnet [--dry]')
  process.exit(2)
}
const picks = JSON.parse(readFileSync(join(ROOT, 'scripts/sdk-fixture-picks.json'), 'utf8'))
const pick = picks[net]

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
const load = (p) => server.ssrLoadModule(p)
const [{ createSdkWorkerApi }, factory, codec] = await Promise.all([
  load('/src/data/sdk/worker/api.ts'),
  load('/src/data/sdk/worker/sdk-factory.ts'),
  load('/src/test/fixtures/sdk-codec.ts'),
])

const api = createSdkWorkerApi({ createSdk: factory.createEvoSdk, decode: factory.decodeWithWasm })
const connected = await api.connect({ net, network: net })
if ('ok' in connected) {
  console.error(`connect failed: ${connected.error.message}`)
  await server.close()
  process.exit(1)
}
console.log(
  `connected to ${net} (protocol ${connected.protocolVersion}) in ${Math.round(connected.tookMs)} ms`,
)

const calls = [
  ['epoch.current', {}],
  ['system.status', {}],
  ['system.totalCredits', {}],
  ['identities.fetch', { id: pick.identity }],
  ['identities.fetch', { id: picks.absent }],
  ['identities.balances', { ids: [pick.identity, pick.otherIdentity] }],
  ['identities.balances', { ids: [pick.identity, picks.absent] }],
  ['contracts.getMany', { ids: [pick.contract] }],
  ['contracts.getMany', { ids: [pick.contract, picks.absent] }],
]

const prettierConfig = (await resolveConfig(join(ROOT, '.prettierrc'))) ?? {}
let failed = false
for (const [method, args] of calls) {
  const result = await api.call(net, method, args)
  const key = codec.argsKey(args)
  if (!result.ok) {
    failed = true
    console.log(`FAIL ${method} ${JSON.stringify(args)}: ${result.error.message}`)
    continue
  }
  const file = join(OUT, net, method, `${key}.json`)
  const body = JSON.stringify(
    {
      method,
      args: codec.encodeValue(args),
      recordedAt: new Date().toISOString(),
      result: codec.encodeValue(result),
    },
    null,
    2,
  )
  if (!dry) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, await format(body, { ...prettierConfig, parser: 'json' }))
  }
  const proof = result.proved
    ? `proved, ${result.proof.grovedbProof.length} proof bytes`
    : 'not proved'
  console.log(
    `ok   ${method} ${JSON.stringify(args).slice(0, 70)} (${Math.round(result.tookMs)} ms, ${proof})`,
  )
}
await server.close()
process.exit(failed ? 1 : 0)
