import type { DataClass } from '@/lib/data-class'
import type { ContractFullDto, ContractGroupDto, DocumentDto } from './shared'

/** One version of a contract that keeps history, at the time Platform recorded it (ms since the epoch). */
export interface ContractVersionDto {
  atMs: number
  contract: ContractFullDto
}

/** One revision of a document of a type that keeps history. */
export interface DocumentRevisionDto {
  atMs: number
  document: DocumentDto
}

export type GroupActionStatus = 'active' | 'closed'

export interface GroupMemberDto {
  id: string
  power: number
}

export interface GroupActionDto {
  id: string
  proposerId: string
  /** The token position in the contract the action concerns. */
  tokenPosition: number
  /** The event's name (`mint`, `freeze`, …), its note when it has one, and the event as the SDK states it. */
  eventName: string
  note: string | null
  event: Record<string, unknown>
}

export interface GroupSignerDto {
  id: string
  power: number
}

/** SDK methods only this package calls: add entries here, never in a shared file. */
export interface PDataMethods {
  /** Oldest first; Platform answers at most 10 versions, and the next page starts at `startAtMs` (inclusive). */
  'contracts.getHistory': {
    args: { id: string; limit?: number; startAtMs?: number }
    result: ContractVersionDto[]
  }
  /** Oldest first. Platform answers at most 10 revisions and, for a proof, takes no offset: the next page starts after `startAtMs` (exclusive). */
  'documents.history': {
    args: { contractId: string; type: string; id: string; limit?: number; startAtMs?: number }
    result: DocumentRevisionDto[]
  }
  'group.infos': {
    args: { contractId: string; startAtPosition?: number; limit?: number }
    result: ContractGroupDto[]
  }
  'group.info': {
    args: { contractId: string; position: number }
    result: ContractGroupDto | null
  }
  'group.members': {
    args: { contractId: string; position: number; startAfter?: string; limit?: number }
    result: GroupMemberDto[]
  }
  'group.actions': {
    args: {
      contractId: string
      position: number
      status: GroupActionStatus
      startAfter?: string
      limit?: number
    }
    result: GroupActionDto[]
  }
  'group.actionSigners': {
    args: { contractId: string; position: number; status: GroupActionStatus; actionId: string }
    result: GroupSignerDto[]
  }
}

export const P_DATA_CLASSES = {
  'contracts.getHistory': 'structural',
  'documents.history': 'live',
  'group.infos': 'structural',
  'group.info': 'structural',
  'group.members': 'structural',
  'group.actions': 'live',
  'group.actionSigners': 'live',
} as const satisfies Record<keyof PDataMethods, DataClass>
