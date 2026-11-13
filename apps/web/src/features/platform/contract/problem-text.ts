import type { I18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import type { Problem, ProblemRule } from './doc-filters'

type Maker = (p: Problem) => ReturnType<typeof msg>

/** Each rule in plain words; the index and the property it names come from the problem. */
const RULES: Record<ProblemRule, Maker> = {
  'unknown-field': ({ field = '' }) =>
    msg`“${field}” isn’t in any index of this type, so Platform can’t filter on it.`,
  'no-index': ({ field = '', other = '' }) =>
    msg`No single index holds both “${field}” and “${other}”. Platform answers a query from one index.`,
  'skips-property': ({ field = '', other = '', index = '' }) =>
    msg`“${field}” needs a clause on “${other}” first: index ${index} is read in order, earlier properties before later ones.`,
  'range-not-last': ({ field = '', other = '', index = '' }) =>
    msg`A range (<, ≤, >, ≥, starts with) on “${field}” must be on the last property you filter on in index ${index}, but “${other}” comes after it.`,
  'two-range-fields': ({ field = '', other = '' }) =>
    msg`Only one property may have a range (<, ≤, >, ≥, starts with): “${field}” and “${other}” both do.`,
  'duplicate-field': ({ field = '' }) =>
    msg`“${field}” has more than one clause. Use one, or a lower and an upper bound.`,
  'two-in': () => msg`A query can have only one “in” clause.`,
  'empty-value': ({ field = '' }) => msg`“${field}” needs a value.`,
  'in-too-many': ({ field = '' }) => msg`The “in” clause on “${field}” takes at most 100 values.`,
  'in-duplicate': ({ field = '' }) =>
    msg`The values of the “in” clause on “${field}” must all be different.`,
  'starts-with-type': ({ field = '' }) =>
    msg`“starts with” works on text, and “${field}” isn’t text.`,
  'bad-number': ({ field = '' }) => msg`“${field}” takes a whole number.`,
  'bad-boolean': ({ field = '' }) => msg`“${field}” takes true or false.`,
  'bad-identifier': ({ field = '' }) =>
    msg`“${field}” takes an identifier: 32 bytes written in base58.`,
  'order-unknown': ({ field = '', index = '' }) =>
    msg`Index ${index} has no property “${field}” to order by.`,
  'order-sequence': ({ field = '' }) =>
    msg`Order by must follow the index’s property order, starting with “${field}”.`,
  'order-missing': ({ field = '' }) =>
    msg`The order must include “${field}”, which has an in or range clause.`,
}

export const problemText = (i18n: I18n, p: Problem): string => i18n._(RULES[p.rule](p))
