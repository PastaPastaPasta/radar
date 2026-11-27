import { readFileSync } from 'node:fs'
import type { Plugin, ResolvedConfig, Rollup } from 'vite'

type OutputChunk = Rollup.OutputChunk
type ManualChunks = (id: string, meta: Rollup.ManualChunkMeta) => string | undefined

const SDK_MODULE = '/node_modules/@dashevo/'
const ROUTE_PAGE = /\/src\/routes\/[^/?]+\.tsx\?tsr-split=component$/
const PREFETCH_PACKAGE = /\/src\/data\/query\/prefetch\/([a-z-]+)\.ts$/
const ROUTE_PREFETCH = '/src/data/query/route-prefetch.ts'
const ROUTE_PREFETCH_PACKAGE = /routePrefetch\(\s*'([a-z-]+)'/
const ROUTE_PREFETCH_IMPORT = "import('@/data/query/route-prefetch')"
const FEATURE_IMPORT = /from '@\/features\/([a-z-]+)['/]/
const ANALYSIS_PASS = 'RADAR_CHUNK_ANALYSIS'

export const ENTRY_CHUNK = 'index'
export const COMMON_CHUNK = 'common'
export const AFTER_PAINT_CHUNK = 'after-paint'
/**
 * What every page loads on its own right after its first paint: the DAPI pool, its cache and seed list, the header's tip,
 * the fiat rate, the You boot, the command palette and its word list. One chunk instead of a request each.
 */
const AFTER_PAINT =
  /\/src\/(?:(?:data\/dapi-core\/(?:pool|cache)|features\/entity\/HeaderTip|app\/fiat-rate|features\/you\/boot|features\/search\/(?:CommandPalette|bip39-words))\.tsx?|data\/dapi-core\/seed\.(?:mainnet|testnet)\.json)$/
const APP_AREA = 'app'
/** Feature folders whose pages share another area's chunk; a page from no feature folder (settings, sources) is You's. */
const AREA_OF_FEATURE: Record<string, string> = { home: 'core', search: 'you' }

const stripQuery = (id: string) => id.split('?')[0]!

const prefetchPackage = (c: OutputChunk): boolean => {
  const id = c.facadeModuleId
  return id !== null && (PREFETCH_PACKAGE.test(id) || id.endsWith(ROUTE_PREFETCH))
}

/** The area a route's page serves: the feature folder its route file imports (`src/features/<area>`). */
export function routeArea(source: string): string {
  const feature = FEATURE_IMPORT.exec(source)?.[1] ?? 'you'
  return AREA_OF_FEATURE[feature] ?? feature
}

/**
 * The areas a lazily loaded module serves: a route's page its own, a loader prefetch package those of the routes that
 * use it, and anything else (the DAPI pool, the live tip, hover cards, the palette) the app's.
 */
export function lazyAreas(
  facades: readonly string[],
  readSource: (file: string) => string,
): Map<string, Set<string>> {
  const byPackage = new Map<string, Set<string>>()
  const out = new Map<string, Set<string>>()
  const addTo = (map: Map<string, Set<string>>, key: string, area: string) => {
    let set = map.get(key)
    if (!set) map.set(key, (set = new Set()))
    set.add(area)
  }
  for (const id of facades.filter((f) => ROUTE_PAGE.test(f))) {
    const source = readSource(stripQuery(id))
    const area = routeArea(source)
    addTo(out, id, area)
    const pkg = ROUTE_PREFETCH_PACKAGE.exec(source)?.[1]
    if (pkg) addTo(byPackage, pkg, area)
    if (source.includes(ROUTE_PREFETCH_IMPORT)) addTo(byPackage, 'route-prefetch', area)
  }
  for (const id of facades) {
    if (out.has(id)) continue
    const pkg =
      PREFETCH_PACKAGE.exec(id)?.[1] ?? (id.endsWith(ROUTE_PREFETCH) ? 'route-prefetch' : undefined)
    out.set(id, (pkg ? byPackage.get(pkg) : undefined) ?? new Set([APP_AREA]))
  }
  return out
}

/**
 * Where each module goes, from the chunks Rollup makes on its own: Rollup gives every set of pages that shares code a
 * chunk of its own, and a page loaded ~40 files before its first read, each a request against the zone's rate limit.
 * The entry's modules stay in the entry. A module that two or more lazily loaded chunks need goes in the chunk of their
 * area (Core, network, Platform, tools, You, or the app's after-paint modules) when they share one, else in one common
 * chunk; the app's own counts only when no page needs the module. What only the after-paint modules need goes in one
 * chunk with them. Chunks that hold or reach the Platform SDK are left alone, so a Core page never loads it.
 */
