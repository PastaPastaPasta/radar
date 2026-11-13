import type { ContractIndexDto } from '@/data/sdk/methods'
import { isPlatformId } from '@/lib/base58'
import type { WhereClause, WhereOp } from '@/lib/search-schemas'

export type FieldType = 'string' | 'integer' | 'number' | 'boolean' | 'identifier' | 'other'

export interface FilterIndex {
  name: string
  properties: { field: string; order: 'asc' | 'desc' }[]
  unique: boolean
  /** The primary key every document type has; it is in no `indices` list. */
  implicit?: boolean
}

export const RANGE_OPS: readonly WhereOp[] = ['lt', 'lte', 'gt', 'gte', 'sw']
export const ALL_OPS: readonly WhereOp[] = ['eq', 'lt', 'lte', 'gt', 'gte', 'in', 'sw']
const LOWER: readonly WhereOp[] = ['gt', 'gte']
const UPPER: readonly WhereOp[] = ['lt', 'lte']

/** Drive's most values in one `in` clause. */
export const MAX_IN_VALUES = 100

export const OP_SYMBOL: Record<WhereOp, string> = {
  eq: '=',
  lt: '<',
  lte: '≤',
  gt: '>',
  gte: '≥',
  in: 'in',
  sw: 'starts with',
}

/** The SDK's own spelling of each operator. */
export const SDK_OP: Record<WhereOp, string> = {
  eq: '==',
  lt: '<',
  lte: '<=',
  gt: '>',
  gte: '>=',
  in: 'in',
  sw: 'startsWith',
}

const SYSTEM_FIELDS: Record<string, FieldType> = {
  $id: 'identifier',
  $ownerId: 'identifier',
  $createdAt: 'integer',
  $updatedAt: 'integer',
  $transferredAt: 'integer',
  $createdAtBlockHeight: 'integer',
  $updatedAtBlockHeight: 'integer',
  $transferredAtBlockHeight: 'integer',
  $createdAtCoreBlockHeight: 'integer',
  $updatedAtCoreBlockHeight: 'integer',
  $transferredAtCoreBlockHeight: 'integer',
}

const PRIMARY_KEY: FilterIndex = {
  name: '$id',
  properties: [{ field: '$id', order: 'asc' }],
  unique: true,
  implicit: true,
}

/** A type's indices as the browser offers them: its own, then the primary key. */
export function filterIndices(indices: readonly ContractIndexDto[] | undefined): FilterIndex[] {
  const own = (indices ?? []).filter((i) => i.properties.length > 0)
  return [...own.map((i) => ({ ...i })), PRIMARY_KEY]
}

type Schema = Record<string, unknown> | undefined

/** The type a field holds, read from the document type's schema (`records.identity` walks into `records`). */
export function fieldType(schema: Schema, field: string): FieldType {
  const system = SYSTEM_FIELDS[field]
  if (system) return system
  let node: unknown = schema
  for (const part of field.split('.')) {
    const props = (node as { properties?: Record<string, unknown> } | undefined)?.properties
    node = props?.[part]
    if (!node) return 'other'
  }
  const def = node as { type?: unknown; byteArray?: unknown; contentMediaType?: unknown }
  if (def.byteArray === true) {
    return typeof def.contentMediaType === 'string' && def.contentMediaType.includes('identifier')
      ? 'identifier'
      : 'other'
  }
  if (def.type === 'string' || def.type === 'boolean' || def.type === 'integer') return def.type
  if (def.type === 'number') return 'number'
  return 'other'
}

/** Every indexed field, in the order the indices first name them. */
export function indexedFields(indices: readonly FilterIndex[]): string[] {
  const seen = new Set<string>()
  for (const index of indices) for (const p of index.properties) seen.add(p.field)
  return [...seen]
}

const isRange = (op: WhereOp) => RANGE_OPS.includes(op)

export type ProblemRule =
  | 'unknown-field'
  | 'no-index'
  | 'skips-property'
  | 'range-not-last'
  | 'two-range-fields'
  | 'duplicate-field'
  | 'two-in'
  | 'empty-value'
  | 'in-too-many'
  | 'in-duplicate'
  | 'starts-with-type'
  | 'bad-number'
  | 'bad-boolean'
  | 'bad-identifier'
  | 'order-unknown'
  | 'order-sequence'
  | 'order-missing'

