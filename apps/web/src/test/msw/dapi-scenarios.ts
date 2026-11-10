import { createDapiRpc, type DapiTransport } from '@/data/dapi-core'
import type { CoreClient, DecodedBlock, DecodedTx } from '@/data/core/types'
import type { createCoreDecoder } from '@/data/core/decode'
import { isSourceError } from '@/data/errors'
import type { NetworkId } from '@/lib/network'
import type { DapiManifestEntry } from '../fixtures/dapi-load'

/** What a recording is driven by: entities picked once per network, then the façade does the asking. */
export interface DapiPicks {
  /** UTC date for the date-jump entries, as YYYY-MM-DD. */
  dateJump: string
  txs: { id: string; txid: string; purpose: string; tags?: string[] }[]
  blocks: { id: string; height: number; purpose: string; tags?: string[] }[]
  /** Transaction types that do not exist on this network yet, or that no recent block carries. */
  gaps?: { id: string; reason: string }[]
}

export interface ScenarioLog {
  entry(e: DapiManifestEntry): void
  say(message: string): void
}

const q = (s: string) => JSON.stringify(s)

function txTags(tx: DecodedTx): string[] {
  const tags: string[] = [tx.type]
  if (tx.inputs.length > 1) tags.push('multi-input')
  if (tx.outputs.length > 1) tags.push('multi-output')
  if (tx.isInstantLocked) tags.push('instant-locked')
  if (tx.isChainLocked) tags.push('chain-locked')
  if (tx.height === undefined) tags.push('unconfirmed')
  return tags
}

function blockTags(b: DecodedBlock): string[] {
  const tags: string[] = []
  if (b.chainLocked) tags.push('chain-locked')
  if (b.txs[0]?.payload?.kind === 'cbTx') tags.push('cbtx')
  if (b.txs.some((t) => t.payload?.kind === 'qcTx')) tags.push('quorum-commitment')
  return tags
}

export async function runScenarios(
  core: CoreClient,
  net: NetworkId,
  picks: DapiPicks,
  transport: DapiTransport,
  log: ScenarioLog,
): Promise<void> {
  const tip = await core.tip(net)
  const top = tip.data
  log.entry({
    id: 'tip',
    purpose: 'Chain tip: height, hash and block time (getBlockchainStatus + the tip header)',
    call: `tip(${q(net)})`,
    height: top.height,
    hash: top.hash,
    tags: ['tip'],
  })

  const status = await core.status(net)
  log.entry({
    id: 'status',
    purpose: 'Chain status: blocks, headers, difficulty, chain work, sync state',
    call: `status(${q(net)})`,
    height: status.data.blocks,
    tags: ['status'],
  })

  const lock = await core.chainLock(net)
  log.entry({
    id: 'chain-lock',
    purpose: 'Best ChainLock: the height every block at or below it is final at',
    call: `chainLock(${q(net)})`,
    height: lock.data.height,
    hash: lock.data.hash,
    tags: ['chain-lock'],
  })

  const rows = await core.blockRows(net, { fromHeight: top.height, count: 20 })
  log.entry({
    id: 'latest-blocks',
    purpose: `The 20 newest blocks as list rows (${top.height} down to ${top.height - 19}), the home and blocks-list page`,
    call: `blockRows(${q(net)}, { fromHeight: ${top.height}, count: 20 })`,
    height: top.height,
    tags: ['block-rows', 'tip-page'],
  })
  void rows

  const newest = await core.block(net, { height: top.height })
  if (newest.data) {
    log.entry({
      id: 'block-tip',
      purpose: 'The tip block by height, with its coinbase (cbTx) and every transaction decoded',
      call: `block(${q(net)}, { height: ${top.height} })`,
      height: newest.data.height,
      hash: newest.data.hash,
      tags: ['block', 'by-height', ...blockTags(newest.data)],
    })
  }
  const older = await core.block(net, { height: top.height - 1 })
  if (older.data) {
    const byHash = await core.block(net, { hash: older.data.hash })
    log.entry({
      id: 'block-by-hash',
      purpose: 'A recent block looked up by hash (the block page URL form)',
      call: `block(${q(net)}, { hash: ${q(older.data.hash)} })`,
      height: byHash.data?.height,
      hash: older.data.hash,
      tags: ['block', 'by-hash', ...blockTags(older.data)],
    })
  }

  const headers = await core.headers(net, top.height - 99, 100)
  log.entry({
    id: 'headers-100',
    purpose: 'A range of 100 headers ending at the tip: heights, hashes, times (block-time charts)',
    call: `headers(${q(net)}, ${top.height - 99}, 100)`,
    height: headers.data.at(-1)?.height,
    tags: ['headers'],
  })

  for (const b of picks.blocks) {
    const found = await core.block(net, { height: b.height })
    if (!found.data) throw new Error(`Picked block ${b.height} (${b.id}) is not on ${net}`)
    const byHash = await core.block(net, { hash: found.data.hash })
    log.entry({
      id: b.id,
      purpose: b.purpose,
      call: `block(${q(net)}, { height: ${b.height} }) and { hash: ${q(found.data.hash)} }`,
      height: b.height,
      hash: found.data.hash,
      tags: ['block', ...blockTags(byHash.data ?? found.data), ...(b.tags ?? [])],
    })
  }

  const dayStart = Date.parse(`${picks.dateJump}T00:00:00Z`)
  const dayEnd = dayStart + 86_400_000
  const first = await core.heightAtTime(net, dayStart)
  const next = await core.heightAtTime(net, dayEnd)
  log.entry({
    id: 'date-jump-start',
    purpose: `First block of ${picks.dateJump} (UTC), found by searching header ranges`,
    call: `heightAtTime(${q(net)}, Date.parse(${q(`${picks.dateJump}T00:00:00Z`)}))`,
    height: first.data,
    tags: ['date-jump'],
  })
  log.entry({
    id: 'date-jump-end',
    purpose: `First block after ${picks.dateJump} (UTC); the day's last block is one below it`,
    call: `heightAtTime(${q(net)}, Date.parse(${q(`${picks.dateJump}T00:00:00Z`)}) + 86_400_000)`,
    height: next.data,
    tags: ['date-jump'],
  })
  await core.blockRows(net, { fromHeight: next.data - 1, count: 10 })
  log.entry({
    id: 'date-page-end',
    purpose: `The last 10 blocks of ${picks.dateJump} as list rows, newest first (blocks-by-date page)`,
    call: `blockRows(${q(net)}, { fromHeight: ${next.data - 1}, count: 10 })`,
    height: next.data - 1,
    tags: ['block-rows', 'date-jump'],
  })

  for (const t of picks.txs) {
    const found = await core.tx(net, t.txid)
    if (!found.data) throw new Error(`Picked tx ${t.txid} (${t.id}) is not on ${net}`)
    await core.prevouts(net, found.data)
    log.entry({
      id: t.id,
      purpose: t.purpose,
      call: `tx(${q(net)}, ${q(t.txid)}) then prevouts(${q(net)}, tx)`,
      txid: t.txid,
      height: found.data.height,
      tags: [...new Set([...txTags(found.data), ...(t.tags ?? [])])],
    })
  }

  const missing = '0'.repeat(63) + '1'
  const none = await core.tx(net, missing)
  log.entry({
    id: 'tx-not-found',
    purpose: 'A transaction id no node knows: resolves to null (DAPI NOT_FOUND)',
    call: `tx(${q(net)}, ${q(missing)})`,
    txid: missing,
    tags: ['not-found', ...(none.data === null ? [] : ['unexpected'])],
  })
  const beyond = await core.block(net, { height: top.height + 100_000 })
  log.entry({
    id: 'block-beyond-tip',
    purpose: 'A height far above the tip: resolves to null (DAPI INVALID_ARGUMENT)',
    call: `block(${q(net)}, { height: ${top.height + 100_000} })`,
    height: top.height + 100_000,
    tags: ['not-found', ...(beyond.data === null ? [] : ['unexpected'])],
  })

  await recordStreams(net, top.height, transport, log)
}

