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

/**
 * The chain tip an index is measured against, from outside the index. `first` is the first outside height to arrive,
 * so a page can decide early; `final` is the best one (DAPI's), which measures the index again when it differs.
 */
export interface ReferenceTip {
  first: PromiseLike<number | undefined>
  final: PromiseLike<number | undefined>
}

export type Reference = number | undefined | ReferenceTip

const isTip = (r: Reference): r is ReferenceTip => typeof r === 'object' && r !== null

/**
 * Measures with the first reference to arrive, then again with the final one if it differs. `measure` is called with
 * no height when there is none at all.
 */
export async function measureAgainst(
  reference: Reference,
  measure: (height: number | undefined) => void,
): Promise<void> {
  if (!isTip(reference)) {
    measure(reference)
    return
  }
  const first = await reference.first
  measure(first)
  void Promise.resolve(reference.final).then(
    (final) => {
      if (final !== undefined && final !== first) measure(final)
    },
    () => undefined,
  )
}
