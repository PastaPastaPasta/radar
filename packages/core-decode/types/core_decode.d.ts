/* Hand-written types for the output of decodeBlock / decodeTx. Keep in sync with src/model.rs. */

/** Network used only for address encoding. Case-insensitive aliases are accepted by the decoder. */
export type Network = 'mainnet' | 'testnet' | 'devnet' | 'regtest'

/**
 * Hex strings are lowercase. Block, tx, quorum and other 32-byte hashes (and merkle roots) are in Dash Core's
 * display order (byte-reversed from the wire). Keys, signatures, scripts and payload bytes are in wire order.
 *
 * Numbers are JS numbers: a decode throws if a u64 field (output value, asset-unlock index, credit pool balance)
 * is >= 2^53, which no valid chain data reaches (max supply is ~1.9e15 duffs).
 */
export type Hex = string

export type ScriptType = 'p2pkh' | 'p2sh' | 'p2pk' | 'nulldata' | 'empty' | 'nonstandard'

export type TxTypeName =
  | 'classic'
  | 'proRegTx'
  | 'proUpServTx'
  | 'proUpRegTx'
  | 'proUpRevTx'
  | 'cbTx'
  | 'qcTx'
  | 'mnhfTx'
  | 'assetLockTx'
  | 'assetUnlockTx'
  | 'proDissolveTx'
  | 'proUpShareTx'
  | 'proUpSharedRegTx'
  | 'unknown'

export interface CoinbaseInfo {
  /** Raw coinbase scriptSig. */
  scriptSigHex: Hex
  /** The scriptSig read as UTF-8 with control characters and invalid bytes collapsed to single spaces (keeps pool tags such as "/slush/" or emoji); for pool-name lookup. */
  text: string
}

export interface TxInput {
  /** All zeros for a coinbase input. */
  prevTxid: Hex
  /** 4294967295 for a coinbase input. */
  vout: number
  scriptSigHex: Hex
  scriptSigAsm: string
  sequence: number
}

export interface TxOutput {
  n: number
  /** Duffs (1 DASH = 100_000_000). */
  value: number
  scriptPubKeyHex: Hex
  scriptPubKeyAsm: string
  scriptType: ScriptType
  /** Base58 address for p2pkh / p2sh scripts (p2pk: the p2pkh address of the key), null otherwise. */
  address: string | null
}

export interface OutPoint {
  txid: Hex
  vout: number
}

export interface Script {
  hex: Hex
  scriptType: ScriptType
  address: string | null
}

/** hash160 of a public key and the p2pkh address it corresponds to on the requested network. */
export interface KeyHash {
  hash: Hex
  address: string
}

export interface PayoutShare {
  script: Script
  /** Basis points of the owner reward. */
  reward: number
}

export interface NetInfoEntry {
  kind: 'service' | 'domain' | 'invalid'
  /** Set for kind "service". */
  network: 'ipv4' | 'ipv6' | 'torv3' | 'i2p' | 'cjdns' | null
  /** Textual IP for ipv4/ipv6; hex of the raw address bytes for the other networks. Set for kind "service". */
  address: string | null
  /** Set for kind "domain". */
  host: string | null
  port: number | null
}

export interface NetInfoPurpose {
  purpose: 'coreP2P' | 'platformP2P' | 'platformHttps'
  entries: NetInfoEntry[]
}

export interface NetInfo {
  version: number
  purposes: NetInfoPurpose[]
}

export interface Service {
  /** "ip:port" (IPv6 as "[ip]:port"); for ProTx v3 the first coreP2P entry. Null if there is none. */
  address: string | null
  /** Full extended network info; null before ProTx version 3. */
  netInfo: NetInfo | null
}

export interface CollateralShare {
  /** Duffs. */
  amount: number
  scriptRefund: Script
  scriptReward: Script
  ownerKey: KeyHash
}

