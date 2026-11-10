// Writes the bundled fallback node list: apps/web/src/data/dapi-core/seed.<net>.json.
// Probes every ENABLED, version-checked evonode with one getBestBlockHeight call (read-only, one request per node)
// and keeps a random sample of those that answer fast and are at the chain tip.
import { writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'apps/web/src/data/dapi-core')
const SAMPLE = 30
const PROBE_CONCURRENCY = 12
const MAX_LATENCY_MS = 2000

const NETS = {
  mainnet: { quorums: 'https://quorums.mainnet.networks.dash.org', port: 443 },
  testnet: { quorums: 'https://quorums.testnet.networks.dash.org', port: 1443 },
}

const net = process.argv[2]
if (!NETS[net]) {
  console.error('Usage: node scripts/seed-nodes.mjs mainnet|testnet')
  process.exit(2)
}

/** Reads the first varint field of an unframed protobuf message (getBestBlockHeight: field 1, the height). */
function firstVarint(bytes) {
  let i = 1
  let v = 0
  let shift = 0
  while (i < bytes.length) {
    const b = bytes[i++]
    v += (b & 0x7f) * 2 ** shift
    if (!(b & 0x80)) return v
    shift += 7
  }
  return undefined
}

async function bestHeight(url) {
  const started = performance.now()
  const res = await fetch(`${url}/org.dash.platform.dapi.v0.Core/getBestBlockHeight`, {
    method: 'POST',
    headers: { 'content-type': 'application/grpc-web+proto', 'x-grpc-web': '1' },
    body: new Uint8Array([0, 0, 0, 0, 0]),
    signal: AbortSignal.timeout(MAX_LATENCY_MS * 2),
  })
  const bytes = new Uint8Array(await res.arrayBuffer())
  const latencyMs = Math.round(performance.now() - started)
  if (!res.ok || bytes[0] !== 0) throw new Error(`HTTP ${res.status}`)
  const length = new DataView(bytes.buffer).getUint32(1)
  const height = firstVarint(bytes.subarray(5, 5 + length))
  if (height === undefined) throw new Error('no height')
  return { height, latencyMs }
}

const list = await (await fetch(`${NETS[net].quorums}/masternodes`)).json()
const candidates = list.data
  .filter((n) => n.status === 'ENABLED' && n.versionCheck === 'success')
  .map((n) => {
    const ip = n.address.split(':')[0]
    const port = n.platformHTTPPort ?? NETS[net].port
    return { proTxHash: n.proTxHash, ip, port, url: `https://${ip}:${port}` }
  })

const probed = []
let next = 0
await Promise.all(
  Array.from({ length: PROBE_CONCURRENCY }, async () => {
    while (next < candidates.length) {
      const node = candidates[next++]
      try {
        probed.push({ ...node, ...(await bestHeight(node.url)) })
      } catch {
        // an unreachable node is simply not a seed
      }
    }
  }),
)

const tip = Math.max(...probed.map((p) => p.height))
const fit = probed.filter((p) => p.height >= tip - 1 && p.latencyMs <= MAX_LATENCY_MS)
for (let i = fit.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1))
  ;[fit[i], fit[j]] = [fit[j], fit[i]]
}
const nodes = fit
  .slice(0, SAMPLE)
  .map(({ proTxHash, url }) => ({ proTxHash, url }))
  .sort((a, b) => a.url.localeCompare(b.url))

const file = join(OUT, `seed.${net}.json`)
writeFileSync(file, JSON.stringify({ net, generatedAt: new Date().toISOString(), nodes }, null, 2) + '\n')
console.log(
  `${net}: ${candidates.length} candidates, ${probed.length} answered, ${fit.length} at the tip (${tip}) and under ${MAX_LATENCY_MS} ms; wrote ${nodes.length} to ${file}`,
)
