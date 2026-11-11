import { fromBinary, toBinary } from '@bufbuild/protobuf'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { DapiCallOptions, DapiTransport, DapiUnaryMethod } from '@/data/dapi-core'
import {
  GetBlockResponseSchema,
  GetTransactionResponseSchema,
} from '@/data/dapi-core/gen/core/v0/core_pb'
import type { CoreCache } from '@/data/dapi-core/cache'
import { createCoreClient } from '@/data/core/client'
import { createCoreDecoder } from '@/data/core/decode'
import { hyphen } from '@/data/hyphen/client'
import { loadDapiManifest, type DapiManifest } from '@/test/fixtures/dapi-load'
import { FixtureDapiTransport } from '@/test/msw/dapi-transport'

const wasmPath = resolve(process.cwd(), '../../packages/core-decode/dist/core_decode_bg.wasm')
const decoder = createCoreDecoder(async () => {
  const wasm = await import('@radar/core-decode')
  wasm.initSync({ module: readFileSync(wasmPath) })
  return wasm
})

type Liar = (method: DapiUnaryMethod, request: Uint8Array, honest: Uint8Array) => Uint8Array | null

/**
 * Replays the recordings, except that the first node (named `liar`) answers through `lie`. Any other node tells the
 * truth. Calls that avoid `liar` are served by "node-2".
 */
class LyingTransport extends FixtureDapiTransport {
  /** Every node lies, however often it is asked again. */
  alwaysLie = false
  constructor(
    private readonly lie: Liar,
    private readonly lieAbout: ReadonlySet<string> = new Set(['getTransaction', 'getBlock']),
  ) {
    super()
  }
  override async unary(
    net: Parameters<FixtureDapiTransport['unary']>[0],
    method: DapiUnaryMethod,
    request: Uint8Array,
    opts?: DapiCallOptions,
  ) {
    const honest = await super.unary(net, method, request, opts)
    const askedAgain = (opts?.avoidNodes?.length ?? 0) > 0
    if ((askedAgain && !this.alwaysLie) || !this.lieAbout.has(method)) return honest
    const lied = this.lie(method, request, honest.response)
    return lied ? { response: lied, node: honest.node } : honest
  }
}

function fakeCache() {
  const puts = {
    tx: [] as string[],
    block: [] as string[],
    blockBytes: [] as Uint8Array[],
    headers: [] as number[],
  }
  const cache = {
    getTx: () => Promise.resolve(undefined),
    getBlockByHash: () => Promise.resolve(undefined),
    getBlockByHeight: () => Promise.resolve(undefined),
    getHeaders: () => Promise.resolve(undefined),
    putTx: (_n: string, t: { txid: string }) => (puts.tx.push(t.txid), Promise.resolve()),
    putBlock: (_n: string, b: { hash: string; bytes: Uint8Array }) => (
      puts.block.push(b.hash),
      puts.blockBytes.push(b.bytes),
      Promise.resolve()
    ),
    putHeaders: (_n: string, h: { height: number }[]) => (
      puts.headers.push(...h.map((x) => x.height)),
      Promise.resolve()
    ),
  } as unknown as CoreCache
  return { cache, puts }
}

function setup(transport: DapiTransport) {
  const { cache, puts } = fakeCache()
  const core = createCoreClient({
    transport: () => transport,
    decoder,
    hyphen,
    health: { get: () => ({ state: 'ok' }) as never },
    now: Date.now,
    cache: () => Promise.resolve(cache),
  })
  return { core, puts }
}

const NET = 'mainnet' as const

