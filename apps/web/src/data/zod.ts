import { z } from 'zod'

const DIGITS = /^-?\d+$/

/** Duffs, credits and token units: a JSON number or a numeric string, held as bigint. */
export const zBigint = z
  .union([z.number().refine(Number.isInteger), z.string().regex(DIGITS)])
  .transform((v) => BigInt(v))

/** Nullable variant for fields a backend sends as null before it has a value. */
export const zBigintOrNull = zBigint.nullable()

export const zHex = z
  .string()
  .regex(/^(?:[0-9a-fA-F]{2})*$/)
  .transform((s) => s.toLowerCase())

export const zHex64 = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/)
  .transform((s) => s.toLowerCase())

/** ISO 8601 date-time to ms epoch. */
export const zIsoDate = z.string().transform((s, ctx) => {
  const ms = Date.parse(s)
  if (Number.isNaN(ms)) {
    ctx.issues.push({ code: 'custom', message: 'invalid date', input: s })
    return z.NEVER
  }
  return ms
})

export const zUnixSeconds = z.number().transform((s) => s * 1000)

export const zUnixMs = z.number()

/** A number sent either as a JSON number or a numeric string. */
export const zNum = z.union([
  z.number(),
  z
    .string()
    .regex(/^-?\d+(?:\.\d+)?$/)
    .transform(Number),
])

export const zCount = z.union([z.number().int(), z.string().regex(/^\d+$/).transform(Number)])
