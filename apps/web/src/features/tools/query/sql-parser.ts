/*
 * Ported from native-platform-explorer (src/util/sql-parser.ts), MIT License,
 * Copyright (c) 2026 native-platform-explorer contributors. See THIRD_PARTY.md.
 * Changes: our DTO query arguments, structured failure codes for translation, contract aliases from lib/well-known.
 */
import type { DocumentWhere, DocumentsQueryArgs } from '@/data/sdk/methods'
import { wellKnownContracts } from '@/lib/well-known'

export type AggregateKind = 'count' | 'sum' | 'avg'

// ── Types ──────────────────────────────────────────────────────────────

export interface ParsedQuery {
  /** `'documents'` is the regular SELECT *; the others are aggregate queries
   *  run through the SDK's documents count / sum / average facade. */
  select: 'documents' | AggregateKind
  /** For SUM(field) / AVG(field) — the integer property to aggregate. Always
   *  unset for COUNT / documents. */
  aggregateField?: string
  /** Optional GROUP BY field list. Drives the SDK's `groupBy` knob (Aggregate
   *  / PerInValue / RangeDistinct / Compound shapes). */
  groupBy?: string[]
  from: string
  contractAlias?: string
  where: ParsedCondition[]
  orderBy: { field: string; direction: 'asc' | 'desc' }[]
  limit?: number
}

export interface ParsedCondition {
  field: string
  operator: '==' | '>' | '>=' | '<' | '<=' | 'between' | 'in' | 'startsWith'
  value: unknown
}

/** A non-blocking note about how part of the SQL was read. */
export interface ParseHint {
  message: string
  position: number
}

/** What went wrong, for the page to explain in the reader's language; `message` is the English text. */
export type ParseCode =
  | 'unterminated-string'
  | 'invalid-number'
  | 'unterminated-identifier'
  | 'limit-range'
  | 'group-by-needs-aggregate'
  | 'unsupported-clause'
  | 'unsupported-select'
  | 'or'
  | 'not'
  | 'like-pattern'
  | 'like-no-wildcard'
  | 'like-prefix-only'
  | 'not-equal'
  | 'unknown-operator'
  | 'expected-operator'
  | 'unsafe-number'
  | 'unquoted-value'
  | 'expected-value'
  | 'expected'
  | 'expected-identifier'
  | 'expected-number'
  | 'expected-integer'
  | 'empty'

export interface ParseFailure {
  ok: false
  message: string
  position: number
  code: ParseCode
  /** The token the parser stopped at, where the message names one. */
  arg?: string
  /** What the parser expected, for `expected`. */
  label?: string
}

export type ParseResult = { ok: true; query: ParsedQuery; hints: ParseHint[] } | ParseFailure

export type MultiParseResult =
  { ok: true; queries: ParsedQuery[]; hints: ParseHint[] } | ParseFailure

// ── Tokenizer ──────────────────────────────────────────────────────────

const TT = {
  Keyword: 0,
  Identifier: 1,
  String: 2,
  Number: 3,
  Operator: 4,
  LParen: 5,
  RParen: 6,
  Comma: 7,
  Star: 8,
  Dot: 9,
  Semicolon: 10,
  EOF: 11,
  /** A word starting with a digit, e.g. an unquoted base58 ID. Never valid SQL. */
  BareWord: 12,
} as const

type TT = (typeof TT)[keyof typeof TT]

interface Token {
  type: TT
  value: string
  pos: number
  /** Backtick-quoted identifier. */
  quoted?: boolean
}

const KEYWORDS = new Set([
  'SELECT',
  'FROM',
  'WHERE',
  'AND',
  'OR',
  'ORDER',
  'BY',
  'GROUP',
  'LIMIT',
  'ASC',
  'DESC',
  'BETWEEN',
  'IN',
  'STARTS',
  'WITH',
  'COUNT',
  'SUM',
  'AVG',
  'NOT',
  'NULL',
  'TRUE',
  'FALSE',
])

