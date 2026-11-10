// One-off: saves a few large mainnet blocks (Insight) for benchmarking under tests/fixtures/large/.
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const out = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'tests',
  'fixtures',
  'large',
)
mkdirSync(out, { recursive: true })
const API = process.env.INSIGHT ?? 'https://insight.dash.org/insight-api'
// height 1635888: 912 KB / 128 tx; 1010831: 600 KB / 313 tx; 2079458: 566 KB / 307 tx
const blocks = {
  1635888: '000000000000000b8ed50258b94bf43288447a45c981d0bc180832efbc7d3227',
  1010831: '0000000000000004a2b438c52c35d12bf20c6a2abe5d1a9e36e382d35ea3ac89',
  2079458: '0000000000000011ab35d15e1a17ceee23d4a4ab83f379e5aedf2b7de71369a8',
}
for (const [height, hash] of Object.entries(blocks)) {
  const r = await fetch(`${API}/rawblock/${hash}`, {
    headers: { 'user-agent': 'radar-core-decode-fixtures/0.1' },
  })
  if (!r.ok) throw new Error(`${hash}: ${r.status}`)
  writeFileSync(path.join(out, `block-${height}-${hash}.hex`), (await r.json()).rawblock)
  console.log('saved', height, hash)
}
