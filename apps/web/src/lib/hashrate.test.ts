import { describe, expect, it } from 'vitest'
import { formatHashrate, hashrateFromDifficulty } from './hashrate'

describe('hashrateFromDifficulty', () => {
  it('is difficulty × 2³² over the 150 second block target', () => {
    expect(hashrateFromDifficulty(1)).toBeCloseTo(2 ** 32 / 150, 6)
    // Hyphen's metrics give 3,435,779,041,934,084 H/s for this mainnet difficulty.
    expect(hashrateFromDifficulty(119_993_196.86789824)).toBeCloseTo(3_435_779_041_934_084, -3)
  })

  it('reads in the largest unit it reaches', () => {
    expect(formatHashrate(hashrateFromDifficulty(119_993_196.86789824))).toBe('3.44 PH/s')
    expect(formatHashrate(hashrateFromDifficulty(0.005))).toBe('143.17 kH/s')
  })
})
