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
  search.ts                          parseSearch/stringifySearch, network middleware (§6)
  network-context.tsx                useNetwork(), NetworkGate (unknown devnet, unsupported source)
  error-boundary.tsx
routes/                              TanStack file routes: search schema, loader prefetch, page component import. No markup beyond <XPage/>
shell/                               dashhq shell bar and footer, NetworkSwitch, theme (dh_theme), phone nav, testnet keyline, palette mount, bar-overlay.ts (second stylesheet for the bar's shadow root, §11.4), RateNote
features/
  home/                              `/` network pulse
  core/                              blocks, block, tx, address, mempool, rich-list, charts, governance, status
  network/                           nodes, masternodes, mn, map, epochs, protocol, v24, changes, validators
  platform/                          platform home, identity, contract, document, token, names, contests, groups, credits, shielded, …
  tools/                             query (SQL), decoders, transition, verify-message, qr, sdk-reference, api, sources
  you/                               saved, settings, about
  search/                            classify.ts, resolvers/, useSearch, CommandPalette (loaded by CommandPalette.lazy.tsx), /search page
  entity/                            <Entity> (chip + link + hover card), hover-card registry, cross-layer links (X-02)
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
  radar/ pe/ rate/                   client.ts, schemas.ts, queries.ts (queryOptions factories), *.test.ts
  hyphen/                            the same, plus pages.ts (infinite lists), lookups.ts (resolvers), fit.ts (useHyphenFit) (§5.6)
  dapi-core/                         transport.ts (the seam, §4.1), rpc.ts, grpc-web.ts, discovery.ts, nodes.ts, budget.ts, pool.ts,
                                     streams.ts, cache.ts, lazy.ts + production.ts (loads the pool on first use), client.ts, gen/ (protoc output)
  core/                              Core façade the features use: DAPI-first with Hyphen fallback (§4.7), decode bindings, live tip
    types.ts                         CoreClient, decoded block/tx types  ← contract file
    decode.ts, decode.worker.ts      core-decode wasm behind Comlink (§12b)
    live.ts                          coreLive: follows the tip, ChainLock and the transaction feed (§4.6)
  sdk/
    methods.ts                       SdkMethods map: method name → args/result DTO types  ← contract file
    client.ts                        main-thread SdkClient (worker or inline transport), registers the SDK-ready probe
    queries.ts                       sdkQueries factories, platformTipQuery
    proof-store.ts                   LRU of full proofs for the inspector (NX-61)
    worker/sdk.worker.ts             Comlink endpoint
    worker/impl.ts                   method implementations + DTO mapping (runs in worker or inline)
    worker/wasm-split.ts             stands in for the SDK's wasm loader: fetches the wasm parts (§12c)
  trusted-worker.ts                  Trusted Types policy for `new Worker(url)`
ui/                                  design-system components (§7); index.ts is the only import path
  base.ts                            the slice of the kit the shell and first-paint code use (§1.2, §7.5)
  hash.tsx                           Hash and Copy (kept apart from EntityChip so they stay in the entry chunk)
  types.ts                           Layer, Tone, EntityKind, AmountUnit  ← contract file
lib/                                 pure, framework-free: network.ts, units.ts, format.ts, hex.ts, base58.ts, bech32.ts,
                                     core/{header,chainlock,pools,block-ref}.ts, linkouts.ts, time.ts
i18n/                                Lingui setup, locales/<locale>/messages.po, useLocale
test/                                setup.ts, server.ts (exist), msw/handlers/*, fixtures loader, sdk and dapi fixture transports
```

Outside `apps/web`: `packages/core-decode` (Rust → wasm), `workers/edge` (radar-web Worker), `e2e/tests` (Playwright), `review/` (harness), `scripts/` (fixture recorder, seed-node list, size budget).

### 1.2 Dependency rules

Enforced by `import-x/no-restricted-paths` zones in `eslint.config.js` (added by WP-0, §11).

| Module | May import | Must not import |
|---|---|---|
| `lib/**` | nothing internal; small pure deps (`@noble/*`) | React, `data`, `ui`, `features` |
| `data/**` | `lib`, `data/**` | React (except `data/health.ts`, `data/hyphen/fit.ts` and `data/query/batch.ts`, which export hooks), `ui`, `features`, `routes` |
| `data/sdk/worker/**` | `lib`, `data/sdk/methods.ts`, `@dashevo/evo-sdk`, `comlink` | anything else (no React, no DOM) |
| `ui/**` | `lib`, `i18n`, type-only `data/envelope.ts`, `data/health.ts` (`useSourceHealth`) | `features`, `routes`, other `data` |
| `features/<x>/**` | `ui`, `data`, `lib`, `i18n`, `features/entity`, `features/search` (their `index.ts` only) | other features' internals |
| `routes/**` | `features/*/index.ts`, `app/*`, `data/query/*`, `data/*/queries.ts` (for loaders) | `ui` internals, clients directly |
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
- TanStack retry policy (§5.2): retry `network`, `timeout`, `http` 5xx and `rate-limited` up to 2 times; never retry `invalid-response`, `proof-failed`, `unavailable` or `aborted`.

### 2.4 HTTP clients (radar, pe, hyphen, rate)

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
| hyphen | `GET /status` | min `indices.*.indexedHeight` behind Radar's crawled Core height (`chain.blocks` from Radar's `/status`) by > 3 blocks (testnet today: weeks). See §11.4 |
| dapi | header stream / `getBestBlockHeight` | no new header for 20 min |
| sdk | metadata of any recent answer | `timeMs` older than 15 min |

The UI reads health in three places only:
- `SourceLine`: dot colour and the "isn't answering (last good 4 min ago)" text.
- `Card` with a `source` prop: greys its body and overlays the down message when that source is `down`; when it is `stale`, it keeps the content and shows the lag detail.
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
- **Proof first.** `impl.ts` calls the `*WithProof`/`*WithProofInfo` variant whenever one exists, with no settings toggle (unlike the native explorer). Methods without a variant (`system.status`, `system.currentQuorumsInfo`, `dpns.resolveName`, `dpns.isNameAvailable`, `stateTransitions.waitForStateTransitionResult`, `tokens.priceByContract`) set `proved: false`.
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
- **Warm-up.** Three triggers, all `requestIdleCallback`-gated after first paint: on `/` and every Platform route, on hover or focus of a Platform nav link or Platform `EntityChip`, and on the first ⌘K open. Built so far: the home page (its Platform tip query is enabled after the first idle moment, so the SDK loads then).
- **Cold-start fallback (rule 4 applied to time).** Where PE indexes the same figure (Platform height, epoch, identity balance in lists), the card shows the PE value with `fallback: 'sdk-cold'` (`'sdk-down'` once the SDK has failed) until the SDK answer lands; the SDK value then replaces it. The home page does this in `features/home/platform-tip.ts` over `platformTipQuery(net)` (`data/sdk/queries.ts`, one proof-checked `getEpochsInfo` whose proof height is the Platform height). Facts PE doesn't index show `Skeleton` with "Loading the Platform SDK (once per visit)".
- **Stamps.** `proved` is true exactly when the answer carries a proof (a `*WithProof` call); only `data/sdk` sets it. `asOf` is `metadata.timeMs`; an answer with no metadata has `asOfFetched: true` and `asOf = fetchedAt`. An SDK `InvalidArgument` maps to the `invalid-response` kind.
- **Ready probe.** `data/sdk/client.ts` registers `registerSdkReadyProbe((net) => sdk.state(net) === 'ready')` with `data/query/loader.ts` when it loads, which is what lets a loader prefetch an `sdk` item (§6.3); until the SDK module has loaded nothing counts as ready.
- **Proof store.** `proofStore.put(record)` keeps the last 300 full proofs (method, args, meta, bytes) in memory for the proof inspector and evidence export (NX-61). The envelope carries only `ProofMeta` with the record's `id`.
- **Network switch.** The network is part of every query key (§5.1), so a switch reads a different cache; `sdk.warm(newNet)` runs on switch. Nothing is torn down.
- **Testing.** `SdkClient` has two transports, `WorkerTransport` and `InlineTransport` (same `impl.ts`, in-thread), plus `FixtureSdkTransport` (`test/msw/sdk-transport.ts`, §10). `VITE_SDK_TRANSPORT=worker|inline` picks between the first two; worker is the default. `setSdkTransport` swaps the transport: jsdom has no `Worker`, so `test/setup.ts` installs the fixture transport for every unit test, and fixture builds install it at startup (their output has no SDK worker or wasm). `setSdkDevnets(loadDevnets)` in `main.tsx` tells the client where saved devnets are.

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
| `subscribeToMasternodeList` | masternode views (RA-20, HY-10) while mounted | First message is the full list diff; later ones are updates. Decoded by core-decode into `Map<protx, DapiMnEntry>` |

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
  masternodeList(net: NetworkId): Promise<Sourced<Map<string, DapiMnEntry>>>
}
export type BlockRef = { height: number } | { hash: string }
export interface BlockRow { height: number; hash: string; time: number; txCount: number; size: number; chainLocked: boolean; pool?: string }
```

**The fallback rule, exactly:**

1. **Lists** (`blockRows`, the home "latest blocks" beyond the cached ones, the blocks-by-date page). Count `n` = uncached DAPI calls the page needs. If `budget.snapshot(net).pressure === 'ok'` and `budget.canAfford(net, n)`, serve from DAPI. Otherwise serve that page from Hyphen (`/blocks?cursor=` built with `cursorFromHeight`), stamped `{ source: 'hyphen', fallback: 'dapi-budget' }`. After a fallback, that list stays on Hyphen for 2 min (hysteresis), then tries DAPI again on the next page load.
2. **Details** (`block`, `tx`, `prevouts`, `status`, `tip`) stay on DAPI and queue for budget. Only when DAPI health is `down` do they use Hyphen (`/block/{id}` or `/rawblock`, `/tx/{txid}` or `/rawtx`, decoded locally), stamped `fallback: 'dapi-down'`.
3. **Hyphen must be fit to serve.** No fallback when Hyphen's health is `stale` or `down` (testnet today). The list then stays on DAPI and fills rows as budget allows, with the rest as skeleton rows and a "Waiting for DAPI capacity" note.
4. **Labels.** `SourceLine` renders `fallback` as "Indexed by Hyphen · DAPI busy" or "Indexed by Hyphen · DAPI unreachable". The fallback state is also visible on `/status`.

Hyphen keeps the data DAPI can't give at all: addresses, spent flags, rich list, mempool, governance, metrics, validator history. Those calls go straight to `data/hyphen` and aren't fallbacks.

**Prefetch budget.** Route loaders and hover prefetch may issue DAPI calls only when pressure is `ok`, at most 1 call per hover, and only for detail routes (`/block/`, `/tx/`). A router preload passes `{ priority: 'prefetch' }` to `coreQueries.block` and `coreQueries.tx` through the `preload` flag that `blockPrefetch` and `txPrefetch` take, so it queues behind every read a visible page needs; a real navigation uses `detail`. Hover cards pass `prefetch` too.

**What the façade does, as built.**
- Times are ms since the epoch everywhere in `data/core` (`HeaderInfo.time`, `DecodedBlock.time`, `DecodedTx.time`, `BlockRow.time`, `tip.time`, `CoreChainStatus.medianTime`).
- DAPI stamps use `asOf = fetchedAt` (§2.2): a block's time is an event time and never becomes `asOf`. `immutable` is set on a block when its height is at or below the best ChainLock, on a tx when `isChainLocked`, and on prevouts when every previous tx is chainlocked. Hyphen answers copy Hyphen's stamp and add `fallback`.
- `tip` = `getBlockchainStatus` (height, hash) plus a one-header range (time): 2 requests. `chainLock` = a header range of one header from height 1; the stream sends the best ChainLock first, so that is one cheap request. Any header range also refreshes the façade's remembered best ChainLock, which `block()` uses for `chainLocked` (refreshed at most every 10 s).
- Header hashes are X11. A range takes the hash of header *i* from the `prevHash` of header *i+1*; only the last header is hashed, by the wasm decoder (`decodeBlock(header ‖ 0x00)`). `lib/core/header.ts` and `lib/core/chainlock.ts` parse the fields without wasm.
- `blockRows(net, { fromHeight, count })` is newest first: `fromHeight`, then `count - 1` blocks below it. Its DAPI cost is `count` `getBlock` calls plus one ChainLock lookup. `pool` comes from the coinbase scriptSig through `lib/core/pools.ts`.
- `heightAtTime(net, ms)` is the lowest height whose block time is at or after `ms` (the tip's height when `ms` is after the tip). It interpolates over 500-header windows, usually in 2–3 requests.
- `block()` by hash derives the height from the cbTx (DIP-3 on) or the BIP-34 push in the coinbase script (before), or 0 for the genesis block.
- `tx()` costs 2 requests on DAPI (`getTransaction` plus the header of its block for `time`). `prevouts()` costs one `getTransaction` per distinct previous txid, 4 at a time.
- Duff fields in payloads (`cbTx.creditPoolBalance`, `assetLockTx.totalCredit` and `creditOutputs[].value`, `assetUnlockTx.fee`, shared-collateral amounts) are `bigint`; everything else in `payload` is the decoder's plain JSON (numbers, hex strings, a `kind` tag). `DecodedTx.type` for a transaction type the badge palette has no entry for (ProDissolveTx, ProUpShareTx, ProUpSharedRegTx) is `transfer`; `payload.kind` carries the exact type.
- Hyphen fallback, as built: lists use `hyphen.status` (indexed height) then `blocks` or `blocksFrom` (cursor from `cursorFromHeight`); after a fallback the list stays on Hyphen for 120 s without extending the hold. Details (`block`, `tx`, `prevouts`, `tip`) go to Hyphen only when the DAPI health is `down`, and never when Hyphen is `stale` or `down` or the network is a devnet. `status`, `chainLock` and `headers` have no Hyphen fallback.
- `heightAtTime` returns the tip + 1 for a time in the future. The blocks day view takes its rows by height only; block times are not monotonic, so rows have no time filter.
- Every `CoreClient` method takes a trailing `signal?: AbortSignal` (§2.4). Query factories are in `data/core/queries.ts` (`coreQueries`): `[net,'dapi','tip'|'chainlock'|'status'|'block'|'tx'|'prevouts'|'headers'|'height-at-time'|'node-status'|'masternode-list']` and `[net,'view','block-rows']`. Core queries use `staleUnlessImmutable`: 15 s fresh, 5 min once locked, forever only when `immutable` (prevouts that are all found). They are class `live` (memory only; only `immutable` and `structural` queries are persisted).
- `masternodeList` rejects `unavailable`: the masternode-list diff decoder is not in `core-decode`, so `CoreDecoder.mnListDiff` rejects the same way.

**Hyphen fitness.** Pages that add Hyphen-only facts to a Core page (chainwork, spent flags, mempool rows) ask "is Hyphen fit?" before each Hyphen request: the `healthQueries.hyphen` probe has succeeded and the Hyphen source health is neither `stale` nor `down` (rule 3). `useHyphenFit(net)` in `data/hyphen/fit.ts` answers it; testnet's Hyphen lags by weeks, so testnet pages make no Hyphen requests for those facts.

### 4.8 Core pages: where each figure comes from

- **Block** (`/block/$id`, `?page=`): `coreQueries.block` (DAPI `getBlock`, decoded by `core-decode`) gives the header, the transactions (100 a page), the coinbase payload and the ChainLock flag. Difficulty is computed from `bits` (Dash Core's `GetDifficulty`) and shown with `formatSignificant` (`lib/format.ts`: two decimals from 1,000 up, "111,221,977.44", otherwise significant figures), so a testnet difficulty of 0.004011 never reads 0. The `Difficulty` component (`features/core/hy-shared/Difficulty.tsx`) puts `formatFull`, every digit, in the title; the block page, Charts "Now" and Network internals use it, chart tooltips and tables use `formatSignificant`, and axes stay compact. The reward is the sum of the coinbase outputs. The pool is read from the coinbase scriptSig against `lib/core/pools.ts` (`POOL_TAGS`, `coinbaseTagOf`, `poolOfCoinbase`) and shown as "Coinbase tag says <pool>" with the tag text and a note that the miner writes it, so it is not proof; control, bidi and other format characters (`\p{Cc}`, `\p{Cf}`, line and paragraph separators) are removed from the tag first. Chainwork exists only in Hyphen, so it is requested only when Hyphen is fit and carries its own stamp; otherwise the row says "Not in DAPI". `lib/core/block-ref.ts` parses the URL segment (height or hash).
- **Transaction** (`/tx/$txid`): `coreQueries.tx` plus `coreQueries.prevouts` for the fee and input values. Prevouts load for the first 10 inputs (all of them up to 50); "Load all N inputs" fetches the rest, and until then the fee falls back to Hyphen's figure. The fee fallback comes from Hyphen `tx`, only for mined transactions and only when Hyphen is fit. Settlement shows Received, InstantSend, Mined and ChainLocked without inventing times (below). Confirmations come from the live tip (`useFollowTip(net, { key, settled })` in `features/core/follow-tip.ts`): while a transaction or block is not ChainLocked the page's own query is refetched on each new block (one DAPI call per block, none once it is locked). A one-node lock claim reads "ChainLock reported by one node" or "InstantSend lock reported by one node" (`ChainLockBadge`, `InstantSendBadge`, §7.2) on the tx and block pages, in the hover cards, in the home lists and as a tag in the blocks list.
  - **Spend state** (`features/core/tx/spend.ts`, `useOutputSpends.ts`). Each output is `spent`, `unspent`, `unspendable` or `unknown`, never a bare boolean. `unspendable`: the script starts with OP_RETURN (`6a`). Hyphen caches a mined transaction's `/tx` response as immutable, so its `spent` flags stay as they were on the first read; only `spent: true` is trusted from it, because a spend cannot be undone. For every other output that has an address, the page reads that address's current UTXO list (`/address/{a}/utxos?limit=100`, at most 3 pages, 3 lookups at a time, stale after 30 s). An output still in the list is `unspent`; an output missing from a list read to its end, whose snapshot is at or past the transaction's block, is `spent`. `unspent` is offered only while the list's own height is within `UNSPENT_LAG_BLOCKS` (3) of the DAPI tip, and the page shows "as of block N" whenever the index is behind at all. Where no list is available (an output without an address, a failed read, a list cut at 3 pages that doesn't show the output) the state falls back to the transaction page's flag and `asOfHeight` by the same rule. `unknown` is everything else (not mined yet, Hyphen not fit or loading, flag absent, index more than 3 blocks behind), worded "Unknown" or "Unknown: index behind" with a title that says why. Hyphen pages cached while a transaction was unmined carry `asOfHeight: null`; the schemas read that as absent.
  - **Spender.** Hyphen sends `spent` but not which transaction spent the output (upstream ask `spentBy`, plan §7.2, still open). For each visible output the state above calls spent, `findSpender` reads the output address's history (`/address/{a}/txs?limit=100`, at most 3 pages), takes later `direction: 'out'` transactions oldest first and opens each (`/tx/{id}`, at most 8) until one has an input naming `txid:vout`. The row then reads "Spent in <txid>" and links to `/tx/{spender}#in-{n}`; a busy address, a script without an address or a miss reads "Spent · spender not found". Lookups share a limiter (3 at a time) and are cached per output (`['view','tx-spender']`, stale time ∞ once found). Only the first `INITIAL` (10) outputs are looked up, or all once shown.
  - **Value flow.** Above 900 px the drawing puts each node's label on two lines, the amount and then the identity (address, pool or "· change"), so neighbouring labels never share a row; at 900 px and below a stacked bar and a list replace it (`.rx-flow-wide`, `.rx-flow-narrow`). `e2e/tests/core-tx.spec.ts` checks that no two label boxes overlap at 1440, 1100 and 901 px. An unknown pool's text stays inside its summary card on a phone.
  - **Received and mined times.** `useFirstSeen` takes the first-seen time from Hyphen's mempool list (`/mempool/txs?limit=20`, polled) while the transaction is unconfirmed and keeps it once the tx is mined with the page open. A transaction first opened after it was mined has no first-seen time in any source, so Received reads "at or before <block time>". Mined shows the block time.
  - **Transactions that spend nothing.** `totals()` gives a transaction with no inputs (an asset unlock excepted, which carries its own fee) a fee of 0 and so a fee rate of 0: "0 duffs a byte: it spends no coins". `movesNoValue()` (no inputs, no output value, not an asset unlock) replaces the ribbon with "No value moves in this transaction". A coinbase keeps its own "Coinbase transactions pay none" note.
  - **Hyphen-only facts** (spend state, chainwork) are followed by `HyphenOnlyNote` while Hyphen's probe says stale, in the shared sentence (below) and then "<what> come only from Hyphen. Everything else on this page is from DAPI."
  - The Core band draws no page links of its own; the shell's section bar is the one Core navigation.
- **Blocks list** (`/blocks?date=&from=`): `coreQueries.blockRows` (newest first, 20 a page, cursor = the height of the newest row). A day is the UTC range between `heightAtTime(day)` and `heightAtTime(day + 24 h) - 1`; "Older blocks from before this date" continues below the day. Rows fall back to Hyphen inside the façade when DAPI has no headroom, and the stamp says so. A "Coinbase tag says" column shows only when rows carry a pool.
- **Home** (`/`): Core tip and ChainLock (`coreQueries.tip`, `chainLock`; the headline's Height shows from the DAPI status read (`blocks`) as soon as it lands, since the tip read adds only the time, and the headline difficulty uses `formatSignificant`; on a phone a "Core figures" link in the hero jumps to `#core`), the Platform height and epoch (`features/home/platform-tip.ts`: the SDK's proof-checked `epoch.current`, with Platform Explorer's figure stamped `sdk-cold` or `sdk-down` standing in until it lands, §3.3), the masternode census (Radar `summary.crawl`), the latest 12 Core blocks, the latest 8 Platform transitions and 8 pending transactions (Hyphen mempool, only when Hyphen is fit). The hero is a static dot-matrix Equal Earth SVG (`features/home/HomeMap.tsx`; the 50 kB of land dots are a lazy chunk, `map-land.ts`) with one disc per place in Radar's geo data (disc = masternodes, ring = other reachable nodes), a callout on the busiest place, a legend (a filled and a hollow key, the masternode count and the source badge; on a phone one line, "● N masternodes in M places ○ Other nodes" with the source line below, and below 380 px the count alone) and a text list of the top places for screen readers; devnets and a failing Radar show the land and a one-line note. On a phone the two block lanes scroll sideways and open on the newest block, and the header's search icon gives way to the tab bar's Search (§7.6). **On testnet**, while Hyphen's probe says `stale`, the Core zone (`CoreZone.tsx`) shows DAPI-backed figures (height, difficulty, best ChainLock, last block, latest blocks) instead of withholding the card, and `StaleNote` (`data-hyphen-lag`) says what is behind, in the shared sentence (below) followed by "Supply, blockchain size and pending transactions come only from Hyphen and are not live". On a phone the Core zone comes before the activity lists (`.rx-home` is a column at ≤ 640 px, `#core` has order 1, `.rx-home__activity` order 2, with `overflow-anchor: none` so its rows loading never move the page after the "Core figures" jump) and the kicker's tail, the map's colour key and the lede's extra line are trimmed, so the Core card is in the first viewport (HY-01, HY-18).
- **Address** (`/address/$address`, IN-06, HY-08): a new transaction shows a `role="status"` notice (`data-new-transaction`: a badge, a link, the signed amount and, while it is pending, "See unconfirmed activity") above the summary. The badge reads "Unconfirmed transaction" for a transaction DAPI reported while it was pending and "New transaction" for one the fallback found already mined. Summary (balance, unconfirmed, transactions, total received and sent, first and last seen), a QR card, an unconfirmed-activity card, the cursor-paged history and the UTXO card. Amounts use `Amount` and follow the unit setting; testnet addresses show `tDASH`. The QR code is drawn in the browser by the lazily loaded `zxing-wasm` writer, on white so any scanner reads it in either theme; the wasm is fetched only when the card renders. `useAddressActivity` runs `watchAddress` (`features/core/address/live.ts`) while the page is mounted and visible:
  - **DAPI first.** It subscribes to `coreLive.transactions(net)` and checks each decoded transaction locally (`effectOn`). Outputs paying the address count; an input counts when it spends a known output of the address: a row of the page's UTXO query, or an output of a transaction the watcher has already seen. No request is made per transaction. A `block` event drops the confirmed transactions from the pending list and invalidates the summary, history and UTXO queries. Pending entries are stamped `source: 'dapi'`, `proved: false`, with `asOf` = when the page received them.
  - **Hyphen only as the fallback.** Only while `coreLive.txStatus(net).fallbackHint` is on does it read the address's own newest 10 transactions (`hyQueries.addressTxs(…, { limit: 10 })`), every `POLL_MS.addressFallback` (30 s). Ids that appear after the first read are reported as arrivals with `confirmed: true` (Hyphen's address history holds mined transactions only, so in fallback the notice comes when the transaction is mined, without the unconfirmed link). It stops as soon as the hint clears. A transaction DAPI already reported is not reported again.
  - **Hidden tab.** It releases the DAPI subscription (the shared stream closes after its 10 s linger) and stops the fallback. On return it resubscribes and runs one resync (invalidate, then re-check each pending transaction through `hyQueries.tx`).
  - Status is `connecting | live | reconnecting | paused`; the fallback counts as `live`.
  - **What "seen" means.** The node replays the tip block and then dumps its whole mempool before it streams new transactions, with nothing to tell the two apart, so a transaction that was already pending when the page opened arrives like a new one. The page shows each as unconfirmed activity and counts them honestly: "N transactions seen since you opened this page", never "new".
  - Cost per open tab, DAPI path: one `subscribeToTransactionsWithProofs` open per stream lifetime (~590 s) plus the tip read before it, about 0.2 DAPI requests a minute, shared with any other holder; no Hyphen request to watch; three Hyphen refreshes per block (summary, first history page, UTXOs), about 1.2 a minute. Fallback: 2 Hyphen requests a minute plus the same refreshes when something new appears, and a DAPI reopen attempt every 5 minutes. A hidden tab costs nothing.
  The history is cursor-paged 25 transactions a request (`HISTORY_LIMIT`); "Show more" sends Hyphen's `nextCursor` back unchanged, which the Worker lets through (§2.7). When a later page fails, the rows already shown stay, a `role="alert"` line says "The next transactions could not be loaded." and "Try again" asks for the same page. The watcher pauses while the tab is hidden (nothing is fetched; one resync on show).
- **Freshness of the Hyphen index.** `useHyphenFreshness()` (`hy-shared/HyphenGate.tsx`) runs the probe and says whether the index is behind the chain once the probe has measured it. Every page that says so uses one sentence, `useHyphenLagSentence(net, lag)` in `ui/hyphen-lag.ts`: "Hyphen’s <network> index is behind the chain: <lag detail>." (`StaleIndexNotice`, `HyphenOnlyNote` and Home's `StaleNote` add what follows from it). **Mempool** (`/mempool`) shows its `LiveDot` as "Behind" and says "Checked every 15 seconds, but the index is behind the chain, so this is not a live view"; its `Updated` stat becomes `Checked`, with the lag detail as its note. **Status → Hyphen** says "It calls its sync “synced, realtime”, but its index is behind the chain" instead of repeating the claim as a fact.
- **Rich list on phones** (HY-09, D07). At ≤ 640 px the page renders `RichListCompact` (rank, short address, balance and share per line) instead of the card table. Each row is a `<button aria-expanded aria-controls>` with a chevron that turns when it opens; the opened row shows Received, Sent, Transactions and the address link, wrapping at 320 px. A line above the list says "Tap a row for received, sent and transactions". "Show more" and "Back to summary" (scrolls to `#concentration`) sit below. The desktop table is unchanged.
- **Charts and network internals** (HY-02, HY-12): `/charts` has two tabs through `?tab=`: Charts (default) and Network internals (`?tab=internals`), so HY-12 lives at `/charts?tab=internals`, linked from `/status`. `?range=1h|1d|1w|1m|1y|all` maps to a block count and point count for `/metrics/chart` (`all` uses the tip height and 120 points). Each metric has its own colour token (`Metric.hue` in `charts/options.ts`): hash rate `--rx-core-line` (blue), transactions `--rx-plat-line` (teal), difficulty `--dh-accent-forge-select` (ember), supply `--rx-net-line` (navy, pale blue in dark), unspent outputs `--dh-good` (green), credit pool `--rx-id-3` (cyan); the page sets `--rx-l` on a wrapper, which the chart theme reads. All six measure at least 3:1 on the card and at least 18 CIE76 ΔE apart in both themes, which an e2e test checks. ECharts loads through the kit `Chart` (lazy); each chart sits beside a data table with the same figures. Axis labels are formatted for the spacing of the ticks (`axisResolve` in `charts/options.ts`: about five ticks, half a tick as the smallest difference to tell apart),, so a series that varies by a few percent no longer shows five labels that round to the same figure. Internals shows chain size, spendable outputs, hash rate, mempool pressure (a `Meter`), transaction velocity, node version spread, masternode counts and the peers of the node Hyphen indexes from.
- **Rich list and governance** (HY-09, HY-13): the concentration chart groups the top 100 balances into rank bands 1, 2–5, 6–10, 11–25, 26–50 and 51–100 and says it covers the top 100 only. Governance is read-only: "Vote in Governance" is a `LinkOut` to `https://gov.dashhq.org/p/h/<hash>` (`?network=testnet` off mainnet; §7.2) with `rel="noopener noreferrer"`; a proposal's own URL is linked only when `safeProposalUrl` accepts it (`https:` only). Proposal status is derived from Hyphen's fields, and the budget split from the same list, with no second request.
- **Tools** (IN-08, IN-11): verify message (`verify.ts`) recovers the public key from the 65-byte compact signature with `@noble/secp256k1` and `@noble/hashes`, hashes it to an address on the network its prefix names and compares; results are `valid`, `mismatch` (which address did sign) and `error` with a reason. Fields never reach the URL, storage or the network, and a field the classifier calls a secret blocks the check with a warning and is not echoed. The QR reader uses `getUserMedia` with a frame loop over the lazily loaded `zxing-wasm` reader; "Choose a picture" is the fallback. The decoded text goes through `interpretScan`: `dash:` URIs are unwrapped, text over 200 characters is refused, and anything the classifier flags as `secret` or `possible-secret` is refused without being shown or searched; the rest goes to `/search?q=`.
- **Hyphen page conventions** (`features/core/hy-shared/`): `PageFrame` (`data-page`, `data-layer="core"`, eyebrow with the network, one `h1`, document title); `HyphenGate` answers a devnet with `Empty kind="unsupported-network"` before any request (loaders skip the prefetch too); `StaleIndexNotice` says the lag once at the top when the Hyphen probe is `stale`; `TxTypeBadge` maps Hyphen's `txType` names onto `CoreTxType`, falling back to a plain `Badge`. A cursor list is a `DataTable` with a "Show more" button; its state is `loading` while the first page is pending, `error` only when no row is shown, and `empty` when the first page has no rows.
- **Search resolvers** (HY-14): `hy-search` (`hex64`, `text`, `dpns`; cost `index`) calls Hyphen `/search` and maps address, block, transaction, validator and proposal hits (a proposal hit is named by one extra `proposal` lookup, at most five); `hy-address` (`core-address`) says "balance · N transactions" or "no activity seen" and ranks one above the local hit it enriches (a tie keeps the first hit). Both return `[]` without a request when `Classified.warning` is set, on a devnet, and (`hy-search`) when the first class is `int` or the text is under 4 characters unless it is a hash. `dapi-block` and `dapi-tx` look up heights, block hashes and txids. A resolver imports its data module with `await import()`, so the Hyphen client and its schemas stay out of the entry chunk.

### 4.9 Hyphen quirks

A cursor is opaque: send `nextCursor` back unchanged (fixture file names carry a truncated, hashed form of it). `/search` on testnet answers 503 for a height out of range, so `hy-search` skips pure numbers. An address with no activity answers 404, which the client turns into `Sourced<null>`; the page shows an empty state, not an error. Amounts are parsed to `bigint` by the schema (`zBigint`). Hyphen caches a mined transaction's `/tx` response as immutable and an address-history cursor is 358 characters (§2.7, §4.8). A transaction page cached while the transaction was in the mempool carries `asOfHeight: null`.

### 4.10 Masternode page (`/mn/$protx`, `features/network/mn/`)

One page and no tabs yet (`?tab=` is accepted and ignored), built from Radar's `/masternodes/{protx}` alone (`radarQueries.masternode`, stamped `radar`):
- **Header** (`data-masternode-header`): Nodeprint, type (regular or evonode), service address as `host:port` (the port in `--dh-ink-2`), the full ProTx with copy, reachable, PoSe state, version, "Crawled by Radar", and a "Vote in Governance" `LinkOut` (§7.2).
- **KPIs** (`data-masternode-kpis`): uptime over the newest 30 daily buckets (`uptime_daily`, computed in the page), last paid (block and time from `payments`), earned in the window of `returns.paid_90d`, PoSe penalty and ban height.
- **Cards**: the uptime strip (one cell per crawled day, as many days as Radar has), evonode Platform endpoints (`platform.latest` and `platform.daily`: HTTPS and P2P probes, TLS certificate expiry and issuer, height, software versions, Drive protocol, a daily health strip), recent payments (the `payments` array, with the indexed total), where it is (city, hosting, latency, last reached), registration (payout, owner, voting, operator key, collateral outpoint, registered height, PoSe ban and revive heights, Platform node ID) and quorum readiness (`dkg_readiness`).
- **Unknown ProTx.** An unknown ProTx asks the other network (mainnet and testnet only) and offers "Open it on testnet" or "Open it on mainnet" when Radar lists it there; otherwise it offers search. Devnets get "Radar doesn't crawl devnets." Every state has an `h1` ("Masternode" until a record names the page).
- **Not built.** The minimap, rewards-by-epoch bars, "Check now", the special-transaction history and the proof-checked Platform balance need data outside this crawl read (M2).

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
  run: (net: NetworkId, keys: K[]) => Promise<Sourced<Map<K, V | null>>>
}): Batcher<K, V>

/** Backend value first; the SDK value replaces it when the batch lands. */
export function useHydratedFact<K, V>(batcher: Batcher<K, V>, key: K, backend: Fact<V> | undefined): Fact<V> | undefined
```

- Every row calls `useHydratedFact(identityBalance, row.id, { value: row.balance, stamp: pageStamp })`. Calls within the window coalesce into one `identities.balances` call per page (chunks of 100). Each key's result is written to its own query (`[net, 'sdk', 'identity-balance', { id }]`), so the entity page reuses it.
- Hydration runs only for rows that are rendered (virtualised tables hydrate the visible window plus 20 rows).
- The batchers to build are the six from rule 4: `identities.balances`, `tokens.balances`, `tokens.statuses`, `contracts.getMany`, `addresses.getMany`, and DPNS names via `documents.query` with `in` on `records.identity`.
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

Helpers in `app/search.ts`: `zCsv`, `zCsvEnum`, `zRange`, `zIsoDate`, `zPage`, `zLimit`, `zBool01`. Filter changes call `navigate({ search: (s) => ({ ...s, …, page: undefined }), replace: true })`: they replace history and reset paging. Paging and tab changes push.

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
- The loader reads the network from `routeNetwork(deps)`, not from `getActiveNetwork()`, and puts `network` and `net` in `loaderDeps` so a network switch re-runs it.
- `routes` may not import `data/health-queries.ts`; the status route reaches the probes through `data/query/health-probes.ts`.

Built loaders: `/` (census, Platform Explorer, Hyphen probe), `/blocks` (Hyphen probe only; a day's rows are a DAPI list), `/block/$id` and `/tx/$txid` (the one DAPI detail read, awaited, plus the probe), `/address/$address`, `/mempool`, `/rich-list`, `/charts`, `/governance` and `/governance/$hash` (the Hyphen summary query, awaited), `/mn/$protx` (Radar's `/masternodes/{protx}`, an `http` item with `wait`, behind first paint through `loadBehindFirstPaint`; skipped on devnets, which Radar doesn't crawl, and for a ProTx that is not 64 hex characters), `/status` (the health probes) and `/settings`.

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
// column meta: { align?: 'start' | 'end'; numeric?: boolean; phone?: 'title' | 'primary' | 'secondary' | 'hidden'; phoneUnit?: string; filterable?: boolean; width?: string }
// phoneUnit: a short translated unit written after the value on a phone card (`td[data-u]::after`), where no header is shown; Core blocks uses it for "tx"

// Actions out
LinkOut: { to: LinkOutTarget; children?: ReactNode }  // secondary button, external glyph, never amber; renders nothing when linkOutUrl is null
// lib/linkouts.ts:
type LinkOutTarget =
  | { app: 'bridge'; action: 'identity' | 'name' | 'token' | 'contract' | 'platform-address'; id: string; net: NetworkId }
  | { app: 'gov'; action: 'contest-vote'; label: string; net: NetworkId } | { app: 'gov'; action: 'proposal'; hash: string; net: NetworkId }
  | { app: 'gov'; action: 'masternodes'; net: NetworkId }
  | { app: 'pe'; path: string; net: NetworkId } | { app: 'hyphen'; path: string; net: NetworkId } | { app: 'insight'; path: string; net: NetworkId }
linkOutUrl(target): string | null
```

**Link-outs** (`lib/linkouts.ts`, unit-tested target by target). `linkOutUrl` returns the most specific page each app has, and `null` where the app has no page for the network (`pe`, `hyphen` and `insight` cover mainnet and testnet only), in which case `LinkOut` draws nothing.
- Governance (`https://gov.dashhq.org`, `?network=<net>` off mainnet): `proposal` → `/p/h/<hash>`, `contest-vote` → `/names/<label>`. Governance has no page per masternode (its `/masternodes` is the signed-in owner's keyring page), so the masternode page's "Vote in Governance" uses `masternodes` → `/masternodes`, the closest page.
- Bridge (`https://bridge.dashhq.org/`, which redirects to bridge.thepasta.org and keeps the query; `network=<net>` is always sent, since Bridge defaults to testnet): `identity` → `?mode=topup&identity=<id>`, `name` → `?mode=dpns&identity=<id>` (`id` is the owning identity), `platform-address` → `?address=<bech32m>`. Bridge has no screen for one contract or one token, so `contract` → `?mode=contract` and `token` → the landing screen.
- Explorers: `pe` → `pe.dashhq.org` / `testnet.pe.dashhq.org`, `hyphen` → `hy.kw.vg` / `ts.kw.vg`, `insight` → `insight.dash.org/insight` / `insight.testnet.networks.dash.org/insight`, each followed by `path`.

**Quiet sources.** `SourceLine` collapses stamps of the same source, fallback and proof state into one badge (the oldest age). `Card` passes the sources of its header down (`SourceScope`), and a `Stat` or `KeyValue` row inside it with the same source draws no badge of its own. `Stats` (`ui/stat.tsx`) is a row of `Stat`s where only the first of each source carries a badge (it dedupes with `Children.map`, so pass keyed arrays, not Fragments). Badges lose their border and use the ink-2 colour at 12 px, weight 520 (`.rx-src`, `--dh-fs-xs`, `--dh-w-ui`), measured at 6.0:1 or better on every card surface in both themes; stale, down and proof marks keep theirs. A `Stat` value that carries an amount puts its USD companion on its own line and lets the unit wrap, so a figure never leaves its card.

**Lock marks** (`ui/lock-badges.tsx`, exported from `@/ui`). `ChainLockBadge({ locked, claim, unlockedLabel, size })` and `InstantSendBadge({ claim, size })` are the badges of the record pages and cards; `LockMark({ locked, claim, compact })` is the small mark of lists and lanes (`.rx-lockmark`). A `claim` of `'one-node'` draws "reported by one node" instead of the lock glyph (§4.4a). The hover cards (`features/entity/cards/{tx,block}.tsx`) and the home lists (`Activity.tsx`, `Scope.tsx`) use them; the Core pulse tile reads the lock from the tip row of `coreQueries.blockRows`, else shows "ChainLock at N, reported by one node" (`data-claim="one-node"`).

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
| `rate` | Price from {provider} via Platform Explorer | — |
| `local` | Computed in your browser | — |

Age is hidden when `immutable`. The age turns warning orange (`--dh-warn`; amber is reserved for the primary action) past the stamp's `staleAfterMs`, which the query layer sets from the data class (§5.2), and the dot follows `useSourceHealth`. `SourceLine` renders `data-source`, `data-proved` and `data-fallback` attributes, which e2e tests assert on (§10).

### 7.4 Entities and hover cards

`ui/EntityChip` renders the hover card through a registry, so `ui` never imports features:

```ts
// ui/hover-cards.ts
export function registerHoverCard(kind: EntityKind, C: ComponentType<{ id: string }>): void
```

`features/entity/register.ts` registers one card per kind at startup; each card uses the entity's cheapest source (X-06). Features render entities through `features/entity`'s `<Entity kind id label? />`, which builds the route `href` and wraps `EntityChip`. Raw `EntityChip` with a hand-built `href` is only for the kit page.

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
- Settings explains the selected unit once: "Amounts show in {unit}…" and "USD … follows the amount in {unit}" for DASH units, "USD comes first, with the DASH figure after it…" when USD is selected.

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
  id: string                    // 'dapi-block', 'dapi-tx', 'pe-search', 'hy-search', 'sdk-identity', 'mn-join', 'dpns-prefix', …
  accepts: InputClass[]
  cost: 'local' | 'index' | 'dapi' | 'sdk'
  resolve(c: Classified, ctx: { net: NetworkId; signal: AbortSignal }): Promise<SearchHit[]>
}
export function useSearch(q: string, opts: { mode: 'palette' | 'page' }): {
  hits: SearchHit[]             // merged, deduped by kind+id (highest rank wins), sorted by rank
  pending: string[]             // resolver ids still running
  failed: { id: string; error: SourceError }[]
}
```

- **Fan-out.** All resolvers that accept any of the input's classes start in parallel under one `AbortController`. A new keystroke (150 ms debounce in the palette) aborts the previous run. Each resolver has a 4 s timeout. Hits stream into the list as each resolver settles, and one failing resolver never hides another's hits.
- **Cost gates.**
  - `dapi` resolvers run only if `budget.canAfford(net, 1)`; under pressure, `hex64` relies on PE and Hyphen search.
  - `sdk` resolvers run in the palette only once the SDK is `ready` (the palette warms it on open); on `/search` they always run.
  - `local` resolvers (heights, dates, address and key-hash shapes, name guesses) always run. An IP typed in the box is an `index` resolver over Radar's masternode list (`radar-masternode`, via `radarLookups`), which links each match to `/mn/<protx>`.
- **Enter.** Enter acts only after every `local` resolver has settled; remote resolvers get at most 300 ms (`ENTER_GRACE_MS`) after Enter. Then: the best hit if its rank is 100 or more; otherwise, for a typed height, the Core block; otherwise `/search?q=`. A typed height, hash, txid or address therefore always opens its page. Arrow keys cancel a pending Enter.
- **Speculative hits.** A hit may be `speculative`: a reading of the input that no source confirmed (today the local ".dash name" guess). The search page and the palette list confirmed hits by group and show speculative ones apart, under "A guess, not a result", with a "Guess" badge; when nothing is confirmed the page says "No match for “…” as a Core record on …". A confirmed hit for the same entity replaces the guess.
- **No dead ends.** `features/search/offered.ts` holds `UNFINISHED_ROUTES`, the route patterns whose page still renders `RoutePlaceholder`. `useSearch` drops hits that lead to one and the palette's page list leaves them out. A test compares the set with the pages that still render the placeholder, so finishing a page means deleting its route from the set.
- **Ownership.** The resolver set is in `features/search/resolvers/index.ts`. Each feature package adds resolvers for its own entity kinds there (one file per resolver).

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
- Source locale `en`. Ten locales ship, the union of Insight's and Hyphen's: `en, de, fr, es, pt, ja, zh, ru, tr, uk`; `LOCALES` in `src/i18n/locales.ts` is the list and the language menu shows each in its own script. Catalogues: `src/i18n/locales/<locale>/messages.po`, compiled at build. **No catalogue is in the entry chunk**: every one, `en` included, loads as its own chunk through `import.meta.glob`, and `main.tsx` waits for `i18nReady` (the visitor's locale, falling back to `en`) before it renders, so message ids never flash.
- `pnpm i18n:extract` rewrites `apps/web/src/i18n/locales/*/messages.po`; commit the result. `pnpm i18n:check` (`scripts/check-i18n.mjs`, CI, after lint) runs `lingui extract --clean` and fails if any catalogue changed, a locale has no catalogue, any message has no translation or a fuzzy flag, a translation's placeholders or tags differ from the source, or a plural message lacks a category its locale needs (`one`/`other` for en, de, fr, es, pt, tr; `other` only for ja and zh; `one`/`few`/`many`/`other` for ru and uk). Adding a locale is data only: add `{ code, name }` to `LOCALES`, run `pnpm i18n:extract`, translate `locales/<code>/messages.po`, commit; the language menu lists a locale only when its catalogue exists in the build. Hashes, IDs and amounts are never translated; the number and date locale follows the language. A change that adds a string needs all nine translations in the same commit (workflow in `CONTRIBUTING.md`).
- **Marking rules.** In `src/ui` use the global `t` from `@lingui/core/macro`, because the ui tests render without an `I18nProvider`; elsewhere in components `useLingui()` from `@lingui/react/macro`. Tables of labels at module level (`ENTITY_LABELS`, the site map, section labels) hold `msg` descriptors and are rendered through helpers (`entityLabel()`, `pageTitle()`, `pageSummary()`, `sectionLabel()`, `sourceLabel()`, `recordLabel()`, `labelOf()`) that call `i18n._()` at render time; `matchPages` in `features/search/pages.ts` still matches the English titles and keywords. Lists of names use `Intl.ListFormat`.
- **Switching language.** `LanguageSelect` (a native `<select>`) sits in the shell footer (`ShellFooter.tsx`) and in Settings. It saves the choice and sets `<html lang>`. `AppShell` renders the routed `<main>` with `key={locale}`, so a switch remounts the page; without it a component that read the global `t` during render would keep its old text until some other re-render. Text computed outside React, such as the `lag.detail` of a health probe, is translated when it is produced and does not change on a switch until the next probe.
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
  - SDK as `…/sdk/<net>/<method>/<sha256(stable-json(args))>.json`, holding the `WireResult` with proof bytes base64-encoded. Served by `FixtureSdkTransport`, so the worker isn't involved and proof verification isn't rerun.
- Fixture mode is the build flag `VITE_DATA_MODE=fixtures`, set by `build:e2e`. `main.tsx` then starts an MSW browser worker (`src/test/msw/browser.ts`) over the same handlers and slug scheme as the Vitest server, before the app renders, and swaps the two transports. `build/fixture-worker.ts` emits `mockServiceWorker.js` into that build only.
- `record-fixtures.mjs --extra <source>:<path> --only-extra` records just the listed app paths (repeatable) and skips any that already have a file. A spec that visits an entity the pick list doesn't cover adds it this way: for a Core record page that means its Hyphen page as well, because a fit Hyphen is asked for chainwork and spent flags. A transaction page with spent outputs also needs the spender lookups (§4.8): `--extra hyphen:/address/<a>/txs?limit=100 --extra hyphen:/tx/<spender> --only-extra` for each output address and each spender. A spec that waits for a spender lookup to finish needs every page and candidate the lookup opens (up to 3 history pages and 8 transactions), or the run fails on the first request with no recording. The recordings cover the mainnet transactions the specs visit (`5d0c5900:0`, `9f827f91:0`, `e63d8538:3,4,6`, and the coinbase `out-0`). The mempool's second page can't be recorded (the mempool is nearly empty on both networks), so its paging is tested with an MSW override.
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
- Spec files are grouped by area: `core.spec.ts`, `network.spec.ts`, `platform-state.spec.ts`, `platform-history.spec.ts`, `tools.spec.ts`, `unification.spec.ts`. Per-page files can split them (`core-tx.spec.ts`) when they pass 400 lines.
- Projects: `desktop-light`, `desktop-dark` (1440×900), `phone-light` and `phone-dark` (390×844, Pixel 7 profile) for fixtures, each with its colour scheme; `live` for `@live`. A test that is only meaningful on one form skips itself with `test.skip(…)`.
- **First paint** (`app-shell.spec.ts`, "first paint"): a cold deep link to a block and to a transaction must show the shell header while the DAPI read is still held. An init script wraps `__radarCore.block` and `__radarCore.tx` so the test controls when each fixture response is released, and records when the first Core call started (`__coreCallAt`) and when `#root dashhq-bar` appeared (`__shellAt`, a `MutationObserver`). The test asserts the shell appeared before the held call could have finished (`shellAt - callAt` under half of `LOADER_DEADLINE_MS`), then releases the response and expects the page's `h1`. It measures what the loader rule (§6.3) promises, not a wall-clock budget, so machine load does not move it.
- Layout and error checks wait on `settled(page)` (`e2e/helpers/settled.ts`: no `[data-skeleton]` and no `aria-busy="true"` left) before they measure, so they look at a page's data and not its placeholders. The route sweep in `app-shell.spec.ts` checks every registered route for a level-1 heading, no error alert and no sideways scroll; a route that is still a designed empty state is checked for its "what will be here" text instead.
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
- **Search skips pages that are not built (§8.2)** through `UNFINISHED_ROUTES`, and an IP typed in the box finds masternodes in Radar's list.
- **The search dialog is its own chunk (§1.1),** fetched at the first pointer, key or touch event or 1.5 s after first paint, and mounted on first use, so the entry chunk carries neither the dialog nor the resolvers (they load with `useSearch`).
- **A value and its unit are joined by a no-break space, not a 2 px margin (§9.2).**
- **The address page follows DAPI's transaction stream, not Hyphen's `/stream` (§4.6, §4.8),** which never sends `mempool_tx`; `data/hyphen/live.ts` is gone.
- **Dark `--dh-ink-2` is `#b0c6d4` on cards and `#b8d2e2` on the plate (§7.7),** a step above the vendored value.
- **Two Core chart metrics use `--dh-accent-forge-select` and `--dh-good` (§4.8),** outside the blue and teal family of design §4.3, so six chart colours stay apart.
- **The rich list is a compact list on phones (§4.8).**
- **The Hyphen client types its query names from the Worker's allowlist (§2.7).** `HYPHEN_PARAMS` in `workers/edge/src/hyphen-path.ts` is the one list; `data/hyphen/params.ts` imports its type, so a call can't send a name the Worker drops.

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
- Streams close at 601 s; the 1.35 MB first masternode-list diff means the list stream opens only on network pages, never on home.
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

**As used (M1).** `data/core/decode.ts`: `createCoreDecoder(load)` maps the wasm output to the contract types on the calling thread. The default decoder runs the wasm in a module worker (`decode.worker.ts`, Comlink) and falls back to the main thread where `Worker` doesn't exist (jsdom). The worker is created through `trustedWorkerUrl` (`data/trusted-worker.ts`), a same-origin-only Trusted Types policy, because `require-trusted-types-for 'script'` reports a plain `new Worker(url)` as a violation. Import a worker as `./x.worker.ts?worker&url` and wrap `new URL(url, location.href)`; Vite doesn't bundle a worker whose `new URL(...)` sits inside another call. The SDK worker is created the same way. `CoreDecoder.isLock` is a small TS parser (DIP-22 v1 layout), and `mnListDiff` is not decoded yet (it rejects with `unavailable`; the wasm has no decoder for it), so `core.masternodeList` isn't built.

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
