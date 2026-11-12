import type { BlockRow } from '../core/types'
import type { Sourced } from '../envelope'
import { adaptBlockRows } from './adapt'
import type { InsBlockList } from './schemas'

/** Reads one request per UTC day the page spans, plus one for each block-time inversion; four covers any real page. */
const MAX_READS = 4

export interface InsightPage {
  rows: BlockRow[]
  /** The newest list response, for the page's source line. */
  list: Sourced<InsBlockList>
}

export interface InsightPageReads {
  /** The block time (ms) at `height`, or undefined when no node has it. */
  timeAt: (height: number) => Promise<number | undefined>
  list: (q: {
    date: string
    limit: number
    startTimestamp: number
  }) => Promise<Sourced<InsBlockList>>
}

/**
 * The blocks `[top - count + 1, top]` from Insight's day list, newest first. The list holds the newest `limit` blocks of one
 * UTC day at or before a time, ordered by time and not by height, so one request can fall short of the page: at a
 * midnight it stops at the day's first block, and where a block's time trails its neighbour's that block can sit on the
 * other side of the cut. Rows are kept only as a contiguous run down from `top`; while the run is short, the next
 * request starts at the time of the first height still missing. A run that stays short is returned as it is, never with a
 * gap in it.
 */
export async function readInsightPage(
  top: number,
  count: number,
  reads: InsightPageReads,
): Promise<InsightPage | null> {
  const found = new Map<number, InsBlockList['blocks'][number]>()
  let newest: Sourced<InsBlockList> | undefined
  let missing = top
  for (let read = 0; read < MAX_READS; read++) {
    try {
      const ms = await reads.timeAt(missing)
      if (ms === undefined) break
      const res = await reads.list({
        date: new Date(ms).toISOString().slice(0, 10),
        limit: count - (top - missing),
        startTimestamp: Math.floor(ms / 1000),
      })
      newest = res
      for (const b of res.data.blocks) found.set(b.height, b)
    } catch (e) {
      // The first read failing is the page's failure; a later one failing leaves the run already read.
      if (read === 0) throw e
      break
    }
    let next = missing
    while (found.has(next)) next--
    const done = top - next >= count
    const progressed = next < missing
    missing = next
    if (done || !progressed) break
  }
  if (!newest) return null
  const run = []
  for (let h = top; h > top - count && found.has(h); h--) run.push(found.get(h)!)
  return { rows: adaptBlockRows({ blocks: run }, top), list: newest }
}
