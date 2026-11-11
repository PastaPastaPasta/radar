import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { format, resolveConfig } from 'prettier'
import { slugOf } from '../apps/web/src/test/fixtures/slug.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURES = join(ROOT, 'apps/web/src/test/fixtures')
const HTTP_DIR = join(FIXTURES, 'http')

const USAGE = `Usage: node scripts/record-fixtures.mjs --net mainnet|testnet [options]

Records real responses from the live Radar, Platform Explorer and Hyphen APIs into
apps/web/src/test/fixtures/http/<source>/<net>/<slug>.json.

Options:
  --net <net>          mainnet or testnet (required)
  --source <list>      comma-separated: radar,pe,hyphen (default: all)
  --entities <file>    JSON file naming the entities to record. Anything not named is
                       discovered from the live list endpoints.
  --extra <path>       also record this app path, e.g. pe:/blocks?limit=5 (repeatable)
  --only-extra         record only the --extra paths, skip any that already have a file, and leave the rest of the
                       tree and the entities file alone (the way to add one missing recording)
  --stream-seconds <n> seconds of Hyphen /stream to capture (default 8)

Entity file keys (all optional): protx, evoProtx, bannedProtx, address, blockHash, txid, identity,
contract, token, peBlockHash, peTxHash, platformAddress, proposal, validator.
They may sit at the top level or under an "entities" key.`

function parseArgs(argv) {
  const out = { extra: [], source: ['radar', 'pe', 'hyphen'], streamSeconds: 8 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') {
      console.log(USAGE)
      process.exit(0)
    } else if (a === '--net') out.net = argv[++i]
    else if (a === '--source') out.source = argv[++i].split(',')
    else if (a === '--entities') out.entities = argv[++i]
    else if (a === '--extra') out.extra.push(argv[++i])
    else if (a === '--only-extra') out.onlyExtra = true
    else if (a === '--stream-seconds') out.streamSeconds = Number(argv[++i])
    else {
      console.error(`Unknown argument ${a}\n\n${USAGE}`)
      process.exit(2)
    }
  }
  if (out.net !== 'mainnet' && out.net !== 'testnet') {
    console.error(USAGE)
    process.exit(2)
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const net = args.net

const BASES = {
  radar: 'https://radar.dashhq.org/api/v1',
  pe: net === 'mainnet' ? 'https://api.pe.dashhq.org' : 'https://api.testnet.pe.dashhq.org',
  hyphen: net === 'mainnet' ? 'https://hy.kw.vg/api/v1' : 'https://ts.kw.vg/api/v1',
}
const RADAR_GLOBAL = new Set(['/status', '/health', '/releases'])
const KEEP_HEADERS = ['content-type', 'etag', 'last-modified', 'cache-control']

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const prettierOptions = (await resolveConfig(join(ROOT, 'package.json'))) ?? {}

function upstreamUrl(source, path) {
  if (source === 'radar') {
    const pathname = path.split('?')[0]
    return RADAR_GLOBAL.has(pathname) ? `${BASES.radar}${path}` : `${BASES.radar}/${net}${path}`
  }
  return `${BASES[source]}${path}`
}

function appUrl(source, path) {
  if (source === 'hyphen') return `/x/hy/${net}${path}`
  return upstreamUrl(source, path)
}

function fixtureLocation(source, path) {
  const [pathname, query = ''] = path.split('?')
  const sp = new URLSearchParams(query)
  const sorted = [...sp.entries()].sort(([ak, av], [bk, bv]) =>
    ak === bk ? (av < bv ? -1 : av > bv ? 1 : 0) : ak < bk ? -1 : 1,
  )
  const norm = sorted.map(([k, v]) => `${k}=${v}`).join('&')
  const net_ = source === 'radar' && RADAR_GLOBAL.has(pathname) ? 'global' : net
  return { dir: join(HTTP_DIR, source, net_), slug: slugOf(pathname, norm) }
}

async function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  const text = await format(JSON.stringify(value), { ...prettierOptions, parser: 'json' })
  writeFileSync(file, text)
}

