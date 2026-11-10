// One-off: scans recent mainnet blocks from a public Insight instance and saves
// one real block plus one real tx of every special type found under tests/fixtures/.
// Also saves Insight's own JSON for each (tests/fixtures/*.insight.json), the independent reference the tests compare to.
// Usage: node scripts/fetch-fixtures.mjs [blocksToScan=4000]
//        node scripts/fetch-fixtures.mjs --refs-only   (re-fetch the Insight references for the existing manifest)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { initSync, decodeBlock } from '../dist/core_decode.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const API = process.env.INSIGHT ?? 'https://insight.dash.org/insight-api'
const out = path.join(root, 'tests', 'fixtures')
mkdirSync(out, { recursive: true })
initSync({ module: readFileSync(path.join(root, 'dist', 'core_decode_bg.wasm')) })

const get = async (p) => {
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch(API + p, {
        headers: { 'user-agent': 'radar-core-decode-fixtures/0.1' },
      })
      if (r.ok) return r
    } catch {
      // retried below
    }
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)))
  }
  throw new Error('GET ' + p + ' failed')
}
const json = async (p) => (await get(p)).json()
const rawBlock = async (h) => (await json(`/rawblock/${h}`)).rawblock

async function refs(manifest) {
  const b = manifest.block
  writeFileSync(
    path.join(out, `block-${b.hash}.insight.json`),
    JSON.stringify(await json(`/block/${b.hash}`)) + '\n',
  )
  for (const [type, info] of Object.entries(manifest.txs)) {
    writeFileSync(
      path.join(out, `tx-${type}-${info.txid}.insight.json`),
      JSON.stringify(await json(`/tx/${info.txid}`)) + '\n',
    )
  }
}

if (process.argv[2] === '--refs-only') {
  await refs(JSON.parse(readFileSync(path.join(out, 'manifest.json'), 'utf8')))
  process.exit(0)
}

const tip = process.env.SCAN_FROM
  ? Number(process.env.SCAN_FROM)
  : (await json('/status?q=getInfo')).info.blocks
const scan = Number(process.argv[2] ?? 4000)
const wanted = new Set(
  process.env.WANT
    ? process.env.WANT.split(',')
    : [
        'proRegTx',
        'proUpServTx',
        'proUpRegTx',
        'proUpRevTx',
        'cbTx',
        'qcTx',
        'mnhfTx',
        'assetLockTx',
        'assetUnlockTx',
      ],
)
const prior = process.env.MERGE
  ? JSON.parse(readFileSync(path.join(out, 'manifest.json'), 'utf8'))
  : null
const found = {}
let largest = null

const heights = Array.from({ length: scan }, (_, i) => tip - i)
let idx = 0
async function worker() {
  while (idx < heights.length) {
    const height = heights[idx++]
    if ([...wanted].every((t) => found[t]) && (prior || (largest && idx > 200))) return
    const { blockHash } = await json(`/block-index/${height}`)
    const hex = await rawBlock(blockHash)
    const blk = decodeBlock(Buffer.from(hex, 'hex'), 'mainnet')
    if (blk.hash !== blockHash) throw new Error(`hash mismatch at ${height}`)
    if (!largest || blk.size > largest.size)
      largest = { height, hash: blockHash, size: blk.size, hex }
    for (const tx of blk.txs) {
      if (wanted.has(tx.txTypeName) && !found[tx.txTypeName]) {
        found[tx.txTypeName] = { height, blockHash, txid: tx.txid }
        console.log(`found ${tx.txTypeName} at ${height} (${tx.txid})`)
      }
    }
    if (idx % 250 === 0)
      console.log(
        `scanned ${idx}/${scan}, missing: ${[...wanted].filter((t) => !found[t]).join(',') || 'none'}`,
      )
  }
}
await Promise.all(Array.from({ length: 4 }, worker))
if (prior) largest = largest ?? prior.block

const manifest = prior ?? {
  fetchedFrom: API,
  tip,
  scanned: idx,
  block: { height: largest.height, hash: largest.hash, size: largest.size },
  txs: {},
}
if (!prior) writeFileSync(path.join(out, `block-${largest.hash}.hex`), largest.hex)
else manifest.scanned += idx
for (const [type, info] of Object.entries(found)) {
  const raw = (await json(`/rawtx/${info.txid}`)).rawtx
  writeFileSync(path.join(out, `tx-${type}-${info.txid}.hex`), raw)
  manifest.txs[type] = info
}
manifest.missing = [
  'proRegTx',
  'proUpServTx',
  'proUpRegTx',
  'proUpRevTx',
  'cbTx',
  'qcTx',
  'mnhfTx',
  'assetLockTx',
  'assetUnlockTx',
].filter((t) => !manifest.txs[t])
writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
await refs(manifest)
console.log(JSON.stringify(manifest, null, 2))
