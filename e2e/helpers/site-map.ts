import { readFileSync } from 'node:fs'

export type SiteSource = 'local' | 'radar' | 'dapi' | 'sdk' | 'pe' | 'hyphen' | 'insight' | 'rate'

interface SiteEntry {
  pattern: RegExp
  sources: SiteSource[]
}

const SITE_MAP = readFileSync(
  new URL('../../apps/web/src/features/entity/site-map.ts', import.meta.url),
  'utf8',
)

/** The addresses of a site-map page: its path with each `$param` standing for one segment, and any query. */
export const pagePattern = (path: string): RegExp =>
  new RegExp(`^${path.replace(/\$[a-zA-Z]+/g, '[^/?]+')}(\\?.*)?$`)

/** The path of every page of the site map, read from the file so a spec cannot drift from it. */
export const SITE_PATHS: string[] = [...SITE_MAP.matchAll(/^\s+path: '([^']+)',$/gm)].map(
  (m) => m[1]!,
)

/** Every page of the site map with the sources it says it reads. */
const ENTRIES: SiteEntry[] = [
  ...SITE_MAP.matchAll(/path: '([^']+)'[\s\S]*?sources: \[([^\]]*)\]/g),
].map((m) => ({
  pattern: pagePattern(m[1]!),
  sources: [...m[2]!.matchAll(/'(\w+)'/g)].map((s) => s[1] as SiteSource),
}))

/** The sources the site map lists for the page at `path`; empty when the path is not a page of it. */
export function sourcesOf(path: string): SiteSource[] {
  return ENTRIES.find((e) => e.pattern.test(path))?.sources ?? []
}

/**
 * Pages that fetch nothing to show: they document, keep settings in this browser, wait for input (a contract ID, a
 * query), decode what was typed in the address bar, or say there is nothing under the address.
 */
const UNFETCHED =
  /^\/(about|api|saved|sdk-reference|settings|sources|tools\/(contract|document|identity|nope|path|proof|transition))\b|^\/search(\?q=(6da2|7dc0|dash1|tdash1)|$)|^\/group\/[^/]+\/0$|^\/mn\/0+$|^\/identity\/[^/?]+\?tab=advanced$/

/** True for a page that fetches nothing to show, so there is no source to name and none that can be down. */
export const fetchesNothing = (path: string): boolean => UNFETCHED.test(path)
