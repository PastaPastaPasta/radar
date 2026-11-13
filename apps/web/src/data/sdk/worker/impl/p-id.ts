import type { PIdMethods } from '../../methods'
import { identityDto, idText, type IdentityLike } from '../convert'
import type { Freeable, ImplOf, ProvedResponse } from './types'

type IdLike = { toString(): string } | string

type IdentityKeyDetailDto = PIdMethods['identities.getKeys']['result'][number]
type ContractBoundsDto = NonNullable<IdentityKeyDetailDto['contractBounds']>
type IdentityGroupDto = PIdMethods['group.identityGroups']['result'][number]
type IdentityVoteDto = PIdMethods['voting.contestedResourceIdentityVotes']['result'][number]
type VoteChoiceDto = IdentityVoteDto['choice']

export interface KeyLike extends Freeable {
  keyId: number
  keyTypeNumber: number
  purposeNumber: number
  securityLevelNumber: number
  isReadOnly: boolean
  disabledAt?: bigint | number | null
  expiresAt?: bigint | number | null
  data: string | Uint8Array
  contractBounds?: { toJSON(): { $type: string; id: string; documentTypeName?: string } } | null
}

export interface ContractKeysLike extends Freeable {
  identityId: IdLike
  keys: KeyLike[]
}

export interface IdentityGroupLike extends Freeable {
  dataContractId: string
  groupContractPosition: number
  role: string
  power?: bigint | number | null
}

export interface ResourceVoteLike extends Freeable {
  toJSON(): {
    votePoll?: {
      contractId?: string
      documentTypeName?: string
      indexName?: string
      indexValues?: unknown[]
    }
    resourceVoteChoice?: { $type?: string; identity?: string }
  }
}

export interface BalanceAndRevisionLike extends Freeable {
  balance: bigint
  revision: bigint | number
}

/** The part of `EvoSDK` this package's methods read. */
export interface PIdReads {
  identities: {
    getKeysWithProof(query: {
      identityId: string
      request: { type: 'all' } | { type: 'specific'; specificKeyIds: number[] }
    }): Promise<ProvedResponse<KeyLike[]>>
    nonceWithProof(identityId: string): Promise<ProvedResponse<bigint | undefined>>
    contractNonceWithProof(
      identityId: string,
      contractId: string,
    ): Promise<ProvedResponse<bigint | undefined>>
    contractKeysWithProof(query: {
      identityIds: string[]
      contractId: string
      purposes?: number[]
    }): Promise<ProvedResponse<ContractKeysLike[]>>
    balanceAndRevisionWithProof(
      identityId: string,
    ): Promise<ProvedResponse<BalanceAndRevisionLike | undefined>>
    byNonUniquePublicKeyHashWithProof(
      publicKeyHash: string,
      startAfter?: string,
    ): Promise<ProvedResponse<IdentityLike[]>>
  }
  group: {
    identityGroupsWithProof(query: {
      identityId: string
      memberDataContracts?: string[]
    }): Promise<ProvedResponse<IdentityGroupLike[]>>
  }
  voting: {
    contestedResourceIdentityVotesWithProof(query: {
      identityId: string
      limit?: number
      startAtVoteId?: string
      startAtIncluded?: boolean
      orderAscending?: boolean
    }): Promise<ProvedResponse<Map<IdLike, ResourceVoteLike>>>
  }
}

type Impl<M extends keyof PIdMethods> = ImplOf<PIdReads, M>

