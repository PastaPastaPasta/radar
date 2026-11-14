import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import type { QueryErrorKind } from './query-workspace'
import type { ParseCode, ParseFailure } from './sql-parser'

interface Explanation {
  /** What the parser found. */
  found: MessageDescriptor
  /** The rule behind it, where one applies. */
  rule?: MessageDescriptor
}

const RANGE_RULE = msg`Platform walks an index in order, so a query is a run of matches on the index's leading fields and at most one range after them.`

/** Every parse failure with the sentence that names it and the Platform rule that makes it one. */
const PARSE_EXPLANATIONS: Record<ParseCode, Explanation> = {
  'unterminated-string': {
    found: msg`A string is missing its closing quote.`,
    rule: msg`Write text between single quotes, and write a quote inside the text twice.`,
  },
  'invalid-number': {
    found: msg({ message: "“{arg}” isn't a number." }),
    rule: msg`Numbers are whole or decimal digits with an optional minus sign. Write IDs and other text in single quotes.`,
  },
  'unterminated-identifier': {
    found: msg`A field name in backticks is missing its closing backtick.`,
  },
  'limit-range': {
    found: msg`LIMIT must be between 1 and 100.`,
    rule: msg`Drive returns at most 100 documents (or 100 groups) per query.`,
  },
  'group-by-needs-aggregate': {
    found: msg`GROUP BY needs COUNT(*), SUM(field) or AVG(field).`,
    rule: msg`Platform groups only aggregate answers. A list of documents can't be grouped.`,
  },
  'unsupported-clause': {
    found: msg({ message: "“{arg}” isn't supported here." }),
    rule: msg`A query is SELECT … FROM … WHERE conditions joined by AND, then GROUP BY, ORDER BY and LIMIT. JOIN, OR, OFFSET and sub-queries are unavailable because Platform answers from one index.`,
  },
  'unsupported-select': {
    found: msg`Only SELECT *, COUNT(*), SUM(field) and AVG(field) are supported.`,
    rule: msg`Platform returns whole documents or one aggregate, so field projections and DISTINCT are unavailable.`,
  },
  or: {
    found: msg`OR isn't supported.`,
    rule: msg`Every condition must hold (AND): an index can't serve two alternatives at once. Run two statements instead.`,
  },
  not: {
    found: msg`NOT isn't supported.`,
    rule: msg`Platform can match values, ranges, IN lists and prefixes, but it can't exclude a value. Filter on what you want, not on what you don't.`,
  },
  'like-pattern': {
    found: msg`LIKE needs a quoted pattern such as 'abc%'.`,
  },
  'like-no-wildcard': {
    found: msg({ message: '“{arg}” has no wildcard.' }),
    rule: msg`Use == for an exact match. LIKE is only a prefix match here.`,
  },
  'like-prefix-only': {
    found: msg`Only prefix patterns work with LIKE.`,
    rule: msg`Write a literal prefix and one trailing %, as in LIKE 'abc%', or use STARTS WITH for a prefix that holds % or _.`,
  },
  'not-equal': {
    found: msg({ message: "“{arg}” isn't supported." }),
    rule: msg`Platform can match values, ranges, IN lists and prefixes, but it can't exclude a value.`,
  },
  'unknown-operator': {
    found: msg({ message: "“{arg}” isn't an operator Platform knows." }),
    rule: RANGE_RULE,
  },
  'expected-operator': {
    found: msg({ message: 'An operator was expected, but “{arg}” came instead.' }),
    rule: msg`Use ==, >, >=, <, <=, BETWEEN … AND …, IN (…) or STARTS WITH.`,
  },
  'unsafe-number': {
    found: msg`This number is too large to write safely here.`,
    rule: msg`Radar keeps numbers within JavaScript's exact range. Use the SDK directly for a larger exact value.`,
  },
  'unquoted-value': {
    found: msg({ message: '“{arg}” needs quotes.' }),
    rule: msg`Write text values, including IDs, in single quotes.`,
  },
  'expected-value': { found: msg({ message: 'A value was expected, but “{arg}” came instead.' }) },
  expected: { found: msg({ message: 'Expected {label}, but “{arg}” came instead.' }) },
  'expected-identifier': {
    found: msg({ message: 'A field name was expected, but “{arg}” came instead.' }),
  },
  'expected-number': {
    found: msg({ message: 'A number was expected, but “{arg}” came instead.' }),
  },
  'expected-integer': {
    found: msg({ message: 'A whole number was expected, but “{arg}” came instead.' }),
  },
  empty: { found: msg`Write a query to run.` },
}

export interface ExplainedFailure {
  /** The sentence with its values filled in, ready for `i18n._`. */
  found: MessageDescriptor
  rule?: MessageDescriptor
}

export function explainFailure(failure: ParseFailure): ExplainedFailure {
  const explanation = PARSE_EXPLANATIONS[failure.code]
  const arg = failure.arg === '' || failure.arg === undefined ? '…' : failure.arg
  return {
    found: { ...explanation.found, values: { arg, label: failure.label ?? '' } },
    ...(explanation.rule ? { rule: explanation.rule } : {}),
  }
}

export const QUERY_ERROR_HINTS: Record<QueryErrorKind, MessageDescriptor> = {
  'aggregate-index': msg`This document type has no index that supports this aggregate. COUNT needs a countable index whose properties are the WHERE fields; SUM and AVG need a matching summable index. The schema below lists each index's flags.`,
  'range-order': msg`Add ORDER BY for every field filtered with a range (<, >, BETWEEN, STARTS WITH) or IN.`,
  'no-index': msg`No index covers this combination of WHERE and ORDER BY fields. Filters and sorting must follow one index's property order; the schema below lists the indexes.`,
  unsupported: msg`The node that answered does not support this request; it may run an older Platform version. Run it again to reach a different node.`,
  limit: msg`Platform rejected the LIMIT for this query shape. Try a smaller LIMIT.`,
}
