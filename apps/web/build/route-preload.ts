import { readFileSync } from 'node:fs'
import type { Plugin, Rollup } from 'vite'

type OutputBundle = Rollup.OutputBundle
type OutputChunk = Rollup.OutputChunk

/** Where the edge reads the preload table (`workers/edge/src/preload.ts`). */
export const ROUTE_PRELOAD_FILE = 'route-preload.json'

/**
 * What the edge tells the browser to fetch beside the entry. Indices point into `files`.
 * - `routes`: each route's pattern (`/tx/$txid`) and the static graph of its page chunk and its loader's prefetch module;
 * - `locales`: each locale's message catalog;
 * - `sdk`: the listed files that hold Platform SDK code, by their chunks' modules, for the bundle budget's check that
 *   Core routes never reach it (`scripts/size.mjs`).
 * The DAPI pool and the live tip, which every page loads after its first paint, are left out: on a phone their bytes
 * would compete with the page's own code and data.
 */
export interface RoutePreload {
  files: string[]
  routes: [pattern: string, files: number[]][]
  locales: Record<string, number[]>
  sdk: number[]
}

const SDK_MODULE = '/node_modules/@dashevo/'
const CATALOG = /\/src\/i18n\/locales\/([a-z-]+)\/index\.ts$/
const ROUTE_PAGE = /\/src\/routes\/(.+)\.tsx\?tsr-split=component$/
const ROUTE_PREFETCH_PACKAGE = /routePrefetch\(\s*'([a-z-]+)'/
const ROUTE_PREFETCH_IMPORT = "import('@/data/query/route-prefetch')"

/** `tx.$txid` → `/tx/$txid`, `governance.index` → `/governance/`, `[_][_]kit` → `/__kit`, `insight.$` → `/insight/$`. */
export function routePattern(file: string): string {
  const parts = file.split('.').map((p) => p.replace(/\[(.)\]/g, '$1'))
  if (parts.at(-1) === 'index') {
    parts.pop()
    return `/${parts.join('/')}${parts.length ? '/' : ''}`
  }
  return `/${parts.join('/')}`
}

const stripQuery = (id: string) => id.split('?')[0]!

export function buildRoutePreload(
  bundle: OutputBundle,
  readSource: (id: string) => string = (id) => readFileSync(stripQuery(id), 'utf8'),
): RoutePreload {
  const chunks = Object.values(bundle).filter((o): o is OutputChunk => o.type === 'chunk')
  const entry = chunks.find((c) => c.isEntry && c.fileName !== 'sw.js')
  if (!entry) throw new Error('route-preload: no entry chunk')

  const byFile = new Map(chunks.map((c) => [c.fileName, c]))
  const closure = (file: string, into: Set<string>) => {
    const chunk = byFile.get(file)
    if (into.has(file) || !chunk) return
    into.add(file)
    for (const css of chunk.viteMetadata?.importedCss ?? []) into.add(css)
    for (const dep of chunk.imports) closure(dep, into)
  }
  const loaded = new Set<string>()
  closure(entry.fileName, loaded)

  const files: string[] = []
  const index = new Map<string, number>()
  const graph = (roots: Iterable<string>): number[] => {
    const all = new Set<string>()
    for (const r of roots) closure(r, all)
    return [...all]
      .filter((f) => !loaded.has(f))
      .sort()
      .map((f) => {
        let i = index.get(f)
        if (i === undefined) {
          i = files.push(f) - 1
          index.set(f, i)
        }
        return i
      })
  }
  const chunkOf = (suffix: string): string => {
    const hit = chunks.find((c) =>
      c.moduleIds.some((id) => stripQuery(id).endsWith(`/${suffix}`)),
    )?.fileName
    if (!hit) throw new Error(`route-preload: no chunk holds ${suffix}`)
    return hit
  }
  const facadeMatching = (re: RegExp) =>
    chunks.flatMap((c) => {
      const m = c.facadeModuleId ? re.exec(c.facadeModuleId) : null
      return m ? [[m[1]!, c] as const] : []
    })

  const prefetchModule = (pkg: string) => chunkOf(`src/data/query/prefetch/${pkg}.ts`)
  const routes: RoutePreload['routes'] = facadeMatching(ROUTE_PAGE)
    .map(([file, chunk]): [string, number[]] => {
      const source = readSource(chunk.facadeModuleId!.replace(/\?.*$/, ''))
      const roots = [chunk.fileName]
      const pkg = ROUTE_PREFETCH_PACKAGE.exec(source)?.[1]
      if (pkg) roots.push(prefetchModule(pkg))
      if (source.includes(ROUTE_PREFETCH_IMPORT))
        roots.push(chunkOf('src/data/query/route-prefetch.ts'))
      return [routePattern(file), graph(roots)]
    })
    .sort(([a], [b]) => a.localeCompare(b))

  const locales = Object.fromEntries(
    facadeMatching(CATALOG).map(([code, c]) => [code, graph([c.fileName])] as const),
  )
  const sdk = files.flatMap((f, i) =>
    byFile.get(f)?.moduleIds.some((id) => id.includes(SDK_MODULE)) ? [i] : [],
  )
  return { files, routes, locales, sdk }
}

/** Emits `route-preload.json` beside `index.html`. Worker bundles have no HTML entry and are skipped. */
export function routePreload(): Plugin {
  return {
    name: 'radar:route-preload',
    apply: 'build',
    // After Vite's own post hooks, which drop CSS-only chunks and rewrite the imports that named them.
    enforce: 'post',
    generateBundle(_options, bundle) {
      if (
        !Object.values(bundle).some(
          (o) => o.type === 'chunk' && o.isEntry && o.facadeModuleId?.endsWith('index.html'),
        )
      )
        return
      this.emitFile({
        type: 'asset',
        fileName: ROUTE_PRELOAD_FILE,
        source: JSON.stringify(buildRoutePreload(bundle)),
      })
    },
  }
}
