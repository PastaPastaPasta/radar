import { describe, expect, it } from 'vitest'
import type { Rollup } from 'vite'
import { AFTER_PAINT_CHUNK, COMMON_CHUNK, ENTRY_CHUNK, planGroups, routeArea } from './chunk-groups'

const R = '/app/src/routes/'
const chunk = (
  fileName: string,
  moduleIds: string[],
  opts: { imports?: string[]; entry?: boolean; facade?: string } = {},
): Rollup.OutputChunk =>
  ({
    type: 'chunk',
    fileName,
    moduleIds,
    imports: opts.imports ?? [],
    isEntry: opts.entry === true,
    isDynamicEntry: opts.facade !== undefined && opts.entry !== true,
    facadeModuleId: opts.entry ? '/app/index.html' : (opts.facade ?? null),
  }) as unknown as Rollup.OutputChunk

const sources: Record<string, string> = {
  [`${R}tx.tsx`]: "import { TxPage } from '@/features/core'",
  [`${R}block.tsx`]: "import { BlockPage } from '@/features/core'",
  [`${R}v24.tsx`]:
    "import { V24Page } from '@/features/network'\nloader: routePrefetch('net-a', 'v24Prefetch')",
  [`${R}identities.tsx`]: "import { X } from '@/features/platform'",
  [`${R}settings.tsx`]: "import { SettingsRoute } from '@/app/settings-route'",
}
const read = (file: string) => sources[file] ?? ''
const page = (name: string) => `${R}${name}.tsx?tsr-split=component`

describe('routeArea', () => {
  it('names the feature folder a route file imports, home with Core and anything else with You', () => {
    expect(routeArea("import { X } from '@/features/network/v24/V24Page'")).toBe('network')
    expect(routeArea("import { HomePage } from '@/features/home'")).toBe('core')
    expect(routeArea("import { SearchPage } from '@/features/search'")).toBe('you')
    expect(routeArea("import { SourcesRoute } from '@/app/sources-route'")).toBe('you')
  })
})

describe('planGroups', () => {
  const chunks = [
    chunk('index.js', ['/app/src/main.tsx', '/app/src/shell.tsx'], {
      entry: true,
      imports: ['react.js'],
    }),
    chunk('react.js', ['/app/node_modules/react/index.js']),
    chunk('tx.js', [page('tx')], {
      facade: page('tx'),
      imports: ['core-shared.js', 'everyone.js'],
    }),
    chunk('block.js', [page('block')], {
      facade: page('block'),
      imports: ['core-shared.js', 'everyone.js'],
    }),
    chunk('v24.js', [page('v24')], { facade: page('v24'), imports: ['everyone.js', 'net-a.js'] }),
    chunk('net-a.js', ['/app/src/data/query/prefetch/net-a.ts'], {
      facade: '/app/src/data/query/prefetch/net-a.ts',
      imports: ['net-queries.js'],
    }),
    chunk('net-queries.js', ['/app/src/data/radar/queries.ts']),
    chunk('identities.js', [page('identities')], {
      facade: page('identities'),
      imports: ['sdk-ui.js', 'everyone.js'],
    }),
    chunk('settings.js', [page('settings')], {
      facade: page('settings'),
      imports: ['everyone.js'],
    }),
    chunk('sdk-ui.js', ['/app/src/ui/sdk-thing.ts'], { imports: ['sdk.js'] }),
    chunk('sdk.js', ['/app/node_modules/@dashevo/evo-sdk/dist/sdk.js']),
    chunk('core-shared.js', ['/app/src/features/core/tx/IoTables.tsx']),
    chunk('everyone.js', ['/app/src/ui/data-table.tsx']),
    chunk('pool.js', ['/app/src/data/dapi-core/pool.ts'], {
      facade: '/app/src/data/dapi-core/pool.ts',
      imports: ['pool-only.js', 'tip-shared.js'],
    }),
    chunk('tip.js', ['/app/src/features/entity/HeaderTip.tsx'], {
      facade: '/app/src/features/entity/HeaderTip.tsx',
      imports: ['tip-shared.js', 'core-shared.js'],
    }),
    chunk('pool-only.js', ['/app/src/data/dapi-core/seed-pick.ts']),
    chunk('tip-shared.js', ['/app/src/data/dapi-core/grpc.ts']),
  ]
  const groups = planGroups(chunks, read)

  it("keeps the entry's own modules in the entry", () => {
    expect(groups.get('/app/src/main.tsx')).toBe(ENTRY_CHUNK)
    expect(groups.get('/app/node_modules/react/index.js')).toBe(ENTRY_CHUNK)
  })

  it('leaves code one page alone needs with that page', () => {
    expect(groups.get(page('tx'))).toBeUndefined()
    expect(groups.get(page('settings'))).toBeUndefined()
  })

  it('puts code that pages of different areas share in common', () => {
    expect(groups.get('/app/src/ui/data-table.tsx')).toBe(COMMON_CHUNK)
  })

  it("counts a loader's prefetch package in the area of the routes that use it", () => {
    expect(groups.get('/app/src/data/radar/queries.ts')).toBe('network')
    expect(groups.get('/app/src/data/query/prefetch/net-a.ts')).toBe('network')
  })

  it('puts what the after-paint modules alone need with them, and what they share with a page in common', () => {
    expect(groups.get('/app/src/data/dapi-core/pool.ts')).toBe(AFTER_PAINT_CHUNK)
    expect(groups.get('/app/src/data/dapi-core/seed-pick.ts')).toBe(AFTER_PAINT_CHUNK)
    expect(groups.get('/app/src/data/dapi-core/grpc.ts')).toBe(AFTER_PAINT_CHUNK)
    expect(groups.get('/app/src/features/core/tx/IoTables.tsx')).toBe(COMMON_CHUNK)
  })

  it('leaves whatever reaches the Platform SDK to Rollup', () => {
    expect(groups.get('/app/src/ui/sdk-thing.ts')).toBeUndefined()
    expect(groups.get('/app/node_modules/@dashevo/evo-sdk/dist/sdk.js')).toBeUndefined()
  })

  it("groups code two pages of one area share in the area's chunk", () => {
    const more = [
      ...chunks.filter((c) => c.fileName !== 'tip.js'),
      chunk('tip.js', ['/app/src/features/entity/HeaderTip.tsx'], {
        facade: '/app/src/features/entity/HeaderTip.tsx',
        imports: ['tip-shared.js'],
      }),
    ]
    expect(planGroups(more, read).get('/app/src/features/core/tx/IoTables.tsx')).toBe('core')
  })
})
