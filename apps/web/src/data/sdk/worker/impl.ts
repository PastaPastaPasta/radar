import type { SdkMethodName, SdkMethods } from '../methods'
import {
  contractDto,
  epochDto,
  identityDto,
  statusDto,
  type ContractLike,
  type EpochLike,
  type IdentityLike,
  type StatusLike,
} from './convert'

/** The proof-checked answer of a `*WithProof` call: data, the Platform block it refers to, and the proof. */
export interface ProvedResponse<T> extends Freeable {
  data: T
  metadata: {
    height: bigint | number
    coreChainLockedHeight: number
    epoch: number
    timeMs: bigint | number
    protocolVersion: number
    chainId: Uint8Array
  }
  proof: {
    grovedbProof: Uint8Array
    quorumHash: Uint8Array
    signature: Uint8Array
    round: number
    blockIdHash: Uint8Array
    quorumType: number
  }
}

interface Freeable {
  free?: () => void
}

/** The part of `EvoSDK` Radar reads from. Writes are not here, so no state transition is reachable. */
export interface SdkReads {
  identities: {
    fetchWithProof(id: string): Promise<ProvedResponse<IdentityLike | null | undefined>>
    balancesWithProof(ids: string[]): Promise<ProvedResponse<Map<string, bigint | undefined>>>
  }
  contracts: {
    getManyWithProof(ids: string[]): Promise<ProvedResponse<Map<string, ContractLike | undefined>>>
  }
  epoch: { currentWithProof(): Promise<ProvedResponse<EpochLike>> }
  system: {
    status(): Promise<StatusLike & Freeable>
    totalCreditsInPlatformWithProof(): Promise<ProvedResponse<bigint | undefined>>
  }
}

/** What an implementation hands back: the DTO, and the proof response when the call had one (`proved` follows from it). */
export interface ImplOutput<R> {
  data: R
  response?: ProvedResponse<unknown>
  /** Metadata for an answer that has no proof (`system.status`). */
  unprovedMeta?: {
    height: number
    coreChainLockedHeight: number
    epoch: number
    timeMs: number
    protocolVersion: number
    chainId: string
  }
}

type Impl<M extends SdkMethodName> = (
  sdk: SdkReads,
  args: SdkMethods[M]['args'],
) => Promise<ImplOutput<SdkMethods[M]['result']>>

export const impl: { [M in SdkMethodName]: Impl<M> } = {
  async 'identities.fetch'(sdk, { id }) {
    const response = await sdk.identities.fetchWithProof(id)
    const identity = response.data
    const data = identity ? identityDto(identity) : null
    identity?.free?.()
    return { data, response }
  },

  async 'identities.balances'(sdk, { ids }) {
    const response = await sdk.identities.balancesWithProof(ids)
    const data = new Map<string, bigint | null>(ids.map((id) => [id, null]))
    for (const [id, balance] of response.data) data.set(id, balance ?? null)
    return { data, response }
  },

  async 'contracts.getMany'(sdk, { ids }) {
    const response = await sdk.contracts.getManyWithProof(ids)
    const data = new Map<string, ReturnType<typeof contractDto> | null>(ids.map((id) => [id, null]))
    for (const [id, contract] of response.data) {
      if (!contract) continue
      data.set(id, contractDto(contract))
      contract.free?.()
    }
    return { data, response }
  },

  async 'epoch.current'(sdk) {
    const response = await sdk.epoch.currentWithProof()
    const data = epochDto(response.data)
    response.data.free?.()
    return { data, response }
  },

  async 'system.totalCredits'(sdk) {
    const response = await sdk.system.totalCreditsInPlatformWithProof()
    return { data: response.data ?? null, response }
  },

  async 'system.status'(sdk) {
    const status = await sdk.system.status()
    const { dto, coreChainLockedHeight, epoch, protocolVersion } = statusDto(status)
    status.free?.()
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
}
