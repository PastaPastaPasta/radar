import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSdkClient, type SdkTransport } from '@/data/sdk/client'
import type { WireError, WireResult } from '@/data/sdk/methods'
import { createProofStore } from '@/data/sdk/proof-store'
import { platformTipOf, platformTipQuery, sdkQueries } from '@/data/sdk/queries'
import { SourceError } from '@/data/errors'
import { takeFixtureMisses } from '../../msw/handlers'
import { FixtureSdkTransport } from '../../msw/sdk-transport'

const NOW = 1_794_337_999_000

function setup(transport: SdkTransport, now: () => number = () => NOW) {
  const proofs = createProofStore()
  const health = { report: vi.fn() }
  const client = createSdkClient({
    transport: () => Promise.resolve(transport),
    devnets: () => [],
    proofs,
    health,
    now,
    whenIdle: (fn) => fn(),
  })
  return { client, proofs, health }
}

const ID = '5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk'

describe('SdkClient over the recorded fixtures', () => {
  it('stamps a proof-checked answer with the proof metadata and keeps the proof in the store', async () => {
    const { client, proofs, health } = setup(new FixtureSdkTransport())
    const r = await client.call('testnet', 'identities.fetch', { id: ID })
    expect(r.source).toBe('sdk')
    expect(r.proved).toBe(true)
    expect(r.data).toMatchObject({ id: ID, balance: 42_367_592_163_887n })
    expect(r.proof).toMatchObject({
      method: 'identities.fetch',
      chainId: 'dash-testnet-51',
      quorumType: expect.any(Number) as number,
      proofBytes: expect.any(Number) as number,
    })
    expect(r.asOf).toBe(r.proof!.timeMs)
    expect(r.asOf).not.toBe(r.fetchedAt)
    expect(r.height).toBe(r.proof!.platformHeight)
    const record = proofs.get(r.proof!.id)
    expect(record?.proof.grovedbProof.length).toBe(r.proof!.proofBytes)
    expect(health.report).toHaveBeenCalledWith(
      'testnet',
      'sdk',
      expect.objectContaining({ ok: true }),
    )
  })

  it('answers null with a proof for an identity that does not exist', async () => {
    const { client } = setup(new FixtureSdkTransport())
    const r = await client.call('testnet', 'identities.fetch', {
      id: '11111111111111111111111111111111',
    })
    expect(r.data).toBeNull()
    expect(r.proved).toBe(true)
  })

  it('does not call a status answer proof-checked', async () => {
    const { client, proofs } = setup(new FixtureSdkTransport())
    const r = await client.call('mainnet', 'system.status', {})
    expect(r.proved).toBe(false)
    expect(r.proof).toBeUndefined()
    expect(r.data.chainId).toBe('evo1')
    expect(proofs.list()).toHaveLength(0)
  })

  it('reads Platform height and epoch for the home page from one proof', async () => {
    const { client } = setup(new FixtureSdkTransport())
    for (const net of ['mainnet', 'testnet'] as const) {
      const r = await client.call(net, 'epoch.current', {})
      const tip = platformTipOf(r)
      expect(tip.proved).toBe(true)
      expect(tip.data.height).toBe(r.proof!.platformHeight)
      expect(tip.data.epoch.number).toBe(r.data.index)
      expect(tip.data.epoch.firstBlockHeight).toBeLessThanOrEqual(tip.data.height)
      expect(tip.data.epoch.startedAt).toBeGreaterThan(1_700_000_000_000)
    }
  })

  it('returns balances as bigints, null for an id with none', async () => {
    const { client } = setup(new FixtureSdkTransport())
    const r = await client.call('testnet', 'identities.balances', {
      ids: [ID, '11111111111111111111111111111111'],
    })
    expect(r.data.get(ID)).toBeTypeOf('bigint')
    expect(r.data.get('11111111111111111111111111111111')).toBeNull()
  })

  it('returns a contract and null for a missing one', async () => {
    const { client } = setup(new FixtureSdkTransport())
    const r = await client.call('mainnet', 'contracts.getMany', {
      ids: ['GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec', '11111111111111111111111111111111'],
    })
    expect(r.data.get('GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec')).toMatchObject({
      ownerId: expect.any(String) as string,
      documentSchemas: expect.any(Object) as object,
    })
    expect(r.data.get('11111111111111111111111111111111')).toBeNull()
  })

  it('refuses a call with no recording and reports the miss', async () => {
    takeFixtureMisses()
    const { client } = setup(new FixtureSdkTransport())
    const error = await client
      .call('mainnet', 'identities.fetch', { id: 'nobody' })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SourceError)
    expect(takeFixtureMisses()).toHaveLength(1)
  })
})

