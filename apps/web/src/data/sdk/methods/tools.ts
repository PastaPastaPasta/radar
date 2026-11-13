import type { DataClass } from '@/lib/data-class'
import type { DocumentsQueryArgs } from './shared'

/** What an aggregate query takes: the query's own filter, `groupBy` as the SDK spells it. `startAfter`/`startAt` don't apply. */
export interface DocumentsAggregateArgs extends Omit<DocumentsQueryArgs, 'startAfter' | 'startAt'> {
  /** Fields to group by: an `in` field, a range field, or both (SQL's GROUP BY). Absent: one total. */
  groupBy?: string[]
}

/** One group of a COUNT; `key` is the SDK's canonical group key (`''` for the ungrouped total). */
export interface CountGroupDto {
  key: string
  count: bigint
}

export interface SumGroupDto {
  key: string
  sum: bigint
}

export interface AverageGroupDto {
  key: string
  count: bigint
  sum: bigint
}

/** One element GroveDB returned for a path and key; every byte string is lower-case hex. */
export interface PathElementDto {
  /** The tree the element lives in, one hex segment per level (empty: the root tree). */
  path: string[]
  key: string
  /** `item`, `tree`, `sumTree`, `reference`, … as GroveDB names it; absent for a key that holds nothing. */
  elementType: string | null
  /** An item's bytes. */
  value: string | null
  sum: bigint | null
  /** Where a reference points, one hex segment per level. */
  referenceTarget: string[] | null
}

/** A contract's serialized form, which decoding a document against it needs, and the types it declares. */
export interface ContractBytesDto {
  id: string
  bytes: Uint8Array
  documentTypes: string[]
}

/** SDK methods only this package calls: add entries here, never in a shared file. */
export interface ToolsMethods {
  'documents.count': { args: DocumentsAggregateArgs; result: CountGroupDto[] }
  'documents.sum': { args: DocumentsAggregateArgs & { property: string }; result: SumGroupDto[] }
  'documents.average': {
    args: DocumentsAggregateArgs & { property: string }
    result: AverageGroupDto[]
  }
  /** The contract as the protocol serializes it (for the document decoder), proof-checked. */
  'contracts.serialized': { args: { id: string }; result: ContractBytesDto | null }
  /** A batched point read of GroveDB: `path` is the tree (hex segments), `keys` the entries asked for. */
  'system.pathElements': {
    args: { path: string[]; keys: string[] }
    result: PathElementDto[]
  }
}

export const TOOLS_CLASSES = {
  'documents.count': 'live',
  'documents.sum': 'live',
  'documents.average': 'live',
  'contracts.serialized': 'structural',
  'system.pathElements': 'live',
} as const satisfies Record<keyof ToolsMethods, DataClass>
