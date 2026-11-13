import type { NetworkId } from '@/lib/network'
import { createJsonStore, type JsonStore } from '@/lib/json-store'
import { asNetworkId, useJsonStore } from './local-store'

export const SAVED_KEY = 'radar.saved'

export interface SavedItem {
  net: NetworkId
  kind: 'identity' | 'contract' | 'token'
  id: string
  label?: string
  savedAt: number
}

/** What names a saved item: the same id on another network is another item. */
export type SavedKey = Pick<SavedItem, 'net' | 'kind' | 'id'>

const KINDS: readonly SavedItem['kind'][] = ['identity', 'contract', 'token']
function parseItem(raw: unknown): SavedItem | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  const net = asNetworkId(r.net)
  const kind = KINDS.find((k) => k === r.kind)
  if (!net || !kind || typeof r.id !== 'string' || r.id === '') return undefined
  return {
    net,
    kind,
    id: r.id,
    ...(typeof r.label === 'string' && r.label !== '' ? { label: r.label } : {}),
    savedAt: typeof r.savedAt === 'number' && Number.isFinite(r.savedAt) ? r.savedAt : 0,
  }
}

const parseSaved = (raw: unknown): SavedItem[] =>
  Array.isArray(raw) ? raw.flatMap((r) => parseItem(r) ?? []) : []

let store: JsonStore<SavedItem[]> | undefined
const saved = () => (store ??= createJsonStore(SAVED_KEY, parseSaved))

const same = (a: SavedKey, b: SavedKey) => a.net === b.net && a.kind === b.kind && a.id === b.id

/** Newest first. */
export function useSaved(): SavedItem[] {
  return useJsonStore(saved())
}

/** Saves the item, or moves one already saved to the top with the new label. */
export function saveItem(item: Omit<SavedItem, 'savedAt'>, now: number = Date.now()): void {
  const rest = saved()
    .get()
    .filter((s) => !same(s, item))
  saved().set([{ ...item, savedAt: now }, ...rest])
}

export function removeItem(key: SavedKey): void {
  const all = saved().get()
  const rest = all.filter((s) => !same(s, key))
  if (rest.length !== all.length) saved().set(rest)
}

/** Removes the items the scope names; an empty scope removes everything. */
export function clearSaved(scope: { net?: NetworkId; kind?: SavedItem['kind'] } = {}): void {
  const all = saved().get()
  const rest = all.filter(
    (s) =>
      (scope.net !== undefined && s.net !== scope.net) ||
      (scope.kind !== undefined && s.kind !== scope.kind),
  )
  if (rest.length !== all.length) saved().set(rest)
}

export function isSaved(key: SavedKey): boolean {
  return saved()
    .get()
    .some((s) => same(s, key))
}

export function useIsSaved(key: SavedKey): boolean {
  return useSaved().some((s) => same(s, key))
}

/** Forgets the in-memory copy so the next read comes from storage; tests use it after clearing storage. */
export function forgetSaved(): void {
  saved().forget()
}
