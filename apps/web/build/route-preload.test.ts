import type { Rollup } from 'vite'
import { describe, expect, it } from 'vitest'
import { buildRoutePreload, routePattern } from './route-preload'

const chunk = (fileName: string, o: Partial<Rollup.OutputChunk> = {}): Rollup.OutputChunk =>
  ({
    type: 'chunk',
    fileName,
    isEntry: false,
    imports: [],
    dynamicImports: [],
    moduleIds: [],
    facadeModuleId: null,
    ...o,
  }) as Rollup.OutputChunk

const bundleOf = (...chunks: Rollup.OutputChunk[]): Rollup.OutputBundle =>
  Object.fromEntries(chunks.map((c) => [c.fileName, c]))

const SRC = '/repo/apps/web/src'

describe('routePattern', () => {
  it.each([
    ['tx.$txid', '/tx/$txid'],
    ['governance.index', '/governance/'],
    ['index', '/'],
    ['contract.$id.documents.$type', '/contract/$id/documents/$type'],
    ['[_][_]kit', '/__kit'],
    ['insight.$', '/insight/$'],
  ])('%s → %s', (file, pattern) => {
    expect(routePattern(file)).toBe(pattern)
  })
})

describe('buildRoutePreload', () => {
  const entry = chunk('assets/index.js', {
    isEntry: true,
    facadeModuleId: '/repo/apps/web/index.html',
    imports: ['assets/react.js'],
  })
  const react = chunk('assets/react.js')
  const shared = chunk('assets/queries.js', { imports: ['assets/react.js'] })
  const txPage = chunk('assets/tx.js', {
    facadeModuleId: `${SRC}/routes/tx.$txid.tsx?tsr-split=component`,
    moduleIds: [`${SRC}/routes/tx.$txid.tsx?tsr-split=component`],
    imports: ['assets/index.js', 'assets/queries.js'],
  })
  const votesPage = chunk('assets/votes.js', {
    facadeModuleId: `${SRC}/routes/votes.tsx?tsr-split=component`,
    imports: ['assets/index.js', 'assets/gone.js'],
    viteMetadata: { importedCss: new Set(['assets/votes.css']), importedAssets: new Set() },
  })
  const routePrefetch = chunk('assets/route-prefetch.js', {
    facadeModuleId: `${SRC}/data/query/route-prefetch.ts`,
    moduleIds: [`${SRC}/data/query/route-prefetch.ts`],
    imports: ['assets/queries.js'],
  })
  const pVote = chunk('assets/p-vote.js', {
    facadeModuleId: `${SRC}/data/query/prefetch/p-vote.ts`,
    moduleIds: [`${SRC}/data/query/prefetch/p-vote.ts`],
  })
  const pool = chunk('assets/pool.js', {
    moduleIds: [`${SRC}/data/dapi-core/pool.ts`, `${SRC}/data/dapi-core/production.ts`],
  })
  const seed = chunk('assets/seed.mainnet.js', {
    facadeModuleId: `${SRC}/data/dapi-core/seed.mainnet.json`,
  })
  const en = chunk('assets/en.js', { facadeModuleId: `${SRC}/i18n/locales/en/index.ts` })
  const identityPage = chunk('assets/identity.js', {
    facadeModuleId: `${SRC}/routes/identity.$id.tsx?tsr-split=component`,
    imports: ['assets/index.js', 'assets/platform.js'],
  })
  // Named after the app's wrapper, not the package: only its modules say it holds the SDK.
  const platform = chunk('assets/platform.js', {
    moduleIds: [
      `${SRC}/data/sdk/client.ts`,
      '/repo/node_modules/.pnpm/@dashevo+evo-sdk@3.0.0/node_modules/@dashevo/evo-sdk/dist/sdk.js',
    ],
  })
  const sources: Record<string, string> = {
    [`${SRC}/routes/tx.$txid.tsx`]:
      "const { txPrefetch } = await import('@/data/query/route-prefetch')",
    [`${SRC}/routes/votes.tsx`]: "loader: routePrefetch('p-vote', 'votesPrefetch'),",
  }
  const table = buildRoutePreload(
    bundleOf(
      entry,
      react,
      shared,
      txPage,
      votesPage,
      routePrefetch,
      pVote,
      pool,
      seed,
      en,
      identityPage,
      platform,
    ),
    (id) => sources[id] ?? '',
  )
  const names = (ix: number[]) => ix.map((i) => table.files[i])

  it("lists a route's page chunk, its static imports, their stylesheets and its loader's prefetch module, leaving out what the entry loads and chunks no longer in the bundle", () => {
    expect(Object.fromEntries(table.routes.map(([p, ix]) => [p, names(ix)]))).toEqual({
      '/identity/$id': ['assets/identity.js', 'assets/platform.js'],
      '/tx/$txid': ['assets/queries.js', 'assets/route-prefetch.js', 'assets/tx.js'],
      '/votes': ['assets/p-vote.js', 'assets/votes.css', 'assets/votes.js'],
    })
  })

  it('lists the catalog per locale, and leaves out the DAPI pool every page loads after first paint', () => {
    expect(names(table.locales.en!)).toEqual(['assets/en.js'])
    expect(table.files).not.toContain('assets/pool.js')
    expect(table.files).not.toContain('assets/seed.mainnet.js')
  })

  it('marks the files whose modules hold the Platform SDK, whatever the chunk is named, and no others', () => {
    expect(names(table.sdk)).toEqual(['assets/platform.js'])
    const tx = table.routes.find(([p]) => p === '/tx/$txid')![1]
    expect(tx.some((i) => table.sdk.includes(i))).toBe(false)
  })
})
