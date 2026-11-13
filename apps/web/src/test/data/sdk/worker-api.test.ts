import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CALL_TIMEOUT_MS,
  MAX_IN_FLIGHT,
  MAX_SESSIONS,
  createSdkWorkerApi,
  type SdkHandle,
} from '@/data/sdk/worker/api'
import type { SdkNetworkConfig, WireError, WireResult } from '@/data/sdk/methods'
import { fakeHandle, fakeIdentity, fakeReads, proved } from './fakes'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const settle = (ms = 0) => vi.advanceTimersByTimeAsync(ms)
const cfg = (net: 'mainnet' | 'testnet'): SdkNetworkConfig => ({ net, network: net })
const ID = '5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk'

function setup(reads = fakeReads(), createSdk?: (cfg: SdkNetworkConfig) => Promise<SdkHandle>) {
  const created: string[] = []
  const freed: string[] = []
  const api = createSdkWorkerApi({
    createSdk:
      createSdk ??
      ((c) => {
        created.push(c.net)
        return Promise.resolve(fakeHandle(reads, () => freed.push(c.net) as unknown as undefined))
      }),
    decode: () => Promise.resolve({}),
    now: () => Date.now(),
  })
  return { api, created, freed }
}

const asOk = <R>(r: WireResult<R> | WireError): WireResult<R> => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.message}`)
  return r
}

describe('createSdkWorkerApi', () => {
  it('connects once per network and reports the protocol version', async () => {
    const { api, created } = setup()
    const info = await api.connect(cfg('mainnet'))
    expect(info).toMatchObject({ protocolVersion: 14, sdkVersion: expect.any(String) as string })
    await api.connect(cfg('mainnet'))
    expect(created).toEqual(['mainnet'])
  })

  it('answers with the data, the proof metadata and the proof bytes, and marks it proved', async () => {
    const reads = fakeReads({
      identities: {
        fetchWithProof: () => Promise.resolve(proved(fakeIdentity(ID, 42n))),
        balancesWithProof: () => Promise.reject(new Error('unused')),
      },
    })
    const { api } = setup(reads)
    await api.connect(cfg('testnet'))
    const r = asOk(await api.call('testnet', 'identities.fetch', { id: ID }))
    expect(r.proved).toBe(true)
    expect(r.data).toMatchObject({ id: ID, balance: 42n, revision: 3 })
    expect(r.data?.keys[1]).toMatchObject({
      id: 1,
      type: 2,
      purpose: 3,
      securityLevel: 2,
      readOnly: true,
      disabledAt: 1234,
    })
    expect(r.meta).toEqual({
      height: 700_000,
      coreChainLockedHeight: 2_570_000,
      epoch: 88,
      timeMs: 1_794_337_000_000,
      protocolVersion: 14,
      chainId: 'evo1',
    })
    expect(r.proof?.grovedbProof).toHaveLength(40)
    expect(r.proof?.signature).toHaveLength(96)
    expect(r.proof?.quorumType).toBe(4)
  })

  it('gives the proof bytes their own buffers so they can be transferred', async () => {
    const response = proved(fakeIdentity(ID))
    const { api } = setup(
      fakeReads({
        identities: {
          fetchWithProof: () => Promise.resolve(response),
          balancesWithProof: () => Promise.reject(new Error('unused')),
        },
      }),
    )
    await api.connect(cfg('testnet'))
    const r = asOk(await api.call('testnet', 'identities.fetch', { id: ID }))
    expect(r.proof!.grovedbProof.buffer).not.toBe(response.proof.grovedbProof.buffer)
    const buffers = new Set([
      r.proof!.grovedbProof.buffer,
      r.proof!.quorumHash.buffer,
      r.proof!.signature.buffer,
      r.proof!.blockIdHash.buffer,
    ])
    expect(buffers.size).toBe(4)
  })

  it('answers null for an identity the proof shows is absent, still proved', async () => {
    const { api } = setup(
      fakeReads({
        identities: {
          fetchWithProof: () => Promise.resolve(proved(null)),
          balancesWithProof: () => Promise.reject(new Error('unused')),
        },
      }),
    )
    await api.connect(cfg('testnet'))
    const r = asOk(await api.call('testnet', 'identities.fetch', { id: ID }))
    expect(r.data).toBeNull()
    expect(r.proved).toBe(true)
  })

  it('returns a balance or null for every id asked, in the order asked', async () => {
    const { api } = setup(
      fakeReads({
        identities: {
          fetchWithProof: () => Promise.reject(new Error('unused')),
          balancesWithProof: () =>
            Promise.resolve(
              proved(
                new Map<string, bigint | undefined>([
                  ['b', 7n],
                  ['a', undefined],
                ]),
              ),
            ),
        },
      }),
    )
    await api.connect(cfg('testnet'))
    const r = asOk(await api.call('testnet', 'identities.balances', { ids: ['a', 'b', 'c'] }))
    expect([...r.data]).toEqual([
      ['a', null],
      ['b', 7n],
      ['c', null],
    ])
  })

  it('marks system.status unproved and gives it no proof bytes', async () => {
    const status = {
      toJSON: () => ({
        version: {
          software: { dapi: '5.0.1', drive: '5.0.0', tenderdash: '1.8' },
          protocol: { tenderdash: { p2p: 10, block: 14 }, drive: { latest: 15, current: 14 } },
        },
        node: { id: 'b5f2', proTxHash: '143d' },
        chain: {
          isCatchingUp: false,
          latestBlockHash: '1473',
          latestAppHash: '2b8f',
          latestBlockHeight: '668392',
          earliestBlockHeight: '1',
          maxPeerBlockHeight: '668393',
          coreChainLockedHeight: 1589249,
        },
        network: { chainId: 'dash-testnet-51', peersCount: 217, isListening: true },
        time: { block: '1794337512523', epoch: 20273 },
      }),
    }
    const { api } = setup(
      fakeReads({
        system: {
          status: () => Promise.resolve(status),
          totalCreditsInPlatformWithProof: () => Promise.reject(new Error('unused')),
        },
      }),
    )
    await api.connect(cfg('testnet'))
    const r = asOk(await api.call('testnet', 'system.status', {}))
    expect(r.proved).toBe(false)
    expect(r.proof).toBeUndefined()
    expect(r.data).toEqual({
      chainId: 'dash-testnet-51',
      version: '5.0.0',
      height: 668392,
      timeMs: 1794337512523,
      catchingUp: false,
      peers: 217,
      isListening: true,
      latestBlockHash: '1473',
      latestAppHash: '2b8f',
      earliestBlockHeight: 1,
      maxPeerBlockHeight: 668393,
      coreChainLockedHeight: 1589249,
      nodeProTxHash: '143d',
      nodeId: 'b5f2',
      dapiVersion: '5.0.1',
      tenderdashVersion: '1.8',
      tenderdashProtocol: { p2p: 10, block: 14 },
      driveProtocol: { latest: 15, current: 14 },
    })
    expect(r.meta).toMatchObject({ height: 668392, epoch: 20273, coreChainLockedHeight: 1589249 })
  })

  it('never throws: a failing SDK comes back as a classified WireError', async () => {
    const { api } = setup(
      fakeReads({
        identities: {
          fetchWithProof: () =>
            Promise.reject(
              Object.assign(new Error('grovedb: invalid proof: V1 mismatch'), { name: 'Proof' }),
            ),
          balancesWithProof: () => Promise.reject(new Error('unused')),
        },
      }),
    )
    await api.connect(cfg('testnet'))
    const r = await api.call('testnet', 'identities.fetch', { id: ID })
    expect(r).toMatchObject({ ok: false, error: { kind: 'proof-failed' } })
  })

  it('returns a WireError when the network was never connected', async () => {
    const { api } = setup()
    expect(await api.call('mainnet', 'epoch.current', {})).toMatchObject({ ok: false })
  })

  it('turns a failed connect into a WireError and lets a later connect try again', async () => {
    let attempts = 0
    const { api } = setup(fakeReads(), () => {
      attempts++
      return attempts === 1
        ? Promise.reject(
            Object.assign(new Error('Failed to prefetch quorums'), { name: 'Generic' }),
          )
        : Promise.resolve(fakeHandle(fakeReads()))
    })
    expect(await api.connect(cfg('mainnet'))).toMatchObject({
      ok: false,
      error: { kind: 'network' },
    })
    expect(await api.connect(cfg('mainnet'))).toMatchObject({ protocolVersion: 14 })
  })

  it('gives a call 8 s, then tries once more, then reports a timeout', async () => {
    let calls = 0
    const { api } = setup(
      fakeReads({
        epoch: {
          currentWithProof: () => {
            calls++
            return new Promise(() => undefined)
          },
        },
      }),
    )
    await api.connect(cfg('mainnet'))
    const pending = api.call('mainnet', 'epoch.current', {})
    await settle(CALL_TIMEOUT_MS - 1)
    expect(calls).toBe(1)
    await settle(2)
    expect(calls).toBe(2)
    await settle(CALL_TIMEOUT_MS + 50)
    expect(await pending).toMatchObject({ ok: false, error: { kind: 'timeout' } })
    expect(calls).toBe(2)
  })

  it('answers from the second try when the first node was dead', async () => {
    let calls = 0
    const { api } = setup(
      fakeReads({
        epoch: {
          currentWithProof: () => {
            calls++
            return calls === 1
              ? new Promise(() => undefined)
              : Promise.resolve(
                  proved({
                    toJSON: () => ({
                      index: 5,
                      firstBlockTime: 1,
                      firstBlockHeight: 2,
                      firstCoreBlockHeight: 3,
                      feeMultiplierPermille: 1000,
                      protocolVersion: 14,
                    }),
                    free: () => undefined,
                  }),
                )
          },
        },
      }),
    )
    await api.connect(cfg('mainnet'))
    const pending = api.call('mainnet', 'epoch.current', {})
    await settle(CALL_TIMEOUT_MS + 10)
    expect(asOk(await pending).data).toMatchObject({ index: 5, firstBlockHeight: 2 })
  })

  it('does not retry an answer about the data', async () => {
    let calls = 0
    const { api } = setup(
      fakeReads({
        identities: {
          fetchWithProof: () => {
            calls++
            return Promise.reject(
              Object.assign(new Error('Invalid identity ID'), { name: 'InvalidArgument' }),
            )
          },
          balancesWithProof: () => Promise.reject(new Error('unused')),
        },
      }),
    )
    await api.connect(cfg('testnet'))
    expect(await api.call('testnet', 'identities.fetch', { id: 'x' })).toMatchObject({
      ok: false,
      error: { kind: 'invalid-response' },
    })
    expect(calls).toBe(1)
  })

  it('runs at most six calls at once and starts the rest in order as slots free', async () => {
    const started: number[] = []
    const releases: (() => void)[] = []
    const { api } = setup(
      fakeReads({
        system: {
          status: () => Promise.reject(new Error('unused')),
          totalCreditsInPlatformWithProof: () => {
            started.push(started.length)
            return new Promise((resolve) => releases.push(() => resolve(proved(1n))))
          },
        },
      }),
    )
    await api.connect(cfg('mainnet'))
    const all = Array.from({ length: 9 }, () => api.call('mainnet', 'system.totalCredits', {}))
    await settle(10)
    expect(started).toHaveLength(MAX_IN_FLIGHT)
    releases.shift()!()
    await settle(0)
    expect(started).toHaveLength(MAX_IN_FLIGHT + 1)
    while (releases.length > 0) {
      releases.shift()!()
      await settle(0)
    }
    expect((await Promise.all(all)).every((r) => r.ok)).toBe(true)
  })

  it('keeps two networks alive and frees the least recently used when a third connects', async () => {
    const { api, freed } = setup()
    await api.connect(cfg('mainnet'))
    await api.connect(cfg('testnet'))
    expect(MAX_SESSIONS).toBe(2)
    await api.connect({ net: 'devnet-x', network: 'devnet', devnetName: 'x' })
    await settle(0)
    expect(freed).toEqual(['mainnet'])
  })

  it('refuses a method it has no implementation for', async () => {
    const { api } = setup()
    await api.connect(cfg('mainnet'))
    const r = await api.call('mainnet', 'identities.broadcast' as never, {} as never)
    expect(r).toMatchObject({ ok: false, error: { kind: 'unavailable' } })
  })

  it('reports a decode failure as a WireError', async () => {
    const api = createSdkWorkerApi({
      createSdk: () => Promise.resolve(fakeHandle(fakeReads())),
      decode: () =>
        Promise.reject(Object.assign(new Error('bad bytes'), { name: 'InvalidArgument' })),
    })
    expect(await api.decode('identity', new Uint8Array(1))).toMatchObject({ ok: false })
  })

  it('hands the contract and type of a document to the decoder', async () => {
    const decode = vi.fn(() => Promise.resolve({ ok: 1 }))
    const api = createSdkWorkerApi({
      createSdk: () => Promise.resolve(fakeHandle(fakeReads())),
      decode,
    })
    const contract = new Uint8Array([1, 2])
    const r = await api.decode('document', new Uint8Array(1), { contract, type: 'domain' })
    expect(r).toMatchObject({ ok: true, data: { ok: 1 } })
    expect(decode).toHaveBeenCalledWith('document', new Uint8Array(1), { contract, type: 'domain' })
  })

  it('gives a call the timeout from the connection settings', async () => {
    let calls = 0
    const { api } = setup(
      fakeReads({
        epoch: {
          currentWithProof: () => {
            calls++
            return new Promise(() => undefined)
          },
        },
      }),
    )
    await api.connect({ ...cfg('mainnet'), settings: { timeoutMs: 30_000 } })
    const pending = api.call('mainnet', 'epoch.current', {})
    await settle(CALL_TIMEOUT_MS + 100)
    expect(calls).toBe(1)
    await settle(60_000)
    expect(await pending).toMatchObject({ ok: false, error: { kind: 'timeout' } })
    expect(calls).toBe(2)
  })
})
