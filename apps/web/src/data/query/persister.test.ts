import 'fake-indexeddb/auto'
import { QueryClient } from '@tanstack/react-query'
import { createStore, type UseStore } from 'idb-keyval'
import { describe, expect, it, vi } from 'vitest'
import { dataClass } from './stale'
import {
  clearPersistedNetwork,
  createPersister,
  shouldPersist,
  SCHEMA_VERSION,
  withDataClass,
} from './persister'

let n = 0
const freshStore = () => createStore(`test-${n++}`, 'q')

function client(persister: ReturnType<typeof createPersister>) {
  return new QueryClient({
    defaultOptions: {
      queries: { persister: persister.persisterFn, retry: false, gcTime: Infinity },
    },
  })
}

describe('shouldPersist', () => {
  it('keeps only queries marked in meta', () => {
    expect(shouldPersist({ meta: { persist: true } })).toBe(true)
    expect(shouldPersist({ meta: { persist: false } })).toBe(false)
    expect(shouldPersist({ meta: undefined })).toBe(false)
    expect(shouldPersist({ meta: { persist: 'yes' } })).toBe(false)
  })

  it('exposes a schema version for the cache buster', () => {
    expect(SCHEMA_VERSION).toBeGreaterThan(0)
  })
})

const settle = () => new Promise((r) => setTimeout(r, 30))

describe('persister', () => {
  const value = {
    amount: 12_345_678_901_234_567_890n,
    bytes: new Uint8Array([1, 2, 3]),
    m: new Map([['k', 1n]]),
  }

  it('round-trips bigint, Uint8Array and Map through IndexedDB', async () => {
    const store = freshStore()
    const key = ['mainnet', 'sdk', 'identity', { id: 'a' }] as const
    let calls = 0

    const first = client(createPersister({ appVersion: '1', store }))
    await first.fetchQuery({
      queryKey: key,
      queryFn: () => {
        calls++
        return Promise.resolve(value)
      },
      meta: { persist: true },
    })
    expect(calls).toBe(1)
    await settle()

    const second = client(createPersister({ appVersion: '1', store }))
    const restored = await second.fetchQuery({
      queryKey: key,
      queryFn: () => {
        calls++
        return Promise.resolve({ amount: 0n, bytes: new Uint8Array(), m: new Map() })
      },
      meta: { persist: true },
      staleTime: Infinity,
    })
    expect(calls).toBe(1)
    expect(restored.amount).toBe(value.amount)
    expect([...restored.bytes]).toEqual([...value.bytes])
    expect(restored.m.get('k')).toBe(1n)
  })

  it('does not store queries without meta.persist', async () => {
    const store = freshStore()
    const key = ['mainnet', 'pe', 'status'] as const
    let calls = 0
    const queryFn = () => Promise.resolve(++calls)

    await client(createPersister({ appVersion: '1', store })).fetchQuery({ queryKey: key, queryFn })
    await settle()
    await client(createPersister({ appVersion: '1', store })).fetchQuery({
      queryKey: key,
      queryFn,
      staleTime: Infinity,
    })
    expect(calls).toBe(2)
  })

  it('still runs the query when the database cannot be opened', async () => {
    const store: UseStore = () => Promise.reject(new DOMException('closed', 'InvalidStateError'))
    const value = await client(createPersister({ appVersion: '1', store })).fetchQuery({
      queryKey: ['mainnet', 'sdk', 'identity', { id: 'z' }],
      queryFn: () => Promise.resolve(7),
      meta: { persist: true },
    })
    expect(value).toBe(7)
  })

  it('discards entries written by another app version', async () => {
    const store = freshStore()
    const key = ['mainnet', 'sdk', 'identity', { id: 'b' }] as const
    let calls = 0
    const queryFn = () => Promise.resolve(++calls)
    const opts = { queryKey: key, queryFn, meta: { persist: true }, staleTime: Infinity }

    await client(createPersister({ appVersion: '1', store })).fetchQuery(opts)
    await settle()
    await client(createPersister({ appVersion: '2', store })).fetchQuery(opts)
    expect(calls).toBe(2)
  })

  it('discards entries older than maxAge', async () => {
    const store = freshStore()
    const key = ['mainnet', 'sdk', 'identity', { id: 'c' }] as const
    let calls = 0
    const queryFn = () => Promise.resolve(++calls)
    const opts = { queryKey: key, queryFn, meta: { persist: true }, staleTime: Infinity }

    await client(createPersister({ appVersion: '1', store, maxAge: 1 })).fetchQuery(opts)
    await settle()
    await client(createPersister({ appVersion: '1', store, maxAge: 1 })).fetchQuery(opts)
    expect(calls).toBe(2)
  })

  it('stores a persisted query and gc removes it once busted', async () => {
    const store = freshStore()
    const key = ['mainnet', 'sdk', 'identity', { id: 'd' }] as const
    const opts = { queryKey: key, queryFn: () => Promise.resolve(1), meta: { persist: true } }

    await client(createPersister({ appVersion: '1', store })).fetchQuery(opts)
    await settle()
    const stale = createPersister({ appVersion: '2', store })
    await stale.persisterGc()
    const reader = client(stale)
    let calls = 0
    await reader.fetchQuery({
      ...opts,
      queryFn: () => Promise.resolve(++calls),
      staleTime: Infinity,
    })
    expect(calls).toBe(1)
  })
})