export interface SharedCollateral {
  shares: CollateralShare[]
  joinSigs: Hex[]
  earlyPeriodBlocks: number
  /** Duffs. */
  earlyPenalty: number
}

export interface QuorumCommitment {
  version: number
  llmqType: number
  /** e.g. "1_50/60", "4_100/67", "100_Test", "7_Unknown". */
  llmqTypeName: string
  quorumHash: Hex
  /** Present for rotated (version 2 / 4) commitments. */
  quorumIndex: number | null
  signersCount: number
  validMembersCount: number
  /** One '0'/'1' character per member. */
  signers: string
  /** One '0'/'1' character per member. */
  validMembers: string
  quorumPublicKey: Hex
  quorumVvecHash: Hex
  thresholdSig: Hex
  allCommitmentAggregatedSignature: Hex
}

export interface ProRegTxPayload {
  kind: 'proRegTx'
  version: number
  /** 0 = regular, 1 = high-performance (Evo). */
  masternodeType: number
  masternodeMode: number
  /** vout is an index into this transaction's own outputs when collateralInTx. */
  collateralOutpoint: OutPoint
  collateralInTx: boolean
  service: Service
  ownerKey: KeyHash
  /** BLS public key, 48 bytes. */
  operatorPublicKey: Hex
  votingKey: KeyHash
  /** Basis points. */
  operatorReward: number
  /** Payout script before ProTx version 3; null from version 3 (see payouts). */
  scriptPayout: Script | null
  /** DIP-0026 payouts, ProTx version 3 and later. */
  payouts: PayoutShare[] | null
  /** Collateral sharing terms, ProTx version 3 and later. */
  sharedCollateral: SharedCollateral | null
  inputsHash: Hex
  /** 20-byte Tenderdash node id, high-performance masternodes only. */
  platformNodeId: Hex | null
  platformP2pPort: number | null
  platformHttpPort: number | null
  /** Empty hex for payload-signature-less (collateral-in-tx) registrations. */
  signature: Hex
}

export interface ProUpServTxPayload {
  kind: 'proUpServTx'
  version: number
  mnType: number | null
  proTxHash: Hex
  service: Service
  /** Null when the operator payout script is empty (no operator payout). */
  scriptOperatorPayout: Script | null
  inputsHash: Hex
  platformNodeId: Hex | null
  platformP2pPort: number | null
  platformHttpPort: number | null
  /** BLS signature, 96 bytes. */
  payloadSig: Hex
}

export interface ProUpRegTxPayload {
  kind: 'proUpRegTx'
  version: number
  proTxHash: Hex
  providerMode: number
  operatorPublicKey: Hex
  votingKey: KeyHash
  scriptPayout: Script | null
  payouts: PayoutShare[] | null
  inputsHash: Hex
  payloadSig: Hex
}

export interface ProUpRevTxPayload {
  kind: 'proUpRevTx'
  version: number
  proTxHash: Hex
  /** 0 = not specified, 1 = termination of service, 2 = compromised keys, 3 = change of keys. */
  reason: number
  inputsHash: Hex
  payloadSig: Hex
}

export interface CbTxPayload {
  kind: 'cbTx'
  version: number
  height: number
  merkleRootMnList: Hex
  /** Null for version 1 (field not on the wire). */
  merkleRootQuorums: Hex | null
  /** Version 3+: distance of the best ChainLock from height - 1. */
  bestClHeightDiff: number | null
  /** Version 3+: height of the best ChainLock (height - 1 - bestClHeightDiff); null if the diff is out of range. */
  bestClHeight: number | null
  /** Version 3+: BLS signature of the best ChainLock, 96 bytes. */
  bestClSignature: Hex | null
  /** Version 3+: credit pool balance in duffs after this block. */
  creditPoolBalance: number | null
  /** Version 4+. */
  merkleRootAssetUnlocks: Hex | null
}

