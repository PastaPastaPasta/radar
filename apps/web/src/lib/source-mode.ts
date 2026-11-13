/**
 * Which backends Radar may contact. `decentralized` allows only DAPI nodes and the Platform SDK: no hosted index,
 * crawler API or price feed is asked for anything.
 */
export type SourceMode = 'all' | 'decentralized'

export const SOURCE_MODE_KEY = 'radar.sources'
/** `?sources=decentralized` turns the mode on for a visit, whatever is remembered. */
export const SOURCES_PARAM = 'sources'
export const DECENTRALIZED_PARAM = 'decentralized'

export interface SourceModeState {
  /** The mode in force: the link's when it names one, else the remembered choice. */
  mode: SourceMode
  /** The choice kept in this browser. */
  remembered: SourceMode
  /** The mode is on because the address says so, not (only) because it is remembered. */
  fromLink: boolean
}

function readRemembered(): SourceMode {
  try {
    return globalThis.localStorage?.getItem(SOURCE_MODE_KEY) === DECENTRALIZED_PARAM
      ? 'decentralized'
      : 'all'
  } catch {
    return 'all'
  }
}

function readLink(): boolean {
  if (typeof location === 'undefined') return false
  return new URLSearchParams(location.search).get(SOURCES_PARAM) === DECENTRALIZED_PARAM
}

const listeners = new Set<() => void>()
let link: boolean | undefined
let snapshot: SourceModeState | undefined

/** A stable object until the mode changes, for `useSyncExternalStore`. */
export function getSourceModeState(): SourceModeState {
  link ??= readLink()
  const remembered = readRemembered()
  const mode: SourceMode = link || remembered === 'decentralized' ? 'decentralized' : 'all'
  if (snapshot?.mode !== mode || snapshot.remembered !== remembered || snapshot.fromLink !== link) {
    snapshot = { mode, remembered, fromLink: link }
  }
  return snapshot
}

/** True while only DAPI and the Platform SDK may be contacted. Read by every hosted client before any request. */
export const decentralizedOnly = (): boolean => getSourceModeState().mode === 'decentralized'

function emitIfChanged(before: SourceModeState): void {
  if (getSourceModeState() === before) return
  for (const cb of [...listeners]) cb()
}

/** Remembers the choice in this browser. A link that turns the mode on still does, until the address drops it. */
export function writeSourceMode(mode: SourceMode): void {
  const before = getSourceModeState()
  try {
    if (mode === 'decentralized') globalThis.localStorage?.setItem(SOURCE_MODE_KEY, mode)
    else globalThis.localStorage?.removeItem(SOURCE_MODE_KEY)
  } catch {
    // storage unavailable: the choice cannot be kept, and the link form still works
  }
  emitIfChanged(before)
}

/** What the address being loaded says: the router calls this before a route's loaders and queries run. */
export function setSourceModeFromLink(value: string | undefined): void {
  const before = getSourceModeState()
  link = value === DECENTRALIZED_PARAM
  emitIfChanged(before)
}

export function subscribeSourceMode(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