function tokenize(sql: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < sql.length) {
    // skip whitespace
    if (/\s/.test(sql[i]!)) {
      i++
      continue
    }

    const ch = sql[i]!
    const pos = i

    // `--` starts a line comment anywhere outside a string, as in standard
    // SQL, so `x == --1` is `x ==` followed by a comment (it never parsed).
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++
      continue
    }

    // single-char tokens
    if (ch === '(') {
      tokens.push({ type: TT.LParen, value: '(', pos })
      i++
      continue
    }
    if (ch === ')') {
      tokens.push({ type: TT.RParen, value: ')', pos })
      i++
      continue
    }
    if (ch === ',') {
      tokens.push({ type: TT.Comma, value: ',', pos })
      i++
      continue
    }
    if (ch === '*') {
      tokens.push({ type: TT.Star, value: '*', pos })
      i++
      continue
    }
    if (ch === '.') {
      tokens.push({ type: TT.Dot, value: '.', pos })
      i++
      continue
    }
    if (ch === ';') {
      tokens.push({ type: TT.Semicolon, value: ';', pos })
      i++
      continue
    }

    // operators: >=, <=, ==, !=, <>, >, <, =
    if (ch === '>' || ch === '<' || ch === '=' || ch === '!') {
      let op = ch
      if (i + 1 < sql.length && (sql[i + 1] === '=' || (ch === '<' && sql[i + 1] === '>'))) {
        op += sql[i + 1]
        i++
      }
      tokens.push({ type: TT.Operator, value: op, pos })
      i++
      continue
    }

    // string literal (single-quoted)
    if (ch === "'") {
      i++
      let s = ''
      let closed = false
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (i + 1 < sql.length && sql[i + 1] === "'") {
            s += "'"
            i += 2
          } else {
            i++
            closed = true
            break
          }
        } else {
          s += sql[i]
          i++
        }
      }
      if (!closed) throw new ParseError('Unterminated string literal.', pos, 'unterminated-string')
      tokens.push({ type: TT.String, value: s, pos })
      continue
    }

    // numeric literal (including negative when preceded by operator/keyword/comma/lparen or at start)
    if (
      /[0-9]/.test(ch) ||
      (ch === '-' && i + 1 < sql.length && /[0-9]/.test(sql[i + 1]!) && canBeNegativeNumber(tokens))
    ) {
      let num = ch
      i++
      while (i < sql.length && /[0-9.]/.test(sql[i]!)) {
        num += sql[i]
        i++
      }
      // A digit-led word such as a base58 ID: keep it whole so the parser can
      // ask for quotes instead of reporting a stray clause.
      if (i < sql.length && /[a-zA-Z_$]/.test(sql[i]!)) {
        while (i < sql.length && /[a-zA-Z0-9_$]/.test(sql[i]!)) num += sql[i++]
        tokens.push({ type: TT.BareWord, value: num, pos })
        continue
      }
      // A trailing point (`1.`) has always been accepted as the integer.
      if (!/^-?\d+(?:\.\d*)?$/.test(num))
        throw new ParseError(`Invalid number '${num}'.`, pos, 'invalid-number', num)
      tokens.push({ type: TT.Number, value: num, pos })
      continue
    }

    // backtick-quoted identifier
    if (ch === '`') {
      i++
      let id = ''
      let closed = false
      while (i < sql.length) {
        if (sql[i] === '`') {
          if (sql[i + 1] === '`') {
            id += '`'
            i += 2
            continue
          }
          i++
          closed = true
          break
        }
        id += sql[i++]
      }
      if (!closed)
        throw new ParseError('Unterminated quoted identifier.', pos, 'unterminated-identifier')
      tokens.push({ type: TT.Identifier, value: id, pos, quoted: true })
      continue
    }

    // identifier or keyword
    if (/[a-zA-Z_$]/.test(ch)) {
      let id = ''
      while (i < sql.length && /[a-zA-Z0-9_$]/.test(sql[i]!)) {
        id += sql[i]
        i++
      }
      const upper = id.toUpperCase()
      if (KEYWORDS.has(upper)) {
        tokens.push({ type: TT.Keyword, value: upper, pos })
      } else {
        tokens.push({ type: TT.Identifier, value: id, pos })
      }
      continue
    }

    // unknown character — emit as-is for error reporting
    tokens.push({ type: TT.Identifier, value: ch, pos })
    i++
  }

  tokens.push({ type: TT.EOF, value: '', pos: sql.length })
  return tokens
}