const results = []

async function fetchWithRetry(url, init = {}) {
  let lastErr
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(90_000) })
      if (res.status === 429 || res.status >= 502) {
        await sleep(2000 * (attempt + 1))
        lastErr = new Error(`HTTP ${res.status}`)
        continue
      }
      return res
    } catch (e) {
      lastErr = e
      await sleep(1500 * (attempt + 1))
    }
  }
  throw lastErr
}

const TRIMS = {
  radar: [
    {
      path: '/masternodes',
      apply(body, keep) {
        const all = body.masternodes
        const picked = new Map()
        const take = (mn) => mn && picked.set(mn.protx, mn)
        for (const id of keep) take(all.find((m) => m.protx === id))
        for (const t of ['Evo', 'Regular'])
          for (const st of ['enabled', 'pose_banned'])
            all
              .filter((m) => m.type === t && m.status === st)
              .slice(0, 12)
              .forEach(take)
        all
          .filter((m) => m.platform_node_id === null && !m.reachable)
          .slice(0, 4)
          .forEach(take)
        for (const m of all) {
          if (picked.size >= 150) break
          take(m)
        }
        body.masternodes = [...picked.values()]
        return `masternodes: ${all.length} -> ${body.masternodes.length}`
      },
    },
  ],
  pe: [
    {
      path: '/search',
      apply(body) {
        const notes = []
        for (const [k, v] of Object.entries(body)) {
          if (Array.isArray(v) && v.length > 12) {
            notes.push(`${k}: ${v.length} -> 12`)
            body[k] = v.slice(0, 12)
          }
        }
        return notes.join(', ')
      },
    },
  ],
  hyphen: [],
}

async function record(source, path, { keep = [], optional = false, skipExisting = false } = {}) {
  if (skipExisting) {
    const { dir, slug } = fixtureLocation(source, path)
    if (existsSync(join(dir, `${slug}.json`))) {
      console.log(`  skip ${source} ${path}: already recorded`)
      return null
    }
  }
  const url = upstreamUrl(source, path)
  const started = Date.now()
  let res
  try {
    res = await fetchWithRetry(url)
  } catch (e) {
    results.push({ source, path, ok: false, note: String(e) })
    console.warn(`  FAIL ${source} ${path}: ${e}`)
    return null
  }
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  if (!res.ok && !optional && res.status !== 404) {
    results.push({ source, path, ok: false, note: `HTTP ${res.status}` })
    console.warn(`  FAIL ${source} ${path}: HTTP ${res.status}`)
    return null
  }
  const headers = {}
  for (const h of KEEP_HEADERS) {
    const v = res.headers.get(h)
    if (v) headers[h] = v
  }
  const fixture = {
    request: { method: 'GET', url: appUrl(source, path) },
    recordedAt: new Date().toISOString(),
    status: res.status,
    headers,
    body,
  }
  const trim = TRIMS[source]?.find((t) => t.path === path.split('?')[0])
  if (trim && res.ok && typeof body === 'object') {
    fixture.trimmed = trim.apply(body, keep)
  }
  const { dir, slug } = fixtureLocation(source, path)
  await writeJson(join(dir, `${slug}.json`), fixture)
  results.push({ source, path, ok: true, status: res.status, ms: Date.now() - started })
  console.log(`  ok   ${source} ${path} (${res.status})`)
  await sleep(120)
  return res.ok ? body : null
}

async function getJson(source, path) {
  const res = await fetchWithRetry(upstreamUrl(source, path))
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return res.json()
}

const entities = { net, discoveredAt: new Date().toISOString() }

function loadEntityFile() {
  const file = args.entities
  if (!file) return {}
  if (!existsSync(file)) throw new Error(`entity file not found: ${file}`)
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  return raw.entities ?? raw
}

const named = loadEntityFile()
const pick = (key, fallback) => {
  const v = named[key]
  const first = Array.isArray(v) ? v[0] : v
  const id =
    typeof first === 'object' && first !== null ? (first.hash ?? first.id ?? first.protx) : first
  return typeof id === 'string' || typeof id === 'number' ? id : fallback
}

