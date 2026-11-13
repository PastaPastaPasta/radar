import type { NetworkId } from '@/lib/network'
import type { SourceErrorKind } from '../errors'
import type { NetCMethods } from './methods/net-c'
import type { PBlocksMethods } from './methods/p-blocks'
import type { PChainMethods } from './methods/p-chain'
import type { PDataMethods } from './methods/p-data'
import type { PIdMethods } from './methods/p-id'
import type { PTokenMethods } from './methods/p-token'
import type { PVoteMethods } from './methods/p-vote'
import type { SharedMethods } from './methods/shared'
import type { ToolsMethods } from './methods/tools'

export type * from './methods/shared'
export type {
  NetCMethods,
  PBlocksMethods,
  PChainMethods,
  PDataMethods,
  PIdMethods,
  PTokenMethods,
  PVoteMethods,
  ToolsMethods,
}

export interface SdkMethods
  extends
    SharedMethods,
    NetCMethods,
    PChainMethods,
    PBlocksMethods,
    PIdMethods,
    PDataMethods,
    PTokenMethods,
    PVoteMethods,
    ToolsMethods {}
export type SdkMethodName = keyof SdkMethods

export interface SdkNetworkConfig {
  net: NetworkId
  network: 'mainnet' | 'testnet' | 'devnet'
  devnetName?: string
  quorumUrl?: string
  addresses?: string[]
}

export interface WireMeta {
  height: number
  coreChainLockedHeight: number
  epoch: number
  timeMs: number
  protocolVersion: number
  chainId: string
}

export interface WireProof {
  grovedbProof: Uint8Array
  quorumHash: Uint8Array
  signature: Uint8Array
  round: number
  blockIdHash: Uint8Array
  quorumType: number
}

/** One request the SDK sent to a node, so the Core pool can count it against that node's budget. */
export interface NodeUse {
  /** "ip:port" */
  host: string
  at: number
}

export interface WireResult<R> {
  ok: true
  data: R
  proved: boolean
  meta?: WireMeta
  proof?: WireProof
  node?: string
  tookMs: number
  /** Platform requests sent since the previous reply. */
  requests?: NodeUse[]
}
export interface WireError {
  ok: false
  error: { kind: SourceErrorKind; message: string; code?: string }
  requests?: NodeUse[]
}

export interface SdkConnectInfo {
  sdkVersion: string
  protocolVersion: number
  tookMs: number
  requests?: NodeUse[]
}

export interface SdkWorkerApi {
  /** Idempotent. Resolves when the SDK for that network is connected and its trusted context is prefetched. */
  connect(cfg: SdkNetworkConfig): Promise<SdkConnectInfo | WireError>
  call<M extends SdkMethodName>(
    net: NetworkId,
    method: M,
    args: SdkMethods[M]['args'],
  ): Promise<WireResult<SdkMethods[M]['result']> | WireError>
  /** Local wasm decoders for tools (NX-71, PE-13, PE-34): no network. */
  decode(
    kind: 'stateTransition' | 'dataContract' | 'document' | 'identity',
    bytes: Uint8Array,
  ): Promise<WireResult<unknown> | WireError>
}
