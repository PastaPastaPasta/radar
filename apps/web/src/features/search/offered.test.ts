import { describe, expect, it } from 'vitest'
import { matchPages } from './pages'
import { isFinishedRoute, offered, UNFINISHED_ROUTES } from './offered'

const pageSources = import.meta.glob<string>('../*/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const resolverSources = import.meta.glob<string>('./resolvers/!(*.test).ts', {
  query: '?raw',
  import: 'default',
  eager: true,
})

function placeholderRoutes(): string[] {
  const found = new Set<string>()
  for (const [file, source] of Object.entries(pageSources)) {
    if (file.endsWith('/RoutePlaceholder.tsx') || file.endsWith('.test.tsx')) continue
    for (const m of source.matchAll(/<RoutePlaceholder[^>]*?\spath="([^"]+)"/g)) {
      found.add(m[1] ?? '')
    }
  }
  return [...found].sort()
}

function resolverRoutes(): string[] {
  const found = new Set<string>()
  for (const source of [
    ...Object.values(resolverSources),
    pageSources['./network-hint.ts'] ?? '',
  ]) {
    for (const m of source.matchAll(/\bto:\s*'(\/[^']*)'/g)) found.add(m[1] ?? '')
  }
  return [...found].sort()
}

describe('Search offers no dead ends @HY-14', () => {
  it('withholds exactly the routes whose page is still a placeholder', () => {
    expect([...UNFINISHED_ROUTES].sort()).toEqual(placeholderRoutes())
  })

  it('has a resolver destination only on finished pages, or withholds it', () => {
    const routes = resolverRoutes()
    expect(routes.length).toBeGreaterThan(8)
    expect(routes).toContain('/mn/$protx')
    const offeredNow = routes.filter(isFinishedRoute)
    expect(offeredNow).toEqual(
      expect.arrayContaining([
        '/address/$address',
        '/block/$id',
        '/blocks',
        '/governance/$hash',
        '/mn/$protx',
        '/tx/$txid',
      ]),
    )
    for (const route of offeredNow) expect(placeholderRoutes()).not.toContain(route)
  })

  it('withholds the kinds whose page is not built yet', () => {
    for (const to of ['/name/$label', '/platform-address/$addr', '/about']) {
      expect(offered({ href: { to } as never })).toBe(false)
    }
  })

  it('keeps the masternode, block, transaction, address and proposal pages', () => {
    for (const to of [
      '/mn/$protx',
      '/block/$id',
      '/tx/$txid',
      '/address/$address',
      '/governance/$hash',
    ]) {
      expect(offered({ href: { to } as never })).toBe(true)
    }
  })

  it('lists only finished pages in the palette', () => {
    const titles = matchPages('').map((p) => p.path)
    for (const path of titles) expect(isFinishedRoute(path)).toBe(true)
    expect(titles).not.toContain('/about')
    expect(matchPages('about').map((p) => p.path)).not.toContain('/about')
  })
})
