import type { QueryClient } from '@tanstack/query-core'
import { createStore, del, entries } from 'idb-keyval'
import { proofStore } from './proof-store'

/** A key whose answer came from the Platform SDK: `[network, 'sdk', …]`. */
export const isSdkKey = (key: readonly unknown[]): boolean => key[1] === 'sdk'

/** Forgets every SDK answer in memory and in the browser's stored copy, and the proofs held for the inspector. */
export async function clearSdkCache(client: QueryClient): Promise<void> {
  await client.cancelQueries({ predicate: (q) => isSdkKey(q.queryKey) })
  client.removeQueries({ predicate: (q) => isSdkKey(q.queryKey) })
  proofStore.clear()
  if (typeof indexedDB === 'undefined') return
  const idb = createStore('radar-query', 'queries')
  const all = await entries(idb).catch(() => [])
  await Promise.all(
    all.flatMap(([key, value]) => {
      const queryKey = (value as { queryKey?: unknown } | undefined)?.queryKey
      return Array.isArray(queryKey) && isSdkKey(queryKey)
        ? [del(key, idb).catch(() => undefined)]
        : []
    }),
  )
}
