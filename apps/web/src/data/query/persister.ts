import type { Query } from '@tanstack/query-core'
import { experimental_createQueryPersister } from '@tanstack/query-persist-client-core'
import { createStore, del, entries, get, set, type UseStore } from 'idb-keyval'

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
}

const identity = <T>(v: T): T => v

/**
 * Per-query persister over IndexedDB. Serialisation is the identity so structured clone keeps
 * bigint, Map and Uint8Array. Only queries marked `meta.persist` (immutable and structural) are kept.
 */
export function createPersister({ appVersion, store, maxAge }: PersisterOptions) {
  const idb = store ?? createStore('radar-query', 'queries')
  return experimental_createQueryPersister({
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
}
