import type { DataClass } from '@/lib/data-class'

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

/** What the answering node reports about itself and the chain (unproved). An absent field is `''` or `0`. */
export interface PlatformStatusDto {
  chainId: string
  /** Drive's software version. */
  version: string
  height: number
  timeMs: number
  catchingUp: boolean
  /** Peers the answering node is connected to. */
  peers: number
  isListening: boolean
  latestBlockHash: string
  latestAppHash: string
  earliestBlockHeight: number
  maxPeerBlockHeight: number
  coreChainLockedHeight: number
  /** The answering node's ProTxHash and Tenderdash node ID, in hex. */
  nodeProTxHash: string
  nodeId: string
  dapiVersion: string
  tenderdashVersion: string
  tenderdashProtocol: { p2p: number; block: number }
  driveProtocol: { latest: number; current: number }
}

export interface EpochDto {
  index: number
  firstBlockTimeMs: number
  firstBlockHeight: number
  firstCoreBlockHeight: number
  feeMultiplierPermille: number
  protocolVersion: number
}

/** A DPNS name and the identity and document behind it. */
export interface DpnsUsernameDto {
  username: string
  identityId: string
  documentId: string
}

/** One Platform document. Timestamps are ms since the epoch; `data` is the document's own properties. */
export interface DocumentDto {
  id: string
  ownerId: string
  contractId: string
  type: string
  revision: bigint | null
  createdAt: number | null
  updatedAt: number | null
  transferredAt: number | null
  createdAtBlockHeight: number | null
  updatedAtBlockHeight: number | null
  transferredAtBlockHeight: number | null
  createdAtCoreBlockHeight: number | null
  updatedAtCoreBlockHeight: number | null
  transferredAtCoreBlockHeight: number | null
  data: Record<string, unknown>
}

export interface ContractIndexDto {
  name: string
  properties: { field: string; order: 'asc' | 'desc' }[]
  unique: boolean
  contested: boolean
}

export interface ContractGroupDto {
  position: number
  requiredPower: number
  members: { id: string; power: number }[]
}

export interface ContractTokenDto {
  position: number
  /** The token's configuration as the contract states it. */
  config: Record<string, unknown>
}

/** A data contract with everything its page shows. */
export interface ContractFullDto extends ContractDto {
  keepsHistory: boolean
  /** The contract's configuration as it states it (`canBeDeleted`, `readonly`, …). */
  config: Record<string, unknown>
  /** Document type name → its indices. */
  indices: Record<string, ContractIndexDto[]>
  tokens: ContractTokenDto[]
  groups: ContractGroupDto[]
}

export interface TokenContractInfoDto {
  contractId: string
  position: number
}

export interface TokenStatusDto {
  paused: boolean
}

export interface IdentityTokenInfoDto {
  frozen: boolean
}

export interface FinalizedEpochDto extends EpochDto {
  totalBlocks: number
  coreBlockRewards: bigint
  totalProcessingFees: bigint
  totalDistributedStorageFees: bigint
  totalCreatedStorageFees: bigint
  nextEpochStartCoreBlockHeight: number
  /** ProTxHash → blocks proposed in the epoch. */
  blockProposers: Map<string, bigint>
}

export interface VersionUpgradeStateDto {
  currentProtocolVersion: number
  nextProtocolVersion: number | null
  voteCount: bigint | null
}

export interface QuorumDto {
  quorumHash: string
  quorumType: string
  memberCount: number
  threshold: number
  isVerified: boolean
}

export interface CurrentQuorumsDto {
  height: number
  quorums: QuorumDto[]
}

export interface VotePollDto {
  contractId: string
  documentTypeName: string
  indexName: string
  indexValues: unknown[]
}

export interface VotePollsByEndDateDto {
  timestampMs: number
  polls: VotePollDto[]
}

export interface PlatformAddressInfoDto {
  address: string
  balance: bigint
  nonce: bigint
}

/** Where a document query's `where` clause operators come from: the SDK's own spelling. */
export type DocumentWhere = [field: string, operator: string, value: unknown]

export interface DocumentsQueryArgs {
  contractId: string
  type: string
  where?: DocumentWhere[]
  orderBy?: [field: string, direction: 'asc' | 'desc'][]
  /** At most 100 (Drive's limit). */
  limit?: number
  startAfter?: string
  startAt?: string
}