export function planGroups(
  chunks: readonly OutputChunk[],
  readSource: (file: string) => string,
): Map<string, string> {
  const entry = chunks.find((c) => c.isEntry && c.facadeModuleId?.endsWith('index.html'))
  if (!entry) throw new Error('chunk-groups: no entry chunk')
  const byFile = new Map(chunks.map((c) => [c.fileName, c]))
  const closure = (root: string) => {
    const into = new Set<string>()
    const stack = [root]
    while (stack.length) {
      const file = stack.pop()!
      if (into.has(file) || !byFile.has(file)) continue
      into.add(file)
      stack.push(...byFile.get(file)!.imports)
    }
    return into
  }

  const initial = closure(entry.fileName)
  const sdk = new Set(
    chunks
      .filter((c) =>
        [...closure(c.fileName)].some((f) =>
          byFile.get(f)!.moduleIds.some((id) => id.includes(SDK_MODULE)),
        ),
      )
      .map((c) => c.fileName),
  )
  const lazy = chunks.filter((c) => c.isDynamicEntry && c.facadeModuleId)
  const areasOf = lazyAreas(
    lazy.map((c) => c.facadeModuleId!),
    readSource,
  )

  const areas = new Map<string, Set<string>>()
  const users = new Map<string, number>()
  const onlyAfterPaint = new Map<string, boolean>()
  const afterPaintUser = new Set<string>()
  for (const c of lazy) {
    const afterPaint = AFTER_PAINT.test(c.facadeModuleId!)
    for (const file of closure(c.fileName)) {
      if (initial.has(file)) continue
      let set = areas.get(file)
      if (!set) areas.set(file, (set = new Set()))
      for (const a of areasOf.get(c.facadeModuleId!)!) set.add(a)
      users.set(file, (users.get(file) ?? 0) + 1)
      onlyAfterPaint.set(file, afterPaint && onlyAfterPaint.get(file) !== false)
      if (afterPaint) afterPaintUser.add(file)
    }
  }

  const groups = new Map<string, string>()
  for (const file of initial)
    for (const id of byFile.get(file)!.moduleIds) groups.set(id, ENTRY_CHUNK)
  for (const [file, set] of areas) {
    if (sdk.has(file)) continue
    if (onlyAfterPaint.get(file)) {
      for (const id of byFile.get(file)!.moduleIds) groups.set(id, AFTER_PAINT_CHUNK)
      continue
    }
    // A loader's prefetch package is a file of its own for one dynamic import; it rides in its routes' area chunk.
    if ((users.get(file) ?? 0) < 2 && !prefetchPackage(byFile.get(file)!)) continue
    if (set.size > 1) set.delete(APP_AREA)
    const only = set.size === 1 ? [...set][0]! : undefined
    // Every page loads the after-paint modules: what they share with a page's area is everyone's, and what they share
    // only with other app modules (the proof inspector, hover cards) goes with them.
    const group = !afterPaintUser.has(file)
      ? (only ?? COMMON_CHUNK)
      : only === APP_AREA
        ? AFTER_PAINT_CHUNK
        : COMMON_CHUNK
    for (const id of byFile.get(file)!.moduleIds) groups.set(id, group)
  }
  return groups
}

/**
 * Builds the app once without grouping (in memory, unminified) to learn the chunks Rollup makes on its own and which
 * modules each lazily loaded chunk really uses after tree-shaking, then groups them in the real build. The module graph
 * alone can't say: the entry reaches most of the app through barrel files whose unused exports Rollup drops.
 */
export function chunkGroups(
  readSource: (file: string) => string = (file) => readFileSync(file, 'utf8'),
): { plugin: Plugin; manualChunks: ManualChunks } {
  const analysing = process.env[ANALYSIS_PASS] === '1'
  let config: ResolvedConfig | undefined
  let groups: Map<string, string> | undefined
  const plugin: Plugin = {
    name: 'radar:chunk-groups',
    apply: 'build',
    configResolved(resolved) {
      config = resolved
    },
    async buildStart() {
      if (analysing || !config) return
      process.env[ANALYSIS_PASS] = '1'
      try {
        const { build } = await import('vite')
        const result = await build({
          configFile: config.configFile,
          root: config.root,
          mode: config.mode,
          logLevel: 'silent',
          build: { write: false, minify: false, reportCompressedSize: false },
        })
        const chunks = (Array.isArray(result) ? result : [result])
          .flatMap((r) => ('output' in r ? r.output : []))
          .filter((o): o is OutputChunk => o.type === 'chunk')
        groups = planGroups(chunks, readSource)
      } finally {
        delete process.env[ANALYSIS_PASS]
      }
    },
  }
  return { plugin, manualChunks: (id) => (analysing ? undefined : groups?.get(id)) }
}
