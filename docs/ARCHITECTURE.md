# Radar architecture

This record fixes the contracts that parallel work would otherwise drift on: module boundaries, the source clients and their provenance envelope, the DAPI budget, query and URL conventions, the UI kit's component API, search, i18n, testing, and how work is split. Where it says "must", CI or review enforces it. Where a spike may change something, §12 gives the primary design and the fallback, and the interface stays the same either way.

Product and story context: `README.md`, `docs/RADAR-DESIGN.md` (looks), `review/stories.yaml` (story IDs such as `RA-20`, `IN-05`, `X-01`).

Code style follows the scaffold: TypeScript strict, Prettier (no semicolons, single quotes), ES modules, `@/` → `apps/web/src`.

---

## 1. Modules and layout

### 1.1 Folder layout (`apps/web/src`)

```
main.tsx, app.tsx, router.tsx        bootstrap, providers, router factory (exists)
app/
  query-client.ts                    QueryClient factory, defaults, persister (§5)
  search.ts                          parseSearch/stringifySearch, network middleware (§6); re-exports lib/search-schemas.ts
  route-loader.ts                    routePrefetch: the loader every route uses to start its package's prefetch (§6.3)
  global-mounts.tsx, sw-register.ts  deferred proof inspector, diagnostics and update mounts (§7.9); service worker registration (§9.4)
  network-context.tsx                useNetwork(), NetworkGate (unknown devnet, unsupported source)
  error-boundary.tsx
routes/                              TanStack file routes: search schema, loader prefetch, page component import. No markup beyond <XPage/>
shell/                               dashhq shell bar and footer, NetworkSwitch, theme (dh_theme), phone nav, testnet keyline, palette mount, bar-overlay.ts (second stylesheet for the bar's shadow root, §11.4), RateNote
features/
  home/                              `/`: Hero, CoreSection, PlatformSection, freshness.ts (§4.8, §3.10)
  core/                              blocks, block, tx, address, mempool, rich-list, charts, governance, status
  network/                           nodes, masternodes, mn, map, epochs, epoch, protocol, v24, changes
  platform/                          platform home, identity, contract, document, token, names, contests, groups, credits, shielded, …
  tools/                             query (SQL), decoders, transition, verify-message, qr, sdk-reference, api, sources
  you/                               saved, settings, about, the You drawer (proof/, diagnostics/, update/), boot.ts (§7.9)
  search/                            classify.ts, resolvers/, useSearch, CommandPalette (loaded by CommandPalette.lazy.tsx), /search page
  entity/                            <Entity> (chip + link + hover card), hover-card registry, cross-layer links (X-02), site-map.ts,
                                     PageFrame, PageGroupTabs, saved and viewed stores, platform/ (IdentityRef, TransitionTable, PlatformBlockTable)
  <feature>/<page>/                  XPage.tsx, queries.ts (feature hooks and joins), components/, *.test.ts(x)
data/
  envelope.ts                        Sourced<T>, SourceStamp, Fact<T> (§2.1)  ← contract file
  errors.ts                          SourceError (§2.3)
  health.ts                          health registry + useSourceHealth (§2.5)
  endpoints.ts                       per-network base URLs (§2.6)
  http.ts                            fetchSourced(): fetch + timeout + ETag + zod + health reporting
  zod.ts                             shared schema helpers (zBigint, zHex, zIsoDate, …)
  active-network.ts                  the active network (follows the route being loaded) and the rendered one (§6.2)
  query/
    keys.ts                          key helpers (§5.1)
    stale.ts                         DataClass → staleTime/gcTime/persist, staleAfterMs (§5.2)
    batch.ts                         createBatcher, useHydratedFact (§5.4)
    persister.ts, network-cache.ts   IndexedDB persister and its GC; resetNetworkCache (§5.3)
    loader.ts                        prefetchForRoute, the gates, registerSdkReadyProbe (§6.3)
    health-probes.ts, route-prefetch.ts   the prefetch items loaders import on demand (§6.3)
    prefetch/<pkg>.ts                one prefetch module per package, one function per route (§6.3, §11.5)
    source-mode.ts                   watchSourceMode: Decentralized only mode switched mid-session (§4.11)
  query-log.ts                       the last 100 source calls, for diagnostics (§7.9)
  masternodes/                       rows.ts (DAPI + Radar join), filter.ts (shared filter schema, filterMnRows, facets)
  radar/ pe/ rate/ insight/           client.ts, schemas.ts (a schemas/ directory split by owner in radar and pe, §11.5), queries.ts (queryOptions factories), *.test.ts;
                                     pe/ also blocks-query.ts, transitions-query.ts, tokens-query.ts (list pages' address and query, §3.6, §3.9)
  hyphen/                            the same, plus pages.ts (infinite lists), lookups.ts (resolvers), fit.ts (useHyphenFit) (§5.6)
  dapi-core/                         transport.ts (the seam, §4.1), rpc.ts, grpc-web.ts, discovery.ts, nodes.ts, budget.ts, pool.ts,
                                     streams.ts, cache.ts, lazy.ts + production.ts (loads the pool on first use), client.ts, gen/ (protoc output)
  core/                              Core façade the features use: DAPI-first with Hyphen fallback (§4.7), decode bindings, live tip
    types.ts                         CoreClient, decoded block/tx types  ← contract file
    decode.ts, decode.worker.ts      core-decode wasm behind Comlink (§12b)
    live.ts                          coreLive: follows the tip, ChainLock and the transaction feed (§4.6)
    mn-list.ts, mn-list-decode.ts    DAPI's masternode list: one stream read, CBOR decode, checks (§4.12)
  sdk/
    methods.ts                       SdkMethods map: method name → args/result DTO types  ← contract file
    client.ts                        main-thread SdkClient (worker or inline transport), registers the SDK-ready probe
    methods/<pkg>.ts, shared.ts      the method map's parts: args/result DTOs and data classes, one file per package (§11.5)
    queries.ts                       sdkQueries factories, sdkBatchers, platformTipQuery
    batchers.ts                      the six rule-4 batchers (§5.4)
    proof-store.ts                   LRU of full proofs for the inspector (§7.9)
    settings.ts, cache.ts            connection settings (`radar.sdk`) and clearSdkCache (§3.3)
    worker/sdk.worker.ts             Comlink endpoint
    worker/impl.ts, worker/impl/     method implementations + DTO mapping, merged from one file per package (runs in worker or inline)
    worker/decode.ts                 decodeWithWasm
    worker/wasm-split.ts             stands in for the SDK's wasm loader: fetches the wasm parts (§12c)
  trusted-worker.ts                  Trusted Types policy for `new Worker(url)`
ui/                                  design-system components (§7); index.ts is the only import path
  base.ts                            the slice of the kit the shell and first-paint code use (§1.2, §7.5)
  hash.tsx                           Hash and Copy (kept apart from EntityChip so they stay in the entry chunk)
  query-state.ts                     queryView, stampsOf, useAfterIdle (§7.8)
  proof.ts, diagnostics.ts           seams that open the proof inspector and the diagnostics drawer (§7.9)
  data-table.tsx                     DataTable, useWiderThan (§7.2)
  types.ts                           Layer, Tone, EntityKind, AmountUnit  ← contract file
lib/                                 pure, framework-free: network.ts, units.ts, format.ts, hex.ts, base58.ts, bech32.ts,
                                     core/{header,chainlock,pools,block-ref}.ts, linkouts.ts, search-schemas.ts, data-class.ts, json-store.ts, tx-types.ts, well-known.ts,
                                     source-mode.ts, epoch-length.ts, sha256-stream.ts
i18n/                                Lingui setup, locales/<locale>/{messages,<pkg>}.po, useLocale (§9.1)
sw/                                  sw.ts (emitted as /sw.js), sw-core.ts (cache rules), offline-page.ts (§9.4)
test/                                setup.ts, server.ts (exist), msw/handlers/*, fixtures loader, sdk and dapi fixture transports
```

Outside `apps/web`: `packages/core-decode` (Rust → wasm), `workers/edge` (radar-web Worker), `e2e/tests` and `e2e/routes` (Playwright specs and the route cases they iterate), `review/` (harness), `scripts/` (fixture recorders and their call lists, seed-node list, size budget). The service worker is `apps/web/src/sw/` (§9.4).

### 1.2 Dependency rules

Enforced by `import-x/no-restricted-paths` zones in `eslint.config.js` (added by WP-0, §11).

| Module | May import | Must not import |
|---|---|---|
| `lib/**` | nothing internal; small pure deps (`@noble/*`) | React, `data`, `ui`, `features` |
| `data/**` | `lib`, `data/**` | React (except `data/health.ts`, `data/index-health.ts`, `data/hyphen/fit.ts`, `data/query/batch.ts` and `data/core/seen-pending.ts`, which export hooks), `ui`, `features`, `routes` |
| `data/sdk/worker/**` | `lib`, `data/sdk/methods.ts` (and `data/sdk/methods/*.ts` through it), `@dashevo/evo-sdk`, `comlink` | anything else (no React, no DOM) |
| `ui/**` | `lib`, `i18n`, type-only `data/envelope.ts`, `data/health.ts` (`useSourceHealth`) | `features`, `routes`, other `data` |
| `features/<x>/**` | `ui`, `data`, `lib`, `i18n`, `features/entity`, `features/search` (their `index.ts` only) | other features' internals |
| `routes/**` | `features/*/index.ts`, `app/*`, `data/query/*`, `data/*/queries.ts` (for loaders), `data/masternodes/filter.ts` (the shared filter schema) | `ui` internals, clients directly |
| `shell/**` | `ui`, `lib`, `i18n`, `app`, `features/search` (palette) | `data` clients |

`eslint.boundaries.js` also rejects:
- `proved: true` literals (also behind `as const` or `satisfies`) and `{ proved }` shorthand outside `data/sdk/**`; `ui/kit/**` and tests are exempt. A variable assigned `true` and passed as `proved: flag` isn't caught; review does that;
- `fetch`, `window.fetch`, `globalThis.fetch` and `self.fetch` anywhere outside `data/**` and tests (one scope for both rules);
- `queryKey` arrays behind `as const`, `satisfies` or `<const>`, as well as plain ones (§5.1);
- imports of `data/hyphen/stream.ts` from features.

The lint rules are tested in `apps/web/src/data/boundaries.test.ts`.

**Entry-chunk rule.** Rollup puts a module in the entry chunk when anything in the entry reaches it, even through a barrel, and keeps it there once any lazy chunk uses it. So code loaded with the app (shell, `app/`, the search and entity registries) imports from `@/ui/base`, never from the `@/ui` barrel, which also re-exports the hover card, charts and art. `features/entity` and `features/search` do the same. Pages and routes keep using `@/ui`. Nothing in the entry chunk may import a feature page, a resolver's data module, the Hyphen, DAPI or SDK clients, protobuf, charts, QR or a message catalog; they load from route chunks or on first use (`await import(...)`). `pnpm size` counts the entry chunk and the vendored shell script against a 220 kB gzipped budget.

Two rules carry most of the weight:
- **Features never call `fetch`, gRPC or the SDK directly.** They use `data/*/queries.ts` factories or the `data/core` and `data/sdk` clients. That keeps every figure inside an envelope.
- **`ui` is presentational.** It gets data through props. The two exceptions are the hover-card registry (§7.4) and `SourceLine` reading source health.

---

## 2. Source clients and provenance

### 2.1 The envelope (`data/envelope.ts`, verbatim)

```ts
export type SourceId = 'sdk' | 'dapi' | 'radar' | 'pe' | 'hyphen' | 'rate' | 'local'

/** Why a value came from a fallback instead of its primary source. */
export type FallbackReason = 'dapi-budget' | 'dapi-down' | 'sdk-cold' | 'sdk-down'

export interface ProofMeta {
  /** Key into proofStore for the full bytes (NX-61). */
  id: string
  method: string
  platformHeight: number
  coreChainLockedHeight: number
  epoch: number
  timeMs: number
  protocolVersion: number
  chainId: string
  quorumType: number
  quorumHash: string // hex
  round: number
  proofBytes: number // size of the GroveDB proof
}

export interface SourceStamp {
  source: SourceId
  /** ms epoch: when the source says this was true. See §2.2 for each source. */
  asOf: number
  /** ms epoch: when the browser received it. */
  fetchedAt: number
  /** The source gave no time for this answer, so `asOf` is `fetchedAt`. Labels say "fetched", not what the source did. */
  asOfFetched?: true
  /** True only when this exact value came from a call that returned a verified proof. */
  proved: boolean
  proof?: ProofMeta // present iff proved
  /** Never changes once true (chainlocked block or tx, finalized epoch). SourceLine hides the age. */
  immutable?: boolean
  /** Node that answered: "ip:port" for dapi and sdk. */
  node?: string
  /** Chain height the answer refers to (Core for dapi/hyphen, Platform for sdk/pe). */
  height?: number
  fallback?: FallbackReason
}

export interface Sourced<T> extends SourceStamp {
  data: T
}

/** One displayed figure whose value may be upgraded by a better source (rule 4). */
export interface Fact<T> {
  value: T
  stamp: SourceStamp
}

export function stampOf<T>(s: Sourced<T>): SourceStamp // strips data
export function mapSourced<A, B>(s: Sourced<A>, f: (a: A) => B): Sourced<B>
export function local<T>(data: T): Sourced<T> // source 'local', asOf = fetchedAt = now
```

Rules:
- Every client call resolves to `Sourced<T>` or throws `SourceError`. Nothing else crosses from `data` to `features`.
- A lookup that finds nothing resolves to `Sourced<null>`. Not found is data, not an error, and it carries a stamp: a proved absence ("No identity with this ID, proof-checked") is a real answer.
- A view that joins sources keeps a stamp per part. The card's `source` prop takes `SourceStamp[]`, and `SourceLine` renders both ("Served by DAPI + Crawled by Radar").
- `proved` is never inferred. Only `data/sdk` sets it, and only from a `*WithProof`/`*WithProofInfo` response that came back without error.
- `sourceView` logs (`console.error`, development and test builds) a stamp that breaks "`proof` present iff `proved`" or that sets `proved` on a source other than `sdk`.
- A batcher (§5.4) resolves a key to `Sourced<null>` only when the source returned that key with an explicit `null`. A key missing from the run's result rejects its waiters with `SourceError('invalid-response')` and is reported to health.

### 2.2 What `asOf` means per source