function canBeNegativeNumber(tokens: Token[]): boolean {
  if (tokens.length === 0) return true
  const last = tokens[tokens.length - 1]!
  return (
    last.type === TT.Operator ||
    last.type === TT.Keyword ||
    last.type === TT.Comma ||
    last.type === TT.LParen
  )
}

// ── Parser ─────────────────────────────────────────────────────────────

class Parser {
  private tokens: Token[]
  private pos = 0
  /** Unquoted or backticked values read as strings, for one combined hint. */
  private bareValues: Token[] = []

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  parse(): ParseResult {
    try {
      const query = this.parseQuery()
      // Allow a single trailing `;` so users can paste statements that
      // come from a `;`-terminated multi-statement source.
      if (this.peek().type === TT.Semicolon) this.advance()
      this.expect(TT.EOF, 'end of query')
      return { ok: true, query, hints: this.hints() }
    } catch (e) {
      if (e instanceof ParseError) {
        return e.failure()
      }
      throw e
    }
  }

  parseMulti(): MultiParseResult {
    try {
      if (this.peek().type === TT.EOF) {
        return { ok: false, message: 'Empty query.', position: 0, code: 'empty' }
      }
      const queries: ParsedQuery[] = []
      while (this.peek().type !== TT.EOF) {
        queries.push(this.parseQuery())
        // Statements are `;`-separated; trailing `;` is optional.
        while (this.peek().type === TT.Semicolon) this.advance()
      }
      return { ok: true, queries, hints: this.hints() }
    } catch (e) {
      if (e instanceof ParseError) {
        return e.failure()
      }
      throw e
    }
  }

  private hints(): ParseHint[] {
    const [first] = this.bareValues
    if (!first) return []
    const words = Array.from(new Set(this.bareValues.map((t) => t.value)))
    const shown = words.slice(0, 3)
    const more = words.length > shown.length ? ` and ${words.length - shown.length} more` : ''
    const quoted = shown.map((w) => `'${w.replace(/'/g, "''")}'`).join(', ')
    return [
      {
        message: `Read ${quoted}${more} as text, not as ${words.length === 1 ? 'a field' : 'fields'}. Put string values, including IDs, in single quotes${this.bareValues.some((t) => t.quoted) ? '; backticks are for field names' : ''}.`,
        position: first.pos,
      },
    ]
  }

