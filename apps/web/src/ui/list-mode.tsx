import { t } from '@lingui/core/macro'
import { useCallback, useId, useSyncExternalStore } from 'react'
import { createJsonStore, type JsonStore } from '@/lib/json-store'
import { LIMITS, type Limit } from '@/lib/search-schemas'
import { SegFilter } from './table-tools'

export type ListModeKind = 'pages' | 'scroll'

export interface ListMode {
  mode: ListModeKind
  limit: Limit
}

export interface ListModeState extends ListMode {
  setMode: (mode: ListModeKind) => void
  setLimit: (limit: Limit) => void
}

const DEFAULT: ListMode = { mode: 'pages', limit: 25 }
const KEY_PREFIX = 'radar.list.'

const stores = new Map<string, JsonStore<ListMode>>()

function parse(raw: unknown): ListMode {
  const v =
    typeof raw === 'object' && raw !== null ? (raw as { mode?: unknown; limit?: unknown }) : {}
  return {
    mode: v.mode === 'scroll' ? 'scroll' : 'pages',
    limit: LIMITS.find((l) => l === v.limit) ?? DEFAULT.limit,
  }
}

function storeOf(listId: string): JsonStore<ListMode> {
  let store = stores.get(listId)
  if (!store) {
    store = createJsonStore(KEY_PREFIX + listId, parse)
    stores.set(listId, store)
  }
  return store
}

/** How one list is shown, remembered per list in `localStorage` (`radar.list.<listId>`) and shared across tabs. */
export function useListMode(listId: string): ListModeState {
  const store = storeOf(listId)
  const value = useSyncExternalStore(store.subscribe, store.get, store.get)
  const setMode = useCallback(
    (mode: ListModeKind) => {
      store.set({ ...store.get(), mode })
    },
    [store],
  )
  const setLimit = useCallback(
    (limit: Limit) => {
      store.set({ ...store.get(), limit })
    },
    [store],
  )
  return { ...value, setMode, setLimit }
}

export interface ListModeToggleProps {
  listId: string
}

export function ListModeToggle({ listId }: ListModeToggleProps) {
  const { mode, limit, setMode, setLimit } = useListMode(listId)
  const selectId = useId()
  return (
    <>
      <SegFilter
        label={t`List view`}
        value={mode}
        onChange={(id) => {
          setMode(id === 'scroll' ? 'scroll' : 'pages')
        }}
        options={[
          { id: 'pages', label: t`Pages` },
          { id: 'scroll', label: t`Scroll` },
        ]}
      />
      <label
        htmlFor={selectId}
        className="inline-flex items-center gap-1.5 text-[length:var(--dh-fs-sm)] text-ink-2"
      >
        {mode === 'scroll' ? t`Rows per load` : t`Rows per page`}
        <select
          id={selectId}
          className="dh-select dh-select--sm"
          value={limit}
          onChange={(e) => {
            const next = LIMITS.find((l) => l === Number(e.target.value))
            if (next !== undefined) setLimit(next)
          }}
        >
          {LIMITS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>
    </>
  )
}
