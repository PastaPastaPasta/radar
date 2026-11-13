// Records the decoder test vectors under apps/web/src/features/tools/decoders/vectors/.
// - state transitions: real transitions out of the recorded Platform Explorer rows (offline);
// - proofs: the real GroveDB proofs kept under decoders/fixtures (offline);
// - contract, identity, document: fetched once from the network (read-only) and serialized with the SDK.
// Each vector keeps its bytes as hex, where they came from and the SDK's own decoding of them (`expected`), which the
// e2e specs replay in place of the wasm the fixture build does not ship.
// Usage: node scripts/record-decoder-vectors.mjs [--offline]
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const WEB = join(ROOT, 'apps/web')
const OUT = join(WEB, 'src/features/tools/decoders/vectors')
const offline = process.argv.includes('--offline')
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
const { decodeWithWasm } = await server.ssrLoadModule('/src/data/sdk/worker/decode.ts')
const factory = offline ? null : await server.ssrLoadModule('/src/data/sdk/worker/sdk-factory.ts')

mkdirSync(OUT, { recursive: true })
const hex = (bytes) => Buffer.from(bytes).toString('hex')
const json = (value) =>
  JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))
const written = []
function save(vector) {
  writeFileSync(join(OUT, `${vector.id}.json`), `${JSON.stringify(vector, null, 2)}\n`)
  written.push(`${vector.id} (${vector.hex.length / 2} bytes)`)
}

// 1. Transitions: one small real row per transition type.
const WANT = {
  IDENTITY_CREDIT_TRANSFER: 'credit-transfer',
  'BATCH/DOCUMENT_CREATE': 'document-create',
  'BATCH/TOKEN_TRANSFER': 'token-transfer',
  DATA_CONTRACT_CREATE: 'contract-create',
  IDENTITY_UPDATE: 'identity-update',
  MASTERNODE_VOTE: 'masternode-vote',
  IDENTITY_TOP_UP: 'identity-top-up',
  IDENTITY_CREDIT_WITHDRAWAL: 'credit-withdrawal',
  ADDRESS_FUNDS_TRANSFER: 'address-funds-transfer',
}
const rows = []
for (const network of ['mainnet', 'testnet']) {
  const dir = join(WEB, 'src/test/fixtures/http/pe', network)
  for (const file of readdirSync(dir)) {
    let body
    try {
      body = JSON.parse(readFileSync(join(dir, file), 'utf8')).body
    } catch {
      continue
    }
    const walk = (o) => {
      if (Array.isArray(o)) o.forEach(walk)
      else if (o && typeof o === 'object') {
        if (typeof o.data === 'string' && typeof o.hash === 'string' && typeof o.type === 'string')
          rows.push({ network, file, row: o })
        Object.values(o).forEach(walk)
      }
    }
    walk(body)
  }
}
const taken = new Set()
for (const { network, file, row } of rows) {
  const key = row.type === 'BATCH' ? `BATCH/${row.batchType}` : row.type
  const id = WANT[key]
  if (!id || taken.has(id)) continue
  taken.add(id)
  const bytes = Uint8Array.from(Buffer.from(row.data, 'base64'))
  save({
    id: `transition-${id}`,
    kind: 'stateTransition',
    network,
    source: `Platform Explorer transaction ${row.hash} (fixture pe/${network}/${file})`,
    hex: hex(bytes),
    expected: json(await decodeWithWasm('stateTransition', bytes)),
  })
}

// 2. Proofs: the recorded GroveDB proofs.
const FIXTURES = join(WEB, 'src/features/tools/decoders/fixtures')
for (const name of ['testnet-dpns-domain-asc', 'testnet-grades-semester-avg']) {
  save({
    id: `proof-${name.replace('testnet-', '')}`,
    kind: 'proof',
    network: 'testnet',
    source: `SDK documents.*WithProof grovedbProof, kept as decoders/fixtures/${name}.bin`,
    hex: hex(readFileSync(join(FIXTURES, `${name}.bin`))),
    expected: readFileSync(join(FIXTURES, `${name}.txt`), 'utf8').trimEnd(),
  })
}

// 3. Contract, identity, document: from the network.
if (!offline) {
  const net = process.env.NET ?? 'mainnet'
  const handle = await factory.createEvoSdk({ network: net })
  const sdk = handle.reads
  const version = handle.protocolVersion
  const DPNS = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
  const IDENTITY = 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp'
  const contract = await sdk.contracts.fetch(DPNS)
  const contractBytes = contract.toBytes(version)
  save({
    id: 'contract-dpns',
    kind: 'dataContract',
    network: net,
    source: `contracts.fetch ${DPNS} (DPNS), serialized with toBytes(${version})`,
    hex: hex(contractBytes),
    expected: json(await decodeWithWasm('dataContract', contractBytes)),
  })
  const identity = await sdk.identities.fetch(IDENTITY)
  const identityBytes = identity.toBytes()
  save({
    id: 'identity-main',
    kind: 'identity',
    network: net,
    source: `identities.fetch ${IDENTITY}, serialized with toBytes()`,
    hex: hex(identityBytes),
    expected: json(await decodeWithWasm('identity', identityBytes)),
  })
  const found = await sdk.documents.query({
    dataContractId: DPNS,
    documentTypeName: 'domain',
    where: [
      ['normalizedParentDomainName', '==', 'dash'],
      ['normalizedLabel', '==', 'pshenm1c'],
    ],
    limit: 1,
  })
  const [document] = [...found.values()]
  if (document) {
    const documentBytes = document.toBytes(contract, version)
    save({
      id: 'document-dpns-domain',
      kind: 'document',
      network: net,
      source: `documents.query DPNS domain pshenm1c.dash, serialized with toBytes(contract, ${version})`,
      hex: hex(documentBytes),
      contractHex: hex(contractBytes),
      type: 'domain',
      expected: json(
        await decodeWithWasm('document', documentBytes, {
          contract: contractBytes,
          type: 'domain',
        }),
      ),
    })
  } else console.log('NO DOCUMENT for pshenm1c.dash')
  handle.free()
}
console.log(written.join('\n'))
await server.close()
process.exit(0)
