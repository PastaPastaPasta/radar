/** An index is stale once it is more than this many blocks below DAPI's best height. */
export const INDEX_STALE_BLOCKS = 6
/** It is fresh again at this many behind or fewer; in between, the earlier answer stands so pages don't flip. */
export const INDEX_FRESH_BLOCKS = 2

export type IndexState = 'fresh' | 'stale'

/** The sources that are indexes of the chain, and so are judged by the one stale rule. */
export const INDEX_SOURCES: ReadonlySet<string> = new Set(['hyphen', 'insight'])

export function nextIndexState(previous: IndexState | undefined, behind: number): IndexState {
  if (behind > INDEX_STALE_BLOCKS) return 'stale'
  if (behind <= INDEX_FRESH_BLOCKS) return 'fresh'
  return previous ?? 'fresh'
}
