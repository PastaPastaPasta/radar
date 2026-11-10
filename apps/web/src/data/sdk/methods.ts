import type { NetworkId } from '@/lib/network'
import type { SourceErrorKind } from '../errors'

export interface IdentityKeyDto {
  id: number
  type: number
  purpose: number
  securityLevel: number
  readOnly: boolean
  disabledAt?: number
  data: Uint8Array
}

export interface IdentityDto {
  id: string
  balance: bigint
  revision: number
  keys: IdentityKeyDto[]
}

export interface ContractDto {
  id: string
  ownerId: string
  version: number
  documentSchemas: Record<string, unknown>
}

export interface PlatformStatusDto {
  chainId: string
  version: string
  height: number
  timeMs: number
  catchingUp: boolean
}

export interface EpochDto {
  index: number
  firstBlockTimeMs: number
  firstBlockHeight: number
  firstCoreBlockHeight: number
  feeMultiplierPermille: number
  protocolVersion: number
}

export interface SdkMethods {
  'identities.fetch': { args: { id: string }; result: IdentityDto | null }
  'identities.balances': { args: { ids: string[] }; result: Map<string, bigint | null> }
  'contracts.getMany': { args: { ids: string[] }; result: Map<string, ContractDto | null> }
  'system.status': { args: Record<string, never>; result: PlatformStatusDto }
  'system.totalCredits': { args: Record<string, never>; result: bigint | null }
  'epoch.current': { args: Record<string, never>; result: EpochDto }
  // … one entry per facade method in PLAN §3.2; implementers add entries, never rename them
}
export type SdkMethodName = keyof SdkMethods

export interface SdkNetworkConfig {
  net: NetworkId
  network: 'mainnet' | 'testnet' | 'devnet'
  devnetName?: string
  quorumUrl?: string
  addresses?: string[]
}

export interface WireResult<R> {
  ok: true
  data: R
  proved: boolean
  meta?: {
    height: number
    coreChainLockedHeight: number
    epoch: number
    timeMs: number
    protocolVersion: number
    chainId: string
  }
  proof?: {
    grovedbProof: Uint8Array
    quorumHash: Uint8Array
    signature: Uint8Array
    round: number
    blockIdHash: Uint8Array
    quorumType: number
  }
  node?: string
  tookMs: number
}
export interface WireError {
  ok: false
  error: { kind: SourceErrorKind; message: string; code?: string }
}

export interface SdkConnectInfo {
  sdkVersion: string
  protocolVersion: number
  tookMs: number
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