async function recordRadar() {
  console.log(`radar (${net})`)
  for (const p of ['/status', '/health', '/releases']) await record('radar', p)
  const mns = await getJson('radar', '/masternodes')
  const evo = pick(
    'evoProtx',
    mns.masternodes.find((m) => m.type === 'Evo' && m.status === 'enabled')?.protx,
  )
  const regular = pick(
    'protx',
    mns.masternodes.find((m) => m.type === 'Regular' && m.status === 'enabled')?.protx,
  )
  const banned = pick('bannedProtx', mns.masternodes.find((m) => m.status === 'pose_banned')?.protx)
  entities.radar = {
    evoProtx: evo,
    protx: regular,
    bannedProtx: banned,
    missingProtx: '0'.repeat(64),
  }

  await record('radar', '/masternodes', { keep: [evo, regular, banned].filter(Boolean) })
  for (const p of [
    '/summary',
    '/geo',
    '/platform',
    '/activation',
    '/changes',
    '/bench',
    '/history?dim=totals&scope=all&days=30',
    '/history?dim=version&scope=all&days=30&top=8',
    '/history?dim=country&scope=mn&days=7&top=8',
  ]) {
    await record('radar', p)
  }
  for (const id of [evo, regular, banned].filter(Boolean)) {
    await record('radar', `/masternodes/${id}`)
    await record('radar', `/masternodes/${id}/payments?limit=10`)
    await record('radar', `/masternodes/${id}/bench`, { optional: true })
  }
  await record('radar', `/masternodes/${entities.radar.missingProtx}`, { optional: true })
}

const PE_TIMEFRAME = 'timeframe=24h'

