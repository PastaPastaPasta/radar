import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CACHE_MAX_BYTES,
  CACHE_TRIM_TO_BYTES,
  CoreCache,
  INSTANT_LOCK_KEEP_MS,
} from '@/data/dapi-core/cache'

const bytes = (n: number, fill = 1) => new Uint8Array(n).fill(fill)

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

describe('CoreCache', () => {
  it('returns a block by hash and by height after it was stored', async () => {
    const cache = new CoreCache()
    await cache.putBlock('mainnet', { hash: 'aa', height: 10, bytes: bytes(100) })
    expect((await cache.getBlockByHash('mainnet', 'aa'))?.height).toBe(10)
    const byHeight = await cache.getBlockByHeight('mainnet', 10)
    expect(byHeight?.hash).toBe('aa')
    expect(Array.from(byHeight?.bytes ?? [])).toEqual(Array.from(bytes(100)))
    expect(await cache.getBlockByHeight('mainnet', 11)).toBeUndefined()
  })

  it('keeps networks apart', async () => {
    const cache = new CoreCache()
    await cache.putBlock('mainnet', { hash: 'aa', height: 10, bytes: bytes(10) })
    expect(await cache.getBlockByHash('testnet', 'aa')).toBeUndefined()
  })

  it('never caches a devnet', async () => {
    const cache = new CoreCache()
    await cache.putBlock('devnet-x', { hash: 'aa', height: 10, bytes: bytes(10) })
    expect(await cache.getBlockByHash('devnet-x', 'aa')).toBeUndefined()
    await cache.putHeaders('devnet-x', [{ height: 1, header: bytes(80), hash: 'h' }])
    expect(await cache.getHeaders('devnet-x', 1, 1)).toBeUndefined()
  })

  it('stores a transaction by its id', async () => {
    const cache = new CoreCache()
    await cache.putTx('mainnet', { txid: 'tt', bytes: bytes(200) })
    expect(await cache.getTx('mainnet', 'tt')).toMatchObject({ txid: 'tt' })
    expect(await cache.getTx('mainnet', 'zz')).toBeUndefined()
  })

  it('never lets a write without a lock clear one a node reported', async () => {
    const cache = new CoreCache()
    await cache.putTx('mainnet', {
      txid: 'tt',
      bytes: bytes(200),
      instantLock: true,
      instantLockAt: Date.now(),
    })
    await Promise.all([
      cache.putTx('mainnet', { txid: 'tt', bytes: bytes(200) }),
      cache.putTx('mainnet', { txid: 'tt', bytes: bytes(200) }),
    ])
    expect(await cache.getTx('mainnet', 'tt')).toMatchObject({ instantLock: true })
  })

  it('lets a lock lapse after 30 days, and trusts none written without a time', async () => {
    let now = 1_000_000
    const cache = new CoreCache(() => now)
    await cache.putTx('mainnet', {
      txid: 'tt',
      bytes: bytes(10),
      instantLock: true,
      instantLockAt: now,
    })
    expect((await cache.getTx('mainnet', 'tt'))?.instantLock).toBe(true)
    now += INSTANT_LOCK_KEEP_MS + 1
    expect((await cache.getTx('mainnet', 'tt'))?.instantLock).toBeUndefined()
    await cache.putTx('mainnet', { txid: 'tt', bytes: bytes(10) })
    expect((await cache.getTx('mainnet', 'tt'))?.instantLock).toBeUndefined()
    await cache.putTx('mainnet', { txid: 'uu', bytes: bytes(10), instantLock: true })
    expect((await cache.getTx('mainnet', 'uu'))?.instantLock).toBeUndefined()
  })

  it('returns a header range only when every header is there', async () => {
    const cache = new CoreCache()
    await cache.putHeaders(
      'mainnet',
      [1, 2, 3].map((h) => ({ height: h, header: bytes(80, h), hash: `h${h}` })),
    )
    expect((await cache.getHeaders('mainnet', 1, 3))?.map((h) => h.hash)).toEqual([
      'h1',
      'h2',
      'h3',
    ])
    expect(await cache.getHeaders('mainnet', 2, 3)).toBeUndefined()
  })

  it('keeps the discovered node list for the caller to age', async () => {
    const cache = new CoreCache()
    await cache.put('mainnet', [{ url: 'https://1.1.1.1:443', host: '1.1.1.1:443' }], 1234)
    expect(await cache.get('mainnet')).toEqual({
      nodes: [{ url: 'https://1.1.1.1:443', host: '1.1.1.1:443' }],
      at: 1234,
    })
  })

  it('trims the least recently read entries down to 150 MB once past 200 MB', async () => {
    let clock = 1
    const cache = new CoreCache(() => clock++)
    const chunk = 10 * 1024 * 1024
    const blocks = Math.ceil(CACHE_MAX_BYTES / chunk) + 1
    for (let i = 0; i < blocks; i++) {
      await cache.putBlock('mainnet', { hash: `h${i}`, height: i, bytes: bytes(chunk, i) })
    }
    await vi.waitFor(() => expect(cache.bytes).toBeLessThanOrEqual(CACHE_TRIM_TO_BYTES))
    expect(await cache.getBlockByHash('mainnet', 'h0')).toBeUndefined()
    expect(await cache.getBlockByHash('mainnet', `h${blocks - 1}`)).toBeDefined()
  }, 30_000)

  it('keeps reading when storage is unavailable', async () => {
    const cache = new CoreCache(Date.now, () => Promise.reject(new Error('blocked')))
    await cache.putBlock('mainnet', { hash: 'aa', height: 1, bytes: bytes(1) })
    expect(await cache.getBlockByHash('mainnet', 'aa')).toBeUndefined()
    expect(await cache.get('mainnet')).toBeUndefined()
  })
})
