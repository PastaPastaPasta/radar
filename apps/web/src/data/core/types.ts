import type { NetworkId } from '@/lib/network'
import type { CoreTxType } from '@/lib/tx-types'
import type { Sourced } from '../envelope'

export interface CoreChainStatus {
  chain: string
  blocks: number
  headers: number
  bestBlockHash: string
  difficulty: number
  medianTime: number
  chainWork: string
  syncProgress: number
  isSynced: boolean
}

export interface HeaderInfo {
  height: number
  hash: string
  time: number
}

export interface PrevOut {
  value: bigint
  scriptPubKey: string
  address?: string
}

export interface DecodedTxInput {
  txid: string
  vout: number
  scriptSig: string
  sequence: number
  coinbase?: string
}

export interface DecodedTxOutput {
  value: bigint
  scriptPubKey: string
  address?: string
}

export interface DecodedTx {
  txid: string
  type: CoreTxType
  version: number
  lockTime: number
  size: number
  inputs: DecodedTxInput[]
  outputs: DecodedTxOutput[]
  payload?: Record<string, unknown>
  blockHash?: string
  height?: number
  time?: number
  confirmations?: number
  isInstantLocked?: boolean
  isChainLocked?: boolean
}

export interface DecodedBlock {
  hash: string
  height: number
  version: number
  prevHash: string
  merkleRoot: string
  time: number
  bits: string
  nonce: number
  size: number
  txs: DecodedTx[]
  chainLocked: boolean
}

export interface DapiNodeStatus {
  proTxHash: string
  state: string
  height: number
  version: string
}

export interface DapiMnEntry {
  proRegTxHash: string
  confirmedHash: string
  service: string
  pubKeyOperator: string
  votingAddress: string
  isValid: boolean
  type: number
  platformHttpPort?: number
  platformP2pPort?: number
  platformNodeId?: string
}

export interface DapiMnListDiff {
  baseBlockHash: string
  blockHash: string
  updated: DapiMnEntry[]
  removed: string[]
}

export interface DecodedIsLock {
  txid: string
  inputs: { txid: string; vout: number }[]
  cycleHash: string
  signature: string
}

export interface CoreClient {
  tip(
    net: NetworkId,
    signal?: AbortSignal,
  ): Promise<Sourced<{ height: number; hash: string; time: number }>>
  chainLock(
    net: NetworkId,
    signal?: AbortSignal,
  ): Promise<Sourced<{ height: number; hash: string }>>
  status(net: NetworkId, signal?: AbortSignal): Promise<Sourced<CoreChainStatus>> // getBlockchainStatus
  block(net: NetworkId, ref: BlockRef, signal?: AbortSignal): Promise<Sourced<DecodedBlock | null>>
  tx(net: NetworkId, txid: string, signal?: AbortSignal): Promise<Sourced<DecodedTx | null>> // with height, confirmations, isInstantLocked, isChainLocked
  prevouts(
    net: NetworkId,
    tx: DecodedTx,
    signal?: AbortSignal,
  ): Promise<Sourced<Map<string /*txid:vout*/, PrevOut>>>
  headers(
    net: NetworkId,
    fromHeight: number,
    count: number,
    signal?: AbortSignal,
  ): Promise<Sourced<HeaderInfo[]>>
  /** List pages: decides DAPI vs Hyphen per call (rule below). Newest first: `fromHeight`, then `count - 1` blocks below it. */
  blockRows(
    net: NetworkId,
    q: { fromHeight: number; count: number },
    signal?: AbortSignal,
  ): Promise<Sourced<BlockRow[]>>
  /** The lowest height whose block time is at or after `ms`; the tip's height when `ms` is later than the tip's time. */
  heightAtTime(net: NetworkId, ms: number, signal?: AbortSignal): Promise<Sourced<number>> // IN-02 binary search over headers
  nodeSelfStatus(
    net: NetworkId,
    nodeUrl: string,
    signal?: AbortSignal,
  ): Promise<Sourced<DapiNodeStatus>> // evonode /mn/ page
  masternodeList(net: NetworkId, signal?: AbortSignal): Promise<Sourced<Map<string, DapiMnEntry>>>
}
export type BlockRef = { height: number } | { hash: string }
export interface BlockRow {
  height: number
  hash: string
  time: number
  txCount: number
  size: number
  chainLocked: boolean
  pool?: string
}

export interface CoreDecoder {
  block(bytes: Uint8Array, net: NetworkId): Promise<DecodedBlock>
  tx(bytes: Uint8Array, net: NetworkId): Promise<DecodedTx>
  mnListDiff(bytes: Uint8Array, net: NetworkId): Promise<DapiMnListDiff>
  isLock(bytes: Uint8Array): Promise<DecodedIsLock>
}
