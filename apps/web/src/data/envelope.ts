export type SourceId = 'sdk' | 'dapi' | 'radar' | 'pe' | 'hyphen' | 'insight' | 'rate' | 'local'

/**
 * Why a value came from a fallback instead of its primary source. `dapi-cold` and `sdk-cold`: an index's answer shown
 * while the primary source is still being asked, replaced when it answers.
 */
export type FallbackReason = 'dapi-budget' | 'dapi-down' | 'dapi-cold' | 'sdk-cold' | 'sdk-down'

/** Which chain a stamp's `height` counts on. */
export type HeightChain = 'core' | 'platform'

export interface ProofMeta {
  /** Key into proofStore for the full bytes (NX-61). */
  id: string
  method: string
  platformHeight: number
  coreChainLockedHeight: number
  epoch: number
  timeMs: number
  protocolVersion: number
  chainId: string
  quorumType: number
  quorumHash: string // hex
  round: number
  proofBytes: number // size of the GroveDB proof
}

export interface SourceStamp {
  source: SourceId
  /** ms epoch: when the source says this was true. See §2.2 for each source. */
  asOf: number
  /** ms epoch: when the browser received it. */
  fetchedAt: number
  /** The source gave no time for this answer, so `asOf` is `fetchedAt`. Labels name the source with no age, not what the source did. */
  asOfFetched?: true
  /** True only when this exact value came from a call that returned a verified proof. */
  proved: boolean
  proof?: ProofMeta // present iff proved
  /** Never changes once true (chainlocked block or tx, finalized epoch). SourceLine hides the age. */
  immutable?: boolean
  /** Node that answered: "ip:port" for dapi and sdk. */
  node?: string
  /** Chain height the answer refers to (Core for dapi/hyphen, Platform for sdk/pe). */
  height?: number
  /** Set where a source gives heights of the other chain than its usual one (Radar's platform document gives a Platform height; its other documents a Core height). */
  heightChain?: HeightChain
  fallback?: FallbackReason
  /** The live stream pushed this figure (a tip or a ChainLock); once updates stop, its age counts from the last one. */
  pushed?: true
  /**
   * Radar only: what `asOf` is. `crawl` is the finish of Radar's latest crawl, `earlier-crawl` the finish of an older
   * crawl than the latest (or its start, when Radar no longer says when it finished), `reading` the time of Radar's own
   * check outside the crawl (its Platform checks, the Core 24 count, benchmarks). Absent counts as `crawl`.
   */
  radarTime?: 'crawl' | 'earlier-crawl' | 'reading'
  /** Age in ms past which SourceLine turns orange: the query's data class staleTime × 4, set by the query client. */
  staleAfterMs?: number
}

export interface Sourced<T> extends SourceStamp {
  data: T
}

/** One displayed figure whose value may be upgraded by a better source (rule 4). */
export interface Fact<T> {
  value: T
  stamp: SourceStamp
}

export function stampOf<T>(s: Sourced<T>): SourceStamp {
  const { data, ...stamp } = s
  void data
  return stamp
}

export function mapSourced<A, B>(s: Sourced<A>, f: (a: A) => B): Sourced<B> {
  return { ...s, data: f(s.data) }
}

export function local<T>(data: T): Sourced<T> {
  const now = Date.now()
  return { source: 'local', asOf: now, fetchedAt: now, proved: false, data }
}
