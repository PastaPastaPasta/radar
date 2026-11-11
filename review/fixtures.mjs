#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { FIXTURES_DIR, loadFixtures } from './lib/stories.mjs'
import { getJson } from './lib/http.mjs'

const NETWORKS = {
  mainnet: {
    hy: 'https://hy.kw.vg/api/v1',
    pe: 'https://api.pe.dashhq.org',
    radar: 'https://radar.dashhq.org/api/v1/mainnet',
  },
  testnet: {
    hy: 'https://ts.kw.vg/api/v1',
    pe: 'https://api.testnet.pe.dashhq.org',
    radar: 'https://radar.dashhq.org/api/v1/testnet',
  },
}

const VECTORS = fileURLToPath(
  new URL('../apps/web/src/features/tools/verify-message/dashcore-vectors.json', import.meta.url),
)

/** A signature made by Dash Core, so IN-08 can check "valid" and, with the altered message, "invalid". */
export function signedMessageEntity(network) {
  const vector = JSON.parse(readFileSync(VECTORS, 'utf8')).find((v) => v.mainnet && v.testnet)
  const address = vector[network]
  return {
    id: address,
    address,
    message: vector.msg,
    signature: vector.signature,
    altered_message: `${vector.msg}!`,
  }
}

const MAX_TX_PAGES = 60
const BLOCKS_PER_DAY = 576
const PE_TX_TYPES = {
  ptx_identity_create: 'IDENTITY_CREATE',
  ptx_identity_topup: 'IDENTITY_TOP_UP',
  ptx_identity_update: 'IDENTITY_UPDATE',
  ptx_identity_withdrawal: 'IDENTITY_CREDIT_WITHDRAWAL',
  ptx_contract_create: 'DATA_CONTRACT_CREATE',
  ptx_batch: 'BATCH',
  ptx_vote: 'MASTERNODE_VOTE',
}

const attempt = async (log, label, fn) => {
  try {
    return (await fn()) ?? null
  } catch (e) {
    log.push(`${label}: ${e.message}`)
    return null
  }
}

async function pickCore(src, entities, log) {
  const tip = (await getJson(`${src.hy}/blocks?limit=1`))?.value?.[0]
  if (!tip) throw new Error('Hyphen returned no tip block')
  entities.tip = { id: tip.blockHash, height: tip.blockHeight, time: tip.blockTime }
  const recent = (await getJson(`${src.hy}/blocks?limit=1`))?.value?.[0]
  entities.block_recent = {
    id: recent.blockHash,
    height: recent.blockHeight,
    txCount: recent.txCount,
  }

  const old = await attempt(log, 'block_old', () =>
    getJson(`${src.hy}/block/${Math.max(1, tip.blockHeight - 365 * BLOCKS_PER_DAY)}`),
  )
  if (old) entities.block_old = { id: old.blockHash, height: old.blockHeight, time: old.blockTime }

  const day = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10)
  entities.date_with_blocks = { id: day }

  const want = {
    tx_normal: (t) => t.txType === 'normal' && t.inputCount >= 6,
    tx_coinbase: (t) => t.txType === 'coinbase',
    tx_proreg: (t) => t.txType === 'provider_register',
    tx_proupserv: (t) => t.txType === 'provider_update_service',
    tx_assetlock: (t) => t.txType === 'asset_lock',
    tx_assetunlock: (t) => t.txType === 'asset_unlock',
  }
  const found = {}
  let cursor
  for (
    let page = 0;
    page < MAX_TX_PAGES && Object.keys(found).length < Object.keys(want).length;
    page++
  ) {
    const res = await getJson(`${src.hy}/txs?limit=100${cursor ? `&cursor=${cursor}` : ''}`)
    for (const t of res?.value ?? []) {
      for (const [k, test] of Object.entries(want)) if (!found[k] && test(t)) found[k] = t
    }
    cursor = res?.nextCursor
    if (!cursor) break
  }
  for (const [k, t] of Object.entries(found)) {
    entities[k] = { id: t.txHash, height: t.blockHeight, inputCount: t.inputCount, type: t.txType }
  }
  return found
}

