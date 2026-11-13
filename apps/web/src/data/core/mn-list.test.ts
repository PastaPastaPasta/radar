import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createDapiRpc } from '@/data/dapi-core'
import { createCoreClient } from '@/data/core/client'
import { createCoreDecoder } from '@/data/core/decode'
import { createMasternodeList, MN_LIST_TTL_MS } from '@/data/core/mn-list'
import { parseMnListDiff, readCbor } from '@/data/core/mn-list-decode'
import { isSourceError } from '@/data/errors'
import { hyphen } from '@/data/hyphen/client'
import type { NetworkId } from '@/lib/network'
import { FixtureDapiTransport } from '@/test/msw/dapi-transport'

const wasmPath = resolve(process.cwd(), '../../packages/core-decode/dist/core_decode_bg.wasm')
const decoder = createCoreDecoder(async () => {
  const wasm = await import('@radar/core-decode')
  wasm.initSync({ module: readFileSync(wasmPath) })
  return wasm
})

const NETS: NetworkId[] = ['mainnet', 'testnet']
const ZERO = '0'.repeat(64)

async function recordedDiff(net: NetworkId): Promise<Uint8Array> {
  const stream = createDapiRpc(new FixtureDapiTransport()).masternodeListStream(net)
  for await (const event of stream.events) return event.diff
  throw new Error('the recording holds no list')
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

function encode(value: Json): number[] {
  const head = (major: number, n: number): number[] =>
    n < 24
      ? [(major << 5) | n]
      : n < 256
        ? [(major << 5) | 24, n]
        : n < 65536
          ? [(major << 5) | 25, n >> 8, n & 255]
          : [(major << 5) | 26, (n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255]
  if (value === null) return [0xf6]
  if (typeof value === 'boolean') return [value ? 0xf5 : 0xf4]
  if (typeof value === 'number') return head(0, value)
  if (typeof value === 'string') {
    const bytes = [...new TextEncoder().encode(value)]
    return [...head(3, bytes.length), ...bytes]
  }
  if (Array.isArray(value)) return [...head(4, value.length), ...value.flatMap(encode)]
  const entries = Object.entries(value)
  return [...head(5, entries.length), ...entries.flatMap(([k, v]) => [...encode(k), ...encode(v)])]
}

async function tampered(net: NetworkId, change: (d: Record<string, Json>) => void) {
  const doc = JSON.parse(JSON.stringify(readCbor(await recordedDiff(net)), bytesAsArray)) as Record<
    string,
    Json
  >
  change(doc)
  return doc
}

describe.each(NETS)('the recorded %s masternode list', (net) => {
  let bytes: Uint8Array
  beforeAll(async () => {
    bytes = await recordedDiff(net)
  })

  it('decodes into entries with every field well formed', () => {
    const parsed = parseMnListDiff(bytes)
    expect(parsed.diff.baseBlockHash).toBe(ZERO)
    expect(parsed.diff.updated.length).toBeGreaterThan(300)
    expect(parsed.rootMatchesCoinbase).toBe(true)
    expect(parsed.height).toBeGreaterThan(1_000_000)
    for (const e of parsed.diff.updated) {
      expect(e.proRegTxHash).toMatch(/^[0-9a-f]{64}$/)
      expect(e.pubKeyOperator).toMatch(/^[0-9a-f]{96}$/)
      expect([0, 1]).toContain(e.type)
      expect(typeof e.isValid).toBe('boolean')
      expect(e.service === '' || /^[\d.]+:\d+$|^\[.*\]:\d+$/.test(e.service)).toBe(true)
      if (e.type === 1) expect(e.platformNodeId).toMatch(/^[0-9a-f]{40}$/)
      else expect(e.platformNodeId).toBeUndefined()
    }
    expect(parsed.diff.updated.some((e) => e.type === 1 && e.platformHttpPort)).toBe(true)
    expect(parsed.diff.updated.some((e) => !e.isValid)).toBe(true)
  })

  it('shows an address nobody serves as no service', () => {
    const unset = parseMnListDiff(bytes).diff.updated.filter((e) => e.service === '')
    expect(unset.length).toBeGreaterThan(0)
    expect(unset.every((e) => !e.isValid)).toBe(true)
  })

  it('is cut off cleanly: any prefix is refused, not half read', () => {
    for (const cut of [1, 100, bytes.length - 1]) {
      expect(() => parseMnListDiff(bytes.subarray(0, cut))).toThrow(/not readable/)
    }
  })

  it('refuses a list whose masternode list root is not the one in its coinbase', () => {
    const doc = readCbor(bytes) as Record<string, unknown>
    const forged = { ...doc, merkleRootMNList: 'f'.repeat(64) }
    const again = parseMnListDiff(new Uint8Array(encodeDoc(forged)))
    expect(again.rootMatchesCoinbase).toBe(false)
  })
})

const bytesAsArray = (_k: string, v: unknown) => (v instanceof Uint8Array ? [...v] : v)

function encodeDoc(doc: Record<string, unknown>): number[] {
  return encode(JSON.parse(JSON.stringify(doc, bytesAsArray)) as Json)
}

describe('a malformed list', () => {
  it.each([
    [
      'an operator key of the wrong length',
      (d: Record<string, Json>) =>
        (((d.mnList as Json[])[0] as Record<string, Json>).pubKeyOperator = 'ab'),
    ],
    [
      'an entry that is valid in some other way',
      (d: Record<string, Json>) =>
        (((d.mnList as Json[])[0] as Record<string, Json>).isValid = 'yes'),
    ],
    [
      'an unknown masternode type',
      (d: Record<string, Json>) => (((d.mnList as Json[])[0] as Record<string, Json>).nType = 7),
    ],
    [
      'a repeated masternode',
      (d: Record<string, Json>) => ((d.mnList as Json[])[1] = (d.mnList as Json[])[0]!),
    ],
    ['an upper-case hash', (d: Record<string, Json>) => (d.blockHash = 'A'.repeat(64))],
  ])('is refused for %s', async (_name, change) => {
    const doc = await tampered('testnet', change)
    expect(() => parseMnListDiff(new Uint8Array(encodeDoc(doc)))).toThrow(
      expect.objectContaining({ kind: 'invalid-response' }),
    )
  })

  it('is refused when an evonode lacks its Platform node ID', async () => {
    const doc = await tampered('testnet', (d) => {
      const evo = (d.mnList as Record<string, Json>[]).find((e) => e.nType === 1)!
      delete evo.platformNodeID
    })
    expect(() => parseMnListDiff(new Uint8Array(encodeDoc(doc)))).toThrow(/Platform node ID/)
  })
})

function setup(
  net: NetworkId,
  opts: { now?: () => number; headers?: ReturnType<typeof createCoreClient>['headers'] } = {},
) {
  const transport = new FixtureDapiTransport()
  const core = createCoreClient({
    transport: () => transport,
    decoder,
    hyphen,
    health: { get: () => ({ state: 'ok' }) as never },
    now: Date.now,
  })
  const list = createMasternodeList({
    transport: () => transport,
    headers: opts.headers ?? core.headers,
    now: opts.now ?? Date.now,
  })
  return { transport, list, net }
}

describe.each(NETS)('reading the %s list through the Core façade', (net) => {
  it('stamps it as DAPI’s, at the block it names, and checks that block against a header', async () => {
    const { transport, list } = setup(net)
    const read = await list.masternodeList(net)
    expect(read).toMatchObject({ source: 'dapi', proved: false })
    expect(read.node).toMatch(/:\d+$/)
    expect(read.height).toBeGreaterThan(1_000_000)
    expect(read.asOf).toBe(read.fetchedAt)
    expect(read.data.size).toBeGreaterThan(300)
    expect([...read.data.keys()].every((k) => /^[0-9a-f]{64}$/.test(k))).toBe(true)
    const methods = transport.calls.map((c) => c.method)
    expect(methods.filter((m) => m === 'subscribeToMasternodeList')).toHaveLength(1)
  })
})

describe('the kept list', () => {
  const net = 'testnet' as const

  it('opens one stream for any number of readers and reads, for five minutes', async () => {
    let now = 1_000_000
    const { transport, list } = setup(net, { now: () => now })
    const [a, b] = await Promise.all([list.masternodeList(net), list.masternodeList(net)])
    expect(b).toBe(a)
    now += MN_LIST_TTL_MS - 1
    expect(await list.masternodeList(net)).toBe(a)
    const opened = () => transport.calls.filter((c) => c.method === 'subscribeToMasternodeList')
    expect(opened()).toHaveLength(1)
    now += 2
    const again = await list.masternodeList(net)
    expect(again).not.toBe(a)
    expect(again.asOf).toBe(now)
    expect(opened()).toHaveLength(2)
  })

  it('forgets a network on request', async () => {
    const { transport, list } = setup(net)
    await list.masternodeList(net)
    list.forget(net)
    await list.masternodeList(net)
    expect(transport.calls.filter((c) => c.method === 'subscribeToMasternodeList')).toHaveLength(2)
  })

  it('refuses a node that names a block other than the one DAPI reports at that height, and benches it', async () => {
    const headers = vi
      .fn()
      .mockResolvedValue({ data: [{ height: 1, hash: 'ab'.repeat(32), time: 0 }] })
    const { transport, list } = setup(net, { headers })
    const failure = await list.masternodeList(net).catch((e: unknown) => e)
    expect(isSourceError(failure) && failure.kind).toBe('invalid-response')
    expect(transport.invalid.length).toBeGreaterThan(0)
    expect(headers).toHaveBeenCalledTimes(3)
  })

  it('keeps a list whose block could not be checked', async () => {
    const headers = vi.fn().mockRejectedValue(new Error('no header'))
    const { list } = setup(net, { headers })
    expect((await list.masternodeList(net)).data.size).toBeGreaterThan(300)
  })

  it('does not keep a refusal', async () => {
    const headers = vi
      .fn()
      .mockResolvedValue({ data: [{ height: 1, hash: 'ab'.repeat(32), time: 0 }] })
    const { list } = setup(net, { headers })
    await expect(list.masternodeList(net)).rejects.toMatchObject({ kind: 'invalid-response' })
    headers.mockRejectedValue(new Error('no header'))
    expect((await list.masternodeList(net)).data.size).toBeGreaterThan(300)
  })

  it('lets a reader leave without cancelling the read others wait for', async () => {
    const { list } = setup(net)
    const quitter = new AbortController()
    const a = list.masternodeList(net, quitter.signal)
    const b = list.masternodeList(net)
    quitter.abort()
    await expect(a).rejects.toMatchObject({ kind: 'aborted' })
    expect((await b).data.size).toBeGreaterThan(300)
  })
})
