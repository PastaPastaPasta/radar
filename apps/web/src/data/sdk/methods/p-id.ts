import type { DataClass } from '@/lib/data-class'
import type { IdentityDto, IdentityKeyDto } from './shared'

/** What a key is bound to: one contract, one document type of a contract, or every member of a contract group. */
export interface ContractBoundsDto {
  type: 'singleContract' | 'documentType' | 'contractGroup'
  id: string
  documentTypeName?: string
}

/** An identity key with the facts only the key queries answer. */
export interface IdentityKeyDetailDto extends IdentityKeyDto {
  contractBounds?: ContractBoundsDto
  /** Block time in ms from which the key can no longer sign. */
  expiresAt?: number
}

export interface IdentityBalanceAndRevisionDto {
  balance: bigint
  revision: number
}

/** A group the identity belongs to: the group is (contract, position), the identity's power is its weight in it. */
export interface IdentityGroupDto {
  contractId: string
  position: number
  role: string
  power: number | null
}

export type VoteChoiceDto =
  { type: 'towardsIdentity'; identityId: string } | { type: 'abstain' } | { type: 'lock' }

/** One contested-resource vote the identity cast. */
export interface IdentityVoteDto {
  voteId: string
  contractId: string
  documentTypeName: string
  indexName: string
  indexValues: unknown[]
  choice: VoteChoiceDto
}

export interface PIdMethods {
  /** All keys of an identity, or the ones named. */
  'identities.getKeys': {
    args: { id: string; keyIds?: number[] }
    result: IdentityKeyDetailDto[]
  }
  'identities.nonce': { args: { id: string }; result: bigint | null }
  'identities.contractNonce': {
    args: { id: string; contractId: string }
    result: bigint | null
  }
  /** The keys of one identity that are bound to a contract. */
  'identities.contractKeys': {
    args: { id: string; contractId: string; purposes?: number[] }
    result: IdentityKeyDetailDto[]
  }
  'identities.balanceAndRevision': {
    args: { id: string }
    result: IdentityBalanceAndRevisionDto | null
  }
  /** Identities holding a key that several identities may share; `startAfter` is the last identity of the page before. */
  'identities.byNonUniquePublicKeyHash': {
    args: { pkh: string; startAfter?: string }
    result: IdentityDto[]
  }
  'group.identityGroups': {
    args: { identityId: string; memberContracts?: string[] }
    result: IdentityGroupDto[]
  }
  'voting.contestedResourceIdentityVotes': {
    args: {
      identityId: string
      limit?: number
      startAtVoteId?: string
      startAtIncluded?: boolean
      orderAscending?: boolean
    }
    result: IdentityVoteDto[]
  }
}

export const P_ID_CLASSES = {
  'identities.getKeys': 'structural',
  'identities.nonce': 'live',
  'identities.contractNonce': 'live',
  'identities.contractKeys': 'structural',
  'identities.balanceAndRevision': 'live',
  'identities.byNonUniquePublicKeyHash': 'structural',
  'group.identityGroups': 'structural',
  'voting.contestedResourceIdentityVotes': 'live',
} as const satisfies Record<keyof PIdMethods, DataClass>
