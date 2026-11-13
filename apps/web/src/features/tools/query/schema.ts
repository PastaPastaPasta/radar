import type { ContractFullDto, ContractIndexDto } from '@/data/sdk/methods'

/** One property of a document type. */
export interface FieldHelp {
  name: string
  /** The schema's type (`string`, `integer`, `array`, …), or `''` for a system field. */
  type: string
  /** Where it sits in an index: every index that lists it, with its 1-based position. */
  indexed: { index: string; position: number }[]
}

export interface IndexHelp {
  name: string
  unique: boolean
  contested: boolean
  /** Fields in index order. */
  fields: string[]
}

export interface TypeHelp {
  name: string
  fields: FieldHelp[]
  indexes: IndexHelp[]
}

export type OperatorKind = 'equal' | 'in' | 'range' | 'prefix'

/**
 * What a filter can do with the field at one position of an index. Platform walks an index in order: the leading
 * fields it filters take `==` or `IN`, and the last one it filters may take a range, a prefix or BETWEEN instead.
 */
export const POSITION_OPERATORS: Record<OperatorKind, string[]> = {
  equal: ['=='],
  in: ['IN'],
  range: ['<', '<=', '>', '>=', 'BETWEEN'],
  prefix: ['STARTS WITH'],
}

const SYSTEM_FIELDS = [
  '$id',
  '$ownerId',
  '$createdAt',
  '$updatedAt',
  '$transferredAt',
  '$revision',
  '$createdAtBlockHeight',
  '$updatedAtBlockHeight',
  '$createdAtCoreBlockHeight',
  '$updatedAtCoreBlockHeight',
]

function propertiesOf(schema: unknown): [string, string][] {
  if (!schema || typeof schema !== 'object') return []
  const props = (schema as { properties?: unknown }).properties
  if (!props || typeof props !== 'object') return []
  return Object.entries(props as Record<string, unknown>).map(([name, def]) => {
    const type =
      def && typeof def === 'object' && typeof (def as { type?: unknown }).type === 'string'
        ? (def as { type: string }).type
        : ''
    return [name, type]
  })
}

function indexHelp(index: ContractIndexDto): IndexHelp {
  return {
    name: index.name,
    unique: index.unique,
    contested: index.contested,
    fields: index.properties.map((p) => p.field),
  }
}

/** The document types of a contract with their fields and indexes, for the schema panel and the field suggestions. */
export function typeHelp(contract: ContractFullDto): TypeHelp[] {
  const names = new Set([
    ...Object.keys(contract.documentSchemas),
    ...Object.keys(contract.indices),
  ])
  return [...names].sort().map((name) => {
    const indexes = (contract.indices[name] ?? []).map(indexHelp)
    const where = (field: string) =>
      indexes.flatMap((ix) => {
        const position = ix.fields.indexOf(field) + 1
        return position > 0 ? [{ index: ix.name, position }] : []
      })
    const declared = propertiesOf(contract.documentSchemas[name])
    const fields: FieldHelp[] = [
      ...declared.map(([field, type]) => ({ name: field, type, indexed: where(field) })),
      ...SYSTEM_FIELDS.filter((f) => indexes.some((ix) => ix.fields.includes(f))).map((f) => ({
        name: f,
        type: '',
        indexed: where(f),
      })),
    ]
    return { name, fields, indexes }
  })
}
