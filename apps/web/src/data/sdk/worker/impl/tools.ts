import { bytesToHex, hexToBytes, isHex } from '@/lib/hex'
import type { ToolsMethods } from '../../methods'
import { isNotFound, messageOf } from '../errors'
import type { Freeable, ImplOf, ProvedResponse } from './types'

type DocumentsAggregateArgs = ToolsMethods['documents.count']['args']
type PathElementDto = ToolsMethods['system.pathElements']['result'][number]

interface AggregateQuery {
  dataContractId: string
  documentTypeName: string
  where?: [string, string, unknown][]
  orderBy?: [string, 'asc' | 'desc'][]
  limit?: number
  groupBy?: string[]
}

/** The grove element the SDK hands back (`PathElement`). */
export interface PathElementLike {
  key: Uint8Array
  pathBytes: Uint8Array[]
  elementType?: string
  valueBytes?: Uint8Array
  sum?: bigint
  referenceTarget?: Uint8Array[]
  free?: () => void
}

/** A contract the SDK handed back, with the two reads the decoder needs. */
export interface SerializableContract extends Freeable {
  toBytes(platformVersion: number): Uint8Array
  toJSON(): { documentSchemas?: Record<string, unknown> }
}

/** The part of `EvoSDK` this package's methods read. */
export interface ToolsReads {
  contracts: {
    fetchWithProof(id: string): Promise<ProvedResponse<SerializableContract | null | undefined>>
  }
  documents: {
    countWithProof(query: AggregateQuery): Promise<ProvedResponse<Map<string, bigint>>>
    sumWithProof(
      query: AggregateQuery,
      property: string,
    ): Promise<ProvedResponse<Map<string, bigint>>>
    averageWithProof(
      query: AggregateQuery,
      property: string,
    ): Promise<ProvedResponse<Map<string, { count: bigint; sum: bigint }>>>
  }
  system: {
    pathElementsWithProof(
      path: Uint8Array[],
      keys: Uint8Array[],
    ): Promise<ProvedResponse<PathElementLike[]>>
  }
}

type Impl<M extends keyof ToolsMethods> = ImplOf<ToolsReads, M>

/** An aggregate has no paging, and Drive caps a grouped answer at a page of groups. */
const MAX_GROUPS = 100

function aggregateQuery(args: DocumentsAggregateArgs): AggregateQuery {
  return {
    dataContractId: args.contractId,
    documentTypeName: args.type,
    ...(args.where ? { where: args.where } : {}),
    ...(args.orderBy ? { orderBy: args.orderBy } : {}),
    ...(args.groupBy && args.groupBy.length > 0 ? { groupBy: args.groupBy } : {}),
    ...(args.limit === undefined ? {} : { limit: Math.min(args.limit, MAX_GROUPS) }),
  }
}

const invalid = (message: string) => Object.assign(new Error(message), { name: 'InvalidArgument' })

function segments(hex: string[]): Uint8Array[] {
  return hex.map((segment) => {
    if (!isHex(segment))
      throw invalid(`A GroveDB path segment is hex bytes, not "${segment.slice(0, 20)}"`)
    return hexToBytes(segment)
  })
}

function pathElementDto(e: PathElementLike): PathElementDto {
  const key = bytesToHex(e.key)
  const full = e.pathBytes.map(bytesToHex)
  return {
    // The SDK hands back the path with the key as its last segment.
    path: full.at(-1) === key ? full.slice(0, -1) : full,
    key,
    elementType: e.elementType ?? null,
    value: e.valueBytes ? bytesToHex(e.valueBytes) : null,
    sum: e.sum ?? null,
    referenceTarget: e.referenceTarget ? e.referenceTarget.map(bytesToHex) : null,
  }
}

export const toolsImpl: { [M in keyof ToolsMethods]: Impl<M> } = {
  async 'documents.count'(sdk, args) {
    const response = await sdk.documents.countWithProof(aggregateQuery(args))
    return { data: [...response.data].map(([key, count]) => ({ key, count })), response }
  },

  async 'documents.sum'(sdk, args) {
    const response = await sdk.documents.sumWithProof(aggregateQuery(args), args.property)
    return { data: [...response.data].map(([key, sum]) => ({ key, sum })), response }
  },

  async 'documents.average'(sdk, args) {
    const response = await sdk.documents.averageWithProof(aggregateQuery(args), args.property)
    return {
      data: [...response.data].map(([key, v]) => ({ key, count: v.count, sum: v.sum })),
      response,
    }
  },

  async 'contracts.serialized'(sdk, { id }) {
    let response: ProvedResponse<SerializableContract | null | undefined>
    try {
      response = await sdk.contracts.fetchWithProof(id)
    } catch (e) {
      if (isNotFound(e) || /contract not found/i.test(messageOf(e))) return { data: null }
      throw e
    }
    const contract = response.data
    if (!contract) return { data: null, response }
    try {
      const bytes = contract.toBytes(Number(response.metadata.protocolVersion))
      const documentTypes = Object.keys(contract.toJSON().documentSchemas ?? {})
      return { data: { id, bytes, documentTypes }, response }
    } finally {
      contract.free?.()
    }
  },

  async 'system.pathElements'(sdk, { path, keys }) {
    const response = await sdk.system.pathElementsWithProof(segments(path), segments(keys))
    const data = response.data.map((element) => {
      const dto = pathElementDto(element)
      element.free?.()
      return dto
    })
    return { data, response }
  },
}
