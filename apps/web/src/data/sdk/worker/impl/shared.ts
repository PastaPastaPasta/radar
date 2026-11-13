import type { SharedMethods } from '../../methods'
import {
  contractDto,
  contractFullDto,
  currentQuorumsDto,
  documentDto,
  dpnsUsernameDto,
  epochDto,
  finalizedEpochDto,
  identityDto,
  identityTokenInfoDto,
  platformAddressInfoDto,
  statusDto,
  tokenContractInfoDto,
  tokenStatusDto,
  versionUpgradeStateDto,
  votePollsByEndDateDto,
  type ContractLike,
  type CurrentQuorumsLike,
  type DocumentLike,
  type DpnsUsernameLike,
  type EpochLike,
  type FinalizedEpochLike,
  type FullContractLike,
  type IdentityLike,
  type PlatformAddressInfoLike,
  type StatusLike,
  type TokenContractInfoLike,
  type VersionUpgradeStateLike,
  type VotePollsEntryLike,
} from '../convert'
import { isNotFound, messageOf } from '../errors'
import type { Freeable, ImplOf, ProvedResponse } from './types'

/** Drive's most rows for one document query. */
export const MAX_DOCUMENTS = 100

/** The part of `EvoSDK` the shared methods read. Writes are not here, so no state transition is reachable. */
export interface SharedReads {
  identities: {
    fetchWithProof(id: string): Promise<ProvedResponse<IdentityLike | null | undefined>>
    balancesWithProof(ids: string[]): Promise<ProvedResponse<Map<string, bigint | undefined>>>
    byPublicKeyHashWithProof(hash: string): Promise<ProvedResponse<IdentityLike | null | undefined>>
  }
  contracts: {
    getManyWithProof(ids: string[]): Promise<ProvedResponse<Map<string, ContractLike | undefined>>>
    fetchWithProof(id: string): Promise<ProvedResponse<FullContractLike | null | undefined>>
  }
  dpns: {
    usernamesWithProof(query: {
      identityId: string
      limit?: number
    }): Promise<ProvedResponse<string[]>>
    getUsernameByNameWithProof(
      name: string,
    ): Promise<ProvedResponse<DpnsUsernameLike | null | undefined>>
  }
  documents: {
    queryWithProof(query: {
      dataContractId: string
      documentTypeName: string
      where?: [string, string, unknown][]
      orderBy?: [string, 'asc' | 'desc'][]
      limit?: number
      startAfter?: string
      startAt?: string
    }): Promise<ProvedResponse<Map<string, DocumentLike | undefined>>>
    getWithProof(
      contractId: string,
      type: string,
      id: string,
    ): Promise<ProvedResponse<DocumentLike | null | undefined>>
  }
  tokens: {
    contractInfoWithProof(
      tokenId: string,
    ): Promise<ProvedResponse<TokenContractInfoLike | null | undefined>>
    totalSupplyWithProof(
      tokenId: string,
    ): Promise<ProvedResponse<{ totalSupply: bigint } | null | undefined>>
    statusesWithProof(
      tokenIds: string[],
    ): Promise<ProvedResponse<Map<string, ({ isPaused: boolean } & Freeable) | undefined>>>
    balancesWithProof(
      identityIds: string[],
      tokenId: string,
    ): Promise<ProvedResponse<Map<string, bigint | undefined>>>
    identityBalancesWithProof(
      identityId: string,
      tokenIds: string[],
    ): Promise<ProvedResponse<Map<string, bigint | undefined>>>
    identityTokenInfosWithProof(
      identityId: string,
      tokenIds: string[],
    ): Promise<ProvedResponse<Map<string, ({ isFrozen: boolean } & Freeable) | undefined>>>
    calculateId(contractId: string, position: number): Promise<string>
  }
  epoch: {
    currentWithProof(): Promise<ProvedResponse<EpochLike>>
    epochsInfoWithProof(query: {
      startEpoch?: number
      count?: number
      ascending?: boolean
    }): Promise<ProvedResponse<Map<number, EpochLike | undefined>>>
    finalizedInfosWithProof(query: {
      startEpoch: number
      count?: number
      ascending?: boolean
    }): Promise<ProvedResponse<Map<number, FinalizedEpochLike | undefined>>>
    evonodesProposedBlocksByIdsWithProof(
      epoch: number,
      ids: string[],
    ): Promise<ProvedResponse<Map<string, bigint>>>
    evonodesProposedBlocksByRangeWithProof(query: {
      epoch: number
      limit?: number
      startAfter?: string
    }): Promise<ProvedResponse<Map<string, bigint>>>
  }
  protocol: {
    versionUpgradeStateWithProof(): Promise<ProvedResponse<VersionUpgradeStateLike>>
    versionUpgradeVoteStatusWithProof(
      startProTxHash: string | undefined,
      count: number,
    ): Promise<ProvedResponse<Map<string, { version: number } & Freeable>>>
  }
  system: {
    status(): Promise<StatusLike & Freeable>
    totalCreditsInPlatformWithProof(): Promise<ProvedResponse<bigint | undefined>>
    currentQuorumsInfo(): Promise<CurrentQuorumsLike>
  }
  voting: {
    votePollsByEndDateWithProof(query: {
      startTimeMs?: number
      startTimeIncluded?: boolean
      endTimeMs?: number
      endTimeIncluded?: boolean
      limit?: number
      offset?: number
      orderAscending?: boolean
    }): Promise<ProvedResponse<VotePollsEntryLike[]>>
  }
  addresses: {
    getWithProof(
      address: string,
    ): Promise<ProvedResponse<PlatformAddressInfoLike | null | undefined>>
    getManyWithProof(
      addresses: string[],
    ): Promise<ProvedResponse<Map<string, PlatformAddressInfoLike | undefined>>>
  }
}

