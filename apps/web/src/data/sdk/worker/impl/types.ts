import type { SdkMethodName, SdkMethods, WireMeta, WireProof } from '../../methods'

/** The proof-checked answer of a `*WithProof` call: data, the Platform block it refers to, and the proof. */
export interface ProvedResponse<T> extends Freeable {
  data: T
  metadata: {
    height: bigint | number
    coreChainLockedHeight: number
    epoch: number
    timeMs: bigint | number
    protocolVersion: number
    chainId: Uint8Array
  }
  proof: WireProof
}

export interface Freeable {
  free?: () => void
}

/** What an implementation hands back: the DTO, and the proof response when the call had one (`proved` follows from it). */
export interface ImplOutput<R> {
  data: R
  response?: ProvedResponse<unknown>
  /** Metadata for an answer that has no proof (`system.status`). */
  unprovedMeta?: WireMeta
}

/** One method's implementation. `R` is the part of the SDK facade the file calls, so each file declares only that. */
export type ImplOf<R, M extends SdkMethodName> = (
  sdk: R,
  args: SdkMethods[M]['args'],
) => Promise<ImplOutput<SdkMethods[M]['result']>>
