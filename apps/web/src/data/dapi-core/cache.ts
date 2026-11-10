import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { isDevnet, type NetworkId } from '@/lib/network'
import type { NodeInfo, NodeListStore } from './discovery'

export const CACHE_DB = 'radar-core'
export const CACHE_MAX_BYTES = 200 * 1024 * 1024
export const CACHE_TRIM_TO_BYTES = 150 * 1024 * 1024
export const CACHE_TRIM_EVERY_MS = 10 * 60_000

export interface CachedBlock {
  hash: string
  height: number
  bytes: Uint8Array
}
export interface CachedTx {
  txid: string
  bytes: Uint8Array
  blockHash: string
  height: number
  isInstantLocked: boolean
  isChainLocked: true
}
export interface CachedHeader {
  height: number
  /** The 80-byte header. */
  header: Uint8Array
  hash: string
}

type StoreName = 'blocks' | 'heights' | 'txs' | 'headers'

interface LruEntry {
  id: string
  store: StoreName
  key: string
  size: number
  lastRead: number
}

interface RadarCoreDb extends DBSchema {
  blocks: { key: string; value: { bytes: Uint8Array; height: number } }
  heights: { key: string; value: { hash: string } }
  txs: {
    key: string
    value: { bytes: Uint8Array; blockHash: string; height: number; isInstantLocked: boolean }
  }
  headers: { key: string; value: { header: Uint8Array; hash: string } }
  meta: { key: string; value: { nodes: NodeInfo[]; at: number } }
  lru: { key: string; value: LruEntry; indexes: { lastRead: number } }
}

/**
 * Immutable Core answers kept in IndexedDB (§4.5). Only what is at or below the best ChainLock is written;
 * a hit costs no request. Devnets are not cached: a devnet can be rebuilt under the same name.
 * Every method resolves quietly when storage is missing, full or blocked; a failed write turns writes off for the session.
 */
export class CoreCache implements NodeListStore {
  private db: Promise<IDBPDatabase<RadarCoreDb> | undefined> | undefined
  private writesOff = false
  private readonly touched = new Set<string>()
  private total = 0
  private trimming = false
  private timer: ReturnType<typeof setInterval> | undefined

  constructor(
    private readonly now: () => number = Date.now,
    private readonly open: () => Promise<IDBPDatabase<RadarCoreDb>> = () =>
      openDB<RadarCoreDb>(CACHE_DB, 1, {
        upgrade(db) {
          for (const name of ['blocks', 'heights', 'txs', 'headers', 'meta'] as const) {
            db.createObjectStore(name)
          }
          db.createObjectStore('lru', { keyPath: 'id' }).createIndex('lastRead', 'lastRead')
        },
      }),
  ) {}

  private handle(): Promise<IDBPDatabase<RadarCoreDb> | undefined> {
    this.db ??= this.open().then(
      async (db) => {
        this.total = await this.sumSizes(db)
        void this.trim()
        this.timer ??= setInterval(() => void this.trim(), CACHE_TRIM_EVERY_MS)
        ;(this.timer as { unref?: () => void }).unref?.()
        return db
      },
      () => {
        this.writesOff = true
        return undefined
      },
    )
    return this.db
  }

  private async sumSizes(db: IDBPDatabase<RadarCoreDb>): Promise<number> {
    let sum = 0
    let cursor = await db.transaction('lru').store.openCursor()
    while (cursor) {
      sum += cursor.value.size
      cursor = await cursor.continue()
    }
    return sum
  }

  private enabled(net: NetworkId): boolean {
    return !isDevnet(net)
  }

  private touch(db: IDBPDatabase<RadarCoreDb>, store: StoreName, key: string): void {
    const id = `${store}|${key}`
    if (this.touched.has(id)) return
    this.touched.add(id)
    void (async () => {
      const tx = db.transaction('lru', 'readwrite')
      const entry = await tx.store.get(id)
      if (entry) await tx.store.put({ ...entry, lastRead: this.now() })
      await tx.done
    })().catch(() => undefined)
  }

  private async read<S extends StoreName>(
    net: NetworkId,
    store: S,
    key: string,
  ): Promise<RadarCoreDb[S]['value'] | undefined> {
    if (!this.enabled(net)) return undefined
    const db = await this.handle()
    if (!db) return undefined
    try {
      const value = await db.get<S>(store, `${net}:${key}`)
      if (value) this.touch(db, store, `${net}:${key}`)
      return value
    } catch {
      return undefined
    }
  }