  private parseQuery(): ParsedQuery {
    this.expectKeyword('SELECT')
    const { select, aggregateField } = this.parseSelectList()

    this.expectKeyword('FROM')
    const { docType, alias } = this.parseFromClause()

    let where: ParsedCondition[] = []
    if (this.peekKeyword('WHERE')) {
      this.advance()
      where = this.parseConditions()
    }

    let groupBy: string[] | undefined
    if (this.peekKeyword('GROUP')) {
      this.advance()
      this.expectKeyword('BY')
      groupBy = this.parseFieldList()
    }

    let orderBy: ParsedQuery['orderBy'] = []
    if (this.peekKeyword('ORDER')) {
      this.advance()
      this.expectKeyword('BY')
      orderBy = this.parseOrderByList()
    }

    let limit: number | undefined
    if (this.peekKeyword('LIMIT')) {
      this.advance()
      const limitPosition = this.peek().pos
      limit = this.expectNumber()
      if (limit < 1 || limit > 100) {
        throw new ParseError('LIMIT must be between 1 and 100.', limitPosition, 'limit-range')
      }
    }

    if (select === 'documents' && groupBy) {
      throw new ParseError(
        'GROUP BY requires COUNT(*), SUM(field), or AVG(field).',
        this.peek().pos,
        'group-by-needs-aggregate',
      )
    }
    if (this.peek().type !== TT.EOF && this.peek().type !== TT.Semicolon) {
      throw new ParseError(
        `Unsupported SQL clause '${this.peek().value}'. Use AND filters and index-compatible ORDER BY; JOIN, OR, and OFFSET are unavailable.`,
        this.peek().pos,
        'unsupported-clause',
        this.peek().value,
      )
    }
    return {
      select,
      aggregateField,
      groupBy,
      from: docType,
      contractAlias: alias,
      where,
      orderBy,
      limit,
    }
  }

  private parseSelectList(): { select: ParsedQuery['select']; aggregateField?: string } {
    if (this.peek().type === TT.Star) {
      this.advance()
      return { select: 'documents' }
    }
    if (this.peekKeyword('COUNT')) {
      this.advance()
      this.expect(TT.LParen, '(')
      this.expect(TT.Star, '*')
      this.expect(TT.RParen, ')')
      return { select: 'count' }
    }
    if (this.peekKeyword('SUM') || this.peekKeyword('AVG')) {
      const kw = this.advance().value
      this.expect(TT.LParen, '(')
      const field = this.parseFieldPath()
      this.expect(TT.RParen, ')')
      return { select: kw.toLowerCase() as AggregateKind, aggregateField: field }
    }
    throw new ParseError(
      'Unsupported SELECT expression. Use SELECT *, COUNT(*), SUM(field), or AVG(field); field projections and DISTINCT are unavailable.',
      this.peek().pos,
      'unsupported-select',
    )
  }

  private parseFieldList(): string[] {
    const fields = [this.parseFieldPath()]
    while (this.peek().type === TT.Comma) {
      this.advance()
      fields.push(this.parseFieldPath())
    }
    return fields
  }

  private parseFromClause(): { docType: string; alias?: string } {
    const first = this.expectIdentifier()
    if (this.peek().type === TT.Dot) {
      this.advance()
      const second = this.expectIdentifier()
      return { docType: second, alias: first }
    }
    return { docType: first }
  }

  private parseConditions(): ParsedCondition[] {
    const conditions: ParsedCondition[] = [this.parseCondition()]
    while (this.peekKeyword('AND')) {
      this.advance()
      conditions.push(this.parseCondition())
    }
    if (this.peekKeyword('OR')) {
      throw new ParseError(
        'OR is not supported — Dash Platform requires all conditions to use AND',
        this.peek().pos,
        'or',
      )
    }
    return conditions
  }

  private parseCondition(): ParsedCondition {
    this.rejectNot()
    const field = this.parseFieldPath()
    this.rejectNot()

    if (this.peekKeyword('BETWEEN')) {
      this.advance()
      const low = this.parseValue()
      this.expectKeyword('AND')
      const high = this.parseValue()
      return { field, operator: 'between', value: [low, high] }
    }

    if (this.peekKeyword('IN')) {
      this.advance()
      this.expect(TT.LParen, '(')
      const values = this.parseValueList()
      this.expect(TT.RParen, ')')
      return { field, operator: 'in', value: values }
    }

    if (this.peekKeyword('STARTS')) {
      this.advance()
      this.expectKeyword('WITH')
      const value = this.parseValue()
      return { field, operator: 'startsWith', value }
    }

    // LIKE is only a keyword here, so a field may still be named `like`.
    if (
      this.peek().type === TT.Identifier &&
      !this.peek().quoted &&
      this.peek().value.toUpperCase() === 'LIKE'
    ) {
      this.advance()
      return { field, operator: 'startsWith', value: this.parseLikePrefix() }
    }

    // also accept startsWith as a single identifier (case-insensitive)
    if (this.peek().type === TT.Identifier && this.peek().value.toLowerCase() === 'startswith') {
      this.advance()
      const value = this.parseValue()
      return { field, operator: 'startsWith', value }
    }

    const op = this.parseOperator()
    const value = this.parseValue()
    return { field, operator: op, value }
  }

