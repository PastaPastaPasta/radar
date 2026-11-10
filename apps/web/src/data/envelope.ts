export type SourceId = 'sdk' | 'dapi' | 'radar' | 'pe' | 'hyphen' | 'rate' | 'local'

/** Why a value came from a fallback instead of its primary source. */
export type FallbackReason = 'dapi-budget' | 'dapi-down' | 'sdk-cold' | 'sdk-down'

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
  /** True only when this exact value came from a call that returned a verified proof. */
  proved: boolean
  proof?: ProofMeta // present iff proved
  /** Never changes once true (chainlocked block or tx, finalized epoch). SourceLine hides the age. */
  immutable?: boolean
  /** Node that answered: "ip:port" for dapi and sdk. */
  node?: string
  /** Chain height the answer refers to (Core for dapi/hyphen, Platform for sdk/pe). */
  height?: number
  fallback?: FallbackReason
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