describe('a node that answers with something other than what was asked', () => {
  let manifest: DapiManifest
  const entry = (id: string) => manifest.entries.find((e) => e.id === id)!
  beforeAll(async () => {
    manifest = await loadDapiManifest(NET)
  })

  async function recorded(method: DapiUnaryMethod, id: string): Promise<Uint8Array> {
    const probe = new FixtureDapiTransport()
    const { core } = setup(probe)
    const e = entry(id)
    if (method === 'getTransaction') await core.tx(NET, e.txid!)
    else
      await core.block(
        NET,
        e.tags.includes('by-height') ? { height: e.height! } : { hash: e.hash! },
      )
    return (await probe.unary(NET, method, probe.lastRequest(method)!)).response
  }

  it('is not believed about a transaction: the id must hash from the bytes', async () => {
    const other = await recorded('getTransaction', 'tx-coinbase')
    const transport = new LyingTransport(() => other)
    const { core, puts } = setup(transport)
    const txid = entry('tx-normal-multi').txid!
    const got = await core.tx(NET, txid)
    expect(got.data?.txid).toBe(txid)
    expect(transport.invalid).toHaveLength(1)
    expect(puts.tx).not.toContain(entry('tx-coinbase').txid)
  })

  it('fails the lookup, and caches nothing, when every node lies about the transaction', async () => {
    const other = await recorded('getTransaction', 'tx-coinbase')
    const everyone = new LyingTransport(() => other)
    everyone.alwaysLie = true
    const { core, puts } = setup(everyone)
    await expect(core.tx(NET, entry('tx-normal-multi').txid!)).rejects.toMatchObject({
      kind: 'invalid-response',
    })
    expect(puts.tx).toHaveLength(0)
  })

  it('is not believed about where a transaction was mined: that block must sit at that height', async () => {
    const honest = await recorded('getTransaction', 'tx-normal-multi')
    const lie = (response: Uint8Array) => {
      const m = fromBinary(GetTransactionResponseSchema, response)
      m.blockHash = new Uint8Array(32).fill(7)
      m.isChainLocked = true
      return toBinary(GetTransactionResponseSchema, m)
    }
    const transport = new LyingTransport(() => lie(honest))
    const { core } = setup(transport)
    const got = await core.tx(NET, entry('tx-normal-multi').txid!)
    expect(got.data?.height).toBe(2570010)
    expect(got.data?.blockHash).not.toBe('07'.repeat(32))
    expect(transport.invalid.length).toBeGreaterThan(0)
  })

  it('is not believed about a block: the hash asked for must be the hash returned', async () => {
    const wrong = await recorded('getBlock', 'block-tip')
    const transport = new LyingTransport(() => wrong)
    const { core, puts } = setup(transport)
    const hash = entry('block-by-hash').hash!
    const got = await core.block(NET, { hash })
    expect(got.data?.hash).toBe(hash)
    expect(transport.invalid).toHaveLength(1)
    expect(puts.block).not.toContain(entry('block-tip').hash)
  })

  it('is not believed about a block whose transactions were changed: the merkle root must match', async () => {
    const tampered = (honest: Uint8Array) => {
      const m = fromBinary(GetBlockResponseSchema, honest)
      const bytes = Uint8Array.from(m.block)
      bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 0x01
      m.block = bytes
      return toBinary(GetBlockResponseSchema, m)
    }
    const transport = new LyingTransport((_m, _r, honest) => tampered(honest))
    const { core, puts } = setup(transport)
    const e = entry('block-by-hash')
    const got = await core.block(NET, { hash: e.hash! })
    expect(got.data?.hash).toBe(e.hash)
    expect(transport.invalid).toHaveLength(1)
    const honestBytes = fromBinary(
      GetBlockResponseSchema,
      await recorded('getBlock', 'block-by-hash'),
    ).block
    expect(puts.blockBytes.every((b) => b.at(-1) === honestBytes.at(-1))).toBe(true)
    transport.alwaysLie = true
    const all = setup(transport)
    await expect(all.core.block(NET, { hash: e.hash! })).rejects.toMatchObject({
      kind: 'invalid-response',
    })
    expect(all.puts.block).toHaveLength(0)
  })

  it('shows one node’s ChainLock as a claim, and a second node’s as locked', async () => {
    const tip = entry('block-tip')
    // One source only: the transport answers every ChainLock lookup from the same node.
    const onlyOne = new FixtureDapiTransport()
    const original = onlyOne.stream.bind(onlyOne)
    onlyOne.stream = (net, method, request, opts) =>
      original(net, method, request, { ...opts, avoidNodes: [] })
    const { core, puts } = setup(onlyOne)
    const lone = await core.block(NET, { height: tip.height! })
    expect(lone.data?.chainLocked).toBe(false)
    expect(lone.data?.chainLockClaim).toBe('one-node')
    expect(lone.immutable).toBeUndefined()
    expect(puts.block).toHaveLength(0)

    const two = setup(new FixtureDapiTransport())
    const agreed = await two.core.block(NET, { height: tip.height! })
    expect(agreed.data?.chainLocked).toBe(true)
    expect(agreed.data?.chainLockClaim).toBeUndefined()
    expect(agreed.immutable).toBeUndefined()
    expect(two.puts.block).toEqual([tip.hash])
  })

  it('does not cache headers above a ChainLock only one node reported', async () => {
    const onlyOne = new FixtureDapiTransport()
    const original = onlyOne.stream.bind(onlyOne)
    onlyOne.stream = (net, method, request, opts) =>
      original(net, method, request, { ...opts, avoidNodes: [] })
    const { core, puts } = setup(onlyOne)
    await core.headers(NET, manifest.tip.height - 99, 100)
    expect(puts.headers).toHaveLength(0)
  })
})
