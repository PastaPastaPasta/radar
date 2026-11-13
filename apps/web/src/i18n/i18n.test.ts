import { t } from '@lingui/core/macro'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatDate, formatInt, formatRelative } from '@/lib/format'
import { activateLocale, AVAILABLE_LOCALES, detectLocale, i18n, matchLocale } from './index'
import { LOCALE_CODES } from './locales'

const SHIPPED = ['en', 'de', 'fr', 'es', 'pt', 'ja', 'zh', 'ru', 'tr', 'uk']

afterEach(async () => {
  vi.unstubAllGlobals()
  localStorage.clear()
  await activateLocale('en')
})

describe('locales', () => {
  it('ships the ten locales, each with a catalog @IN-13 @HY-15', () => {
    expect([...LOCALE_CODES]).toEqual(SHIPPED)
    expect(AVAILABLE_LOCALES.map((l) => l.code)).toEqual(SHIPPED)
  })

  it('matches a regional browser language to its base locale @IN-13 @HY-15', () => {
    expect(matchLocale(['pt-BR'])).toBe('pt')
    expect(matchLocale(['zh-CN', 'en'])).toBe('zh')
    expect(matchLocale(['uk-UA'])).toBe('uk')
    expect(matchLocale(['xx', 'tr'])).toBe('tr')
    expect(matchLocale(['xx'])).toBeUndefined()
  })

  it('honours the browser language on a first visit and a saved choice after that @IN-13 @HY-15', () => {
    vi.stubGlobal('navigator', { languages: ['de-AT', 'en'] })
    expect(detectLocale()).toBe('de')
    localStorage.setItem('radar.locale', 'ja')
    expect(detectLocale()).toBe('ja')
  })

  it('falls back to English for a browser language Radar does not ship @IN-13', () => {
    vi.stubGlobal('navigator', { languages: ['sv-SE'] })
    expect(detectLocale()).toBe('en')
  })
})

describe('switching language', () => {
  it('settles on the last language asked for, even when an earlier one loads later', async () => {
    await activateLocale('de')
    await activateLocale('en')
    const slow = activateLocale('ja')
    const fast = activateLocale('de')
    await Promise.all([slow, fast])
    expect(i18n.locale).toBe('de')
    expect(document.documentElement.lang).toBe('de')
  })

  it('translates messages, sets <html lang> and remembers the choice @IN-13 @HY-15', async () => {
    await activateLocale('ru', true)
    expect(document.documentElement.lang).toBe('ru')
    expect(i18n.locale).toBe('ru')
    expect(localStorage.getItem('radar.locale')).toBe('ru')
    expect(t`Settings`).toBe('Настройки')
  })

  it('formats numbers and dates for the locale @IN-13', async () => {
    const when = Date.UTC(2026, 10, 10, 14, 28)
    await activateLocale('de')
    expect(formatInt(1234567)).toBe('1.234.567')
    expect(formatDate(when, { utc: true })).toContain('Nov')
    await activateLocale('ru')
    expect(formatInt(1234567).replace(/\s/g, ' ')).toBe('1 234 567')
    expect(formatRelative(when, when + 90_000)).toMatch(/мин/)
  })
})
