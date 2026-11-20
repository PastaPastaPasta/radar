import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCoreClient } from '@/data/core/client'
import { createCoreDecoder } from '@/data/core/decode'
import { enableEarlyAnswers } from '@/data/early'
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

  it('reads a mempool transaction from Insight as unconfirmed, not as ChainLocked', async () => {
    const { core, hyphen, insight } = setup()
    hyphen.rawTx.mockRejectedValue(unreachable())
    insightHasTx(insight)
    insight.tx.mockResolvedValue(sourced('insight', { blockheight: -1, confirmations: 0 }) as never)
    const tx = await core.tx('mainnet', TXID)
    expect(tx.source).toBe('insight')
    expect(tx.data?.height).toBeUndefined()
    expect(tx.data?.isChainLocked).toBe(false)
  })

  it('gives no answer from Insight when its detail read fails, rather than calling a mined transaction unconfirmed', async () => {
    const { core, hyphen, insight } = setup()
    hyphen.rawTx.mockRejectedValue(unreachable())
    insightHasTx(insight)
    insight.tx.mockRejectedValue(
      new SourceError({ source: 'insight', kind: 'network', message: 'down' }),
    )
    await expect(core.tx('mainnet', TXID)).rejects.toThrow()
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

  it('fails the previous outputs when Hyphen errors and Insight misses, rather than leaving them out', async () => {
    const { core, hyphen } = setup({ dapi: 'down' })
    hyphen.rawTx.mockRejectedValue(unreachable())
    await expect(
      core.prevouts('mainnet', {
        inputs: [{ txid: TXID, vout: 0, sequence: 0, scriptSig: '' }],
        outputs: [],
      } as never),
    ).rejects.toThrow()
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

describe('indexed first: Hyphen answers while DAPI is asked (§4.7)', () => {
  beforeEach(() => {
    writeSourceMode('all')
    enableEarlyAnswers()
  })
  afterEach(() => {
    enableEarlyAnswers(false)
  })

  const current = (h: ReturnType<typeof setup>['hyphen'], behind = 0) =>
    h.status.mockResolvedValue(
      sourced('hyphen', {
        blockHeight: BLOCK_HEIGHT + 10,
        indices: { blocks: { indexedHeight: BLOCK_HEIGHT + 10 - behind, updatedAt: 0 } },
      }),
    )

  it("gives Hyphen's checked transaction, stamped as standing in until DAPI answers", async () => {
    const { core, hyphen } = setup()
    hyphenHasTx(hyphen)
    current(hyphen)
    hyphen.block.mockResolvedValue(
      sourced('hyphen', { blockHeight: BLOCK_HEIGHT, blockTime: 1_700_000_000_000 }) as never,
    )
    const tx = await core.indexedTx('mainnet', TXID)
    expect(tx?.source).toBe('hyphen')
    expect(tx?.fallback).toBe('dapi-cold')
    expect(tx?.data.txid).toBe(TXID)
    expect(tx?.data.height).toBe(BLOCK_HEIGHT)
    // A mined transaction carries its block's time, so it never reads as unconfirmed.
    expect(hyphen.block).toHaveBeenCalledWith('mainnet', BLOCK_HEIGHT, undefined)
    expect(tx?.data.time).toBe(1_700_000_000_000)
  })

  it('refuses bytes that do not hash to the id asked for', async () => {
    const { core, hyphen } = setup()
    hyphenHasTx(hyphen)
    current(hyphen)
    const other = '11'.repeat(32)
    await expect(core.indexedTx('mainnet', other)).rejects.toMatchObject({
      kind: 'invalid-response',
    })
  })

  it('shows no unmined transaction from a replica that does not say how far it has indexed', async () => {
    const { core, hyphen } = setup()
    hyphen.rawTx.mockResolvedValue(sourced('hyphen', { rawtx }) as never)
    hyphen.tx.mockResolvedValue(sourced('hyphen', { blockHeight: null, asOfHeight: null }) as never)
    current(hyphen)
    expect(await core.indexedTx('mainnet', TXID)).toBeNull()
  })

  it('shows nothing from an index that has fallen behind its own node', async () => {
    const { core, hyphen } = setup()
    hyphenHasTx(hyphen)
    current(hyphen, 40)
    expect(await core.indexedTx('mainnet', TXID)).toBeNull()
  })

  it("gives Hyphen's checked block", async () => {
    const { core, hyphen } = setup()
    current(hyphen)
    hyphen.rawBlock.mockResolvedValue(sourced('hyphen', { rawblock }) as never)
    hyphen.block.mockResolvedValue(
      sourced('hyphen', { blockHeight: BLOCK_HEIGHT, asOfHeight: BLOCK_HEIGHT + 3 }) as never,
    )
    const block = await core.indexedBlock('mainnet', { hash: BLOCK })
    expect(block?.fallback).toBe('dapi-cold')
    expect(block?.data.hash).toBe(BLOCK)
  })

  it("gives Hyphen's newest rows in one request, unless they are hours old", async () => {
    const now = Date.now()
    const tip = BLOCK_HEIGHT + 10
    const page = (time: number, top = tip) =>
      sourced('hyphen', {
        items: [
          {
            blockHeight: top,
            blockHash: 'aa'.repeat(32),
            blockTime: time,
            txCount: 3,
            blockSize: 400,
          },
          {
            blockHeight: top - 1,
            blockHash: 'bb'.repeat(32),
            blockTime: time,
            txCount: 1,
            blockSize: 300,
          },
        ],
        asOfHeight: top,
      })
    const { core, hyphen } = setup()
    current(hyphen)
    hyphen.blocks.mockResolvedValue(page(now - 60_000))
    const rows = await core.indexedLatestRows('mainnet', 2)
    expect(hyphen.blocks).toHaveBeenCalledWith('mainnet', { limit: 2 }, undefined)
    expect(rows?.fallback).toBe('dapi-cold')
    expect(rows?.data.map((r) => r.height)).toEqual([tip, tip - 1])

    hyphen.blocks.mockResolvedValue(page(now - 3 * 60 * 60_000))
    expect(await core.indexedLatestRows('mainnet', 2)).toBeNull()

    // A page from a replica that trails the index the probe measured is no latest page either.
    hyphen.blocks.mockResolvedValue(page(now - 60_000, tip - 7))
    expect(await core.indexedLatestRows('mainnet', 2)).toBeNull()
  })

  it('asks nothing while Hyphen is known stale, in Decentralized only mode, on a devnet, or when turned off', async () => {
    const stale = setup({ hyphen: 'stale' })
    expect(await stale.core.indexedTx('mainnet', TXID)).toBeNull()
    expect(await stale.core.indexedLatestRows('mainnet', 20)).toBeNull()
    expect(stale.hyphen.rawTx).not.toHaveBeenCalled()

    const devnet = setup()
    expect(await devnet.core.indexedBlock('devnet-ruby', { height: 5 })).toBeNull()

    writeSourceMode('decentralized')
    const off = setup()
    expect(await off.core.indexedTx('mainnet', TXID)).toBeNull()
    writeSourceMode('all')

    enableEarlyAnswers(false)
    const disabled = setup()
    expect(await disabled.core.indexedTx('mainnet', TXID)).toBeNull()
    expect(disabled.hyphen.rawTx).not.toHaveBeenCalled()
  })
})