describe('SdkClient state', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const connectOnly = (over: Partial<SdkTransport> = {}): SdkTransport => ({
    connect: () => Promise.resolve({ sdkVersion: 't', protocolVersion: 14, tookMs: 1 }),
    call: () => Promise.reject(new Error('unused')),
    decode: () => Promise.reject(new Error('unused')),
    ...over,
  })

  it('goes cold, loading, ready, and warm does the connecting', async () => {
    let finish: (() => void) | undefined
    const { client } = setup(
      connectOnly({
        connect: () =>
          new Promise(
            (resolve) =>
              (finish = () => resolve({ sdkVersion: 't', protocolVersion: 14, tookMs: 1 })),
          ),
      }),
    )
    expect(client.state('mainnet')).toBe('cold')
    client.warm('mainnet')
    await vi.advanceTimersByTimeAsync(0)
    expect(client.state('mainnet')).toBe('loading')
    finish!()
    await vi.advanceTimersByTimeAsync(0)
    expect(client.state('mainnet')).toBe('ready')
  })

  it('connects a network once, however many calls and warms ask', async () => {
    const connect = vi.fn(() =>
      Promise.resolve({ sdkVersion: 't', protocolVersion: 14, tookMs: 1 }),
    )
    const call = vi.fn(() =>
      Promise.resolve({ ok: true, data: 1n, proved: false, tookMs: 1 } as WireResult<bigint>),
    )
    const { client } = setup(connectOnly({ connect, call: call }))
    client.warm('mainnet')
    await Promise.all([
      client.call('mainnet', 'system.totalCredits', {}),
      client.call('mainnet', 'system.totalCredits', {}),
    ])
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it('turns a WireError into a SourceError of the same kind', async () => {
    const wireError: WireError = {
      ok: false,
      error: { kind: 'rate-limited', message: 'slow down' },
    }
    const { client, health } = setup(connectOnly({ call: () => Promise.resolve(wireError) }))
    await expect(client.call('mainnet', 'epoch.current', {})).rejects.toMatchObject({
      source: 'sdk',
      kind: 'rate-limited',
    })
    expect(health.report).toHaveBeenCalledWith(
      'mainnet',
      'sdk',
      expect.objectContaining({ ok: false, kind: 'rate-limited' }),
    )
  })

  it('marks the network failed when it cannot connect, and tries again after 5 s', async () => {
    let attempts = 0
    const { client } = setup(
      connectOnly({
        connect: () => {
          attempts++
          return Promise.resolve(
            attempts === 1
              ? {
                  ok: false,
                  error: { kind: 'network', message: 'Failed to prefetch quorums' },
                }
              : { sdkVersion: 't', protocolVersion: 14, tookMs: 1 },
          )
        },
      }),
      () => Date.now(),
    )
    await expect(client.call('mainnet', 'epoch.current', {})).rejects.toMatchObject({
      kind: 'network',
    })
    expect(client.state('mainnet')).toBe('failed')
    await expect(client.call('mainnet', 'epoch.current', {})).rejects.toMatchObject({
      kind: 'unavailable',
    })
    expect(attempts).toBe(1)
    await vi.advanceTimersByTimeAsync(5_001)
    await client.call('mainnet', 'epoch.current', {}).catch(() => undefined)
    expect(attempts).toBe(2)
    expect(client.state('mainnet')).toBe('ready')
  })

  it('drops a late answer when the caller aborted', async () => {
    let answer!: (r: WireResult<bigint>) => void
    const { client, proofs } = setup(
      connectOnly({
        call: (() => new Promise((resolve) => (answer = resolve as typeof answer))) as never,
      }),
    )
    const ctrl = new AbortController()
    const pending = client.call('mainnet', 'system.totalCredits', {}, ctrl.signal)
    const caught = pending.catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(0)
    ctrl.abort()
    answer({ ok: true, data: 1n, proved: false, tookMs: 1 })
    expect(await caught).toMatchObject({ kind: 'aborted' })
    expect(proofs.list()).toHaveLength(0)
  })

  it('refuses an unknown devnet without loading anything', async () => {
    const { client } = setup(connectOnly())
    await expect(client.call('devnet-nope', 'epoch.current', {})).rejects.toMatchObject({
      kind: 'unavailable',
    })
  })

  it('stamps an unproved answer with its fetch time when the node sent none', async () => {
    const { client } = setup(
      connectOnly({
        call: (() => Promise.resolve({ ok: true, data: 1n, proved: false, tookMs: 1 })) as never,
      }),
    )
    const r = await client.call('mainnet', 'system.totalCredits', {})
    expect(r).toMatchObject({ proved: false, asOf: NOW, fetchedAt: NOW, asOfFetched: true })
  })
})

describe('sdkQueries', () => {
  it('keys every call by network, method and args, and the home tip shares the epoch entry', () => {
    expect(sdkQueries['identities.fetch']('testnet', { id: ID }).queryKey).toEqual([
      'testnet',
      'sdk',
      'identities.fetch',
      { id: ID },
    ])
    expect(platformTipQuery('mainnet').queryKey).toEqual(
      sdkQueries['epoch.current']('mainnet', {}).queryKey,
    )
  })
})