| Source | `asOf` | `height` | `immutable` |
|---|---|---|---|
| `sdk` | `metadata.timeMs` (Platform block time of the answer) | `metadata.height` | finalized epochs, historic contract versions |
| `dapi` | `fetchedAt`; tip-relative facts from the header stream | block height | block or tx at or below the best ChainLock height |
| `radar` | the crawl time the answer carries, per resource (table below), else `Last-Modified`, else `fetchedAt` with `asOfFetched` set. Event times (a masternode's `last_seen` on a list row, a release's `published`, a change's `ts`, the last history bucket) stay data fields and never become the stamp by themselves | — | no |
| `pe` | `fetchedAt` (indexer lag is a health matter, §2.5) | indexed Platform height when the response has it | no |
| `hyphen` | `fetchedAt` | `asOfHeight` | no |
| `insight` | `fetchedAt`, `asOfFetched` set (a block's time is an event time); `/status` also carries its tip | the tip height of the answer | no |
| `rate` | `fetchedAt` | — | no |
| `local` | computation time | — | inputs' |

Radar sends no `Last-Modified` (checked against `radar.dashhq.org`, 2026-11-10; every response carries only `etag` and `cache-control: no-cache`), so each resource is stamped from a time inside its own document. The client still reads `Last-Modified` ahead of the fetch time in case the server adds it.

| Resource | `asOf` |
|---|---|
| `/status` | the **requested** network's `chain.updated` (`crawl.last_finished` sets the Radar crawl lag for both networks) |
| `/health` | the active network's `age_secs.crawl` (the older of both networks on a devnet), counted back from the response |
| `/{net}/summary` | `crawl.finished` |
| `/{net}/platform` | `now.updated` |
| `/{net}/activation` | `updated` |
| `/{net}/bench` | the newest `vantages[].updated` |
| `/{net}/masternodes` | the newest row `last_seen`, which is the start of the latest crawl (`crawl_id` names it, but the crawl's times are only in `/summary`) |
| `/{net}/masternodes/{protx}` | none: `fetchedAt`, `asOfFetched` set. Its `last_seen` is when the crawler last reached that node, which for an offline node can be days before the latest crawl |
| `/masternodes/{protx}/check` | `checked` |
| `/releases`, `/{net}/geo`, `/{net}/changes`, `/{net}/history`, `/masternodes/{protx}/payments`, `/masternodes/{protx}/bench` | no document time: `fetchedAt`, `asOfFetched` set. `geo` carries only `crawl_id`; `history` buckets are day or hour starts; `changes` and `payments` carry event times; a masternode benchmark's `results[].ts` is a test time on a 14-day cycle |

A stamp with `asOfFetched` reads "Fetched from Radar · 6 s ago" (§7.3), never "Crawled".

### 2.3 Errors (`data/errors.ts`)

```ts
export type SourceErrorKind =
  | 'network'          // fetch failed, CORS, TLS, DNS, refused
  | 'timeout'
  | 'http'             // non-2xx other than 404/429
  | 'rate-limited'     // HTTP 429 or gRPC RESOURCE_EXHAUSTED (8)
  | 'invalid-response' // zod or protobuf decode failure
  | 'proof-failed'     // SDK returned a proof that did not verify
  | 'unavailable'      // source not offered on this network (devnet), or health is 'down' and the call was skipped
  | 'disabled-by-mode' // a hosted source asked while Decentralized only mode is on (§4.11): refused before any I/O
  | 'aborted'

export class SourceError extends Error {
  readonly source: SourceId
  readonly kind: SourceErrorKind
  readonly status?: number      // HTTP status or gRPC code
  readonly retryAfterMs?: number
  readonly node?: string
  constructor(init: { source: SourceId; kind: SourceErrorKind; message: string; status?: number; retryAfterMs?: number; node?: string; cause?: unknown })
}
export function isSourceError(e: unknown): e is SourceError
```

- `proof-failed` is never retried and never falls back. Showing a different source's value instead would hide a failed check. The card shows `ErrorState` with "This answer's proof didn't verify" and a link to the proof inspector.
- TanStack retry policy (§5.2): retry `network`, `timeout`, `http` 5xx and `rate-limited` up to 2 times; never retry `invalid-response`, `proof-failed`, `unavailable`, `disabled-by-mode` or `aborted`.
- `disabled-by-mode` is not a failure of the source: it never reaches the health registry, and `ErrorState` renders it as the mode's `Unavailable` state (§7.2), not as an error.

### 2.4 HTTP clients (radar, pe, hyphen, insight, rate)

Each module exposes plain async functions plus `queryOptions` factories. Every one takes `net: NetworkId` first and an optional `AbortSignal` last.

```ts
// data/http.ts
export async function fetchSourced<S extends z.ZodType>(req: {
  source: Exclude<SourceId, 'sdk' | 'dapi' | 'local'>
  url: string
  schema: S
  signal?: AbortSignal
  timeoutMs?: number            // default 10_000
  notFound?: 'throw' | 'null'   // default 'throw'; detail endpoints pass 'null' so 404 → Sourced<null>
  asOf?: (body: z.output<S>, res: Response) => number | undefined // undefined → fetchedAt
  reject?: (body: z.output<S>, res: Response) => { kind: SourceErrorKind; detail?: string } | undefined
  height?: (body: z.output<S>) => number | undefined
}): Promise<Sourced<z.output<S>>>
```

`fetchSourced` adds the timeout, reports `{ok, latencyMs, kind}` to the health registry, parses with zod, and maps failures to `SourceError`. HTTP 404 resolves to `Sourced<null>` only with `notFound: 'null'`; otherwise it throws `http`. ETag revalidation is left to the browser HTTP cache (Radar sends `no-cache` with an ETag, so browsers revalidate and get 304s); no manual `If-None-Match`.

- `reject` turns a parsed body into a failure: a returned `{ kind, detail? }` is thrown as that `SourceError` and reported to health once, with the call's real latency, in place of the success report. PE's `/status` uses it for the `{ error }` body that arrives with a 503.
- `asOf` returning `undefined` means `fetchedAt`, and the stamp gets `asOfFetched: true`.

```ts
// data/radar/client.ts (shape repeated by pe, hyphen, rate)
export const radar = {
  status: (signal?: AbortSignal, net = activeNetwork) => Promise<Sourced<RadarStatus>>, // global document, read for one network
  health: (signal?) => Promise<Sourced<RadarHealth>>,
  summary: (net: NetworkId, signal?) => Promise<Sourced<RadarSummary>>,
  history: (net, q: RadarHistoryQuery, signal?) => Promise<Sourced<RadarHistory>>,
  masternodes: (net, signal?) => Promise<Sourced<RadarMasternode[]>>,
  masternode: (net, protx: string, signal?) => Promise<Sourced<RadarMasternodeDetail | null>>,
  payments: (net, protx, q: { before?: number; limit?: number }, signal?) => Promise<Sourced<RadarPayment[]>>,
  // geo, bench, mnBench, platform, activation, changes, releases …
}
// data/radar/queries.ts
export const radarQueries = {
  summary: (net: NetworkId) => queryOptions({ queryKey: k(net, 'radar', 'summary'), queryFn: ({ signal }) => radar.summary(net, signal), ...dataClass('crawl') }),
  // …
}
```

Paging shapes are normalised so features handle one type:

```ts
export interface Page<T> {
  items: T[]
  /** Page-based sources (pe): 1-based page and total when known (PE's total: -1 → undefined). */
  page?: number
  total?: number
  /** Cursor sources (hyphen): opaque next cursor; undefined at the end. */
  nextCursor?: string
}
```

- **PE**: `{resultSet, pagination: {page, limit, total}}` → `Page<T>`. `total === -1` means empty. Base URL per network (§2.6). Write endpoints except `POST /transaction/verify` are never called; the client does not define them.
- **Hyphen**: base `/x/hy/{mainnet|testnet}`, the edge Worker pass-through (§2.7; `vite dev` and `vite preview` proxy the same path). `{asOfHeight, value, nextCursor}` → `Page<T>` with `height = asOfHeight`. Cursors are hex-encoded JSON (`{"asOfHeight":H,"height":h}`). `hyphen.cursorFromHeight(asOfHeight, height)` builds one, so "jump to height" works without walking. `/stream` is opened through `hyphen.stream` and read with `readNdjson(body, signal?, onFailure?): AsyncIterable<HyStreamEvent>`. A line longer than 1 MiB (`MAX_NDJSON_LINE_CHARS`) fails as `invalid-response`; read failures and that error go to `onFailure`, which `openHyphenStream` wires to the health record of the network the stream was opened on.
- **Radar**: absolute base `https://radar.dashhq.org/api/v1`. `{net}` is `mainnet|testnet` only. The global calls (`status`, and the `rate` call) report to the health record of the requested or active network: `radar.status(signal?, net = activeNetwork)`, `radarQueries.status(net = 'mainnet')`.
- **Rate**: `rate.usd(signal)` reads PE mainnet `/rate` → `Sourced<{ usd: number; provider: string }>`, used on every network. Testnet never shows fiat.

**zod conventions** (`data/zod.ts`):
- Schemas live in `<source>/schemas.ts`, one per endpoint, named `XxxSchema`; types are `z.output<typeof XxxSchema>` exported as `Xxx`.
- Objects are non-strict (unknown keys stripped). Fields Radar reads are required; fields it doesn't read are left out.
- Amounts become `bigint` at the edge: `zBigint` accepts a JSON number only if `Number.isSafeInteger`; larger values must arrive as numeric strings. Duffs, credits and token units are `bigint` everywhere after parsing; heights, counts and times are `number`.
- Hashes become lower-case hex (`zHex64`); Hyphen and Radar already send lower case, PE sends upper case.
- Times become ms epoch numbers (`zIsoDate`, `zUnixSeconds`).
- A schema failure throws `invalid-response`, marks the source `degraded`, and logs the zod issue path with `console.error` in every build (so the issue is visible in reviewers' consoles).
- `data/zod.ts` runs `z.config({ jitless: true })`: the CSP forbids `eval`, which zod's JIT compiler would use.

### 2.5 Source-health registry (`data/health.ts`)

One registry per network per source. Every client reports each call; probes add freshness.

```ts
export type HealthState = 'unknown' | 'ok' | 'slow' | 'stale' | 'degraded' | 'down'

export interface SourceHealth {
  source: SourceId
  net: NetworkId
  state: HealthState
  lastOkAt?: number
  lastError?: { kind: SourceErrorKind; message: string; at: number }
  p50LatencyMs?: number
  /** Freshness lag, when the source reports one. */
  lag?: { blocks?: number; ms?: number; detail: string } // detail: "indexed to block 1,577,999 (18 days behind)"
  /** dapi only */
  budget?: BudgetSnapshot
}

export const healthRegistry: {
  report(net: NetworkId, source: SourceId, r: { ok: boolean; latencyMs?: number; kind?: SourceErrorKind }): void // omit latencyMs when the report is not one round trip
  setLag(net: NetworkId, source: SourceId, lag: SourceHealth['lag']): void
  get(net: NetworkId, source: SourceId): SourceHealth
  subscribe(cb: () => void): () => void
}
export function useSourceHealth(source: SourceId): SourceHealth // current network; useSyncExternalStore
export function useAllSourceHealth(): SourceHealth[]
```

State rules, applied in this order (first match wins):

| State | Condition |
|---|---|
| `down` | 3 consecutive failures of kind `network`/`timeout`/`http`, or a last call that failed with one of those kinds while there has been no success in the last 120 s (a source that has never answered counts as silent). Recovers on the next success |
| `stale` | Lag over the source's threshold (below) |
| `degraded` | ≥ 25 % failures over the last 20 calls, any `invalid-response` in the last 5 min, or (dapi) budget pressure `tight`/`exhausted` |
| `slow` | p50 latency over the last 10 calls > 3 s (dapi, sdk: > 5 s) |
| `ok` | at least one success, none of the above |
| `unknown` | no calls yet |

A report without `latencyMs` (a stream that broke after being open for a while) leaves the latency window alone; a batch that omits keys reports the batch call's own latency.

The registry schedules a timer for the next time boundary (the end of the 5 min `invalid-response` memory, the end of the 120 s silence window) and notifies subscribers when it fires. It snapshots `now` once per notification, so `get` returns the same object until a notification.

Freshness probes are TanStack queries under `[net, 'health', source]`, refetched every 60 s while visible. They run only when a mounted card uses that source, or on `/status`:

| Source | Probe | Stale when |
|---|---|---|
| radar | `GET /api/v1/status` | network's last crawl > 45 min (Radar's own rule) |
| pe | `GET /status` | indexer height behind Tenderdash height by > 10 blocks, or the PE status reports itself unhealthy (503) |
| hyphen | `GET /status` | min `indices.*.indexedHeight` behind the DAPI best height by more than 6 blocks, fresh again at 2 or fewer (one rule for the health state and for page routing, §4.7a), or, when DAPI has no height (or only a `fallback` one), behind Radar's crawled Core height (`chain.blocks` from Radar's `/status`) (testnet today: weeks). See §4.7a and §11.4 |
| insight | `GET /insight-api/status` (mainnet `insight.dash.org`, testnet `insight.testnet.networks.dash.org`; none on devnets) | tip behind the DAPI best height by more than 6 blocks, fresh again at 2 or fewer (the same rule as Hyphen's, §4.7a) |
| dapi | header stream / `getBestBlockHeight` | no new header for 20 min |
| sdk | metadata of any recent answer | `timeMs` older than 15 min |

The UI reads health in three places only:
- `SourceLine`: dot colour and the "isn't answering (last good 4 min ago)" text.
- `Card` with a `source` prop: greys its body and overlays the down message when that source is `down`; when it is `stale`, it keeps the content and its source line keeps the stamp. A stale index is announced once per page (§4.7a), never per card.
- `/status` (IN-09) and the shell's status chip: `useAllSourceHealth()`.

### 2.6 Networks and endpoints

`lib/network.ts` (contract file):

```ts
export type NetworkId = 'mainnet' | 'testnet' | `devnet-${string}`
export interface DevnetConfig { name: string; dapiAddresses: string[]; quorumUrl?: string }
export function parseNetworkParam(network?: string, legacyNet?: string): { net: NetworkId; redirect: boolean }
export function networkSearch(net: NetworkId): { network?: string } // mainnet → {}
export const isDevnet = (n: NetworkId): n is `devnet-${string}`
```

`data/endpoints.ts`:

| | mainnet | testnet | devnet |
|---|---|---|---|
| quorums (node list, SDK trust) | `https://quorums.mainnet.networks.dash.org` | `https://quorums.testnet.networks.dash.org` | the configured `quorumUrl`, else `https://quorums.<name>.networks.dash.org` |
| DAPI default port | 443 | 1443 | from config |
| radar | `https://radar.dashhq.org/api/v1/mainnet` | `…/testnet` | none |
| pe | `https://api.pe.dashhq.org` | `https://api.testnet.pe.dashhq.org` | none |
| hyphen | `/x/hy/mainnet` | `/x/hy/testnet` | none |
| rate | PE mainnet `/rate` | none | none |

For a devnet, `endpoint(net, 'quorums', devnets?)` takes the `quorumUrl` of the entry in `devnets` with that name when it has one. `endpoint(net, source)` returns `null` where a cell says none; the client then throws `unavailable` without a request, and cards render `Empty kind="unsupported-network"`.

### 2.7 Edge Worker (`workers/edge`)

**Hyphen pass-through (`/x/hy/{mainnet|testnet}/*`).**
- Only `GET` and `HEAD`. Paths must match the API surface the app uses (`blocks`, `block/{id}`, `block/{id}/txs`, `rawblock/{id}`, `tx/{id}`, `rawtx/{id}`, `address/{a}`, `address/{a}/txs|utxos`, `balances`, `status`, `network`, `mempool`, `mempool/txs`, `metrics/latest|chart`, `proposals`, `proposal/{h}`, `proposal/{h}/votes`, `validators`, `validator/{h}`, `search`, `stream`); anything else is 404 `unknown_path`. Encoded slashes, backslashes and dot segments are 400 `bad_path`.
- Query parameters are limited to `limit, cursor, blocks, points, q, status, type`. Others are dropped, the first value of each is kept, and the keys are sorted, so each request shape is one cache entry. A query over 1024 characters or a value over 512 is 400 `bad_query` (an address-history `cursor` is 358 characters, since it names the address and the last transaction). Add a name to `HYPHEN_PARAMS` in `workers/edge/src/hyphen-path.ts` when the client starts sending a new one; the client's `HyListQuery` type is built from that list, so an unlisted name doesn't type-check.
- The response `content-type` is never copied. JSON (`application/json` or `+json`) is relayed as its bare media type; `/stream` also accepts `application/x-ndjson`. Any other type on a success status is 502 `{error:'bad_upstream_type'}`; an error status with a non-JSON body keeps its status with `{error:'upstream_error'}`.
- Every proxy response carries `content-security-policy: default-src 'none'; sandbox` and `cross-origin-resource-policy: same-origin`. The Worker's global CSP is applied only to responses that have none.
- `vite dev` and `vite preview` use the same `resolveHyphenRequest` (from `workers/edge/src/hyphen-path.ts`), so they refuse what production refuses. They don't check the upstream content type.

**Link previews and Decentralized only links (§4.11).** For a link-preview crawler the Worker reads the entity from Radar, Hyphen or Platform Explorer to fill `<title>` and the OG tags. A request with `?sources=decentralized` gets the generic text for its kind and no backend read, whoever asks; `og:url` and the canonical link keep `sources` (and `network`), so the preview points at the same mode. People always get the generic text.

**Content-Security-Policy (`workers/edge/src/headers.ts`).** `worker-src 'self'`: every worker loads from the origin, so there is no `blob:` grant. `img-src` keeps `blob:` (and `data:`, `https:`) for the address QR. `require-trusted-types-for 'script'` is sent report-only: ECharts' HTML tooltip writes `innerHTML`, and enforcing needs `tooltip.renderMode: 'richText'` or a policy.

**Redirects (`workers/edge/src/redirects.ts`).** The old dashhq pages map to Radar's URLs with their filters translated; a URL already in the new form is a fixed point, never redirected again.
- `/masternodes[.html]`: the old `sort` and `dir=desc` become `sort=-field`; `type`, `status` and `reach` are lower-cased and the old `?status=Reachable` form maps to `reach`; `host`, `version`, `dkg` and `page` are dropped.
- `/map[.html]`: same filters; `layer=nodes` is kept, `layer=mn` (the default) dropped; `sort` dropped.
- `/changes[.html]`: `kind` is kept when it is `joins`, `pose`, `address` or `keys`, else dropped.
- `/tools/fees` (a dead link on the hub) goes to `/mempool`.
- `apps/web/build/redirect-targets.test.ts` checks that every sample lands on a registered route and that the fixed points stay put. The `/map` and `/changes` search schemas have to accept `layer=nodes` and `kind=joins|pose|address|keys`, because the router drops unknown params.
- The SPA's own `/insight/*` redirect keeps `blockDate` as `date`.

**Link previews (OG tags).** HTML for `/block/*`, `/tx/*`, `/mn/*`, `/identity/*`, `/contract/*` and `/token/*` gets per-entity tags from a backend read only for link-preview and crawler user agents (bots, crawlers, spiders, Slack, WhatsApp, Facebook and similar; see `isLinkPreviewAgent` in `workers/edge/src/og.ts`). Everyone else gets the page at once with the generic per-kind tags (`Block · Radar`). The response carries `vary: user-agent`.

---

## 3. The SDK worker (`data/sdk`)

### 3.1 Shape

```
main thread                                          sdk.worker (module worker, Comlink)
SdkClient.call('identities.fetch', {id}) ──────────► impl['identities.fetch'](sdk, args)
   ▲  Sourced<IdentityDto | null>                       └─ sdk.identities.fetchWithProof(id)
   │                                                        → { data, metadata, proof } (wasm objects)
   └── proofStore.put(full proof)  ◄── WireResult ─────  → DTO mapping (plain, structured-clonable)
                                       (proof bytes transferred)
```

- **Method map.** `data/sdk/methods.ts` declares every method Radar uses as `SdkMethods[name] = { args: A; result: R }`, where `R` is a DTO: plain objects, `bigint`, `Map`, `Uint8Array`, strings. No wasm class ever crosses the boundary. A DTO is what the page renders, such as `IdentityDto { id; balance: bigint; revision: number; keys: IdentityKeyDto[] }`.
- **Proof first.** `impl.ts` calls the `*WithProof`/`*WithProofInfo` variant whenever one exists, with no settings toggle (unlike the native explorer). Methods without a variant (`system.status`, `system.currentQuorumsInfo`, `tokens.calculateId`, `dpns.resolveName`, `stateTransitions.decode`, `stateTransitions.waitForStateTransitionResult`) set `proved: false`. `dpns.isNameAvailable` has no proof variant and answers `true` for a name in an open contest, so Radar does not call it (§3.11).
- **Walks are not proofs.** A figure assembled from several proved calls (proposer counts over a range, vote tallies) gets `proved: false`. Its `SourceLine` says "Combined from N proof-checked answers" through `ProofMeta`-less stamps with `source: 'sdk'`. The per-call proofs stay in the proof store.
- **Trusted context.** The worker always builds `EvoSDK({ network, trusted: true, … })`. Devnets use `devnetName` or `quorumUrl` plus `addresses` from the devnet config.
- **Writes are absent.** `methods.ts` has no write method, and an ESLint `no-restricted-properties` rule bans `.broadcast*`, `.create`, `.publish`, `.transfer`, `.masternodeVote` and the other facade writes under `data/sdk/**` (D3).

### 3.2 Comlink API (verbatim)

```ts
// data/sdk/methods.ts
export interface SdkMethods {
  'identities.fetch': { args: { id: string }; result: IdentityDto | null }
  'identities.balances': { args: { ids: string[] }; result: Map<string, bigint | null> }
  'contracts.getMany': { args: { ids: string[] }; result: Map<string, ContractDto | null> }
  'system.status': { args: Record<string, never>; result: PlatformStatusDto }
  'system.totalCredits': { args: Record<string, never>; result: bigint | null }
  'epoch.current': { args: Record<string, never>; result: EpochDto }
  // … one entry per facade method in PLAN §3.2; implementers add entries, never rename them
}
export type SdkMethodName = keyof SdkMethods

export interface SdkNetworkConfig {
  net: NetworkId
  network: 'mainnet' | 'testnet' | 'devnet'
  devnetName?: string
  quorumUrl?: string
  addresses?: string[]
}

export interface WireResult<R> {
  ok: true
  data: R
  proved: boolean
  meta?: { height: number; coreChainLockedHeight: number; epoch: number; timeMs: number; protocolVersion: number; chainId: string }
  proof?: { grovedbProof: Uint8Array; quorumHash: Uint8Array; signature: Uint8Array; round: number; blockIdHash: Uint8Array; quorumType: number }
  node?: string
  tookMs: number
}
export interface WireError { ok: false; error: { kind: SourceErrorKind; message: string; code?: string } }

export interface SdkWorkerApi {
  /** Idempotent. Resolves when the SDK for that network is connected and its trusted context is prefetched. Never throws across Comlink. */
  connect(cfg: SdkNetworkConfig): Promise<{ sdkVersion: string; protocolVersion: number; tookMs: number } | WireError>
  call<M extends SdkMethodName>(net: NetworkId, method: M, args: SdkMethods[M]['args']): Promise<WireResult<SdkMethods[M]['result']> | WireError>
  /** Local wasm decoders for tools (NX-71, PE-13, PE-34): no network. */
  decode(kind: 'stateTransition' | 'dataContract' | 'document' | 'identity', bytes: Uint8Array): Promise<WireResult<unknown> | WireError>
}
```

- **The worker never throws across Comlink.** Comlink keeps only an Error's message. Every failure is returned as a `WireError`, which `SdkClient` rethrows as `SourceError({ source: 'sdk', … })`. The classification starts from the native explorer's `sdk/errors.ts` (`verification` → `proof-failed`, `not-found` → `Sourced<null>`, transport → `network`/`timeout`, `ResourceExhausted` → `rate-limited`).
- **Proof bytes are transferred**, not copied: `Comlink.transfer(result, [proof.grovedbProof.buffer])`.
- The worker keeps one connected `EvoSDK` per network in a `Map`, with at most 2 alive (least recently used one freed). Switching network never reconnects an instance; it uses another key.
- At most 6 calls in flight inside the worker, the rest queued FIFO. A wasm call can't be aborted, so an aborted query's late result is dropped on the main thread.

### 3.3 Main-thread client

```ts
// data/sdk/client.ts
export interface SdkClient {
  warm(net: NetworkId): void // start loading and connecting; never awaited by UI
  state(net: NetworkId): 'cold' | 'loading' | 'ready' | 'failed'
  call<M extends SdkMethodName>(net: NetworkId, method: M, args: SdkMethods[M]['args'], signal?: AbortSignal): Promise<Sourced<SdkMethods[M]['result']>>
  decode: SdkWorkerApi['decode']
  subscribe(cb: () => void): () => void // state changes
}
export const sdk: SdkClient
export const sdkQueries: { [M in SdkMethodName]: (net: NetworkId, args: SdkMethods[M]['args']) => QueryOptions } // generated from the map
```

- **Lazy loading.** `data/sdk/client.ts` imports `transport-worker.ts` on the first `warm` or `call`; that file creates `sdk.worker.ts` as a module worker through `trustedWorkerUrl` (`data/trusted-worker.ts`: a same-origin Trusted Types policy, because a plain `new Worker(url)` is a violation under `require-trusted-types-for 'script'`). The SDK package and its wasm are imported only inside the worker, so they never enter the main bundle; the wasm is fetched in parts when the worker first connects (§12c). `scripts/check-bundle.mjs` fails the build if `@dashevo/evo-sdk` appears in a main-thread chunk.
- **Warm-up.** The SDK loads on its first call or `sdk.warm(net)` (the search palette warms it when it opens, `searchEnv.warmSdk`), and pages hold their SDK reads until the first idle moment after first paint (`useAfterIdle`, §7.8), so loading the SDK never competes with the first paint.
- **Cold-start fallback (rule 4 applied to time).** Where PE indexes the same figure (Platform height, epoch, identity balance in lists), the card shows the PE value with `fallback: 'sdk-cold'` (`'sdk-down'` once the SDK has failed) until the SDK answer lands; the SDK value then replaces it. The home page does this in `features/home/platform-tip.ts` over `platformTipQuery(net)` (`data/sdk/queries.ts`, one proof-checked `getEpochsInfo` whose proof height is the Platform height). Facts PE doesn't index show `Skeleton` with "Loading the Platform SDK (once per visit)".
- **Stamps.** `proved` is true exactly when the answer carries a proof (a `*WithProof` call); only `data/sdk` sets it. `asOf` is `metadata.timeMs`; an answer with no metadata has `asOfFetched: true` and `asOf = fetchedAt`. An SDK `InvalidArgument` maps to the `invalid-response` kind.
- **Ready probe.** `data/sdk/client.ts` registers `registerSdkReadyProbe((net) => sdk.state(net) === 'ready')` with `data/query/loader.ts` when it loads, which is what lets a loader prefetch an `sdk` item (§6.3); until the SDK module has loaded nothing counts as ready.
- **Proof store.** `proofStore.put(record)` keeps the last 300 full proofs (method, args, meta, bytes) in memory for the proof inspector and evidence export (NX-61). The envelope carries only `ProofMeta` with the record's `id`.
- **Network switch.** The network is part of every query key (§5.1), so a switch reads a different cache; the next SDK call connects the new network. Nothing is torn down.
- **Testing.** `SdkClient` has two transports, `WorkerTransport` and `InlineTransport` (same `impl.ts`, in-thread), plus `FixtureSdkTransport` (`test/msw/sdk-transport.ts`, §10). `VITE_SDK_TRANSPORT=worker|inline` picks between the first two; worker is the default. `setSdkTransport` swaps the transport: jsdom has no `Worker`, so `test/setup.ts` installs the fixture transport for every unit test, and fixture builds install it at startup (their output has no SDK worker or wasm). `setSdkDevnets(loadDevnets)` in `main.tsx` tells the client where saved devnets are.

- **Connection settings** (`data/sdk/settings.ts`, `localStorage` `radar.sdk`): `{ quorumUrls: { mainnet?, testnet? }, requestTimeoutMs?, retries?, banFailedAddress?, logLevel? }`. An absent field keeps the SDK's default. `parseSdkSettings` checks each field on its own (an `https` quorum URL with no credentials or query, a timeout of 100 to 300,000 ms, 0 to 20 retries, a log level from `off` to `trace`), so a hand-edited store never breaks a connection. `connectionSettings()` maps them onto `SdkNetworkConfig.settings` and always sends a log level (default `warn`), because the wasm keeps the last one it was given; `quorumUrlOverride(net)` replaces the quorum service of mainnet and testnet only (a devnet carries its own).
- **Restart.** A change to the stored settings calls `sdk.restart()`: it drops the transport (the worker is recreated and `connect` runs again with the new config), forgets the per-network state and fails the calls in flight as `aborted`, so a Settings change applies without a reload. `callDeadlineMs(t)` (the larger of 20 s and `2t + 4 s`) keeps the client's own deadline behind the SDK's request timeout. `sdk.info(net)` reports the connected versions for Settings → Developer. `clearSdkCache` (`data/sdk/cache.ts`) removes every SDK query from memory and the persisted store and clears `proofStore`; `proofStore` records keep the answering `node`.

### 3.4 SDK methods by area

The shared methods are listed in §11.5 (E). The others, each in `data/sdk/methods/<area>.ts` with its data class and implemented in `data/sdk/worker/impl/<area>.ts` with the `*WithProof` call unless noted:

| Area | Methods |
|---|---|
| `p-chain` | `system.prefundedSpecializedBalance` (an absent balance comes back `null` and unproved, because the SDK throws rather than proving it), `shielded.poolState`, `shielded.anchors`, `shielded.mostRecentAnchor`, `shielded.encryptedNotes` (`startIndex` must be a multiple of 2048), `shielded.nullifiers`; all `live`, bytes as lower-case hex |
| `p-blocks` | `stateTransitions.decode({ data })` (base64 bytes through the wasm `StateTransition.fromBytes` and the per-type class; the body is plain JSON with bigints as strings; Platform Explorer returns the bytes but not the body) and `stateTransitions.waitForStateTransitionResult({ hash })` (`success`, `error` or `pending`): SDK 5.0.3 has only the waiting call, which waits about 30 s for an unknown hash, so the worker races it against `RESULT_WAIT_MS` (6 s) and answers `pending`. Neither is proved |
| `p-id` | `identities.getKeys`, `identities.nonce`, `identities.contractNonce`, `identities.contractKeys`, `identities.balanceAndRevision` (also the existence check: it answers a proved `null` for an absent identity), `identities.byNonUniquePublicKeyHash` (paged by `startAfter`), `group.identityGroups`, `voting.contestedResourceIdentityVotes` |
| `p-data` | `contracts.getHistory` (`limit` 1..10, `startAtMs` inclusive, oldest first), `documents.history` (no offset: paged by `startAtMs`, 10 a read), `group.infos`, `group.info`, `group.members` (by power, descending), `group.actions` (`status` `active` or `closed`, `startAfter` the last action id), `group.actionSigners` |
| `p-token` | `tokens.directPurchasePrices` (`{ basePrice, currentPrice }` or `null` when not for sale), `tokens.perpetualDistributionLastClaim` (asked only when the contract states a perpetual distribution: the node errors otherwise), `dpns.resolveName` (unproved) |
| `p-vote` | `group.contestedResources` (the values of the next index property after `prefix`; for DPNS, `['dash']` lists every contest Platform still holds, open and decided), `voting.contestedResourceVoteState` (tallies, abstain and lock counts, winner; a contest that does not exist answers no contenders and no winner), `voting.contestedResourceVotersForIdentity` |
| `tools` | `documents.count`, `documents.sum`, `documents.average` (only where the contract has a countable or summable index), `contracts.serialized` (the bytes a document decoder needs), `system.pathElements` (GroveDB elements by path and keys) |

Every method needs a row in `METHOD_PAGES` (`features/tools/sdk-reference/method-pages.ts`), which `/sdk-reference` renders next to the site map; `reference.test.ts` fails without it.

### 3.5 Platform pages: epochs, protocol, quorums, credits, shielded

- `/epochs` reads `epoch.current`, the proposers of the current epoch (`epoch.evonodesProposedBlocksByRange`, up to `MAX_PROPOSER_PAGES` (8) pages of 100, combined and stamped `proved: false`, "Combined from N proof-checked answers") and a range table (`RangeTable.tsx`) that splits a from/to range into 100-epoch requests (`EPOCH_REQUEST_CAP`, `epochChunks`). Rewards, the schedule and history are Radar's (`radarQueries.platform`, `RadarZone.tsx`).
- `/epoch/$n` routes by the current epoch: a past epoch reads `epoch.finalizedInfos` plus `epoch.epochsInfo` (count 2, for its end); the current one shows the live clock; a future one says it has not started. Its prefetch lists `epoch.current` only.
- `/protocol` pages `protocol.versionUpgradeVoteStatus` (100 a call, the start key inclusive), tallies the answers in the browser (`tallyOf`) and states the threshold as 67 % of the evonodes that vote (`ACTIVATION_SHARE`); Radar's crawl adds the exact threshold, phase and per-candidate counts.
- `/quorums` reads `system.currentQuorumsInfo`, which has no proof: the page says "Not proof-checked" beside its stamp, and each row's Verified badge speaks only for the quorum's signature.
- `/credits` reads `system.totalCredits` and looks up `system.prefundedSpecializedBalance`; the fiat estimate needs the rate.
- `/shielded` reads the pool state, anchors and nullifier lookup from the SDK and pages encrypted notes in 2048-note chunks (`NOTES_CHUNK`), showing the first 10 of a chunk; the shield and unshield history is Platform Explorer's (`peQueries.shieldHistory`, `unshieldHistory`).
- Decentralized only mode: each section backed by Radar or Platform Explorer passes `enabled: false` and renders one `Unavailable`; the SDK sections stay.

### 3.6 Platform pages: blocks and state transitions

- `/platform/blocks`, `/platform/block/$id`, `/platform/txs` and `/platform/tx/$hash` read Platform Explorer (`peQueries.blocks`, `block`, `transactions`, `transaction`); a devnet gets `Empty kind="unsupported-network"`. The query builders are `data/pe/blocks-query.ts` and `data/pe/transitions-query.ts`, shared by the prefetch module, the pages and the tests.
- The two lists share `useListControls` (URL state and a remembered page size, which applies unless the URL carries a `limit` other than 25) and `usePagedList` (pages or scroll mode; a deep page catches up through at most `MAX_CATCH_UP_PAGES`, 20, requests).
- Platform Explorer facts the builders work around: there is no `/block/<height>`, so a height resolves through a one-row `/blocks?height_min=h&height_max=h` and the block then opens by hash; a blocks query with both `timestamp_start` and `timestamp_end` answers 400, so the end of a date range is first turned into a height; transaction and batch types are numbered in Platform Explorer's own order (`PE_TYPE_ORDER`, `PE_BATCH_ORDER`), and a batch filter implies `transaction_type=1`.
- A block's epoch comes from the SDK (`epoch.epochsInfo`, shared across rows by `useEpochOf`); Platform Explorer's rows carry none.
- The transition page draws a panel per type (`features/platform/tx/panels.tsx`, keyed by Platform Explorer's type number, with a generic key/value panel for any type without one), the raw bytes as JSON, hex or base64 (`RawCard`), and the node's own result (`LiveResult`, `stateTransitions.waitForStateTransitionResult`), which says so when it disagrees with Platform Explorer. In Decentralized only mode that live result is all the page has; the lists offer a hash and a height field.

### 3.7 Platform pages: identities

- `/identity/$id` has eleven tabs (`tab`): `overview`, `keys`, `names`, `tokens`, `groups`, `votes` and `advanced` read the SDK; `transactions`, `contracts`, `documents` and `transfers` are Platform Explorer lists paged with `page`. `identities.balanceAndRevision` is the existence check, so "No identity with this ID" is a proved statement. A 64-hex id is replaced by its base58 form.
- Groups and Advanced need a contract (Platform answers `identityGroups`, `contractNonce` and `contractKeys` only for contracts it is asked about): the `contract` search value plus the contracts the identity owns from Platform Explorer (absent in the mode).
- Tokens: `wellKnownTokens(net)` plus the `tokens` set, balances through the `tokenBalance` batcher and frozen state through `tokens.identityTokenInfos`; Platform Explorer's token list is the indexed complement, with "Check on-chain" adding a token to the set.
- `/identity/lookup` validates the key hash before any request, then tries `identities.byPublicKeyHash` (a unique hit replaces the URL) and otherwise pages `identities.byNonUniquePublicKeyHash` as an infinite query.
- `/identities` takes its Platform Explorer query from `peIdentitiesQuery` (`data/query/prefetch/p-id.ts`), shared by the prefetch and the page. Credits are drawn with `<Amount kind="credits" fiat />` (credits / 1000 = duffs).

### 3.8 Platform pages: contracts, documents and groups

- `/contract/$id` has nine tabs. Overview, Types, Schema, Tokens, Groups, History and Config read the SDK (`contracts.fetch`; `contracts.getHistory` 10 at a time, with `version-diff.ts` diffing two versions; `tokens.calculateId`); the overview's Activity card, Transitions and Documents (activity) are Platform Explorer reads. The Transitions tab's owner and date filters narrow only the rows of the loaded page, because the endpoint takes `page`, `limit` and `order` only; the page says so.
- The documents browser (`/contract/$id/documents/$type`) is `documents.query`, driven entirely by the address (§6.4).
- `/document/$contract/$type/$id` reads `documents.get`, and `documents.history` for revisions only when the type keeps history; page N of the revisions reads pages 1..N in a chain, because Platform has no offset. Provenance (the transition that wrote it) is Platform Explorer.
- `/groups/$contract` reads `group.infos`; `/group/$contract/$pos` reads members and actions, and an action's signers only when the viewer asks to see them.
- Decentralized only mode: every Platform Explorer part shows one `Unavailable source="pe"`; `/contracts` keeps the featured contracts and the open-by-ID form.

### 3.9 Platform pages: tokens and Platform addresses

- A token's configuration never comes from Platform Explorer: `tokens.contractInfo` gives `{ contractId, position }`, `contracts.fetch` the contract, and `features/platform/token/token-config.ts` reads names, decimals, supply, the change rules, the distributions and the history flags from `tokens[position].config`. A field the contract does not state reads "Not stated", never a default. `useToken(id)` carries `missing` when the node answered that no token has the ID.
- `/token/$id` has six tabs (`overview`, `definition`, `distribution`, `balance`, `activity`, `holders`); `activity` and `holders` are Platform Explorer's. Opening by contract and position (`ByContractForm`) computes the id with `tokens.calculateId`.
- Platform keeps no holder index, so `/token/$id/holders?ids=…` lists the balances of identities the reader chooses (ids or DPNS names resolved with `dpns.resolveName`, at most 100), through the `tokenBalance` batcher. A balance the node did not answer is "Unknown" with a retry, never 0.
- `/tokens` lists Platform Explorer's tokens (query builder `data/pe/tokens-query.ts`) and prices them with one `tokens.directPurchasePrices` call for the page's ids.
- `/platform-address/$addr` checks the bech32m address's network, reads balance and nonce with `addresses.get`, and adds Platform Explorer's totals and transitions.

### 3.10 Platform home and status

- `/platform` takes its height from the proof of `epoch.current` (`platformTipQuery`), shared with every Platform page, and fills its lower zones when they come within 400 px of the viewport or on a timer (`useInView(lateMs)`), so an unscrolled page still settles. Top proposers combine up to `MAX_PROPOSER_PAGES` (8) SDK pages into one answer. Polls are read with no clock-dependent argument (`limit: 100, orderAscending: true`) and the 30-day window is applied in the browser (`POLL_WINDOW_MS`), so a recording stays valid on any day. Charts of transition types are all-time, because Platform Explorer's statistic has no range.
- The status page's Platform card reads `system.status` (what the answering node says) and judges it in `features/core/status/platform-health.ts`: a block older than 6 min is lagging and 15 min stalled; a Core ChainLock more than 6 blocks behind Core's tip is lagging and 24 stalled; catching up or no peers is lagging.

### 3.11 Platform pages: names, contests and votes

- A name is registered when `dpns.getUsernameByName` finds it (proved), contested when the vote state has contenders or a winner, otherwise available. `dpns.isNameAvailable` is not called (above). Label rules (`labelProblem`, `isValidLabel`, `isContestedLabel`) and `normalizeLabel` (lower case, o→0, i and l→1) are local functions in `data/query/prefetch/p-vote.ts`.
- `/names` searches by the normalised prefix and shows the form searched; it pages by cursor (`after`, the last name's id; 26 rows asked, 25 shown).
- Open contests come from the poll tree (`voting.votePollsByEndDate`, which gives each open contest's index values and end time), each rendered row hydrated with `voting.contestedResourceVoteState`; `group.contestedResources` cannot tell open from decided, so it backs only the A–Z list of every contest in Decentralized only mode. A contender's prefunded balance is Platform Explorer's (`prefundedVotingBalance`), absent in the mode.
- `/contest/$label` addresses a DPNS contest by default (contract DPNS, type `domain`, index `parentNameAndLabel`, values `['dash', label]`); another contract passes `contract`, `type` and `index`, and its index values are `[label]`. Voters page by cursor.
- `/polls` reads the poll tree without a clock-dependent argument and applies the preset windows (24 h, 7 d, 30 d, 90 d) to the answer; a custom range sends `startTimeMs`/`endTimeMs` from the URL's dates. `/votes` is a Platform Explorer list, one `Unavailable` in the mode.

### 3.12 Tools: query, decoders and the transition tool

- **Query** (`/query`, `features/tools/query/`). `sql-parser.ts` turns SQL-like text into Drive `where`, `orderBy` and aggregate arguments, `run.ts` runs at most two statements (cancellable), and `ResultsPanel.tsx` shows documents, count, sum, average or groups with JSON and CSV export. The query text and contract are in the URL (`q`, `contract`); results never are. Saved queries are kept per network in `localStorage` (`saved-queries.ts`). Aggregate presets exist only where a contract has a countable index.
- **Decoders** (`/tools/$decoder`: contract, identity, document, proof, path). Pasted bytes are decoded locally, by the SDK worker's wasm (`sdk.decode`, §3.2) or the vendored GroveDB proof parser (`decoders/grovedb-parser/`, loaded on first use), and never reach the URL, storage, logs or the network. The path tool reads GroveDB elements through `system.pathElements`.
- **Transition tool** (`/tools/transition`) decodes a signed state transition with no network. Its optional check is an explicit button that sends that one transition to Platform Explorer (`POST /transaction/verify`, `peQueries.verifyTransaction`, never retried or kept); in Decentralized only mode the check card is `Unavailable`.
- In fixture builds `FixtureSdkTransport.decode` answers "unavailable", so e2e stubs `window.__radarSdk.decode` with recorded decodings (`decoders/vectors/*.json`, `scripts/record-decoder-vectors.mjs`); the proof decoder runs the real wasm.

---

## 4. DAPI Core client (`data/dapi-core`, façade in `data/core`)

### 4.1 Transport

The façade does not call Connect. It speaks to a `DapiTransport` (`data/dapi-core/transport.ts`), which moves protobuf **bytes**:

```ts
interface DapiTransport {
  readonly budget: Budget // the pool's request budget; the façade reads it for the §4.7 list rule
  unary(net, method: DapiUnaryMethod, request: Uint8Array, opts?: { signal?, priority?, nodeUrl?, avoidNode? }): Promise<{ response: Uint8Array; node?: string }>
  stream(net, method: DapiStreamMethod, request: Uint8Array, opts?): { node?: string; messages: AsyncIterable<Uint8Array> }
}
```

`data/dapi-core/rpc.ts` (`createDapiRpc(transport)`) turns the generated messages (`data/dapi-core/gen/`, from `platform/packages/dapi-grpc/protos/core/v0/core.proto`; `pnpm --filter @radar/web gen:dapi` regenerates; `broadcastTransaction` and `getEstimatedTransactionFee` are removed) into typed calls: `status`, `bestHeight`, `block`, `transaction`, `masternodeStatus`, `headerStream`, `transactionStream`. Requests are deterministic, so a recording replays by `sha256(request bytes)`. Transport failures are `SourceError`s with `source: 'dapi'`; a gRPC `NOT_FOUND` (5) and `INVALID_ARGUMENT` (3) arrive as `kind: 'http'` with `status` set to the gRPC code, and the façade turns them into `Sourced<null>`. `getDapiTransport()` and `setDapiTransport()` pick the transport; the default `unavailableDapiTransport` throws `unavailable` and reports no budget (so lists go to Hyphen). The façade reads the budget from `transport.budget`, not from a module-level singleton: the pool owns it, and the fixture transport can steer it.

The production transport is `PoolDapiTransport` (`pool.ts`). `grpc-web.ts` does the framing, trailers and status mapping itself (`grpc-status` in headers or in trailers behind an HTTP 200, `ratelimit-*` parsing), without Connect. `main.tsx` calls `installProductionDapiTransport({ devnets })` (`production.ts`) in non-fixture builds; `lazy.ts` wraps the pool so that the pool, the gRPC-web client and the protobuf runtime load on the first Core request and stay out of the entry chunk.

Facts that shape the client (dashmate gateway, `templates/platform/gateway/envoy.yaml.dot`):
- CORS allows any origin and exposes `grpc-status`, `grpc-message`, `ratelimit-reset`, `ratelimit-limit` and `ratelimit-remaining`. Over-limit replies are HTTP 200 with `grpc-status: 8` and `ratelimit-reset` as headers.
- The limit is per client IP per node: 150 requests per minute by default. A stream counts as one request when it opens.
- Core streams end after at most 601 s (`max_stream_duration`). Unary requests time out upstream at 10 s.
- `getMasternodeStatus` takes no arguments: it reports the status of the node that serves it. Radar uses it only to ask an evonode about itself on its `/mn/` page.

### 4.2 Node discovery and selection (`nodes.ts`)

1. **Discover** (`discovery.ts`). `GET {quorums}/masternodes` (CORS `*`; about 370 entries on mainnet). Keep `status === 'ENABLED' && versionCheck === 'success'` (242 on mainnet and 41 on testnet on 2026-11-10). URL: `https://{ip}:{platformHTTPPort ?? defaultPort}`. Cache the list in IndexedDB (`meta`) for 1 h. If discovery fails, use `scripts/seed-nodes.mjs` output bundled at build (`data/dapi-core/seed.<net>.json`, 30 nodes). Devnets use their configured `dapiAddresses`; a devnet with none throws `unavailable`.
2. **Active set.** At session start, pick 8 nodes at random. This keeps HTTP/2 connections warm and spreads load across visitors. When a node is benched, replace it with a random unused one.
3. **Choose per request.** Pick the active, unbenched node with the most budget headroom, breaking ties by lowest latency EWMA (α = 0.3). Never use a node more than 2 blocks behind the best tip seen for height-sensitive calls (`getBestBlockHeight`, `getBlock` by height near the tip).

### 4.3 Budget (`budget.ts`)

| Limit | Value | Why |
|---|---|---|
| Per node | ≤ 50 requests in any rolling 60 s, ≤ 4 in flight | Under the 60/min target, well under dashmate's 150, leaving room for other tabs and for visitors behind one NAT |
| SDK, per node | ≤ 30 requests in any rolling 60 s, ≤ 4 in flight (its own guard, below) | The SDK picks its own evonodes inside wasm, so it gets its own slice and reports it to the pool |
| Server truth | If `ratelimit-remaining` < 30 on a response, treat that node as full until `ratelimit-reset` | The gateway's own count includes other tabs and other people on the IP |
| Session | ≤ 8 × 50 = 400 per rolling 60 s | Bounded by the active set |

```ts
export type BudgetPressure = 'ok' | 'tight' | 'exhausted'
export interface BudgetSnapshot {
  pressure: BudgetPressure
  headroom: number      // requests available in the next 60 s across unbenched active nodes
  capacity: number      // activeNodes × 50
  benched: number
  usedLastMinute: number
}
export const budget: {
  snapshot(net: NetworkId): BudgetSnapshot
  /** True if n more requests fit without moving pressure past 'ok'. */
  canAfford(net: NetworkId, n: number): boolean
  subscribe(cb: () => void): () => void
}
```

Pressure is `ok` while headroom ≥ 50 % of capacity, `tight` from 20 % to 50 % (or 3+ benched nodes), and `exhausted` below 20 % (or 6+ benched). When pressure isn't `ok`:
- hedging stops;
- prefetch on hover stops;
- list views fall back to Hyphen (§4.7).

A detail route's loader reserves `DETAIL_DAPI_COST` (2) requests in the gate (`defaultGates.dapi`): the block or transaction and the ChainLock lookup behind it.

Requests over budget wait in a priority queue: detail pages first, then lists, then prefetch. They never go out early. A queued call gives up after 70 s (`QUEUE_TIMEOUT_MS`), which must exceed the 60 s window or a full pool could never serve a queued call.

**SDK traffic.** The SDK sends through the worker's `fetch`, so the worker wraps `globalThis.fetch` (`data/sdk/worker/fetch-guard.ts`) with 30 requests a minute and 4 in flight per node. A request that would wait more than 15 s gets a synthetic gRPC status 8 (resource exhausted). A node that answers 429 or status 8, or reports `ratelimit-remaining` below 30, is left alone until its reset (at most 2 min). Each request is recorded; `connect` and `call` return `requests: { host, at }[]`, and `data/sdk/client` forwards them to `getDapiTransport().noteExternalRequests`, which counts them in the same per-node window the Core pool uses, so Core calls see SDK use and back off.

The budget is the `budget` member of the installed transport (`getDapiTransport().budget`); `data/dapi-core/budget.ts` exports a `budget` that delegates to it for `SourceLine` and `/status`.

### 4.4 Racing, retries, benching

- **Hedge.** A unary call goes to node A. If A hasn't answered after 1.5 s and pressure is `ok`, the same call goes to node B; the first success wins and the other is aborted. Both count against the budget.
- **Attempts.** At most 3 attempts on distinct nodes. A hedge asks for a node other than the first (`avoidNode`) and is not sent once the first node's headers have arrived. Timers per attempt: headers 8 s, 8 s idle between chunks, 45 s overall (30 s for a bounded header range). A timeout after bytes started flowing is `bytesFlowing`: a slow link, final, so neither another node nor the query default retries it. `ratelimit-reset` and retry delays are clamped to 1–120 s (epoch values are converted).
- **Replies.** `FrameReader` in `grpc-web.ts` enforces a per-method maximum frame size (64 KiB by default) and trailer size, refuses compressed frames, ignores bytes after the trailer and treats a cut-off or status-less reply as `invalid-response`.
- **Verification.** Every answer is checked against its request before it is shown or kept (§4.4a).
- **Bench table:**

| Signal | Bench for |
|---|---|
| `grpc-status: 8` (RESOURCE_EXHAUSTED) or HTTP 429 | `ratelimit-reset` seconds if readable, else 60 s |
| Fetch failure (refused, TLS, CORS, DNS) | 1, then 5, then 10 min; for the rest of the session only after 5 misses while other nodes answered (`lastSuccessAt`). When the client itself is offline (`online()` false) or 3 distinct nodes were unreachable within 15 s with no success (`linkLooksDown`), nobody is benched |
| `UNAVAILABLE` (14), `DEADLINE_EXCEEDED` (4), HTTP 5xx, timeout | 60 s; 10 min after 3 strikes |
| `invalid-response` (a failed check, §4.4a) | as a 5xx, and reported to health with the node's name |
| Behind the best tip by > 2 blocks | excluded from height-sensitive calls until it catches up |
| `NOT_FOUND` (5) | no bench: it is an answer (`Sourced<null>`) |

Benching updates `healthRegistry` for `dapi`. The source is `down` when at least min(16, node count) distinct nodes have failed within 2 min; reports that name a node never use the consecutive-failure rule. A node chosen by the user (pinned) has its own budget slot and its failures are not reported to the source's health.

"Behind" is decided against the median-low of the nodes' tips (`noteTip`), so one node that lies about its height cannot make the rest look behind. Discovery uses a stale cached list before the seeds and refreshes live; when the live list lands, the pool adopts it and retires the seeds.

### 4.4a Trust model (until M8 adds Core proofs)

Nothing that comes from a DAPI node is trusted on its word (`lib/core/verify.ts`, used by `data/core/client.ts`):

| Answer | Check | If it fails |
|---|---|---|
| raw tx | double-SHA256 of the bytes equals the requested txid | `invalid-response` |
| tx placement (block hash) | the header the node names hashes (X11) to the block hash it reported | the tx is kept without placement |
| block by hash | header hash equals the requested hash; the hash meets its own `bits`; `bits` is not easier than the mainnet/testnet limit (devnets may set their own) | `invalid-response` |
| block by height | the hash links to the header chain held and passes the same PoW check; height comes from the request below BIP-34 (951 mainnet, 76 testnet) and from the coinbase above | `invalid-response` |
| block body | the merkle root recomputed over its txids equals the header's; a list that repeats a pair to reach the same root is refused (`mutated`) | `invalid-response` |
| header range | the last header's PoW and the chain links | retry on another node |

A failed check is an `invalid-response` from that node: the pool benches it, reports it to health with the node's name and retries on another node (up to 3 tries). The bad answer is never cached. X11 proof-of-work uses the wasm `decoder.headerHash`, so no new dependency. Still M8: BLS verification of ChainLock and InstantSend signatures, and full header-chain work (the PoW of the headers shown is checked, not that they are the best chain).

**Claims.** ChainLock, InstantSend, confirmations and "is in the best chain" are claims and are never stored as immutable.
- `ChainLocked` is shown only when two distinct claimants report the lock for that height: two DAPI nodes, or one node plus Hyphen (`refreshLocks`, one shared lookup, 12 s deadline). Otherwise the stamp carries `chainLockClaim: 'one-node'` (likewise `instantLockClaim`), and the UI says "reported by one node" through `ChainLockBadge`, `InstantSendBadge` and `LockMark` (§7.2); a plain lock icon is never used for a one-node claim.
- An InstantSend lock is always one source's claim (the node that answered), and is shown only until the transaction's block is ChainLocked (§4.7, "InstantSend state ends at the ChainLock").
- Hyphen-only lock state uses the tag Hyphen sends, or depth (`HYPHEN_FINAL_DEPTH`, 24 blocks), or a corroborated claim.
- Stamps stay `proved: false`; only `data/sdk` sets `proved`.

### 4.5 Cache (`cache.ts`, IndexedDB `radar-core`, via `idb`)

| Store | Key | Value | Written when |
|---|---|---|---|
| `blocks` | `net:hash` | raw bytes, height | height ≤ best ChainLock height |
| `heights` | `net:height` | hash | same |
| `txs` | `net:txid` | raw bytes, blockHash, height, `isChainLocked: true` | its block is chainlocked |
| `headers` | `net:height` | 80-byte header, hash | same |
| `meta` | `net:nodes` | discovered node list | every discovery (1 h TTL) |

- The database is version 2 (older stores are dropped). `touchAll` writes at most every 10 min per entry and `trim` re-sums sizes.
- Headers are written only at or below the corroborated lock (§4.4a) and only after the hold time `headersHold`. The only cached tx payload is the verified raw bytes (`CachedTx = { txid, bytes }`); block lists cache each locked row, and `block()` and `blockRows()` carry no `immutable` stamp.
- Mempool and unlocked answers are never written; they live only in TanStack memory.
- Reads check the cache before the budget is touched; a hit costs nothing and returns `immutable: true`.
- Size cap 200 MB per origin, LRU by `lastRead` (store `lru`), trimmed to 150 MB at startup and every 10 min. Quota errors disable writes for the session; reads keep working. Devnet answers are never cached.
- Decoded JSON is not stored; decoding is cheap compared with fetching.

### 4.6 Streams (`streams.ts`)

All streams are shared and reference-counted per network: the first subscriber opens one, the last unsubscribe closes it after a 10 s linger.

| Stream | Opened by | Behaviour |
|---|---|---|
| `subscribeToBlockHeadersWithChainLocks` (live: `fromBlockHeight = tip`, `count = 0`) | `coreLive.tip`, mounted by the shell on every page | Emits `{ height, hash, time }` per header and `{ height, hash }` per ChainLock (decoded in `lib/core/header.ts`, `lib/core/chainlock.ts`, no wasm). Updates `[net,'dapi','tip']` and `[net,'dapi','chainlock']` with `setQueryData`, and invalidates `[net,'view','latest-blocks']` |
| same RPC, `count = N` | `core.headers(from, n)` | Historic header range in one request (heights and times for lists, date binary search). N ≤ 2000 |
| `subscribeToTransactionsWithProofs`, match-all bloom filter (`vData = [0xff]`, `nHashFuncs = 1`), `fromBlockHeight = tip` | the address page (IN-06) while visible (the IN-01 live feed card will share the stream) | The node replays the tip block first. `coreLive` holds those transactions back until the tip block's merkle block names them, and drops them. Afterwards it emits `tx` for every mempool transaction, `islock` for every IS lock, and `block` (`txids` read from the merkle block's partial tree, not checked against the header) for every new block. `txStatus.fallbackHint` turns on when the node sends nothing for 60 s while the tip moves, or after 3 failed opens in a row, and turns off with the next message. After 3 failed opens the stream is tried again only every 5 minutes (`TX_STREAM_RETRY_MS`), because its watchers read Hyphen meanwhile |
| `subscribeToMasternodeList` | `core.masternodeList` (§4.12), one stream per read | Not shared or kept open: the first message (the full list as a diff from the zero hash) is decoded into `Map<protx, DapiMnEntry>` and the stream is closed |

`SharedStream` (`streams.ts`) implements the sharing and the backoff. `coreLive` (`data/core/live.ts`) is the only code that opens these streams: `coreLive.tip(net, queryClient)` returns a release function; `.transactions(net, listener)` delivers every transaction and InstantSend lock that reaches the mempool from now on, plus a `block` event with the transaction ids of each new block (`merkleBlockTxids`); `.status(net)` and `.txStatus(net)` give the `LiveStatus` (`idle`, `connecting`, `live`, `reconnecting`, `polling`, `stopped`); `.subscribe(cb)` reports changes. The shell mounts the tip through `useLiveTip` (`app/live-tip.ts`), which loads `coreLive` on demand and which `main.tsx` enables after it installs the transport (page tests leave it off). **The connection state the page shows.** `ui/live-connection.ts` holds one shared state (`live | connecting | reconnecting | polling | stopped`, with the time of the last event) and its words (`liveView`): "Live", "Connecting…", "Reconnecting…", "Checking every 30 s", "Stopped since HH:MM" (short forms "Retrying", "Slow", "Stopped" in the phone header). Until something feeds it the state is `live`, so page tests and the kit need no stream. `features/entity/HeaderTip.tsx` (mounted by the shell bar through `HeaderTip.lazy.tsx`, which keeps the Core queries out of the entry chunk) shows the live Core height with its ChainLock state and mirrors `coreLive.status(net)` plus `navigator.onLine` into that state (`features/entity/live-connection.ts`: `idle` counts as live; offline is `stopped` from the moment the browser went offline). Every `LiveDot state="live"` and every un-paused `LiveControl` reads it. A `LiveDot` given a source-health state is not the connection and is left alone. `[data-header-tip]` carries `data-connection` and `data-up`; the word beside the height appears only when the state is not live. The "live updates stopped" notice (`LiveNotice`) is the longer explanation with its retry.

The "live updates stopped" notice (IN-15) reads the DAPI source health, which the pool feeds on every failed call and `coreLive` feeds with a lag report when no header has arrived for 20 min.

Reconnects: on end or error, reopen on a different node, resuming from the last height + 1, with backoff 1, 2, 4 … 30 s; the backoff resets only after 60 s of liveness. A stream is expected to live about 590 s (the server cap is 601 s): a clean end earlier than that counts as a failure (backoff, avoid that node), and an end at the cap is not a health event. Header streams with `count = 0` and the masternode-list and transaction streams are `follow` streams that call `reportOk` every 30 s while they live. `core/live` aborts a stream idle for 6 minutes on non-devnets, and `forget(net)` runs on a network reset (`onNetworkReset` hooks in `query/network-cache`). If the header stream fails 3 times in a row, `coreLive.tip` switches to polling `getBestBlockHeight` every 30 s and keeps trying the stream every 2 min.

### 4.7 The Core façade and the Hyphen fallback rule (`data/core/types.ts`, contract file)

Features use only this façade, never `dapi-core` or Hyphen directly for Core facts.

```ts
export interface CoreClient {
  tip(net: NetworkId): Promise<Sourced<{ height: number; hash: string; time: number }>>
  chainLock(net: NetworkId): Promise<Sourced<{ height: number; hash: string }>>
  status(net: NetworkId): Promise<Sourced<CoreChainStatus>>             // getBlockchainStatus
  block(net: NetworkId, ref: BlockRef): Promise<Sourced<DecodedBlock | null>>
  tx(net: NetworkId, txid: string): Promise<Sourced<DecodedTx | null>>  // with height, confirmations, isInstantLocked, isChainLocked
  prevouts(net: NetworkId, tx: DecodedTx): Promise<Sourced<Map<string /*txid:vout*/, PrevOut>>>
  headers(net: NetworkId, fromHeight: number, count: number): Promise<Sourced<HeaderInfo[]>>
  /** List pages: decides DAPI vs Hyphen per call (rule below). */
  blockRows(net: NetworkId, q: { fromHeight: number; count: number }): Promise<Sourced<BlockRow[]>>
  heightAtTime(net: NetworkId, ms: number): Promise<Sourced<number>>   // IN-02 binary search over headers
  nodeSelfStatus(net: NetworkId, nodeUrl: string): Promise<Sourced<DapiNodeStatus>> // evonode /mn/ page
  masternodeList(net: NetworkId): Promise<Sourced<Map<string, DapiMnEntry>>>  // §4.12
}
export type BlockRef = { height: number } | { hash: string }
export interface BlockRow { height: number; hash: string; time: number; txCount: number; size: number; chainLocked: boolean; pool?: string }
```

**The fallback rule, exactly:**

1. **Lists** (`blockRows`, the home "latest blocks" beyond the cached ones, the blocks-by-date page). Count `n` = uncached DAPI calls the page needs. If `budget.snapshot(net).pressure === 'ok'` and `budget.canAfford(net, n)`, serve from DAPI. Otherwise serve that page from Hyphen (`/blocks?cursor=` built with `cursorFromHeight`), stamped `{ source: 'hyphen', fallback: 'dapi-budget' }`. After a fallback, that list stays on Hyphen for 2 min (hysteresis), then tries DAPI again on the next page load.
2. **Details** (`block`, `tx`, `prevouts`, `status`, `tip`) stay on DAPI and queue for budget. Only when DAPI health is `down` do they use Hyphen (`/block/{id}` or `/rawblock`, `/tx/{txid}` or `/rawtx`, decoded locally), stamped `fallback: 'dapi-down'`.
3. **Hyphen must be fit to serve.** No fallback when Hyphen's health is `stale` or `down` (testnet today), or while Decentralized only mode keeps Hyphen off (§4.11: `hyphenFit` answers false before it looks at health, `blockRows` with `via: 'index'` rejects `disabled-by-mode`, and a Hyphen ChainLock claim is not counted). The list then stays on DAPI and fills rows as budget allows, with the rest as skeleton rows and a "Waiting for DAPI capacity" note.
4. **Labels.** `SourceLine` renders `fallback` as "Indexed by Hyphen · DAPI busy" or "Indexed by Hyphen · DAPI unreachable". The fallback state is also visible on `/status`.

Hyphen keeps the data DAPI can't give at all: addresses, spent flags, rich list, mempool, governance, metrics, validator history. Those calls go straight to `data/hyphen` and aren't fallbacks.

**Prefetch budget.** Route loaders and hover prefetch may issue DAPI calls only when pressure is `ok`, at most 1 call per hover, and only for detail routes (`/block/`, `/tx/`). A router preload passes `{ priority: 'prefetch' }` to `coreQueries.block` and `coreQueries.tx` through the `preload` flag that `blockPrefetch` and `txPrefetch` take, so it queues behind every read a visible page needs; a real navigation uses `detail`. Hover cards pass `prefetch` too.

**What the façade does, as built.**
- Times are ms since the epoch everywhere in `data/core` (`HeaderInfo.time`, `DecodedBlock.time`, `DecodedTx.time`, `BlockRow.time`, `tip.time`, `CoreChainStatus.medianTime`).
- DAPI stamps use `asOf = fetchedAt` (§2.2): a block's time is an event time and never becomes `asOf`. `immutable` is set on a block when its height is at or below the best ChainLock, on a tx when `isChainLocked`, and on prevouts when every previous tx is chainlocked. Hyphen answers copy Hyphen's stamp and add `fallback`.
- `tip` = `getBlockchainStatus` (height, hash) plus a one-header range (time): 2 requests. `chainLock` = a header range of one header from height 1; the stream sends the best ChainLock first, so that is one cheap request. Any header range also refreshes the façade's remembered best ChainLock, which `block()` uses for `chainLocked` (refreshed at most every 10 s).
- Header hashes are X11. A range takes the hash of header *i* from the `prevHash` of header *i+1*; only the last header is hashed, by the wasm decoder (`decodeBlock(header ‖ 0x00)`). `lib/core/header.ts` and `lib/core/chainlock.ts` parse the fields without wasm.
- `blockRows(net, { fromHeight, count })` is newest first: `fromHeight`, then `count - 1` blocks below it. Its DAPI cost is `count` `getBlock` calls plus one ChainLock lookup. `pool` comes from the coinbase scriptSig through `lib/core/pools.ts`.
- `heightAtTime(net, ms)` is the lowest height whose block time is at or after `ms` (the tip's height when `ms` is after the tip). It interpolates over header windows, usually in 2–3 requests: the first probe reads `firstWindow(back)` headers (4 × (√back + 1 % of back), between 96 and 500, centred on the guess from the average block time), later probes 128. A day close to the tip moves a fifth of the bytes it used to; one a week back still reads 500. Recorded replays ask for the same windows, so `scripts/record-dapi-fixtures.mjs --times <ms,…>` records a search from the manifest's tip.
- `block()` by hash derives the height from the cbTx (DIP-3 on) or the BIP-34 push in the coinbase script (before), or 0 for the genesis block.
- `tx()` costs 2 requests on DAPI (`getTransaction` plus the header of its block for `time`). `prevouts()` costs one `getTransaction` per distinct previous txid, 4 at a time.
- Duff fields in payloads (`cbTx.creditPoolBalance`, `assetLockTx.totalCredit` and `creditOutputs[].value`, `assetUnlockTx.fee`, shared-collateral amounts) are `bigint`; everything else in `payload` is the decoder's plain JSON (numbers, hex strings, a `kind` tag). `DecodedTx.type` for a transaction type the badge palette has no entry for (ProDissolveTx, ProUpShareTx, ProUpSharedRegTx) is `transfer`; `payload.kind` carries the exact type.
- Hyphen fallback, as built: lists use `hyphen.status` (indexed height) then `blocks` or `blocksFrom` (cursor from `cursorFromHeight`); after a fallback the list stays on Hyphen for 120 s without extending the hold. Details (`block`, `tx`, `prevouts`, `tip`) go to Hyphen only when the DAPI health is `down`, and never when Hyphen is `stale` or `down` or the network is a devnet. `status`, `chainLock` and `headers` have no Hyphen fallback.
- `heightAtTime` returns the tip + 1 for a time in the future. The blocks day view takes its rows by height only; block times are not monotonic, so rows have no time filter.
- Every `CoreClient` method takes a trailing `signal?: AbortSignal` (§2.4). Query factories are in `data/core/queries.ts` (`coreQueries`): `[net,'dapi','tip'|'chainlock'|'status'|'block'|'tx'|'prevouts'|'headers'|'height-at-time'|'node-status'|'masternode-list']` and `[net,'view','block-rows']`. Core queries use `staleUnlessImmutable`: 15 s fresh, 5 min once locked, forever only when `immutable` (prevouts that are all found). They are class `live` (memory only; only `immutable` and `structural` queries are persisted).
- `masternodeList` is DAPI's deterministic masternode list (§4.12); `CoreDecoder.mnListDiff` delegates to the same TypeScript decoder (`parseMnListDiff`).

- **InstantSend state ends at the ChainLock (`data/core/lock-state.ts`).** Once a transaction's block is ChainLocked its InstantSend lock no longer matters: the ChainLock is the stronger finality, and Dash Core deletes the lock then anyway (`HandleFullyConfirmedBlock` → `RemoveConfirmedInstantSendLocks`), at a different moment on each node, so a node's answer about it means nothing. Radar therefore keeps no historical InstantSend state and shows none. The one resolver, `instantLockView(tx)`, decides what every surface shows (settlement step, header chip, hover card):
  - **`settled`**: the transaction is mined and its block is ChainLocked (`isChainLocked`, or a one-node `chainLockClaim`; a claim counts, so the state is dropped a moment early at worst and never shown where nodes may have pruned it). Nothing about InstantSend is shown anywhere: no settlement step, no chip, no hover-card line, no "not known" marker. The settlement timeline reads Mined → ChainLocked. The façade does not even carry the fields: `core.tx()` leaves `isInstantLocked`, `instantLockClaim` and `instantLockSource` off a transaction whose lock status is `locked` or `claimed`, on the DAPI path and when Hyphen stands in.
  - **Pending, or mined and not ChainLocked**: the answering node's flag, a one-source claim. A lock is `claimed` ("reported by one node"); no lock is `none`, worded "No InstantSend lock was seen" (mined) or "waiting for the masternodes to lock it" (pending).
  - **Networks without ChainLocks** (devnets with ChainLocks off). Core prunes locks at tip − `nInstantSendKeepLock` there (24 mainnet, 6 test networks; `src/instantsend/net_instantsend.cpp`). When no ChainLock is known on the network the façade sets `DecodedTx.instantLockKeepDepth` (`instantLockKeepDepth(net)`), and a transaction with at least that many confirmations is `settled` too. That is all that is kept for them.
  - **Hyphen standing in for DAPI** (`fallback: 'dapi-down'`). Hyphen's `live.tags.islock` is live state, not a record: its lock map is filled from the node's ZMQ `rawtxlock` while its daemon runs, lost on restart, and `enable_islock` is off by default. `true` is a one-source claim naming Hyphen ("recorded by Hyphen"); `false` means only "Hyphen doesn't know", so `instantLockFields(false, 'hyphen')` yields `instantLockSource: 'hyphen'` with no lock and the view reads it as `unknown` ("not known from this source: Hyphen only reports locks its node relayed while it was watching"), a dashed neutral marker (`data-state="unknown"`). Hyphen is never asked about a lock next to a DAPI answer.
  - **Nothing is remembered.** No lock is kept between reads or visits: the `radar-core` `txs` store holds `{ bytes }` only. Rows written by earlier builds may carry `instantLock` and `instantLockAt`; they are ignored on read and dropped by the next write of that transaction, so the database version (2) did not change.
  - Pending rows in lists carry no InstantSend flag (§4.8). Hyphen may add one to its mempool list upstream; nothing is built for it.

**Hyphen fitness.** Pages that add Hyphen-only facts to a Core page (chainwork, spent flags, mempool rows) ask "is Hyphen fit?" before each Hyphen request: the `healthQueries.hyphen` probe has succeeded and the Hyphen source health is neither `stale` nor `down` (rule 3). `useHyphenFit(net)` in `data/hyphen/fit.ts` answers it; testnet's Hyphen lags by weeks, so testnet pages make no Hyphen requests for those facts.

### 4.7a The stale-index rule (`data/index-state.ts`, `data/health.ts`, `data/index-health.ts`)

Hyphen's index can stop behind the chain (testnet since block 1,578,000, the first with a version-4 coinbase payload; mainnet will meet the same wall at Core v24). One rule judges every index (Hyphen and Insight) in every place that asks:

- **One rule, one set of constants** (`index-state.ts`): stale when more than `INDEX_STALE_BLOCKS` (6) behind, fresh again at `INDEX_FRESH_BLOCKS` (2) or fewer, and in between the earlier answer stands (`nextIndexState`). The health registry applies it when a probe reports a lag (`HealthRegistry.setLag`) and keeps the answer per network and source (`SourceHealth.index`; `rememberedIndexState(net, source)` reads it so a route loader can pick the source before any component mounts). `/status`, the source line's colouring and the page routing all read that one answer; no other threshold for an index exists.
- **Measure.** The `healthQueries.hyphen` and `healthQueries.insight` probes compare an index's height with DAPI's best height (`core.tip`; a tip stamped `fallback` is ignored, as it is a stand-in index's own), and with Radar's crawled height only when DAPI has none. When no outside tip exists a probe claims no lag and the state decided before stands (an index never decided is `unknown`). Hyphen's own `status.blockHeight` counts as a reference only to show its index behind (more than 6 blocks above its lowest indexed height), never to show it current.

```ts
useIndexHealth(net, opts?: { insight?: boolean }): {
  state: 'fresh' | 'stale' | 'unknown'; pending: boolean; readFrom: 'hyphen' | 'insight'; probed: boolean
  indexedHeight?: number; behind?: number; lag?: string
  insight: { state; indexedHeight?; behind?; lag? }   // Insight's own standing, probed once a page reads from it
}
```

- **Where reads go while Hyphen is stale.** Insight (`data/insight`, label "Indexed by Insight", §7.3) answers: the address summary, paged history, unspent outputs, hover card and the "new since you opened this page" poll; a tx page's spent flags and spender links; block chainwork; the governance proposal list and detail. Rich list, charts, mempool list and the network view have no Insight equivalent and stay on Hyphen.
- **Insight's own freshness.** Wherever a page reads Insight, `useIndexHealth` mounts Insight's `/status` probe (cached like Hyphen's, one request a minute at most), so `insight.state` and `insight.lag` exist before the page claims anything. Insight's source line shows its indexed height and lag the way Hyphen's does (the health registry's `lag.detail`, and the stale colouring once it is more than 6 blocks behind). When Insight is behind too, the page's one notice names both indexes and their lag ("Hyphen's Testnet index is behind the chain: indexed to block A (N blocks behind). Insight's Testnet index is behind too: indexed to block B (M blocks behind).").
- **Fresh Hyphen stays primary.** While Hyphen is fresh, Insight is never read for something Hyphen answers. The one exception is the transaction page (§4.8): one Insight `/tx` read for the spender of an output Hyphen says is spent but whose spender its history search could not find. A spender Insight names is final (a spend cannot be undone); Insight's "unspent" never replaces an answer Hyphen has already given, and an Insight that trails the tip never downgrades a state Hyphen had decided.
- **Governance while stale.** The list is Insight's current proposals, then Hyphen's proposals that Insight lacks (its node holds only the current ones), under a row "Earlier proposals, from Hyphen's index (behind the chain)" with Hyphen's source line beside Insight's; they are left out of the budget split. A proposal Insight lacks is read from Hyphen's detail, with the stale notice and Hyphen's label; "No proposal with this hash" is said only when neither index has it. Insight reports votes but not funding, so Radar works out Passing (absolute yes votes against the funding threshold) and Funded (windows that cover the next superblock, most votes first, while the budget lasts) in the browser and says so on the page. The reference for a payment window is the next superblock's time, from the chain tip's time and the 2.5 minute block target (`insight/queries.ts`), never the browser's clock; with no DAPI tip, no proposal is shown as Funded and the page says why.
- **Devnets** have neither index and behave as before.
- **Decentralized only mode** (§4.11). `useIndexHealth(net).off` is true and nothing is probed: `state` stays `unknown`, `probed` is false and `readFrom` never becomes `'insight'`. A page reads `off` first and renders the mode's `Unavailable` state where it would otherwise have chosen an index; no `StaleIndexNotice` is shown, since nothing is measured.
- **One notice per page.** A page that still shows Hyphen-only figures from a stale index renders `StaleIndexNotice` once (at ≤ 640 px it drops the sentence about what is still current elsewhere and tightens its padding, so it is three lines at 390 px and the page's content starts in the first screen; HY-19); one that reads Insight renders `<StaleIndexNotice reads="insight" />`, which is quiet while Insight is current (unless part of the page is still Hyphen's) and names both indexes once Insight trails too. Cards say nothing more; their source lines keep the stamp. The home page's pending column on a stale network is filled from the DAPI live transaction stream and labelled "Seen since you opened this page".
- **Pending.** Until the Hyphen probe has answered, `pending` is true and `readFrom` is `'hyphen'`; pages that can switch source start no read, and show no cached answer from the source they might drop, until `probed`.
- **Route prefetch.** A route that can read either index (address, governance) prefetches through `indexRead` (`data/query/route-prefetch.ts`): on a first visit it waits (within the loader's deadline) for the probe before starting either read; once the state is remembered it starts the right one at once. A stale network never starts, or paints, a Hyphen read it then discards.
- **Address page, Insight.** Insight's pages count the mempool and shift as blocks arrive, so mined rows are deduplicated by transaction id across pages, an unconfirmed transaction goes to the unconfirmed-activity area (counted in the Unconfirmed figure, deduplicated against what the live feed saw) and never into the paged history, and the pages are invalidated on each new block. A first page that holds only unconfirmed transactions reads on to the next page; a list with no rows yet and more pages is "loading", never "empty". The unspent-output list is read whole once (`refetchOnWindowFocus: false`; a block refreshes it only while the address page is open and the list has at most 2,000 outputs) and paged in the browser, 25 at a time; an unconfirmed output is marked "Pending" with no block link, and a line says the balance leaves pending outputs out. The live watcher reads the output values of the index in use (`knownOutputValue`), so a spend of the address's coins counts as a loss on either index.

### 4.8 Core pages: where each figure comes from

- **Block** (`/block/$id`, `?page=`): `coreQueries.block` (DAPI `getBlock`, decoded by `core-decode`) gives the header, the transactions (100 a page), the coinbase payload and the ChainLock flag. Difficulty is computed from `bits` (Dash Core's `GetDifficulty`) and shown with `formatSignificant` (`lib/format.ts`: two decimals from 1,000 up, "111,221,977.44", otherwise significant figures), so a testnet difficulty of 0.004011 never reads 0. The `Difficulty` component (`features/core/hy-shared/Difficulty.tsx`) puts `formatFull`, every digit, in the title; the block page, Charts "Now" and Network internals use it, chart tooltips and tables use `formatSignificant`, and axes stay compact. The reward is the sum of the coinbase outputs. The pool is read from the coinbase scriptSig against `lib/core/pools.ts` (`POOL_TAGS`, `coinbaseTagOf`, `poolOfCoinbase`) and shown as "Coinbase tag says <pool>" with the tag text and a note that the miner writes it, so it is not proof; control, bidi and other format characters (`\p{Cc}`, `\p{Cf}`, line and paragraph separators) are removed from the tag first. Chainwork exists only in Hyphen, so it is requested only when Hyphen is fit and carries its own stamp; otherwise the row says "Not in DAPI". `lib/core/block-ref.ts` parses the URL segment (height or hash).
- **Transaction** (`/tx/$txid`): `coreQueries.tx` plus `coreQueries.prevouts` for the fee and input values. Prevouts load for the first 10 inputs (all of them up to 50); "Load all N inputs" fetches the rest, and until then the fee falls back to Hyphen's figure. The fee fallback comes from Hyphen `tx`, only for mined transactions and only when Hyphen is fit. Settlement shows Received, InstantSend, Mined and ChainLocked without inventing times (below); the InstantSend step exists only until the block is ChainLocked (§4.7), after which the timeline is Mined → ChainLocked. Confirmations come from the live tip (`useFollowTip(net, { key, settled })` in `features/core/follow-tip.ts`): while a transaction or block is not ChainLocked the page's own query is refetched on each new block (one DAPI call per block, none once it is locked). A one-node lock claim reads "ChainLock reported by one node" or "InstantSend lock reported by one node" (`ChainLockBadge`, `InstantSendBadge`, §7.2) on the tx and block pages, in the hover cards, in the home lists and as a tag in the blocks list.
  - **Spend state** (`features/core/tx/spend.ts`, `useOutputSpends.ts`). Each output is `spent`, `unspent`, `unspendable` or `unknown`, never a bare boolean. `unspendable`: the script starts with OP_RETURN (`6a`). Hyphen caches a mined transaction's `/tx` response as immutable, so its `spent` flags stay as they were on the first read; only `spent: true` is trusted from it, because a spend cannot be undone. For every other output that has an address, the page reads that address's current UTXO list (`/address/{a}/utxos?limit=100`, at most 3 pages, 3 lookups at a time, stale after 30 s). An output still in the list is `unspent`; an output missing from a list read to its end, whose snapshot is at or past the transaction's block, is `spent`. `unspent` is offered only while the list's own height is within `UNSPENT_LAG_BLOCKS` (3) of the DAPI tip, and the page shows "as of block N" whenever the index is behind at all. Where no list is available (an output without an address, a failed read, a list cut at 3 pages that doesn't show the output) the state falls back to the transaction page's flag and `asOfHeight` by the same rule. `unknown` is everything else (not mined yet, Hyphen not fit or loading, flag absent, index more than 3 blocks behind), worded "Unknown" or "Unknown: index behind" with a title that says why. Hyphen pages cached while a transaction was unmined carry `asOfHeight: null`; the schemas read that as absent.
  - **Which index answers (§4.7a).** Hyphen is the source of the spent flags, the UTXO lists and the spender search while it is fresh, and Insight's `/tx` is not read at all, except in two cases, each one request for the whole transaction (`useOutputSpends`): Hyphen's index is stale (Insight then answers instead, and no Hyphen spend lookup is made), or Hyphen says an output is spent and its search finds no spender (Insight names it). A spender Insight names wins; Insight's "unspent" counts only where Hyphen has no page for the transaction, and where Insight trails the tip it reads "Unknown: index behind", so it never replaces a state Hyphen already gave.
  - **Spender.** Hyphen sends `spent` but not which transaction spent the output (upstream ask `spentBy`, plan §7.2, still open). For each visible output the state above calls spent, `findSpender` reads the output address's history (`/address/{a}/txs?limit=100`, at most 3 pages), takes later `direction: 'out'` transactions oldest first and opens each (`/tx/{id}`, at most 8) until one has an input naming `txid:vout`. The row then reads "Spent in <txid>" and links to `/tx/{spender}#in-{n}`; a busy address, a script without an address or a miss reads "Spent · spender not found". Lookups share a limiter (3 at a time) and are cached per output (`['view','tx-spender']`, stale time ∞ once found). Only the first `INITIAL` (10) outputs are looked up, or all once shown.
  - **Value flow.** Above 900 px the drawing puts each node's label on two lines, the amount and then the identity (address, pool or "· change"), so neighbouring labels never share a row; at 900 px and below a stacked bar and a list replace it (`.rx-flow-wide`, `.rx-flow-narrow`). `e2e/tests/core-tx.spec.ts` checks that no two label boxes overlap at 1440, 1100 and 901 px. An unknown pool's text stays inside its summary card on a phone.
  - **Received and mined times.** `useFirstSeen` takes the first-seen time from Hyphen's mempool list (`/mempool/txs?limit=20`, polled) while the transaction is unconfirmed and keeps it once the tx is mined with the page open. A transaction first opened after it was mined has no first-seen time in any source, so the Received step is not shown and the timeline starts at the step it has (InstantSend while the block is not ChainLocked, else Mined), with one muted line: "Mempool arrival times aren't kept once a transaction is mined." A known time is shown to the second (`Time seconds`), as is the mined time beside it.
  - **Transactions that spend nothing.** `totals()` gives a transaction with no inputs (an asset unlock excepted, which carries its own fee) a fee of 0 and so a fee rate of 0: "0 duffs a byte: it spends no coins". `movesNoValue()` (no inputs, no output value, not an asset unlock) replaces the ribbon with "No value moves in this transaction". A coinbase keeps its own "Coinbase transactions pay none" note.
  - **Hyphen-only facts** (spend state, chainwork) are followed by `HyphenOnlyNote` while Hyphen's probe says stale, in the shared sentence (below) and then "<what> come only from Hyphen. Everything else on this page is from DAPI."
  - The Core band draws no page links of its own; the shell's section bar is the one Core navigation.
- **Blocks list** (`/blocks?date=&from=`): `coreQueries.blockRows` (newest first, 20 a page, cursor = the height of the newest row). A 20-row page is read as three `blockRows` calls (`chunksOf` in `blocks-range.ts`): the first `FIRST_CHUNK` (4: one round of four block reads), then `NEXT_CHUNK` (8) twice, each starting once the one before has landed, so the top of the table shows after about a second and the rest is painted in steps as it arrives instead of all at once; the reads never run side by side, so the DAPI budget (§4.3) sees the same 20 block reads as before. `DataTable`'s `pendingRows` draws the placeholders for the rows on their way (`data-pending-row`). A day's two height searches start once the tip is known, so they share the tip read instead of repeating it. While they run the page shows a progress line (`data-range-progress`, a `role="status"` paragraph with a three-step `<progress>`: the tip, the day's end, the day's start; "Searching block headers for where this day begins and ends: N of 2 found."). The day's end is usually found first; from then on the page already reads the day's newest `FIRST_CHUNK` blocks (rows older than the day's first midnight are dropped until the start is known), so real rows show while the second search is still running (IN-02). Measured on a live build against mainnet, time to the first row of `/blocks?date=` four to seven days back (median of 8 runs): 5.4 s before, 3.9 s after (range 3.9–10.5 s before, 3.4–5.9 s after); the search and the first block reads are what is left. A day is the UTC range between `heightAtTime(day)` and `heightAtTime(day + 24 h) - 1`; "Older blocks from before this date" continues below the day. Rows fall back to Hyphen inside the façade when DAPI has no headroom, and the stamp says so. Pages of 50 and 100 come from an index list in one request; in Decentralized only mode the page stays at 20 from DAPI and a note says larger pages need an indexer. A "Coinbase tag says" column shows only when rows carry a pool.
- **Home** (`/`, `features/home/`). Three sections in reading order, the same at every width: `Hero`, `CoreSection`, `PlatformSection` (design: `docs/RADAR-DESIGN.md` §1.1).
  - `Hero`: a claim built from Radar's crawl and the figures beside it: Core block height with its ChainLock (`coreQueries.tip`, `status`, `chainLock`; a one-node claim reads "reported by one node"), Platform block height and epoch (`usePlatformTip`, `features/home/platform-tip.ts`: the SDK's proof-checked `platformTipQuery`, read again every 60 s (`TIP_POLL_MS`), with Platform Explorer's figure stamped `sdk-cold` or `sdk-down` standing in until it lands, §3.3), and the census figures (masternodes answering, evonodes, countries, PoSe-banned) from `radarQueries.summary`, `geo` and `activation`, read again every 5 minutes. `HomeMap` is a static dot-matrix Equal Earth SVG (the land dots are a lazy chunk, `map-land.ts`) with one disc per place in Radar's geo data. Devnets, a failing Radar and Decentralized only mode keep the land and say what is missing.
  - `CoreSection`: difficulty, best ChainLock, and, while Hyphen is fit, circulating supply and blockchain size (`hyQueries.metricsLatest`); the latest 12 Core blocks (`coreQueries.blockRows`, `CORE_ROWS`); 8 pending transactions from Hyphen's mempool, or, while Hyphen's index is stale or the mode is on, what DAPI's live feed delivered since the page opened (`useSeenPending`, "Seen since you opened this page"). A note says what is missing while Hyphen is behind.
  - `PlatformSection`: the latest 8 Platform transitions and 8 Platform blocks from Platform Explorer (`peQueries.latestTransactions`, `latestBlocks`), one `Unavailable` in the mode.
  - Each section names its sources once (`useSectionSources`, `SourceScope`, §7.2), and the home's marks age only when a reading has stopped arriving (`features/home/freshness.ts`, §7.3).
- **Address** (`/address/$address`, IN-06, HY-08): a new transaction shows a `role="status"` notice (`data-new-transaction`: a badge, a link, the signed amount and, while it is pending, "See unconfirmed activity") above the summary. The badge reads "Unconfirmed transaction" for a transaction DAPI reported while it was pending and "New transaction" for one the fallback found already mined. Summary (balance, unconfirmed, transactions, total received and sent, first and last seen), a QR card, an unconfirmed-activity card, the cursor-paged history and the UTXO card. Amounts use `Amount` and follow the unit setting; testnet addresses show `tDASH`. The QR code is drawn in the browser by the lazily loaded `zxing-wasm` writer, on white so any scanner reads it in either theme; the wasm is fetched only when the card renders. `useAddressActivity` runs `watchAddress` (`features/core/address/live.ts`) while the page is mounted and visible:
  - **DAPI first.** It subscribes to `coreLive.transactions(net)` and checks each decoded transaction locally (`effectOn`). Outputs paying the address count; an input counts when it spends a known output of the address: a row of the page's UTXO query, or an output of a transaction the watcher has already seen. No request is made per transaction. A `block` event drops the confirmed transactions from the pending list and invalidates the summary, history and UTXO queries. Pending entries are stamped `source: 'dapi'`, `proved: false`, with `asOf` = when the page received them.
  - **Hyphen only as the fallback.** Only while `coreLive.txStatus(net).fallbackHint` is on does it read the address's own newest 10 transactions (`hyQueries.addressTxs(…, { limit: 10 })`), every `POLL_MS.addressFallback` (30 s). Ids that appear after the first read are reported as arrivals with `confirmed: true` (Hyphen's address history holds mined transactions only, so in fallback the notice comes when the transaction is mined, without the unconfirmed link). It stops as soon as the hint clears. A transaction DAPI already reported is not reported again.
  - **Hidden tab.** It releases the DAPI subscription (the shared stream closes after its 10 s linger) and stops the fallback. On return it resubscribes and runs one resync (invalidate, then re-check each pending transaction through `hyQueries.tx`).
  - Status is `connecting | live | reconnecting | paused`; the fallback counts as `live`.
  - **What "seen" means.** The node replays the tip block and then dumps its whole mempool before it streams new transactions, with nothing to tell the two apart, so a transaction that was already pending when the page opened arrives like a new one. The page shows each as unconfirmed activity and counts them honestly: "N transactions seen since you opened this page", never "new".
  - Cost per open tab, DAPI path: one `subscribeToTransactionsWithProofs` open per stream lifetime (~590 s) plus the tip read before it, about 0.2 DAPI requests a minute, shared with any other holder; no Hyphen request to watch; three Hyphen refreshes per block (summary, first history page, UTXOs), about 1.2 a minute. Fallback: 2 Hyphen requests a minute plus the same refreshes when something new appears, and a DAPI reopen attempt every 5 minutes. A hidden tab costs nothing.
  The history is cursor-paged 25 transactions a request (`HISTORY_LIMIT`); "Show more" sends Hyphen's `nextCursor` back unchanged, which the Worker lets through (§2.7). When a later page fails, the rows already shown stay, a `role="alert"` line says "The next transactions could not be loaded." and "Try again" asks for the same page. The watcher pauses while the tab is hidden (nothing is fetched; one resync on show).
- **Freshness of the Hyphen index.** `useIndexHealth(net)` (§4.7a) runs the probe and says whether the index is behind the chain once the probe has measured it. Every page that says so uses one sentence, `useHyphenLagSentence(net, lag)` in `ui/hyphen-lag.ts`: "Hyphen’s <network> index is behind the chain: <lag detail>." (`StaleIndexNotice`, `HyphenOnlyNote` and Home's `StaleNote` add what follows from it). **Mempool** (`/mempool`, HY-19) does not read a stale index at all: while the Hyphen probe says stale, and in Decentralized only mode, the page is filled from DAPI's live transaction feed (`useSeenPending`, `data/core/seen-pending.ts`, the hook behind the home's pending column, here listing the newest 100 rows). The summary counts and sums everything the hook keeps (up to `SEEN_STORE_LIMIT`, 5,000, shown as "5,000+" once the oldest are dropped), not only the rows listed, and the table's subtitle says "The newest 100 of N" when it lists fewer than it counts. It lists the transactions this page has seen arrive, minus those since mined, under "Seen since you opened this page", with a three-figure summary (count, their size, watching since) stamped DAPI and a status line that says it is not the whole mempool. `StaleIndexNotice` (or, in the mode, a compact `Unavailable`) says once why the full list and its totals are missing. The route's prefetch follows the route-prefetch rule (§4.7a): on a first visit it waits (within the loader's deadline) for the probe, then reads Hyphen's mempool only if the index is not stale. The page shows the seen view, with no notice, until the probe has decided (`index.pending`), so Hyphen's list is never shown as live before the index is known to be current; `useSeenPending` is mounted above that switch, so the rows survive a change of the index state. With a fresh index the page is Hyphen's list and summary as before ("Refreshes every 15 seconds."). **Status → Hyphen** says "It calls its sync “synced, realtime”, but its index is behind the chain" instead of repeating the claim as a fact.
- **Block transactions on phones** (IN-03): at ≤ 640 px `BlockTxCompact` replaces the card table with one line per transaction (position, short id, amount out) and a chevron that opens its type, input and output counts, size and the full transaction link; the pager is the table's own (`Pager`, exported from `ui/data-table`). A line above says "Tap a transaction for its inputs, outputs and size".
- **Rich list on phones** (HY-09, D07). At ≤ 640 px the page renders `RichListCompact` instead of the card table: an ordered list of two-line rows (`data-rich-compact`, `data-rank`) with nothing behind a tap. Line 1 is the rank, the address as a link to its page (`Entity`, 44 px tall), the compact balance and the share of supply; line 2, smaller and in `--dh-ink-2`, reads "Received … · Sent … · N tx" (`.rx-rich-flow`, which wraps at 320 px). "Show more" and "Back to summary" (scrolls to `#concentration`) sit below. The desktop table is unchanged.
- **Chart edges** (HY-02): ECharts centres the last category label on the grid's right edge but reserves room only for the labels it measured before thinning them, so `withEdgeRoom` (`ui/chart-theme.ts`, applied by `chart-view`) keeps half the widest category label (7.6 px a character) free beside the right edge. `e2e/tests/speed-and-polish.spec.ts` reads the canvas's last pixel column on every chart at the project width and 320 px on 1 d, 1 w and 1 m.
- **Charts and network internals** (HY-02, HY-12): Network internals (HY-12) is its own Core page at `/internals` (`features/core/network/InternalsPage.tsx`), listed in the Core rail after Governance and in the palette (keywords network, peers, utxo, versions); `/charts?tab=internals` redirects to it with a replace navigation and keeps the other search parameters, and `/status` links to `/internals`. `/charts` itself has no tabs. `?range=1h|1d|1w|1m|1y|all` maps to a block count and point count for `/metrics/chart` (`all` uses the tip height and 120 points). Each metric has its own colour token (`Metric.hue` in `charts/options.ts`): hash rate `--rx-core-line` (blue), transactions `--rx-plat-line` (teal), difficulty `--dh-accent-forge-select` (ember), supply `--rx-net-line` (navy, pale blue in dark), unspent outputs `--dh-good` (green), credit pool `--rx-id-3` (cyan); the page sets `--rx-l` on a wrapper, which the chart theme reads. All six measure at least 3:1 on the card and at least 18 CIE76 ΔE apart in both themes, which an e2e test checks. ECharts loads through the kit `Chart` (lazy); each chart sits beside a data table with the same figures. Axis labels are formatted for the spacing of the ticks (`axisResolve` in `charts/options.ts`: about five ticks, half a tick as the smallest difference to tell apart),, so a series that varies by a few percent no longer shows five labels that round to the same figure. Internals shows chain size, spendable outputs, hash rate, mempool pressure (a `Meter`), transaction velocity, node version spread, masternode counts and the peers of the node Hyphen indexes from.
- **Rich list and governance** (HY-09, HY-13): the concentration chart groups the top 100 balances into rank bands 1, 2–5, 6–10, 11–25, 26–50 and 51–100 and says it covers the top 100 only. Every share on the page is Hyphen's `pctSupply`, which is the balance over `includedSupply` ("sum of positive balances included by this balances snapshot", about 12.89 M DASH on mainnet), not over the 13.17 M DASH circulating supply of `/metrics/latest`; so the top address reads 7.70 %, not 7.54 %. A `data-share-basis` note in the concentration card and above the table (`ShareBasis`, with `includedSupply` and its `asOfHeight` from the same response as the shares) says so in words: "Shares are of the 12.89 M DASH held in positive address balances at block N, not of the circulating supply shown elsewhere in Radar." Governance is read-only: "Vote in Governance" is a `LinkOut` to `https://gov.dashhq.org/p/h/<hash>` (`?network=testnet` off mainnet; §7.2) with `rel="noopener noreferrer"`; a proposal's own URL is linked only when `safeProposalUrl` accepts it (`https:` only). Proposal status is derived from Hyphen's fields, and the budget split from the same list, with no second request.
- **Tools** (IN-08, IN-11): verify message (`verify.ts`) recovers the public key from the 65-byte compact signature with `@noble/secp256k1` and `@noble/hashes`, hashes it to an address on the network its prefix names and compares; results are `valid`, `mismatch` (which address did sign) and `error` with a reason. Fields never reach the URL, storage or the network, and a field the classifier calls a secret blocks the check with a warning and is not echoed. The QR reader uses `getUserMedia` with a frame loop over the lazily loaded `zxing-wasm` reader; "Choose a picture" is the fallback. The decoded text goes through `interpretScan`: `dash:` URIs are unwrapped, text over 200 characters is refused, and anything the classifier flags as `secret` or `possible-secret` is refused without being shown or searched; the rest goes to `/search?q=`.
- **Hyphen page conventions** (`features/core/hy-shared/`): `PageFrame` (`data-page`, `data-layer="core"`, eyebrow with the network, one `h1`, document title); `HyphenGate` answers a devnet with `Empty kind="unsupported-network"` before any request (loaders skip the prefetch too), and in Decentralized only mode renders one `Unavailable` with the page's own title ("The rich list needs an indexer") in place of its children, so nothing below it mounts a query; `StaleIndexNotice` says the lag once at the top when the Hyphen probe is `stale`; `TxTypeBadge` maps Hyphen's `txType` names onto `CoreTxType`, falling back to a plain `Badge`. A cursor list is a `DataTable` with a "Show more" button; its state is `loading` while the first page is pending, `error` only when no row is shown, and `empty` when the first page has no rows.
- **Search resolvers** (HY-14): `hy-search` (`hex64`, `text`, `dpns`; cost `index`) calls Hyphen `/search` and maps address, block, transaction, validator and proposal hits (a proposal hit is named by one extra `proposal` lookup, at most five); `hy-address` (`core-address`) says "balance · N transactions" or "no activity seen" and ranks one above the local hit it enriches (a tie keeps the first hit). Both return `[]` without a request when `Classified.warning` is set, on a devnet, and (`hy-search`) when the first class is `int` or the text is under 4 characters unless it is a hash. `dapi-block` and `dapi-tx` look up heights, block hashes and txids. A resolver imports its data module with `await import()`, so the Hyphen client and its schemas stay out of the entry chunk.

### 4.9 Hyphen quirks

A cursor is opaque: send `nextCursor` back unchanged (fixture file names carry a truncated, hashed form of it). `/search` on testnet answers 503 for a height out of range, so `hy-search` skips pure numbers. An address with no activity answers 404, which the client turns into `Sourced<null>`; the page shows an empty state, not an error. Amounts are parsed to `bigint` by the schema (`zBigint`). Hyphen caches a mined transaction's `/tx` response as immutable and an address-history cursor is 358 characters (§2.7, §4.8). A transaction page cached while the transaction was in the mempool carries `asOfHeight: null`.

### 4.10 Masternode page (`/mn/$protx`, `features/network/mn/`)

One record in five tabs, `?tab=overview|network|platform|history|payments` (overview is the default and leaves the address clean; `platform` exists only for an evonode and falls back to overview otherwise). A base58 ProTx in the path is an evonode's Platform identity id: the route's `beforeLoad` redirects it to the hex ProTx (`protxFromBase58` in the route file; the route keeps its own `MN_TABS` because importing them from the `features/network` barrel would pull every network page into the entry chunk). `epoch` picks an epoch on the Platform tab; `before` is the block height the Payments window ends at.

**Sources.** The record joins Radar's crawl (`radarQueries.masternode`, stamped `radar`) and DAPI's masternode list entry (`coreQueries.masternodeList`, stamped `dapi`, §4.12). DAPI wins on validity, service, type, voting and operator keys and the Platform ports; where Radar's last crawl holds a different value the row says "Radar's last crawl differs (…)".

- **Header** (`data-masternode-header`, the record header with a copy-link button): Nodeprint, type, service as `host:port`, the full ProTx with copy, answering, PoSe state, version, the source lines, and "Vote in Governance" (`LinkOut`, §7.2). It renders from DAPI alone when Radar has nothing.
- **Overview**: KPIs (`data-masternode-kpis`), registration (`#registration`: payout, owner, voting, operator key, collateral, PoSe penalty and ban height, DAPI-joined), the uptime strip (`#uptime`) and DKG readiness (`#readiness`: an overall badge and one `li[data-check][data-state]` per check with what Radar saw, the fix and a link to the rule in Dash Core).
- **Network**: the port check (`#port-check`) with **Check now** (`CheckNow`: `radarQueries.check`, Radar's `POST …/check`, class `live`, never retried; the result or the rate-limit message, "Try again in N s", in a polite `role="status"` region), location (`#location`, "Show on map" → `/map?protx=`, hosting → `/masternodes?host=<asn>`), the speed test (`#speed-test`, `radarQueries.mnBench`) and, for an evonode, the Platform endpoints (`#platform`).
- **Platform** (evonode only): Platform rewards (`#platform-rewards`, Radar's `radarQueries.platform`), Live from Platform (`#platform-live`: the proof-checked claimable balance from `identities.balances` on the evonode's identity, blocks this epoch from `epoch.evonodesProposedBlocksByIds`, a 12-epoch comparison from `epoch.finalizedInfos`, withdrawals), the epoch record (`#epoch-record`, picker `nav[data-epoch-select]`) and the validator record (`#validator-record`: Platform Explorer's `peQueries.validator`, `validatorBlockStats`, `validatorRewardStats`). Figures combined from several proved answers are `source: 'local'`, `proved: false`, "Combined from N proof-checked answers".
- **History**: version history, registration changes, and the special transactions Hyphen has for the ProTx (`#special-txs`, `hyQueries.validator`). Hyphen is asked only while its index is fit; while it is stale the card says so once and shows the registration transaction (the ProTx hash) instead.
- **Payments** (`#payments`): the first page comes with the record; "Show more" pages back by block height (`radarQueries.payments`, 25 at a time) and keeps the place in `before`.
- **Unknown ProTx**: asks the other network and offers "Open it on testnet/mainnet", else search. Devnets get "Radar doesn't crawl devnets."
- **Decentralized only mode**: the header, the registration fields DAPI has and every SDK figure stay. Radar's crawl, Platform Explorer's record and Hyphen's history are refused (`enabled: false`), each tab shows one `Unavailable`, and "Check now" is hidden. With no DAPI entry either, the page is one `Unavailable`.

### 4.11 Decentralized only mode (`lib/source-mode.ts`, `data/endpoints.ts`, `data/query/source-mode.ts`)

A mode in which Radar asks no hosted backend for anything: not Hyphen (the edge's `/x/hy/*` pass-through and the stream behind it), not Insight, not Platform Explorer or its `/rate` price, not the Radar census API. Everything shown comes from DAPI nodes (Core gRPC-web) and the Platform SDK; what they cannot answer is shown as unavailable, never read from an index and never from a cache of one.

**The switch** (`lib/source-mode.ts`, pure, no React). The mode in force is *link OR remembered*:
- **Remembered**: `localStorage['radar.sources'] = 'decentralized'`, written by the switch on Settings and on Tools → Sources (`writeSourceMode`). Absent means all sources.
- **Link**: `?sources=decentralized` (§6.2) turns it on for the visit without remembering anything.
- `decentralizedOnly()` is the one question every gate asks. `subscribeSourceMode` tells listeners when the answer changes; `useDecentralizedOnly()` (`data/health.ts`) and `useSourceMode()` (`ui/source-mode.tsx`) are the React readings.
- Switching it off from a page (`useSetSourceMode`, used by the switches and by `Unavailable`'s "Use all sources") clears the remembered choice and drops the param with a `replace` navigation, so neither half keeps it on.

**One gate, in the data layer.** `HOSTED_SOURCES = ['radar', 'pe', 'hyphen', 'insight', 'rate']`; `sourceOff(source)` is true for those while the mode is on; `sourceInUse(net, source)` adds "and it has an endpoint on this network".
1. **Clients.** `fetchSourced` (§2.4), the one function the four HTTP clients and the rate feed share, starts with `if (sourceOff(req.source)) throw disabledByMode(req.source)`: before the URL is built, before a timer or an `AbortController`, before the health registry hears anything. `openHyphenStream` (`data/hyphen/stream.ts`) has the same first line, so no `EventSource` is opened. There is no other way from the app to those hosts: features cannot call `fetch` (§1.2).
2. **Queries and the cache.** Query keys carry the source (`[net, source, …]`, §5.1). `withDataClass` (`data/query/persister.ts`) rejects `disabled-by-mode` for a hosted key before it runs the query function or restores a persisted answer, so a remembered Hyphen page cannot paint from IndexedDB. `prefetchItem` (`data/query/loader.ts`) resolves without starting anything for a hosted key, which covers route loaders and hover prefetch.
3. **Turning it on mid-session.** `watchSourceMode(queryClient)` (`data/query/source-mode.ts`, started in `app/query-client.ts`) answers every change with `forgetSourceHealth(HOSTED_SOURCES)`, `cancelQueries()` and `resetQueries()`: in-flight hosted requests are aborted, every hosted query drops its data and its next read meets the gate, and the health registry forgets what the hosted sources said. No reload. Switching it off does the same, and the pages read their sources again.
4. **Everything that would otherwise try.** Health probes and the status page's probes are `enabled` through `sourceInUse`; route prefetch (`data/query/route-prefetch.ts`) skips hosted items; `useIndexHealth` reports `off` and probes nothing (§4.7a); `hyphenFit` is false, so the façade's Hyphen fallback and Hyphen's ChainLock claim are out (§4.7); search starts no `index` resolver (§8.2); the unit switch offers no USD and `UnitsMount` starts no rate query; the address hover card says it needs an indexer instead of asking one (block and transaction cards read DAPI). Polling stops with the queries: a query that is not enabled has no interval.

The error is `SourceError` kind `disabled-by-mode` (§2.3). It is not an outage: nothing is retried, health is not touched, and `ErrorState` renders it as `Unavailable`.

**What each page does in the mode.**

| Page | From DAPI and the SDK | Unavailable, said once |
|---|---|---|
| Home | Core height, ChainLock and headline figures; latest blocks; pending transactions as "seen since you opened this page" (`useSeenPending`); Platform height and epoch from the SDK alone (no Platform Explorer stand-in while it warms) | masternode census and map, Platform transitions |
| Blocks, blocks by date | 20 a page from DAPI; the day's height search (IN-02) | pages of 50 and 100 (a note) |
| Block | header, transactions, coinbase, ChainLock | chainwork says "Not in DAPI" |
| Transaction | everything decoded, fee and input values (`prevouts`), settlement (§4.7) | spent flags and spending transactions (one compact state in the inputs and outputs section, only for a mined transaction); first-seen time |
| Address | the live feed (`watchAddress`, §4.8), a "pending" card of what arrived while the page was open (stamped by the feed, `useLiveFeedStamp`: as of now while its stream is connected, never by a transaction's arrival), checked against DAPI for having been mined, and the QR code | balance, totals and history (one state for the page) |
| Mempool | the seen list (§4.8) | the full list and totals (compact) |
| Rich list, Charts, Network internals, Governance, Proposal | — | the whole page, once (`HyphenGate`) |
| Masternodes, Nodes, Map, Changes, Core 24 | DAPI's list on `/masternodes` and `/nodes` (§4.12–4.15) | the crawl's columns and facets; the census, map points, changes and activation tracker |
| Masternode | the header, the registration fields and Platform figures from DAPI's list and the SDK (§4.10) | one notice per tab for what needs Radar, Platform Explorer or Hyphen; the whole page only when DAPI's list has no entry either |
| Status | DAPI and SDK rows and the node pool; overall line "DAPI and the Platform SDK are answering. Hosted sources are off in Decentralized only mode." | hosted rows stay listed as "Off in this mode" (`data-state="off"`), with no probe |
| Search | local, DAPI and SDK resolvers | index lookups (compact) |
| Settings, Tools | everything; USD is disabled in the unit choice | USD prices (compact, mainnet only: the feed is not offered elsewhere) |

Platform pages keep their SDK reads in the mode; §3.5–3.12 say, page by page, what needs Platform Explorer.

The DAPI budget (§4.3) is unchanged: no page replaces an index list with a DAPI fan-out. The mempool and address views cost one shared transaction stream; the blocks pages cost what they did.

**Hosts still contacted in the mode.** Tools → Sources (`features/tools/sources/backends.ts`) lists every backend with its host, whether it is hosted by one operator, and whether it is in use, off or not offered on this network, next to the same switch. In the mode exactly these remain:

| Host | What for | Can it be avoided? |
|---|---|---|
| The page's own origin (`explorer.dashhq.org`) | The app itself: HTML, scripts, the decoder and SDK wasm, fonts, map shapes and the vendored dashhq shell (served from Radar's origin, it makes no request of its own). It sees the path of a page that is opened or reloaded directly, not in-app navigation and not what is looked up. | Only by self-hosting the build, which is static. |
| `quorums.<network>.networks.dash.org` (a devnet: its configured `quorumUrl`) | Two things. DAPI node discovery, `GET /masternodes` at most once an hour (§4.2). And the SDK's trusted context: the quorum public keys it checks proofs against. One operator (Dash Core Group) serves it. | Discovery could run from the cached list and the bundled seeds alone (`seed.<net>.json`, 30 nodes), at the price of a node set that ages between releases; it is kept because a stale node list is the likelier failure. The quorum keys cannot be dropped without a light client that derives them from Core headers and masternode-list diffs (M8, §4.4a). |
| DAPI evonodes, `https://<ip>:<port>` | Core gRPC-web (§4) and every Platform read through the SDK (§3). Many independent operators; 8 active at a time. | No: this is the decentralized source. |

Nothing else is contacted by the app: no analytics, no third-party font, script or image host. The site's edge Worker reads no hosted backend for a request with `?sources=decentralized`, so a link preview of a Decentralized only link is generic (§2.7). `e2e/tests/decentralized-mode.spec.ts` walks every route case (§10) on each of its networks in the mode and fails on a request to a hosted backend or to any host outside this table.

### 4.12 DAPI's masternode list (`data/core/mn-list.ts`, `data/core/mn-list-decode.ts`)

`core.masternodeList(net)` is the deterministic masternode list as one DAPI node reports it.
- **Decoding.** The first message of `subscribeToMasternodeList` is Dash Core's `protx diff` answer encoded as CBOR (rs-dapi writes the RPC's JSON with `ciborium`), not the P2P `mnlistdiff` the wasm decoder reads. `mn-list-decode.ts` decodes it in TypeScript: a small RFC 8949 reader (`readCbor`), a zod schema for the entries, and a DIP-4 coinbase payload reader (`readCoinbasePayload`). No wasm change and no dependency.
- **One read, memory only.** A read opens one stream, takes the first message (a full list: a diff from the zero hash) and closes it. The list is kept five minutes per network (`MN_LIST_TTL_MS`), shared by every caller and by concurrent reads (one flight per network), and dropped on a network reset. It is never persisted: a mainnet list is about 1.35 MB.
- **Checks.** Field forms, no repeated ProTx, the coinbase payload's `merkleRootMNList` equal to the diff's, and the diff's block hash equal to the header DAPI reports at the coinbase's height (one extra counted DAPI read; a node that names another block is refused and reported through `reportInvalid`, and a header that cannot be read leaves the list unchecked rather than refused). A list that fails its checks, or none in time (30 s idle, 90 s overall), is asked again of other nodes, three attempts in all.
- **Not checked.** The entries are not hashed against `merkleRootMNList`, and the coinbase is not proven against a header's merkle root, so the list is one node's claim (`proved: false`) until Core proofs arrive (§4.4a).
- **The join** (`data/masternodes/rows.ts`, rule 6). `joinMnRows(crawl, list)` and `mnRowsQuery(net)` (key `viewKeys(net, 'mn-rows')`) give one `MnRow` per masternode. DAPI's masternodes are the rows and DAPI wins on type, status, service and the registration (keys, Platform ports, Platform node ID); Radar's crawl is attached to each row it knows (reachability, version, location, DKG readiness), and `crawlDiffers` marks a row where the crawl's copy of a field DAPI wins on is different. A crawled node DAPI no longer lists is dropped. Without Radar (down, or refused in Decentralized only mode) the rows are DAPI's alone; with DAPI down they are Radar's alone; both failing raises DAPI's error when the mode refused Radar and Radar's otherwise.

### 4.13 Network census and the Core 24 tracker (Radar's crawl)

- **`/nodes`** (`features/network/nodes/`). `NodesPage` composes cards over Radar's crawl, read through `useCensus(net, scope, range, overTime)` (`census-data.ts`): `summary`, `status`, `releases`, `bench` and two `history` queries (versions over time, read only when that view is chosen, and network size). Every one is enabled only while `useCrawlAvailable(net)` says the crawl can be read (not Decentralized only mode, not a devnet). The arithmetic is in `census-math.ts` (ported from dash-nodes), chart options in `census-charts.ts`, colours from the theme (`census-colors.ts`). Scope, version view and range live in the route search (`scope`, `versions`, `days`). Census figures link to `/masternodes` with the matching `reach`, `status`, `host`, `country`, `type` or `dkg` filter. A crawl older than 45 minutes shows a stale notice (`StaleCrawl`), and a pending Core 24 activation a link to `/v24`. In the mode the page is one `Unavailable` and DAPI's own list (`DapiMasternodes`, `mnRowsQuery`); on a devnet an `Empty` and the same list.
- **`/v24`** (`features/network/v24/`). `V24Page` reads `radarQueries.activation(net)`, read again every minute (`POLL_MS.radarActivation`); in the mode, or on a devnet, it reads nothing and shows `Unavailable`; window, threshold and milestone arithmetic is in `v24-math.ts`. A reading older than 10 minutes shows a stale notice. `v24Pending(doc, now)` lives in `data/radar/schemas/activation.ts`, so the home and `/nodes` share it without a feature-to-feature import.

### 4.14 The masternode list (`/masternodes`, `features/network/masternodes/`)

- The list is `mnRowsQuery` (§4.12), filtered by `filterMnRows` (`data/masternodes/filter.ts`, the filter the map shares) and sorted by `sortMnRows`, both in the browser. The table is virtualised and puts the scroll position back on back, forward and reload (`use-scroll-restore.ts`, in `sessionStorage`), because the router restores the offset before the virtual list has its height. "Download CSV" exports the filtered rows (`data/masternodes/csv.ts`), with the crawl's columns when the crawl answered.
- The Platform view (`view=platform`) adds Radar's Platform record and Platform Explorer's active validators (`limit: 100`), and, for the evonodes in the rendered window only (at most 100 ProTx a call), the SDK's `epoch.evonodesProposedBlocksByIds`.
- Without the crawl (Radar down, or Decentralized only mode) the rows are DAPI's: the search takes ProTx or IP only, the facets are status alone and "View on map" is hidden. In the mode one compact `Unavailable` names what needs the crawl and the Platform view reads neither Radar nor Platform Explorer; with Radar down a note says so.

### 4.15 Map, changes and the Radar API page

- **`/map`** (`features/network/map/`). A MapLibre map over a self-hosted basemap (`apps/web/public/map/`: Natural Earth land and places, Noto Sans glyphs; sources in its `README.md`), so the map loads nothing from a third-party tile server or CDN. `MapView.tsx` is the only importer of `maplibre-gl`, and `MapPage` loads it through `deferred()`, so MapLibre, its CSS and its worker stay out of the entry chunk. Its worker URL passes the Trusted Types worker policy (`trustedWorkerUrl`, then `setWorkerUrl`); MapLibre's attribution control is off and the page shows its own `<details>`. Data is Radar's `masternodes` and `geo` documents (`joinMnRows(crawl, undefined)` and the shared filter); the address carries the layer, colouring, filters, hidden categories and the selected `protx`, and is replaced rather than stacked, so Back leaves the map. Clusters are mirrored by a screen-reader list (`[data-map-clusters]`). On a phone (≤ 900 px) the panel is a bottom sheet (`bottom-sheet.ts`). Reduced motion turns eased moves into jumps.
- **`/changes`** is a `DataTable` of `radarQueries.changes` with a kind filter (`?kind=`).
- **`/api`** is a static reference (`features/tools/api/endpoints.ts`) of Radar's public API with curl examples; it makes no request.
- Decentralized only mode: `/map` shows one `Unavailable` above the basemap and reads nothing from Radar; `/changes` is one `Unavailable`; `/api` still describes the API and says it is a hosted service. On a devnet `/map` is an `Empty`.

---

## 5. TanStack Query conventions

### 5.1 Query keys

```
[net, source, resource, params?]
```

- `net` first, always, so a network switch never mixes caches and `queryClient.removeQueries({ queryKey: [net] })` clears a network.
- `source` is a `SourceId` for single-source reads, or `'view'` for feature-level joins (`[net, 'view', 'mn-rows']`).
- `resource` is a kebab-case noun matching the client method (`'block'`, `'identity-balance'`, `'summary'`).
- `params` is one plain object with primitive values (TanStack hashes it stably). Omit it when there are none. Hashes are lower-case hex; IDs base58 as given.
- **View-key prefixes (§11.5).** Each M2–M6 package names its `viewKeys` resources with its own prefixes, listed in `VIEW_KEY_PREFIXES` (`data/query/keys.ts`) and tested to be disjoint: `census-` (NET-A), `mn-list-` (NET-B), `mn-page-` (NET-C), `map-` and `changes-` (NET-D), `phome-` (P-HOME), `chain-` (P-CHAIN), `pblock-` and `ptx-` (P-BLOCKS), `identity-` (P-ID), `contract-`, `document-` and `group-` (P-DATA), `token-` and `paddr-` (P-TOKEN), `vote-` and `name-` (P-VOTE), `tools-` (TOOLS), `you-` (YOU), `search-` (UNI-S), `entity-` (UNI-L), and `mn-rows` (the shared masternode join). Two packages never write one cache entry.
- Keys are built only by factories: `radarKeys`, `peKeys`, `hyKeys`, `dapiKeys`, `sdkKeys(method, args)`, plus each feature's `viewKeys`. Inline array keys fail lint (`no-restricted-syntax` on `queryKey: [`) outside `data/**/queries.ts` and `features/**/queries.ts`.

### 5.2 Data classes (`data/query/stale.ts`)

```ts
export type DataClass = 'immutable' | 'structural' | 'live' | 'tip' | 'crawl' | 'index' | 'latest' | 'rate'
export function dataClass(c: DataClass): Pick<QueryOptions, 'staleTime' | 'gcTime' | 'meta' | 'refetchInterval'>
```

| Class | staleTime | gcTime | Persisted | Polling while visible | Examples |
|---|---|---|---|---|---|
| `immutable` | ∞ | 24 h | yes | — | chainlocked block or tx, finalized epoch, historic contract version |
| `structural` | 5 min | 1 h | yes | — | contract schema, identity keys, token config, DPNS names, Radar `/masternodes/{protx}` registration |
| `live` | 30 s | 10 min | no | — | balances, nonces, `system.status`, vote state |
| `tip` | ∞ (pushed) | 10 min | no | stream; 30 s poll fallback | tip, ChainLock, latest blocks |
| `crawl` | 5 min | 30 min | no | 60 s for Radar `status` and `activation` only | Radar documents |
| `index` | 30 s | 10 min | no | — | PE/Hyphen lists and details |
| `latest` | 10 s | 5 min | no | 10 s (PE latest transitions), 15 s (mempool) | home feeds |
| `rate` | 60 s | 30 min | no | 60 s | USD rate |

- Every query carries `meta.dataClass` (spread `dataClass('live')` etc.; `meta` is `{ persist?: true; dataClass }`). `staleAfterMs(class)` is `staleTime × STALE_AGE_FACTOR (4)`, except `tip` (infinite `staleTime`), which is 20 min, and `immutable`, which never goes stale. The query client's default `persister` (`withDataClass`) stamps `SourceStamp.staleAfterMs` on every answer and on data restored from IndexedDB, and `SourceLine` turns orange at `stamp.staleAfterMs ?? STALE_AGE_MS[stamp.source]`, so a figure is judged by its class, not its source. Clients never set `staleAfterMs`; only the query layer does.
- Polling uses `refetchInterval` with `refetchIntervalInBackground: false`, so hidden tabs never poll.
- `POLL_MS.addressFallback` is 30 s: the address page's own history, read only while DAPI's transaction stream has given up (§4.8).
- `refetchOnWindowFocus` is off globally, and on for `live` and `index`.
- Retry: `retry: (n, e) => n < 2 && retryable(e)`, `retryDelay: (n, e) => e.retryAfterMs ?? 1000 * 2 ** n` (§2.3).

### 5.3 Persistence

`experimental_createQueryPersister` with an `idb-keyval` store (`radar-query`), and `serialize`/`deserialize` set to identity, so IndexedDB's structured clone keeps `bigint`, `Map` and `Uint8Array`. Only queries with `meta.persist === true` (classes `immutable` and `structural`) are persisted. `maxAge` 7 days; `buster` = app version + `SCHEMA_VERSION` (bump when any DTO or schema changes shape). Raw Core bytes have their own store (§4.5); the persister holds decoded DTOs and backend answers. `createPersister` runs `persisterGc` once on idle after boot (`gc: false` in tests). `resetNetworkCache(client, net)` (`data/query/network-cache.ts`) removes a network's queries from memory and from IndexedDB; the settings page calls it when a saved devnet is re-saved with different addresses.

### 5.4 "Index for the set, SDK for the facts" (rule 4)

```ts
// data/query/batch.ts
export function createBatcher<K, V>(opts: {
  name: string                  // also the query resource, e.g. 'identity-balance'
  source: SourceId
  maxBatch: number              // SDK: 100 (Drive's max query limit)
  windowMs?: number             // default 15
  run: (net: NetworkId, keys: K[]) => Promise<Sourced<Map<K, V | null | Error>>>
}): Batcher<K, V>

/** Backend value first; the SDK value replaces it when the batch lands. */
export function useHydratedFact<K, V>(batcher: Batcher<K, V>, key: K, backend: Fact<V> | undefined): Fact<V> | undefined
```

- Every row calls `useHydratedFact(identityBalance, row.id, { value: row.balance, stamp: pageStamp })`. Calls within the window coalesce into one `identities.balances` call per page (chunks of 100). Each key's result is written to its own query (`[net, 'sdk', 'identity-balance', { id }]`), so the entity page reuses it.
- `run` answers every key: a value, `null` (absent) or an `Error`. An `Error` rejects only that key's askers, so a chunk can fail in part (every shared batcher answers a key that is not a valid ID with its own `invalid-response` and still asks the others); a `run` that throws rejects the whole chunk. A key the result lacks rejects its askers with `invalid-response`. `keyId(key)` (exported) is a key's identity: a string as it is, an object as JSON with its names sorted.
- Hydration runs only for rows that are rendered (virtualised tables hydrate the visible window plus 20 rows).
- The six batchers of rule 4 are in `data/sdk/batchers.ts` (also `sdkBatchers`, exported from `data/sdk/queries.ts`): `identityBalance` (`identities.balances`), `tokenBalance` (`tokens.balances` and `tokens.identityBalances`, key `{ tokenId, identityId }`; one call per group, at most four at a time: per identity (`tokens.identityBalances`) when the batch holds fewer identities than tokens, otherwise per token (`tokens.balances`), so a holder list of one token is one call; a group that fails fails only its own keys), `tokenStatus` (`tokens.statuses`), `contractMeta` (`contracts.getMany`), `platformAddressInfo` (`addresses.getMany`) and `dpnsName`. `dpnsName` reads one `documents.query` on DPNS's `domain` type with `records.identity in [...]` (that index exists on mainnet and testnet), batches of 25 so a page of names fits Drive's 100-row cap, and gives an identity with several names its oldest; the name is `<label>.<parentDomainName>`, never a bare `dash.`. An identity missing from a full (100-row) page falls back to `dpns.usernames` with at most four calls in flight, and one whose call fails is unresolved (an `Error` for that key) while the names the query found stay. The DPNS contract id is `DPNS_CONTRACT` (`systemContract('dpns').id`). `useIdentityName(id)` (`features/entity`) is the hook the identity chip reads, so every `IdentityRef` shows the name once it lands.
- A batch's grouping depends on render timing, so in fixture builds a batched call with no recording of its own is composed from recordings of other groupings (`test/msw/sdk-compose.ts`, §10).
- When the SDK value differs from the backend's, the SDK value wins and the cell shows the SDK's stamp. No warning; the backend lag is normal.

### 5.5 Live updates

- Core tip, ChainLock and latest blocks come only from `coreLive` (§4.6), which writes to the cache. No component opens a stream itself.
- `features/*` that need "new rows slide in" use `useLiveList(query, { holdWhileHovered: true })`, which buffers incoming rows while the pointer is over the list (from PE).
- No feature opens Hyphen's `/stream` today. The address page uses DAPI's transaction stream and, as its fallback, the address's own history (§4.8). `data/hyphen/index.ts` and `queries.ts` don't export `openHyphenStream` or `readNdjson`; the stream is reachable only as `hyphen.stream` on the client object, kept for a live-feed fallback. Watched for five minutes while the mempool took new transactions, it sent `chain_lock`, `governance_vote`, `network` and `heartbeat` events and never `mempool_tx`, so it cannot carry a new-transaction notice.

### 5.6 Hyphen lists and lookups for features

Features may not import `data/hyphen/client.ts` or `stream.ts` (§1.2), and `hyQueries` builds single-page lists only. Three small files close the gap without loosening a zone rule:
- `pages.ts` exports `hyPages`: infinite-query options for the cursor-paged lists (`addressTxs`, `balances`, `mempoolTxs`, `proposalVotes`). Each keeps the earlier pages and chains `nextCursor`; their keys are `hyKeys(net, '<name>-pages', …)`, so a block event can invalidate them by prefix. Add a list here when a page needs "Show more".
- `lookups.ts` exports `hyLookups` (`search`, `address`, `proposal`) for search resolvers, which run outside React and have no query client.
- `fit.ts` exports `useHyphenFit(net)` (§4.7).

---

## 6. URL state

### 6.1 Serialisation

The router uses flat, readable query strings, not TanStack's default JSON encoding. `app/search.ts` provides:

```ts
export const parseSearch = (s: string): Record<string, string> => Object.fromEntries(new URLSearchParams(s))
export const stringifySearch = (o: Record<string, unknown>): string // drops undefined, '' and defaults; sorts keys; '?' prefix or ''
```

Every search value is a string in the URL. Route schemas coerce it.

| Kind | Form | Example |
|---|---|---|
| network | `network=` | absent = mainnet; `testnet`; `devnet-<name>` |
| enum | value | `view=platform` |
| multi-select | comma-joined, sorted | `type=evo,regular` |
| sort | field, `-` prefix for descending | `sort=-balance` |
| page (page-based sources) | 1-based `page`, `limit` ∈ {10, 25, 50, 100} | `page=3&limit=50` |
| cursor (cursor sources) | opaque `cursor` | `cursor=7b22…` |
| numeric range | `min..max`, either side optional | `bal=100..` |
| date range | ISO dates | `from=2026-10-01&to=2026-10-31` |
| boolean | `1`, absent = false | `banned=1` |
| text | `q` | `q=alice` |
| tab | `tab`, absent = first tab | `tab=payments` |

Hash fragments are used only for tx input and output anchors (`#in-3`, `#out-1`) and section anchors.

### 6.2 Network param

- The root route's schema owns `network` (and a legacy `net`). `parseNetworkParam` returns `{ net, redirect }`: a legacy `?net=testnet` or a bad value (treated as mainnet) triggers a `replace` navigation to the canonical URL.
- Unknown `devnet-<name>`: if it's neither built in nor among the user's saved custom devnets (localStorage `radar.devnets`), `NetworkGate` renders a setup form instead of the page. No network is remembered across visits (family rule).
- `retainSearchParams(['network'])` middleware on the root route keeps `network` on every `<Link>`, so links never drop it. Cross-network links (Radar's "exists on testnet" redirect) set it explicitly.
- `useNetwork(): NetworkId` is the only way components read it.
- **`sources`** is the root schema's second param. Its one value, `?sources=decentralized`, turns Decentralized only mode on for the visit (§4.11); any other value is dropped by a `replace` navigation. `retainSearchParams(['network', 'sources'])` keeps it on every `<Link>` like `network`, and the root route's `beforeLoad` hands it to `lib/source-mode.ts` (not on a preload, so hovering a link never changes the mode). Entity chips are plain `<a href>`; `entityHref` adds `sources=decentralized` while the address is what keeps the mode on (`withSourceMode`, `features/entity/network.ts`), so a chip opened in a new tab stays in it. A mode chosen in Settings is remembered and needs nothing in the address.
- `data/active-network.ts` keeps two readings. The *active* network follows the route being loaded (for loaders and clients, so they hit the right backend as soon as a navigation starts). The *rendered* network follows the page on screen (`AppShell` sets it through `useRenderedNetworkSync`). Anything drawn from shared state while the old page is still up (`useSourceHealth`, `useAllSourceHealth`, `useHydratedFact`) reads the rendered one, so a slow navigation never shows the old page the new network's health or SDK-hydrated values.

### 6.3 Per-route schemas

Each route file declares its schema with zod 4 (Standard Schema, passed straight to `validateSearch`). Every field has `.catch()` so a bad URL never throws, and defaults are stripped from the URL with `stripSearchParams(defaults)`:

```ts
// routes/masternodes.tsx
const defaults = { sort: '-status', view: 'list' } as const
export const masternodesSearch = z.object({
  q: z.string().optional().catch(undefined),
  type: zCsvEnum(['regular', 'evo']).optional().catch(undefined),
  status: zCsvEnum(['enabled', 'pose-banned']).optional().catch(undefined),
  reach: z.enum(['reachable', 'unreachable']).optional().catch(undefined),
  country: zCsv.optional().catch(undefined),
  sort: z.string().default(defaults.sort).catch(defaults.sort),
  view: z.enum(['list', 'platform']).default(defaults.view).catch(defaults.view),
})
export const Route = createFileRoute('/masternodes')({
  validateSearch: masternodesSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => ({ net: search.network }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(radarQueries.masternodes(parseNetworkParam(deps.net).net)),
  component: MasternodesPage,
})
```

Helpers in `lib/search-schemas.ts` (re-exported from `app/search.ts`, so `data` can use them too): `zCsv`, `zCsvEnum`, `zRange`, `zIsoDate`, `zPage`, `zLimit` (10, 25, 50, 75 or 100), `zInt`, `zHex64`, `zHex40`, `zBool01`, `zOpt`, `zDefault`, and the documents filter codec `encodeWhere`, `decodeWhere`, `zWhere` (§11.5). The route schemas below the example are all final (§11.5); a package fills the route's prefetch module and its page, never its schema. Filter changes call `navigate({ search: (s) => ({ ...s, …, page: undefined }), replace: true })`: they replace history and reset paging. Paging and tab changes push.

**Loaders** prefetch; they never block a page for long and never throw. No route may block first paint on DAPI or the SDK: on the first load of the router, a loader starts its prefetch and returns at once (`loadBehindFirstPaint`, `app/first-load.ts`) and the shell and the page's own pending state paint immediately. Later in-app navigations keep the short await below. Use `prefetchForRoute` from `@/data/query` (`data/query/loader.ts`):

```ts
export const Route = createFileRoute('/status')({
  loaderDeps: ({ search }) => ({ network: search.network, net: search.net }),
  loader: async ({ context, deps, preload }) => {
    const net = routeNetwork(deps)
    const { healthProbeItems } = await import('@/data/query/health-probes') // query modules load on demand
    return prefetchForRoute(context.queryClient, net, healthProbeItems(net), { preload })
  },
  component: StatusPage,
})
```

- An item is `prefetchItem(cost, queryOptions, flags?)`, with `cost` one of `'http' | 'dapi' | 'sdk'`. `flags.detail` marks a detail route's primary read; `flags.wait` makes the loader wait for it (otherwise it starts the fetch and the page renders from the cache as it fills).
- Gates (§4.7), enforced in `allowedItems` and failing closed if a gate throws: HTTP items always run; at most `MAX_DAPI_PREFETCH` (1) DAPI item, only for a detail route and only when `budget.canAfford`; an SDK item only when `registerSdkReadyProbe`'s probe says that network's SDK is ready (§3.3). A preload (`preload: true`, hover or intent) starts the same allowed items but awaits nothing.
- The loader waits at most `DEFAULT_LOADER_DEADLINE_MS` (1500 ms) for the `wait` items, and on the first load (above) for none. `blockPrefetch` and `txPrefetch` take the loader's `preload` flag and pass `{ priority: 'prefetch' }` to the Core read on a preload (§4.7). A failed or late prefetch leaves the query to the page, which shows its own loading and error states.
- Loaders stay in the entry chunk under `autoCodeSplitting`, so a loader imports its query factories with `await import(...)`, never at module level (a static import pulled the HTTP clients and the Core façade into the entry chunk). The item lists live in `data/query/health-probes.ts` and `data/query/route-prefetch.ts` for that reason (`homePrefetch`, `blocksPrefetch`, `blockPrefetch`, `txPrefetch`).
- Every M2–M6 route's loader is `routePrefetch('<pkg>', '<route>Prefetch')` (`app/route-loader.ts`; `<pkg>` is the lower-case package id, `p-vote`, `tools`, …): it does the `routeNetwork` / `await import` / `prefetchForRoute` / `loadBehindFirstPaint` dance above for a package's route, with the whole validated search as `loaderDeps`. The module name and export are typed (`PrefetchPackage`; a wrong name fails typecheck), and the modules load through one `import.meta.glob` of `data/query/prefetch/*.ts`, so none reaches the entry chunk. The prefetch module, `data/query/prefetch/<pkg>.ts`, exports one `Prefetch<Params, Search>` per route that lists the items to read (`[]` for a route with nothing to start early). A prefetch is optional: a module that fails to load or an item list that throws starts nothing and never fails the route. A loader that runs again for a changed search (`cause: 'stay'`) starts its items without waiting for them.
- The loader reads the network from `routeNetwork(deps)`, not from `getActiveNetwork()`, and puts `network` and `net` in `loaderDeps` so a network switch re-runs it.
- `routes` may not import `data/health-queries.ts`; the status route reaches the probes through `data/query/health-probes.ts`.

M0/M1 loaders: `/` (census, Platform Explorer, Hyphen probe), `/blocks` (Hyphen probe only; a day's rows are a DAPI list), `/block/$id` and `/tx/$txid` (the one DAPI detail read, awaited, plus the probe), `/address/$address`, `/mempool`, `/rich-list`, `/charts`, `/governance` and `/governance/$hash` (the Hyphen summary query, awaited), `/mn/$protx` (`routePrefetch('net-c', 'mnPrefetch')`; `mnPrefetch` in `data/query/prefetch/net-c.ts` lists Radar's `/masternodes/{protx}` as an `http` item with `wait`, behind first paint; it is skipped on devnets, which Radar doesn't crawl, and for a ProTx that is not 64 hex characters), `/internals` (Hyphen's metrics), `/status` (the health probes) and `/settings`. The M2–M6 routes use `routePrefetch` (above); `/search`, `/sources`, `/tools/qr`, `/tools/verify-message` and the redirects have no loader.

### 6.4 The documents query: from the address to `documents.query`

The documents browser (`/contract/$id/documents/$type`) keeps its whole state in the address: `where` (the `zWhere` codec, §11.5 (B): `field~op~value` clauses, `in` values joined by `|`), `order` (a `zList` of fields, `-` for descending), `limit`, `after` (the last document id of the page shown) and `prev` (a `zList` cursor stack: Older pushes `after` onto it, Newer pops it; `nextCursor`, `prevCursor`).
- **Checked before it is sent** (`features/platform/contract/doc-filters.ts`). `filterIndices` reads the type's indices, and `validateQuery` lists every rule a query breaks against them (17 rules, each a `Problem.rule` slug such as `skips-property`, `range-not-last`, `two-in` or `order-sequence`, shown as `data-rule`): which operator may sit on which index position, value types, `in` lists. A query Platform would refuse never reaches the SDK: the form lists the problems and disables Run, and an address that carries one shows the same list instead of results. A refusal from Platform for a query that passed is shown verbatim (`data-platform-error`).
- **Serialised for the SDK** (`planQuery` in `doc-query.ts`). `sdkWhere` turns each clause into `[field, op, value]` with the SDK's operators (`==`, `<`, `<=`, `>`, `>=`, `in`, `startsWith`) and each value into the field's type (number, boolean or text); `effectiveOrder` gives `orderBy` as `[field, 'asc' | 'desc'][]`, from `order` or, for an `in` or range clause with no order, the serving index's properties ascending; `limit` is one more than the page shows (at most Drive's 100, `DRIVE_MAX`) so `hasMore` knows whether a next page exists; `after` becomes `startAfter`.
- **DPNS.** On the DPNS `domain` type a value for `normalizedLabel` or `normalizedParentDomainName` is converted to the homograph-safe form (`homographSafe`: lower case, o→0, i and l→1) before it is sent, and the page says what it searched for.

---

## 7. UI kit API (`src/ui`, import from `@/ui`)

The architect owns names and props; the designer owns looks (`docs/RADAR-DESIGN.md`). Components take `className` only where noted, use Radix for behaviour, and never fetch.

### 7.1 Shared types (`ui/types.ts`, contract file)

```ts
export type Layer = 'core' | 'platform' | 'network' | 'neutral'
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'
export type EntityKind =
  | 'block' | 'tx' | 'address' | 'masternode' | 'evonode' | 'proposal'                // Core and network
  | 'platform-block' | 'transition' | 'identity' | 'contract' | 'document'           // Platform
  | 'token' | 'name' | 'platform-address' | 'epoch' | 'quorum' | 'group' | 'contest'
export type AmountUnit = 'DASH' | 'mDASH' | 'uDASH' | 'duffs'
export type LoadState = 'loading' | 'ready' | 'empty' | 'error'
```

### 7.2 Components

```ts
// Layout
Card: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; layer?: Layer
        source?: SourceStamp | SourceStamp[]   // renders SourceLine at the right of the card head; health greys the body
        state?: LoadState; error?: unknown; onRetry?: () => void
        id?: string                            // section anchor (copy-link icon)
        padding?: 'normal' | 'flush'; className?: string; children: ReactNode }
SectionBand: { layer: Layer; title: ReactNode; description?: ReactNode; id?: string; actions?: ReactNode; children: ReactNode }
KeyValue: { items: { label: ReactNode; value: ReactNode; source?: SourceStamp; hint?: ReactNode }[]; columns?: 1 | 2 | 3 }

// Async rendering: the one way to render a query
QueryView<T>: { query: UseQueryResult<Sourced<T>>; skeleton?: ReactNode
                isEmpty?: (data: T) => boolean; empty?: ReactNode
                children: (data: T, stamp: SourceStamp) => ReactNode }

// Figures
Stat: { label: ReactNode; value: ReactNode; unit?: ReactNode
        delta?: { value: number; period: ReactNode; goodWhen?: 'up' | 'down' | 'neither' }
        spark?: number[]; meter?: { value: number; max: number }
        href?: string; source?: SourceStamp; loading?: boolean; size?: 'md' | 'lg'; layer?: Layer
        tone?: 'neutral' | 'good' | 'warn' | 'bad' }   // status figures colour keyline and value; default neutral
Amount: { value: bigint
          kind: 'duffs' | 'credits' | { token: { decimals: number; symbol?: string } }
          unit?: AmountUnit                     // override the user preference (Core and credits)
          fiat?: boolean                        // adds the USD figure (mainnet only)
          // USD as the primary unit (mainnet, rate in) comes from useUnits().usdPrimary: "≈ $2,310 (50.0061 DASH)"
          signed?: boolean                      // +/− with tone
          compact?: boolean }                   // 1.2k DASH
Time: { ms: number; mode?: 'relative' | 'absolute' | 'both'; live?: boolean } // relative ticks when live
Badge: { tone?: Tone; icon?: ReactNode; children: ReactNode; size?: 'sm' | 'md' }
TypeBadge: { type: CoreTxType | TransitionType } // one palette for tx and transition types
Sparkline: { values: number[]; label: string /* a11y */; layer?: Layer; width?: number; height?: number; highlightLast?: boolean }
Meter: { value: number; max: number; label: ReactNode; format?: (v: number) => string
         thresholds?: { at: number; tone: Tone }[]; marker?: { at: number; label: ReactNode } }
Chart: { option: EChartsOption /* built in each feature's charts/ folder */; height: number; label: string
         table: { columns: string[]; rows: (string | number)[][] } /* a11y table equivalent, required */
         group?: string /* linked tooltips and brushing */; loading?: boolean }

// Entities and hashes
Hash: { value: string; display?: 'short' | 'full' | 'wrap'; head?: number /* 6 */; tail?: number /* 4 */; copy?: boolean /* true */ }
EntityChip: { kind: EntityKind; id: string; label?: ReactNode /* name, alias, pool */
              href?: string | false             // features pass the route; false = no link
              copy?: boolean /* true */; hover?: boolean /* true */
              size?: 'sm' | 'md'; identicon?: boolean /* default true for identity */ }
Copy: { value: string; label?: string }

// Provenance and states
SourceLine: { stamp: SourceStamp | SourceStamp[]; compact?: boolean }
Empty: { kind: 'none-yet' | 'no-match' | 'not-found' | 'unsupported-network' | 'blocked'
         title: ReactNode; body?: ReactNode; action?: ReactNode }
ErrorState: { error: unknown; source?: SourceId; onRetry?: () => void; compact?: boolean }
            // a `disabled-by-mode` error renders `Unavailable` instead: not an error, no Retry
Unavailable: { title?: ReactNode; source?: SourceId; compact?: boolean }   // Decentralized only mode's own state (§4.11)
Skeleton: { shape: 'line' | 'block' | 'stat' | 'row' | 'chip' | 'chart'; count?: number; width?: string; height?: number }
LiveDot: { state: HealthState | 'live' }

// Navigation and data
Tabs: { tabs: { id: string; label: ReactNode; count?: number; disabled?: boolean }[]
        value: string; to: (id: string) => LinkProps /* tabs are links */; layer?: Layer }
DataTable<Row>: {
  columns: ColumnDef<Row>[]                      // TanStack Table; meta below
  rows: Row[]; getRowId: (r: Row) => string
  state: LoadState; error?: unknown; onRetry?: () => void
  empty?: ReactNode; caption: string            // a11y
  sort?: { value: string; onChange: (sort: string) => void }   // URL-format sort ("-balance")
  paging?:
    | { kind: 'page'; page: number; limit: number; total?: number; to: (page: number) => LinkProps }
    | { kind: 'cursor'; next?: LinkProps; prev?: LinkProps }
    | { kind: 'infinite'; hasNext: boolean; fetchNext: () => void; fetching: boolean }
  virtual?: boolean                              // TanStack Virtual; required above 200 rows
  rowLink?: (r: Row) => LinkProps                // whole row navigates; keyboard j/k/Enter
  onCellFilter?: (columnId: string, value: string) => void // click-to-filter
  live?: { newRowIds: Set<string> }              // slide-in highlight
  phone?: 'cards' | 'scroll'                     // default 'cards'
  source?: SourceStamp | SourceStamp[] }
// a table wider than its box (useWiderThan: a ResizeObserver on both, a MutationObserver on rows, childList only)
// marks its scroll box `data-wide` and makes it a focusable region named by the caption, so it scrolls by keyboard
// column meta: { align?: 'start' | 'end'; numeric?: boolean; phone?: 'title' | 'primary' | 'secondary' | 'hidden'; phoneUnit?: string; filterable?: boolean; width?: string }
// phoneUnit: a short translated unit written after the value on a phone card (`td[data-u]::after`), where no header is shown; Core blocks uses it for "tx"

// Actions out
LinkOut: { to: LinkOutTarget; children?: ReactNode }  // secondary button, external glyph, never amber; renders nothing when linkOutUrl is null
// lib/linkouts.ts:
type LinkOutTarget =
  | { app: 'bridge'; action: 'identity' | 'name' | 'token' | 'contract' | 'platform-address'; id: string; net: NetworkId }
  | { app: 'bridge'; action: 'landing'; net: NetworkId }
  | { app: 'gov'; action: 'contest-vote'; label: string; net: NetworkId } | { app: 'gov'; action: 'proposal'; hash: string; net: NetworkId }
  | { app: 'gov'; action: 'masternodes'; net: NetworkId } | { app: 'gov'; action: 'landing'; net: NetworkId }
  | { app: 'pe'; path: string; net: NetworkId } | { app: 'hyphen'; path: string; net: NetworkId } | { app: 'insight'; path: string; net: NetworkId }
linkOutUrl(target): string | null
```

**Link-outs** (`lib/linkouts.ts`, unit-tested target by target). `linkOutUrl` returns the most specific page each app has, and `null` where the app has no page for the network (`pe`, `hyphen` and `insight` cover mainnet and testnet only), in which case `LinkOut` draws nothing.
- Governance (`https://gov.dashhq.org`, `?network=<net>` off mainnet): `proposal` → `/p/h/<hash>`, `contest-vote` → `/names/<label>`. Governance has no page per masternode (its `/masternodes` is the signed-in owner's keyring page), so the masternode page's "Vote in Governance" uses `masternodes` → `/masternodes`, the closest page. `landing` → `/`, the front page for the network (About's Governance link).
- Bridge (`https://bridge.dashhq.org/`, which redirects to bridge.thepasta.org and keeps the query; `network=<net>` is always sent, since Bridge defaults to testnet): `identity` → `?mode=topup&identity=<id>`, `name` → `?mode=dpns&identity=<id>` (`id` is the owning identity), `platform-address` → `?address=<bech32m>`. `landing` → no parameter but the network (About's Bridge link, the transition tool's "Where to act"). Bridge has no screen for one contract or one token, so `contract` → `?mode=contract` and `token` → the landing screen.
- Explorers: `pe` → `pe.dashhq.org` / `testnet.pe.dashhq.org`, `hyphen` → `hy.kw.vg` / `ts.kw.vg`, `insight` → `insight.dash.org/insight` / `insight.testnet.networks.dash.org/insight`, each followed by `path`.

**Quiet sources.** `SourceLine` collapses stamps of the same source, fallback and proof state into one badge (the oldest age). `Card` passes the sources of its header down (`SourceScope`), and a `Stat` or `KeyValue` row inside it with the same source draws no badge of its own. `Stats` (`ui/stat.tsx`) is a row of `Stat`s where only the first of each source carries a badge (it dedupes with `Children.map`, so pass keyed arrays, not Fragments). Badges lose their border and use the ink-2 colour at 12 px, weight 520 (`.rx-src`, `--dh-fs-xs`, `--dh-w-ui`), measured at 6.0:1 or better on every card surface in both themes; stale, down and proof marks keep theirs. A `Stat` value that carries an amount puts its USD companion on its own line and lets the unit wrap, so a figure never leaves its card. `useLeadSources(stamps)` (`ui/stat.tsx`) is the rule underneath: the first figure of each source speaks for it, unless a later one's height trails the newest of its source past a grace period. `useCovered()` (`ui/source-scope.tsx`) is what an enclosing `SourceScope` already names. The home builds one source line per section from it (`useSectionSources`, `features/home/Figure.tsx`).

**Lock marks** (`ui/lock-badges.tsx`, exported from `@/ui`). `ChainLockBadge({ locked, claim, unlockedLabel, size })` and `InstantSendBadge({ claim, source, size })` are the badges of the record pages and cards (`source: 'hyphen'` words the claim "recorded by Hyphen" when Hyphen stands in for DAPI; the InstantSend badge is drawn only for `instantLockView` states `claimed` and `corroborated`, so never for a transaction in a ChainLocked block); `LockMark({ locked, claim, compact })` is the small mark of lists and lanes (`.rx-lockmark`). A `claim` of `'one-node'` draws "reported by one node" instead of the lock glyph (§4.4a). The hover cards (`features/entity/cards/{tx,block}.tsx`) and the home's block list (`features/home/CoreSection.tsx`) use them; the home hero (`Hero.tsx`) reads the lock from the tip row of `coreQueries.blockRows` or the best ChainLock, else shows "ChainLock at N, reported by one node" (`data-claim="one-node"`).

- The block page's Header section keeps the page's DAPI source line. The Chainwork row's Hyphen/Insight stamp covers that row only ("This source covers this row only").
- Long input lists: each step reads each parent transaction once (`stepInputs`): a parent shared across steps is fetched in the step where it first appears, with all the outputs spent from it. If the first read fails, no input counts as loaded and "Try again" retries it before any step. The note says "Each previous transaction is a separate request", whatever source serves.

`networkName(net)` lives in `ui/network-name.ts` and is exported from `@/ui` ("Mainnet", "Testnet", "Devnet ruby"); `features/entity` re-exports it. Where a slug is needed, use the `NetworkId` itself.

### 7.3 `SourceLine` wording (i18n messages in `ui/source-labels.ts`)

| Stamp | Text | Glyph |
|---|---|---|
| `sdk`, `proved` | Proof-checked | check; opens the proof inspector |
| `sdk`, not proved | Served by DAPI · not proved | — |
| `sdk`, `fallback: 'sdk-down'` on a PE value | Indexed by Platform Explorer · proofs unavailable (age shown) | — |
| `sdk`, `fallback: 'sdk-cold'` on a PE value | Indexed by Platform Explorer · checking… | spinner |
| `dapi` | Served by DAPI | node on hover |
| `radar` | Crawled by Radar · 6 min ago | — |
| `radar`, `asOfFetched` | Fetched from Radar · 6 s ago | — |
| `pe` | Indexed by Platform Explorer · 12 s ago | — |
| `hyphen` | Indexed by Hyphen · 30 s ago | — |
| `hyphen`, `fallback` | Indexed by Hyphen · DAPI busy / DAPI unreachable | — |
| `insight` | Indexed by Insight · 12 s ago (the age is the fetch time) | — |
| `rate` | Price from {provider} via Platform Explorer | — |
| `local` | Computed in your browser | — |

Age is hidden when `immutable`. The age turns warning orange (`--dh-warn`; amber is reserved for the primary action) past the stamp's `staleAfterMs`, which the query layer sets from the data class (§5.2), and the dot follows `useSourceHealth`. `SourceLine` renders `data-source`, `data-proved` and `data-fallback` attributes, which e2e tests assert on (§10).

On the home, a mark turns stale only when a reading has stopped arriving, never because the chain was quiet (`features/home/freshness.ts`): `pushed` gives the streamed tip and best ChainLock the `tip` data class's age, `atTip` never ages a figure read at the newest block, and `agedFromRead` ages a reading stamped with its block's time from when it was read.

### 7.3a The unavailable state and the header mark (`ui/source-mode.tsx`, `shell/SourceModeMark.tsx`)

`Unavailable` is the one way Decentralized only mode (§4.11) says something is missing. It is not `Empty` (nothing is empty), not `ErrorState` (nothing failed) and not `StaleIndexNotice` (nothing is behind).

- **What it says.** A title naming what is missing and what it needs ("The rich list needs an indexer", "Masternode records need Radar's crawler"; from `source` when no title is given), then "Decentralized only mode reads only DAPI nodes and the Platform SDK.", a "Use all sources" button (`data-sources-all`, calls `useSetSourceMode`) and an "About sources" link to `/sources`. The element carries `data-unavailable="mode"` and has no `role="alert"`.
- **Two sizes.** The default is the `Empty` layout (shield tile, title, body, actions) for a page or a card whose whole content is missing. `compact` is one 40 px row (`data-compact="1"`: glyph, title, button) for a section that still shows data around it: the transaction's inputs and outputs, the mempool, search, the unit card.
- **Once per page.** A page whose whole content needs an indexer shows it once, at the top, in place of the content (`HyphenGate`, the address and masternode pages). A page that keeps DAPI data shows at most one per missing section; a table cell or a figure that needs an index is left out, not replaced by a state of its own.
- **Every `SourceLine` stays truthful.** In the mode nothing on a page carries a `hyphen`, `insight`, `pe`, `radar` or `rate` stamp; what is shown is stamped `dapi`, `sdk` or `local`. The e2e walk asserts it.
- **Header mark** (`data-source-mode="decentralized"`, `data-place`). While the mode is on, the shell bar's action slot shows a quiet link before the unit switch: a shield glyph in a 24 px outlined square, with "Decentralized only" as its accessible name. The word is never drawn there: the vendored bar switches to its compact layout as soon as its action slot grows by a word, at every width, so in the bar the mark is a glyph alone. Below 412 px the bar has no room for the glyph either (the product name would be cut, §7.6), so the bar's mark is hidden and a 28 px strip directly under the bar stands in (`place="strip"`, rendered by `AppShell`): the glyph and the words "Decentralized only", in normal flow, so it scrolls away with the page and the sticky header's height is unchanged. Both open Tools → Sources and carry a `title` that explains the mode. `SourceModeMark` is the entry-chunk part (a subscription and a `deferred()` import); the chip itself loads on first use, so the entry chunk gains nothing when the mode is off.

### 7.4 Entities and hover cards

`ui/EntityChip` renders the hover card through a registry, so `ui` never imports features:

```ts
// ui/hover-cards.ts
export function registerHoverCard(kind: EntityKind, C: ComponentType<{ id: string }>): void
```

`features/entity/register.ts` registers one card per kind at startup; each card uses the entity's cheapest source (X-06). Features render entities through `features/entity`'s `<Entity kind id label? />`, which builds the route `href` and wraps `EntityChip`. Raw `EntityChip` with a hand-built `href` is only for the kit page.

- Every card is registered through `lazyCard` (`features/entity/cards/lazy.tsx`), so a card's code and its data clients load the first time one opens, not with the entry chunk.
- On a touch screen a long press (450 ms, 10 px slop) opens the same card (`features/entity/LongPressCard.tsx`); a tap still follows the link.
- The network switch (`shell/network-switch.ts`, `switchTarget`) decides where the switch leads: the same page for a list, search or tool (less cursors and filters that name something of the network left), the same id for a record that can exist on both networks, a search for a record that belongs to one (a ProTx, a transaction, a block), and the list of its kind for a record with no counterpart (`/epoch/$n` → `/epochs`).
- An asset lock's transaction page lists the identities it funded (`features/core/tx/funded-identity.ts`): each credit output's identity id is derived (double SHA-256 of the outpoint) and asked of the SDK, at most 8 outputs.

### 7.5 Palette and kit page

- `CommandPalette` (cmdk inside a Radix dialog) is exported from `features/search`, mounted once by `shell/`, and opened with ⌘K / Ctrl+K, `/`, or `useCommandPalette().open(initialQuery?)`.
- **Kit candidates** (built inside features for now, to move into `ui/` when a second layer needs them): `CoreBand`, `RecordHeader`, `Section` and `ValueFlow` (the Core record pages' frame, `features/core/block/frame.tsx` and the tx page); an expandable table row with a details region (governance proposals); a "Show more" pager for cursor lists on `DataTable`; the `hy-shared` page frame (`PageFrame`, `HyphenGate`, `StaleIndexNotice`).
- `ui/base.ts` is the slice of the kit that app-load code imports (§1.2); a new kit export goes there only if the shell or a first-paint registry needs it.
- `/__kit` renders every component in every state, light and dark. Playwright screenshots it, and axe checks it. `ui/kit/KitPage.tsx` imports the page body (`KitContent`) only when `import.meta.env.DEV`, `VITE_DATA_MODE === 'fixtures'` or `VITE_RADAR_KIT === '1'`; a production build keeps a small stub that renders "Not found". `ui/index.ts` still exports the lazy `KitPage`, and the stub is what remains of that chunk. `pnpm check:bundle` fails if `apps/web/dist` contains the kit page.

---

### 7.6 The phone header (`shell/bar-overlay.ts`)

The vendored `<dashhq-bar>` is hash-checked and never edited. It anchors its network menu to the pill with `right: 0`, so on a phone, where the pill sits left of the theme button, the Core height and the menu button, a 200 px menu started off-screen, and its "squeeze" mode hid the selected network's name. `ShellBar` therefore adopts a second stylesheet (`BAR_OVERLAY_CSS`) into the bar's open shadow root once the element is defined; the shell keeps adopted sheets across its re-renders. On compact bars the menu is positioned against the bar row (`.netwrap` static, `.netpop` at the gutter), so it is fully visible from 320 px; in squeeze mode the network name shows again, and below 360 px the first letter only (the dot, the hollow or filled dot and the Testnet keyline still say which network), which keeps the wordmark, the pill, the theme button, the Core height and the menu button on one 320 px row. In light DOM (`radar-kit.css`), below 600 px the header Search icon is hidden (the tab bar has Search), and below 380 px the header Core height drops its connection dot (the word still appears when Live is not live). When the shell anchors `.netpop` to the bar and keeps a short network name itself, `bar-overlay.ts` goes.

### 7.7 Phone layout and legibility

- Anything fixed to the bottom of the viewport on a phone clears the tab bar by `var(--dh-tabs-h)` (57 px plus the safe-area inset, published on `<html>` by the shell). Page content clears it through the footer's padding; a form's action row uses `.rx-form-actions`, which is `position: sticky; bottom: var(--dh-tabs-h)` at ≤ 640 px, so its buttons are in reach whatever the screen's height (IN-08).
- On a phone, stat grids that sit above a chart or a list use `.rx-statgrid`: two columns of flat figures (no box per stat, 18 px values, 16 px at ≤ 360 px), so the first chart starts in the first 390×844 screen (Charts' "Now", Network internals' chain state and mempool pair; HY-02, HY-12). Desktop keeps the boxed grid.
- A hash shown as page metadata passes `phoneShort` to `Hash` (block merkle root and chainwork, payload roots): at ≤ 640 px it reads `8…6`, with the full value in the title and the copy button, and a tap opens it whole (`.rx-hash-toggle`, `aria-expanded`). The page's own hash (`display="full"`) is never cut (IN-03, IN-05).
- A tool that answers a form (Verify message) scrolls its result into view with `scrollIntoView({ block: 'nearest' })` and keeps `scroll-margin-block-end` above the tab bar (`.rx-verify-result`); the result sits in a polite `role="status"` region that exists before the answer (IN-08).
- A header connection state that is not "live" is a mark (ring while retrying or slow, solid dot once stopped) at ≤ 430 px instead of a word, so the brand never shrinks; the word stays in the link's title and the live region (HY-18, IN-15).
- The shell's footer slot forces `display: inline`, margin, padding, font and colour on every direct child, so the footer's links, shortcuts button and language select sit inside one wrapper (`.rx-foot`) that the slot doesn't touch.
- Dark `--dh-ink-2` is overridden in `styles/radar-tokens.css` to `#b0c6d4` (9.6:1 on the card, 7.5:1 on a chip) and `#b8d2e2` on the plate (7.6:1 on its middle step); the vendored `#8fa7b6` measured 6.8:1, AA but weak for 12 px captions. Chart axis labels read the same token and are 13 px. The legibility e2e test measures every small text node's contrast in both themes (AA) and `--dh-ink-2` against every ground (≥ 7:1 in dark).
- **Unit switch** (IN-12, HY-16): `shell/UnitSwitch.tsx` is a native `<select>` over the same remembered preference Settings writes (`writeUnitPreference`). From 641 px it sits in the header's actions slot before the Core tip (`.rx-unit--bar`); below that the header has no room, so the same control sits on its own line right under the section rail (`.rx-unit--rail`, `SectionNav`), in the gap the rail's bottom margin used to leave, so the rail keeps its full width and costs a phone no height. The `<select>` there is 44 px tall (width 86 px): the visible 26 px chip is the label's `::before`, and the lower 18 px of the select lie over the empty top padding of the page below (`z-index: 1`, margin-bottom −16 px), so the touch target is 44 px without taking back height; an e2e check walks six phone pages to prove nothing tappable sits under that overlap. USD is disabled off mainnet. It adds no new message (the label is Settings' "Unit for amounts") and almost no entry-chunk size.
- **Section rail** (HY-18): `SectionNav` marks which ends of the rail have more links (`data-more-start`, `data-more-end`, from scroll and a `ResizeObserver`) and the stylesheet fades exactly those with a mask, and the current page is scrolled to the middle of the rail on mount and on a route change, so no label looks cut without a cue.
- **Amount columns** (IN-14): in the input and output tables, from 641 px, the unit moves into the Amount column header (`.rx-colunit`; the amounts drop their `.rx-u` unless USD leads) so the figures share a right edge, the state column has its own left padding and a gap after the chip, and it wraps instead of pushing the table out of its card. Cards on a phone keep the unit on each amount.
- **Sources on phones** (HY-12): at ≤ 640 px `SourcesCard` lists each source as its name, a state chip, the health sentence with its lag (`data-source-lag`) and what the backend reports with its heights (`data-source-sync`, with its source line), then a `<details>` whose summary is the median answer time; it holds the source's role and any probe error, and is open by itself when the source is down, behind, degraded or slow (IN-09). Desktop keeps the three-column rows.
- **Section index** (IN-03, IN-05): the block and transaction pages put `SectionIndex` (`features/core/block/frame.tsx`) at the top of the page container, directly after the record header band: a `<nav aria-label="On this page">` with one anchor per section the page renders (transaction: Payload when it has one, Value, Settlement, Inputs and outputs, Raw data; block: Header, Coinbase when it has one, Transactions). It is one row that scrolls sideways, hidden by CSS above 640 px, not sticky. Sections and the raw-data `<details>` carry `scroll-margin-top`, and at ≤ 640 px `.rx-sec` spacing drops from 40 to 28 px; no `SourceLine` is hidden.
- Settings explains the selected unit once: "Amounts show in {unit}…" and "USD … follows the amount in {unit}" for DASH units, "USD comes first, with the DASH figure after it…" when USD is selected.

### 7.8 Query state (`ui/query-state.ts`)

- `queryView(query, after?)` gives a `Card` or `DataTable` its `{ state, error, onRetry }`: loading until the query has an answer, an error only when nothing is left to show. A query that waits for another names it as `after`; when that one failed with no data, this one never starts, so its failure is shown and Retry retries it.
- `stampsOf(...answers)` is the stamps of the answers that have arrived, for a card drawn from several.
- `useAfterIdle()` is true after the browser's first idle moment; pages enable their SDK reads with it so loading the SDK never competes with first paint (§3.3).

### 7.9 Proof inspector, diagnostics and the You drawer

- **Seams in `ui/`.** `ui/proof.ts`: the Proof-checked mark calls `openProofInspector(proof)`; `ProofInspector` registers itself with `registerProofInspector`, and until it does, `app/global-mounts.tsx` has said how to load it (`onProofInspectorNeeded`), so the first click loads it and is carried out once it registers. `ui/diagnostics.ts`: `openDiagnosticsDrawer()` opens the drawer for a page outside the You features (the status page's Diagnostics button); a request made before `registerDiagnosticsOpener` is kept and carried out when it registers.
- **Mounts.** `GlobalMounts` (`app/global-mounts.tsx`) mounts `proof`, `diagnostics` and `update`, each loaded on first use. It imports `features/you/boot.ts` after the shell renders; `installYou` sets each panel's loader (`panels.ts`, plain state with no React), registers the diagnostics opener, puts the viewer's own labels over the well-known names, and installs the shortcuts: Alt+Shift+P toggles the proof inspector and Alt+Shift+D the diagnostics drawer, read from `e.code` so they work on any layout, ignored in a text field, and each can be turned off in Settings' developer card (`radar.dev`).
- **Proof inspector** (`features/you/proof/`). Reads `data/sdk/proof-store.ts`, an LRU of the last 300 full proofs; it opens on one proof or on the list of all held. "Export evidence" (one proof) or "Export all" writes `radar-proof-evidence` version 1 JSON (`evidence.ts`): per proof the network, method, arguments, node, Platform and Core heights, epoch, time, protocol version, chain id, quorum, signature and the GroveDB proof bytes.
- **Diagnostics drawer** (`features/you/diagnostics/`). The requests this tab made, newest first, from `data/query-log.ts` (the last 100 source calls), with a Clear button.

## 8. Search

### 8.1 Classifier (`features/search/classify.ts`)

Pure function, table-tested: `classify(input: string, net: NetworkId, tip?: { core?: number; platform?: number; epoch?: number }): Classified`.

```ts
export type InputClass =
  | 'int'              // ^\d{1,9}$ → Core height, Platform height, epoch index (each if within range)
  | 'hex64'            // block hash, txid, ProTx, Platform block hash, transition hash, proposal hash
  | 'hex40'            // public-key hash → identity lookup
  | 'base58-id'        // 43–44 base58 chars (32 bytes) → identity, contract, token, document, validator identity
  | 'core-address'     // base58check, versions 0x4c/0x10 mainnet, 0x8c/0x13 testnet
  | 'platform-address' // bech32m, HRP dash (mainnet) / tdash (testnet)
  | 'ip'               // IPv4/IPv6 with optional :port → masternode by service address
  | 'date'             // YYYY-MM-DD → blocks on that day
  | 'dpns'             // ^[a-z0-9-]{3,63}(\.dash)?$ (case-insensitive) → name; also prefix candidate
  | 'text'             // anything else ≥ 2 chars → contract/token names, DPNS prefix

export interface Classified {
  raw: string
  normalized: string            // trimmed; hex lower-cased; '.dash' kept for dpns
  classes: InputClass[]         // priority order; one input may have several ("1234" is 'int' then 'dpns')
  networkHint?: NetworkId       // address prefix or HRP that names another network
  warning?: 'secret' | 'possible-secret' // §8.3; `secret` has no classes and an empty `normalized`
}
```

A `networkHint` different from the current network produces one hit, "This is a testnet address · open on testnet", linking with `network=` set. Resolvers on the current network are skipped for that input.

### 8.2 Resolvers and fan-out

```ts
export interface SearchHit {
  kind: EntityKind; id: string
  title: ReactNode; subtitle?: ReactNode
  href: LinkProps
  stamp: SourceStamp
  rank: number                  // 100 exact by ID/hash, 80 exact name, 50 prefix, 20 text
}
export interface Resolver {
  id: string                    // 'dapi-block', 'dapi-tx', 'pe-search', 'hy-search', 'sdk-identity', …
  accepts: InputClass[]
  cost: 'local' | 'index' | 'dapi' | 'sdk'
  what?: MessageDescriptor      // what it finds ("Platform blocks"); named when the lookup could not run
  waitsForTip?: boolean         // held back while a chain tip is still being read
  resolve(c: Classified, ctx: { net: NetworkId; signal: AbortSignal; tip?: Tip }): Promise<SearchHit[]>
}
export function useSearch(q: string, opts: { mode: 'palette' | 'page' }): {
  hits: SearchHit[]             // merged (mergeHits), best first; equal ranks keep the registry's order
  pending: string[]             // resolver ids still running
  pendingLocal: string[]        // the pending `local` ones
  failed: { id: string; error: SourceError }[]
  skipped: string[]             // index lookups left out in Decentralized only mode
  classified: Classified
}
```

- **Fan-out.** All resolvers that accept any of the input's classes start in parallel under one `AbortController`. A new keystroke (150 ms debounce in the palette) aborts the previous run. Each resolver has a 4 s timeout. Hits stream into the list as each resolver settles, and one failing resolver never hides another's hits.
- **Cost gates.**
  - `dapi` resolvers run only if `budget.canAfford(net, 1)`; under pressure, `hex64` relies on PE and Hyphen search.
  - `sdk` resolvers run in the palette only once the SDK is `ready` (the palette warms it on open); on `/search` they always run.
  - `index` resolvers are not started in Decentralized only mode (§4.11). `useSearch` reports `skipped: true` when it left any out, and the search page then says once, in a compact `Unavailable`, that lookups in an index were skipped and matches may be missing. `local`, `dapi` and `sdk` resolvers run as usual, so a typed height, hash, txid or address still opens its page.
  - `local` resolvers (heights, dates, address and key-hash shapes, name guesses) always run. An IP typed in the box is an `index` resolver over Radar's masternode list (`radar-masternode`, via `radarLookups`), which links each match to `/mn/<protx>`.
- **Enter.** Enter acts only after every `local` resolver has settled; remote resolvers get at most 300 ms (`ENTER_GRACE_MS`) after Enter. Then: the best hit if its rank is 100 or more; otherwise, for a typed height, the Core block; otherwise `/search?q=`. A typed height, hash, txid or address therefore always opens its page. Arrow keys cancel a pending Enter.
- **Speculative hits.** A hit may be `speculative`: a reading of the input that no source confirmed (today the local ".dash name" guess). The search page and the palette list confirmed hits by group and show speculative ones apart, under "A guess, not a result", with a "Guess" badge; when nothing is confirmed the page says "No match for “…” on <network>". A confirmed hit for the same entity replaces the guess.
- **Pages in the palette.** `matchPages` (`features/search/pages.ts`) ranks `SITE_MAP.filter((p) => p.nav)` by title, then keywords, then section name, and shows a short featured list for an empty query. Every route renders its page, so no hit or page is withheld; a site-map page without a route case fails `e2e/tests/integration.spec.ts` (§10).
- **Resolvers.** `features/search/resolvers/index.ts` is the registry, one file per resolver. Core: `local-height`, `local-date`, `local-core-address`, `local-public-key-hash`, `local-name` (the ".dash name" guess), `dapi-block`, `dapi-tx`, `hy-search`, `hy-address`, `radar-masternode-address` (§4.8). Platform: `local-platform-address`, `local-well-known` (the `lib/well-known.ts` table), `sdk-epoch`, `pe-platform-block`, `sdk-transition`, `sdk-identity`, `sdk-contract`, `sdk-token`, `sdk-document` (a `contract/type/id` paste only), `sdk-dpns-name`, `pe-search` (one Platform Explorer `/search` request, grouped by kind and de-duplicated) and `dapi-masternode` (DAPI's masternode list, §4.12; it answers only in Decentralized only mode, where Radar's and Hyphen's lookups are off). Resolvers load their data modules with `await import()` inside `resolve` (`fetchLookup` in `resolvers/helpers.ts` runs a `peQueries` factory once on a client that keeps nothing), so nothing they read joins the entry chunk.
- **Merge** (`mergeHits`). One hit per `kind:id`; the higher rank wins, and at equal rank a proved stamp replaces an unproved one. An evonode and a masternode with the same ProTx are one hit (the evonode wins at equal rank).
- **Chain tips** (`features/search/tip.ts`). `useSearchTip(net, mode)` reads the Core tip (`coreQueries.tip`) and the Platform height and epoch (`platformTipQuery`, one proof-checked `getEpochsInfo`) from the queries the pages already share, loading both factories with `import()` (a static import added 46 kB gzipped to the entry chunk), and publishes them to `searchEnv.tip(net)` (`features/search/env.ts`). With them, `local-height` offers a number as a Core block, Platform block or epoch only up to that tip (`classify` drops `int` once all three tips are known and the number is past them), and `sdk-epoch` and `pe-platform-block` ask their source only while the tip is unknown. Resolvers marked `waitsForTip` (`sdk-epoch`, `pe-platform-block`) are held back while a tip is still being read, so a number never fires a burst of lookups. In the palette the Platform read starts only once the SDK is ready, so typing never starts the SDK by itself. On `/search`, a Platform tip that could not be read is reported as a failed lookup (`failed` gets `{ id: 'platform-tip' }`), so the page says why Platform heights and epochs are missing instead of quietly leaving them out.

### 8.3 Secrets in the search box

Two warnings exist.

- `secret`: an extended private key (`xprv`, `tprv`, `drkv`, `drkp`), a WIF, or a run of 12 or more consecutive BIP39 English words. For this check `classify()` tokenises on any non-letter, so quotes, brackets, numbering, commas, hyphens, slashes and line breaks around a phrase don't hide it. A `secret` has no classes and an empty `normalized`.
- `possible-secret`: a run of 5 or more consecutive tokens in which at most one token is not a BIP39 English word (a final token of 2 or more letters that is a prefix of a BIP39 word counts as a word, since it is still being typed), or 12 or more consecutive letter-only tokens of any language (the non-English wordlists: accented Spanish and French, Japanese with ideographic spaces, Chinese written with spaces). Tokens are separated only by whitespace, commas, semicolons, quotes and brackets. Hyphens and dots join a token into one word, so `game-zone-arena.dash` and `happy-cat-dog` are never phrases, and anything that parses as a DPNS name is never `possible-secret`. Three or four BIP39 words ("Gold Coin Token", "real estate token", "world cup ticket") are ordinary text. The input keeps its normal classes.

Why 5: four leaked words of a 12-word phrase leave about 88 bits unknown, so a threshold of 5 bounds what a debounced remote search can ever receive, and it still lets real names through.

For both warnings:
- The value never reaches the URL, `document.title`, history, or any resolver that sends anything off the device. `planResolvers` keeps only `cost: 'local'` resolvers for a flagged input, so pure parsing and local exact matches still answer, and every `index`, `dapi` and `sdk` resolver (the future `pe-search`, `hy-search`, `dpns-prefix`) never receives it. Keep it that way.
- Nothing clears the search box. The notice appears in place, live as the text changes, and the text stays so the user can fix it. The form and the palette's Enter do nothing while it is flagged.
- A `/search?q=<value>` link loads, then replaces its own history entry with `/search`; the notice is kept in the entry's `state`, not the URL. The box stays empty because the text came from a link, not from the user. By then the original URL has already reached the browser's global history and the edge request log, which the client can't undo.

Known gaps:
- A raw 64-hex or base64 private key can't be told apart from a hash or an ID, so it isn't detected. A 64-hex value is classified `hex64` and searched like any block or transaction hash.
- Chinese written without spaces is one token and isn't detected as a partial phrase. Segmenting it would be guesswork, so it is left undetected rather than guessed at.
- A numbered list ("1. abandon 2. ability …") breaks the run at each number, so only the 12-word `secret` rule catches it.
- An ordinary English sentence of 12 or more words, with no hyphenated or punctuated word, is flagged by the non-English rule.

The English wordlist (6 kB gzipped, `features/search/bip39-words.ts`) loads in its own chunk right after the entry (`wordlist.ts`). Until it has arrived the classifier fails closed: 5 or more tokens read as `possible-secret`, 12 or more letter tokens as `secret`. Components that memoise a classification call `useWordlistLoaded()` so it is redone when the list lands.

---

## 9. i18n, units, errors and empty states

### 9.1 i18n (Lingui 5)

- `@lingui/vite-plugin` + `@lingui/babel-plugin-lingui-macro` (through `@vitejs/plugin-react`'s babel option). Source strings are marked with the macros `t` and `plural` (from `@lingui/core/macro`), `useLingui` (from `@lingui/react/macro`), `<Trans>`, and `msg` for module-level constants (rendered with `i18n._(descriptor)`), with ICU syntax. No string concatenation of translatable text.
- Source locale `en`. Ten locales ship, the union of Insight's and Hyphen's: `en, de, fr, es, pt, ja, zh, ru, tr, uk`; `LOCALES` in `src/i18n/locales.ts` is the list and the language menu shows each in its own script. Catalogues: `src/i18n/locales/<locale>/<catalog>.po`, compiled at build: one per package named for its lower-case id (`net-a.po`, `p-blocks.po`, `uni-l.po`, `tools.po`, `you.po`, …) and the base `messages.po`. **No catalogue is in the entry chunk**: every one, `en` included, loads as its own chunk as one chunk per locale: `locales/<code>/index.ts` eagerly imports that locale's `*.po` files and exports them merged, `i18n/index.ts` loads it through `import.meta.glob('./locales/*/index.ts')`, and `AVAILABLE_LOCALES` lists the locales that have one, and `main.tsx` waits for `i18nReady` (the visitor's locale, falling back to `en`) before it renders, so message ids never flash.
- **Per-package catalogs.** `lingui.config.ts` has a `PACKAGES` table: the directories (or files) whose strings go to each package's catalog, as in the ownership table of §11.5. The base `messages.po` takes everything else (`include: ['<rootDir>/src']` less every claimed path). A package's strings live in its own directories and so in its own catalogs; everything no package claims (`ui/`, most of `app/`, `data/` and `lib/`, the Core pages, `features/tools/` outside the package tools) goes to the base `messages.po`. A string used by two packages belongs to the one whose directory holds the code. A message that appears in two catalogs must read the same in both, so a changed translation is changed in every catalog that has it. Keeping each package's strings in its own `<pkg>.po` keeps the ten locale files from conflicting on every change. A file in a package's directory that belongs to another package is listed in `BELONGS_ELSEWHERE`, and `lingui.config.ts` also names single files (UNI-L's `ui/link-out.tsx` and `lib/linkouts.ts`). The proper names of `lib/well-known.ts` are not translated and so are in no catalog. `activateLocale` ignores a load that a later call has overtaken, so quick locale changes end on the last one asked for.
- `pnpm i18n:extract` rewrites `apps/web/src/i18n/locales/*/*.po`; commit the result. `pnpm i18n:check` (`scripts/check-i18n.mjs`, CI, after lint) runs `lingui extract --clean` and fails if any catalogue changed, a locale has no catalogue or lacks one of `en`'s, a message reads differently in two catalogues, any message has no translation or a fuzzy flag, a translation's placeholders or tags differ from the source, or a plural message lacks a category its locale needs (`one`/`other` for en, de, fr, es, pt, tr; `other` only for ja and zh; `one`/`few`/`many`/`other` for ru and uk). Adding a locale is data only: add `{ code, name }` to `LOCALES`, copy another locale's `index.ts` into `locales/<code>/`, run `pnpm i18n:extract`, translate `locales/<code>/*.po`, commit; the language menu lists a locale only when its catalogue exists in the build. Hashes, IDs and amounts are never translated; the number and date locale follows the language. A change that adds a string needs all nine translations in the same commit (workflow in `CONTRIBUTING.md`).
- **Marking rules.** In `src/ui` use the global `t` from `@lingui/core/macro`, because the ui tests render without an `I18nProvider`; elsewhere in components `useLingui()` from `@lingui/react/macro`. Tables of labels at module level (`ENTITY_LABELS`, the site map, section labels) hold `msg` descriptors and are rendered through helpers (`entityLabel()`, `pageTitle()`, `pageSummary()`, `sectionLabel()`, `sourceLabel()`, `recordLabel()`, `labelOf()`) that call `i18n._()` at render time; `matchPages` in `features/search/pages.ts` still matches the English titles and keywords. Lists of names use `Intl.ListFormat`.
- **Switching language.** `LanguageSelect` (a native `<select>`) sits in the shell footer (`ShellFooter.tsx`) and in Settings. It saves the choice and sets `<html lang>`. `AppShell` renders the routed `<main>` with `key={locale}`, so a switch remounts the page; without it a component that read the global `t` during render would keep its old text until some other re-render. Text computed outside React, such as the `lag.detail` of a health probe, is translated when it is produced and does not change on a switch until the next probe.
- **Message contexts.** A short English word that is translated differently by what it describes carries a `context` (`msgctxt`), which names the thing, not the page: "Active" (count of active validators, evonode state, group actions filter, identity key status, token status, upgrade state, contest status), "Funded by" (identity funding, transition funding), "Newest first" / "Oldest first" (list of blocks, list of tokens, list of contests), "Pooling" (field of a decoded transition, withdrawal pooling), "Queued" (evonode state, withdrawal status) and "Verified" (proof check, quorum is verified). `i18n/i18n.test.ts` checks that the gendered forms differ where they must.
- **Not translated:** the kit page (`/__kit`) and dev-only text.
- **Plurals.** Russian and Ukrainian need `few` and `many` forms; the catalogue lists each ICU plural with the categories its locale requires, and the check rejects a message that omits one.
- Locale choice: `localStorage` `radar.locale`, else the first match in `navigator.languages`, else `en`. `<html lang>` follows it.
- Formatting goes only through `lib/format.ts` (`formatNumber`, `formatInt`, `formatPercent`, `formatBytes`, `formatDuration`, `formatDate`), built on `Intl` with the active locale. Hashes, IDs and heights are never localised (heights get grouping separators; hashes don't).
- Times: absolute times in the viewer's time zone with the zone abbreviation; the tooltip always shows ISO UTC. Settings has a "Show times in UTC" switch (`radar.utc`).

### 9.2 Units and fiat (`lib/units.ts`)

- Base units are `bigint` throughout: duffs (1 DASH = 10⁸), credits (1 DASH = 10¹¹), token base units with the token's decimals.
- Display unit preference `radar.unit` ∈ `AmountUnit` (default `DASH`) applies to Core amounts and credits shown as DASH. Credits also show their raw count on hover. Testnet labels the unit `tDASH` (and `tmDASH`, …).
- Fiat: USD only, from `rate`, rounded to three significant figures (family PRICE rule). By default it follows the DASH figure; the unit setting can make USD the lead (below). Testnet and devnets show no fiat.
- **USD as the primary unit.** `radar.unit` also stores `USD` (`UnitChoice = DisplayUnit | 'USD'`); `denomination(choice)` gives the Dash denomination to draw DASH figures in (DASH when USD leads). `UnitsValue` gains `usdPrimary` (USD chosen, mainnet, rate in) and `rate` (`provider`, `stamp`). Until the rate arrives, and on testnet and devnets, amounts show in DASH while the stored choice stays; `UnitsValue.unit` is always a Dash denomination, so pages that format amounts themselves (`formatAmountText`) keep working. `Amount` with `usdPrimary` reads `≈ $2,310 (50.0061 DASH)` (`signed` gives `≈ +$…`); token amounts and non-Dash kinds are unchanged, and charts keep their DASH axes. Whenever USD leads, the footer's `RateNote` says `USD at ≈ $47.1 per DASH, from <provider>.` with a `SourceLine` carrying the rate's age, and Settings shows the same under the unit control.
- **Value and unit.** One no-break space (U+00A0, `UNIT_GAP` and `withUnit()` in `lib/format.ts`) joins a value to its unit in every locale, in the text and not in a margin, so copied text, screen readers, `innerText` and search all read "0.0900 DASH". `Amount` draws it inside `.rx-u`, `Stat`'s `unit` prop adds it itself, and `formatBytes` and the Core pages that write a unit use `withUnit`.
- Conversion and formatting are integer-exact (`bigint` division with remainder), and unit-tested against Hyphen's and Insight's renderings.
- `lib/units.ts` holds `DISPLAY_UNITS` (`DASH | mDASH | uDASH | duffs`), `formatAmountText` and `formatAmountParts`, and the preference store (`radar.unit`, `radar.fiat` in `localStorage`; `getUnitPrefs`, `subscribeUnitPrefs`, `writeUnitPreference`, `writeFiatPreference`). Fiat is three significant figures with `< $0.000001` for dust, never on testnet or devnets (their units read `tDASH` and so on). Negative, zero, dust and huge values are tested.
- `app/units-mount.tsx` provides the unit, the testnet flag and the USD rate to `Amount`; the rate query loads only on mainnet with USD on (`app/fiat-rate.tsx`, lazy). Settings (`features/you/settings`) holds units, fiat, UTC, language and devnets; the devnet store is injected through `app/settings-route.tsx`.

### 9.3 Error and empty-state conventions

Every query renders through `QueryView` or `DataTable`'s `state`, so each has the four states. Copy is sentence case and plain:
- **Error** names the source and what still works: "Platform Explorer isn't answering (last good 4 min ago). The rest of this page still works." It offers Retry when the error is retryable.
- **Not found** says where Radar looked and on which network, and offers the other network when the input's shape fits both: "No block with this hash on mainnet. Search testnet?"
- **Blocked** (`Empty kind="blocked"`) is for a source that is up but too stale to answer, with its lag: "Hyphen's testnet index stopped at block 1,577,999 on 23 Oct. Address history on testnet will return when it catches up."
- **Unsupported network** names the missing source: "Platform Explorer doesn't index devnets."
- **None yet** is for lists that are legitimately empty ("No transactions in the mempool right now").

No page-level error unless the route itself can't render (bad route param after validation). One failed source never blanks a page.

### 9.4 Offline and updates (`sw/`, `app/sw-register.ts`, `features/you/update/`)

- **What the worker does** (`sw/sw-core.ts`, `sw/sw.ts`, emitted as `/sw.js?v=<build>`). It touches only same-origin GETs: a page navigation is network first, and the build's hashed files under `/assets/` are cache first. No other request, so no API answer, is stored or served. Install precaches the app shell and every asset its HTML names, all or nothing, in `radar-v1:<build>`; activate drops every other build's cache. A failed navigation to `/saved`, `/settings` or `/about` gets the cached shell; any other gets the offline page (`sw/offline-page.ts`): plain HTML in the ten languages, with no app script, listing the saved items from `localStorage` through `textContent`.
- **Registration** (`app/sw-register.ts`, called from `main.tsx` after first paint). On in production builds, off in dev servers and fixture builds; `localStorage['radar.sw']` = `on` forces it on, `off` unregisters it and deletes its caches. The script URL passes the Trusted Types worker policy and is registered with `updateViaCache: 'none'`. It checks for a new build every 30 minutes and when the tab becomes visible (at most every 5 minutes). A blocked registration is ignored: Radar works without a worker.
- **Updates.** A new worker waits; it never takes over a tab by itself. A waiting worker of this page's own build is told to `skip-waiting` quietly; one of another build raises `offerUpdate` (`features/you/update/update-state.ts`, plain state), which loads `UpdateNotice` through the `update` mount (§7.9). "Reload" posts `skip-waiting` and reloads on `controllerchange` (or after 5 s); dismissing hides the notice until the next page load.

---

## 10. Testing

| Layer | Tool | Where | Runs in |
|---|---|---|---|
| Unit | Vitest + Testing Library | `src/**/*.test.ts(x)` beside the code | `pnpm test` |
| Schema | Vitest over recorded fixtures | `data/<source>/schemas.test.ts` | `pnpm test` |
| Story e2e (fixtures) | Playwright, fixture build | `e2e/tests/<group>.spec.ts` | `pnpm e2e:fixtures` |
| Live smoke | Playwright, live build | same files, tests tagged `@live` | `pnpm e2e:live` |
| a11y | `@axe-core/playwright` via `expectAccessible(page)` | every story test | both |
| Decoder | `node --test` vectors; `cargo test` | `packages/core-decode` | `pnpm test` (wasm, against the committed `dist/`, no Rust); the `core-decode` CI job (`pnpm --filter @radar/core-decode test:rust` and the `dist/` diff) |

**Fixtures.**
- `review/fixtures.mjs` rewrites `review/fixtures/{mainnet,testnet}.json`. Besides the picked entities it adds `entities.signed_message` = `{ id, address, message, signature, altered_message }` from the first vector in `features/tools/verify-message/dashcore-vectors.json` (a signature made by Dash Core's `signmessagewithprivkey` on a throwaway regtest key; `altered_message` is the message plus "!"). It verifies valid in Radar and on Insight for the message and invalid for the altered one; the IN-08 story refers to it as `{signed_message}`. It also keeps `entities.special_txs`, one hand-chosen transaction of each special type (`proregtx`, `proupservtx`, `proupregtx`, `uprevtx`, `qctx`, `assetlock`, `assetunlock`, `cbtx`, and `mnhf` on testnet only, where one exists), which a regeneration copies from the committed file; the HY-07 story names each as `{special_txs.<type>}`.
- `scripts/record-fixtures.mjs --net mainnet|testnet` reads `review/fixtures/<net>.json` (the picked entities, §5.4 of the plan) and records:
  - HTTP sources as `apps/web/src/test/fixtures/http/<source>/<net>/<slug>.json`: `{ request: { method, url }, recordedAt, status, headers, body }`. MSW handlers in `src/test/msw/handlers/<source>.ts` serve them by URL (query string normalised).
  - DAPI by `scripts/record-dapi-fixtures.mjs --net mainnet|testnet`, which runs the Core façade against live seed nodes (`data/dapi-core/seed.<net>.json`, from `scripts/seed-nodes.mjs`) through a recording transport, so each request is stored exactly as the façade makes it. Entities come from `scripts/dapi-fixture-picks.<net>.json` (`--discover` finds new ones); `--rows <from:count,…>` adds only those `blockRows` pages without touching the rest. The recorder keeps each node under 40 requests a minute and 4 in flight. Output is `…/dapi/<net>/<method>/<sha256(request bytes)>.json`, one file per exchange: `{ request, recordedAt, node, response | messages + ended | error }`, all base64 protobuf, with NOT_FOUND answers recorded too, plus `<net>/manifest.json`: `{ net, recordedAt, tip, entries: [{ id, purpose, call, … tags }], gaps }`. `FixtureDapiTransport` (`test/msw/dapi-transport.ts`) serves them. One JSON per exchange rather than `.bin` and `.ndjson` lets `import.meta.glob` load it the same way in Vitest and in the browser.
  - SDK as `…/sdk/<net>/<method>/<sha256(stable-json(args))>.json`, holding the `WireResult` with proof bytes base64-encoded. Served by `FixtureSdkTransport`, so the worker isn't involved and proof verification isn't rerun. `scripts/record-sdk-fixtures.mjs --net <net> --calls <pkg> [--skip-existing]` records the calls listed in `scripts/sdk-fixture-calls/<pkg>.json`, with entity placeholders resolved from `review/fixtures/<net>.json` (§11.5); `shared.json` is F0's.
- Fixture mode is the build flag `VITE_DATA_MODE=fixtures`, set by `build:e2e`. `main.tsx` then starts an MSW browser worker (`src/test/msw/browser.ts`) over the same handlers and slug scheme as the Vitest server, before the app renders, and swaps the two transports. `build/fixture-worker.ts` emits `mockServiceWorker.js` into that build only.
- `record-fixtures.mjs --extra <source>:<path> --only-extra` records just the listed app paths (repeatable) and skips any that already have a file. A spec that visits an entity the pick list doesn't cover adds it this way: for a Core record page that means its Hyphen page as well, because a fit Hyphen is asked for chainwork and spent flags. A transaction page with spent outputs also needs the spender lookups (§4.8): `--extra hyphen:/address/<a>/txs?limit=100 --extra hyphen:/tx/<spender> --only-extra` for each output address and each spender. A spec that waits for a spender lookup to finish needs every page and candidate the lookup opens (up to 3 history pages and 8 transactions), or the run fails on the first request with no recording. The recordings cover the mainnet transactions the specs visit (`5d0c5900:0`, `9f827f91:0`, `e63d8538:3,4,6`, and the coinbase `out-0`). The mempool's second page can't be recorded (the mempool is nearly empty on both networks), so its paging is tested with an MSW override.
- Insight fixtures live under `http/insight/<net>/` (the `/insight-api` prefix is dropped from the slug). `record-fixtures.mjs` reads Insight through `curl`, because Cloudflare challenges Node's `fetch` on `insight.dash.org`; `--skip-existing` records only what is missing. The recorded mainnet Hyphen `status.json` has an indexed height at or just above the DAPI fixture tip, so mainnet is fresh under the §4.7a rule; testnet's Hyphen index (1,577,999) is behind the DAPI fixture tip (1,589,232), so testnet pages read from Insight in every fixture test.
- A request with no fixture fails the test with the URL or method it wanted, never a silent empty. A DAPI request with no recording throws `SourceError('network')` and joins the shared miss list (`reportFixtureMiss`), which fails Vitest in `afterEach` and logs `[radar-fixtures]` in the browser. Any request to another origin, any `/x/hy/*` request, and any Radar, PE or Hyphen request without a recording is answered with a network error and logged as `[radar-fixtures] …` on the console; the shared Playwright `context` fixture (`e2e/helpers/test.ts`) fails the test on that. The preview and dev Hyphen proxy isn't installed in fixture mode.
- Fixture builds expose three hooks on `window` for specs: `__radarCore` (the Core façade), `__radarSdk` and `__radarFixtures`. `__radarFixtures.breakLiveConnection(net?)` makes the fixture DAPI transport fail every call and cut its streams (one still replaying its recording stops at its next message), and `restoreLiveConnection(net?)` undoes it; the IN-15 spec uses them to show and clear the "Live updates have stopped" notice. With DAPI down and Hyphen fit, the tip comes from Hyphen's `blocks?limit=1`, which is recorded for mainnet.
- A fixture transport names a replica node `<node>~2` when the caller avoids the recorded node, so the two-source agreement of §4.4a works in fixtures.
- The IN-06 notice specs use the recorded mainnet transaction stream: it replays the tip block (where `XtNfacx…` receives `078f9796…`) and then has `f96fddff…` paying that address and spending that output. The spec stubs the address's Hyphen reads with `page.addInitScript`. The fallback spec calls `__radarFixtures.breakLiveConnection()` and stubs `/address/{a}/txs?limit=10`.
- `review/fixtures/mainnet.json` has `entities.busy_address` (`XtNfacxAyGM1qfmTifGgLL1Q7JxX7pGXck`), a hand-picked address that receives a transaction every few minutes; `fixtures.mjs` carries it over like `special_txs`, and IN-06's acceptance text names it.
- Specs that read UI text need the message catalogs extracted (`pnpm i18n:extract`); until then a page shows message ids.
- Page tests (`src/**/*Page.test.tsx`, `app.test.tsx`) render the whole `App` with `core` replaced by a client over the recorded exchanges (`src/test/core-client.ts`, `fixtureCore()`); each test file mocks `@/data/core/client` itself.
- The fixtures' `recordedAt` drives the page clock in fixture e2e: `pinClockToFixtures(page)` (`e2e/helpers/clock.ts`) starts it at the newest `recordedAt`, so ages are stable in screenshots.
- `pnpm check:bundle` fails if `apps/web/dist` contains the worker, its script or the kit page.
- Specs must wait for the first render (a heading) before calling `fetch` themselves, because the worker is registered before the app mounts but after `load`.

**E2E server.** The fixture e2e runs `build:e2e` and serves `apps/web/dist-e2e` through `review/serve.mjs` (the real edge Worker in Miniflare; `--dist` picks the directory), so the production CSP and headers apply. The fixture build has no SDK worker and no wasm, so no asset is near the Workers 25 MiB limit; the production build's wasm is split for the same limit (§12c). The shared `context` fixture fails any test on a `securitypolicyviolation` event. The only exceptions are the two third-party Trusted Types sinks the report-only header still reports: the MSW worker registration (fixture builds only) and echarts' own `innerHTML` writes, each matched by its bundle file and sink. Any other Trusted Types report fails the test.

**Story tags.**
- Every Playwright test title carries its story IDs as tags: `test('block page shows header, cbTx, reward and pool @IN-03 @HY-05', …)`.
- `pnpm check:stories` (`scripts/check-stories.mjs`, in CI) fails on a tag that names no story in `review/stories.yaml`. Stories with no test are only reported; `--strict` fails on both.
- Spec files follow the feature areas (§11.5): `net-census`, `net-v24`, `net-masternodes`, `masternode`, `net-map`, `net-changes-api`, `platform-home`, `platform-chain`, `platform-blocks`, `platform-identity`, `platform-data`, `platform-tokens`, `platform-voting`, `tools-platform`, `you`, `search`, `search-secrets`, `search-platform`, `unification`, besides the M0/M1 specs; the whole-app guards are `integration`, `cross-layer`, `phone-pages`, `i18n`, `decentralized-mode` and `app-shell` (each `e2e/tests/<name>.spec.ts`). `pnpm check:stories -- --only <ids>` reports which of the given story ids have no test and exits 1 if any (the default run is unchanged).
- **Route cases.** `e2e/routes/types.ts` defines `RouteCase { path, h1: string | RegExp, nets?: ('mainnet' | 'testnet')[], decentralized: 'data' | 'partial' | 'unavailable', data?: string }`: the URL as a link carries it (without `network` or `sources`), the `h1` it must show, the networks the record exists on (absent: both), what it shows in Decentralized only mode, and a CSS selector for what it must still show there. `e2e/routes/<area>.ts` holds the cases per area (`m1.ts` holds the recorded M1 entities, `M1_RECORDS` and `masternodeH1`, which the case files import) and `index.ts` concatenates them into `ROUTE_CASES`. `e2e/routes/fixtures.ts` resolves fixture entities (`netIds(net)`, `paddr()`, `group()`, `perNet`). No spec keeps its own route list: the route sweep (`app-shell.spec.ts`), the mode walk (`decentralized-mode.spec.ts`), the phone walk (`phone-pages.spec.ts`), the 1024 px width walk and the source-line guard (`integration.spec.ts`), the backend-down sweep (below) and the German and Japanese walk (`i18n.spec.ts`, which fails on a visible run of English) all iterate `ROUTE_CASES`. `integration.spec.ts` fails when a page of `features/entity/site-map.ts` has no route case (`e2e/helpers/site-map.ts` reads the site map's paths and `sources` as text), so a new page cannot escape the sweeps. `E2E_PORT` sets the port of both the fixture and live servers.
- **Sources on every page** (`integration.spec.ts`, X-05). Every route case except the pages that fetch nothing (`fetchesNothing` in `e2e/helpers/site-map.ts`: docs, settings, idle forms, not-found) shows at least one `.rx-sources [data-source]` mark, and shows no source its site-map entry does not list in `sources`.
- **Failure injection** (X-09). The fixture build reads `sessionStorage['radar.fixture.down']`, a JSON list from `radar`, `pe`, `hyphen`, `insight`, `rate`, `sdk` and `dapi`, and fails those sources from the first request (`test/msw/browser.ts`): an HTTP source answers with a network error (`HTTP_SOURCE_PATTERNS` in `test/msw/handlers/fixtures.ts`; `rate` is Platform Explorer's `/rate`), the SDK transport refuses every call, and the DAPI pool is cut. `__radarFixtures.refusedReads(source)` counts the reads a source turned away, not counting health probes (`…/status`) and the shell's live tip stream, so a spec can tell a page that asked the dead source from one that never did. "A backend that is down" in `app-shell.spec.ts` runs every route case once per backend its site-map entry lists (desktop-light only): the frame shows (an `h1` or an alert), nothing keeps loading, no mark says a figure came from the dead source, and the page says what is missing (an alert, an error row, `[data-unavailable]`, a down or stale mark, a fallback stamp, an unknown balance or spend state, or wording such as "isn't answering"). Only a page that never asked the dead source may pass by showing another source instead. `SILENT_WHEN_DOWN` lists the known exception (`/mempool` with DAPI down).
- **`allowFixtureMisses`** (a test option in `e2e/helpers/test.ts`). By default a request with no recording fails the test. A spec that fails a source on purpose, or follows a link to a page with no recording (`cross-layer.spec.ts`'s unrecorded destinations), sets `test.use({ allowFixtureMisses: true })`: a failed source makes pages try fallbacks that have no recording, and the fixture layer refuses them the way the dead source would.
- **Cross-layer links** (`cross-layer.spec.ts`, X-02) follow each link between Core and Platform with a click and check the page it lands on: asset lock → identity (or the top-up note), evonode → its Platform tab, asset unlock → the Platform withdrawals list, payout address → address page, Platform block → the Core block that locked it.
- **Batch fixtures.** A batcher's grouping depends on render timing (§5.4), so the fixture SDK transport answers a batched `contracts.getMany`, a single-`in` `documents.query` and `dpns.usernames` that have no recording under their own key by composing them from recordings of other groupings (`test/msw/sdk-compose.ts`, `composeSdkAnswer`). It never invents an entry: an answer it cannot cover from recordings is still a fixture miss.
- **The service worker in e2e.** The fixture build's MSW worker owns the root scope and re-registers on every load, so it takes the scope from Radar's worker on each navigation. Install, cache contents and the update notice run in the fixture projects (they send `skip-waiting` through the registration); the navigations that must go through Radar's worker while offline are tagged `@live` and run on the production build. Playwright's `setOffline` and `context.route` fail a navigation before the worker can answer it, so those tests cut the worker's own network by replacing `fetch` inside the worker.
- Projects: `desktop-light`, `desktop-dark` (1440×900), `phone-light` and `phone-dark` (390×844, Pixel 7 profile) for fixtures, each with its colour scheme; `live` for `@live`. A test that is only meaningful on one form skips itself with `test.skip(…)`.
- **First paint** (`app-shell.spec.ts`, "first paint"): a cold deep link to a block and to a transaction must show the shell header while the DAPI read is still held. An init script wraps `__radarCore.block` and `__radarCore.tx` so the test controls when each fixture response is released, and records when the first Core call started (`__coreCallAt`) and when `#root dashhq-bar` appeared (`__shellAt`, a `MutationObserver`). The test asserts the shell appeared before the held call could have finished (`shellAt - callAt` under half of `LOADER_DEADLINE_MS`), then releases the response and expects the page's `h1`. It measures what the loader rule (§6.3) promises, not a wall-clock budget, so machine load does not move it.
- Layout and error checks wait on `settled(page)` (`e2e/helpers/settled.ts`: no `[data-skeleton]` and no `aria-busy="true"` left, `document.fonts.ready` resolved, then the placeholder check again in case a navigation brought new ones) before they measure, so they look at a page's data and not its placeholders. The route sweep in `app-shell.spec.ts` checks every route case on each of its networks for its level-1 heading, no error alert and no sideways scroll. The phone walk checks every case at 390 px for no sideways scroll, a hidden header row on every `.rx-table--cards`, and no fixed or sticky element over the last 48 px of `main`; `integration.spec.ts` checks every case at 1024 px for sideways overflow.
- Assertions use roles and accessible names first. Provenance assertions use `SourceLine`'s attributes (`[data-source="dapi"]`, `[data-proved="true"]`). `data-testid` is allowed only where no role fits.

**Live smoke (`@live`).** About 25 tests, each touching one source on one network, so a failure points at a source: home tip and ChainLock (DAPI), block and tx pages (DAPI + decode), masternode list join (DAPI + RAD), `/mn/` evonode, identity proof-checked (SDK), contract documents (SDK), PE transitions list, Hyphen address (mainnet), Hyphen fallback forced by `?debug=budget-exhausted` (dev flag), status page with every source, search for each input class. They run with retries 2, serially (`workers: 1`), so one CI run stays well inside the DAPI budget. `@smoke` stays the scaffold's "app boots" check. `node scripts/dapi-smoke.mjs mainnet|testnet` is a separate read-only check of the production DAPI transport (a dozen requests: tip, ChainLock, a block, its coinbase, headers, the header stream, `coreLive.tip`); it needs no browser.

---

## 11. Work packages

### 11.1 WP-0: contract commit (before any fan-out)

The orchestrator (or one Sonnet task, about an hour) commits the contract files verbatim from this document, compiling, with stub bodies that throw `not implemented`:
- `data/envelope.ts`, `data/errors.ts`, `lib/network.ts`, `data/endpoints.ts`, `ui/types.ts`, `data/core/types.ts`, `data/sdk/methods.ts` (the four example entries), `data/query/keys.ts`, `data/query/stale.ts`;
- `ui/index.ts` exporting every §7 component as a minimal unstyled stub with its final props, so B and later page packages can render before A merges;
- the ESLint boundary zones (§1.2) and the empty folder skeleton with `index.ts` barrels.

Every package builds against these. Changing a contract file afterwards needs the orchestrator's approval and a note in this document.

### 11.2 M0 wave 2: four packages in parallel

| WP | Tasks | Owns (writes) | Reads only |
|---|---|---|---|
| **A: design system** | T-002 shell vendoring and tokens; T-004 UI kit and `/__kit` | `src/ui/**`, `src/styles.css`, `vendor/dashhq/**`, `lib/format.ts`, `lib/units.ts` | contract files |
| **B: app and search** | T-016 app shell, every §4.4 route with a designed empty state, network param, phone nav; T-013 classifier and resolver framework | `src/app/**`, `src/shell/**` (vendored bar and footer wired in, theme cookie, network switch, phone nav, testnet keyline), `src/routes/**`, `src/features/*/…Page.tsx` placeholders, `src/features/search/**`, `src/features/entity/**`, `lib/{base58,bech32,hex}.ts` | `ui` (WP-0 stubs until A merges), contract files |
| **C: data** | T-005 envelope helpers and health registry; T-006 Radar; T-007 PE; T-008 Hyphen; rate; query defaults, batcher and persister; MSW and fixture recorder | `src/data/**` except `dapi-core`, `core`, `sdk`; `src/test/**`; `scripts/record-fixtures.mjs`; `vite.config.ts` (dev proxy `/x/hy`) | contract files |
| **D: edge and harness** | T-012 edge Worker; T-014 review harness; Playwright projects, `expectAccessible`, `check-stories.mjs`, the `e2e:live` script | `workers/edge/**`, `review/**`, `e2e/**` (config and helpers, not story specs) | — |

Spikes T-009, T-010 and T-011 are already running, and they write only `docs/spikes.md` and throwaway code outside `apps/web/src`.

**Merge order:** WP-0 → A → C → B → D. A goes first (plan §5.2: design system first). B goes after C because its loaders import query factories; until C merges, B's routes have no loaders. D touches nothing the others own and can merge whenever it's green.

### 11.3 M1: four packages in parallel

| WP | Tasks | Owns |
|---|---|---|
| **E: Core and SDK data** | T-009b production DAPI client (nodes, budget, transport, cache, streams, `coreLive`); `data/core` façade with the §4.7 fallback rule; core-decode bindings (T-010 outcome); T-011b SDK worker and client, proof store | `src/data/{dapi-core,core,sdk}/**`, `packages/core-decode/**`, `scripts/seed-nodes.mjs` |
| **F: Core pages 1** | T-017 home v0; T-018 block; T-019 tx; T-021 blocks list and by-date | `src/features/home/**`, `src/features/core/{block,tx,blocks}/**`, `e2e/tests/core-blocks.spec.ts`, `e2e/tests/core-tx.spec.ts` |
| **G: Core pages 2** | T-020 address; T-022 mempool, rich list, charts, network, governance; T-024 verify message and QR | `src/features/core/{address,mempool,rich-list,charts,network,governance}/**`, `src/features/tools/{verify-message,qr}/**`, `e2e/tests/core-index.spec.ts`, `e2e/tests/tools.spec.ts` |
| **H: cross-cutting** | T-023 status page; T-025 units and fiat preference, settings page; Lingui pipeline and `en` extraction; hover cards for Core kinds | `src/features/core/status/**`, `src/features/you/**`, `src/i18n/**`, `lib/units.ts`, `src/features/entity/cards/{block,tx,address}.tsx` |

- F and G develop against the `CoreClient` interface with `FixtureDapiTransport` and the fixture SDK transport, so they don't wait for E.
- Search resolvers for Core kinds go into `features/search/resolvers/` as new files: F adds `dapi-block`, `dapi-tx`; G adds `hy-search`, `hy-address`.
- Shared edits are limited to two append-only files, each resolved by keeping both sides: `features/search/resolvers/index.ts` and `features/entity/register.ts`.

**Merge order:** E → H → F → G. E first because F and G switch from fixtures to the real client once it lands; H before the pages so their units and hover cards are in place.

M2 onwards (network, Platform state, Platform history, tools) follows the same split: one data package if a new client is needed, then page packages by feature folder, at most four in parallel.

### 11.4 Design departures accepted (2026-11-10)

The departures listed in `docs/RADAR-DESIGN.md` §15 are accepted for Radar: phone tabs, the navy plate in light mode, layer-hue tokens local to Radar, the card's source mark in the head, Proof-checked as a button that opens the proof inspector, 3 px layer-coloured tab underlines, `Stat.tone`, and warning orange (never amber) for stale ages. The contract lines above are updated to match; package A adds `tone` to the `Stat` stub.

Accepted from package A (2026-11-10): `Stat.note` (a second line under the value) and `LiveDot.bare`; extra exports `LiveControl`, `TableTools` and `HoverCardScope`; `Tabs` uses exact active matching; the rate `SourceLine` reads "Price via Platform Explorer" (no provider field on `SourceStamp`); the `/__kit` route file is `src/routes/[_][_]kit.tsx` because `__kit.tsx` is a pathless layout to the router generator.

Accepted from the M0 data and build work:
- **Hyphen lag is measured against Radar's crawled Core height, not the DAPI tip (§2.5 table).** M0 has no DAPI or Core tip in the data layer: `data/dapi-core` holds only the budget, and `CoreClient.tip` is a contract type. `healthQueries.hyphen` takes `chain.blocks` from Radar's `/status` for the network. When that call fails, the hyphen lag is cleared rather than left at its last value, so a stale lag can't stick. Switch the reference to `core.tip(net)` when the Core façade lands.
- **`down` needs the silence condition as well as the failure kind (§2.5).** The 120 s clause applies to a last call that failed with `network`, `timeout` or `http`, and a source that has never answered counts as silent.
- **The Hyphen stream is a client method only (§5.5).** `openHyphenStream` and `readNdjson` are no longer exported from `data/hyphen`; features reach the stream as `hyphen.stream`.
- **`react-remove-scroll-bar` is aliased** (`vite.config.ts`) to `src/app/remove-scroll-bar.ts`, which only sets `data-scroll-locked` on `<body>`. The package injects an inline `<style>` that `style-src 'self'` refuses. `body[data-scroll-locked]` in `radar-components.css` does the locking. When the first lock starts on a page that has a scrollbar, the shim also sets `data-scroll-gutter` on `<html>`, and `html[data-scroll-gutter] { scrollbar-gutter: stable }` keeps the layout from shifting; a page with no scrollbar reserves nothing. Revisit when Radix or react-remove-scroll changes the marker attribute.
- **`SourceStamp.asOfFetched` and an optional `latencyMs` (§2.1, §2.5).** Radar sends no time for several documents, so a stamp can now say its `asOf` is only the fetch time, and `SourceLine` words it "Fetched from Radar". `healthRegistry.report` accepts a report with no latency for outcomes that aren't one round trip.
- **The home Platform tip reads through the SDK (§3.3).** `features/home/platform-tip.ts` uses `platformTipQuery(net)` from `data/sdk/queries.ts`; while the SDK has no answer yet it shows Platform Explorer's figures, stamped `sdk-cold` or `sdk-down`, and swaps to the proved ones when they arrive.
- **The production DAPI queue timeout is 70 s (§4.3).** `QUEUE_TIMEOUT_MS` has to exceed the 60 s rate window, or a full pool could never serve a queued call.
- **`connect` on the SDK worker returns `SdkConnectInfo | WireError` (§3.2)**; it never throws across Comlink.
- **An SDK `InvalidArgument` maps to the `invalid-response` kind (§2.3).**
- **DAPI fixtures are one `.json` per exchange, not `.bin` and `.ndjson` (§10)**, so one glob loads them in Vitest and in the browser.
- **`BlockRow.pool` (§4.7).** The Core façade sets `BlockRow.pool` from `lib/core/pools.ts` (`poolOfCoinbase`) when a row carries a coinbase script; the blocks list shows its "Mined by" column only when rows have a pool.
- **The shared Hyphen fit hook lives in `data/hyphen/fit.ts` (§1.2)**; it is the one hook allowed in `data/`, and `eslint.boundaries.js` says so.
- **Testnet frame (HY-17).** A fixed 4 px frame in `--rx-testnet` (dashed for devnets) with a name tab hanging from the top edge ("Testnet", "Devnet qa"), `data-testnet-keyline` and `data-testnet-label`, pointer-events none, both themes. It replaces the earlier `body::after` frame.
- **The footer clears the phone tab bar from Radar's CSS (§1.1).** Preflight's `* { padding: 0 }` outranks the vendored footer's `:host` padding, so `radar-components.css` restates `dashhq-footer { padding-bottom: var(--dh-tabs-h, 0px) }`.
- **The search palette's pending notice is a status line above the list (§8.2).** `Command.Loading` renders a `progressbar` inside the listbox, which axe reports as an unallowed child.
- **Trust and claims (§4.4a).** Every DAPI answer is verified against its request, and ChainLock/InstantSend need two claimants or the UI says "reported by one node".
- **SDK budget (§4.3).** The SDK worker's `fetch` is capped at 30 requests a minute and 4 in flight per node and its use is counted in the Core pool's window.
- **Spend state is four-valued (§4.8).** `spent`, `unspent`, `unspendable` and `unknown`; "unspent" needs an index within 3 blocks of the DAPI tip, and the spender is found by reading the output address's history.
- **"Coinbase tag says", not "Mined by" (§4.8).** The tag is written by the miner, so the page states it as a claim.
- **No route blocks first paint on DAPI or the SDK (§6.3).** The first load starts the prefetch and returns; preloads queue as `prefetch`.
- **Enter is deliberate (§8.2).** It waits for local resolvers and at most 300 ms for remote ones; a typed height, hash, txid or address always opens its page.
- **Speculative hits are shown apart (§8.2).** A guess carries a "Guess" badge under "A guess, not a result".
- **The secret rule is five tokens with at most one non-word (§8.3),** with a fail-closed classifier until the wordlist chunk lands.
- **CSP has no `blob:` workers (§2.7).** `worker-src 'self'`; Trusted Types stays report-only.
- **Live is qualified by the connection (§4.6).** One shared state feeds every Live label and the header.
- **Sources are drawn once per card (§7.2),** quieter, and a failed SDK reads "proofs unavailable".
- **The home hero map has no block pings (§4.8).** Radar has no block-to-location data, so the map shows nodes only.
- **Testnet home keeps the Core card while Hyphen's index is stale (§4.8),** with DAPI figures and a note saying what is behind.
- **Ten languages ship (§9.1),** with a footer language menu and plural categories checked per locale.
- **The Worker's Hyphen query-value cap is 512, not 256 (§2.7).** Hyphen's address-history cursor is 358 characters, and a 256 cap turned every "Show more" on an address into a 400.
- **Spend state comes from the address's current UTXO list (§4.8).** Hyphen caches a mined `/tx` response immutably, so its `spent: false` is as old as the first read; only `spent: true` is trusted from it, and a missing output in a complete list means spent.
- **A second stylesheet is adopted into the shell bar's shadow root (§7.6)** so the phone menu stays on screen, the vendored files staying byte-identical; it goes when the shell fixes `.netpop` itself.
- **USD can be the primary unit on mainnet (§9.2),** with the DASH figure after it, the rate's source and age in the footer, and DASH everywhere else until the rate arrives.
- **Source and freshness labels are 12 px at weight 520 (§7.2),** up from 11 px, to clear 4.5:1 on every card surface.
- **`linkOutUrl` returns `null` for an explorer with no page on the network (§7.2),** and `LinkOut` then draws nothing; Governance has no page per masternode, so the masternode page links to `/masternodes`.
- **An IP typed in the box finds masternodes in Radar's list (§8.2).**
- **The search dialog is its own chunk (§1.1),** fetched at the first pointer, key or touch event or 1.5 s after first paint, and mounted on first use, so the entry chunk carries neither the dialog nor the resolvers (they load with `useSearch`).
- **A value and its unit are joined by a no-break space, not a 2 px margin (§9.2).**
- **The address page follows DAPI's transaction stream, not Hyphen's `/stream` (§4.6, §4.8),** which never sends `mempool_tx`; `data/hyphen/live.ts` is gone.
- **Dark `--dh-ink-2` is `#b0c6d4` on cards and `#b8d2e2` on the plate (§7.7),** a step above the vendored value.
- **Two Core chart metrics use `--dh-accent-forge-select` and `--dh-good` (§4.8),** outside the blue and teal family of design §4.3, so six chart colours stay apart.
- **The rich list is a compact list on phones (§4.8).**
- **The Hyphen client types its query names from the Worker's allowlist (§2.7).** `HYPHEN_PARAMS` in `workers/edge/src/hyphen-path.ts` is the one list; `data/hyphen/params.ts` imports its type, so a call can't send a name the Worker drops.

### 11.5 M2–M6 packages and their contracts

M2–M6 were built by fifteen packages in parallel on shared foundations (F0), then integrated (INT). **All of them are merged.** The table below maps each area of the code to the package that built it, which still names its catalog, prefetch module, SDK method file, route-case file and view-key prefixes; the subsections after it are the cross-area contracts as the code has them now.

#### Packages (all merged)

The ids give file names; a catalog's name is the lower-case id. Each area has its own prefetch module, SDK method and impl files, schema files, route-case file and catalog.

| Id | Scope | Directories it owns (besides the files named in the later columns) | Route files (`apps/web/src/routes/`) | View-key prefix | Specs (`e2e/tests/`) |
|---|---|---|---|---|---|
| `NET-A` | census and activation | `features/network/{nodes,v24}`, `features/home` (RA-11 and the census headline) | `nodes`, `v24` | `census-` | `net-census`, `net-v24` |
| `NET-B` | masternode list and DAPI list | `features/network/masternodes`, `data/masternodes`, `data/core/mn-list.ts`, `data/core/decode.ts` (`mnListDiff` only), `packages/core-decode`, `scripts/record-dapi-fixtures.mjs`, `scripts/dapi-fixture-picks.*.json`, `apps/web/src/test/fixtures/dapi` | `masternodes` | `mn-list-` | `net-masternodes` |
| `NET-C` | masternode page | `features/network/mn` | `mn.$protx` | `mn-page-` | `masternode` |
| `NET-D` | map, changes, API page | `features/network/{map,changes}`, `features/tools/api`, `apps/web/public/map` | `map`, `changes`, `api` | `map-`, `changes-` | `net-map`, `net-changes-api` |
| `P-HOME` | Platform home and status | `features/platform/home`, `features/core/status` | `platform.index` | `phome-` | `platform-home` |
| `P-CHAIN` | epochs, protocol, quorums, credits, shielded | `features/network/{epochs,epoch,protocol}`, `features/platform/{quorums,credits,shielded}` | `epochs`, `epoch.$n`, `protocol`, `quorums`, `credits`, `shielded` | `chain-` | `platform-chain` |
| `P-BLOCKS` | Platform blocks and transitions | `features/platform/{blocks,block,txs,tx}`, `features/entity/platform/{transition-table,block-table}.tsx` | `platform.blocks`, `platform.block.$id`, `platform.txs`, `platform.tx.$hash` | `pblock-`, `ptx-` | `platform-blocks` |
| `P-ID` | identities | `features/platform/{identities,identity}` | `identities`, `identity.$id`, `identity.lookup` | `identity-` | `platform-identity` |
| `P-DATA` | contracts, documents, groups | `features/platform/{contracts,contract,document,groups,group}` | `contracts`, `contract.$id.index`, `contract.$id.documents.$type`, `document.$contract.$type.$id`, `groups.$contract`, `group.$contract.$pos` | `contract-`, `document-`, `group-` | `platform-data` |
| `P-TOKEN` | tokens, Platform addresses | `features/platform/{tokens,token,platform-address}` | `tokens`, `token.$id.index`, `token.$id.holders`, `platform-address.$addr` | `token-`, `paddr-` | `platform-tokens` |
| `P-VOTE` | names, contests, votes, polls | `features/platform/{names,name,contests,contest,votes,polls}` | `names`, `name.$label`, `contests`, `contest.$label`, `votes`, `polls` | `vote-`, `name-` | `platform-voting` |
| `TOOLS` | query and decoders | `features/tools/{query,decoders,transition,sdk-reference}`, `data/sdk/worker/decode.ts`, `THIRD_PARTY.md` (append) | `query`, `tools.$decoder`, `tools.transition`, `sdk-reference` | `tools-` | `tools-platform` |
| `YOU` | saved, settings, about, proof inspector, diagnostics, offline | `features/you`, `app/global-mounts.tsx`, `app/sw-register.ts`, `src/sw`, `data/sdk/{settings.ts,client.ts,proof-store.ts}`, `data/sdk/worker/sdk-factory.ts`, `THIRD_PARTY.md` (append) | `saved`, `about`, `settings` | `you-` | `you` |
| `UNI-S` | search | `features/search` | — | `search-` | `search`, `search-secrets`, `search-platform` |
| `UNI-L` | hover cards, cross-layer links, keyboard, redirects, OG | `features/entity` (except the P-BLOCKS files), `shell`, `workers/edge`, `build/redirect-targets.test.ts`, `ui/link-out.tsx`, `lib/linkouts.ts`, `features/core/tx` (the asset-lock link only) | — | `entity-` | `unification` |
| `INT` | integration | what no one owns; the base catalog | — | — | `cross-layer` |

Per area, by name (`<pkg>` is the lower-case id; `net-a`, `p-home`, `tools`, …):
- **Prefetch module** `data/query/prefetch/<pkg>.ts`: one `<route>Prefetch: Prefetch<Params, Search>` per route and the route's `Search` interface. A route with nothing to start early (an idle form, a static page) returns `[]`.
- **SDK methods** `data/sdk/methods/<pkg>.ts` (`<Pkg>Methods` interface and `<PKG>_CLASSES`, the data class of each method) and `data/sdk/worker/impl/<pkg>.ts` (`<Pkg>Reads`, the part of `EvoSDK` it reads, and `<pkg>Impl`); §3.4 lists them. `NET-C`'s are empty. `NET-A`, `NET-B`, `NET-D`, `P-HOME`, `UNI-S`, `UNI-L` and `YOU` have no method files of their own.
- **Schemas**: `data/pe/schemas/*.ts` and `data/radar/schemas/*.ts`, split by area (below).
- **Catalog** `src/i18n/locales/<locale>/<pkg>.po` (§9.1).
- **Route cases** `e2e/routes/<pkg>.ts` (plus `int.ts` and `uni-l.ts`): the cases of that area's routes (§10). `m1.ts` holds only the recorded entities (`M1_RECORDS`, `masternodeH1`), which a case file imports. `/mn/...` cases are in `net-c.ts`, `/status` in `p-home.ts`, `/settings` in `you.ts` and `/search...` in `uni-s.ts`.
- **Stories**: a page's stories live in `features/entity/site-map-stories.ts` (`PAGE_STORIES`, keyed by path).

#### Decentralized only mode (WP-X)

- Reading: `decentralizedOnly()` (`lib/source-mode.ts`) outside React (loaders, resolvers, clients); `useDecentralizedOnly()` (`data/health.ts`) in a component that must draw again on a change; `useSourceMode()` and `useSetSourceMode()` (`ui/source-mode.tsx`) for the state (`{ mode, fromLink }`) and its setter.
- Which sources are off: `HOSTED_SOURCES` (`radar`, `pe`, `hyphen`, `insight`, `rate`), `isHostedSource`, `sourceOff(source)` and `sourceInUse(net, source)` (`data/endpoints.ts`). `quorums`, DAPI and the SDK are never off. Give `enabled: false` to every query of a refused source while the mode is on.
- The error: `SourceError` kind `'disabled-by-mode'`, built by `disabledByMode(source)` and tested with `isDisabledByMode(e)` (`data/errors.ts`). It is thrown before any I/O and is not an outage: it never turns a health dot red and is not retried.
- The component: `Unavailable({ title?, source?, compact? })` (`ui/source-mode.tsx`), once per section that needs an indexer, with its way back to all sources. `HyphenGate` (`features/core/hy-shared/HyphenGate.tsx`) is the Core pages' wrapper.
- Turning it on in a spec: add `sources=decentralized` to the address (`withQuery(path, 'sources=decentralized')` from `e2e/routes`) or set `localStorage['radar.sources'] = 'decentralized'`. There is no other helper. The mode walk is `e2e/tests/decentralized-mode.spec.ts`; it iterates the route cases.

#### Route contracts (B)

Every route file's `validateSearch` is the contract of its URL (links, redirects and the edge Worker rely on it); what the page reads goes in the page and the prefetch module.

- **Helpers** (`lib/search-schemas.ts`, re-exported from `app/search.ts`, so routes import either): `zCsv` (an unordered set: split on `,`, de-duplicated and sorted), `zList` (an ordered list that keeps order and repeats: sort orders, cursor stacks), `zCsvEnum(values)`, `zRange` (`min..max`; a minimum above the maximum is invalid), `zIsoDate`, `zPage` (1 to `MAX_PAGE`, 100,000), `LIMITS` (10, 25, 50, 75, 100) with `zLimit` and `zLimitOf(values)`, `zInt` (a non-negative integer from a number or a digit string), `zHex64`, `zHex40` (lower-cased), `zBool01` (`1` is `true`), `zOpt(schema)` (optional, falls back to absent), `zDefault(schema, value)`, `zWhere`.
- **Documents filter codec**: `type WhereOp = 'eq' | 'lt' | 'lte' | 'gt' | 'gte' | 'in' | 'sw'`, `interface WhereClause { field: string; op: WhereOp; value: string | string[] }`, `encodeWhere(clauses): string`, `decodeWhere(s): WhereClause[]`. A clause is `field~op~value`, clauses are joined by `,`, `in` values by `|`, every part is percent-encoded (`~` as `%7E`), and a malformed clause is dropped; `encodeWhere` also drops a clause with no field or an empty `in`. An item of a `zCsv` or `zList` may hold a comma written `%2C` (`%` as `%25`): `stringifySearch` keeps an array's order and escapes each item (`escapeListItem`, `unescapeListItem` in `lib/search-schemas.ts`), so a value with a comma survives the URL. A route filter that holds typed values (a document `where`) uses `zWhere`, never a plain list.
- **Loaders**: `routePrefetch('<pkg>', '<route>Prefetch')` (`app/route-loader.ts`; `<pkg>` is the lower-case id such as `p-vote`; both names are typed against the module, so a typo fails typecheck) is the whole loader of every M2–M6 route. It reads `routeNetwork(deps)`, loads `data/query/prefetch/<pkg>.ts` on demand through one glob, runs the items through `prefetchForRoute` behind `loadBehindFirstPaint`, and keeps the modules out of the entry chunk. A module that fails to load or an item list that throws starts nothing; the route still opens. A re-run for a changed search (`cause: 'stay'`) does not wait for its items. `loaderDeps` is the whole validated search, so anything the prefetch reads is a dep. Absent `page` is 1 and absent `limit` is 25.
- **`/masternodes` and `/map` share one filter**: `mnFilterSearch` (`data/masternodes/filter.ts`: `q`, `type`, `status`, `reach`, `country`, `version`, `host`, `dkg`) and the `MnFilter` type; `/masternodes` extends it with `sort`, `view`, `pf`, `page`. **`host` is an autonomous system number** (`String(crawl.asn)`, so `host=24940`), because organisation names are not unique and carry spaces and commas; `mnHostLabels(rows)` gives the organisation name to show for each number. The crawl facets (`reach`, `country`, `version`, `host`, `dkg`) match nothing without Radar's crawl, so they are ignored on rows that have none (a DAPI-only list is not emptied by them). `q` also matches `as<asn>`, the user agent and the Platform node ID.
- **`/validators`** stays a redirect to `/masternodes?type=evo&view=platform`. `/platform` keeps its legacy-anchor `beforeLoad`. `/mn/$protx` has `loader: routePrefetch('net-c', 'mnPrefetch')` (NET-C's `mnPrefetch` lists the Radar record), `loaderDeps` is the whole search, and it gains `epoch` and `before`.
- `/platform/txs` filters `type` with `zCsvEnum(TRANSITION_TYPES)`.
- The edge redirects (`workers/edge/src/redirects.ts`) still land on registered routes with params the schemas accept (`build/redirect-targets.test.ts`).

#### Navigation (C)

All in `features/entity/site-map.ts`.
- `SitePage` gains `group?: 'voting' | 'chain'`, `navHref?` (a concrete URL for a nav entry whose route has params), `railTitle?` (the rail's label when it differs from the title) and `rail?: false` (in the palette, not in the rail). `SITE_GROUPS` maps `voting` (`/contests`, `/votes`, `/polls`) and `chain` (`/quorums`, `/credits`, `/shielded`) to a title and its pages. `railEntries(section)` is what `shell/SectionNav.tsx` draws: one entry per group at the place of its first page, current when any page of the group is open.
- Rails:
  - Core: unchanged.
  - Network: Nodes `/nodes`, Masternodes `/masternodes`, Map `/map`, Epochs `/epochs`, Protocol `/protocol`, Core 24 `/v24`, Changes `/changes`.
  - Platform: Overview `/platform`, Blocks `/platform/blocks`, Transitions `/platform/txs`, Identities `/identities`, Contracts `/contracts`, Tokens `/tokens`, Names `/names`, Voting (group), Chain state (group).
  - Tools: Query `/query`, Transition `/tools/transition`, Decoders (`navHref` `/tools/contract`), Verify message, QR reader, SDK reference, Radar API, Data sources.
  - You: Saved, Settings, About.
  - `/validators` is in the palette (keywords validators, evonodes) and not in the rail.
- `PageGroupTabs({ group })` (`features/entity`) draws link tabs to a group's pages; each page of a group places it under its `h1`.
- Every page has a title, summary, `sources` (every backend it reads, including what remains in Decentralized only mode; the source-line guard and the backend-down sweep hold pages to it, §10), `keywords` and `record`. Its stories live in `features/entity/site-map-stories.ts` (`PAGE_STORIES`, keyed by path; the site-map test checks it covers every page), so the entry chunk does not carry them.

#### Types and keys (D)

- `VIEW_KEY_PREFIXES` (`data/query/keys.ts`) lists the resource-name prefixes each package may use in `viewKeys` (§5.1): a test asserts that no prefix starts with another. F0's own is `mn-rows`.
- `lib/tx-types.ts` has `TRANSITION_TYPES` (30 names, from Platform Explorer's transition types and the SDK's `StateTransition` variants, including `shielded`) and `BATCH_TYPES` (25 batch sub-types), with the types `TransitionType` and `BatchType`. `ui/kinds.ts` `TYPE_META` covers `CoreTxType | TransitionType | BatchType`, so `TypeBadge` draws every one.
- `DataClass` lives in `lib/data-class.ts` (the SDK worker's graph may import `lib`); `data/query/stale.ts` re-exports it.

#### Data layer (E)

- **SDK method map, split by owner.** `data/sdk/methods.ts` (contract file) declares `SdkMethods extends SharedMethods, NetCMethods, PChainMethods, PBlocksMethods, PIdMethods, PDataMethods, PTokenMethods, PVoteMethods, ToolsMethods`. `data/sdk/worker/impl.ts` merges `impl/shared.ts` and `impl/<pkg>.ts`; `SdkReads` is the intersection of each file's `Reads`; `data/sdk/queries.ts` builds `CLASS_OF` from the class tables. `decodeWithWasm` is in `data/sdk/worker/decode.ts`. To add a method, add it to the area's methods interface and class table, implement it in the area's impl file, and give it a row in `METHOD_PAGES` (`features/tools/sdk-reference/method-pages.ts`, the pages that call it); `reference.test.ts` fails for a method without one. The unit-test fake is `fakeReads` (`test/data/sdk/fakes.ts`).
- **Shared SDK methods** (`data/sdk/methods/shared.ts`, `worker/impl/shared.ts`), each the `*WithProof` variant where one exists, so the answer is proof-checked; a wasm class never crosses the worker. `documents.query` clamps `limit` to 100. A map result has an entry for every key asked, `null` when absent, except `epoch.evonodesProposedBlocksByIds`, `…ByRange` and `protocol.versionUpgradeVoteStatus`, which hold only the proposers or masternodes the node returned (a count, no `null`). For `tokens.statuses` and `tokens.identityTokenInfos`, `null` means no special status: an existing token that is not paused, or an identity's balance that is not frozen, answers `null`, so it does not mean the token is absent (`tokens.contractInfo` does). Every key a method answers by is the form the caller sent: an identity or contract id in base58, a ProTxHash in lower-case hex (64 characters; the worker converts the SDK's base58 keys), a Platform address in its bech32m text. A Platform address is looked up by the SDK's own key (a type byte, `00` P2PKH or `01` P2SH, and the 20-byte hash in hex) and answered under the address as asked.

  | Method | Args | Result (DTO) |
  |---|---|---|
  | `identities.fetch` | `{ id }` | `IdentityDto \| null` (`id`, `balance`, `revision`, `keys: IdentityKeyDto[]`) |
  | `identities.balances` | `{ ids }` | `Map<id, bigint \| null>` |
  | `identities.byPublicKeyHash` | `{ pkh }` | `IdentityDto \| null` |
  | `contracts.getMany` | `{ ids }` | `Map<id, ContractDto \| null>` (`id`, `ownerId`, `version`, `documentSchemas`) |
  | `contracts.fetch` | `{ id }` | `ContractFullDto \| null`: `ContractDto` plus `keepsHistory`, `config`, `indices: Record<type, ContractIndexDto[]>`, `tokens: ContractTokenDto[]`, `groups: ContractGroupDto[]`. A contract the SDK reports as not found answers `null` unproved |
  | `dpns.usernames` | `{ identityId, limit? }` | `string[]` |
  | `dpns.getUsernameByName` | `{ name }` | `DpnsUsernameDto \| null` (`username` as asked, `identityId`, `documentId`, both base58). The worker converts the name to its homograph-safe form (o→0, i and l→1) before the lookup, because DPNS keeps only that form; a caller passes the name as typed |
  | `documents.query` | `{ contractId, type, where?, orderBy?, limit?, startAfter?, startAt? }` | `DocumentDto[]` (ids, owner, `type`, `revision`, created/updated/transferred times and heights, `data`) |
  | `documents.get` | `{ contractId, type, id }` | `DocumentDto \| null` |
  | `tokens.contractInfo` | `{ tokenId }` | `TokenContractInfoDto \| null` (`contractId`, `position`) |
  | `tokens.totalSupply` | `{ tokenId }` | `bigint \| null` |
  | `tokens.statuses` | `{ tokenIds }` | `Map<id, TokenStatusDto \| null>` (`paused`) |
  | `tokens.balances` | `{ tokenId, identityIds }` | `Map<identityId, bigint \| null>` |
  | `tokens.identityBalances` | `{ identityId, tokenIds }` | `Map<tokenId, bigint \| null>` |
  | `tokens.identityTokenInfos` | `{ identityId, tokenIds }` | `Map<tokenId, IdentityTokenInfoDto \| null>` (`frozen`) |
  | `tokens.calculateId` | `{ contractId, position }` | `string` (computed locally, **unproved**) |
  | `system.status` | — | `PlatformStatusDto` (`chainId`, Drive `version`, `height`, `timeMs`, `catchingUp`, `peers`, `isListening`, `latestBlockHash`, `latestAppHash`, `earliestBlockHeight`, `maxPeerBlockHeight`, `coreChainLockedHeight`, `nodeProTxHash`, `nodeId`, `dapiVersion`, `tenderdashVersion`, `tenderdashProtocol { p2p, block }`, `driveProtocol { latest, current }`) |
  | `system.totalCredits` | — | `bigint \| null` |
  | `system.currentQuorumsInfo` | — | `CurrentQuorumsDto` (`height`, `quorums: QuorumDto[]`; **unproved**: the SDK has no proof variant) |
  | `epoch.current` | — | `EpochDto` |
  | `epoch.epochsInfo` | `{ startEpoch?, count?, ascending? }` | `EpochDto[]` |
  | `epoch.finalizedInfos` | `{ startEpoch, count?, ascending? }` | `FinalizedEpochDto[]` (an `EpochDto` plus `totalBlocks`, the fee totals and `blockProposers: Map<proTxHash, bigint>` keyed by hex; the index comes from the map key). Only an epoch whose info is final is in the answer; the current epoch's proposers come from the two `evonodesProposedBlocks…` methods, and a past epoch's from `finalizedInfos` |
  | `epoch.evonodesProposedBlocksByIds` | `{ epoch, proTxHashes }` | `Map<proTxHash, bigint>` |
  | `epoch.evonodesProposedBlocksByRange` | `{ epoch, limit?, startAfter? }` | `Map<proTxHash, bigint>` |
  | `protocol.versionUpgradeState` | — | `VersionUpgradeStateDto` (`currentProtocolVersion`, `nextProtocolVersion`, `voteCount`) |
  | `protocol.versionUpgradeVoteStatus` | `{ startProTxHash?, count }` | `Map<proTxHash, number>` |
  | `voting.votePollsByEndDate` | `{ startTimeMs?, startTimeIncluded?, endTimeMs?, endTimeIncluded?, limit?, offset?, orderAscending? }` | `VotePollsByEndDateDto[]` (`timestampMs`, `polls: VotePollDto[]`) |
  | `addresses.get` | `{ address }` | `PlatformAddressInfoDto \| null` (`address`, `balance`, `nonce`) |
  | `addresses.getMany` | `{ addresses }` | `Map<address, PlatformAddressInfoDto \| null>` |

- **Decoding** (`SdkWorkerApi.decode(kind, bytes, opts?)`, `SdkClient.decode`): `kind` is `'stateTransition' | 'dataContract' | 'document' | 'identity'` (`SdkDecodeKind`); a document needs `opts: { contract: Uint8Array, type: string }`, the contract's serialized bytes and the document type's name. The answer is the SDK's JSON. It is local wasm, with no network.
- **Connection settings** (`SdkNetworkConfig.settings: SdkConnectionSettings`, `data/sdk/methods.ts`): `timeoutMs` (the worker's limit for one call, default 8000), `connectTimeoutMs` (default 20000), `retries`, `banFailedAddress` and `logs` (the last three go to `EvoSDK` in `data/sdk/worker/sdk-factory.ts`). Each absent field keeps its default. The worker's `api.ts` applies the two timeouts; `data/sdk/client.ts` fills the object from the viewer's settings (§3.3).
- **Well-known entities** (`lib/well-known.ts`, exported from `@/lib`): the one table of the contracts, tokens and identities Radar names. `wellKnownContracts(net)` (DPNS, DashPay and Withdrawals, with their ids, which are the protocol's and the same on every network), `wellKnownTokens(net)` (mainnet and testnet: id, symbol, name, contract, position, decimals), `wellKnownIdentities(net)` (the system identity), `systemContract(key)`, and `wellKnownLabel(net, kind, id)`, which `Entity` reads for a label when nothing else gave one. A source of labels that should win (the user's own, from YOU) registers with `registerLabelOverlay(fn)` (it returns its remover) and calls `notifyLabelsChanged()`; `subscribeLabels`/`labelsVersion` serve `useSyncExternalStore`. Each entry's source is in the file's header. A package adds no table of its own and does not edit the file; it asks the orchestrator for an id that is missing.
- **DPNS names.** The homograph-safe conversion (o→0, i and l→1, lower case) happens in the worker, once: `dpns.getUsernameByName` converts with `sdk.dpns.convertToHomographSafe` before the lookup, so a caller passes the name as typed. A `documents.query` on the `domain` type reads the stored `normalizedLabel`, which is already in that form, so the caller converts the text itself before a `startsWith` or `==` on `normalizedLabel` (and on `normalizedParentDomainName`, which is `dash`); to show what is being searched, show the converted form. F0's sample prefix query now starts from the safe form of the name (`{name_registered_safe}`).
- **Batchers** (`data/sdk/batchers.ts`, also `sdkBatchers` from `data/sdk/queries.ts`), built with `createBatcher` (§5.4): `identityBalance` (`identities.balances`), `contractMeta` (`contracts.getMany`), `tokenStatus` (`tokens.statuses`), `tokenBalance` (`tokens.balances`, key `{ tokenId, identityId }`, one call per token), `platformAddressInfo` (`addresses.getMany`) and `dpnsName` (see §5.4). Each writes its per-key queries as `[net, 'sdk', <name>, { <key> }]`. A key that is not a valid ID (or Platform address) rejects only its own askers with `invalid-response`; `tokenStatus` and `tokenBalance` answer a token with no special status as `null`. `useIdentityName(id)` (`features/entity`) reads `dpnsName`, so `IdentityRef` shows names.
- **Masternode rows** (`data/masternodes/rows.ts`): `MnRow` (`protx`, `type`, `status`, `service`, `host` (the address's host part), `registration` from DAPI, `crawl` from Radar, `dapi` and `radar` stamps, `crawlDiffers`), `joinMnRows(crawl, list)`, `mnRowsQuery(net)` (key `viewKeys(net, 'mn-rows')`) and `MnRows { rows, dapi, radar }`. DAPI wins on type, status, service, keys, Platform ports and node ID. Radar refused by the mode leaves DAPI-only rows, and DAPI down leaves Radar-only rows. `filterMnRows(rows, filter)` and `mnFilterFacets(rows)` are in `data/masternodes/filter.ts`. DAPI's side is `core.masternodeList` (§4.12).
- **Schemas split by owner.** `data/pe/schemas/` and `data/radar/schemas/` are directories whose `index.ts` re-exports everything, so `@/data/pe/schemas` still resolves. PE: `status`, `stats`, `search`, `rate`, `quorums` (P-HOME); `blocks`, `transactions` (P-BLOCKS); `identities` (P-ID); `contracts`, `documents` (P-DATA); `tokens`, `addresses` (P-TOKEN); `contested` (P-VOTE); `validators` (NET-C); `common` (shared, frozen). Radar: `status`, `summary`, `history`, `releases`, `bench`, `activation` (NET-A); `masternodes` (NET-B); `masternode`, `payments`, `mn-bench`, `check` (NET-C); `geo`, `changes` (NET-D); `platform` (P-CHAIN); `common` (frozen). `peQueries.verifyTransaction(net, base64)` is for TOOLS; it is a check of one input, so it never refetches or retries (`staleTime: Infinity`, `retry: false`).
- **Query log** (`data/query-log.ts`, diagnostics NX-62): `QueryLogEntry { id, at, net, source, what, ok, kind?, tookMs, node?, proved?, refusedByMode? }`, `queryLog.push`, `.snapshot()` (the newest 100), `.subscribe(cb)`, `.clear()`. `fetchSourced`, `SdkClient.call` and the DAPI pool each push one entry per call, including mode refusals; the SDK client also logs a connect failure and a call that timed out (`kind: 'timeout'`), and the Hyphen stream logs a failed open. `what` is `METHOD /path` without the query string. The diagnostics drawer shows it (§7.9).
- **SDK fixtures.** `scripts/record-sdk-fixtures.mjs --net mainnet|testnet [--calls <pkg>[,<pkg>]] [--skip-existing] [--dry]` reads `scripts/sdk-fixture-calls/<pkg>.json` (`{ "mainnet": [[method, args], …], "testnet": […] }`). In the args, `"{name}"` is the id of that entity in `review/fixtures/<net>.json`, `"{name.field}"` one of its fields, `"{name:n}"` the same as a number, and `{absent}`, `{absent_pkh}` and `{absent_paddr}` ids that exist nowhere. `shared.json` holds F0's calls: every shared method, plus an absent case where it has one. Each area has its own `<pkg>.json` (and `int.json`); run the recorder with `--skip-existing` and commit only the new files. Fixtures are keyed by the stable JSON of the args, so a changed argument needs a new recording. A recording is kept, never re-recorded: specs are written against what it holds, and `pinClockToFixtures` follows the newest `recordedAt` (§10). Facts the recordings showed: the SDK keys a Platform address answer by type byte and hash, hands a DPNS username's ids over as plain number arrays (the worker turns them into base58), and returns no map entry for a token that is not paused or frozen.

#### Entity and search extension points (F)

- **Links.** `entityPath(kind, id, search?)` and `entityHref(kind, id, net, search?)` (`features/entity/hrefs.ts`) give a valid URL for every `EntityKind` under the schemas above: contest `/contest/<label>` with `contract`, `type`, `index` in `search` when it is not a DPNS contest; group `/group/<contract>/<pos>`; document `/document/<contract>/<type>/<id>`; quorum `/quorums?q=`; evonode `/mn/<protx>`; epoch `/epoch/<n>`; platform block `/platform/block/<height|hash>`. `<Entity>` takes the same `search`. A test covers each kind against the route tree.
- **Hover cards**: `features/entity/register.ts` is the registry (§7.4); `GenericHoverCard` is the fallback.
- **Search**: one resolver per file in `features/search/resolvers/`, listed in `resolvers/index.ts` (§8.2).
- **Stores** (`features/entity`, localStorage with `storage`-event sync and a try/catch on every access): `saved.ts` (key `radar.saved`: `SavedItem { net, kind: 'identity' | 'contract' | 'token', id, label?, savedAt }`, `useSaved`, `saveItem`, `removeItem`, `clearSaved(scope)`, `isSaved`, `useIsSaved`) with `SaveButton({ kind, id, label? })`; `viewed.ts` (key `radar.viewed`: `recordViewedIdentity(net, id)`, which does nothing unless on, `useViewedIdentities(net)`, `useViewedEnabled`, `setViewedEnabled`, `clearViewed`; off by default, 50 per network). `createJsonStore` (`lib/json-store.ts`, wrapped by `useJsonStore` in `features/entity/local-store.ts`) is the helper; `useListMode` uses it too.
- **Platform components** (`features/entity/platform/`, exported from `features/entity`): `IdentityRef({ id, label?, size? })`; `TransitionTable({ rows, state, error, onRetry, paging, columns?, caption?, empty?, source? })` over `PeTransaction` (columns `type | hash | status | block | gas | owner | time`, phone cards, rows link to `/platform/tx/$hash`) and `transitionBadgeType(type, batchType)`; `PlatformBlockTable({ rows, …, epochOf? })` over `PeBlockSummary` (its epoch column appears only with `epochOf`).
- **`PageFrame`** moved to `features/entity/PageFrame.tsx` with a `layer` prop (default `'core'`; non-Core pages also pass `eyebrow`) and `share` (default `false`), which draws `CopyLinkButton({ label? })` beside `actions`. Every entity page (one identity, contract, token, name, contest, document, block, transition, epoch, masternode, address) passes `share` (X-10). Act-elsewhere links use `LinkOut` (`ui/link-out.tsx`, §7.2).
- **Mount points.** `app/global-mounts.tsx` renders, deferred and only on first use, `ProofInspectorMount` and `DiagnosticsMount`, mounted once from `AppShell`. Each loads its own module directly (`features/you/proof/ProofInspector.tsx`, exporting `ProofInspector`, and `features/you/diagnostics/Diagnostics.tsx`, exporting `Diagnostics`), so the mount never pulls the whole `features/you` barrel; §7.9 describes the panels. Each sits in its own error boundary: a panel that fails to load or render is dropped, and a later `requestGlobalMount` starts it again. Open them with `requestGlobalMount('proof' | 'diagnostics')`; `ui/proof.ts` gained `onProofInspectorNeeded(load)`, and `openProofInspector` queues its proof until the inspector registers. `registerProofInspector(handler)` returns a function that unregisters it, and does nothing if another handler has since registered.
- **Service worker** (NX-77): `src/sw/sw.ts`, emitted by `build/service-worker.ts` as an unhashed `/sw.js` outside the entry chunk (`size` and `check:bundle` ignore it) and registered by `app/sw-register.ts` after first paint; §9.4.

#### Shared UI (G)

Exported from `@/ui` (not `@/ui/base`), with a `/__kit` section "Shared tools":
- `JsonView({ value, collapsedDepth = 1, copy = true, maxHeight?, bytes?: 'hex' | 'base64', label? })`: a collapsible tree; `bigint` shows as digits with an `n`, `Uint8Array` as `0x…` or `base64:…`, cut in the middle past 64 bytes; 100 entries at a time; cycles and `Map` handled.
- `RangeFilter({ label, value?: string, onChange(value | undefined) })` (`min..max`, validated with `zRange`) and `DateRangeFilter({ label, from?, to?, onChange({ from?, to? }) })` in `ui/table-tools.tsx`. The date filter takes the two fields the schemas use (`from`, `to`) rather than one string.
- `ListModeToggle({ listId })` and `useListMode(listId): { mode: 'pages' | 'scroll'; limit: 10 | 25 | 50 | 75 | 100; setMode; setLimit }`, kept per list in `localStorage` `radar.list.<listId>` (PE-38).
- `EpochClock({ index, startedAt, blocksSoFar?, expectedEndAt?, estimated, size?: 'md' | 'lg' })`: the epoch signature of RADAR-DESIGN §1.2, with a text equivalent (`role="meter"`). It renders `Trans`, so a test needs `I18nProvider`.

#### i18n catalogs (I) and the e2e layout (J)

See §9.1 and §10. An area's strings extract into its own `<pkg>.po`; strings in shared directories go to `messages.po`. An area's route cases are in `e2e/routes/<pkg>.ts` (`RouteCase`, §10).

#### Stories (K)

In `review/stories.yaml`, `radar_start` of RA-02…RA-10 and RA-13 is `/nodes` (the census overview page); the home keeps the headline, RA-01, RA-11 and RA-12.

#### Shared files

The files every area touches are guarded by tests rather than by a freeze:
- `features/entity/site-map.ts`: a page without a route case fails `integration.spec.ts`, a page without stories in `site-map-stories.ts` fails the site-map test, and a page that shows a source its `sources` does not list fails the source-line guard (§10).
- `data/query/keys.ts`: `VIEW_KEY_PREFIXES` must stay disjoint (`keys.test.ts`).
- `data/sdk/methods.ts` and the per-area method files: every method needs a `METHOD_PAGES` row (above).
- Catalogs: a message that appears in two catalogs must read the same in both (`pnpm i18n:check`, §9.1).
- `features/search/resolvers/index.ts`, `features/entity/register.ts` and the feature barrels (`features/<area>/index.ts`) list one entry per line, so two changes that add entries merge by keeping both.
- `THIRD_PARTY.md` (repo root) gets one row per origin at the end of its table; no row is reordered or edited.

---

## 12. Open questions the spikes answer

Each has a primary design (what §§3–4 assume) and a fallback that keeps the same interfaces, so implementation goes ahead now.

### (a) DAPI Core gRPC-web from the browser (T-009)

What it measures: TLS to evonode IPs, CORS, unary and server streams through connect-web, the over-limit reply's shape and whether `ratelimit-*` headers are readable, latency, and whether a match-all bloom filter is accepted.

| Outcome | Design |
|---|---|
| **Works, unary and streams** (expected: the gateway config already allows any origin, exposes the rate-limit headers and synthesises `grpc-status: 8` for grpc-web) | §4 as written |
| **Rate-limit headers unreadable** | Budget relies on the local window only; per-node cap drops to 40/min |
| **Unary works, streams don't** (buffered or cut) | `coreLive.tip` polls `getBestBlockHeight` every 20 s on one node; ChainLock from `getBlock(tip)`'s cbTx best-CL fields; live feed from Hyphen `/stream`; masternode registration fields from RAD's crawl only, labelled "Crawled by Radar" (rule 6 degrades to RAD) |
| **Match-all filter refused** | The address page reads the address's own history from Hyphen (`fallbackHint`, §4.8); Hyphen's `/stream` sends no `mempool_tx` |
| **Browsers can't reach evonodes** (cert or CORS failure on most nodes) | `data/core` serves Core facts from Hyphen `/rawblock` and `/rawtx`, decoded locally, stamped `hyphen`. The façade and decode path don't change. No relay on the edge Worker: it would put every visitor behind Cloudflare's egress IPs and the shared per-IP limit. `@dashevo/dapi-client` is not a fallback for this case: it uses the same gRPC-web endpoints |

**Outcome (2026-11-10, `docs/spikes/dapi-core.md`): works, unary and streams.** §4 stands as written. What the spike adds:
- 96% of enabled mainnet evonodes and 98% on testnet answered. IP-SAN certificates are publicly trusted, CORS reflects any origin, and `grpc-status` and `ratelimit-*` are readable, so the server's headers drive the budget.
- Over the limit: HTTP 200, `grpc-status: 8`, `ratelimit-reset` honoured exactly, with no extra penalty seen. The per-node cap stays at 50/min; bench until `ratelimit-reset`.
- Ports: 443 mainnet, 1443 testnet, for every node that answered (RAD's masternode list doesn't carry the Platform HTTP port).
- Certificates last about 6 days, so treat a TLS failure as a short bench, not a ban.
- `getEstimatedTransactionFee` answers 403 everywhere; nothing in Radar needs it.
- Streams close at 601 s; the 1.35 MB first masternode-list diff means the list stream opens only for the masternode pages, `/nodes`, a masternode hover card and a search for a hash or an IP (§4.12), never for the home.
- Reference code to lift into `data/dapi-core`: `spikes/dapi-core/src/{dapi.ts,pool.ts,gen/}`.

### (b) `core-decode` wasm from rust-dashcore (T-010)

What it measures: build, gzipped size, speed on a 2 MB block, coverage of every special payload (ProReg, ProUpServ, ProUpReg, ProUpRev, cbTx, quorum commitment, MNHF, asset lock, asset unlock), and the masternode list diff.

Interface (fixed in `data/core/types.ts`):

```ts
export interface CoreDecoder {
  block(bytes: Uint8Array, net: NetworkId): Promise<DecodedBlock>
  tx(bytes: Uint8Array, net: NetworkId): Promise<DecodedTx>
  mnListDiff(bytes: Uint8Array, net: NetworkId): Promise<DapiMnListDiff>
  isLock(bytes: Uint8Array): Promise<DecodedIsLock>
}
```

Headers and ChainLocks are decoded in TS (`lib/core/*`), never in wasm, so the home page never loads the decoder.

| Outcome | Design |
|---|---|
| **Builds, ≤ 600 KB gz, full coverage** | wasm in `decode.worker.ts` (Comlink), loaded on first block, tx or masternode view |
| **Works but larger** | Same, plus split exports: a base build (block and tx with payloads) and a separate `mnlist` build loaded only on masternode views. The budget check is then per build |
| **Fails, or misses payloads** | `@dashevo/dashcore-lib` behind the same `CoreDecoder` for structure (inputs, outputs, scripts, addresses, cbTx). Payloads it can't parse come from Hyphen `/tx/{txid}` `payload`, stamped `source: 'hyphen'` ("Indexed by Hyphen"); with Hyphen stale, the raw payload hex shows with a note. Masternode list diff decoding moves to a small TS parser in `lib/core/mnlistdiff.ts`; if that is too much for M2, rule 6 degrades to RAD as in (a) |

**Outcome (2026-11-10, `docs/spikes/core-decode.md`): works; no dashcore-lib fallback.** `packages/core-decode` decodes blocks, transactions and every special payload on the list, checked against Insight's JSON for real mainnet transactions of eight of the nine special types. It is 320 KB gzipped, and a 900 KB block decodes in 15–18 ms. Decisions:
- **`dist/` is committed**, so the app and the main CI job build without Rust; `pnpm test` runs the wasm tests against it. `build:wasm` and `test:rust` rebuild and test it natively; they need binaryen `version_129` and a clang that targets wasm32 (libsecp256k1 is C).
- **The committed `packages/core-decode/dist` is reproducible.** `packages/core-decode/rust-toolchain.toml` pins the Rust toolchain (1.99.1), `scripts/build-wasm.mjs` remaps the cargo, rustup and checkout paths out of the wasm (`--remap-path-prefix`), wasm-bindgen is 0.2.118, and `scripts/postbuild.mjs` refuses to run without binaryen `version_129` (set `RADAR_SKIP_WASM_OPT=1` for a local build that must not be committed). The `core-decode` CI job installs that binaryen release (sha256-checked), rebuilds, and fails if `git diff` shows any change under `dist/`. A change to the Rust sources, the lockfile, the toolchain pin or binaryen therefore needs a rebuilt and committed `dist/` in the same commit.
- **Pinned to rust-dashcore `dev` at 568d5866**, because that is where the special-transaction types live.
- **Gaps:** MNHF has no real mainnet vector (none in the last 30 days), and ProDissolveTx, ProUpShareTx and ProUpSharedRegTx are mapped but untested (they exist only on rust-dashcore `dev`). The UI renders an unknown or failed payload as raw hex with its type number; it never hides the transaction.

**As used.** `data/core/decode.ts`: `createCoreDecoder(load)` maps the wasm output to the contract types on the calling thread. The default decoder runs the wasm in a module worker (`decode.worker.ts`, Comlink) and falls back to the main thread where `Worker` doesn't exist (jsdom). The worker is created through `trustedWorkerUrl` (`data/trusted-worker.ts`), a same-origin-only Trusted Types policy, because `require-trusted-types-for 'script'` reports a plain `new Worker(url)` as a violation. Import a worker as `./x.worker.ts?worker&url` and wrap `new URL(url, location.href)`; Vite doesn't bundle a worker whose `new URL(...)` sits inside another call. The SDK worker is created the same way. `CoreDecoder.isLock` is a small TS parser (DIP-22 v1 layout). `CoreDecoder.mnListDiff` is TypeScript too: DAPI sends the list as CBOR of Core's `protx diff`, not the P2P `mnlistdiff`, so the wasm has no part in it (`parseMnListDiff`, §4.12).

### (c) The Evo SDK in a web worker (T-011)

What it measures: wasm init and trusted-context prefetch inside a module worker, cold-start time on a mid-range phone, whether `*WithProofInfo` results map cleanly to DTOs, whether the transfer of proof bytes works, and how plain calls behave with `trusted: true`.

| Outcome | Design |
|---|---|
| **Works** | §3 as written |
| **Works with a missing global** (`window`, `localStorage`, DOM-only fetch options) | A shim at the top of `sdk.worker.ts`, limited to what the SDK touches, each line commented with the symbol it satisfies |
| **Doesn't work in a worker** | `InlineTransport`: same `impl.ts` on the main thread, loaded with dynamic `import()` from the same chunk boundary, warmed only when idle. Cold-start jank is accepted for Platform views; Core and network pages never load it |
| **Cold start > 6 s on the test phone** | No design change; the `sdk-cold` fallback (§3.3) carries the first view, and warm-up also starts on first idle on every route, not only Platform ones |
| **Some `*WithProofInfo` variant returns data that won't map** | That method uses its plain variant, `proved: false`, listed in `docs/spikes.md`; an upstream issue goes on the plan's §7.2 list |

**Outcome (2026-11-10, `docs/spikes/sdk-worker.md`): works in a module worker behind Comlink**, mainnet and testnet, with full proof metadata. §3 stands. Decisions taken on the results:
- **Split build.** Load the wasm as a separate asset (5.8 MB brotli, cold start 844 ms on localhost) rather than the package default with the wasm inlined in JS (9.1 MB over the wire, 1317 ms). It needs a Vite alias past the package's `exports` map. Guard it with a unit test that fails if the aliased file is missing, so an SDK bump that moves it fails CI instead of production. The inlined build is the fallback.
- **Every SDK call gets a worker-side timeout of 8 s and one retry.** The SDK's own timeout did not stop a call to a dead node (it hung 68–132 s). A second timeout is a `SourceError` of kind `timeout`, and health marks the SDK degraded.
- **Plain calls are proof-verified too.** Keep calling the `WithProof` variants anyway, for the metadata the proof inspector shows.
- **Not-found is a stamped null for every entity.** The worker maps the not-found errors for contracts and tokens to `null` (identities and DPNS names already return `null` plus a proof).
- **DPNS lookups normalise the label** (homograph mapping as DPNS does: o→0, i/l→1, lowercase) before calling the SDK, which doesn't.
- **CSP:** `script-src 'self' 'wasm-unsafe-eval'` and `connect-src 'self' https:` are enough; no COOP/COEP.
- **Version.** 5.0.3, pinned for `@dashevo/evo-sdk` and `@dashevo/wasm-sdk` (the latter is a direct dependency so its `raw` export resolves).
- **As built (M1).** The wasm is 25.5 MiB (26,732,083 bytes), over the 25 MiB per-asset limit of Cloudflare Workers, which `review/serve.mjs` (Miniflare) enforces too. `build/sdk-split.ts` therefore emits it as parts of 16 MiB each (`WASM_PART_BYTES`) through a virtual module (`this.emitFile`, `import.meta.ROLLUP_FILE_URL_*`), and aliases `@dashevo/wasm-sdk/raw` to the package's `wasm_sdk.no_url.js` glue so the whole wasm is never emitted as one file. `data/sdk/worker/wasm-split.ts` fetches the parts in the worker and streams them through a synthetic `application/wasm` `Response` into wasm-bindgen's `init`. The worker build has its own plugin list (`worker.plugins` in `vite.config.ts`). `sdk-split.test.ts` checks that the parts rejoin to the same bytes and that each is under the limit, and guards `SDK_VERSION` and the file layout. The worker and the parts load on first SDK use, never from the entry chunk. Fixture builds omit both and use `FixtureSdkTransport`.

### Not decided by spikes, owned elsewhere

- Hyphen CORS fix, testnet resync, `spentBy` and unconfirmed balance: upstream asks (plan §7.2). When CORS is fixed, `endpoints.ts` points `hyphen` at `https://{hy,ts}.kw.vg/api/v1` and the Worker route is removed. Nothing else changes.
- Bridge prefilled URLs: `lib/linkouts.ts` builds the best URL Bridge supports today. Its unit tests list each target's current URL, so a Bridge change is one edit.
