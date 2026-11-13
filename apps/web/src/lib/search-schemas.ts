import { z } from 'zod'

export interface NumericRange {
  min?: number
  max?: number
}

export type WhereOp = 'eq' | 'lt' | 'lte' | 'gt' | 'gte' | 'in' | 'sw'

export interface WhereClause {
  field: string
  op: WhereOp
  value: string | string[]
}

const csvInput = z.preprocess((v) => (Array.isArray(v) ? v.map(String).join(',') : v), z.string())

/** A list item as it sits between the commas of a URL value: `%` and `,` are written `%25` and `%2C`. */
export const escapeListItem = (item: string): string =>
  item.replace(/%/g, '%25').replace(/,/g, '%2C')

export function unescapeListItem(item: string): string {
  try {
    return decodeURIComponent(item.replace(/%(?!25|2C)/gi, '%25'))
  } catch {
    return item
  }
}

const listItems = (s: string): string[] => s.split(',').filter(Boolean).map(unescapeListItem)

/** An unordered set of values: split on `,`, de-duplicated, sorted. An item may hold a comma as `%2C`. */
export const zCsv = csvInput.transform((s) => [...new Set(listItems(s))].sort())

/**
 * An ordered list: split on `,`, order and repeats kept (a sort order, a cursor stack). An item may hold a comma as
 * `%2C`. `stringifySearch` keeps the order of an array and escapes each item.
 */
export const zList = csvInput.transform(listItems)

export const zCsvEnum = <const T extends readonly [string, ...string[]]>(values: T) =>
  csvInput.transform((s) =>
    [...new Set(s.split(','))]
      .filter((v): v is T[number] => (values as readonly string[]).includes(v))
      .sort(),
  )

const NUMBER = /^-?\d+(?:\.\d+)?$/

const rangeObject = z.object({ min: z.number().optional(), max: z.number().optional() })

/** `min..max`, either side optional. Accepts its own output so a validated search can be validated again. */
export const zRange = z.union([
  rangeObject,
  z.string().transform((s, ctx): NumericRange => {
    const parts = s.split('..')
    const [lo, hi] = parts
    const ok =
      parts.length === 2 &&
      (lo === '' || NUMBER.test(lo ?? '')) &&
      (hi === '' || NUMBER.test(hi ?? '')) &&
      s !== '..'
    if (!ok) {
      ctx.issues.push({ code: 'custom', message: 'Not a range', input: s })
      return z.NEVER
    }
    const min = lo ? Number(lo) : undefined
    const max = hi ? Number(hi) : undefined
    const [low, high] =
      min !== undefined && max !== undefined && min > max ? [max, min] : [min, max]
    return {
      ...(low !== undefined ? { min: low } : {}),
      ...(high !== undefined ? { max: high } : {}),
    }
  }),
])

export const zIsoDate = z.string().refine((s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s)
}, 'Not a date')

/** An optional field that a bad value turns into absent. */
export const zOpt = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined)

/** A field with a default that a bad value turns into the default; pair it with `stripSearchParams`. */
export const zDefault = <T extends z.ZodType>(schema: T, value: NonNullable<z.output<T>>) =>
  (schema as z.ZodType<z.output<T>, z.input<T>>)
    .default(value as never)
    .catch(value as never) as z.ZodCatch<z.ZodDefault<T>>

/** A page number; a value past `MAX_PAGE` is read as absent. */
export const MAX_PAGE = 100_000
export const zPage = z.coerce.number().int().min(1).max(MAX_PAGE)

export const LIMITS = [10, 25, 50, 75, 100] as const
export type Limit = (typeof LIMITS)[number]

/** A page length drawn from `values`, read from its string form. */
export const zLimitOf = <const T extends readonly number[]>(values: T) =>
  z.coerce.number().refine((n): n is T[number] => values.includes(n), 'Not an allowed limit')

export const zLimit = zLimitOf(LIMITS)

/** A non-negative integer from its string form. */
export const zInt = z.union([
  z.number().int().min(0),
  z
    .string()
    .regex(/^\d{1,15}$/, 'Not a non-negative integer')
    .transform(Number),
])

export const zHex64 = z
  .string()
  .regex(/^[0-9a-f]{64}$/i, 'Not 32 bytes of hex')
  .transform((s) => s.toLowerCase())

export const zHex40 = z
  .string()
  .regex(/^[0-9a-f]{40}$/i, 'Not 20 bytes of hex')
  .transform((s) => s.toLowerCase())

export const zBool01 = z
  .union([z.literal('1'), z.literal(1), z.literal(true)])
  .transform((): true => true)

const WHERE_OPS: readonly string[] = ['eq', 'lt', 'lte', 'gt', 'gte', 'in', 'sw']

const part = (s: string): string => encodeURIComponent(s).replace(/~/g, '%7E')

/**
 * `field~op~value` clauses joined by `,`; the values of `in` joined by `|`; every part percent-encoded. A clause with no
 * field, or an `in` with no values, can't be read back, so it is left out.
 */
export function encodeWhere(clauses: readonly WhereClause[]): string {
  return clauses
    .filter((c) => c.field !== '' && (!Array.isArray(c.value) || c.value.length > 0))
    .map((c) => {
      const value = Array.isArray(c.value) ? c.value.map(part).join('|') : part(c.value)
      return `${part(c.field)}~${c.op}~${value}`
    })
    .join(',')
}

function decodePart(s: string): string | undefined {
  try {
    return decodeURIComponent(s)
  } catch {
    return undefined
  }
}

/** The inverse of `encodeWhere`. A malformed clause is dropped. */
export function decodeWhere(s: string): WhereClause[] {
  const out: WhereClause[] = []
  for (const raw of s.split(',')) {
    const [field, op, value, ...rest] = raw.split('~')
    if (rest.length > 0 || !field || !op || value === undefined || !WHERE_OPS.includes(op)) continue
    const name = decodePart(field)
    if (!name) continue
    if (op === 'in') {
      const values = value.split('|').map(decodePart)
      if (values.some((v) => v === undefined)) continue
      out.push({ field: name, op: 'in', value: values as string[] })
    } else {
      const v = decodePart(value)
      if (v === undefined) continue
      out.push({ field: name, op: op as WhereOp, value: v })
    }
  }
  return out
}

/** Documents filter: the string form, read to clauses. Accepts its own output. */
export const zWhere = z.union([
  z.array(
    z.object({
      field: z.string(),
      op: z.enum(['eq', 'lt', 'lte', 'gt', 'gte', 'in', 'sw']),
      value: z.union([z.string(), z.array(z.string())]),
    }),
  ),
  z.string().transform((s) => decodeWhere(s)),
])