async function recordPe() {
  console.log(`pe (${net})`)
  const first = (r) => r?.resultSet?.[0]
  const static_ = [
    '/status',
    '/epoch',
    '/blocks?limit=10&order=desc',
    '/transactions?limit=10&order=desc',
    '/identities?limit=10&order=desc&order_by=balance',
    '/validators?limit=10',
    '/quorums',
    '/quorums/current',
    '/dataContracts?limit=10',
    '/tokens?limit=10',
    '/contestedResources?limit=10',
    '/contestedResources/stats',
    '/masternodes/votes?limit=10',
    '/identities/active?limit=10',
    '/dataContracts/rating?limit=10',
    '/dataContracts/active?limit=10',
    '/tokens/rating?limit=10',
    `/transactions/history?${PE_TIMEFRAME}`,
    `/identities/history?${PE_TIMEFRAME}`,
    '/transactions/statistic',
    `/transactions/shielded/statistic?${PE_TIMEFRAME}`,
    `/transactions/shield/history?${PE_TIMEFRAME}`,
    `/transactions/unshield/history?${PE_TIMEFRAME}`,
    '/transactions/shielded/pool',
    '/search?query=dash',
    '/platformAddresses?limit=10',
  ]
  if (net === 'mainnet') static_.unshift('/rate')
  const bodies = {}
  for (const p of static_) bodies[p] = await record('pe', p, { optional: true })

  const block = first(bodies['/blocks?limit=10&order=desc'])
  const tx = first(bodies['/transactions?limit=10&order=desc'])
  const identity = first(bodies['/identities?limit=10&order=desc&order_by=balance'])
  const contract =
    (bodies['/dataContracts?limit=10']?.resultSet ?? []).find((c) => !c.isSystem) ??
    first(bodies['/dataContracts?limit=10'])
  const token = first(bodies['/tokens?limit=10'])
  const validator = first(bodies['/validators?limit=10'])
  const contested = first(bodies['/contestedResources?limit=10'])
  const pa = first(bodies['/platformAddresses?limit=10'])

  const e = {
    peBlockHash: pick('peBlockHash', block?.header?.hash),
    peTxHash: pick('peTxHash', tx?.hash),
    identity: pick('identity', identity?.identifier),
    contract: pick('contract', contract?.identifier),
    token: pick('token', token?.identifier),
    validator: pick('validator', validator?.proTxHash),
    contestedValue: contested?.resourceValue,
    platformAddress: pick('platformAddress', pa?.bech32mAddress),
    missingIdentity: '1'.repeat(43),
  }
  entities.pe = e

  const list = 'limit=10&order=desc'
  if (e.peBlockHash) await record('pe', `/block/${e.peBlockHash}`)
  if (e.peTxHash) await record('pe', `/transaction/${e.peTxHash}`)
  if (e.identity) {
    await record('pe', `/identity/${e.identity}`)
    for (const sub of ['transactions', 'dataContracts', 'documents', 'transfers', 'tokens'])
      await record('pe', `/identity/${e.identity}/${sub}?${list}`, { optional: true })
    await record('pe', `/identity/${e.identity}/withdrawals?order=desc`, { optional: true })
  }
  await record('pe', `/identity/${e.missingIdentity}`, { optional: true })
  if (e.contract) {
    await record('pe', `/dataContract/${e.contract}`)
    await record('pe', `/dataContract/${e.contract}/transactions?${list}`, { optional: true })
    const docs = await record('pe', `/dataContract/${e.contract}/documents?${list}`, {
      optional: true,
    })
    const doc = first(docs)
    if (doc?.identifier) {
      e.document = doc.identifier
      e.documentType = doc.documentTypeName ?? doc.typeName
      await record(
        'pe',
        `/document/${doc.identifier}?contract_id=${e.contract}&document_type_name=${e.documentType ?? ''}`,
        { optional: true },
      )
      await record('pe', `/document/${doc.identifier}/revisions?${list}`, { optional: true })
    }
  }
  if (e.token) {
    await record('pe', `/token/${e.token}`)
    await record('pe', `/token/${e.token}/transitions?${list}`, { optional: true })
    await record('pe', `/token/${e.token}/holders?${list}`, { optional: true })
  }
  if (e.validator) {
    await record('pe', `/validator/${e.validator}`)
    await record('pe', `/validator/${e.validator}/stats?${PE_TIMEFRAME}`, { optional: true })
    await record('pe', `/validator/${e.validator}/rewards/stats?${PE_TIMEFRAME}`, {
      optional: true,
    })
    await record('pe', `/validator/${e.validator}/earnings?timeframe=30d`, { optional: true })
  }
  if (e.contestedValue) {
    const value = encodeURIComponent(
      Buffer.from(JSON.stringify(e.contestedValue)).toString('base64'),
    )
    await record('pe', `/contestedResource/${value}`, { optional: true })
    await record('pe', `/contestedResource/${value}/votes?${list}`, { optional: true })
  }
  if (e.platformAddress) {
    await record('pe', `/platformAddress/${e.platformAddress}/info`, { optional: true })
    await record('pe', `/platformAddress/${e.platformAddress}/transitions?${list}`, {
      optional: true,
    })
  }
}