const hexOf = (data: string | Uint8Array): Uint8Array => {
  if (typeof data !== 'string') return Uint8Array.from(data)
  const bytes = new Uint8Array(data.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(data.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

const BOUNDS = new Set<ContractBoundsDto['type']>(['singleContract', 'documentType', 'contractGroup'])

export function keyDetailDto(key: KeyLike): IdentityKeyDetailDto {
  const out: IdentityKeyDetailDto = {
    id: key.keyId,
    type: key.keyTypeNumber,
    purpose: key.purposeNumber,
    securityLevel: key.securityLevelNumber,
    readOnly: key.isReadOnly,
    data: hexOf(key.data),
  }
  if (key.disabledAt !== undefined && key.disabledAt !== null) out.disabledAt = Number(key.disabledAt)
  if (key.expiresAt !== undefined && key.expiresAt !== null) out.expiresAt = Number(key.expiresAt)
  const bounds = key.contractBounds?.toJSON()
  if (bounds && BOUNDS.has(bounds.$type as ContractBoundsDto['type'])) {
    out.contractBounds = {
      type: bounds.$type as ContractBoundsDto['type'],
      id: bounds.id,
      ...(bounds.documentTypeName ? { documentTypeName: bounds.documentTypeName } : {}),
    }
  }
  return out
}

export function identityGroupDto(group: IdentityGroupLike): IdentityGroupDto {
  return {
    contractId: group.dataContractId,
    position: group.groupContractPosition,
    role: group.role,
    power: group.power === undefined || group.power === null ? null : Number(group.power),
  }
}

function choiceDto(raw: { $type?: string; identity?: string } | undefined): VoteChoiceDto {
  if (raw?.$type === 'towardsIdentity' && raw.identity) {
    return { type: 'towardsIdentity', identityId: raw.identity }
  }
  return raw?.$type === 'lock' ? { type: 'lock' } : { type: 'abstain' }
}

export function identityVoteDto(voteId: IdLike, vote: ResourceVoteLike): IdentityVoteDto {
  const json = vote.toJSON()
  const poll = json.votePoll ?? {}
  return {
    voteId: idText(voteId),
    contractId: poll.contractId ?? '',
    documentTypeName: poll.documentTypeName ?? '',
    indexName: poll.indexName ?? '',
    indexValues: Array.isArray(poll.indexValues) ? [...poll.indexValues] : [],
    choice: choiceDto(json.resourceVoteChoice),
  }
}

function freeAll(items: Freeable[]): void {
  for (const item of items) item.free?.()
}

export const pIdImpl: { [M in keyof PIdMethods]: Impl<M> } = {
  async 'identities.getKeys'(sdk, { id, keyIds }) {
    const response = await sdk.identities.getKeysWithProof({
      identityId: id,
      request: keyIds ? { type: 'specific', specificKeyIds: keyIds } : { type: 'all' },
    })
    const data = response.data.map(keyDetailDto)
    freeAll(response.data)
    return { data, response }
  },

  async 'identities.nonce'(sdk, { id }) {
    const response = await sdk.identities.nonceWithProof(id)
    return { data: response.data ?? null, response }
  },

  async 'identities.contractNonce'(sdk, { id, contractId }) {
    const response = await sdk.identities.contractNonceWithProof(id, contractId)
    return { data: response.data ?? null, response }
  },

  async 'identities.contractKeys'(sdk, { id, contractId, purposes }) {
    const response = await sdk.identities.contractKeysWithProof({
      identityIds: [id],
      contractId,
      ...(purposes ? { purposes } : {}),
    })
    const data = response.data
      .filter((entry) => idText(entry.identityId) === id)
      .flatMap((entry) => entry.keys.map(keyDetailDto))
    for (const entry of response.data) {
      freeAll(entry.keys)
      entry.free?.()
    }
    return { data, response }
  },

  async 'identities.balanceAndRevision'(sdk, { id }) {
    const response = await sdk.identities.balanceAndRevisionWithProof(id)
    const found = response.data
    if (!found) return { data: null, response }
    const data = { balance: found.balance, revision: Number(found.revision) }
    found.free?.()
    return { data, response }
  },

  async 'identities.byNonUniquePublicKeyHash'(sdk, { pkh, startAfter }) {
    const response = await sdk.identities.byNonUniquePublicKeyHashWithProof(pkh, startAfter)
    const data = response.data.map(identityDto)
    freeAll(response.data)
    return { data, response }
  },

  async 'group.identityGroups'(sdk, { identityId, memberContracts }) {
    const response = await sdk.group.identityGroupsWithProof({
      identityId,
      ...(memberContracts ? { memberDataContracts: memberContracts } : {}),
    })
    const data = response.data.map(identityGroupDto)
    freeAll(response.data)
    return { data, response }
  },

  async 'voting.contestedResourceIdentityVotes'(sdk, args) {
    const { identityId, limit, startAtVoteId, startAtIncluded, orderAscending } = args
    const response = await sdk.voting.contestedResourceIdentityVotesWithProof({
      identityId,
      ...(limit === undefined ? {} : { limit }),
      ...(startAtVoteId === undefined ? {} : { startAtVoteId }),
      ...(startAtIncluded === undefined ? {} : { startAtIncluded }),
      ...(orderAscending === undefined ? {} : { orderAscending }),
    })
    const data: IdentityVoteDto[] = []
    for (const [voteId, vote] of response.data) {
      data.push(identityVoteDto(voteId, vote))
      vote.free?.()
    }
    return { data, response }
  },
}