export interface QcTxPayload {
  kind: 'qcTx'
  version: number
  height: number
  commitment: QuorumCommitment
}

export interface MnhfTxPayload {
  kind: 'mnhfTx'
  version: number
  versionBit: number
  quorumHash: Hex
  sig: Hex
}

export interface AssetLockTxPayload {
  kind: 'assetLockTx'
  version: number
  creditOutputs: TxOutput[]
  /** Sum of creditOutputs values, duffs. */
  totalCredit: number
}

export interface AssetUnlockTxPayload {
  kind: 'assetUnlockTx'
  version: number
  index: number
  /** Duffs. */
  fee: number
  requestHeight: number
  quorumHash: Hex
  quorumSig: Hex
}

export interface ProDissolveTxPayload {
  kind: 'proDissolveTx'
  version: number
  proTxHash: Hex
  actorIndex: number
  signatures: Hex[]
}

export interface ProUpShareTxPayload {
  kind: 'proUpShareTx'
  version: number
  proTxHash: Hex
  shareIndex: number
  /** Null when empty, which resets the reward script to the share's refund script. */
  scriptReward: Script | null
  inputsHash: Hex
  payloadSig: Hex
}

export interface ProUpSharedRegTxPayload {
  kind: 'proUpSharedRegTx'
  version: number
  proTxHash: Hex
  operatorPublicKey: Hex
  votingKey: KeyHash
  inputsHash: Hex
  signatures: Hex[]
}

/** A special transaction whose type or payload layout this decoder does not know. */
export interface RawPayload {
  kind: 'raw'
  txType: number
  hex: Hex
}

export type TxPayload =
  | ProRegTxPayload
  | ProUpServTxPayload
  | ProUpRegTxPayload
  | ProUpRevTxPayload
  | CbTxPayload
  | QcTxPayload
  | MnhfTxPayload
  | AssetLockTxPayload
  | AssetUnlockTxPayload
  | ProDissolveTxPayload
  | ProUpShareTxPayload
  | ProUpSharedRegTxPayload
  | RawPayload

export interface DecodedTx {
  txid: Hex
  /** Transaction version (the low 16 bits of the on-wire version field). */
  version: number
  /** Special transaction type number (0 = classic). */
  txType: number
  /** Name of the special type. `payload.kind` is authoritative: a known type with an unreadable (e.g. newer) payload layout has payload.kind "raw". */
  txTypeName: TxTypeName
  lockTime: number
  /** Serialized size in bytes. */
  size: number
  isCoinbase: boolean
  /** Set when isCoinbase. */
  coinbase: CoinbaseInfo | null
  inputs: TxInput[]
  outputs: TxOutput[]
  /** Null for classic transactions. */
  payload: TxPayload | null
}

export interface DecodedBlock {
  hash: Hex
  version: number
  prevBlockHash: Hex
  merkleRoot: Hex
  time: number
  /** Compact difficulty target (nBits). */
  bits: number
  nonce: number
  /** Serialized size in bytes. */
  size: number
  txCount: number
  /** Coinbase scriptSig info of the first transaction; null if the block has no coinbase. */
  coinbase: CoinbaseInfo | null
  txs: DecodedTx[]
}

/** Decodes a raw block. Throws an Error on malformed input or an unknown network. */
export function decodeBlock(bytes: Uint8Array, network: Network): DecodedBlock

/** Decodes a raw transaction. Throws an Error on malformed input or an unknown network. */
export function decodeTx(bytes: Uint8Array, network: Network): DecodedTx

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module

export interface InitOutput {
  readonly memory: WebAssembly.Memory
}

export type SyncInitInput = BufferSource | WebAssembly.Module

/** Synchronously instantiates the wasm module from bytes or a compiled module (Node, workers). */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput

/** Loads the wasm module (fetch of the default URL next to this file, or the given input). Call once before decoding. */
export default function init(
  module_or_path?:
    { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>,
): Promise<InitOutput>
