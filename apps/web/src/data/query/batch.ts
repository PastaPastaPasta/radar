import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { getActiveNetwork, subscribeActiveNetwork } from '../active-network'
import { stampOf, type Fact, type SourceId, type Sourced } from '../envelope'
import { SourceError } from '../errors'
import { describeFailure } from '../http'
import { healthRegistry } from '../health'
import type { NetworkId } from '@/lib/network'
import { queryKey, type QueryKeyOf } from './keys'
import { dataClass, type DataClass } from './stale'

export interface BatcherOptions<K, V> {
  /** Also the query resource, e.g. 'identity-balance'. */
  name: string
  source: SourceId
  /** SDK: 100 (Drive's max query limit). */
  maxBatch: number
  /** Default 15. */
  windowMs?: number
  run: (net: NetworkId, keys: K[]) => Promise<Sourced<Map<K, V | null>>>
  /** Name of the query-key param that carries the key. Default 'id'. */
  keyParam?: string
  /** Data class of each per-key query. Default 'live'. */
  dataClass?: DataClass
}

export interface Batcher<K, V> {
  readonly name: string
  readonly source: SourceId
  /** Coalesces calls made within the window into `run` calls of at most `maxBatch` keys. */
  fetch(net: NetworkId, key: K, signal?: AbortSignal): Promise<Sourced<V | null>>
  /** The per-key query that `useHydratedFact` and entity pages share. */
  queryOptions(
    net: NetworkId,
    key: K,
  ): UseQueryOptions<Sourced<V | null>, Error, Sourced<V | null>, QueryKeyOf>
}

interface Waiter<V> {
  resolve: (s: Sourced<V | null>) => void
  reject: (e: unknown) => void
}

function keyId(key: unknown): string {
  return typeof key === 'string'
    ? key
    : JSON.stringify(key, (_k, v: unknown) => (typeof v === 'bigint' ? `${v}n` : v))
}

const DEFAULT_WINDOW_MS = 15

export function createBatcher<K, V>(opts: BatcherOptions<K, V>): Batcher<K, V> {
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS
  const keyParam = opts.keyParam ?? 'id'
  const cls = dataClass(opts.dataClass ?? 'live')
  const cancelled = () =>
    new SourceError({
      source: opts.source,
      kind: 'aborted',
      message: 'The request was cancelled',
    })

  interface Pending {
    keys: Map<string, { key: K; waiters: Waiter<V>[] }>
    timer: ReturnType<typeof setTimeout> | undefined
  }
  const pending = new Map<NetworkId, Pending>()

  function flush(net: NetworkId): void {
    const batch = pending.get(net)
    if (!batch) return
    pending.delete(net)
    const entries = [...batch.keys.values()]
    for (let i = 0; i < entries.length; i += opts.maxBatch) {
      const chunk = entries.slice(i, i + opts.maxBatch)
      void runChunk(net, chunk)
    }
  }

  async function runChunk(
    net: NetworkId,
    chunk: { key: K; waiters: Waiter<V>[] }[],
  ): Promise<void> {
    let result: Sourced<Map<K, V | null>>
    const started = performance.now()
    try {
      result = await opts.run(
        net,
        chunk.map((e) => e.key),
      )
    } catch (error) {
      for (const e of chunk) for (const w of e.waiters) w.reject(error)
      return
    }
    const latencyMs = performance.now() - started
    const byId = new Map<string, V | null>()
    for (const [k, v] of result.data) byId.set(keyId(k), v)
    const stamp = stampOf(result)
    const missing: string[] = []
    for (const e of chunk) {
      const id = keyId(e.key)
      if (!byId.has(id)) {
        missing.push(id)
        const error = new SourceError({
          source: opts.source,
          kind: 'invalid-response',
          message: describeFailure(opts.source, 'invalid-response', `no answer for ${id}`),
        })
        for (const w of e.waiters) w.reject(error)
        continue
      }
      const value = byId.get(id) ?? null
      for (const w of e.waiters) w.resolve({ ...stamp, data: value })
    }
    if (missing.length > 0) {
      const message = describeFailure(
        opts.source,
        'invalid-response',
        `${opts.name}: no answer for ${missing.length} of ${chunk.length} keys`,
      )
      console.error(`[radar] ${opts.source} ${opts.name} batch omitted keys`, missing)
      healthRegistry.report(net, opts.source, {
        ok: false,
        latencyMs,
        kind: 'invalid-response',
        message,
      })
    }
  }

  function fetch(net: NetworkId, key: K, signal?: AbortSignal): Promise<Sourced<V | null>> {
    if (signal?.aborted) {
      return Promise.reject(cancelled())
    }
    return new Promise<Sourced<V | null>>((resolve, reject) => {
      let batch = pending.get(net)
      if (!batch) {
        batch = { keys: new Map(), timer: undefined }
        pending.set(net, batch)
        batch.timer = setTimeout(() => flush(net), windowMs)
      }
      const id = keyId(key)
      let entry = batch.keys.get(id)
      if (!entry) {
        entry = { key, waiters: [] }
        batch.keys.set(id, entry)
      }
      const onAbort = () => {
        const idx = entry.waiters.indexOf(waiter)
        if (idx >= 0) entry.waiters.splice(idx, 1)
        if (entry.waiters.length === 0 && batch.keys.get(id) === entry) {
          batch.keys.delete(id)
          if (batch.keys.size === 0) {
            clearTimeout(batch.timer)
            pending.delete(net)
          }
        }
        reject(cancelled())
      }
      const waiter: Waiter<V> = {
        resolve: (s) => {
          signal?.removeEventListener('abort', onAbort)
          resolve(s)
        },
        reject: (e: unknown) => {
          signal?.removeEventListener('abort', onAbort)
          reject(e instanceof Error ? e : new Error(String(e)))
        },
      }
      entry.waiters.push(waiter)
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  return {
    name: opts.name,
    source: opts.source,
    fetch,
    queryOptions: (net, key) => ({
      queryKey: queryKey(net, opts.source, opts.name, { [keyParam]: keyId(key) }),
      queryFn: ({ signal }) => fetch(net, key, signal),
      ...cls,
    }),
  }
}

/** Backend value first; the SDK value replaces it when the batch lands. */
export function useHydratedFact<K, V>(
  batcher: Batcher<K, V>,
  key: K,
  backend: Fact<V> | undefined,
): Fact<V> | undefined {
  const net = useSyncExternalStore(subscribeActiveNetwork, getActiveNetwork, getActiveNetwork)
  const query = useQuery(batcher.queryOptions(net, key))
  const hydrated = query.data
  if (hydrated && hydrated.data !== null) {
    return { value: hydrated.data, stamp: stampOf(hydrated) }
  }
  return backend
}