  private async write(
    net: NetworkId,
    puts: { store: StoreName; key: string; value: unknown; size: number }[],
  ): Promise<void> {
    if (!this.enabled(net) || this.writesOff || puts.length === 0) return
    const db = await this.handle()
    if (!db || this.writesOff) return
    try {
      const tx = db.transaction([...new Set(puts.map((p) => p.store)), 'lru'], 'readwrite')
      let added = 0
      for (const p of puts) {
        const key = `${net}:${p.key}`
        const id = `${p.store}|${key}`
        const known = await tx.objectStore('lru').get(id)
        await tx.objectStore(p.store).put(p.value as never, key)
        await tx
          .objectStore('lru')
          .put({ id, store: p.store, key, size: p.size, lastRead: this.now() })
        added += p.size - (known?.size ?? 0)
      }
      await tx.done
      this.total += added
      if (this.total > CACHE_MAX_BYTES) void this.trim()
    } catch {
      // A full or blocked store stops writing for this visit; reads keep working.
      this.writesOff = true
    }
  }

  // ---- blocks ---------------------------------------------------------------

  async getBlockByHash(net: NetworkId, hash: string): Promise<CachedBlock | undefined> {
    const row = await this.read(net, 'blocks', hash)
    return row && { hash, height: row.height, bytes: row.bytes }
  }

  async getBlockByHeight(net: NetworkId, height: number): Promise<CachedBlock | undefined> {
    const row = await this.read(net, 'heights', String(height))
    return row ? this.getBlockByHash(net, row.hash) : undefined
  }

  putBlock(net: NetworkId, block: CachedBlock): Promise<void> {
    return this.write(net, [
      {
        store: 'blocks',
        key: block.hash,
        value: { bytes: block.bytes, height: block.height },
        size: block.bytes.length + 64,
      },
      { store: 'heights', key: String(block.height), value: { hash: block.hash }, size: 96 },
    ])
  }

  // ---- transactions ---------------------------------------------------------

  async getTx(net: NetworkId, txid: string): Promise<CachedTx | undefined> {
    const row = await this.read(net, 'txs', txid)
    return row && { txid, ...row, isChainLocked: true }
  }

  putTx(net: NetworkId, tx: CachedTx): Promise<void> {
    return this.write(net, [
      {
        store: 'txs',
        key: tx.txid,
        value: {
          bytes: tx.bytes,
          blockHash: tx.blockHash,
          height: tx.height,
          isInstantLocked: tx.isInstantLocked,
        },
        size: tx.bytes.length + 128,
      },
    ])
  }

  // ---- headers --------------------------------------------------------------

  /** Every header of the range, or nothing when any is missing. */
  async getHeaders(
    net: NetworkId,
    from: number,
    count: number,
  ): Promise<CachedHeader[] | undefined> {
    if (!this.enabled(net)) return undefined
    const out: CachedHeader[] = []
    for (let height = from; height < from + count; height++) {
      const row = await this.read(net, 'headers', String(height))
      if (!row) return undefined
      out.push({ height, ...row })
    }
    return out
  }

  putHeaders(net: NetworkId, headers: CachedHeader[]): Promise<void> {
    return this.write(
      net,
      headers.map((h) => ({
        store: 'headers' as const,
        key: String(h.height),
        value: { header: h.header, hash: h.hash },
        size: h.header.length + 96,
      })),
    )
  }

  // ---- node list (meta) -----------------------------------------------------

  async get(net: NetworkId): Promise<{ nodes: NodeInfo[]; at: number } | undefined> {
    const db = await this.handle()
    try {
      return await db?.get('meta', `${net}:nodes`)
    } catch {
      return undefined
    }
  }

  async put(net: NetworkId, nodes: NodeInfo[], at: number): Promise<void> {
    const db = await this.handle()
    try {
      await db?.put('meta', { nodes, at }, `${net}:nodes`)
    } catch {
      // The node list is cheap to fetch again.
    }
  }

  // ---- size -----------------------------------------------------------------

  /** Least recently read entries go first, until the cache is back under its target. */
  async trim(): Promise<void> {
    if (this.trimming) return
    const db = await this.handle()
    if (!db) return
    this.trimming = true
    try {
      if (this.total <= CACHE_MAX_BYTES) return
      let cursor = await db.transaction('lru').store.index('lastRead').openCursor()
      const doomed: LruEntry[] = []
      let remaining = this.total
      while (cursor && remaining > CACHE_TRIM_TO_BYTES) {
        doomed.push(cursor.value)
        remaining -= cursor.value.size
        cursor = await cursor.continue()
      }
      for (let i = 0; i < doomed.length; i += 200) {
        const batch = doomed.slice(i, i + 200)
        const tx = db.transaction([...new Set(batch.map((e) => e.store)), 'lru'], 'readwrite')
        await Promise.all([
          ...batch.map((e) => tx.objectStore(e.store).delete(e.key)),
          ...batch.map((e) => tx.objectStore('lru').delete(e.id)),
        ])
        await tx.done
      }
      this.total = remaining
    } catch {
      // Trimming is best effort.
    } finally {
      this.trimming = false
    }
  }

  /** Test hook: the bytes the cache believes it holds. */
  get bytes(): number {
    return this.total
  }
}

let shared: CoreCache | undefined

/** The one cache of this visit: the transport keeps the node list in it, the Core façade the immutable answers. */
export function sharedCoreCache(): CoreCache {
  return (shared ??= new CoreCache())
}