export interface Problem {
  rule: ProblemRule
  /** The field the rule is about. */
  field?: string
  /** A second field or name the message mentions (the property that must come first, the index). */
  other?: string
  index?: string
}

const values = (c: WhereClause): string[] => (Array.isArray(c.value) ? c.value : [c.value])

function valueProblems(c: WhereClause, type: FieldType): Problem[] {
  const out: Problem[] = []
  const list = values(c)
  if (c.op === 'in') {
    if (list.length > MAX_IN_VALUES) out.push({ rule: 'in-too-many', field: c.field })
    if (new Set(list).size !== list.length) out.push({ rule: 'in-duplicate', field: c.field })
  }
  if (list.some((v) => v === '')) return [...out, { rule: 'empty-value', field: c.field }]
  if (c.op === 'sw' && type !== 'string')
    return [...out, { rule: 'starts-with-type', field: c.field }]
  for (const v of list) {
    if ((type === 'integer' || type === 'number') && !Number.isFinite(Number(v))) {
      return [...out, { rule: 'bad-number', field: c.field }]
    }
    if (type === 'integer' && !/^-?\d+$/.test(v))
      return [...out, { rule: 'bad-number', field: c.field }]
    if (type === 'boolean' && v !== 'true' && v !== 'false') {
      return [...out, { rule: 'bad-boolean', field: c.field }]
    }
    if (type === 'identifier' && !isPlatformId(v))
      return [...out, { rule: 'bad-identifier', field: c.field }]
  }
  return out
}

/** Drive reads an index's properties in order: equalities first, then at most one range, on the last one used. */
function checkAgainst(
  clauses: readonly WhereClause[],
  order: readonly string[],
  index: FilterIndex,
): Problem[] {
  const out: Problem[] = []
  const positions = index.properties.map((p) => p.field)
  const used = new Set(clauses.map((c) => c.field))
  const furthest = Math.max(-1, ...clauses.map((c) => positions.indexOf(c.field)))

  for (const c of clauses) {
    const at = positions.indexOf(c.field)
    if (at < 0) continue
    for (let i = 0; i < at; i++) {
      const before = positions[i]!
      if (!used.has(before)) {
        out.push({ rule: 'skips-property', field: c.field, other: before, index: index.name })
        break
      }
    }
    if (isRange(c.op) && at < furthest) {
      out.push({
        rule: 'range-not-last',
        field: c.field,
        other: positions[furthest]!,
        index: index.name,
      })
    }
  }
  return [...out, ...orderProblems(clauses, order, index)]
}

function orderProblems(
  clauses: readonly WhereClause[],
  order: readonly string[],
  index: FilterIndex,
): Problem[] {
  if (order.length === 0) return []
  const fields = order.map(orderField)
  const positions = index.properties.map((p) => p.field)
  const out: Problem[] = []
  for (const f of fields) {
    if (!positions.includes(f)) out.push({ rule: 'order-unknown', field: f, index: index.name })
  }
  if (out.length > 0) return out
  const equalOnly = new Set(clauses.filter((c) => c.op === 'eq').map((c) => c.field))
  const expected = positions.filter((p) => !equalOnly.has(p))
  const asked = fields.filter((f) => !equalOnly.has(f))
  const prefix = expected.slice(0, asked.length)
  if (asked.some((f, i) => f !== prefix[i])) {
    return [{ rule: 'order-sequence', field: expected[0] ?? '', index: index.name }]
  }
  for (const c of clauses) {
    if ((c.op === 'in' || isRange(c.op)) && !fields.includes(c.field)) {
      return [{ rule: 'order-missing', field: c.field, index: index.name }]
    }
  }
  return []
}

/** `-field` is descending, `field` ascending. */
export const orderField = (item: string): string => (item.startsWith('-') ? item.slice(1) : item)
export const orderDirection = (item: string): 'asc' | 'desc' =>
  item.startsWith('-') ? 'desc' : 'asc'

/**
 * Everything that would make Platform refuse the query, found before any request. A query is fine when at least one
 * index of the type serves it; otherwise the answer names the rules the closest index breaks.
 */
