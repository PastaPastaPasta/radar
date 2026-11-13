import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fromBinary, toBinary } from '@bufbuild/protobuf'
import { describe, expect, it } from 'vitest'
import type { CoreCache, CachedTx } from '@/data/dapi-core/cache'
import { GetTransactionResponseSchema } from '@/data/dapi-core/gen/core/v0/core_pb'
import type { DapiTransport } from '@/data/dapi-core'
import { createCoreClient } from '@/data/core/client'
import { createCoreDecoder } from '@/data/core/decode'
import { hyphen } from '@/data/hyphen/client'
import { loadDapiManifest } from '@/test/fixtures/dapi-load'
import { FixtureDapiTransport } from '@/test/msw/dapi-transport'

const wasmPath = resolve(process.cwd(), '../../packages/core-decode/dist/core_decode_bg.wasm')
const decoder = createCoreDecoder(async () => {
  const wasm = await import('@radar/core-decode')
  wasm.initSync({ module: readFileSync(wasmPath) })
  return wasm
})

/** The node that answers next says whatever `locked` holds, as nodes that pruned their locks at different times would. */
function transportSaying(locks: { locked: boolean }): DapiTransport {
  const fixtures = new FixtureDapiTransport()
  return {
    budget: fixtures.budget,
    stream: (...args) => fixtures.stream(...args),
    async unary(net, method, request, opts) {
      const reply = await fixtures.unary(net, method, request, opts)
      if (method !== 'getTransaction') return reply
      const message = fromBinary(GetTransactionResponseSchema, reply.response)
      message.isInstantLocked = locks.locked
      return { ...reply, response: toBinary(GetTransactionResponseSchema, message) }
    },
  }
}

function memoryCache(): CoreCache {
  const txs = new Map<string, CachedTx>()
  return {
    getTx: (_net: string, txid: string) => Promise.resolve(txs.get(txid)),
    putTx: (_net: string, tx: CachedTx) => Promise.resolve(void txs.set(tx.txid, tx)),
    getHeaders: () => Promise.resolve(undefined),
    putHeaders: () => Promise.resolve(),
    getBlockByHash: () => Promise.resolve(undefined),
    getBlockByHeight: () => Promise.resolve(undefined),
    putBlock: () => Promise.resolve(),
  } as unknown as CoreCache
}

function clientOver(transport: DapiTransport, cache?: CoreCache) {
  return createCoreClient({
    transport: () => transport,
    decoder,
    hyphen,
    health: { get: () => ({ state: 'ok' }) as never },
    now: Date.now,
    ...(cache ? { cache: () => Promise.resolve(cache) } : {}),
  })
}

describe('a lock a DAPI node reported stays visible @IN-05 @HY-07 @DATA-02', () => {
  const find = async () => {
    const manifest = await loadDapiManifest('mainnet')
    return manifest.entries.find(
      (e) => e.tags.includes('transfer') && e.tags.includes('chain-locked'),
    )!.txid!
  }

  it('keeps it when the next node has dropped its own', async () => {
    const txid = await find()
    const locks = { locked: true }
    const core = clientOver(transportSaying(locks))
    expect((await core.tx('mainnet', txid)).data!.isInstantLocked).toBe(true)
    locks.locked = false
    const again = (await core.tx('mainnet', txid)).data!
    expect(again).toMatchObject({ isInstantLocked: true, instantLockClaim: 'one-node' })
  })

  it('keeps it across visits through the cache', async () => {
    const txid = await find()
    const cache = memoryCache()
    const locks = { locked: true }
    expect(
      (await clientOver(transportSaying(locks), cache).tx('mainnet', txid)).data!.isInstantLocked,
    ).toBe(true)
    locks.locked = false
    const later = (await clientOver(transportSaying(locks), cache).tx('mainnet', txid)).data!
    expect(later.isInstantLocked).toBe(true)
    expect((await cache.getTx('mainnet', txid))?.instantLock).toBe(true)
  })

  it('does not invent a lock for a transaction no node ever reported one for', async () => {
    const txid = await find()
    const cache = memoryCache()
    const core = clientOver(transportSaying({ locked: false }), cache)
    expect((await core.tx('mainnet', txid)).data!.isInstantLocked).toBe(false)
    expect((await core.tx('mainnet', txid)).data!.isInstantLocked).toBe(false)
    expect((await cache.getTx('mainnet', txid))?.instantLock).toBeUndefined()
  })
})
