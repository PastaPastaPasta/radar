import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createDapiRpc, type DapiCallOptions, type DapiUnaryMethod } from '@/data/dapi-core'
import { GetBlockRequestSchema } from '@/data/dapi-core/gen/core/v0/core_pb'
import { fromBinary } from '@bufbuild/protobuf'
import { createCoreClient } from '@/data/core/client'
import { createCoreDecoder } from '@/data/core/decode'
import type { DecodedTx } from '@/data/core/types'
import type { HealthState } from '@/data/health'
import { bytesToHex } from '@/lib/hex'
import { SourceError } from '@/data/errors'
import { hyphen } from '@/data/hyphen/client'
import { loadDapiManifest, type DapiManifest } from '@/test/fixtures/dapi-load'
import { FixtureDapiTransport } from '@/test/msw/dapi-transport'

const wasmPath = resolve(process.cwd(), '../../packages/core-decode/dist/core_decode_bg.wasm')
const decoder = createCoreDecoder(async () => {
  const wasm = await import('@radar/core-decode')
  wasm.initSync({ module: readFileSync(wasmPath) })
  return wasm
})

const NET = 'mainnet' as const

class Scripted extends FixtureDapiTransport {
  readonly blockCalls: number[] = []
  blockFailure?: (height: number, attempt: number) => SourceError | undefined
  override async unary(
    net: Parameters<FixtureDapiTransport['unary']>[0],
    method: DapiUnaryMethod,
    request: Uint8Array,
    opts?: DapiCallOptions,
  ) {
    if (method === 'getBlock') {
      const ref = fromBinary(GetBlockRequestSchema, request).block
      if (ref.case === 'height') {
        this.blockCalls.push(ref.value)
        const failure = this.blockFailure?.(ref.value, this.blockCalls.length)
        if (failure) throw failure
      }
    }
    return super.unary(net, method, request, opts)
  }
}

function setup(
  opts: { health?: Record<string, HealthState>; transport?: FixtureDapiTransport } = {},
) {
  const transport = opts.transport ?? new FixtureDapiTransport()
  const core = createCoreClient({
    transport: () => transport,
    decoder,
    hyphen,
    health: { get: (_net, source) => ({ state: opts.health?.[source] ?? 'ok' }) as never },
    now: Date.now,
  })
  return { core, transport }
}

const notFound = () =>
  new SourceError({ source: 'dapi', kind: 'http', status: 5, message: 'not found' })
const unavailable = () =>
  new SourceError({ source: 'dapi', kind: 'http', status: 14, message: 'unavailable' })

describe('list pages and fan-outs', () => {
  let manifest: DapiManifest
  beforeAll(async () => {
    manifest = await loadDapiManifest(NET)
  })

  it('stops starting rows after the first failure, and aborts none of them silently', async () => {
    const transport = new Scripted()
    transport.blockFailure = (_h, attempt) => (attempt === 2 ? unavailable() : undefined)
    const { core } = setup({ transport })
    await expect(
      core.blockRows(NET, { fromHeight: manifest.tip.height, count: 20 }),
    ).rejects.toMatchObject({ kind: 'http', status: 14 })
    expect(transport.blockCalls.length).toBeLessThanOrEqual(4)
  })

  it('leaves out the newest row when the node asked is a block behind, instead of failing the page', async () => {
    const transport = new Scripted()
    transport.blockFailure = (h) => (h === manifest.tip.height ? notFound() : undefined)
    const { core } = setup({ transport })
    const rows = await core.blockRows(NET, { fromHeight: manifest.tip.height, count: 20 })
    expect(rows.data).toHaveLength(19)
    expect(rows.data[0]!.height).toBe(manifest.tip.height - 1)
  })

  it('asks a second node for the newest block before it gives up on it', async () => {
    const transport = new Scripted()
    transport.blockFailure = (h, attempt) =>
      h === manifest.tip.height && attempt === 1 ? notFound() : undefined
    const { core } = setup({ transport })
    const rows = await core.blockRows(NET, { fromHeight: manifest.tip.height, count: 20 })
    expect(rows.data).toHaveLength(20)
  })

  it('fails the page when a row below the newest is missing', async () => {
    const transport = new Scripted()
    transport.blockFailure = (h) => (h === manifest.tip.height - 3 ? notFound() : undefined)
    const { core } = setup({ transport })
    await expect(
      core.blockRows(NET, { fromHeight: manifest.tip.height, count: 20 }),
    ).rejects.toMatchObject({ kind: 'invalid-response' })
  })

  it('keeps the fallback hold to the list that fell back', async () => {
    const { core, transport } = setup()
    transport.budget.setPressure('exhausted')
    const first = await core.blockRows(NET, { fromHeight: 2570013, count: 20 })
    expect(first.source).toBe('hyphen')
    transport.budget.setPressure('ok')
    const other = await core.blockRows(NET, { fromHeight: 2566380, count: 10 })
    expect(other.source).toBe('dapi')
  })

  it('does not fall back to a Hyphen whose health is not yet known', async () => {
    const { core, transport } = setup({ health: { hyphen: 'unknown' } })
    transport.budget.setPressure('exhausted')
    const rows = await core.blockRows(NET, { fromHeight: manifest.tip.height, count: 20 })
    expect(rows.source).toBe('dapi')
  })

  it('marks every Hyphen row below the newest locked one as locked', async () => {
    const { core, transport } = setup()
    transport.budget.setPressure('exhausted')
    const rows = await core.blockRows(NET, { fromHeight: 2570013, count: 20 })
    expect(rows.source).toBe('hyphen')
    expect(rows.data.every((r) => r.chainLocked)).toBe(true)
  })

  it('marks old Hyphen rows locked by depth even when no row in the page carries the tag', async () => {
    const { core, transport } = setup()
    transport.budget.setPressure('exhausted')
    const rows = await core.blockRows(NET, { fromHeight: 2566380, count: 10 })
    expect(rows.data.map((r) => r.chainLocked)).toEqual(Array(10).fill(true))
  })
})

