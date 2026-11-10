import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { zBigint } from './zod'

describe('zBigint', () => {
  it('reads safe integers and digit strings of any size', () => {
    expect(zBigint.parse(5)).toBe(5n)
    expect(zBigint.parse('-12')).toBe(-12n)
    expect(zBigint.parse(Number.MAX_SAFE_INTEGER)).toBe(9007199254740991n)
    expect(zBigint.parse('1152921504606846976')).toBe(1152921504606846976n)
  })

  it('rejects JSON numbers that have already lost precision', () => {
    expect(zBigint.safeParse(2 ** 60).success).toBe(false)
    expect(zBigint.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(false)
    expect(zBigint.safeParse(-(2 ** 53)).success).toBe(false)
  })

  it('rejects fractions and non-numeric strings', () => {
    expect(zBigint.safeParse(1.5).success).toBe(false)
    expect(zBigint.safeParse('1.5').success).toBe(false)
    expect(zBigint.safeParse(Number.NaN).success).toBe(false)
  })
})

describe('zod config', () => {
  it('compiles validators without eval', () => {
    expect(z.core.globalConfig.jitless).toBe(true)
  })
})
