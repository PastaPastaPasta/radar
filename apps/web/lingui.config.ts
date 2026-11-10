import { defineConfig } from '@lingui/cli'
import { formatter } from '@lingui/format-po'
import { LOCALE_CODES, SOURCE_LOCALE } from './src/i18n/locales'

export default defineConfig({
  sourceLocale: SOURCE_LOCALE,
  locales: [...LOCALE_CODES],
  fallbackLocales: { default: SOURCE_LOCALE },
  catalogs: [
    {
      path: '<rootDir>/src/i18n/locales/{locale}/messages',
      include: ['<rootDir>/src'],
      exclude: ['**/*.test.*', '**/test/**', '**/node_modules/**', '**/routeTree.gen.ts'],
    },
  ],
  format: formatter({ lineNumbers: false, origins: false }),
})
