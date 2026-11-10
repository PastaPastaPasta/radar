import { describe, expect, it } from 'vitest'
import { zBigint } from './zod'

describe('zBigint', () => {
  it('reads integers, digit strings and numbers past 2^53', () => {
    expect(zBigint.parse(5)).toBe(5n)
    expect(zBigint.parse('-12')).toBe(-12n)
    expect(zBigint.parse(2 ** 60)).toBe(1152921504606846976n)
  })

  it('rejects fractions and non-numeric strings', () => {
    expect(zBigint.safeParse(1.5).success).toBe(false)
    expect(zBigint.safeParse('1.5').success).toBe(false)
    expect(zBigint.safeParse(Number.NaN).success).toBe(false)
  })
})
