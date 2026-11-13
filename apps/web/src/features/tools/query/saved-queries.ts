import { useCallback, useSyncExternalStore } from 'react'
import {
  SAVED_QUERIES_KEY,
  loadSavedQueries,
  updateSavedQueries,
  type SavedQuery,
} from './query-workspace'

const listeners = new Set<() => void>()
let version = 0

function notify(): void {
  version++
  for (const cb of [...listeners]) cb()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key === SAVED_QUERIES_KEY || e.key === null) notify()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', onStorage)
  }
}

export type SaveOutcome = 'saved' | 'limit' | 'unavailable'

/** The queries saved in this browser for one network and contract, kept in `radar.queries` (never sent anywhere). */
export function useSavedQueries(net: string, contractId: string) {
  useSyncExternalStore(subscribe, () => version)
  const queries = loadSavedQueries(net, contractId)

  const save = useCallback(
    (name: string, sql: string): SaveOutcome => {
      const trimmed = name.trim()
      const result = updateSavedQueries(net, contractId, (list) => [
        ...list.filter((q) => q.name !== trimmed),
        { name: trimmed, sql },
      ])
      if (result.status === 'saved') notify()
      return result.status
    },
    [net, contractId],
  )

  const remove = useCallback(
    (name: string): SaveOutcome => {
      const result = updateSavedQueries(net, contractId, (list) =>
        list.filter((q: SavedQuery) => q.name !== name),
      )
      if (result.status === 'saved') notify()
      return result.status
    },
    [net, contractId],
  )

  return { queries, save, remove }
}
