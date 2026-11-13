import type { DocumentDto, DocumentsQueryArgs } from '@/data/sdk/methods/shared'
import { systemContract } from '@/lib/well-known'
import { decodeValue } from '../fixtures/sdk-codec'
import type { SdkFixture } from '../fixtures/sdk-load'

/** The recordings of one method, newest first. */
export type SdkRecordings = (method: string) => Promise<SdkFixture[]>

type Envelope = Record<string, unknown> & { ok: true; data: unknown }
interface Recording {
  fixture: SdkFixture
  result: Envelope
}

const DPNS_CONTRACT = systemContract('dpns').id

async function recordings(source: SdkRecordings, method: string): Promise<Recording[]> {
  const out: Recording[] = []
  for (const fixture of await source(method)) {
    const result = decodeValue(fixture.result) as Envelope
    if (result?.ok === true) out.push({ fixture, result })
  }
  return out
}

/** The newest recording's envelope with the composed data: its stamp and proof meta stay the newest source's own. */
function stamped(used: Recording[], data: unknown): unknown {
  const newest = used.reduce((a, b) => (b.fixture.recordedAt > a.fixture.recordedAt ? b : a))
  return { ...newest.result, data }
}

/** What a recording says about one contract id: its summary, null for "no such contract", or undefined for silence. */
function contractIn(rec: Recording, id: string): { value: unknown } | undefined {
  if (rec.fixture.method === 'contracts.getMany') {
    const map = rec.result.data
    return map instanceof Map && map.has(id) ? { value: map.get(id) } : undefined
  }
  if ((rec.fixture.args as { id?: string }).id !== id) return undefined
  const full = rec.result.data as Record<string, unknown> | null
  return {
    value: full && {
      id: full.id,
      ownerId: full.ownerId,
      version: full.version,
      documentSchemas: full.documentSchemas,
    },
  }
}

function composeContracts(many: Recording[], fetched: Recording[], ids: string[]): unknown {
  if (ids.length === 0) return null
  const newestFirst = [...many, ...fetched].sort((a, b) =>
    a.fixture.recordedAt < b.fixture.recordedAt
      ? 1
      : a.fixture.recordedAt > b.fixture.recordedAt
        ? -1
        : 0,
  )
  const used = new Set<Recording>()
  const out = new Map<string, unknown>()
  for (const id of ids) {
    const hit = newestFirst.map((rec) => ({ rec, said: contractIn(rec, id) })).find((h) => h.said)
    if (!hit?.said) return null
    out.set(id, hit.said.value)
    used.add(hit.rec)
  }
  return stamped([...used], out)
}

const SYSTEM_FIELDS: Record<string, keyof DocumentDto> = {
  $id: 'id',
  $ownerId: 'ownerId',
  $createdAt: 'createdAt',
  $updatedAt: 'updatedAt',
  $transferredAt: 'transferredAt',
}

function fieldOf(doc: DocumentDto, field: string): unknown {
  const system = SYSTEM_FIELDS[field]
  if (system) return doc[system]
  let value: unknown = doc.data
  for (const part of field.split('.')) {
    if (value === null || typeof value !== 'object') return undefined
    value = (value as Record<string, unknown>)[part]
  }
  return value
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === undefined || a === null) return -1
  if (b === undefined || b === null) return 1
  return (a as string | number | bigint) < (b as string | number | bigint) ? -1 : 1
}

/** The single `[field, 'in' | '==', value(s)]` clause of a query, or undefined for any other shape. */
function singleClause(
  args: DocumentsQueryArgs,
): { field: string; values: unknown[]; isIn: boolean } | undefined {
  if (args.where?.length !== 1 || args.startAfter !== undefined || args.startAt !== undefined)
    return undefined
  const [field, op, value] = args.where[0]!
  if (op === 'in' && Array.isArray(value)) return { field, values: value, isIn: true }
  if (op === '==') return { field, values: [value], isIn: false }
  return undefined
}

/** Documents whose `field` is one of `values`, from the recorded queries that listed those values. */
function composeDocuments(
  queries: Recording[],
  args: DocumentsQueryArgs,
): { used: Recording[]; docs: DocumentDto[] } | null {
  const wanted = singleClause(args)
  if (!wanted?.isIn) return null
  const { field, values } = wanted
  if (values.length === 0) return null
  const covered = new Set<unknown>()
  const used: Recording[] = []
  const docs = new Map<string, DocumentDto>()
  for (const rec of queries) {
    const q = rec.fixture.args as DocumentsQueryArgs
    if (q.contractId !== args.contractId || q.type !== args.type) continue
    const clause = singleClause(q)
    if (clause?.field !== field) continue
    const listed = values.filter((v) => clause.values.includes(v))
    if (listed.length === 0) continue
    used.push(rec)
    listed.forEach((v) => covered.add(v))
    for (const doc of rec.result.data as DocumentDto[]) {
      if (!docs.has(doc.id) && values.includes(fieldOf(doc, field))) docs.set(doc.id, doc)
    }
  }
  if (!values.every((v) => covered.has(v))) return null
  const ordered = [...docs.values()]
  const order = args.orderBy ?? []
  ordered.sort((a, b) => {
    for (const [by, dir] of order) {
      const c = compare(fieldOf(a, by), fieldOf(b, by))
      if (c !== 0) return dir === 'desc' ? -c : c
    }
    return 0
  })
  return { used, docs: args.limit === undefined ? ordered : ordered.slice(0, args.limit) }
}

const nameOf = (doc: DocumentDto) =>
  `${String(doc.data.label)}.${String(doc.data.parentDomainName)}`

function composeUsernames(
  recorded: Recording[],
  domains: Recording[],
  args: { identityId: string; limit?: number },
): unknown {
  const { identityId, limit } = args
  for (const rec of recorded) {
    const a = rec.fixture.args as { identityId: string; limit?: number }
    if (a.identityId !== identityId) continue
    const names = rec.result.data as string[]
    const complete = a.limit === undefined || names.length < a.limit
    if (complete || (limit !== undefined && names.length >= limit)) {
      return stamped([rec], limit === undefined ? names : names.slice(0, limit))
    }
  }
  const composed = composeDocuments(domains, {
    contractId: DPNS_CONTRACT,
    type: 'domain',
    where: [['records.identity', 'in', [identityId]]],
    orderBy: [['$createdAt', 'asc']],
    ...(limit === undefined ? {} : { limit }),
  })
  return composed ? stamped(composed.used, composed.docs.map(nameOf)) : null
}

/**
 * Answers a batched call that has no recording under its own key from what is recorded under other groupings, or
 * returns null when any part of it is not covered: nothing that was not recorded is ever invented.
 */
export async function composeSdkAnswer(
  source: SdkRecordings,
  method: string,
  args: unknown,
): Promise<unknown> {
  if (method === 'contracts.getMany') {
    const { ids } = args as { ids: string[] }
    return composeContracts(
      await recordings(source, 'contracts.getMany'),
      await recordings(source, 'contracts.fetch'),
      ids,
    )
  }
  if (method === 'documents.query') {
    const query = args as DocumentsQueryArgs
    if (!singleClause(query)?.isIn) return null
    const composed = composeDocuments(await recordings(source, 'documents.query'), query)
    return composed ? stamped(composed.used, composed.docs) : null
  }
  if (method === 'dpns.usernames') {
    const a = args as { identityId: string; limit?: number }
    return composeUsernames(
      await recordings(source, 'dpns.usernames'),
      await recordings(source, 'documents.query'),
      a,
    )
  }
  return null
}
