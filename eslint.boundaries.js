const SRC = './apps/web/src'
const at = (...parts) => [SRC, ...parts].filter(Boolean).join('/')

const FEATURES = ['home', 'core', 'network', 'platform', 'tools', 'you', 'search', 'entity']
const SHARED_FEATURES = ['entity', 'search']

const HTTP_SOURCES = ['radar', 'pe', 'hyphen', 'insight', 'rate']

const zone = (target, from, except) => ({
  target: at(target),
  from: at(from),
  ...(except && { except }),
  message: `${target || 'src'} may not import from ${from || 'src'} (docs/ARCHITECTURE.md §1.2)`,
})

const featureZones = FEATURES.flatMap((feature) => {
  const target = `features/${feature}`
  const clientFiles = [
    ...HTTP_SOURCES.map((source) => at('data', source, 'client.ts')),
    at('data/http.ts'),
    at('data/hyphen/stream.ts'),
    at('data/sdk/worker'),
    ...['nodes', 'transport', 'client', 'streams', 'cache'].map((f) =>
      at('data/dapi-core', `${f}.ts`),
    ),
    at('data/dapi-core/gen'),
  ]
  return [
    ...['app', 'routes', 'shell'].map((from) => zone(target, from)),
    ...clientFiles.map((from) => ({
      target: at(target),
      from,
      message: 'Features read data through queries.ts factories and the core and sdk clients',
    })),
    ...FEATURES.filter((other) => other !== feature).map((other) =>
      zone(
        target,
        `features/${other}`,
        SHARED_FEATURES.includes(other) ? ['./index.ts'] : undefined,
      ),
    ),
  ]
})

const zones = [
  zone('lib', '', ['./lib']),
  zone('data', '', ['./lib', './data']),
  zone('data/sdk/worker', '', ['./lib', './data/sdk/methods.ts', './data/sdk/worker']),
  zone('ui', '', ['./lib', './i18n', './ui', './data/envelope.ts', './data/health.ts']),
  zone('routes', '', [
    './lib',
    './app',
    './i18n',
    './router.tsx',
    './routeTree.gen.ts',
    './routes',
    './ui/index.ts',
    './shell/index.ts',
    './data/envelope.ts',
    './data/errors.ts',
    './data/health.ts',
    './data/query',
    './data/masternodes/filter.ts',
    './data/dapi-core/budget.ts',
    ...['core', 'sdk', ...HTTP_SOURCES].map((s) => `./data/${s}/queries.ts`),
    ...FEATURES.map((f) => `./features/${f}/index.ts`),
  ]),
  zone('shell', '', [
    './lib',
    './ui',
    './i18n',
    './app',
    './shell',
    './features/search/index.ts',
    './data/envelope.ts',
    './data/health.ts',
  ]),
  ...featureZones,
]

const reactMessage = 'lib and data are framework-free (docs/ARCHITECTURE.md §1.2)'
const reactPatterns = [
  { group: ['react', 'react/*', 'react-dom', 'react-dom/*'], message: reactMessage },
  { group: ['@radix-ui/*', 'cmdk', 'motion', 'motion/*', '@lingui/react'], message: reactMessage },
  {
    group: ['@tanstack/react-table', '@tanstack/react-virtual', '@tanstack/react-router'],
    message: reactMessage,
  },
]
const queryHookPattern = {
  group: ['@tanstack/react-query'],
  importNamePattern: '^use',
  message: reactMessage,
}

const sourceClientPatterns = [
  {
    group: ['@dashevo/evo-sdk', '@connectrpc/*', '@bufbuild/*', 'comlink', 'idb', 'idb-keyval'],
    message:
      'Features, routes, shell and ui never call the SDK or DAPI directly; use data/*/queries.ts',
  },
]

const lazyPaths = [
  {
    name: 'react',
    importNames: ['lazy'],
    message: 'Use deferred() from ui/deferred.tsx: React.lazy can loop forever under act()',
  },
]

const queryKeyMessage =
  'Build query keys with the factories in data/query/keys.ts (docs/ARCHITECTURE.md §5.1)'
const queryKeySelectors = [
  'ArrayExpression',
  'TSAsExpression > ArrayExpression',
  'TSSatisfiesExpression > ArrayExpression',
  'TSTypeAssertion > ArrayExpression',
].map((shape) => ({
  selector: `Property[key.name='queryKey'] > ${shape}, Property[key.value='queryKey'] > ${shape}`,
  message: queryKeyMessage,
}))
const provedMessage =
  'Only data/sdk sets `proved`, and only from a verified *WithProof response (docs/ARCHITECTURE.md §2.1)'
