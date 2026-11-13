import { t } from '@lingui/core/macro'
import { useCallback, useId, useSyncExternalStore } from 'react'
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

const listeners = new Set<() => void>()
// Where a choice lives when storage is blocked: it then lasts until the page closes.
const memory = new Map<string, string>()
const parsed = new Map<string, { raw: string | null; value: ListMode }>()

function readRaw(key: string): string | null {
  const kept = memory.get(key)
  if (kept !== undefined) return kept
  try {
    return globalThis.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeRaw(key: string, raw: string): void {
  try {
    globalThis.localStorage.setItem(key, raw)
    memory.delete(key)
  } catch {
    memory.set(key, raw)
  }
}

function parse(raw: string | null): ListMode {
  if (raw === null) return DEFAULT
  try {
    const v = JSON.parse(raw) as { mode?: unknown; limit?: unknown }
    return {
      mode: v.mode === 'scroll' ? 'scroll' : 'pages',
      limit: LIMITS.find((l) => l === v.limit) ?? DEFAULT.limit,
    }
  } catch {
    return DEFAULT
  }
}

// useSyncExternalStore needs the same object back while the stored text is unchanged.
function snapshot(listId: string): ListMode {
  const key = KEY_PREFIX + listId
  const raw = readRaw(key)
  const hit = parsed.get(key)
  if (hit?.raw === raw) return hit.value
  const value = parse(raw)
  parsed.set(key, { raw, value })
  return value
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith(KEY_PREFIX)) cb()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', onStorage)
  }
}

function update(listId: string, patch: Partial<ListMode>): void {
  writeRaw(KEY_PREFIX + listId, JSON.stringify({ ...snapshot(listId), ...patch }))
  for (const l of listeners) l()
}

/** How one list is shown, remembered per list in `localStorage` (`radar.list.<listId>`) and shared across tabs. */
export function useListMode(listId: string): ListModeState {
  const value = useSyncExternalStore(
    subscribe,
    () => snapshot(listId),
    () => DEFAULT,
  )
  const setMode = useCallback(
    (mode: ListModeKind) => {
      update(listId, { mode })
    },
    [listId],
  )
  const setLimit = useCallback(
    (limit: Limit) => {
      update(listId, { limit })
    },
    [listId],
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
