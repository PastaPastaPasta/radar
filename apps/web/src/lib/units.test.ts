import { describe, expect, it } from 'vitest'
import {
  fixedParts,
  formatAmountText,
  formatFiat,
  readUnitPreference,
  unitLabel,
  writeUnitPreference,
} from './units'

const NB = ' '

describe('fixedParts', () => {
  it('rounds half away from zero with integer arithmetic', () => {
    expect(fixedParts(1005n, 3, 2)).toEqual({ negative: false, int: '1', frac: '01' })
    expect(fixedParts(-1005n, 3, 2)).toEqual({ negative: true, int: '1', frac: '01' })
    expect(fixedParts(999n, 3, 2)).toEqual({ negative: false, int: '1', frac: '00' })
    expect(fixedParts(5n, 3, 0)).toEqual({ negative: false, int: '0', frac: '' })
  })

  it('pads when asking for more digits than the scale', () => {
    expect(fixedParts(25n, 1, 3)).toEqual({ negative: false, int: '2', frac: '500' })
  })

  it('is exact beyond 2^53', () => {
    expect(fixedParts(1_013_331_591_984_123n, 11, 4)).toEqual({
      negative: false,
      int: '10133',
      frac: '3159',
    })
  })
})

describe('formatAmountText', () => {
  it('shows four decimals in prose and keeps whole numbers whole', () => {
    expect(formatAmountText(5_000_607_499n, 'duffs')).toBe(`50.0061${NB}DASH`)
    expect(formatAmountText(3_692_100_000_000n, 'duffs')).toBe(`36,921${NB}DASH`)
  })

  it('shows eight decimals in tables', () => {
    expect(formatAmountText(5_000_000_000n, 'duffs', { density: 'table' })).toBe(
      `50.00000000${NB}DASH`,
    )
  })

  it('uses duffs for fees under 0.0001 DASH', () => {
    expect(formatAmountText(666n, 'duffs')).toBe(`666${NB}duffs`)
    expect(formatAmountText(10_000n, 'duffs')).toBe(`0.0001${NB}DASH`)
  })

  it('converts credits to DASH and to mDASH', () => {
    expect(formatAmountText(1_013_331_591_984n, 'credits')).toBe(`10.1333${NB}DASH`)
    expect(formatAmountText(74_600_000n, 'credits', { unit: 'mDASH' })).toBe(`0.7460${NB}mDASH`)
  })

  it('signs amounts', () => {
    expect(formatAmountText(139_160_000n, 'duffs', { signed: true })).toBe(`+1.3916${NB}DASH`)
    expect(formatAmountText(-50_000_000n, 'duffs', { signed: true })).toBe(`−0.5000${NB}DASH`)
    expect(formatAmountText(0n, 'duffs', { signed: true })).toBe(`0${NB}DASH`)
  })

  it('compacts large amounts', () => {
    expect(formatAmountText(120_000_000_000n, 'duffs', { compact: true })).toBe(`1.2k${NB}DASH`)
    expect(formatAmountText(1_266_000_000_000_000n, 'duffs', { compact: true })).toBe(
      `12.66 M${NB}DASH`,
    )
    expect(formatAmountText(2_000_000_000n, 'duffs', { compact: true })).toBe(`20${NB}DASH`)
  })

  it('steps up a unit when rounding reaches the next one', () => {
    expect(formatAmountText(99_999_960_000_000n, 'duffs', { compact: true })).toBe(`1 M${NB}DASH`)
    expect(formatAmountText(99_999_999_960_000_000n, 'duffs', { compact: true })).toBe(
      `1 B${NB}DASH`,
    )
  })

  it('never prints a sign on something that shows as zero', () => {
    expect(formatAmountText(-1n, 'duffs', { unit: 'DASH' })).toBe(`0${NB}DASH`)
    expect(formatAmountText(-4n, 'credits', { unit: 'DASH', density: 'table' })).toBe(
      `0.00000000${NB}DASH`,
    )
    expect(formatAmountText(1n, 'duffs', { unit: 'DASH', signed: true })).toBe(`0${NB}DASH`)
  })

  it('shows credits below 0.0001 DASH in duffs', () => {
    expect(formatAmountText(5_000_000n, 'credits')).toBe(`5,000${NB}duffs`)
    expect(formatAmountText(1000n, 'credits')).toBe(`1${NB}duffs`)
  })

  it('labels the testnet unit and token amounts', () => {
    expect(formatAmountText(100_000_000n, 'duffs', { testnet: true })).toBe(`1${NB}tDASH`)
    expect(formatAmountText(1_500_000n, { token: { decimals: 6, symbol: 'DUSD' } })).toBe(
      `1.5${NB}DUSD`,
    )
  })

  it('handles micro units', () => {
    expect(formatAmountText(250n, 'duffs', { unit: 'uDASH' })).toBe(`2.50${NB}µDASH`)
    expect(unitLabel('uDASH', true)).toBe('tµDASH')
    expect(unitLabel('duffs', true)).toBe('duffs')
  })
})

describe('formatFiat', () => {
  it('rounds to three significant figures', () => {
    expect(formatFiat(5_000_607_499n, 46.2)).toBe('≈ $2,310')
    expect(formatFiat(10_000_000n, 46.2)).toBe('≈ $4.62')
    expect(formatFiat(1_000_000n, 46.2)).toBe('≈ $0.462')
    expect(formatFiat(2_165_000_000n, 46.2)).toBe('≈ $1,000')
    expect(formatFiat(100_000_000n, 46.2)).toBe('≈ $46.2')
    expect(formatFiat(0n, 46.2)).toBe('≈ $0')
  })

  it('keeps the sign of negative amounts and refuses a broken rate', () => {
    expect(formatFiat(-5_000_607_499n, 46.2)).toBe('≈ −$2,310')
    expect(formatFiat(1_000_000n, Number.NaN)).toBe('')
    expect(formatFiat(1_000_000n, Number.POSITIVE_INFINITY)).toBe('')
  })
})

describe('unit preference', () => {
  it('round-trips through localStorage and ignores junk', () => {
    expect(readUnitPreference()).toBe('DASH')
    writeUnitPreference('mDASH')
    expect(readUnitPreference()).toBe('mDASH')
    localStorage.setItem('radar.unit', 'bogus')
    expect(readUnitPreference()).toBe('DASH')
    localStorage.removeItem('radar.unit')
  })
})
