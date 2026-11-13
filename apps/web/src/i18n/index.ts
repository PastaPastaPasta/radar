import { i18n, type Messages } from '@lingui/core'
import { useSyncExternalStore } from 'react'
import { setFormatLocale } from '@/lib/format'
import { isLocale, LOCALES, matchLocale, SOURCE_LOCALE, type LocaleCode } from './locales'

export { I18nProvider } from '@lingui/react'
export { i18n }
export { LOCALES, SOURCE_LOCALE, isLocale, matchLocale } from './locales'
export type { LocaleCode } from './locales'

const LOCALE_KEY = 'radar.locale'

const loaders = import.meta.glob<{ messages: Messages }>('./locales/*/index.ts')

/** The locales whose catalogs are built into this version of Radar. */
export const AVAILABLE_LOCALES = LOCALES.filter((l) => `./locales/${l.code}/index.ts` in loaders)

function storedLocale(): LocaleCode | undefined {
  try {
    const value = globalThis.localStorage?.getItem(LOCALE_KEY)
    return isLocale(value) ? value : undefined
  } catch {
    return undefined
  }
}

/** The saved choice, else the first match in the browser's languages, else English. */
export function detectLocale(): LocaleCode {
  const stored = storedLocale()
  if (stored) return stored
  const languages = globalThis.navigator?.languages ?? []
  return matchLocale(languages) ?? SOURCE_LOCALE
}

async function load(code: LocaleCode): Promise<void> {
  const loader = loaders[`./locales/${code}/index.ts`]
  if (!loader) throw new Error(`No catalog for locale ${code}`)
  i18n.load(code, (await loader()).messages)
}

function apply(code: LocaleCode): void {
  i18n.activate(code)
  setFormatLocale(code)
  if (typeof document !== 'undefined') document.documentElement.lang = code
}

/** Loads a locale's catalog and switches to it. With `remember`, the choice is kept for next visit. */
export async function activateLocale(code: LocaleCode, remember = false): Promise<void> {
  await load(code)
  apply(code)
  if (!remember) return
  try {
    globalThis.localStorage?.setItem(LOCALE_KEY, code)
  } catch {
    // storage unavailable: the choice lasts for this visit
  }
}

/**
 * The catalog of the visitor's locale, loaded as its own chunk so it stays out of the entry. The app renders after this
 * settles, which keeps message ids from flashing; a missing catalog falls back to English and then to the ids.
 */
export const i18nReady: Promise<void> = activateLocale(detectLocale())
  .catch(() => activateLocale(SOURCE_LOCALE))
  .catch(() => undefined)

export function useLocale(): {
  locale: LocaleCode
  setLocale: (code: LocaleCode) => Promise<void>
} {
  const locale = useSyncExternalStore(
    (cb) => i18n.on('change', cb),
    () => i18n.locale,
    () => SOURCE_LOCALE,
  )
  return {
    locale: isLocale(locale) ? locale : SOURCE_LOCALE,
    setLocale: (code) => activateLocale(code, true),
  }
}
