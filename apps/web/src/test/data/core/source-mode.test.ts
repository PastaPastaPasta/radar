import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCoreClient } from '@/data/core/client'
import { createCoreDecoder } from '@/data/core/decode'
import { isSourceError } from '@/data/errors'
import type { HealthState } from '@/data/health'
import { hyphen } from '@/data/hyphen/client'
import { writeSourceMode } from '@/lib/source-mode'
import { loadDapiManifest } from '@/test/fixtures/dapi-load'
import { FixtureDapiTransport } from '@/test/msw/dapi-transport'

const wasmPath = resolve(process.cwd(), '../../packages/core-decode/dist/core_decode_bg.wasm')

const decoder = createCoreDecoder(async () => {
  const wasm = await import('@radar/core-decode')
  wasm.initSync({ module: readFileSync(wasmPath) })
  return wasm
})

/** A façade whose Hyphen client counts every call made to it. */
function setup(health: Record<string, HealthState> = {}) {
  const transport = new FixtureDapiTransport()
  const asked = vi.fn()
  const counted = Object.fromEntries(
    (['status', 'blocks', 'blocksFrom', 'block', 'rawBlock', 'tx', 'rawTx'] as const).map(
      (name) => [
        name,
        (...args: unknown[]) => {
          asked(name)
          return (hyphen[name] as (...a: unknown[]) => unknown)(...args)
        },
      ],
    ),
  ) as unknown as typeof hyphen
  const core = createCoreClient({
    transport: () => transport,
    decoder,
    hyphen: counted,
    health: { get: (_net, source) => ({ state: health[source] ?? 'ok' }) as never },
    now: Date.now,
  })
  return { core, transport, asked }
}

beforeEach(() => {
  writeSourceMode('decentralized')
})
afterEach(() => {
  writeSourceMode('all')
})

describe('Core façade in Decentralized only mode @X-05 @X-09', () => {
  it('reads a list from DAPI when the budget is short, where it would have fallen back to Hyphen', async () => {
    const manifest = await loadDapiManifest('mainnet')
    const { core, transport, asked } = setup()
    transport.budget.setPressure('exhausted')
    const rows = await core.blockRows('mainnet', { fromHeight: manifest.tip.height, count: 20 })
    expect(rows.source).toBe('dapi')
    expect(rows.fallback).toBeUndefined()
    expect(asked).not.toHaveBeenCalled()
  })

  it('refuses a page that only an index list can serve, with the mode error and no request', async () => {
    const { core, transport, asked } = setup()
    const error = await core
      .blockRows('mainnet', { fromHeight: 2566380, count: 10, via: 'index' })
      .catch((e: unknown) => e)
    expect(isSourceError(error) && error.kind).toBe('disabled-by-mode')
    expect(isSourceError(error) && error.source).toBe('hyphen')
    expect(asked).not.toHaveBeenCalled()
    expect(transport.calls).toHaveLength(0)
  })

  it('keeps asking DAPI for a block and a transaction while DAPI is marked down, and never Hyphen', async () => {
    const manifest = await loadDapiManifest('mainnet')
    const { core, asked } = setup({ dapi: 'down' })
    const block = await core.block('mainnet', { height: manifest.tip.height })
    expect(block.source).toBe('dapi')
    expect(block.fallback).toBeUndefined()
    const txid = manifest.entries.find((e) => e.id === 'tx-coinbase')!.txid!
    const tx = await core.tx('mainnet', txid)
    expect(tx.source).toBe('dapi')
    const tip = await core.tip('mainnet')
    expect(tip.source).toBe('dapi')
    expect(asked).not.toHaveBeenCalled()
  })

  it('stops counting a ChainLock claim Hyphen made before the mode was switched on', async () => {
    writeSourceMode('all')
    const transport = new FixtureDapiTransport()
    const core = createCoreClient({
      transport: () => transport,
      decoder,
      hyphen: {
        ...hyphen,
        blocksFrom: async (...args: Parameters<typeof hyphen.blocksFrom>) => {
          const page = await hyphen.blocksFrom(...args)
          const [first, ...rest] = page.data.items
          const tagged = first && {
            ...first,
            live: { ...first.live, tags: { ...first.live?.tags, chainlock: true } },
          }
          return { ...page, data: { ...page.data, items: tagged ? [tagged, ...rest] : rest } }
        },
      },
      health: { get: () => ({ state: 'ok' }) as never },
      now: Date.now,
    })
    const rows = await core.blockRows('mainnet', { fromHeight: 2566380, count: 10, via: 'index' })
    expect(rows.data[0]!.chainLockClaim).toBe('one-node')

    writeSourceMode('decentralized')
    const lock = { height: 2566380, hash: 'a' }
    // With Hyphen's claim counted, one node would have made two sources.
    expect(core.observeChainLock('mainnet', lock, 'node-a:1443')).toBe(false)
    expect(core.observeChainLock('mainnet', lock, 'node-b:1443')).toBe(true)
  })
})