export function validateQuery(
  clauses: readonly WhereClause[],
  order: readonly string[],
  indices: readonly FilterIndex[],
  schema: Schema,
): Problem[] {
  const indexed = new Set(indexedFields(indices))
  const problems: Problem[] = []

  for (const c of clauses) {
    if (!indexed.has(c.field)) problems.push({ rule: 'unknown-field', field: c.field })
  }
  if (problems.length > 0) return problems

  if (clauses.filter((c) => c.op === 'in').length > 1) problems.push({ rule: 'two-in' })
  const rangeFields = new Set(clauses.filter((c) => isRange(c.op)).map((c) => c.field))
  if (rangeFields.size > 1) {
    const [a, b] = [...rangeFields]
    problems.push({ rule: 'two-range-fields', field: a!, other: b! })
  }
  const byField = new Map<string, WhereClause[]>()
  for (const c of clauses) byField.set(c.field, [...(byField.get(c.field) ?? []), c])
  for (const [field, list] of byField) {
    if (list.length < 2) continue
    const [a, b] = list as [WhereClause, WhereClause]
    const bounds =
      list.length === 2 &&
      ((LOWER.includes(a.op) && UPPER.includes(b.op)) ||
        (UPPER.includes(a.op) && LOWER.includes(b.op)))
    if (!bounds) problems.push({ rule: 'duplicate-field', field })
  }
  for (const c of clauses) problems.push(...valueProblems(c, fieldType(schema, c.field)))
  if (problems.length > 0) return problems

  if (clauses.length === 0 && order.length === 0) return []
  const candidates = indices.filter((i) =>
    clauses.every((c) => i.properties.some((p) => p.field === c.field)),
  )
  if (candidates.length === 0) {
    return [{ rule: 'no-index', field: clauses[0]?.field ?? '', other: clauses[1]?.field ?? '' }]
  }
  let best: Problem[] | undefined
  for (const index of candidates) {
    const found = checkAgainst(clauses, order, index)
    if (found.length === 0) return []
    if (!best || found.length < best.length) best = found
  }
  return best ?? []
}

/** The index a query is served by, when one is. */
export function servingIndex(
  clauses: readonly WhereClause[],
  order: readonly string[],
  indices: readonly FilterIndex[],
): FilterIndex | undefined {
  return indices.find(
    (i) =>
      clauses.every((c) => i.properties.some((p) => p.field === c.field)) &&
      checkAgainst(clauses, order, i).length === 0,
  )
}

/** What each property of an index may be asked with, given the other clauses (the form offers only these). */
export function opsAt(
  index: FilterIndex,
  field: string,
  type: FieldType,
  clauses: readonly WhereClause[],
): WhereOp[] {
  const positions = index.properties.map((p) => p.field)
  const at = positions.indexOf(field)
  if (at < 0) return []
  const others = clauses.filter((c) => c.field !== field)
  const later = others.some((c) => positions.indexOf(c.field) > at)
  const rangeElsewhere = others.some((c) => isRange(c.op))
  const inElsewhere = others.some((c) => c.op === 'in')
  const ops: WhereOp[] = ['eq']
  if (!inElsewhere) ops.push('in')
  if (!later && !rangeElsewhere) {
    ops.push('lt', 'lte', 'gt', 'gte')
    if (type === 'string') ops.push('sw')
  }
  return ops
}

/** The order the SDK gets: the one the URL names, else the where fields in index order when Platform needs one. */
export function effectiveOrder(
  clauses: readonly WhereClause[],
  order: readonly string[],
  index: FilterIndex | undefined,
): [string, 'asc' | 'desc'][] {
  if (order.length > 0) return order.map((o) => [orderField(o), orderDirection(o)])
  if (!index || !clauses.some((c) => c.op === 'in' || isRange(c.op))) return []
  return index.properties
    .map((p) => p.field)
    .filter((f) => clauses.some((c) => c.field === f))
    .map((f) => [f, 'asc'])
}

function sdkValue(text: string, type: FieldType): unknown {
  if (type === 'integer' || type === 'number') return Number(text)
  if (type === 'boolean') return text === 'true'
  return text
}

/** The `where` the SDK takes; call it only for a query `validateQuery` passed. */
export function sdkWhere(
  clauses: readonly WhereClause[],
  schema: Schema,
): [field: string, operator: string, value: unknown][] {
  return clauses.map((c) => {
    const type = fieldType(schema, c.field)
    const value = Array.isArray(c.value)
      ? c.value.map((v) => sdkValue(v, type))
      : sdkValue(c.value, type)
    return [c.field, SDK_OP[c.op], value]
  })
}
