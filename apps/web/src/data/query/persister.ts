import type { Query, QueryFunction, QueryFunctionContext } from '@tanstack/query-core'
import { experimental_createQueryPersister } from '@tanstack/query-persist-client-core'
import { createStore, del, entries, get, set, type UseStore } from 'idb-keyval'
import type { NetworkId } from '@/lib/network'
import type { SourceStamp } from '../envelope'
import { staleAfterMs, type DataClass } from './stale'

/** Bump when any DTO or schema changes shape; it is part of the persister's buster. */
export const SCHEMA_VERSION = 1

export const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export function shouldPersist(query: Pick<Query, 'meta'>): boolean {
  return query.meta?.persist === true
}

export interface PersisterOptions {
  appVersion: string
  store?: UseStore
  maxAge?: number
  /** Sweep expired and busted entries once the browser is idle. On by default. */
  gc?: boolean
}

type PersisterFn = (
  queryFn: QueryFunction,
  ctx: QueryFunctionContext,
  query: Query,
) => Promise<unknown>

function isStamped(value: unknown): value is SourceStamp {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.source === 'string' && typeof v.asOf === 'number' && typeof v.fetchedAt === 'number'
  )
}

/**
 * Wraps a query's persister so each stamped answer carries its data class's stale age. Restored
 * answers pass through it too. Queries without a class in `meta.dataClass` are left alone.
 */
export function withDataClass(inner?: PersisterFn): PersisterFn {
  return async (queryFn, ctx, query) => {
    const data = await (inner ? inner(queryFn, ctx, query) : queryFn(ctx))
    const cls = query.meta?.dataClass as DataClass | undefined
    if (!cls || !isStamped(data)) return data
    const staleAfter = staleAfterMs(cls)
    return data.staleAfterMs === staleAfter ? data : { ...data, staleAfterMs: staleAfter }
  }
}

function whenIdle(task: () => void): void {
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback
  if (idle) idle(task)
  else setTimeout(task, 2000)
}

const identity = <T>(v: T): T => v

/**
 * Per-query persister over IndexedDB. Serialisation is the identity so structured clone keeps
 * bigint, Map and Uint8Array. Only queries marked `meta.persist` (immutable and structural) are kept.
 */
export function createPersister({ appVersion, store, maxAge, gc = true }: PersisterOptions) {
  const idb = store ?? createStore('radar-query', 'queries')
  const persister = experimental_createQueryPersister({
    storage: {
      getItem: (key) => get(key, idb).catch(() => undefined),
      setItem: (key, value) => set(key, value, idb).catch(() => undefined),
      removeItem: (key) => del(key, idb).catch(() => undefined),
      entries: () =>
        entries(idb).then(
          (all) =>
            all.map(([k, v]): [string, unknown] => [
              typeof k === 'string' ? k : JSON.stringify(k),
              v,
            ]),
          () => [],
        ),
    },
    maxAge: maxAge ?? PERSIST_MAX_AGE_MS,
    buster: `${appVersion}:${SCHEMA_VERSION}`,
    serialize: identity as never,
    deserialize: identity as never,
    filters: { predicate: (query) => shouldPersist(query) },
  })
  if (gc) whenIdle(() => void persister.persisterGc().catch(() => undefined))
  return { ...persister, persisterFn: withDataClass(persister.persisterFn) }
}

/** Removes every persisted query of one network from IndexedDB. */
export async function clearPersistedNetwork(net: NetworkId, store?: UseStore): Promise<void> {
  if (!store && typeof indexedDB === 'undefined') return
  const idb = store ?? createStore('radar-query', 'queries')
  const all = await entries(idb).catch(() => [])
  await Promise.all(
    all.flatMap(([key, value]) => {
      const queryKey = (value as { queryKey?: unknown } | undefined)?.queryKey
      return Array.isArray(queryKey) && queryKey[0] === net
        ? [del(key, idb).catch(() => undefined)]
        : []
    }),
  )
}