describe('withDataClass', () => {
  const stamp = { source: 'pe' as const, asOf: 1, fetchedAt: 2, proved: false, data: 7 }

  function run(options: ReturnType<typeof dataClass>, value: unknown) {
    const qc = new QueryClient({
      defaultOptions: { queries: { persister: withDataClass(), retry: false } },
    })
    return qc.fetchQuery({ queryKey: ['mainnet', 'pe', 'x'], queryFn: () => value, ...options })
  }

  it('stamps the class stale age onto a sourced answer', async () => {
    expect(await run(dataClass('structural'), stamp)).toMatchObject({
      data: 7,
      staleAfterMs: 20 * 60_000,
    })
    expect(await run(dataClass('latest'), stamp)).toMatchObject({ staleAfterMs: 40_000 })
  })

  it('leaves a query without a class, and a value without a stamp, alone', async () => {
    expect(await run({} as ReturnType<typeof dataClass>, stamp)).toBe(stamp)
    const plain = { rows: [1] }
    expect(await run(dataClass('index'), plain)).toBe(plain)
  })

  it('stamps restored answers too', async () => {
    const store = freshStore()
    const key = ['mainnet', 'pe', 'y'] as const
    const first = client(createPersister({ appVersion: '1', store, gc: false }))
    await first.fetchQuery({ queryKey: key, queryFn: () => stamp, ...dataClass('structural') })
    await settle()
    const second = client(createPersister({ appVersion: '1', store, gc: false }))
    const restored = await second.fetchQuery({
      queryKey: key,
      queryFn: () => {
        throw new Error('should have been restored')
      },
      ...dataClass('structural'),
    })
    expect(restored).toMatchObject({ staleAfterMs: 20 * 60_000 })
  })
})

describe('persister GC', () => {
  it('sweeps expired entries once the browser is idle', async () => {
    const store = freshStore()
    const old = client(createPersister({ appVersion: '1', store, maxAge: 1, gc: false }))
    const key = ['mainnet', 'sdk', 'old'] as const
    await old.fetchQuery({ queryKey: key, queryFn: () => 1, ...dataClass('immutable') })
    await settle()
    await new Promise((r) => setTimeout(r, 10))
    const idle: (() => void)[] = []
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => idle.push(cb))
    createPersister({ appVersion: '1', store, maxAge: 1 })
    expect(idle).toHaveLength(1)
    idle[0]!()
    await settle()
    const { entries } = await import('idb-keyval')
    expect(await entries(store)).toHaveLength(0)
    vi.unstubAllGlobals()
  })
})

describe('clearPersistedNetwork', () => {
  it('removes one network and keeps the others', async () => {
    const store = freshStore()
    const qc = client(createPersister({ appVersion: '1', store, gc: false }))
    for (const net of ['devnet-ruby', 'mainnet'] as const) {
      await qc.fetchQuery({
        queryKey: [net, 'sdk', 'identity'],
        queryFn: () => 1,
        ...dataClass('immutable'),
      })
    }
    await settle()
    const { entries } = await import('idb-keyval')
    expect(await entries(store)).toHaveLength(2)
    await clearPersistedNetwork('devnet-ruby', store)
    const left = await entries(store)
    expect(left).toHaveLength(1)
    expect((left[0]![1] as { queryKey: unknown[] }).queryKey[0]).toBe('mainnet')
  })
})
