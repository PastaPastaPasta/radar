import { useSyncExternalStore } from 'react'
import type { NetworkId } from '@/lib/network'

const DEVNET = /^devnet-[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/** A network id read back from storage, or undefined when it is not one. */
export const asNetworkId = (v: unknown): NetworkId | undefined =>
  v === 'mainnet' || v === 'testnet' || (typeof v === 'string' && DEVNET.test(v))
    ? (v as NetworkId)
    : undefined

export interface JsonStore<T> {
  get: () => T
  set: (next: T) => void
  subscribe: (cb: () => void) => () => void
  /** Drops the remembered copy, so the next read comes from storage again. */
  forget: () => void
}

/**
 * One JSON value in localStorage, kept in step across tabs through the `storage` event. Every access is guarded: with
 * storage blocked or full, the value holds for this tab and everything keeps working.
 *
 * `parse` takes whatever the key holds (or `undefined`) and returns a well-formed value; it must return the same
 * object for the same input only if the caller wants that, since the store caches by the raw string.
 */
export function createJsonStore<T>(key: string, parse: (raw: unknown) => T): JsonStore<T> {
  const listeners = new Set<() => void>()
  let current: T | undefined
  let seen: string | null | undefined
  let tabOnly = false

  const notify = () => {
    for (const cb of [...listeners]) cb()
  }

  function get(): T {
    if (current !== undefined && tabOnly) return current
    let raw: string | null
    try {
      raw = globalThis.localStorage?.getItem(key) ?? null
    } catch {
      tabOnly = true
      return (current ??= parse(undefined))
    }
    if (current !== undefined && raw === seen) return current
    let value: unknown
    try {
      value = raw === null ? undefined : JSON.parse(raw)
    } catch {
      value = undefined
    }
    seen = raw
    current = parse(value)
    return current
  }

  function set(next: T): void {
    current = next
    try {
      const raw = JSON.stringify(next)
      globalThis.localStorage?.setItem(key, raw)
      seen = raw
    } catch {
      tabOnly = true
    }
    notify()
  }

  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== key) return
    tabOnly = false
    current = undefined
    notify()
  }

  function subscribe(cb: () => void): () => void {
    if (listeners.size === 0) globalThis.addEventListener?.('storage', onStorage)
    listeners.add(cb)
    return () => {
      listeners.delete(cb)
      if (listeners.size === 0) globalThis.removeEventListener?.('storage', onStorage)
    }
  }

  function forget(): void {
    current = undefined
    seen = undefined
    tabOnly = false
  }

  return { get, set, subscribe, forget }
}

export function useJsonStore<T>(store: JsonStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}
