import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fromBinary, toBinary } from '@bufbuild/protobuf'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { CoreCache, CachedTx } from '@/data/dapi-core/cache'
import {
  BlockHeadersWithChainLocksResponseSchema,
  GetTransactionResponseSchema,
} from '@/data/dapi-core/gen/core/v0/core_pb'
import type { DapiTransport } from '@/data/dapi-core'
import { createCoreClient } from '@/data/core/client'
import { createCoreDecoder } from '@/data/core/decode'
import { instantLockView } from '@/data/core/lock-state'
import { hyphen } from '@/data/hyphen/client'
import { loadDapiManifest } from '@/test/fixtures/dapi-load'
import { server } from '@/test/server'
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
  fixtures.holdOpen = false
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
    putTx: (_net: string, tx: CachedTx) => {
      const kept = txs.get(tx.txid)
      txs.set(
        tx.txid,
        tx.instantLock || !kept?.instantLock ? tx : { ...tx, ...kept, bytes: tx.bytes },
      )
      return Promise.resolve()
    },
    getHeaders: () => Promise.resolve(undefined),
    putHeaders: () => Promise.resolve(),
    getBlockByHash: () => Promise.resolve(undefined),
    getBlockByHeight: () => Promise.resolve(undefined),
    putBlock: () => Promise.resolve(),
  } as unknown as CoreCache
}

function clientOver(transport: DapiTransport, cache?: CoreCache, dapi: 'ok' | 'down' = 'ok') {
  return createCoreClient({
    transport: () => transport,
    decoder,
    hyphen,
    health: {
      get: (_net: string, source: string) => ({ state: source === 'dapi' ? dapi : 'ok' }) as never,
    },
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
    expect(again).toMatchObject({ isInstantLocked: false, instantLockRemembered: true })
    expect(instantLockView(again)).toMatchObject({ state: 'claimed', sources: ['dapi'] })
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
    expect(later.isInstantLocked).toBe(false)
    expect(instantLockView(later)).toMatchObject({ state: 'claimed', sources: ['dapi'] })
    expect(await cache.getTx('mainnet', txid)).toMatchObject({ instantLock: true })
  })

  it('does not invent a lock for a transaction no node ever reported one for', async () => {
    const txid = await find()
    const cache = memoryCache()
    const core = clientOver(transportSaying({ locked: false }), cache)
    expect((await core.tx('mainnet', txid)).data!.isInstantLocked).toBe(false)
    expect((await core.tx('mainnet', txid)).data!.isInstantLocked).toBe(false)
    expect((await cache.getTx('mainnet', txid))?.instantLock).toBeUndefined()
  })

  it('carries a remembered lock as its own field, never as the node’s flag', async () => {
    const txid = await find()
    const cache = memoryCache()
    const locks = { locked: true }
    await clientOver(transportSaying(locks), cache).tx('mainnet', txid)
    locks.locked = false
    const later = (await clientOver(transportSaying(locks), cache).tx('mainnet', txid)).data!
    expect(later).toMatchObject({ isInstantLocked: false, instantLockRemembered: true })
    locks.locked = true
    const fresh = (await clientOver(transportSaying(locks), cache).tx('mainnet', txid)).data!
    expect(fresh.instantLockRemembered).toBeUndefined()
  })
})

/** A network that has no ChainLock: the transaction is mined `confirmations` deep and nothing is ChainLocked. */
function withoutChainLocks(locks: { locked: boolean }, confirmations: number): DapiTransport {
  const inner = transportSaying(locks)
  return {
    budget: inner.budget,
    unary: async (net, method, request, opts) => {
      const reply = await inner.unary(net, method, request, opts)
      if (method !== 'getTransaction') return reply
      const message = fromBinary(GetTransactionResponseSchema, reply.response)
      message.isChainLocked = false
      message.confirmations = confirmations
      return { ...reply, response: toBinary(GetTransactionResponseSchema, message) }
    },
    stream: (net, method, request, opts) => {
      const handle = inner.stream(net, method, request, opts)
      return {
        node: handle.node,
        messages: (async function* () {
          for await (const bytes of handle.messages) {
            const m = fromBinary(BlockHeadersWithChainLocksResponseSchema, bytes)
            if (m.responses.case !== 'chainLock') yield bytes
          }
        })(),
      }
    },
  }
}

describe('a network without ChainLocks keeps locks for the node’s keep depth @IN-05 @DATA-02', () => {
  const run = async (confirmations: number) => {
    const txid = await (async () => {
      const manifest = await loadDapiManifest('mainnet')
      return manifest.entries.find((e) => e.id === 'tx-normal-multi')!.txid!
    })()
    const cache = memoryCache()
    const locks = { locked: true }
    const first = (
      await clientOver(withoutChainLocks(locks, confirmations), cache).tx('mainnet', txid)
    ).data!
    locks.locked = false
    const later = (
      await clientOver(withoutChainLocks(locks, confirmations), cache).tx('mainnet', txid)
    ).data!
    return { first, later, cached: await cache.getTx('mainnet', txid) }
  }

  it('does not persist or apply a remembered lock for a transaction above the keep depth', async () => {
    const { first, later, cached } = await run(5)
    expect(first.instantLockKeepDepth).toBe(24)
    expect(instantLockView(first)).toMatchObject({ state: 'claimed', historical: false })
    expect(cached?.instantLock).toBeUndefined()
    expect(later.instantLockRemembered).toBeUndefined()
    expect(instantLockView(later)).toMatchObject({ state: 'none', historical: false })
  })

  it('persists and applies it once the transaction is that deep', async () => {
    const { first, later, cached } = await run(30)
    expect(instantLockView(first)).toMatchObject({ state: 'claimed', historical: true })
    expect(cached).toMatchObject({ instantLock: true })
    expect(later.instantLockRemembered).toBe(true)
    expect(instantLockView(later)).toMatchObject({ state: 'claimed', sources: ['dapi'] })
  })
})

describe('Hyphen standing in for DAPI says nothing about a lock it does not hold @IN-05 @HY-07', () => {
  const txid = '8acce06e01135b73f1acc26c8cb1084917e9bcf4a83ef1d1068df96a7c427a90'

  it('reads its false as not known, and its true as one source’s claim', async () => {
    const core = clientOver(transportSaying({ locked: false }), undefined, 'down')
    const claimed = (await core.tx('mainnet', txid)).data!
    expect(instantLockView(claimed)).toMatchObject({ state: 'claimed', sources: ['hyphen'] })

    const recorded = JSON.parse(
      readFileSync(
        resolve(process.cwd(), `src/test/fixtures/http/hyphen/mainnet/tx__${txid}.json`),
        'utf8',
      ),
    ) as { body: { live: { tags: { islock: boolean } } } }
    recorded.body.live.tags.islock = false
    server.use(http.get(`*/x/hy/mainnet/tx/${txid}`, () => HttpResponse.json(recorded.body)))
    const silent = (await core.tx('mainnet', txid)).data!
    expect(instantLockView(silent)).toMatchObject({
      state: 'unknown',
      sources: [],
      unknownBy: 'source',
    })
  })
})