const provedSelectors = [
  ...['Literal', 'TSAsExpression > Literal', 'TSSatisfiesExpression > Literal'].map((shape) => ({
    selector: `Property[key.name='proved'] > ${shape}[value=true], Property[key.value='proved'] > ${shape}[value=true]`,
    message: provedMessage,
  })),
  { selector: "Property[key.name='proved'][shorthand=true]", message: provedMessage },
]
const guardedSelectors = [...queryKeySelectors, ...provedSelectors]
const globalFetchProperties = ['window', 'globalThis', 'self'].map((object) => ({
  object,
  property: 'fetch',
  message: 'Fetch through a data/*/queries.ts factory (docs/ARCHITECTURE.md §1.2)',
}))
const sdkWriteSelector = {
  selector:
    "MemberExpression[property.name=/^(broadcast\\w*|create|publish|transfer|masternodeVote|topUp|withdraw|purchase|mint|burn|freeze|unfreeze|destroyFrozenFunds|emergencyAction|claim|setPrice)$/]:not([object.name='Comlink'])",
  message: 'data/sdk is read-only: no state-transition facade writes (docs/ARCHITECTURE.md §3.1)',
}

const testFiles = ['**/*.test.{ts,tsx}', `${SRC.slice(2)}/test/**`]
const web = `${SRC.slice(2)}/**/*.{ts,tsx}`

export function boundaryConfigs({ importX, createTypeScriptImportResolver }) {
  const rel = SRC.slice(2)
  return [
    {
      files: [web],
      plugins: { 'import-x': importX },
      settings: {
        'import-x/resolver-next': [
          createTypeScriptImportResolver({ project: './apps/web/tsconfig.json' }),
        ],
      },
      rules: {
        'import-x/no-restricted-paths': ['error', { basePath: import.meta.dirname, zones }],
        'no-restricted-syntax': ['error', ...guardedSelectors],
      },
    },
    {
      files: [`${rel}/{lib,data}/**/*.{ts,tsx}`],
      rules: {
        'no-restricted-imports': ['error', { patterns: [...reactPatterns, queryHookPattern] }],
      },
    },
    {
      files: [
        `${rel}/data/health.ts`,
        `${rel}/data/core/seen-pending.ts`,
        `${rel}/data/hyphen/fit.ts`,
        `${rel}/data/index-health.ts`,
        `${rel}/data/query/batch.ts`,
      ],
      rules: { 'no-restricted-imports': 'off' },
    },
    {
      files: [`${rel}/{ui,features,routes,shell}/**/*.{ts,tsx}`],
      ignores: testFiles,
      rules: {
        'no-restricted-imports': ['error', { patterns: sourceClientPatterns, paths: lazyPaths }],
      },
    },
    {
      files: [`${rel}/app/**/*.{ts,tsx}`, `${rel}/*.{ts,tsx}`],
      ignores: testFiles,
      rules: { 'no-restricted-imports': ['error', { paths: lazyPaths }] },
    },
    {
      files: [web],
      ignores: [`${rel}/data/**`, ...testFiles],
      rules: {
        'no-restricted-globals': [
          'error',
          { name: 'fetch', message: 'Fetch through a data/*/queries.ts factory' },
        ],
        'no-restricted-properties': ['error', ...globalFetchProperties],
      },
    },
    {
      files: [`${rel}/**/queries.ts`],
      rules: { 'no-restricted-syntax': ['error', ...provedSelectors] },
    },
    {
      files: [`${rel}/ui/kit/**/*.{ts,tsx}`],
      rules: { 'no-restricted-syntax': ['error', ...queryKeySelectors] },
    },
    {
      files: [`${rel}/data/sdk/**/*.{ts,tsx}`],
      ignores: testFiles,
      rules: { 'no-restricted-syntax': ['error', ...queryKeySelectors, sdkWriteSelector] },
    },
    {
      files: [`${rel}/data/sdk/**/queries.ts`],
      rules: { 'no-restricted-syntax': ['error', sdkWriteSelector] },
    },
    {
      files: testFiles,
      rules: { 'no-restricted-syntax': 'off', 'no-restricted-properties': 'off' },
    },
  ]
}
