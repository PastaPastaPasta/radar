import { useSyncExternalStore } from 'react'
import type { JsonStore } from '@/lib/json-store'
import { asNetworkId as parseNetworkId, type NetworkId } from '@/lib/network'

/** A network id read back from storage, or undefined when it is not one. */
export const asNetworkId = (v: unknown): NetworkId | undefined =>
  typeof v === 'string' ? parseNetworkId(v) : undefined

export function useJsonStore<T>(store: JsonStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}