type Impl<M extends keyof SharedMethods> = ImplOf<SharedReads, M>

/** Every id the caller asked for has an entry: the SDK leaves out the ones it found nothing for. */
function allKeys<V, R>(
  keys: string[],
  found: Map<string, V | undefined>,
  map: (v: V, key: string) => R,
) {
  const out = new Map<string, R | null>(keys.map((k) => [k, null]))
  for (const [k, v] of found) if (v !== undefined) out.set(k, map(v, k))
  return out
}

const same = (v: bigint): bigint => v

/** Converts a wasm object to its DTO, then frees it. */
function toDto<V extends Freeable, R>(value: V, map: (v: V) => R): R {
  const dto = map(value)
  value.free?.()
  return dto
}

export const sharedImpl: { [M in keyof SharedMethods]: Impl<M> } = {
  async 'identities.fetch'(sdk, { id }) {
    const response = await sdk.identities.fetchWithProof(id)
    const identity = response.data
    return { data: identity ? toDto(identity, identityDto) : null, response }
  },

  async 'identities.balances'(sdk, { ids }) {
    const response = await sdk.identities.balancesWithProof(ids)
    return { data: allKeys(ids, response.data, same), response }
  },

  async 'identities.byPublicKeyHash'(sdk, { pkh }) {
    const response = await sdk.identities.byPublicKeyHashWithProof(pkh)
    const identity = response.data
    return { data: identity ? toDto(identity, identityDto) : null, response }
  },

  async 'contracts.getMany'(sdk, { ids }) {
    const response = await sdk.contracts.getManyWithProof(ids)
    return { data: allKeys(ids, response.data, (c) => toDto(c, contractDto)), response }
  },

  async 'contracts.fetch'(sdk, { id }) {
    let response: ProvedResponse<FullContractLike | null | undefined>
    try {
      response = await sdk.contracts.fetchWithProof(id)
    } catch (e) {
      // The SDK throws, rather than proving it, for a contract that is not there: the absence comes back unproved.
      if (isNotFound(e) || /contract not found/i.test(messageOf(e))) return { data: null }
      throw e
    }
    const contract = response.data
    return { data: contract ? toDto(contract, contractFullDto) : null, response }
  },

  async 'dpns.usernames'(sdk, { identityId, limit }) {
    const response = await sdk.dpns.usernamesWithProof({
      identityId,
      ...(limit === undefined ? {} : { limit }),
    })
    return { data: [...response.data], response }
  },

  async 'dpns.getUsernameByName'(sdk, { name }) {
    const response = await sdk.dpns.getUsernameByNameWithProof(name)
    const info = response.data
    return { data: info ? toDto(info, dpnsUsernameDto) : null, response }
  },

  async 'documents.query'(sdk, args) {
    const response = await sdk.documents.queryWithProof({
      dataContractId: args.contractId,
      documentTypeName: args.type,
      ...(args.where ? { where: args.where } : {}),
      ...(args.orderBy ? { orderBy: args.orderBy } : {}),
      limit: Math.min(args.limit ?? MAX_DOCUMENTS, MAX_DOCUMENTS),
      ...(args.startAfter ? { startAfter: args.startAfter } : {}),
      ...(args.startAt ? { startAt: args.startAt } : {}),
    })
    const data = []
    for (const doc of response.data.values()) {
      if (!doc) continue
      data.push(toDto(doc, documentDto))
    }
    return { data, response }
  },

  async 'documents.get'(sdk, { contractId, type, id }) {
    const response = await sdk.documents.getWithProof(contractId, type, id)
    const doc = response.data
    return { data: doc ? toDto(doc, documentDto) : null, response }
  },

  async 'tokens.contractInfo'(sdk, { tokenId }) {
    const response = await sdk.tokens.contractInfoWithProof(tokenId)
    const info = response.data
    return { data: info ? toDto(info, tokenContractInfoDto) : null, response }
  },

  async 'tokens.totalSupply'(sdk, { tokenId }) {
    const response = await sdk.tokens.totalSupplyWithProof(tokenId)
    return { data: response.data ? response.data.totalSupply : null, response }
  },

  async 'tokens.statuses'(sdk, { tokenIds }) {
    const response = await sdk.tokens.statusesWithProof(tokenIds)
    return { data: allKeys(tokenIds, response.data, (s) => toDto(s, tokenStatusDto)), response }
  },

  async 'tokens.balances'(sdk, { tokenId, identityIds }) {
    const response = await sdk.tokens.balancesWithProof(identityIds, tokenId)
    return { data: allKeys(identityIds, response.data, same), response }
  },

  async 'tokens.identityBalances'(sdk, { identityId, tokenIds }) {
    const response = await sdk.tokens.identityBalancesWithProof(identityId, tokenIds)
    return { data: allKeys(tokenIds, response.data, same), response }
  },

  async 'tokens.identityTokenInfos'(sdk, { identityId, tokenIds }) {
    const response = await sdk.tokens.identityTokenInfosWithProof(identityId, tokenIds)
    return {
      data: allKeys(tokenIds, response.data, (i) => toDto(i, identityTokenInfoDto)),
      response,
    }
  },

  async 'tokens.calculateId'(sdk, { contractId, position }) {
    return { data: await sdk.tokens.calculateId(contractId, position) }
  },

  async 'system.status'(sdk) {
    const status = await sdk.system.status()
    const { dto, coreChainLockedHeight, epoch, protocolVersion } = toDto(status, statusDto)
    return {
      data: dto,
      unprovedMeta: {
        height: dto.height,
        coreChainLockedHeight,
        epoch,
        timeMs: dto.timeMs,
        protocolVersion,
        chainId: dto.chainId,
      },
    }
  },

  async 'system.totalCredits'(sdk) {
    const response = await sdk.system.totalCreditsInPlatformWithProof()
    return { data: response.data ?? null, response }
  },

  async 'system.currentQuorumsInfo'(sdk) {
    const info = await sdk.system.currentQuorumsInfo()
    return { data: toDto(info, currentQuorumsDto) }
  },

  async 'epoch.current'(sdk) {
    const response = await sdk.epoch.currentWithProof()
    return { data: toDto(response.data, epochDto), response }
  },

  async 'epoch.epochsInfo'(sdk, args) {
    const response = await sdk.epoch.epochsInfoWithProof(args)
    const data = []
    for (const info of response.data.values()) {
      if (!info) continue
      data.push(toDto(info, epochDto))
    }
    return { data, response }
  },

  async 'epoch.finalizedInfos'(sdk, args) {
    const response = await sdk.epoch.finalizedInfosWithProof(args)
    const data = []
    for (const [index, info] of response.data) {
      if (!info) continue
      data.push(toDto(info, (i) => finalizedEpochDto(index, i)))
    }
    return { data, response }
  },

  async 'epoch.evonodesProposedBlocksByIds'(sdk, { epoch, proTxHashes }) {
    const response = await sdk.epoch.evonodesProposedBlocksByIdsWithProof(epoch, proTxHashes)
    return { data: new Map(response.data), response }
  },

  async 'epoch.evonodesProposedBlocksByRange'(sdk, args) {
    const response = await sdk.epoch.evonodesProposedBlocksByRangeWithProof(args)
    return { data: new Map(response.data), response }
  },

  async 'protocol.versionUpgradeState'(sdk) {
    const response = await sdk.protocol.versionUpgradeStateWithProof()
    return { data: toDto(response.data, versionUpgradeStateDto), response }
  },

  async 'protocol.versionUpgradeVoteStatus'(sdk, { startProTxHash, count }) {
    const response = await sdk.protocol.versionUpgradeVoteStatusWithProof(startProTxHash, count)
    const data = new Map<string, number>()
    for (const [proTxHash, status] of response.data) {
      data.set(proTxHash, status.version)
      status.free?.()
    }
    return { data, response }
  },

  async 'voting.votePollsByEndDate'(sdk, args) {
    const response = await sdk.voting.votePollsByEndDateWithProof(args)
    return { data: response.data.map((entry) => toDto(entry, votePollsByEndDateDto)), response }
  },

  async 'addresses.get'(sdk, { address }) {
    const response = await sdk.addresses.getWithProof(address)
    const info = response.data
    return { data: info ? toDto(info, (i) => platformAddressInfoDto(address, i)) : null, response }
  },

  async 'addresses.getMany'(sdk, { addresses }) {
    const response = await sdk.addresses.getManyWithProof(addresses)
    const data = allKeys(addresses, response.data, (info, address) =>
      toDto(info, (i) => platformAddressInfoDto(address, i)),
    )
    return { data, response }
  },
}
