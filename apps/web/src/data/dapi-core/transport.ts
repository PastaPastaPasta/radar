import type { NetworkId } from '@/lib/network'
import type { Budget } from './budget'

export type DapiUnaryMethod =
  | 'getBlockchainStatus'
  | 'getBestBlockHeight'
  | 'getBlock'
  | 'getTransaction'
  | 'getMasternodeStatus'

export type DapiStreamMethod =
  | 'subscribeToBlockHeadersWithChainLocks'
  | 'subscribeToTransactionsWithProofs'
  | 'subscribeToMasternodeList'

/** Queue order when the budget is short (§4.3): details first, then lists, then prefetch. */
export type DapiPriority = 'detail' | 'list' | 'prefetch'

export interface DapiCallOptions {
  signal?: AbortSignal
  priority?: DapiPriority
  /** Ask this node ("https://ip:port") instead of choosing one. For `getMasternodeStatus` only. */
  nodeUrl?: string
}

export interface DapiUnaryReply {
  /** The response message, protobuf-encoded. */
  response: Uint8Array
  /** "ip:port" of the node that answered. */
  node?: string
}

export interface DapiStreamHandle {
  /** "ip:port" of the node serving the stream. */
  node?: string
  /** One protobuf-encoded response message per item. Ends when the server ends the stream; throws on failure. */
  messages: AsyncIterable<Uint8Array>
}

/**
 * The seam between the Core façade and the network. Messages cross it as protobuf bytes, so the
 * same requests can be recorded, replayed from fixtures, or sent over gRPC-web.
 *
 * Failures are `SourceError`s with `source: 'dapi'`: a gRPC `NOT_FOUND` is `kind: 'http'` with
 * `status: 5`, `RESOURCE_EXHAUSTED` is `rate-limited`, anything else follows §2.3.
 */
export interface DapiTransport {
  /** The pool's request budget (§4.3). The façade reads it to choose between DAPI and Hyphen for lists. */
  readonly budget: Budget
  unary(
    net: NetworkId,
    method: DapiUnaryMethod,
    request: Uint8Array,
    opts?: DapiCallOptions,
  ): Promise<DapiUnaryReply>
  stream(
    net: NetworkId,
    method: DapiStreamMethod,
    request: Uint8Array,
    opts?: DapiCallOptions,
  ): DapiStreamHandle
}

/** gRPC status code NOT_FOUND, carried in `SourceError.status` on `kind: 'http'`. */
export const GRPC_NOT_FOUND = 5