  private rejectNot(): void {
    if (this.peekKeyword('NOT')) {
      throw new ParseError(
        'NOT is not supported — Platform queries cannot negate a filter (NOT IN, NOT LIKE, NOT BETWEEN).',
        this.peek().pos,
        'not',
      )
    }
  }

  /** `LIKE 'abc%'` is a prefix match, which Platform supports as startsWith. */
  private parseLikePrefix(): string {
    const tok = this.peek()
    if (tok.type !== TT.String) {
      throw new ParseError(
        `LIKE needs a quoted pattern such as 'abc%', got '${tok.value}'`,
        tok.pos,
        'like-pattern',
        tok.value,
      )
    }
    this.advance()
    if (!/[%_]/.test(tok.value)) {
      throw new ParseError(
        `LIKE '${tok.value}' has no wildcard; use = '${tok.value}' for an exact match.`,
        tok.pos,
        'like-no-wildcard',
        tok.value,
      )
    }
    const prefix = tok.value.endsWith('%') ? tok.value.slice(0, -1) : ''
    if (!prefix || /[%_]/.test(prefix)) {
      throw new ParseError(
        "Only prefix patterns are supported: LIKE 'abc%' (a literal prefix and one trailing %). Use STARTS WITH for a prefix containing % or _.",
        tok.pos,
        'like-prefix-only',
      )
    }
    return prefix
  }

  private parseFieldPath(): string {
    let path = this.expectIdentifier()
    while (this.peek().type === TT.Dot) {
      this.advance()
      path += '.' + this.expectIdentifier()
    }
    return path
  }

  private parseOperator(): ParsedCondition['operator'] {
    const tok = this.peek()
    if (tok.type === TT.Operator) {
      this.advance()
      switch (tok.value) {
        case '=':
        case '==':
          return '=='
        case '>':
          return '>'
        case '>=':
          return '>='
        case '<':
          return '<'
        case '<=':
          return '<='
        case '!=':
        case '<>':
          throw new ParseError(
            `'${tok.value}' is not supported — Platform queries can match values, ranges, IN lists and prefixes, but not exclude a value.`,
            tok.pos,
            'not-equal',
            tok.value,
          )
        default:
          throw new ParseError(
            `Unknown operator '${tok.value}'`,
            tok.pos,
            'unknown-operator',
            tok.value,
          )
      }
    }
    throw new ParseError(
      `Expected operator, got '${tok.value}'`,
      tok.pos,
      'expected-operator',
      tok.value,
    )
  }

  private parseValue(): unknown {
    const tok = this.peek()
    if (tok.type === TT.String) {
      this.advance()
      return tok.value
    }
    if (tok.type === TT.Number) {
      this.advance()
      const n = Number(tok.value)
      if (
        !Number.isFinite(n) ||
        (Number.isInteger(n) && (!Number.isSafeInteger(n) || /\.\d*[1-9]/.test(tok.value)))
      ) {
        throw new ParseError(
          'Numeric literal exceeds safe JavaScript precision. Use the SDK directly for exact large-integer filters.',
          tok.pos,
          'unsafe-number',
        )
      }
      return n
    }
    if (tok.type === TT.Keyword && tok.value === 'TRUE') {
      this.advance()
      return true
    }
    if (tok.type === TT.Keyword && tok.value === 'FALSE') {
      this.advance()
      return false
    }
    if (tok.type === TT.Keyword && tok.value === 'NULL') {
      this.advance()
      return null
    }
    // Unquoted words (e.g. base58 IDs) have always been read as strings;
    // keep that for saved and shared queries, with a hint to quote them.
    if (tok.type === TT.Identifier) {
      this.advance()
      this.bareValues.push(tok)
      return tok.value
    }
    // A digit-led word was never a value, so it still asks for quotes.
    if (tok.type === TT.BareWord) {
      throw new ParseError(
        `Unquoted value '${tok.value}'. Write string values, including IDs, in single quotes: '${tok.value}'.`,
        tok.pos,
        'unquoted-value',
        tok.value,
      )
    }
    throw new ParseError(`Expected value, got '${tok.value}'`, tok.pos, 'expected-value', tok.value)
  }