async function fillCoreDerived(src, entities, found, mnRegisteredHeight, log) {
  if (!entities.tx_proreg && mnRegisteredHeight) {
    const txs = await attempt(log, 'tx_proreg via block', () =>
      getJson(`${src.hy}/block/${mnRegisteredHeight}/txs?limit=100`),
    )
    const t = txs?.value?.find((x) => x.txType === 'provider_register')
    if (t) entities.tx_proreg = { id: t.txHash, height: t.blockHeight, type: t.txType }
  }
  const special =
    entities.tx_proreg ?? entities.tx_proupserv ?? entities.tx_assetlock ?? entities.tx_assetunlock
  if (special) entities.block_special = { id: null, height: special.height, tx: special.id }
  if (special) {
    const b = await attempt(log, 'block_special', () =>
      getJson(`${src.hy}/block/${special.height}`),
    )
    if (b) entities.block_special.id = b.blockHash
  }

  const normal = found.tx_normal ?? Object.values(found)[0]
  if (normal) {
    const detail = await attempt(log, 'tx detail', () => getJson(`${src.hy}/tx/${normal.txHash}`))
    const vin = detail?.vin?.find((v) => v.address && v.txHash)
    if (vin) {
      entities.address_history = { id: vin.address }
      entities.spent_output = { id: vin.txHash, vout: vin.vout, spent_by: normal.txHash }
    }
  }
  const rich = await attempt(log, 'address_rich', () => getJson(`${src.hy}/balances?limit=1`))
  if (rich?.value?.[0])
    entities.address_rich = { id: rich.value[0].address, balance: rich.value[0].balance }

  const prop = await attempt(log, 'proposal', () => getJson(`${src.hy}/proposals?limit=1`))
  if (prop?.value?.[0]) entities.proposal = { id: prop.value[0].hash, name: prop.value[0].name }
}

async function pickMasternodes(src, entities, log) {
  const list =
    (await attempt(log, 'masternodes', () => getJson(`${src.radar}/masternodes`)))?.masternodes ??
    []
  const enabled = list.filter((m) => m.status === 'enabled' && m.reachable)
  const regular = enabled
    .filter((m) => m.type === 'Regular')
    .sort((a, b) => b.uptime_30d - a.uptime_30d || a.registered_height - b.registered_height)
  const evo = enabled
    .filter((m) => m.type !== 'Regular')
    .sort((a, b) => b.uptime_30d - a.uptime_30d)
  const banned = list.filter(
    (m) => (m.status !== 'enabled' && /ban/i.test(`${m.status}`)) || m.pose_ban_height >= 0,
  )
  const brief = (m) => ({
    id: m.protx,
    ip: m.service?.split(':')[0],
    service: m.service,
    status: m.status,
    type: m.type,
  })
  if (regular[0]) entities.mn_regular = brief(regular[Math.min(5, regular.length - 1)])
  if (evo[0]) entities.mn_evo = brief(evo[Math.min(5, evo.length - 1)])
  if (banned[0]) entities.mn_banned = brief(banned[0])
  const newest = [...list].sort((a, b) => b.registered_height - a.registered_height)[0]
  return newest?.registered_height ?? null
}

const normaliseKeys = (o) => (o && typeof o === 'object' ? o : {})

