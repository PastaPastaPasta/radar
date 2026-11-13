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
  /** True only when two independent sources report the ChainLock that covers this transaction's block. */
  isChainLocked?: boolean
  /** One node reported the ChainLock and nothing corroborates it yet. */
  chainLockClaim?: 'one-node'
  /** Whoever reports an InstantSend lock is the node that answered; no second source is asked. */
  instantLockClaim?: 'one-node'
  /**
   * Who answered about the lock. Absent means a DAPI node. `hyphen` with no lock means Hyphen does not know: its lock
   * map is live state, not a record.
   */
  instantLockSource?: InstantLockSource
  /** Set only on a network where no ChainLock is known: blocks of confirmations after which Core has pruned the lock. */
  instantLockKeepDepth?: number
}

export type InstantLockSource = 'dapi' | 'hyphen'

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
  /** True only when two independent sources report a ChainLock at or above this height. */
  chainLocked: boolean
  /** One node reported a ChainLock covering this block and nothing corroborates it yet. */
  chainLockClaim?: 'one-node'
}

export interface CoreChainLock {
  height: number
  hash: string
  /**
   * Set when only one node reports this ChainLock and no second source reaches its height. It is that node's claim,
   * not a fact: say "reported by one node" and do not draw it as locked. Absent once a second source agrees.
   */
  claim?: 'one-node'
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

/** What a call may say about its place in the queue, when it is not the page's own read. */
export interface CoreCallOptions {
  priority?: 'detail' | 'list' | 'prefetch'
}

export interface CoreClient {
  tip(
    net: NetworkId,
    signal?: AbortSignal,
  ): Promise<Sourced<{ height: number; hash: string; time: number }>>
  chainLock(net: NetworkId, signal?: AbortSignal): Promise<Sourced<CoreChainLock>>
  status(net: NetworkId, signal?: AbortSignal): Promise<Sourced<CoreChainStatus>> // getBlockchainStatus
  block(
    net: NetworkId,
    ref: BlockRef,
    signal?: AbortSignal,
    opts?: CoreCallOptions,
  ): Promise<Sourced<DecodedBlock | null>>
  tx(
    net: NetworkId,
    txid: string,
    signal?: AbortSignal,
    opts?: CoreCallOptions,
  ): Promise<Sourced<DecodedTx | null>> // with height, confirmations, isInstantLocked, isChainLocked
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
  /**
   * List pages: decides DAPI vs Hyphen per call (rule below). Newest first: `fromHeight`, then `count - 1` blocks below it.
   * `via: 'index'` asks for the page from Hyphen's list in one request, which a page too long for DAPI's budget uses.
   */
  blockRows(
    net: NetworkId,
    q: { fromHeight: number; count: number; via?: 'index' },
    signal?: AbortSignal,
  ): Promise<Sourced<BlockRow[]>>
  /** The lowest height whose block time is at or after `ms`; the tip's height plus one when `ms` is later than the tip's time (no such block yet). */
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
  chainLockClaim?: 'one-node'
  pool?: string
}

export interface CoreDecoder {
  /** `expectHeight`: the height the caller asked for. Below BIP-34 a coinbase need not carry its height, so this one is used. */
  block(bytes: Uint8Array, net: NetworkId, expectHeight?: number): Promise<DecodedBlock>
  tx(bytes: Uint8Array, net: NetworkId): Promise<DecodedTx>
  mnListDiff(bytes: Uint8Array, net: NetworkId): Promise<DapiMnListDiff>
  isLock(bytes: Uint8Array): Promise<DecodedIsLock>
}

/** What only the live feeds and the network reset need from the client. */
export interface CoreClientHooks {
  /** The live header stream's tip, so a date lookup does not ask for it again. */
  observeTip(net: NetworkId, tip: { height: number; hash: string; time: number }): void
  /**
   * A ChainLock the live header stream received, from `node`. True when a second, independent source also reports a
   * lock at or above its height; false while it is one node's claim.
   */
  observeChainLock(net: NetworkId, lock: { height: number; hash: string }, node?: string): boolean
  /** Drops what the client remembers of a network. */
  forget(net: NetworkId): void
}
