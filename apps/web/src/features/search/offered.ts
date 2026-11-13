import type { SearchHit } from './types'

/**
 * Routes whose page is still the placeholder. Search never offers one: a suggestion that opens a page
 * with nothing on it is a dead end. When a page is finished, remove its route here; a test compares
 * this list with the pages that still render `RoutePlaceholder`, so the two cannot drift apart.
 */
export const UNFINISHED_ROUTES: ReadonlySet<string> = new Set([
  '/about',
  '/api',
  '/changes',
  '/contest/$label',
  '/contests',
  '/contract/$id',
  '/contract/$id/documents/$type',
  '/contracts',
  '/credits',
  '/document/$contract/$type/$id',
  '/epoch/$n',
  '/epochs',
  '/group/$contract/$pos',
  '/groups/$contract',
  '/identities',
  '/identity/$id',
  '/identity/lookup',
  '/map',
  '/masternodes',
  '/name/$label',
  '/names',
  '/nodes',
  '/platform',
  '/platform-address/$addr',
  '/platform/block/$id',
  '/platform/blocks',
  '/platform/tx/$hash',
  '/platform/txs',
  '/polls',
  '/protocol',
  '/query',
  '/quorums',
  '/saved',
  '/sdk-reference',
  '/shielded',
  '/token/$id',
  '/token/$id/holders',
  '/tokens',
  '/tools/$decoder',
  '/tools/transition',
  '/v24',
  '/votes',
])

export function isFinishedRoute(path: string): boolean {
  return !UNFINISHED_ROUTES.has(path)
}

/** The hit's destination as a route id pattern. */
export function offered(hit: Pick<SearchHit, 'href'>): boolean {
  const to = (hit.href as { to?: unknown }).to
  return typeof to !== 'string' || isFinishedRoute(to)
}
