/**
 * Whether the section is following the chain, from what its reads have done:
 * - `connecting`: no block read yet, and not for long;
 * - `live`: reads are answering and the newest block is recent;
 * - `quiet`: reads answer, but the newest block is old for this chain (Platform stalled, or every node asked is behind);
 * - `paused`: reads are failing, or none has answered for a while, or the browser is offline.
 */
export type LiveKind = 'connecting' | 'live' | 'quiet' | 'paused'

export interface LiveInputs {
  now: number
  /** When the section started reading. */
  startedAt: number
  /** When the last read answered. */
  lastOkAt?: number
  /** The last read failed (after its retries), and none has answered since. */
  failing: boolean
  online: boolean
  /** The page is visible: a hidden page does not read, so its silence is not a failure. */
  visible: boolean
  /** The newest block's time. */
  tipTimeMs?: number
  /** The time a block takes on this chain. */
  blockMs: number
}

/** A first read gets this long before the section says it can't get one. */
export const CONNECT_GRACE_MS = 25_000
/** Reads go every few seconds: none answering for this long means they are not getting through. */
export const SILENT_AFTER_MS = 45_000
/** No block for this many intervals, and at least `QUIET_MIN_MS`, is a quiet chain. */
export const QUIET_BLOCKS = 6
export const QUIET_MIN_MS = 6 * 60_000

export function liveKind(i: LiveInputs): LiveKind {
  if (!i.online) return 'paused'
  if (i.lastOkAt === undefined) {
    return i.failing || (i.visible && i.now - i.startedAt > CONNECT_GRACE_MS)
      ? 'paused'
      : 'connecting'
  }
  if (i.failing) return 'paused'
  if (i.visible && i.now - i.lastOkAt > SILENT_AFTER_MS) return 'paused'
  if (
    i.tipTimeMs !== undefined &&
    i.now - i.tipTimeMs > Math.max(QUIET_BLOCKS * i.blockMs, QUIET_MIN_MS)
  )
    return 'quiet'
  return 'live'
}

/** How often to read the newest block: every few seconds while live, slower while reads fail. */
export const POLL_MS = 5_000
export const PAUSED_POLL_MS = 15_000

/** The validator sets (about 126 KB on mainnet) are read again once a block lands, at most this often. */
export const SETS_MIN_GAP_MS = 10_000
/** A node behind the newest block is asked again at most this many times for that block. */
export const SETS_TRIES_PER_BLOCK = 3

/**
 * When to read the validator sets again, or `undefined` for not now: once a block has landed that the order in force
 * was not read at, no sooner than `SETS_MIN_GAP_MS` after the last read, and not again for a block already asked
 * about `SETS_TRIES_PER_BLOCK` times.
 */
export function nextSetsReadAt(i: {
  now: number
  tipHeight?: number
  /** Height of the newest validator-set answer, if any. */
  setsHeight?: number
  lastReadAt?: number
  /** Reads already sent since `tipHeight` landed. */
  triesForTip: number
  paused: boolean
}): number | undefined {
  if (i.paused || i.tipHeight === undefined) return undefined
  if (i.setsHeight !== undefined && i.setsHeight >= i.tipHeight) return undefined
  if (i.triesForTip >= SETS_TRIES_PER_BLOCK) return undefined
  return Math.max(i.now, (i.lastReadAt ?? -Infinity) + SETS_MIN_GAP_MS)
}
