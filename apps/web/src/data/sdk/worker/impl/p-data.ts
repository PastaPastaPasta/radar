import type { ContractGroupDto, PDataMethods } from '../../methods'
import {
  contractFullDto,
  documentDto,
  idText,
  type DocumentLike,
  type FullContractLike,
} from '../convert'
import type { Freeable, ImplOf, ProvedResponse } from './types'

/** What a group answers: its members' powers and the power a decision needs. */
interface GroupLike extends Freeable {
  toJSON(): { members?: Record<string, unknown>; requiredPower?: unknown }
}

interface GroupActionLike extends Freeable {
  proposerId: { toString(): string } | string
  tokenContractPosition: number
  event: {
    eventName(): string
    publicNote?(): string | undefined
    toJSON(): Record<string, unknown>
  }
}

type ActionStatus = 'ACTIVE' | 'CLOSED'

/** The part of `EvoSDK` this package's methods read. */
export interface PDataReads {
  contracts: {
    getHistoryWithProof(query: {
      dataContractId: string
      limit?: number
      startAtMs?: number
    }): Promise<ProvedResponse<Map<bigint, FullContractLike>>>
  }
  documents: {
    historyWithProof(query: {
      dataContractId: string
      documentTypeName: string
      documentId: string
      limit?: number
      startAtMs?: number
    }): Promise<ProvedResponse<Map<bigint, DocumentLike>>>
  }
  group: {
    infoWithProof(
      contractId: string,
      position: number,
    ): Promise<ProvedResponse<GroupLike | null | undefined>>
    infosWithProof(query: {
      dataContractId: string
      startAt?: { position: number; included?: boolean }
      limit?: number
    }): Promise<ProvedResponse<Map<number, GroupLike | undefined>>>
    membersWithProof(query: {
      dataContractId: string
      groupContractPosition: number
      startAtMemberId?: string
      limit?: number
    }): Promise<ProvedResponse<Map<string, bigint | number>>>
    actionsWithProof(query: {
      dataContractId: string
      groupContractPosition: number
      status: ActionStatus
      startAt?: { actionId: string; included?: boolean }
      limit?: number
    }): Promise<ProvedResponse<Map<string, GroupActionLike | undefined>>>
    actionSignersWithProof(query: {
      dataContractId: string
      groupContractPosition: number
      status: ActionStatus
      actionId: string
    }): Promise<ProvedResponse<Map<string, bigint | number>>>
  }
}

type Impl<M extends keyof PDataMethods> = ImplOf<PDataReads, M>

const statusOf = (s: 'active' | 'closed'): ActionStatus => (s === 'closed' ? 'CLOSED' : 'ACTIVE')

/** Power entries as rows, strongest first. */
const powers = (entries: Iterable<[string, unknown]>) =>
  [...entries]
    .map(([id, power]) => ({ id, power: Number(power) }))
    .sort((a, b) => b.power - a.power || (a.id < b.id ? -1 : 1))

function groupDto(position: number, group: GroupLike): ContractGroupDto {
  const json = group.toJSON()
  return {
    position,
    requiredPower: Number(json.requiredPower ?? 0),
    members: powers(Object.entries(json.members ?? {})),
  }
}

export const pDataImpl: { [M in keyof PDataMethods]: Impl<M> } = {
  async 'contracts.getHistory'(sdk, { id, limit, startAtMs }) {
    const response = await sdk.contracts.getHistoryWithProof({
      dataContractId: id,
      ...(limit === undefined ? {} : { limit }),
      ...(startAtMs === undefined ? {} : { startAtMs }),
    })
    const data = []
    for (const [at, contract] of response.data) {
      data.push({ atMs: Number(at), contract: contractFullDto(contract) })
      contract.free?.()
    }
    data.sort((a, b) => a.atMs - b.atMs)
    return { data, response }
  },

  async 'documents.history'(sdk, { contractId, type, id, limit, startAtMs }) {
    const response = await sdk.documents.historyWithProof({
      dataContractId: contractId,
      documentTypeName: type,
      documentId: id,
      ...(limit === undefined ? {} : { limit }),
      ...(startAtMs === undefined ? {} : { startAtMs }),
    })
    const data = []
    for (const [at, doc] of response.data) {
      data.push({ atMs: Number(at), document: documentDto(doc) })
      doc.free?.()
    }
    data.sort((a, b) => a.atMs - b.atMs)
    return { data, response }
  },

  async 'group.infos'(sdk, { contractId, startAtPosition, limit }) {
    const response = await sdk.group.infosWithProof({
      dataContractId: contractId,
      ...(startAtPosition === undefined
        ? {}
        : { startAt: { position: startAtPosition, included: true } }),
      ...(limit === undefined ? {} : { limit }),
    })
    const data: ContractGroupDto[] = []
    for (const [position, group] of response.data) {
      if (!group) continue
      data.push(groupDto(position, group))
      group.free?.()
    }
    data.sort((a, b) => a.position - b.position)
    return { data, response }
  },

  async 'group.info'(sdk, { contractId, position }) {
    const response = await sdk.group.infoWithProof(contractId, position)
    const group = response.data
    if (!group) return { data: null, response }
    const dto = groupDto(position, group)
    group.free?.()
    return { data: dto, response }
  },

  async 'group.members'(sdk, { contractId, position, startAfter, limit }) {
    const response = await sdk.group.membersWithProof({
      dataContractId: contractId,
      groupContractPosition: position,
      ...(startAfter ? { startAtMemberId: startAfter } : {}),
      ...(limit === undefined ? {} : { limit }),
    })
    return { data: powers(response.data), response }
  },

  async 'group.actions'(sdk, { contractId, position, status, startAfter, limit }) {
    const response = await sdk.group.actionsWithProof({
      dataContractId: contractId,
      groupContractPosition: position,
      status: statusOf(status),
      ...(startAfter ? { startAt: { actionId: startAfter, included: false } } : {}),
      ...(limit === undefined ? {} : { limit }),
    })
    const data = []
    for (const [id, action] of response.data) {
      if (!action) continue
      const event = action.event.toJSON()
      data.push({
        id,
        proposerId: idText(action.proposerId),
        tokenPosition: action.tokenContractPosition,
        eventName: action.event.eventName(),
        note: action.event.publicNote?.() ?? null,
        event,
      })
      action.free?.()
    }
    return { data, response }
  },

  async 'group.actionSigners'(sdk, { contractId, position, status, actionId }) {
    const response = await sdk.group.actionSignersWithProof({
      dataContractId: contractId,
      groupContractPosition: position,
      status: statusOf(status),
      actionId,
    })
    return { data: powers(response.data), response }
  },
}
