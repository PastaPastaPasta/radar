import { useSyncExternalStore } from 'react'
import type { JsonStore } from '@/lib/json-store'
import { asNetworkId as parseNetworkId, type NetworkId } from '@/lib/network'

/** A network id read back from storage, or undefined when it is not one. */
export const asNetworkId = (v: unknown): NetworkId | undefined =>
  typeof v === 'string' ? parseNetworkId(v) : undefined

/** The object a stored value is, or undefined when it is anything else. */
export const asRecord = (raw: unknown): Record<string, unknown> | undefined =>
  typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : undefined

/** A time read back from storage; 0 when it is not a finite number. */
export const asTimestamp = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0

export function useJsonStore<T>(store: JsonStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}
