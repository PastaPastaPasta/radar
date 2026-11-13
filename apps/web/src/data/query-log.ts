import type { NetworkId } from '@/lib/network'
import type { SourceId } from './envelope'
import type { SourceErrorKind } from './errors'

export interface QueryLogEntry {
  id: number
  /** When the call finished, in ms since the epoch. */
  at: number
  net: NetworkId
  source: SourceId
  /** What was asked, without a query string or body: "GET /summary", "identities.fetch". */
  what: string
  ok: boolean
  kind?: SourceErrorKind
  tookMs: number
  /** The DAPI evonode that answered ("ip:port"), when there was one. */
  node?: string
  proved?: boolean
  /** Decentralized only mode refused the call before any network I/O. */
  refusedByMode?: boolean
}

export type QueryLogInput = Omit<QueryLogEntry, 'id' | 'at'> & { at?: number }

/** How many entries the log keeps and `snapshot` returns. */
export const QUERY_LOG_SIZE = 100

type Listener = () => void

function createQueryLog() {
  let entries: readonly QueryLogEntry[] = []
  let nextId = 1
  const listeners = new Set<Listener>()

  const emit = () => {
    for (const cb of [...listeners]) cb()
  }

  return {
    push(entry: QueryLogInput): void {
      const row: QueryLogEntry = { ...entry, id: nextId++, at: entry.at ?? Date.now() }
      entries = [...entries, row].slice(-QUERY_LOG_SIZE)
      emit()
    },
    /** The newest entries, oldest first. The same array until the next change, for `useSyncExternalStore`. */
    snapshot: (): readonly QueryLogEntry[] => entries,
    subscribe(cb: Listener): () => void {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    clear(): void {
      if (entries.length === 0) return
      entries = []
      emit()
    },
  }
}

export const queryLog = createQueryLog()