  private parseValueList(): unknown[] {
    const values: unknown[] = [this.parseValue()]
    while (this.peek().type === TT.Comma) {
      this.advance()
      values.push(this.parseValue())
    }
    return values
  }

  private parseOrderByList(): ParsedQuery['orderBy'] {
    const items: ParsedQuery['orderBy'] = [this.parseOrderByItem()]
    while (this.peek().type === TT.Comma) {
      this.advance()
      items.push(this.parseOrderByItem())
    }
    return items
  }

  private parseOrderByItem(): { field: string; direction: 'asc' | 'desc' } {
    const field = this.parseFieldPath()
    let direction: 'asc' | 'desc' = 'asc'
    if (this.peekKeyword('ASC')) {
      this.advance()
      direction = 'asc'
    } else if (this.peekKeyword('DESC')) {
      this.advance()
      direction = 'desc'
    }
    return { field, direction }
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private peek(): Token {
    return this.tokens[this.pos]!
  }

  private advance(): Token {
    return this.tokens[this.pos++]!
  }

  private expect(type: TT, label: string): Token {
    const tok = this.peek()
    if (tok.type !== type) {
      throw new ParseError(
        `Expected ${label}, got '${tok.value}'`,
        tok.pos,
        'expected',
        tok.value,
        label,
      )
    }
    return this.advance()
  }

  private expectKeyword(kw: string): Token {
    const tok = this.peek()
    if (tok.type !== TT.Keyword || tok.value !== kw) {
      throw new ParseError(
        `Expected '${kw}', got '${tok.value}'`,
        tok.pos,
        'expected',
        tok.value,
        kw,
      )
    }
    return this.advance()
  }

  private expectIdentifier(): string {
    const tok = this.peek()
    if (tok.type !== TT.Identifier) {
      throw new ParseError(
        `Expected identifier, got '${tok.value}'`,
        tok.pos,
        'expected-identifier',
        tok.value,
      )
    }
    this.advance()
    return tok.value
  }

  private expectNumber(): number {
    const tok = this.peek()
    if (tok.type !== TT.Number) {
      throw new ParseError(
        `Expected number, got '${tok.value}'`,
        tok.pos,
        'expected-number',
        tok.value,
      )
    }
    this.advance()
    const n = Number(tok.value)
    if (!Number.isSafeInteger(n)) {
      throw new ParseError(
        `Expected integer, got '${tok.value}'`,
        tok.pos,
        'expected-integer',
        tok.value,
      )
    }
    return n
  }

  private peekKeyword(kw: string): boolean {
    const tok = this.peek()
    return tok.type === TT.Keyword && tok.value === kw
  }
}

class ParseError extends Error {
  constructor(
    message: string,
    readonly position: number,
    readonly code: ParseCode,
    readonly arg?: string,
    readonly label?: string,
  ) {
    super(message)
  }

