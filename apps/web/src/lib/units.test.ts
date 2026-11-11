import { describe, expect, it, vi } from 'vitest'
import {
  DISPLAY_UNITS,
  formatAmountParts,
  fixedParts,
  getUnitPrefs,
  readFiatPreference,
  subscribeUnitPrefs,
  writeFiatPreference,
  formatAmountText,
  denomination,
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

describe('unit and fiat preferences', () => {
  it('offers the four units in order', () => {
    expect(DISPLAY_UNITS).toEqual(['DASH', 'mDASH', 'uDASH', 'duffs'])
  })

  it('shows USD unless switched off, and remembers it', () => {
    localStorage.clear()
    expect(readFiatPreference()).toBe(true)
    writeFiatPreference(false)
    expect(localStorage.getItem('radar.fiat')).toBe('0')
    expect(readFiatPreference()).toBe(false)
    writeFiatPreference(true)
    expect(readFiatPreference()).toBe(true)
  })

  it('hands out one snapshot until something changes and tells subscribers', () => {
    localStorage.clear()
    const first = getUnitPrefs()
    expect(getUnitPrefs()).toBe(first)
    const seen = vi.fn()
    const off = subscribeUnitPrefs(seen)
    writeUnitPreference('duffs')
    expect(seen).toHaveBeenCalledTimes(1)
    expect(getUnitPrefs()).toEqual({ unit: 'duffs', fiat: true })
    expect(getUnitPrefs()).not.toBe(first)
    off()
    writeUnitPreference('DASH')
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('still answers when storage throws', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readUnitPreference()).toBe('DASH')
    expect(readFiatPreference()).toBe(true)
    expect(() => writeUnitPreference('mDASH')).not.toThrow()
    get.mockRestore()
    set.mockRestore()
  })
})

describe('amount edge cases', () => {
  it('prints zero in every unit without a sign or decimals', () => {
    for (const unit of DISPLAY_UNITS) {
      expect(formatAmountText(0n, 'duffs', { unit })).toBe(`0${NB}${unitLabel(unit)}`)
      expect(formatAmountText(0n, 'credits', { unit, signed: true })).toBe(
        `0${NB}${unitLabel(unit)}`,
      )
    }
    expect(formatAmountParts(0n, 'duffs').zero).toBe(true)
  })

  it('shows one duff in each unit at its own precision', () => {
    expect(formatAmountText(1n, 'duffs', { unit: 'duffs' })).toBe(`1${NB}duffs`)
    expect(formatAmountText(1n, 'duffs', { unit: 'uDASH' })).toBe(`0.01${NB}µDASH`)
    expect(formatAmountText(1n, 'duffs', { unit: 'mDASH' })).toBe(`0${NB}mDASH`)
    expect(formatAmountText(1n, 'duffs', { unit: 'mDASH', density: 'table' })).toBe(
      `0.00001${NB}mDASH`,
    )
    expect(formatAmountText(1n, 'duffs', { unit: 'DASH', density: 'table' })).toBe(
      `0.00000001${NB}DASH`,
    )
  })

  it('handles the whole DASH supply and beyond 2^64 exactly', () => {
    const supply = 18_920_000n * 100_000_000n
    expect(formatAmountText(supply, 'duffs')).toBe(`18,920,000${NB}DASH`)
    expect(formatAmountText(supply, 'duffs', { unit: 'duffs' })).toBe(
      `1,892,000,000,000,000${NB}duffs`,
    )
    const huge = 123_456_789_012_345_678_901_234_567_890n
    expect(formatAmountText(huge, 'duffs', { unit: 'duffs' })).toBe(
      `123,456,789,012,345,678,901,234,567,890${NB}duffs`,
    )
    expect(formatAmountText(huge, 'credits', { density: 'table' })).toBe(
      `1,234,567,890,123,456,789.01234568${NB}DASH`,
    )
  })

  it('keeps the minus sign on negative amounts in every unit and density', () => {
    expect(formatAmountText(-123_456_789n, 'duffs')).toBe(`−1.2346${NB}DASH`)
    expect(formatAmountText(-123_456_789n, 'duffs', { density: 'table' })).toBe(
      `−1.23456789${NB}DASH`,
    )
    expect(formatAmountText(-250n, 'duffs', { unit: 'duffs' })).toBe(`−250${NB}duffs`)
  })

  it('rounds half away from zero at the last shown digit, and carries', () => {
    expect(formatAmountText(5n, 'duffs', { unit: 'mDASH', density: 'table' })).toBe(
      `0.00005${NB}mDASH`,
    )
    expect(formatAmountText(99_995n, 'duffs', { unit: 'DASH' })).toBe(`0.0010${NB}DASH`)
    expect(formatAmountText(99_994n, 'duffs', { unit: 'DASH' })).toBe(`0.0010${NB}DASH`)
    expect(formatAmountText(-99_995n, 'duffs', { unit: 'DASH' })).toBe(`−0.0010${NB}DASH`)
    expect(formatAmountText(199_999_995n, 'duffs', { unit: 'DASH' })).toBe(`2${NB}DASH`)
  })

  it('formats tokens by their own decimals, including none', () => {
    expect(formatAmountText(1_234_567n, { token: { decimals: 0, symbol: 'PTS' } })).toBe(
      `1,234,567${NB}PTS`,
    )
    expect(formatAmountText(-5n, { token: { decimals: 8, symbol: 'X' } })).toBe(`−0.00000005${NB}X`)
    expect(formatAmountText(10n ** 30n, { token: { decimals: 18, symbol: 'Y' } })).toBe(
      `1,000,000,000,000${NB}Y`,
    )
  })

  it('labels every unit on testnet', () => {
    expect(unitLabel('DASH', true)).toBe('tDASH')
    expect(unitLabel('mDASH', true)).toBe('tmDASH')
  })
})

describe('formatFiat edge cases', () => {
  it('shows dust as a bound, not as zero', () => {
    expect(formatFiat(1n, 46.2)).toBe('< $0.000001')
    expect(formatFiat(0n, 46.2)).toBe('≈ $0')
  })

  it('keeps three significant figures across magnitudes', () => {
    expect(formatFiat(18_920_000n * 100_000_000n, 46.2)).toBe('≈ $874,000,000')
    expect(formatFiat(123_456_789n, 0.000123)).toBe('≈ $0.000152')
    expect(formatFiat(100_000_000n, 1234.5678)).toBe('≈ $1,230')
    expect(formatFiat(100_000_000n, 999.5)).toBe('≈ $1,000')
  })

  it('does not overflow on amounts beyond 2^64 duffs', () => {
    expect(formatFiat(10n ** 25n, 46.2)).toBe('≈ $4,620,000,000,000,000,000')
  })

  it('refuses a negative rate', () => {
    expect(formatFiat(1_000_000n, -1)).toBe('')
  })
})

describe('USD as the primary unit @IN-12', () => {
  it('is remembered next to the Dash denominations and read back', () => {
    writeUnitPreference('USD')
    expect(localStorage.getItem('radar.unit')).toBe('USD')
    expect(readUnitPreference()).toBe('USD')
    expect(getUnitPrefs().unit).toBe('USD')
    localStorage.removeItem('radar.unit')
  })

  it('draws DASH figures in DASH when USD leads', () => {
    expect(denomination('USD')).toBe('DASH')
    expect(denomination('mDASH')).toBe('mDASH')
  })

  it('signs a USD figure and keeps three significant figures', () => {
    expect(formatFiat(100_000_000n, 46.2, true)).toBe('≈ +$46.2')
    expect(formatFiat(-100_000_000n, 46.2, true)).toBe('≈ −$46.2')
    expect(formatFiat(0n, 46.2, true)).toBe('≈ $0')
    expect(formatFiat(5_000_607_499n, 46.2, true)).toBe('≈ +$2,310')
  })
})
