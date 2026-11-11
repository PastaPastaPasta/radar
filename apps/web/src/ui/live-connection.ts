import { t } from '@lingui/core/macro'
import { useSyncExternalStore } from 'react'
import { formatDate } from '@/lib/format'

/**
 * What the page knows about its live Core connection: `live` (the header stream is open), `connecting` (opening it),
 * `reconnecting` (it dropped), `polling` (the stream keeps failing, so the tip is read every 30 s) or `stopped`
 * (nothing reaches the page, or the browser is offline).
 */
export type ConnectionState = 'live' | 'connecting' | 'reconnecting' | 'polling' | 'stopped'

export interface LiveConnection {
  state: ConnectionState
  /** When the last tip or ChainLock arrived, or when the connection stopped: the "stopped since" time. */
  lastEventAt?: number
}

/** Until a feed reports, a page is as live as its own data says: tests and the kit render without a stream. */
const UP: LiveConnection = { state: 'live' }

let current: LiveConnection = UP
const listeners = new Set<() => void>()

export function setLiveConnection(next: LiveConnection): void {
  if (next.state === current.state && next.lastEventAt === current.lastEventAt) return
  current = next
  for (const cb of [...listeners]) cb()
}

export function resetLiveConnection(): void {
  setLiveConnection(UP)
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useLiveConnection(): LiveConnection {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => UP,
  )
}

export type LiveDotState = 'live' | 'unknown' | 'stale' | 'down'

export interface LiveView {
  state: ConnectionState
  /** Which dot to draw. */
  dot: LiveDotState
  /** "Live", "Reconnecting…", "Stopped since 14:32". */
  word: string
  /** The same in a sentence, for a tooltip. */
  title: string
  /** True while the page is receiving updates. */
  up: boolean
}

function clock(ms: number): string {
  return formatDate(ms, { date: false, zone: false })
}

/** The word and dot for a connection state, so every "Live" on the page agrees. */
export function liveView({ state, lastEventAt }: LiveConnection): LiveView {
  switch (state) {
    case 'live':
      return {
        state,
        dot: 'live',
        word: t`Live`,
        title: t`New blocks reach this page as they happen.`,
        up: true,
      }
    case 'connecting':
      return {
        state,
        dot: 'unknown',
        word: t`Connecting…`,
        title: t`Opening the live connection.`,
        up: false,
      }
    case 'reconnecting':
      return {
        state,
        dot: 'stale',
        word: t`Reconnecting…`,
        title: t`The live connection dropped. Radar is opening it again.`,
        up: false,
      }
    case 'polling':
      return {
        state,
        dot: 'stale',
        word: t`Checking every 30 s`,
        title: t`The live connection keeps failing, so Radar asks for the latest block every 30 seconds.`,
        up: true,
      }
    case 'stopped': {
      const since = lastEventAt === undefined ? undefined : clock(lastEventAt)
      return {
        state,
        dot: 'down',
        word: since ? t`Stopped since ${since}` : t`Stopped`,
        title: since
          ? t`Live updates have stopped. The last update arrived at ${since}.`
          : t`Live updates have stopped.`,
        up: false,
      }
    }
  }
}

export function useLiveView(): LiveView {
  return liveView(useLiveConnection())
}
