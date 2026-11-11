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
  /** "ip:port" of a node not to use, for a stream reopened after that node failed. */
  avoidNode?: string
  /** More nodes not to use: those that already sent an answer that failed its checks. */
  avoidNodes?: readonly string[]
  /** "ip:port" of the node to use if it has room: the one that just reported the tip a follow-up read depends on. */
  prefer?: string
  /** A stream that stays open until aborted: the node closing it early is a fault, not the end of a reply. */
  follow?: boolean
  /** Streams: the longest silence between messages. Leave it out for a stream that may be quiet. */
  idleTimeoutMs?: number
  /** Streams: the longest the whole reply may take. For a bounded range, not a follow. */
  deadlineMs?: number
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
  /** A node ("ip:port") sent an answer that does not hold up. The pool rests it and counts it against DAPI's health. */
  reportInvalid?(net: NetworkId, node: string, message: string): void
}

/** gRPC status codes carried in `SourceError.status` on `kind: 'http'`. */
export const GRPC_INVALID_ARGUMENT = 3
export const GRPC_NOT_FOUND = 5