async function pickPlatform(src, entities, log) {
  const status = await attempt(log, 'pe status', () => getJson(`${src.pe}/status`))
  const epoch = status?.epoch?.number
  if (Number.isInteger(epoch)) {
    entities.epoch_current = { id: String(epoch) }
    entities.epoch_final = { id: String(Math.max(0, epoch - 2)) }
  }

  const block = (await attempt(log, 'pblock', () => getJson(`${src.pe}/blocks?limit=1&order=desc`)))
    ?.resultSet?.[0]
  if (block) entities.pblock = { id: block.header.hash, height: block.header.height }

  for (const [key, type] of Object.entries(PE_TX_TYPES)) {
    const t = (
      await attempt(log, key, () =>
        getJson(`${src.pe}/transactions?limit=1&order=desc&type=${type}`),
      )
    )?.resultSet?.[0]
    if (t) entities[key] = { id: t.hash, type: t.type, height: t.blockHeight }
  }
  const anyTx = entities.ptx_batch ?? entities.ptx_identity_update ?? entities.ptx_identity_create
  if (anyTx) entities.ptx = { ...anyTx }

  const ids =
    (
      await attempt(log, 'identities', () =>
        getJson(`${src.pe}/identities?limit=40&order=desc&order_by=balance`),
      )
    )?.resultSet ?? []
  const withName = ids.find((i) => i.aliases?.length && !i.isSystem) ?? ids[0]
  if (withName) {
    entities.identity = {
      id: withName.identifier,
      names: (withName.aliases ?? []).map((a) => a.alias),
    }
    const detail = await attempt(log, 'identity detail', () =>
      getJson(`${src.pe}/identity/${withName.identifier}`),
    )
    const hash = JSON.stringify(normaliseKeys(detail)).match(
      /"(?:keyHash|pubKeyHash|publicKeyHash|hash160)":"([0-9a-fA-F]{40})"/,
    )
    if (hash) entities.pkh = { id: hash[1].toLowerCase() }
    const alias = withName.aliases?.[0]?.alias
    if (alias) entities.name_registered = { id: alias.replace(/\.dash$/, '') }
  }

  const contracts =
    (await attempt(log, 'contracts', () => getJson(`${src.pe}/dataContracts?limit=100`)))
      ?.resultSet ?? []
  const withTokens = contracts.filter((c) => c.tokensCount > 0)
  const best =
    withTokens.find((c) => c.groups) ??
    withTokens[0] ??
    contracts.find((c) => !c.isSystem) ??
    contracts[0]
  if (best) entities.contract = { id: best.identifier, name: best.name, tokens: best.tokensCount }

  const tokens =
    (await attempt(log, 'tokens', () => getJson(`${src.pe}/tokens?limit=5`)))?.resultSet ?? []
  const inContract =
    tokens.find((t) => best && t.dataContractIdentifier === best.identifier) ?? tokens[0]
  if (inContract) {
    entities.token = {
      id: inContract.identifier,
      contract: inContract.dataContractIdentifier,
      position: inContract.position,
    }
    if (!entities.contract && inContract.dataContractIdentifier)
      entities.contract = { id: inContract.dataContractIdentifier }
  }

  for (const c of contracts.filter((x) => !x.isSystem && x.documentsCount > 0).slice(0, 60)) {
    if (entities.doc_history) break
    const detail = await attempt(log, `contract ${c.identifier}`, () =>
      getJson(`${src.pe}/dataContract/${c.identifier}`),
    )
    let schema = detail?.schema
    if (typeof schema === 'string') {
      try {
        schema = JSON.parse(schema)
      } catch {
        schema = null
      }
    }
    const types =
      schema && typeof schema === 'object'
        ? Object.entries(schema)
            .filter(([, v]) => v?.documentsKeepHistory === true)
            .map(([k]) => k)
        : []
    for (const type of types) {
      const docs = await attempt(log, `doc ${type}`, () =>
        getJson(
          `${src.pe}/dataContract/${c.identifier}/documents?limit=1&document_type_name=${encodeURIComponent(type)}`,
        ),
      )
      const d = docs?.resultSet?.[0]
      if (d) {
        entities.doc_history = { id: d.identifier, contract: c.identifier, type }
        break
      }
    }
  }

  if (entities.doc_history) entities.doc = { ...entities.doc_history }
  else {
    const dpns = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
    const docs = await attempt(log, 'doc dpns', () =>
      getJson(`${src.pe}/dataContract/${dpns}/documents?limit=1&document_type_name=domain`),
    )
    const d = docs?.resultSet?.[0]
    if (d) entities.doc = { id: d.identifier, contract: dpns, type: 'domain' }
  }

  const contests =
    (
      await attempt(log, 'contests', () =>
        getJson(`${src.pe}/contestedResources?limit=5&order=desc`),
      )
    )?.resultSet ?? []
  const contest = contests.find((c) => Array.isArray(c.resourceValue)) ?? null
  if (contest) {
    const label = contest.resourceValue[contest.resourceValue.length - 1]
    entities.contest = {
      id: label,
      contract: contest.dataContractIdentifier,
      type: contest.documentTypeName,
    }
    entities.name_contested = { id: label }
  }

  for (let i = 0; i < 5 && !entities.name_available; i++) {
    const label = `radarfx${Math.floor(Math.random() * 1e8)}`
    const hit = await attempt(log, 'name_available', () =>
      getJson(`${src.pe}/search?query=${label}`),
    )
    if (!hit || !hit.identities?.length) entities.name_available = { id: label }
  }
}

