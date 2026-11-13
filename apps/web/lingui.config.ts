import { defineConfig } from '@lingui/cli'
import { formatter } from '@lingui/format-po'
import { LOCALE_CODES, SOURCE_LOCALE } from './src/i18n/locales'

/**
 * Which directories (or files) of `src` each package's strings are extracted from. A package's catalog is
 * `src/i18n/locales/{locale}/<name>.po`; everything else stays in `messages.po`, which is frozen until INT.
 * ARCHITECTURE §9.1.
 */
const PACKAGES = {
  'net-a': ['features/network/nodes', 'features/network/v24', 'features/home'],
  'net-b': ['features/network/masternodes', 'data/masternodes'],
  'net-c': ['features/network/mn'],
  'net-d': ['features/network/map', 'features/network/changes', 'features/tools/api'],
  'p-home': ['features/platform/home', 'features/core/status'],
  'p-chain': [
    'features/network/epochs',
    'features/network/epoch',
    'features/network/protocol',
    'features/platform/quorums',
    'features/platform/credits',
    'features/platform/shielded',
  ],
  'p-blocks': [
    'features/platform/blocks',
    'features/platform/block',
    'features/platform/txs',
    'features/platform/tx',
    'features/entity/platform/transition-table.tsx',
    'features/entity/platform/block-table.tsx',
  ],
  'p-id': ['features/platform/identities', 'features/platform/identity'],
  'p-data': [
    'features/platform/contracts',
    'features/platform/contract',
    'features/platform/document',
    'features/platform/groups',
    'features/platform/group',
  ],
  'p-token': [
    'features/platform/tokens',
    'features/platform/token',
    'features/platform/platform-address',
  ],
  'p-vote': [
    'features/platform/names',
    'features/platform/name',
    'features/platform/contests',
    'features/platform/contest',
    'features/platform/votes',
    'features/platform/polls',
  ],
  tools: [
    'features/tools/query',
    'features/tools/decoders',
    'features/tools/transition',
    'features/tools/sdk-reference',
  ],
  you: ['features/you', 'app/global-mounts.tsx', 'app/sw-register.ts', 'sw'],
  'uni-s': ['features/search'],
  'uni-l': ['features/entity', 'shell', 'features/core/tx', 'ui/link-out.tsx', 'lib/linkouts.ts'],
} as const satisfies Record<string, readonly string[]>

/** Files that sit inside one package's directory but belong to another. */
const BELONGS_ELSEWHERE: Partial<Record<keyof typeof PACKAGES, readonly string[]>> = {
  'uni-l': [
    'features/entity/platform/transition-table.tsx',
    'features/entity/platform/block-table.tsx',
  ],
}

const NOT_SOURCE = ['**/*.test.*', '**/test/**', '**/node_modules/**', '**/routeTree.gen.ts']
const at = (path: string) => `<rootDir>/src/${path}`
const claimed = Object.values(PACKAGES).flatMap((paths) =>
  paths.flatMap((p) => [at(p), `${at(p)}/**`]),
)

export default defineConfig({
  sourceLocale: SOURCE_LOCALE,
  locales: [...LOCALE_CODES],
  fallbackLocales: { default: SOURCE_LOCALE },
  catalogs: [
    ...(Object.keys(PACKAGES) as (keyof typeof PACKAGES)[]).map((name) => ({
      path: `<rootDir>/src/i18n/locales/{locale}/${name}`,
      include: PACKAGES[name].map(at),
      exclude: [...NOT_SOURCE, ...(BELONGS_ELSEWHERE[name] ?? []).map(at)],
    })),
    {
      path: '<rootDir>/src/i18n/locales/{locale}/messages',
      include: ['<rootDir>/src'],
      exclude: [...NOT_SOURCE, ...claimed],
    },
  ],
  format: formatter({ lineNumbers: false, origins: false }),
})
