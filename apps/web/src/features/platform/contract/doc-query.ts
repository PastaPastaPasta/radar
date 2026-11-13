import type { DocumentsQueryArgs } from '@/data/sdk/methods'
import type { WhereClause } from '@/lib/search-schemas'
import {
  effectiveOrder,
  filterIndices,
  sdkWhere,
  servingIndex,
  validateQuery,
  type FilterIndex,
  type Problem,
} from './doc-filters'

/** Drive answers at most this many documents. */
export const DRIVE_MAX = 100

export interface DocumentsSearch {
  where?: WhereClause[] | undefined
  order?: string[] | undefined
  limit: number
  after?: string | undefined
  prev?: string[] | undefined
}

/** DPNS stores names in a form with o, i and l written as 0, 1, 1 and in lower case. */
export const homographSafe = (text: string): string =>
  text.toLowerCase().replaceAll('o', '0').replaceAll(/[il]/g, '1')

const DPNS_NORMALIZED = new Set(['normalizedLabel', 'normalizedParentDomainName'])

export interface Conversion {
  field: string
  typed: string
  searched: string
}

export interface QueryPlan {
  problems: Problem[]
  /** The SDK query, when the filter is valid. One more than the page shows, to know whether a next page exists. */
  args?: DocumentsQueryArgs
  index?: FilterIndex
  /** Values DPNS reads in another form than typed. */
  conversions: Conversion[]
}

export interface PlanInput {
  contractId: string
  type: string
  indices: ContractIndices
  schema: Record<string, unknown> | undefined
  search: DocumentsSearch
  dpnsDomain: boolean
}

type ContractIndices = Parameters<typeof filterIndices>[0]

const asText = (v: string | string[]): string => (Array.isArray(v) ? v.join(', ') : v)

/** Turns a documents address into the query it asks, or the reasons it can't be asked. */
export function planQuery(input: PlanInput): QueryPlan {
  const { search, schema, dpnsDomain } = input
  const indices = filterIndices(input.indices)
  const typed = search.where ?? []
  const order = search.order ?? []
  const problems = validateQuery(typed, order, indices, schema)
  const conversions: Conversion[] = []
  const clauses = typed.map((c) => {
    if (!dpnsDomain || !DPNS_NORMALIZED.has(c.field)) return c
    const value = Array.isArray(c.value) ? c.value.map(homographSafe) : homographSafe(c.value)
    if (asText(value) !== asText(c.value)) {
      conversions.push({ field: c.field, typed: asText(c.value), searched: asText(value) })
    }
    return { ...c, value }
  })
  if (problems.length > 0) return { problems, conversions }
  const index = servingIndex(typed, order, indices)
  const limit = Math.min(search.limit + 1, DRIVE_MAX)
  const orderBy = effectiveOrder(typed, order, index)
  const where = sdkWhere(clauses, schema)
  const args: DocumentsQueryArgs = {
    contractId: input.contractId,
    type: input.type,
    ...(where.length > 0 ? { where } : {}),
    ...(orderBy.length > 0 ? { orderBy } : {}),
    limit,
    ...(search.after ? { startAfter: search.after } : {}),
  }
  return { problems: [], args, ...(index ? { index } : {}), conversions }
}

/** Whether the answer had more rows than the page shows. */
export function hasMore(returned: number, pageSize: number): boolean {
  return pageSize >= DRIVE_MAX ? returned >= DRIVE_MAX : returned > pageSize
}

/** The cursor fields of the page after this one. `prev` keeps the cursors of the earlier pages. */
export function nextCursor(
  search: Pick<DocumentsSearch, 'after' | 'prev'>,
  lastId: string,
): { after: string; prev: string[] | undefined } {
  const stack = search.after ? [...(search.prev ?? []), search.after] : (search.prev ?? [])
  return { after: lastId, prev: stack.length > 0 ? stack : undefined }
}

/** The cursor fields of the page before this one; `undefined` after means the first page. */
export function prevCursor(search: Pick<DocumentsSearch, 'after' | 'prev'>): {
  after: string | undefined
  prev: string[] | undefined
} | null {
  if (!search.after) return null
  const stack = search.prev ?? []
  const after = stack.at(-1)
  const rest = stack.slice(0, -1)
  return { after, prev: rest.length > 0 ? rest : undefined }
}
