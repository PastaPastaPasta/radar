import { describe, expect, it } from 'vitest'
import { highlightSql, lineColumn } from './highlight'

describe('highlightSql', () => {
  it('keeps every character and marks keywords, strings, numbers and comments', () => {
    const sql = "SELECT * FROM domain WHERE label == 'a''b' AND n >= -12.5 -- note\nLIMIT 5"
    const tokens = highlightSql(sql)
    expect(tokens.map((t) => t.text).join('')).toBe(sql)
    const kinds = (kind: string) => tokens.filter((t) => t.kind === kind).map((t) => t.text)
    expect(kinds('keyword')).toEqual(['SELECT', 'FROM', 'WHERE', 'AND', 'LIMIT'])
    expect(kinds('string')).toEqual(["'a''b'"])
    expect(kinds('number')).toEqual(['-12.5', '5'])
    expect(kinds('comment')).toEqual(['-- note'])
  })

  it('reads an unfinished string or quoted name to the end without losing text', () => {
    const sql = "SELECT * FROM t WHERE a == 'open"
    expect(
      highlightSql(sql)
        .map((t) => t.text)
        .join(''),
    ).toBe(sql)
    expect(highlightSql('`odd name').at(-1)).toEqual({ kind: 'identifier', text: '`odd name' })
  })

  it('does not colour a field that merely starts with a keyword or digit', () => {
    expect(highlightSql('selected 4abc').filter((t) => t.kind !== 'plain')).toEqual([])
  })
})

describe('lineColumn', () => {
  it('counts lines and columns from one', () => {
    expect(lineColumn('ab\ncde', 0)).toEqual({ line: 1, column: 1 })
    expect(lineColumn('ab\ncde', 5)).toEqual({ line: 2, column: 3 })
  })
})
