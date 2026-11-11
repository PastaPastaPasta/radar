import { afterEach, describe, expect, it } from 'vitest'
import {
  formatBytes,
  formatDate,
  formatDuration,
  digitsFor,
  formatInt,
  formatSignificant,
  formatIsoUtc,
  formatPercent,
  formatRelative,
  setFormatLocale,
} from './format'

afterEach(() => {
  setFormatLocale('en')
})

describe('format', () => {
  it('groups heights and percentages', () => {
    expect(formatInt(2_569_992)).toBe('2,569,992')
    expect(formatInt(2_569_992n)).toBe('2,569,992')
    expect(formatPercent(0.991)).toBe('99.1%')
  })

  it('follows the active locale', () => {
    setFormatLocale('de')
    expect(formatInt(2_569_992)).toBe('2.569.992')
  })

  it('formats bytes in decimal units', () => {
    expect(formatBytes(68_900)).toBe('68.9 kB')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1_250_000)).toBe('1.3 MB')
    expect(formatBytes(999_960)).toBe('1.0 MB')
  })

  it('formats durations with the two largest units', () => {
    expect(formatDuration(21_000)).toBe('21 s')
    expect(formatDuration(8 * 60_000)).toBe('8 min')
    expect(formatDuration(3 * 3_600_000 + 12 * 60_000)).toBe('3 h 12 min')
    expect(formatDuration(2 * 86_400_000 + 4 * 3_600_000)).toBe('2 d 4 h')
  })

  it('formats dates in UTC', () => {
    const ms = Date.UTC(2026, 10, 10, 14, 28, 42)
    expect(formatDate(ms, { utc: true })).toBe('10 Nov 2026, 14:28 UTC')
    expect(formatDate(ms, { utc: true, date: false })).toBe('14:28 UTC')
    expect(formatDate(ms, { utc: true, time: false })).toBe('10 Nov 2026')
    expect(formatIsoUtc(ms)).toBe('2026-11-10T14:28:42Z')
  })

  it('formats relative times', () => {
    const now = Date.UTC(2026, 10, 10, 14, 30)
    expect(formatRelative(now - 21_000, now)).toBe('21 s ago')
    expect(formatRelative(now - 8 * 60_000, now)).toBe('8 min ago')
    expect(formatRelative(now - 2 * 3_600_000, now)).toBe('2 h ago')
    expect(formatRelative(now - 30 * 3_600_000, now)).toBe('yesterday')
    expect(formatRelative(Date.UTC(2026, 10, 6, 9), now)).toBe('6 Nov')
    expect(formatRelative(Date.UTC(2025, 10, 6, 9), now)).toBe('6 Nov 2025')
    expect(formatRelative(now + 5 * 60_000, now)).toBe('in 5 min')
    expect(formatRelative(now + 400, now)).toBe('0 s ago')
  })
})

describe('formatSignificant @IN-16', () => {
  it('keeps a small nonzero figure distinguishable from zero', () => {
    expect(formatSignificant(0.004010969129951115)).toBe('0.004011')
    expect(formatSignificant(0.004010969129951115, 6)).toBe('0.00401097')
    expect(formatSignificant(0.0000123)).toBe('0.0000123')
  })

  it('rounds to a whole number from 1,000 up and to significant digits below', () => {
    expect(formatSignificant(123_456_789.6)).toBe('123,456,790')
    expect(formatSignificant(1234.4)).toBe('1,234')
    expect(formatSignificant(12.3456)).toBe('12.35')
    expect(formatSignificant(0)).toBe('0')
  })
})

describe('digitsFor @HY-02', () => {
  it('counts the fraction digits that separate values a step apart', () => {
    expect(digitsFor(100)).toBe(0)
    expect(digitsFor(1)).toBe(0)
    expect(digitsFor(0.5)).toBe(1)
    expect(digitsFor(0.02)).toBe(2)
    expect(digitsFor(0.001)).toBe(3)
    expect(digitsFor(1e-12)).toBe(8)
    expect(digitsFor(0)).toBe(0)
  })
})
