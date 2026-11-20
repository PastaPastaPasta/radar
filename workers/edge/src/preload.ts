/** The table the web build writes (`apps/web/build/route-preload.ts`). */
export interface RoutePreload {
  files: string[]
  routes: [pattern: string, files: number[]][]
  locales: Record<string, number[]>
}

export const ROUTE_PRELOAD_PATH = '/route-preload.json'

interface CompiledRoute {
  re: RegExp
  params: number
  literal: number
  files: number[]
}

interface Compiled {
  table: RoutePreload
  routes: CompiledRoute[]
}

const trimSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p)

function compile(table: RoutePreload): Compiled {
  const routes = table.routes.map(([pattern, files]) => {
    const segments = trimSlash(pattern).split('/').slice(1)
    const source = segments
      .map((s) =>
        s === '$' ? '.*' : s.startsWith('$') ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      )
      .join('/')
    return {
      re: new RegExp(`^/${source}$`),
      params: segments.filter((s) => s.startsWith('$')).length,
      literal: segments.filter((s) => !s.startsWith('$')).join('').length,
      files,
    }
  })
  // A literal route wins over a parameter in the same place (`/identity/lookup` over `/identity/$id`).
  routes.sort((a, b) => a.params - b.params || b.literal - a.literal)
  return { table, routes }
}

let loading: Promise<Compiled | null> | undefined

/** The table, read once per isolate; null when the build has none. */
export function preloadTable(assets: Fetcher, origin: string): Promise<Compiled | null> {
  loading ??= assets
    .fetch(new Request(new URL(ROUTE_PRELOAD_PATH, origin)))
    .then(async (res) => (res.ok ? compile(await res.json<RoutePreload>()) : null))
    .catch(() => null)
    .then((compiled) => {
      if (!compiled) loading = undefined
      return compiled
    })
  return loading
}

export function resetPreloadTableForTests(): void {
  loading = undefined
}

/** The visitor's locale among those with a catalog, the way the app picks it before anything is remembered. */
export function localeFor(acceptLanguage: string | null, locales: readonly string[]): string {
  const wanted = (acceptLanguage ?? '')
    .split(',')
    .map((part) => part.split(';')[0]!.trim().toLowerCase())
    .filter(Boolean)
  for (const tag of wanted) {
    const exact = locales.find((l) => l.toLowerCase() === tag)
    if (exact) return exact
    const base = tag.split('-')[0]
    const prefix = locales.find((l) => l.toLowerCase().split('-')[0] === base)
    if (prefix) return prefix
  }
  return locales.includes('en') ? 'en' : (locales[0] ?? 'en')
}

/**
 * A file to preload and what it is for: the visitor's catalog, which every page needs and the service worker keeps
 * for offline visits, or one route's chunks, which it leaves out of the shell (`apps/web/src/sw/sw-core.ts`).
 */
export interface Preload {
  file: string
  kind: 'locale' | 'route'
}

/** Every file the page at `url` loads before its first data arrives, beyond the entry itself. */
export function preloadFiles(
  compiled: Compiled,
  url: URL,
  acceptLanguage: string | null,
): Preload[] {
  const { table, routes } = compiled
  const path = trimSlash(url.pathname)
  const route = routes.find((r) => r.re.test(path))
  const locale = localeFor(acceptLanguage, Object.keys(table.locales))
  const catalog = new Set(table.locales[locale] ?? [])
  const ix = new Set([...catalog, ...(route?.files ?? [])])
  return [...ix].flatMap((i) => {
    const file = table.files[i]
    return file ? [{ file, kind: catalog.has(i) ? ('locale' as const) : ('route' as const) }] : []
  })
}

const linkTag = ({ file, kind }: Preload) =>
  file.endsWith('.css')
    ? `<link rel="preload" as="style" crossorigin data-${kind} href="/${file}">`
    : `<link rel="modulepreload" crossorigin data-${kind} href="/${file}">`

/**
 * Adds the preload links to the page's head; the browser fetches them beside the entry instead of after it. The page
 * then names the catalog of the visitor's language, so it varies by `Accept-Language`.
 */
export function withPreloads(res: Response, files: readonly Preload[]): Response {
  if (files.length === 0) return res
  const out = new Response(res.body, res)
  out.headers.delete('etag')
  out.headers.delete('last-modified')
  out.headers.append('vary', 'accept-language')
  const tags = files.map(linkTag).join('')
  return new HTMLRewriter()
    .on('head', { element: (el) => void el.append(tags, { html: true }) })
    .transform(out)
}