async function recordHyphen() {
  console.log(`hyphen (${net})`)
  const static_ = [
    '/status',
    '/blocks?limit=20',
    '/metrics/latest',
    '/metrics/chart?blocks=144&points=48',
    '/mempool',
    '/mempool/txs?limit=20',
    '/network',
    '/proposals?limit=20',
    '/validators?limit=25',
    '/balances?limit=25',
  ]
  const bodies = {}
  for (const p of static_) bodies[p] = await record('hyphen', p, { optional: true })

  const blocks = bodies['/blocks?limit=20']?.value ?? []
  const block = blocks[3] ?? blocks[0]
  const richest = bodies['/balances?limit=25']?.value?.[0]
  const validator = bodies['/validators?limit=25']?.value?.[0]
  const proposal = bodies['/proposals?limit=20']?.value?.[0]

  const e = {
    blockHash: pick('blockHash', block?.blockHash),
    blockHeight: block?.blockHeight,
    address: pick('address', richest?.address),
    validator: pick('validator', validator?.proTxHash),
    proposal: pick('proposal', proposal?.hash),
  }
  entities.hyphen = e

  if (e.blockHash) {
    await record('hyphen', `/block/${e.blockHash}`)
    const txs = await record('hyphen', `/block/${e.blockHash}/txs?limit=25`, { optional: true })
    await record('hyphen', `/rawblock/${e.blockHash}`, { optional: true })
    const rows = txs?.value ?? []
    const coinbase = rows.find((t) => t.txType === 'coinbase')
    const normal = [...rows]
      .filter((t) => t.txType === 'normal')
      .sort((a, b) => b.inputCount - a.inputCount)[0]
    const special = rows.find((t) => !['coinbase', 'normal'].includes(t.txType))
    e.coinbaseTx = coinbase?.txHash
    e.normalTx = pick('txid', normal?.txHash)
    e.specialTx = special?.txHash
    for (const id of [e.coinbaseTx, e.normalTx, e.specialTx].filter(Boolean)) {
      await record('hyphen', `/tx/${id}`)
    }
    if (e.normalTx) await record('hyphen', `/rawtx/${e.normalTx}`, { optional: true })
  }
  if (e.blockHeight) await record('hyphen', `/block/${e.blockHeight}`, { optional: true })
  if (e.address) {
    await record('hyphen', `/address/${e.address}`)
    await record('hyphen', `/address/${e.address}/txs?limit=25`, { optional: true })
    await record('hyphen', `/address/${e.address}/utxos?limit=25`, { optional: true })
  }
  if (e.validator) await record('hyphen', `/validator/${e.validator}`, { optional: true })
  if (e.proposal) {
    await record('hyphen', `/proposal/${e.proposal}`, { optional: true })
    await record('hyphen', `/proposal/${e.proposal}/votes?limit=25`, { optional: true })
  }
  if (e.proposal && bodies['/proposals?limit=20']) {
    const name = bodies['/proposals?limit=20'].value[0]?.name
    if (name) await record('hyphen', `/search?q=${encodeURIComponent(name)}`, { optional: true })
  }
  if (e.address) await record('hyphen', `/search?q=${e.address}`, { optional: true })
  await record('hyphen', `/block/${'0'.repeat(64)}`, { optional: true })
  await recordStream()
}

async function recordStream() {
  const url = upstreamUrl('hyphen', '/stream')
  const lines = []
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(args.streamSeconds * 1000) })
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (line) lines.push(line)
      }
      if (lines.length >= 40) {
        await reader.cancel()
        break
      }
    }
  } catch {
    // the capture window elapsed
  }
  if (lines.length === 0) {
    console.warn('  FAIL hyphen /stream: nothing captured')
    results.push({ source: 'hyphen', path: '/stream', ok: false, note: 'empty' })
    return
  }
  const dir = join(HTTP_DIR, 'hyphen', net)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'stream.ndjson'), lines.join('\n') + '\n')
  console.log(`  ok   hyphen /stream (${lines.length} events)`)
  results.push({ source: 'hyphen', path: '/stream', ok: true })
}

async function recordExtras() {
  for (const spec of args.extra) {
    const m = /^(radar|pe|hyphen):(\/.*)$/.exec(spec)
    if (!m) throw new Error(`--extra expects <source>:<path>, got ${spec}`)
    await record(m[1], m[2], { optional: true, skipExisting: args.onlyExtra })
  }
}

const runs = { radar: recordRadar, pe: recordPe, hyphen: recordHyphen }
for (const source of args.onlyExtra ? [] : args.source) {
  if (!runs[source]) throw new Error(`unknown source ${source}`)
  await runs[source]()
}
await recordExtras()

if (!args.onlyExtra) {
  const entitiesFile = join(FIXTURES, 'entities', `${net}.json`)
  let previous = {}
  if (existsSync(entitiesFile)) previous = JSON.parse(readFileSync(entitiesFile, 'utf8'))
  await writeJson(entitiesFile, { ...previous, ...entities })
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} recorded`)
if (failed.length) {
  for (const f of failed) console.log(`  failed: ${f.source} ${f.path} ${f.note ?? ''}`)
  process.exit(1)
}
void rmSync
