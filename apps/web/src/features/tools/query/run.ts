import type { SourceStamp } from '@/data/envelope'
import { stampOf } from '@/data/envelope'
import { sdk } from '@/data/sdk'
import type { DocumentDto } from '@/data/sdk/methods'
import type { AverageGroupDto, CountGroupDto, SumGroupDto } from '@/data/sdk/methods/tools'
import type { NetworkId } from '@/lib/network'
import {
  parseSqlMulti,
  resolveContractId,
  toDocumentsQuery,
  type ParseFailure,
  type ParsedQuery,
} from './sql-parser'

/** Radar runs one or two statements a time: each is a separate proof-checked request. */
export const MAX_STATEMENTS = 2

export type StatementResult =
  | {
      kind: 'documents'
      rows: DocumentDto[]
      /** The page was full, so more may follow. */
      more: boolean
      stamp: SourceStamp
    }
  | { kind: 'count'; groups: CountGroupDto[]; stamp: SourceStamp }
  | { kind: 'sum'; field: string; groups: SumGroupDto[]; stamp: SourceStamp }
  | { kind: 'avg'; field: string; groups: AverageGroupDto[]; stamp: SourceStamp }

export interface StatementRun {
  parsed: ParsedQuery
  contractId: string
  /** What the statement's own text said, for a heading. */
  sql: string
  /** Null while the statement is waiting or running. */
  result?: StatementResult
  error?: unknown
  /** The reader stopped it before it answered. */
  cancelled?: boolean
}

export type PlanResult =
  | { ok: true; statements: { parsed: ParsedQuery; contractId: string; sql: string }[] }
  | { ok: false; problem: 'parse'; failure: ParseFailure }
  | { ok: false; problem: 'too-many'; count: number }
  | { ok: false; problem: 'no-contract'; alias: string | undefined; statement: number }

/** Splits the text at its semicolons outside strings, for the headings of each statement's results. */
export function statementTexts(sql: string): string[] {
  const parts: string[] = []
  let start = 0
  let quote: string | undefined
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!
    if (quote) {
      if (ch === quote) quote = undefined
    } else if (ch === "'" || ch === '`') quote = ch
    else if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++
    } else if (ch === ';') {
      parts.push(sql.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(sql.slice(start).trim())
  return parts.filter((p) => p !== '')
}

/** Parses the text and picks each statement's contract, before any request is made. */
export function planQuery(sql: string, pickerContract: string | undefined): PlanResult {
  const parsed = parseSqlMulti(sql)
  if (!parsed.ok) return { ok: false, problem: 'parse', failure: parsed }
  if (parsed.queries.length > MAX_STATEMENTS) {
    return { ok: false, problem: 'too-many', count: parsed.queries.length }
  }
  const texts = statementTexts(sql)
  const statements: { parsed: ParsedQuery; contractId: string; sql: string }[] = []
  for (const [i, query] of parsed.queries.entries()) {
    const { contractId } = resolveContractId(query, pickerContract)
    if (!contractId) {
      return { ok: false, problem: 'no-contract', alias: query.contractAlias, statement: i + 1 }
    }
    statements.push({ parsed: query, contractId, sql: texts[i] ?? '' })
  }
  return { ok: true, statements }
}

/** One statement against the SDK. `startAfter` pages a document list. */
export async function runStatement(
  net: NetworkId,
  statement: { parsed: ParsedQuery; contractId: string },
  signal: AbortSignal,
  startAfter?: string,
): Promise<StatementResult> {
  const { parsed, contractId } = statement
  const { groupBy, ...args } = toDocumentsQuery(parsed, contractId, { startAfter })
  if (parsed.select === 'documents') {
    const answer = await sdk.call(net, 'documents.query', args, signal)
    return {
      kind: 'documents',
      rows: answer.data,
      more: answer.data.length >= (args.limit ?? 25),
      stamp: stampOf(answer),
    }
  }
  const { startAfter: _skip, ...aggregate } = args
  void _skip
  const base = { ...aggregate, ...(groupBy ? { groupBy } : {}) }
  if (parsed.select === 'count') {
    const answer = await sdk.call(net, 'documents.count', base, signal)
    return { kind: 'count', groups: answer.data, stamp: stampOf(answer) }
  }
  const property = parsed.aggregateField ?? ''
  if (parsed.select === 'sum') {
    const answer = await sdk.call(net, 'documents.sum', { ...base, property }, signal)
    return { kind: 'sum', field: property, groups: answer.data, stamp: stampOf(answer) }
  }
  const answer = await sdk.call(net, 'documents.average', { ...base, property }, signal)
  return { kind: 'avg', field: property, groups: answer.data, stamp: stampOf(answer) }
}