/**
 * The special transactions are chosen by hand from live chain data, so a regeneration carries the
 * committed ones over rather than dropping them.
 */
export function committedSpecialTxs(network) {
  return loadFixtures(network)?.entities?.special_txs
}

/** An address that receives a transaction every few minutes, so IN-06's arrival notice can be seen; chosen by hand, carried over. */
export function committedBusyAddress(network) {
  return loadFixtures(network)?.entities?.busy_address
}

export async function pickFixtures(
  network,
  specialTxs = committedSpecialTxs(network),
  busyAddress = committedBusyAddress(network),
) {
  const src = NETWORKS[network]
  const entities = {}
  const log = []
  const found = await pickCore(src, entities, log)
  const registeredHeight = await pickMasternodes(src, entities, log)
  await fillCoreDerived(src, entities, found, registeredHeight, log)
  await pickPlatform(src, entities, log)
  entities.signed_message = signedMessageEntity(network)
  if (specialTxs) entities.special_txs = specialTxs
  if (busyAddress) entities.busy_address = busyAddress
  const expected = [
    'tip',
    'block_recent',
    'block_old',
    'block_special',
    'date_with_blocks',
    'tx_normal',
    'tx_coinbase',
    'tx_proreg',
    'tx_proupserv',
    'tx_assetlock',
    'tx_assetunlock',
    'spent_output',
    'address_history',
    'address_rich',
    'proposal',
    'mn_regular',
    'mn_evo',
    'mn_banned',
    'identity',
    'pkh',
    'contract',
    'doc',
    'doc_history',
    'token',
    'name_registered',
    'name_available',
    'name_contested',
    'contest',
    'pblock',
    'ptx',
    'paddr',
    'epoch_current',
    'epoch_final',
    'special_txs',
    ...(network === 'mainnet' ? ['busy_address'] : []),
    ...Object.keys(PE_TX_TYPES),
  ]
  return {
    network,
    generatedAt: new Date().toISOString(),
    entities,
    missing: expected.filter((k) => !entities[k]),
    notes: log,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    options: {
      network: { type: 'string', multiple: true },
      out: { type: 'string', default: FIXTURES_DIR },
    },
  })
  const networks = values.network?.length ? values.network : Object.keys(NETWORKS)
  mkdirSync(values.out, { recursive: true })
  for (const n of networks) {
    if (!NETWORKS[n]) throw new Error(`unknown network ${n}`)
    const fx = await pickFixtures(n)
    writeFileSync(path.join(values.out, `${n}.json`), JSON.stringify(fx, null, 2) + '\n')
    console.log(
      `${n}: ${Object.keys(fx.entities).length} entities, missing: ${fx.missing.join(', ') || 'none'}`,
    )
    for (const line of fx.notes) console.log(`  note: ${line}`)
  }
}