export interface SharedMethods {
  'identities.fetch': { args: { id: string }; result: IdentityDto | null }
  'identities.balances': { args: { ids: string[] }; result: Map<string, bigint | null> }
  'identities.byPublicKeyHash': { args: { pkh: string }; result: IdentityDto | null }
  'contracts.getMany': { args: { ids: string[] }; result: Map<string, ContractDto | null> }
  'contracts.fetch': { args: { id: string }; result: ContractFullDto | null }
  'dpns.usernames': { args: { identityId: string; limit?: number }; result: string[] }
  'dpns.getUsernameByName': { args: { name: string }; result: DpnsUsernameDto | null }
  'documents.query': { args: DocumentsQueryArgs; result: DocumentDto[] }
  'documents.get': {
    args: { contractId: string; type: string; id: string }
    result: DocumentDto | null
  }
  'tokens.contractInfo': { args: { tokenId: string }; result: TokenContractInfoDto | null }
  'tokens.totalSupply': { args: { tokenId: string }; result: bigint | null }
  'tokens.statuses': { args: { tokenIds: string[] }; result: Map<string, TokenStatusDto | null> }
  'tokens.balances': {
    args: { tokenId: string; identityIds: string[] }
    result: Map<string, bigint | null>
  }
  'tokens.identityBalances': {
    args: { identityId: string; tokenIds: string[] }
    result: Map<string, bigint | null>
  }
  'tokens.identityTokenInfos': {
    args: { identityId: string; tokenIds: string[] }
    result: Map<string, IdentityTokenInfoDto | null>
  }
  'tokens.calculateId': { args: { contractId: string; position: number }; result: string }
  'system.status': { args: Record<string, never>; result: PlatformStatusDto }
  'system.totalCredits': { args: Record<string, never>; result: bigint | null }
  'system.currentQuorumsInfo': { args: Record<string, never>; result: CurrentQuorumsDto }
  'epoch.current': { args: Record<string, never>; result: EpochDto }
  'epoch.epochsInfo': {
    args: { startEpoch?: number; count?: number; ascending?: boolean }
    result: EpochDto[]
  }
  'epoch.finalizedInfos': {
    args: { startEpoch: number; count?: number; ascending?: boolean }
    result: FinalizedEpochDto[]
  }
  'epoch.evonodesProposedBlocksByIds': {
    args: { epoch: number; proTxHashes: string[] }
    result: Map<string, bigint>
  }
  'epoch.evonodesProposedBlocksByRange': {
    args: { epoch: number; limit?: number; startAfter?: string }
    result: Map<string, bigint>
  }
  'protocol.versionUpgradeState': { args: Record<string, never>; result: VersionUpgradeStateDto }
  'protocol.versionUpgradeVoteStatus': {
    args: { startProTxHash?: string; count: number }
    result: Map<string, number>
  }
  'voting.votePollsByEndDate': {
    args: {
      startTimeMs?: number
      startTimeIncluded?: boolean
      endTimeMs?: number
      endTimeIncluded?: boolean
      limit?: number
      offset?: number
      orderAscending?: boolean
    }
    result: VotePollsByEndDateDto[]
  }
  'addresses.get': { args: { address: string }; result: PlatformAddressInfoDto | null }
  'addresses.getMany': {
    args: { addresses: string[] }
    result: Map<string, PlatformAddressInfoDto | null>
  }
}

/** The data class of each shared method (`data/query/stale.ts`), which sets its staleness and persistence. */
export const SHARED_CLASSES = {
  'identities.fetch': 'live',
  'identities.balances': 'live',
  'identities.byPublicKeyHash': 'structural',
  'contracts.getMany': 'structural',
  'contracts.fetch': 'structural',
  'dpns.usernames': 'structural',
  'dpns.getUsernameByName': 'structural',
  'documents.query': 'live',
  'documents.get': 'live',
  'tokens.contractInfo': 'structural',
  'tokens.totalSupply': 'live',
  'tokens.statuses': 'live',
  'tokens.balances': 'live',
  'tokens.identityBalances': 'live',
  'tokens.identityTokenInfos': 'live',
  'tokens.calculateId': 'immutable',
  'system.status': 'live',
  'system.totalCredits': 'live',
  'system.currentQuorumsInfo': 'live',
  'epoch.current': 'live',
  'epoch.epochsInfo': 'live',
  'epoch.finalizedInfos': 'immutable',
  'epoch.evonodesProposedBlocksByIds': 'live',
  'epoch.evonodesProposedBlocksByRange': 'live',
  'protocol.versionUpgradeState': 'live',
  'protocol.versionUpgradeVoteStatus': 'live',
  'voting.votePollsByEndDate': 'live',
  'addresses.get': 'live',
  'addresses.getMany': 'live',
} as const satisfies Record<keyof SharedMethods, DataClass>
