import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCoreClient } from '@/data/core/client'
import { createCoreDecoder } from '@/data/core/decode'
import { instantLockView } from '@/data/core/lock-state'
import { SourceError, isSourceError } from '@/data/errors'
import type { HealthState } from '@/data/health'
import { writeSourceMode } from '@/lib/source-mode'
import { FixtureDapiTransport } from '@/test/msw/dapi-transport'

const wasmPath = resolve(process.cwd(), '../../packages/core-decode/dist/core_decode_bg.wasm')

const decoder = createCoreDecoder(async () => {
  const wasm = await import('@radar/core-decode')
  wasm.initSync({ module: readFileSync(wasmPath) })
  return wasm
})

const HY = resolve(process.cwd(), 'src/test/fixtures/http/hyphen/mainnet')
const body = (file: string) =>
  (JSON.parse(readFileSync(resolve(HY, file), 'utf8')) as { body: Record<string, unknown> }).body

const TXID = '8acce06e01135b73f1acc26c8cb1084917e9bcf4a83ef1d1068df96a7c427a90'
const BLOCK = '0000000000000002f8d327ba50aca312c62c370edb505ad612845f58885df98c'
const BLOCK_HEIGHT = 2570003
const rawtx = body(`rawtx__${TXID}.json`).rawtx as string
const rawblock = body(`rawblock__${BLOCK}.json`).rawblock as string

const sourced = <T>(source: 'hyphen' | 'insight', data: T) => ({
  source,
  asOf: Date.now(),
  fetchedAt: Date.now(),
  proved: false,
  data,
})

const unreachable = () => new SourceError({ source: 'hyphen', kind: 'network', message: 'down' })

function setup(health: Record<string, HealthState> = {}) {
  const transport = new FixtureDapiTransport()
  const hyphen = {
    status: vi.fn(),
    blocks: vi.fn(),
    blocksFrom: vi.fn(),
    block: vi.fn(() => Promise.resolve(sourced('hyphen', null))),
    rawBlock: vi.fn(() => Promise.resolve(sourced('hyphen', null))),
    tx: vi.fn(() => Promise.resolve(sourced('hyphen', null))),
    rawTx: vi.fn(() => Promise.resolve(sourced('hyphen', null))),
  }
  const insight = {
    status: vi.fn(),
    block: vi.fn(() => Promise.resolve(sourced('insight', null))),
    rawBlock: vi.fn(() => Promise.resolve(sourced('insight', null))),
    tx: vi.fn(() => Promise.resolve(sourced('insight', null))),
    rawTx: vi.fn(() => Promise.resolve(sourced('insight', null))),
  }
  const core = createCoreClient({
    transport: () => transport,
    decoder,
    hyphen: hyphen,
    insight: insight,
    health: { get: (_net, source) => ({ state: health[source] ?? 'ok' }) as never },
    now: Date.now,
  })
  transport.breakConnection('mainnet')
  return { core, hyphen, insight }
}

afterEach(() => {
  writeSourceMode('all')
})

const hyphenHasTx = (h: ReturnType<typeof setup>['hyphen']) => {
  h.rawTx.mockResolvedValue(sourced('hyphen', { rawtx }) as never)
  h.tx.mockResolvedValue(
    sourced('hyphen', {
      blockHeight: BLOCK_HEIGHT,
      asOfHeight: BLOCK_HEIGHT + 3,
      live: { tags: { islock: true } },
    }) as never,
  )
}

const insightHasTx = (i: ReturnType<typeof setup>['insight'], confirmations = 4) => {
  i.rawTx.mockResolvedValue(sourced('insight', { rawtx }) as never)
  i.tx.mockResolvedValue(
    sourced('insight', {
      blockheight: BLOCK_HEIGHT,
      confirmations,
      blocktime: 1_700_000_000_000,
    }) as never,
  )
}