describe('Hyphen detail fallbacks', () => {
  it('gives a mined transaction its time and depth, so it does not read as unconfirmed', async () => {
    const { core } = setup({ health: { dapi: 'down' } })
    const tx = await core.tx(
      NET,
      '8acce06e01135b73f1acc26c8cb1084917e9bcf4a83ef1d1068df96a7c427a90',
    )
    expect(tx.fallback).toBe('dapi-down')
    expect(tx.data?.height).toBe(2570010)
    expect(tx.data?.time).toBeGreaterThan(1_700_000_000_000)
    expect(tx.data?.confirmations).toBeGreaterThan(0)
  })

  it('stamps prevouts with Hyphen’s own time, not the moment they were fetched', async () => {
    const transport = new FixtureDapiTransport()
    const manifest = await loadDapiManifest(NET)
    const source = manifest.entries.find((e) => e.id === 'tx-coinbase')!
    const rawtx = bytesToHex(
      (await createDapiRpc(transport).transaction(NET, source.txid!)).message.transaction,
    )
    const stamp = {
      source: 'hyphen',
      asOf: 1_700_000_000_000,
      fetchedAt: Date.now(),
      proved: false,
    }
    const stub = {
      ...hyphen,
      rawTx: () => Promise.resolve({ ...stamp, data: { rawtx, asOfHeight: 5 } }),
      tx: () =>
        Promise.resolve({
          ...stamp,
          data: { blockHeight: 5, asOfHeight: 5, live: null },
        }),
      block: () => Promise.resolve({ ...stamp, data: null }),
    } as unknown as typeof hyphen
    const core = createCoreClient({
      transport: () => transport,
      decoder,
      hyphen: stub,
      health: { get: (_n, src) => ({ state: src === 'dapi' ? 'down' : 'ok' }) as never },
      now: Date.now,
    })
    const spender = {
      inputs: [{ txid: source.txid!, vout: 0, scriptSig: '', sequence: 0 }],
    } as unknown as DecodedTx
    const prev = await core.prevouts(NET, spender)
    expect(prev).toMatchObject({ source: 'hyphen', fallback: 'dapi-down', asOf: 1_700_000_000_000 })
    expect(prev.data.size).toBe(1)
  })
})

describe('early blocks and dates', () => {
  it('uses the height that was asked for below the BIP-34 height', async () => {
    const manifest = await loadDapiManifest(NET)
    const e = manifest.entries.find((x) => x.id === 'block-pre-dip3')!
    const { message } = await createDapiRpc(new FixtureDapiTransport()).block(NET, {
      height: e.height!,
    })
    const early = await decoder.block(message.block, NET, 500)
    expect(early.height).toBe(500)
    expect(early.txs[0]!.height).toBe(500)
    expect((await decoder.block(message.block, NET, e.height)).height).toBe(e.height)
  })

  it('says no block exists yet for a time after the tip, one past the tip', async () => {
    const { core } = setup()
    const manifest = await loadDapiManifest(NET)
    const far = await core.heightAtTime(NET, Date.now() + 10 * 365 * 86_400_000)
    expect(far.data).toBe(manifest.tip.height + 1)
  })

  it('reuses the tip it already has for the next date lookup', async () => {
    const { core, transport } = setup()
    await core.tip(NET)
    const before = transport.calls.filter((c) => c.method === 'getBlockchainStatus').length
    await core.heightAtTime(NET, Date.now() + 86_400_000)
    await core.heightAtTime(NET, Date.now() + 2 * 86_400_000)
    expect(transport.calls.filter((c) => c.method === 'getBlockchainStatus')).toHaveLength(before)
  })
})

describe('what the client remembers', () => {
  it('forgets ChainLocks and tips of a network when it is reset', async () => {
    const { core, transport } = setup()
    core.observeChainLock(NET, { height: 4_000_000_000, hash: 'a' }, 'x:1')
    core.observeChainLock(NET, { height: 4_000_000_000, hash: 'a' }, 'y:1')
    const manifest = await loadDapiManifest(NET)
    const tip = manifest.entries.find((e) => e.id === 'block-tip')!
    const streams = () =>
      transport.calls.filter((c) => c.method === 'subscribeToBlockHeadersWithChainLocks').length
    await core.block(NET, { height: tip.height! })
    const before = streams()
    core.forget(NET)
    await core.block(NET, { height: tip.height! })
    expect(streams()).toBeGreaterThan(before)
  })

  it('does not let one inflated ChainLock lock blocks that two sources have not both locked', async () => {
    const { core } = setup()
    core.observeChainLock(NET, { height: 4_000_000_000, hash: 'a' }, 'liar:1')
    const manifest = await loadDapiManifest(NET)
    const view = await core.block(NET, { height: manifest.tip.height })
    expect(view.data?.chainLocked).toBe(true)
    expect(view.data?.chainLockClaim).toBeUndefined()
  })
})
