export const SOURCE_LOCALE = 'en'

/**
 * The locales Radar ships, in the order the language menu shows them. `name` is the language in
 * its own script. To add one, add a line here, run `pnpm i18n:extract`, translate the new
 * `locales/<code>/messages.po`, and commit; nothing else changes.
 */
export type LocaleCode = string

export const LOCALES: readonly { code: LocaleCode; name: string }[] = [
  { code: 'en', name: 'English' },
]

export const LOCALE_CODES: readonly LocaleCode[] = LOCALES.map((l) => l.code)

export function isLocale(value: unknown): value is LocaleCode {
  return typeof value === 'string' && LOCALE_CODES.includes(value)
}

/** The first supported locale among the browser's languages, matching "de-AT" to "de". */
export function matchLocale(languages: readonly string[]): LocaleCode | undefined {
  for (const raw of languages) {
    const tag = raw.toLowerCase()
    const exact = LOCALE_CODES.find((c) => c.toLowerCase() === tag)
    if (exact) return exact
    const base = tag.split('-')[0]
    const prefix = LOCALE_CODES.find((c) => c.toLowerCase().split('-')[0] === base)
    if (prefix) return prefix
  }
  return undefined
}
