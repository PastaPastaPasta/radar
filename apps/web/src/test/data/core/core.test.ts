import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { FixtureDapiTransport } from '@/test/msw/dapi-transport'
import { takeFixtureMisses } from '@/test/msw/handlers/fixtures'
import { loadDapiManifest, type DapiManifest } from '@/test/fixtures/dapi-load'
import { createDapiRpc } from '@/data/dapi-core'
import { isSourceError } from '@/data/errors'
import type { HealthState } from '@/data/health'
import { hyphen } from '@/data/hyphen/client'
import { createCoreClient, firstWindow } from '@/data/core/client'
import { poolOfCoinbase } from '@/lib/core/pools'
import { createCoreDecoder } from '@/data/core/decode'
import type { CoreClient, DecodedTx } from '@/data/core/types'

const wasmPath = resolve(process.cwd(), '../../packages/core-decode/dist/core_decode_bg.wasm')

const decoder = createCoreDecoder(async () => {
  const wasm = await import('@radar/core-decode')
  wasm.initSync({ module: readFileSync(wasmPath) })
  return wasm
})

function setup(opts: { now?: () => number; health?: Record<string, HealthState> } = {}) {
  const transport = new FixtureDapiTransport()
  const core = createCoreClient({
    transport: () => transport,
    decoder,
    hyphen,
    health: { get: (_net, source) => ({ state: opts.health?.[source] ?? 'ok' }) as never },
    now: opts.now ?? Date.now,
  })
  return { core, transport }
}

const SPECIAL: Record<string, { type: DecodedTx['type']; kind?: string }> = {
  'tx-coinbase': { type: 'coinbase', kind: 'cbTx' },
  'tx-cbtx': { type: 'coinbase', kind: 'cbTx' },
  'tx-coinbase-classic': { type: 'coinbase' },
  'tx-qctx': { type: 'quorum-commitment', kind: 'qcTx' },
  'tx-proreg': { type: 'pro-reg', kind: 'proRegTx' },
  'tx-proupserv': { type: 'pro-up-serv', kind: 'proUpServTx' },
  'tx-proupreg': { type: 'pro-up-reg', kind: 'proUpRegTx' },
  'tx-uprevtx': { type: 'pro-up-rev', kind: 'proUpRevTx' },
  'tx-assetlock': { type: 'asset-lock', kind: 'assetLockTx' },
  'tx-assetunlock': { type: 'asset-unlock', kind: 'assetUnlockTx' },
  'tx-mnhf': { type: 'mnhf-signal', kind: 'mnhfTx' },
  'tx-prodissolve': { type: 'transfer', kind: 'proDissolveTx' },
}

