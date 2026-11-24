import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createCoreClient } from '@/data/core/client'
import { createCoreDecoder } from '@/data/core/decode'
import { hyphen } from '@/data/hyphen/client'
import type { DapiTransport } from '@/data/dapi-core/transport'
import { FixtureDapiTransport } from '@/test/msw/dapi-transport'
import { writeSourceMode } from '@/lib/source-mode'
import { loadDapiManifest } from '@/test/fixtures/dapi-load'

const wasmPath = resolve(process.cwd(), '../../packages/core-decode/dist/core_decode_bg.wasm')
const decoder = createCoreDecoder(async () => {
  const wasm = await import('@radar/core-decode')
  wasm.initSync({ module: readFileSync(wasmPath) })
  return wasm
})

interface Cached {
  hash: string
  height: number
  bytes: Uint8Array
}

function memoryCache() {
  const blocks = new Map<string, Cached>()
  return {
    blocks,
    getBlockByHash: (net: string, hash: string) => Promise.resolve(blocks.get(`${net}:${hash}`)),
    getBlockByHeight: (net: string, height: number) =>
      Promise.resolve(
        [...blocks.entries()].find(([k, b]) => k.startsWith(`${net}:`) && b.height === height)?.[1],
      ),
    putBlock: (net: string, b: Cached) => {
      blocks.set(`${net}:${b.hash}`, b)
      return Promise.resolve()
    },
    getTx: () => Promise.resolve(undefined),
    putTx: () => Promise.resolve(),
    putHeaders: () => Promise.resolve(),
  }
}

function client(transport: DapiTransport, cache?: ReturnType<typeof memoryCache>) {
  return createCoreClient({
    transport: () => transport,
    decoder,
    hyphen,
    health: { get: () => ({ state: 'ok' }) as never },
    now: Date.now,
    ...(cache ? { cache: () => Promise.resolve(cache as never) } : {}),
  })
}

/** Counts the ChainLock lookups open when the first of them answers. */
function lockCounting(inner: FixtureDapiTransport) {
  const seen = { opened: 0, openAtFirstAnswer: -1 }
  const transport: DapiTransport = {
    budget: inner.budget,
    unary: (...args) => inner.unary(...args),
    stream(net, method, request, opts) {
      const handle = inner.stream(net, method, request, opts)
      if (method !== 'subscribeToBlockHeadersWithChainLocks') return handle
      seen.opened++
      async function* messages() {
        for await (const m of handle.messages) {
          if (seen.openAtFirstAnswer < 0) seen.openAtFirstAnswer = seen.opened
          yield m
        }
      }
      return {
        get node() {
          return handle.node
        },
        messages: messages(),
      }
    },
  }
  return { transport, seen }
}

describe('block() @IN-03', () => {
  it('asks two nodes for their ChainLock at once', async () => {
    const { transport, seen } = lockCounting(new FixtureDapiTransport())
    const block = await client(transport).block('mainnet', { height: 2570085 })
    expect(block.data?.chainLocked).toBe(true)
    expect(seen.openAtFirstAnswer).toBeGreaterThanOrEqual(2)
  })

  it('serves a cached block as ChainLocked with no request to a node', async () => {
    const cache = memoryCache()
    const first = await client(new FixtureDapiTransport(), cache).block('mainnet', {
      height: 2570085,
    })
    expect(first.data?.chainLocked).toBe(true)
    expect(cache.blocks.size).toBe(1)
    const transport = new FixtureDapiTransport()
    const again = await client(transport, cache).block('mainnet', { height: 2570085 })
    expect(again.data?.hash).toBe(first.data?.hash)
    expect(again.data?.chainLocked).toBe(true)
    expect(transport.calls).toHaveLength(0)
  })

  it('checks a cached block again in Decentralized only mode, where a Hyphen claim does not count', async () => {
    const cache = memoryCache()
    await client(new FixtureDapiTransport(), cache).block('mainnet', { height: 2570085 })
    writeSourceMode('decentralized')
    try {
      const transport = new FixtureDapiTransport()
      const again = await client(transport, cache).block('mainnet', { height: 2570085 })
      expect(again.data?.chainLocked).toBe(true)
      expect(transport.calls.map((c) => c.method)).toContain(
        'subscribeToBlockHeadersWithChainLocks',
      )
      expect(transport.calls.map((c) => c.method)).not.toContain('getBlock')
    } finally {
      writeSourceMode('all')
    }
  })

  it('asks for the ChainLock beside the block, not after it', async () => {
    const transport = new FixtureDapiTransport()
    const core = client(transport)
    const block = await core.block('mainnet', { height: 2570085 })
    expect(block.data?.height).toBe(2570085)
    const methods = transport.calls.map((c) => c.method)
    const lock = methods.indexOf('subscribeToBlockHeadersWithChainLocks')
    expect(lock).toBeGreaterThanOrEqual(0)
    expect(lock).toBeLessThan(methods.indexOf('getBlock'))
  })
})

describe('tx() @IN-05', () => {
  it('asks for the ChainLock beside the transaction when none is known yet', async () => {
    const manifest = await loadDapiManifest('mainnet')
    const txid = manifest.entries.find((x) => x.tags.includes('transfer'))!.txid!
    const transport = new FixtureDapiTransport()
    const tx = await client(transport).tx('mainnet', txid)
    expect(tx.data?.isChainLocked).toBe(true)
    const methods = transport.calls.map((c) => c.method)
    expect(methods.indexOf('subscribeToBlockHeadersWithChainLocks')).toBeLessThan(
      methods.indexOf('getTransaction'),
    )
  })
})
