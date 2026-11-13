export type SqlTokenKind = 'keyword' | 'string' | 'number' | 'comment' | 'identifier' | 'plain'

export interface SqlToken {
  kind: SqlTokenKind
  text: string
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
  'LIKE',
  'COUNT',
  'SUM',
  'AVG',
  'NOT',
  'NULL',
  'TRUE',
  'FALSE',
])

const TOKEN =
  /(--[^\n]*)|('(?:[^']|'')*'?)|(`(?:[^`]|``)*`?)|(-?\d+(?:\.\d+)?(?![\w$]))|([A-Za-z_$][\w$]*)|(\s+)|([\s\S])/gy

/** Splits SQL for colouring: every character lands in exactly one token, so the pieces join back to the input. */
export function highlightSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = []
  const push = (kind: SqlTokenKind, text: string) => {
    const last = tokens[tokens.length - 1]
    if (last && last.kind === kind && kind === 'plain') last.text += text
    else tokens.push({ kind, text })
  }
  TOKEN.lastIndex = 0
  for (let m = TOKEN.exec(sql); m; m = TOKEN.exec(sql)) {
    if (m[1] !== undefined) push('comment', m[1])
    else if (m[2] !== undefined) push('string', m[2])
    else if (m[3] !== undefined) push('identifier', m[3])
    else if (m[4] !== undefined) push('number', m[4])
    else if (m[5] !== undefined) push(KEYWORDS.has(m[5].toUpperCase()) ? 'keyword' : 'plain', m[5])
    else push('plain', m[0])
  }
  return tokens
}

/** The line and column (both 1-based) of a character offset, for a parse error. */
export function lineColumn(sql: string, position: number): { line: number; column: number } {
  const before = sql.slice(0, Math.max(0, position))
  const line = before.split('\n').length
  return { line, column: position - (before.lastIndexOf('\n') + 1) + 1 }
}