describe('a failed DAPI read falls back inside the same query @W2-25 @X-09', () => {
  beforeEach(() => {
    writeSourceMode('all')
  })

  it('reads a transaction from Hyphen when DAPI cannot answer', async () => {
    const { core, hyphen, insight } = setup()
    hyphenHasTx(hyphen)
    const tx = await core.tx('mainnet', TXID)
    expect(tx.source).toBe('hyphen')
    expect(tx.fallback).toBe('dapi-down')
    expect(tx.data?.txid).toBe(TXID)
    expect(tx.data?.height).toBe(BLOCK_HEIGHT)
    expect(insight.rawTx).not.toHaveBeenCalled()
  })

  it('accepts an index that is behind, because it has the height it is asked for', async () => {
    const { core, hyphen } = setup({ hyphen: 'stale' })
    hyphenHasTx(hyphen)
    const tx = await core.tx('mainnet', TXID)
    expect(tx.source).toBe('hyphen')
    expect(tx.data?.txid).toBe(TXID)
  })

  it('asks Insight when Hyphen fails too, and says it stood in', async () => {
    const { core, hyphen, insight } = setup()
    hyphen.rawTx.mockRejectedValue(unreachable())
    insightHasTx(insight)
    const tx = await core.tx('mainnet', TXID)
    expect(tx.source).toBe('insight')
    expect(tx.fallback).toBe('dapi-down')
    expect(tx.data?.txid).toBe(TXID)
    expect(tx.data?.height).toBe(BLOCK_HEIGHT)
    expect(tx.data?.confirmations).toBe(4)
  })

  it('counts a deep transaction from Insight as final, so it shows no InstantSend state', async () => {
    const { core, hyphen, insight } = setup()
    hyphen.rawTx.mockRejectedValue(unreachable())
    insightHasTx(insight, 30)
    const tx = await core.tx('mainnet', TXID)
    expect(tx.source).toBe('insight')
    expect(tx.data?.isChainLocked).toBe(true)
    expect(tx.data && instantLockView(tx.data)).toEqual({ state: 'settled' })
  })

  it('asks Insight when Hyphen does not have the transaction yet', async () => {
    const { core, insight } = setup({ hyphen: 'stale' })
    insightHasTx(insight)
    const tx = await core.tx('mainnet', TXID)
    expect(tx.source).toBe('insight')
  })

  it('skips a source already known to be down', async () => {
    const { core, hyphen, insight } = setup({ hyphen: 'down' })
    insightHasTx(insight)
    await core.tx('mainnet', TXID)
    expect(hyphen.rawTx).not.toHaveBeenCalled()
  })

  it('asks Insight when DAPI is already down and Hyphen does not have the transaction', async () => {
    const { core, hyphen, insight } = setup({ dapi: 'down' })
    insightHasTx(insight)
    const tx = await core.tx('mainnet', TXID)
    expect(hyphen.rawTx).toHaveBeenCalled()
    expect(tx.source).toBe('insight')
    expect(tx.fallback).toBe('dapi-down')
    expect(tx.data?.txid).toBe(TXID)
  })

  it('reads a block from Insight when DAPI is already down and Hyphen does not have it', async () => {
    const { core, insight } = setup({ dapi: 'down' })
    insight.block.mockResolvedValue(
      sourced('insight', { hash: BLOCK, height: BLOCK_HEIGHT, time: 0 }) as never,
    )
    insight.rawBlock.mockResolvedValue(sourced('insight', { rawblock }) as never)
    const block = await core.block('mainnet', { hash: BLOCK })
    expect(block.source).toBe('insight')
    expect(block.data?.height).toBe(BLOCK_HEIGHT)
  })

  it('throws DAPI’s own error when nothing else has the transaction, never "not found"', async () => {
    const { core } = setup()
    const error = await core.tx('mainnet', TXID).catch((e: unknown) => e)
    expect(isSourceError(error) && error.source).toBe('dapi')
  })

  it('reads a block from Hyphen, then from Insight', async () => {
    const a = setup()
    a.hyphen.rawBlock.mockResolvedValue(sourced('hyphen', { rawblock }) as never)
    a.hyphen.block.mockResolvedValue(
      sourced('hyphen', { blockHeight: BLOCK_HEIGHT, asOfHeight: BLOCK_HEIGHT + 2 }) as never,
    )
    const fromHyphen = await a.core.block('mainnet', { hash: BLOCK })
    expect(fromHyphen.source).toBe('hyphen')
    expect(fromHyphen.fallback).toBe('dapi-down')
    expect(fromHyphen.data?.height).toBe(BLOCK_HEIGHT)

    const b = setup()
    b.hyphen.rawBlock.mockRejectedValue(unreachable())
    b.insight.block.mockResolvedValue(
      sourced('insight', { hash: BLOCK, height: BLOCK_HEIGHT, time: 0 }) as never,
    )
    b.insight.rawBlock.mockResolvedValue(sourced('insight', { rawblock }) as never)
    const fromInsight = await b.core.block('mainnet', { height: BLOCK_HEIGHT })
    expect(fromInsight.source).toBe('insight')
    expect(fromInsight.data?.hash).toBe(BLOCK)
  })

  it('reads previous outputs from Insight when DAPI is already down and Hyphen misses', async () => {
    const { core, hyphen, insight } = setup({ dapi: 'down' })
    hyphen.rawTx.mockRejectedValue(unreachable())
    insightHasTx(insight)
    const prevs = await core.prevouts('mainnet', {
      inputs: [{ txid: TXID, vout: 0, sequence: 0, scriptSig: '' }],
      outputs: [],
    } as never)
    expect(prevs.source).toBe('insight')
    expect(prevs.fallback).toBe('dapi-down')
    expect(prevs.data.has(`${TXID}:0`)).toBe(true)
  })

  it('reads the previous outputs of a transaction from a hosted index when DAPI fails', async () => {
    const { core, hyphen } = setup()
    hyphenHasTx(hyphen)
    const tx = (await core.tx('mainnet', TXID)).data
    expect(tx).toBeTruthy()
    const prevs = await core.prevouts('mainnet', {
      ...tx!,
      inputs: [{ txid: TXID, vout: 0, sequence: 0, scriptSig: '' }],
    })
    expect(prevs.fallback).toBe('dapi-down')
    expect(prevs.data.has(`${TXID}:0`)).toBe(true)
  })
})

describe('Decentralized only mode never falls back to a hosted index @W2-25 @X-09', () => {
  beforeEach(() => {
    writeSourceMode('decentralized')
  })

  it('makes no hosted call for a transaction, a block, a tip or previous outputs, and throws DAPI’s error', async () => {
    const { core, hyphen, insight } = setup()
    hyphenHasTx(hyphen)
    insightHasTx(insight)
    const errors = await Promise.all([
      core.tx('mainnet', TXID).catch((e: unknown) => e),
      core.block('mainnet', { hash: BLOCK }).catch((e: unknown) => e),
    ])
    for (const error of errors) {
      expect(isSourceError(error) && error.source).toBe('dapi')
    }
    for (const fn of Object.values(hyphen)) expect(fn).not.toHaveBeenCalled()
    for (const fn of Object.values(insight)) expect(fn).not.toHaveBeenCalled()
  })
})
