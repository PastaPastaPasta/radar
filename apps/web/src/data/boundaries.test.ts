import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ESLint, type Linter } from 'eslint'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import importX from 'eslint-plugin-import-x'
import tseslint from 'typescript-eslint'
import { beforeAll, describe, expect, it } from 'vitest'

const rootDir = resolve(import.meta.dirname, '../../../..')

type BoundaryConfigs = (deps: {
  importX: unknown
  createTypeScriptImportResolver: unknown
}) => Linter.Config[]

let eslint: ESLint

beforeAll(async () => {
  const boundaries = (await import(
    /* @vite-ignore */ pathToFileURL(resolve(rootDir, 'eslint.boundaries.js')).href
  )) as {
    boundaryConfigs: BoundaryConfigs
  }
  eslint = new ESLint({
    cwd: rootDir,
    overrideConfigFile: true,
    overrideConfig: [
      { files: ['**/*.{ts,tsx}'], languageOptions: { parser: tseslint.parser } },
      ...boundaries.boundaryConfigs({ importX, createTypeScriptImportResolver }),
    ],
  })
})

async function lint(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: `${rootDir}/apps/web/src/${file}` })
  return (result?.messages ?? []).map((m) => `${m.ruleId ?? 'parse'}: ${m.message}`)
}

const expectRule = async (file: string, code: string, rule: RegExp) => {
  const messages = await lint(file, code)
  expect(
    messages.some((m) => rule.test(m)),
    messages.join('\n') || 'no messages',
  ).toBe(true)
}

const expectClean = async (file: string, code: string) => {
  expect(await lint(file, code)).toEqual([])
}

describe('proved literals (docs/ARCHITECTURE.md §2.1)', () => {
  const stamp =
    "const s = { source: 'pe', asOf: 1, fetchedAt: 1, proved: true }\nexport default s\n"

  it.each([
    'features/core/join.ts',
    'routes/x.tsx',
    'shell/x.tsx',
    'ui/x.tsx',
    'data/pe/client.ts',
    'lib/x.ts',
  ])('is rejected in %s', async (file) => {
    await expectRule(file, stamp, /Only data\/sdk sets `proved`/)
  })

  it('is rejected through as const, satisfies and a quoted key', async () => {
    for (const body of [
      'const s = { proved: true as const }',
      'const s = { proved: true satisfies boolean }',
      "const s = { 'proved': true }",
    ]) {
      await expectRule(
        'features/core/join.ts',
        `${body}\nexport default s\n`,
        /Only data\/sdk sets/,
      )
    }
  })

  it('is rejected as a shorthand property', async () => {
    for (const body of [
      'const proved = true\nconst s = { source: "pe", proved }',
      'const proved = flag()\nconst s = { proved }',
    ]) {
      await expectRule(
        'features/core/join.ts',
        `${body}\nexport default s\ndeclare function flag(): boolean\n`,
        /Only data\/sdk sets/,
      )
    }
    await expectClean(
      'data/sdk/index.ts',
      'const proved = true\nexport const s = { source: "sdk", proved }\n',
    )
  })

  it('is rejected in a queries.ts', async () => {
    await expectRule('data/pe/queries.ts', stamp, /Only data\/sdk sets/)
  })

  it('is allowed in data/sdk, the kit and tests', async () => {
    await expectClean('data/sdk/index.ts', stamp)
    await expectClean('ui/kit/samples.ts', stamp)
    await expectClean('features/core/join.test.ts', stamp)
    await expectClean('test/helpers.ts', stamp)
  })

  it('does not flag proved: false or a computed value', async () => {
    await expectClean(
      'features/core/join.ts',
      'export const a = { proved: false }\nexport const b = (x: boolean) => ({ proved: x })\n',
    )
  })
})

describe('global fetch (docs/ARCHITECTURE.md §1.2)', () => {
  it.each(['window.fetch', 'globalThis.fetch', 'self.fetch', "window['fetch']"])(
    '%s is rejected outside data',
    async (call) => {
      for (const file of [
        'features/core/x.ts',
        'ui/x.tsx',
        'routes/x.tsx',
        'shell/x.tsx',
        'app/x.ts',
        'lib/x.ts',
      ]) {
        await expectRule(file, `export const f = () => ${call}('/x')\n`, /no-restricted-properties/)
      }
    },
  )

  it('the bare global is rejected in every folder outside data, like the properties', async () => {
    for (const file of [
      'features/core/x.ts',
      'ui/x.tsx',
      'routes/x.tsx',
      'shell/x.tsx',
      'app/x.ts',
      'lib/x.ts',
    ]) {
      await expectRule(file, "export const f = () => fetch('/x')\n", /no-restricted-globals/)
    }
  })

  it('data clients and tests may call it', async () => {
    await expectClean('data/http.ts', "export const f = () => globalThis.fetch('/x')\n")
    await expectClean('data/pe/client.ts', "export const f = () => fetch('/x')\n")
    await expectClean('features/core/x.test.ts', "export const f = () => fetch('/x')\n")
    await expectClean('features/core/x.test.ts', "export const f = () => window.fetch('/x')\n")
  })
})

describe('query keys (docs/ARCHITECTURE.md §5.1)', () => {
  it.each([
    "queryKey: ['mainnet', 'pe', 'x']",
    "queryKey: ['mainnet', 'pe', 'x'] as const",
    "queryKey: ['mainnet', 'pe', 'x'] satisfies readonly string[]",
    "queryKey: <const>['mainnet', 'pe', 'x']",
  ])('%s is rejected in a feature', async (key) => {
    await expectRule(
      'features/core/x.ts',
      `export const q = { ${key}, queryFn: () => 1 }\n`,
      /Build query keys with the factories/,
    )
  })

  it('also in the kit, where only proved is exempt', async () => {
    await expectRule(
      'ui/kit/x.ts',
      "export const q = { queryKey: ['a'] as const }\n",
      /Build query keys with the factories/,
    )
  })

  it('a key from a factory is fine', async () => {
    await expectClean(
      'features/core/x.ts',
      "import { peKeys } from '@/data/query/keys'\nexport const q = { queryKey: peKeys('mainnet', 'x') }\n",
    )
  })
})

describe('the raw Hyphen stream', () => {
  it('is not exported from the hyphen index', async () => {
    const index = await import('./hyphen')
    expect(Object.keys(index)).not.toEqual(expect.arrayContaining(['openHyphenStream']))
    expect('readNdjson' in index).toBe(false)
    expect('openHyphenStream' in index).toBe(false)
  })

  it('cannot be reached from a feature through the client or stream files', async () => {
    for (const path of ['@/data/hyphen/client', '@/data/hyphen/stream']) {
      await expectRule(
        'features/core/x.ts',
        `import * as h from '${path}'\nexport default h\n`,
        /import-x\/no-restricted-paths/,
      )
    }
  })
})