  failure(): ParseFailure {
    return {
      ok: false,
      message: this.message,
      position: this.position,
      code: this.code,
      ...(this.arg === undefined ? {} : { arg: this.arg }),
      ...(this.label === undefined ? {} : { label: this.label }),
    }
  }
}

// ── Public API ─────────────────────────────────────────────────────────

export function parseSql(sql: string): ParseResult {
  try {
    return new Parser(tokenize(sql)).parse()
  } catch (error) {
    if (error instanceof ParseError) return error.failure()
    throw error
  }
}

/** Parse one or more `;`-separated queries. Trailing `;` is allowed; an
 *  empty trailing statement is ignored. Errors point at the first failed
 *  statement and abort parsing — same as multi-statement Postgres input. */
export function parseSqlMulti(sql: string): MultiParseResult {
  try {
    return new Parser(tokenize(sql)).parseMulti()
  } catch (error) {
    if (error instanceof ParseError) return error.failure()
    throw error
  }
}

// ── Contract alias resolution ──────────────────────────────────────────

export function resolveContractAlias(alias: string): string | undefined {
  const wanted = alias.toLowerCase()
  return wellKnownContracts('mainnet').find(
    (c) => c.key === wanted || c.name.toLowerCase() === wanted,
  )?.id
}

// ── SDK param conversion ───────────────────────────────────────────────

function conditionToWhere(c: ParsedCondition): DocumentWhere {
  switch (c.operator) {
    case 'between':
      return [c.field, 'Between', c.value]
    case 'in':
      return [c.field, 'in', c.value]
    case 'startsWith':
      return [c.field, 'startsWith', c.value]
    default:
      return [c.field, c.operator, c.value]
  }
}

const BOUNDED_RANGE: Record<string, string> = {
  '>=,<=': 'Between',
  '>,<': 'BetweenExcludeBounds',
  '>,<=': 'BetweenExcludeLeft',
  '>=,<': 'BetweenExcludeRight',
}

/**
 * Aggregates need a two-sided range as one `between*` clause: the SUM/AVG
 * index pickers and the SDK's COUNT proof check don't pair two clauses on a
 * field (document queries do, so they keep the clauses as written).
 */
function aggregateWhere(where: ParsedCondition[]): DocumentWhere[] {
  const out: DocumentWhere[] = []
  for (const c of where) {
    const onField = where.filter((o) => o.field === c.field)
    const low = onField.find((o) => o.operator === '>' || o.operator === '>=')
    const high = onField.find((o) => o.operator === '<' || o.operator === '<=')
    if (onField.length !== 2 || !low || !high) out.push(conditionToWhere(c))
    else if (c === low)
      out.push([
        c.field,
        BOUNDED_RANGE[`${low.operator},${high.operator}`]!,
        [low.value, high.value],
      ])
  }
  return out
}

export function toDocumentsQuery(
  parsed: ParsedQuery,
  contractId: string,
  overrides?: { startAfter?: string },
): DocumentsQueryArgs & { groupBy?: string[] } {
  return {
    contractId,
    type: parsed.from,
    ...(parsed.where.length
      ? {
          where:
            parsed.select === 'documents'
              ? parsed.where.map(conditionToWhere)
              : aggregateWhere(parsed.where),
        }
      : {}),
    ...(parsed.orderBy.length
      ? { orderBy: parsed.orderBy.map((o): [string, 'asc' | 'desc'] => [o.field, o.direction]) }
      : {}),
    ...(parsed.limit !== undefined || parsed.select === 'documents'
      ? { limit: parsed.limit ?? 25 }
      : {}),
    ...(overrides?.startAfter ? { startAfter: overrides.startAfter } : {}),
    ...(parsed.groupBy ? { groupBy: parsed.groupBy } : {}),
  }
}

export function resolveContractId(
  parsed: ParsedQuery,
  pickerContractId: string | undefined,
): { contractId: string | undefined; source: 'alias' | 'picker' } {
  if (parsed.contractAlias) {
    const resolved = resolveContractAlias(parsed.contractAlias)
    return { contractId: resolved, source: 'alias' }
  }
  return { contractId: pickerContractId, source: 'picker' }
}