describe.each(['mainnet', 'testnet'] as const)('Core façade on %s fixtures', (net) => {
  let manifest: DapiManifest
  let core: CoreClient
  let transport: FixtureDapiTransport
  beforeAll(async () => {
    manifest = await loadDapiManifest(net)
    ;({ core, transport } = setup())
  })
  const entry = (id: string) => manifest.entries.find((e) => e.id === id)

  it('stamps every answer as an unproved DAPI answer received now', async () => {
    const tip = await core.tip(net)
    expect(tip).toMatchObject({ source: 'dapi', proved: false })
    expect(tip.asOf).toBe(tip.fetchedAt)
    expect(tip.node).toBeTruthy()
    expect(tip.proof).toBeUndefined()
  })

  it('reads the tip from the status and the tip header', async () => {
    const tip = await core.tip(net)
    expect(tip.data.height).toBe(manifest.tip.height)
    expect(tip.data.hash).toBe(manifest.tip.hash)
    expect(tip.data.time).toBeGreaterThan(1_700_000_000_000)
    expect(tip.height).toBe(manifest.tip.height)
  })

  it('reports the chain status', async () => {
    const status = await core.status(net)
    expect(status.data.blocks).toBe(manifest.tip.height)
    expect(status.data.bestBlockHash).toBe(manifest.tip.hash)
    expect(status.data.chainWork).toMatch(/^[0-9a-f]{64}$/)
  })

  it('reads the best ChainLock', async () => {
    const lock = await core.chainLock(net)
    expect(lock.data.height).toBeLessThanOrEqual(manifest.tip.height)
    expect(lock.data.height).toBeGreaterThan(manifest.tip.height - 20)
    expect(lock.data.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('decodes the tip block with its cbTx, flags it ChainLocked once locked', async () => {
    const found = await core.block(net, { height: manifest.tip.height })
    const block = found.data!
    expect(block.height).toBe(manifest.tip.height)
    expect(block.txs[0]!.type).toBe('coinbase')
    expect(block.txs[0]!.payload?.kind).toBe('cbTx')
    expect(block.txs.every((t) => t.height === block.height && t.blockHash === block.hash)).toBe(
      true,
    )
    expect(block.bits).toMatch(/^[0-9a-f]{8}$/)
    expect(found.immutable).toBeUndefined()
  })

  it('finds a block by hash', async () => {
    const e = entry('block-by-hash')!
    const found = await core.block(net, { hash: e.hash! })
    expect(found.data!.hash).toBe(e.hash)
    expect(found.data!.height).toBe(e.height)
    expect(found.data!.chainLocked).toBe(true)
    expect(found.immutable).toBeUndefined()
  })

  it('carries bigint amounts and the cbTx credit pool', async () => {
    const block = (await core.block(net, { height: manifest.tip.height })).data!
    const cb = block.txs[0]!
    expect(typeof cb.outputs[0]!.value).toBe('bigint')
    expect(typeof (cb.payload as { creditPoolBalance: unknown }).creditPoolBalance).toBe('bigint')
  })

  it('lists newest blocks first, one row per block', async () => {
    const rows = await core.blockRows(net, { fromHeight: manifest.tip.height, count: 20 })
    expect(rows.source).toBe('dapi')
    expect(rows.fallback).toBeUndefined()
    expect(rows.data.map((r) => r.height)).toEqual(
      Array.from({ length: 20 }, (_, i) => manifest.tip.height - i),
    )
    expect(rows.data[0]!.hash).toBe(manifest.tip.hash)
    expect(rows.data.every((r) => r.txCount >= 1 && r.size > 0)).toBe(true)
  })

  it('names the pool in a row from the coinbase tag, when it has one', async () => {
    const rows = await core.blockRows(net, { fromHeight: manifest.tip.height, count: 20 })
    for (const row of rows.data) {
      const block = (await core.block(net, { height: row.height })).data!
      expect(row.pool).toBe(poolOfCoinbase(block.txs[0]!.inputs[0]!.coinbase))
    }
  })

  it('reads a header range with hashes linked by prevHash', async () => {
    const count = 100
    const headers = await core.headers(net, manifest.tip.height - count + 1, count)
    expect(headers.data).toHaveLength(count)
    expect(headers.data.at(-1)!.hash).toBe(manifest.tip.hash)
    expect(headers.data[0]!.height).toBe(manifest.tip.height - count + 1)
    expect(new Set(headers.data.map((h) => h.hash)).size).toBe(count)
  })

  it('finds the first block of a day', async () => {
    const start = Date.parse(`${entry('date-jump-start') && (await dayOf(net))}T00:00:00Z`)
    const first = await core.heightAtTime(net, start)
    expect(first.data).toBe(entry('date-jump-start')!.height)
    const next = await core.heightAtTime(net, start + 86_400_000)
    expect(next.data).toBe(entry('date-jump-end')!.height)
    expect(next.data - first.data).toBeGreaterThan(300)
    expect(next.data - first.data).toBeLessThan(900)
  })

  it('reads a day boundary in headers sized to how far it is from the tip @IN-02', async () => {
    const start = Date.parse(`${await dayOf(net)}T00:00:00Z`)
    const before = transport.calls.length
    await core.heightAtTime(net, start + 86_400_000)
    const reads = transport.calls
      .slice(before)
      .filter((c) => c.method.startsWith('subscribeToBlockHeaders'))
    expect(reads.length).toBeLessThanOrEqual(2)
    expect(firstWindow(100)).toBe(96)
    expect(firstWindow(576)).toBeLessThan(150)
    expect(firstWindow(100_000)).toBe(500)
  })

  it('answers a missing transaction and a block above the tip with a stamped null', async () => {
    const none = await core.tx(net, entry('tx-not-found')!.txid!)
    expect(none.data).toBeNull()
    expect(none.source).toBe('dapi')
    const beyond = await core.block(net, { height: entry('block-beyond-tip')!.height! })
    expect(beyond.data).toBeNull()
  })

  it('answers a malformed id with null without asking a node', async () => {
    const before = transport.calls.length
    expect((await core.tx(net, 'nope')).data).toBeNull()
    expect((await core.block(net, { hash: 'xyz' })).data).toBeNull()
    expect(transport.calls.length).toBe(before)
  })

  it('serves one transaction of each special type with its payload', async () => {
    const seen: string[] = []
    for (const e of manifest.entries.filter((x) => x.id in SPECIAL)) {
      const want = SPECIAL[e.id]!
      const tx = (await core.tx(net, e.txid!)).data!
      expect(tx.type, e.id).toBe(want.type)
      expect(tx.payload?.kind, e.id).toBe(want.kind)
      expect(tx.height, e.id).toBeGreaterThan(0)
      expect(tx.time, e.id).toBeGreaterThan(0)
      seen.push(e.id)
    }
    const gaps = manifest.gaps.map((g) => g.id)
    const optional = new Set(['tx-coinbase-classic', 'tx-prodissolve'])
    for (const id of Object.keys(SPECIAL).filter((k) => !optional.has(k))) {
      expect(seen.includes(id) || gaps.includes(id), id).toBe(true)
    }
  })

  it('turns payload duffs into bigint', async () => {
    const lock = entry('tx-assetlock')
    const unlock = entry('tx-assetunlock')
    const cb = entry('tx-cbtx')
    const lockPayload = (await core.tx(net, lock!.txid!)).data!.payload as {
      totalCredit: unknown
      creditOutputs: { value: unknown }[]
    }
    expect(typeof lockPayload.totalCredit).toBe('bigint')
    expect(typeof lockPayload.creditOutputs[0]!.value).toBe('bigint')
    const unlockPayload = (await core.tx(net, unlock!.txid!)).data!.payload as { fee: unknown }
    expect(typeof unlockPayload.fee).toBe('bigint')
    const cbPayload = (await core.tx(net, cb!.txid!)).data!.payload as {
      creditPoolBalance: unknown
    }
    expect(typeof cbPayload.creditPoolBalance).toBe('bigint')
  })

  it('resolves prevouts for every input of the normal transaction', async () => {
    const e = manifest.entries.find(
      (x) => x.tags.includes('multi-input') && x.tags.includes('transfer'),
    )!
    const tx = (await core.tx(net, e.txid!)).data!
    expect(tx.inputs.length).toBeGreaterThan(1)
    const prev = await core.prevouts(net, tx)
    expect(prev.data.size).toBe(tx.inputs.length)
    for (const input of tx.inputs) {
      const p = prev.data.get(`${input.txid}:${input.vout}`)!
      expect(typeof p.value).toBe('bigint')
      expect(p.scriptPubKey).toMatch(/^[0-9a-f]+$/)
    }
    expect(prev.source).toBe('dapi')
  })

  it('gives a coinbase transaction no prevouts', async () => {
    const e = entry('tx-coinbase') ?? entry('tx-cbtx')!
    const tx = (await core.tx(net, e.txid!)).data!
    expect((await core.prevouts(net, tx)).data.size).toBe(0)
  })

  it('carries the lock flags and confirmations of a mined transaction', async () => {
    const tx = (
      await core.tx(net, manifest.entries.find((x) => x.tags.includes('transfer'))!.txid!)
    ).data!
    expect(tx.confirmations).toBeGreaterThan(0)
    expect(typeof tx.isInstantLocked).toBe('boolean')
    expect(typeof tx.isChainLocked).toBe('boolean')
  })

  it('refuses to guess when a node request has no recording', async () => {
    const error = await core.block(net, { height: 7 }).catch((e: unknown) => e)
    expect(isSourceError(error) && error.source === 'dapi').toBe(true)
    expect(takeFixtureMisses()).toHaveLength(1)
  })

  it('has no masternode list yet', async () => {
    await expect(core.masternodeList(net)).rejects.toMatchObject({ kind: 'unavailable' })
  })
})

async function dayOf(net: string): Promise<string> {
  const m = await loadDapiManifest(net as 'mainnet')
  const purpose = m.entries.find((e) => e.id === 'date-jump-start')!.purpose
  return /\d{4}-\d{2}-\d{2}/.exec(purpose)![0]
}

describe('mainnet block heights', () => {
  it('reads a pre-DIP-3 block height from its BIP-34 push', async () => {
    const { core } = setup()
    const found = await core.block('mainnet', { height: 100000 })
    expect(found.data!.height).toBe(100000)
    expect(found.data!.txs[0]!.type).toBe('coinbase')
    expect(found.data!.txs[0]!.payload).toBeUndefined()
    expect(found.data!.chainLocked).toBe(true)
  })
})

describe('InstantSend lock evidence', () => {
  it('parses every lock in the recorded transaction stream and matches it to a streamed transaction', async () => {
    const manifest = await loadDapiManifest('mainnet')
    const transport = new FixtureDapiTransport()
    transport.holdOpen = false
    const rpc = createDapiRpc(transport)
    const locks = []
    const txids = new Set<string>()
    const stream = rpc.transactionStream('mainnet', { fromHeight: manifest.tip.height })
    for await (const event of stream.events) {
      if (event.kind === 'instantSendLocks') {
        for (const m of event.messages) locks.push(await decoder.isLock(m))
      }
      if (event.kind === 'transactions') {
        for (const raw of event.transactions) txids.add((await decoder.tx(raw, 'mainnet')).txid)
      }
    }
    expect(locks.length).toBeGreaterThan(0)
    for (const lock of locks) {
      expect(lock.txid).toMatch(/^[0-9a-f]{64}$/)
      expect(lock.cycleHash).toMatch(/^[0-9a-f]{64}$/)
      expect(lock.signature).toMatch(/^[0-9a-f]{192}$/)
      expect(lock.inputs.length).toBeGreaterThan(0)
    }
    expect(locks.some((l) => txids.has(l.txid))).toBe(true)
  })
})

describe('Hyphen fallback', () => {
  it('serves a list page from Hyphen when the budget is short, stamped as a fallback', async () => {
    const { core, transport } = setup()
    transport.budget.setPressure('exhausted')
    const rows = await core.blockRows('mainnet', { fromHeight: 2570100, count: 20 })
    expect(rows).toMatchObject({ source: 'hyphen', fallback: 'dapi-budget' })
    expect(rows.data).toHaveLength(20)
    expect(rows.data[0]!.height).toBeGreaterThan(rows.data[1]!.height)
    expect(transport.calls).toHaveLength(0)
  })

  it('reads a long list page from Hyphen in one request, with no DAPI call and no fallback mark @IN-02', async () => {
    const { core, transport } = setup()
    transport.budget.setPressure('ok')
    const rows = await core.blockRows('mainnet', { fromHeight: 2566380, count: 10, via: 'index' })
    expect(rows.source).toBe('hyphen')
    expect(rows.fallback).toBeUndefined()
    expect(rows.data.map((r) => r.height)).toEqual(
      Array.from({ length: 10 }, (_, i) => 2566380 - i),
    )
    expect(transport.calls).toHaveLength(0)
  })

  it('refuses an index list page while Hyphen is stale, so a long page never falls to DAPI @IN-02', async () => {
    const { core, transport } = setup({ health: { hyphen: 'stale' } })
    const error = await core
      .blockRows('mainnet', { fromHeight: 2566380, count: 10, via: 'index' })
      .catch((e: unknown) => e)
    expect(isSourceError(error)).toBe(true)
    expect(transport.calls).toHaveLength(0)
  })

  it('pages below the newest block with a cursor pinned to the index snapshot', async () => {
    const { core, transport } = setup()
    transport.budget.setPressure('tight')
    const rows = await core.blockRows('mainnet', { fromHeight: 2566380, count: 10 })
    expect(rows).toMatchObject({ source: 'hyphen', fallback: 'dapi-budget' })
    expect(rows.data.map((r) => r.height)).toEqual(
      Array.from({ length: 10 }, (_, i) => 2566380 - i),
    )
  })

  it('keeps the list on Hyphen for two minutes, then tries DAPI again', async () => {
    let now = 1_000_000
    const { core, transport } = setup({ now: () => now })
    transport.budget.setPressure('exhausted')
    await core.blockRows('mainnet', { fromHeight: 2570100, count: 20 })
    transport.budget.setPressure('ok')
    now += 119_000
    expect((await core.blockRows('mainnet', { fromHeight: 2570100, count: 20 })).source).toBe(
      'hyphen',
    )
    now += 2_000
    const manifest = await loadDapiManifest('mainnet')
    const back = await core.blockRows('mainnet', { fromHeight: manifest.tip.height, count: 20 })
    expect(back.source).toBe('dapi')
  })

  it('never falls back to a Hyphen index that is stale or down', async () => {
    const manifest = await loadDapiManifest('mainnet')
    const { core, transport } = setup({ health: { hyphen: 'stale' } })
    transport.budget.setPressure('exhausted')
    const rows = await core.blockRows('mainnet', { fromHeight: manifest.tip.height, count: 20 })
    expect(rows.source).toBe('dapi')
    expect(rows.fallback).toBeUndefined()
  })

  it('does not fall back on a network Hyphen does not cover', async () => {
    const { core, transport } = setup()
    transport.budget.setPressure('exhausted')
    const error = await core
      .blockRows('devnet-ruby', { fromHeight: 10, count: 3 })
      .catch((e: unknown) => e)
    expect(isSourceError(error) && error.source === 'dapi').toBe(true)
    takeFixtureMisses()
  })

  it('reads details from Hyphen only while DAPI is down', async () => {
    const { core, transport } = setup({ health: { dapi: 'down' } })
    const hash = '0000000000000007c8c40d75c0695e77a4d7219d80a363f8896c1d3c4c1f9ac0'
    const block = await core.block('mainnet', { hash })
    expect(block).toMatchObject({ source: 'hyphen', fallback: 'dapi-down' })
    expect(block.data!.hash).toBe(hash)
    expect(block.data!.height).toBe(2570010)
    const tx = await core.tx(
      'mainnet',
      '8acce06e01135b73f1acc26c8cb1084917e9bcf4a83ef1d1068df96a7c427a90',
    )
    expect(tx).toMatchObject({ source: 'hyphen', fallback: 'dapi-down' })
    expect(tx.data!.inputs).toHaveLength(9)
    expect(tx.data!.isInstantLocked).toBe(true)
    expect(transport.calls).toHaveLength(0)
  })

  it('asks DAPI first while it is merely slow', async () => {
    const { core, transport } = setup({ health: { dapi: 'degraded' } })
    const manifest = await loadDapiManifest('mainnet')
    const tx = await core.tx('mainnet', manifest.entries.find((e) => e.id === 'tx-coinbase')!.txid!)
    expect(tx.source).toBe('dapi')
    expect(transport.calls.length).toBeGreaterThan(0)
  })
})
