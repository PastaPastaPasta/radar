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
      txs.set(tx.txid, tx)
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

describe('a transaction in a ChainLocked block carries no InstantSend state @IN-05 @HY-07 @DATA-02', () => {
  const find = async () => {
    const manifest = await loadDapiManifest('mainnet')
    return manifest.entries.find(
      (e) => e.tags.includes('transfer') && e.tags.includes('chain-locked'),
    )!.txid!
  }

  it.each([true, false])('whether the node says locked=%s', async (locked) => {
    const txid = await find()
    const tx = (await clientOver(transportSaying({ locked })).tx('mainnet', txid)).data!
    expect(tx.isChainLocked === true || tx.chainLockClaim !== undefined).toBe(true)
    expect(tx).not.toHaveProperty('isInstantLocked')
    expect(tx).not.toHaveProperty('instantLockClaim')
    expect(instantLockView(tx)).toEqual({ state: 'settled' })
  })

  it('remembers no lock between reads or visits', async () => {
    const txid = await find()
    const cache = memoryCache()
    const locks = { locked: true }
    const core = clientOver(transportSaying(locks), cache)
    await core.tx('mainnet', txid)
    expect(Object.keys((await cache.getTx('mainnet', txid))!).sort()).toEqual(['bytes', 'txid'])
    locks.locked = false
    const again = (await core.tx('mainnet', txid)).data!
    const later = (await clientOver(transportSaying(locks), cache).tx('mainnet', txid)).data!
    for (const tx of [again, later]) {
      expect(tx).not.toHaveProperty('instantLockRemembered')
      expect(instantLockView(tx)).toEqual({ state: 'settled' })
    }
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

describe('a network without ChainLocks shows the node’s answer up to its keep depth @IN-05 @DATA-02', () => {
  const read = async (locked: boolean, confirmations: number) => {
    const manifest = await loadDapiManifest('mainnet')
    const txid = manifest.entries.find((e) => e.id === 'tx-normal-multi')!.txid!
    return (await clientOver(withoutChainLocks({ locked }, confirmations)).tx('mainnet', txid))
      .data!
  }

  it('shows a lock the node reports while the transaction is above the keep depth', async () => {
    const tx = await read(true, 5)
    expect(tx.instantLockKeepDepth).toBe(24)
    expect(instantLockView(tx)).toEqual({ state: 'claimed', source: 'dapi' })
  })

  it('shows the node’s "no lock" while the transaction is above the keep depth', async () => {
    expect(instantLockView(await read(false, 5))).toEqual({ state: 'none' })
  })

  it.each([true, false])(
    'shows nothing once the transaction is deep enough for the lock to be pruned (locked=%s)',
    async (locked) => {
      expect(instantLockView(await read(locked, 30))).toEqual({ state: 'settled' })
    },
  )
})

describe('Hyphen standing in for DAPI @IN-05 @HY-07', () => {
  const txid = '8acce06e01135b73f1acc26c8cb1084917e9bcf4a83ef1d1068df96a7c427a90'
  const recorded = () =>
    JSON.parse(
      readFileSync(
        resolve(process.cwd(), `src/test/fixtures/http/hyphen/mainnet/tx__${txid}.json`),
        'utf8',
      ),
    ) as {
      body: { blockHeight: number | null; asOfHeight: number; live: { tags: { islock: boolean } } }
    }

  it('reads a lock Hyphen reports for a mined transaction that is not ChainLocked as its claim', async () => {
    const core = clientOver(transportSaying({ locked: false }), undefined, 'down')
    expect(instantLockView((await core.tx('mainnet', txid)).data!)).toEqual({
      state: 'claimed',
      source: 'hyphen',
    })
  })

  it('carries no InstantSend state once the block is final under Hyphen’s index', async () => {
    const core = clientOver(transportSaying({ locked: false }), undefined, 'down')
    const body = recorded().body
    body.asOfHeight = body.blockHeight! + 30
    server.use(http.get(`*/x/hy/mainnet/tx/${txid}`, () => HttpResponse.json(body)))
    const tx = (await core.tx('mainnet', txid)).data!
    expect(tx.isChainLocked).toBe(true)
    expect(tx).not.toHaveProperty('isInstantLocked')
    expect(instantLockView(tx)).toEqual({ state: 'settled' })
  })

  it('reads its true as one source’s claim and its false as not known while the transaction is pending', async () => {
    const core = clientOver(transportSaying({ locked: false }), undefined, 'down')
    const body = recorded().body
    body.blockHeight = null
    server.use(http.get(`*/x/hy/mainnet/tx/${txid}`, () => HttpResponse.json(body)))
    expect(instantLockView((await core.tx('mainnet', txid)).data!)).toEqual({
      state: 'claimed',
      source: 'hyphen',
    })
    body.live.tags.islock = false
    expect(instantLockView((await core.tx('mainnet', txid)).data!)).toEqual({ state: 'unknown' })
  })
})
