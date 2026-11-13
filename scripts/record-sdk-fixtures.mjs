// Records SDK fixtures: runs the SDK worker's implementation against the live network and keeps each WireResult.
// Read-only: one connect (quorum list and keys), then proof-checked reads, one request each.
// Calls come from scripts/sdk-fixture-calls/<pkg>.json: { "mainnet": [[method, args], …], "testnet": […] }. A string
// "{name}" in the args is the id of that entity in review/fixtures/<net>.json, "{name.field}" one of its fields, and
// "{name:n}" the same as a number, "{absent}" an id that exists nowhere; scripts/sdk-fixture-picks.json adds the few ids that file does not hold.
// Output: apps/web/src/test/fixtures/sdk/<net>/<method>/<sha256 of the stable JSON of the args>.json
// Usage: node scripts/record-sdk-fixtures.mjs --net mainnet|testnet [--calls shared,net-c] [--skip-existing] [--dry]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { format, resolveConfig } from 'prettier'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WEB = join(ROOT, 'apps/web')
const OUT = join(WEB, 'src/test/fixtures/sdk')

const argv = process.argv.slice(2)
const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
const net = flag('--net')
const packages = (flag('--calls') ?? 'shared').split(',')
const dry = argv.includes('--dry')
const skipExisting = argv.includes('--skip-existing')
if (net !== 'mainnet' && net !== 'testnet') {
  console.error(
    'Usage: node scripts/record-sdk-fixtures.mjs --net mainnet|testnet [--calls shared,net-c] [--skip-existing] [--dry]',
  )
  process.exit(2)
}
const readJson = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'))
const picks = readJson('scripts/sdk-fixture-picks.json')
const entities = readJson(`review/fixtures/${net}.json`).entities

function resolveName(name) {
  if (name === 'absent') return picks.absent
  const [entity, field] = name.split('.')
  if (picks[net][entity] !== undefined && !field) return picks[net][entity]
  const found = entities[entity]
  const value = field ? found?.[field] : found?.id
  if (value === undefined)
    throw new Error(`no "${name}" in review/fixtures/${net}.json or the picks`)
  return value
}
const fill = (value) => {
  if (typeof value === 'string') {
    const whole = /^\{([\w.]+)(:n)?\}$/.exec(value)
    if (whole) return whole[2] ? Number(resolveName(whole[1])) : resolveName(whole[1])
    return value.replace(/\{([\w.]+)\}/g, (_, name) => resolveName(name))
  }
  if (Array.isArray(value)) return value.map(fill)
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v)]))
  return value
}
const calls = packages.flatMap((pkg) => {
  const file = `scripts/sdk-fixture-calls/${pkg}.json`
  if (!existsSync(join(ROOT, file))) throw new Error(`${file} does not exist`)
  return (readJson(file)[net] ?? []).map(([method, args]) => [method, fill(args ?? {})])
})

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
const [{ createSdkWorkerApi }, factory, { decodeWithWasm }, codec] = await Promise.all([
  load('/src/data/sdk/worker/api.ts'),
  load('/src/data/sdk/worker/sdk-factory.ts'),
  load('/src/data/sdk/worker/decode.ts'),
  load('/src/test/fixtures/sdk-codec.ts'),
])

const api = createSdkWorkerApi({ createSdk: factory.createEvoSdk, decode: decodeWithWasm })
const connected = await api.connect({ net, network: net })
if ('ok' in connected) {
  console.error(`connect failed: ${connected.error.message}`)
  await server.close()
  process.exit(1)
}
console.log(
  `connected to ${net} (protocol ${connected.protocolVersion}) in ${Math.round(connected.tookMs)} ms`,
)

const prettierConfig = (await resolveConfig(join(ROOT, '.prettierrc'))) ?? {}
let failed = false
for (const [method, args] of calls) {
  const key = codec.argsKey(args)
  const file = join(OUT, net, method, `${key}.json`)
  if (skipExisting && existsSync(file)) {
    console.log(`skip ${method} ${JSON.stringify(args).slice(0, 70)} (recorded)`)
    continue
  }
  const result = await api.call(net, method, args)
  if (!result.ok) {
    failed = true
    console.log(`FAIL ${method} ${JSON.stringify(args)}: ${result.error.message}`)
    continue
  }
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
