import type { SourceStamp } from '@/data/envelope'
import { staleAfterMs } from '@/data/query/stale'

/*
 * A mark on this page takes the out-of-date look only when a reading has stopped arriving, never because the chain
 * itself has been quiet. Each helper leaves the age the mark shows alone and sets the age at which it turns.
 */

/** The pushed tip and best ChainLock carry no stale age of their own, so their data class's applies. */
export function pushed(stamp: SourceStamp): SourceStamp {
  return { ...stamp, staleAfterMs: staleAfterMs('tip') }
}

/** A figure read at the newest block cannot be out of date, however long ago that block was. */
export function atTip(stamp: SourceStamp, tipHeight: number | undefined): SourceStamp {
  return stamp.height !== undefined && tipHeight !== undefined && stamp.height >= tipHeight
    ? { ...stamp, staleAfterMs: Number.POSITIVE_INFINITY }
    : stamp
}

/** A reading stamped with its block's time is aged from when it was read: it turns `allowMs` after the last answer. */
export function agedFromRead(stamp: SourceStamp, allowMs: number): SourceStamp {
  return { ...stamp, staleAfterMs: Math.max(0, stamp.fetchedAt - stamp.asOf) + allowMs }
}