async function recordStreams(
  net: NetworkId,
  tipHeight: number,
  transport: DapiTransport,
  log: ScenarioLog,
): Promise<void> {
  const rpc = createDapiRpc(transport)

  const follow = rpc.headerStream(net, { fromHeight: tipHeight, count: 0 })
  let seen = 0
  for await (const event of follow.events) {
    seen++
    if (event.kind === 'headers' && seen >= 2) break
    if (seen >= 3) break
  }
  log.entry({
    id: 'live-tip-stream',
    purpose:
      'Follow the chain from the tip: the best ChainLock, then headers as blocks arrive (coreLive.tip). The transcript stays open until aborted',
    call: `subscribeToBlockHeadersWithChainLocks(fromBlockHeight: ${tipHeight}, count: 0)`,
    height: tipHeight,
    tags: ['stream', 'chain-lock', 'tip'],
  })

  const txStream = rpc.transactionStream(net, { fromHeight: tipHeight })
  let locks = 0
  let txs = 0
  try {
    for await (const event of txStream.events) {
      if (event.kind === 'instantSendLocks') locks += event.messages.length
      if (event.kind === 'transactions') txs += event.transactions.length
      if (locks > 0 && txs > 0) break
    }
  } catch (e) {
    if (!isSourceError(e)) throw e
    log.say(`transaction stream ended early: ${e.message}`)
  }
  log.entry({
    id: 'live-tx-stream',
    purpose: `Every transaction and InstantSend lock from the tip on (match-all bloom filter): ${txs} transactions and ${locks} IS locks in the transcript. The live feed card; the IS lock bytes are the evidence for a lock`,
    call: `subscribeToTransactionsWithProofs(matchAll, fromBlockHeight: ${tipHeight}, count: 0)`,
    height: tipHeight,
    tags: ['stream', 'instant-send', 'mempool'],
  })
}

export interface Found {
  type: string
  txid: string
  height: number
}

/** Scans blocks from `fromHeight` down to `toHeight` and returns the first transaction of each special type it meets. */
export async function discoverTxTypes(
  transport: DapiTransport,
  decoder: ReturnType<typeof createCoreDecoder>,
  net: NetworkId,
  fromHeight: number,
  toHeight: number,
  log: (message: string) => void,
): Promise<Map<string, Found>> {
  const rpc = createDapiRpc(transport)
  const found = new Map<string, Found>()
  const heights: number[] = []
  for (let h = fromHeight; h >= toHeight; h--) heights.push(h)
  let next = 0
  const lanes = Array.from({ length: 12 }, async () => {
    while (next < heights.length) {
      const height = heights[next++]!
      try {
        const { message } = await rpc.block(net, { height })
        const block = await decoder.block(message.block, net)
        for (const tx of block.txs) {
          const kind = (tx.payload as { kind?: string } | undefined)?.kind ?? 'classic'
          const known = found.get(kind)
          if (!known || known.height < height) {
            if (!known) log(`  found ${kind} ${tx.txid} at ${height}`)
            found.set(kind, { type: kind, txid: tx.txid, height })
          }
        }
      } catch (e) {
        log(`  block ${height}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  })
  await Promise.all(lanes)
  return found
}
