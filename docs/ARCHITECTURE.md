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
shell/                               dashhq shell bar and footer, NetworkSwitch, theme (dh_theme), phone nav, testnet keyline, palette mount
features/
  home/                              `/` network pulse
  core/                              blocks, block, tx, address, mempool, rich-list, charts, governance, status
  network/                           nodes, masternodes, mn, map, epochs, protocol, v24, changes, validators
  platform/                          platform home, identity, contract, document, token, names, contests, groups, credits, shielded, …
  tools/                             query (SQL), decoders, transition, verify-message, qr, sdk-reference, api, sources
  you/                               saved, settings, about
  search/                            classify.ts, resolvers/, useSearch, CommandPalette, /search page
  entity/                            <Entity> (chip + link + hover card), hover-card registry, cross-layer links (X-02)
  <feature>/<page>/                  XPage.tsx, queries.ts (feature hooks and joins), components/, *.test.ts(x)
data/
  envelope.ts                        Sourced<T>, SourceStamp, Fact<T> (§2.1)  ← contract file
  errors.ts                          SourceError (§2.3)
  health.ts                          health registry + useSourceHealth (§2.5)
  endpoints.ts                       per-network base URLs (§2.6)
  http.ts                            fetchSourced(): fetch + timeout + ETag + zod + health reporting
  zod.ts                             shared schema helpers (zBigint, zHex, zIsoDate, …)
  query/
    keys.ts                          key helpers (§5.1)
    stale.ts                         DataClass → staleTime/gcTime/persist (§5.2)
    batch.ts                         createBatcher, useHydratedFact (§5.4)
  radar/ pe/ hyphen/ rate/           client.ts, schemas.ts, queries.ts (queryOptions factories), *.test.ts
  dapi-core/                         nodes.ts, budget.ts, transport.ts, client.ts, streams.ts, cache.ts, gen/ (protoc output)
  core/                              Core façade the features use: DAPI-first with Hyphen fallback (§4.7), decode bindings, live tip
    types.ts                         CoreClient, decoded block/tx types  ← contract file
    decode.ts, decode.worker.ts      core-decode wasm behind Comlink (§12b)
  sdk/
    methods.ts                       SdkMethods map: method name → args/result DTO types  ← contract file
    client.ts                        main-thread SdkClient (worker or inline transport)
    proof-store.ts                   LRU of full proofs for the inspector (NX-61)
    worker/sdk.worker.ts             Comlink endpoint
    worker/impl.ts                   method implementations + DTO mapping (runs in worker or inline)
ui/                                  design-system components (§7); index.ts is the only import path
  types.ts                           Layer, Tone, EntityKind, AmountUnit  ← contract file
lib/                                 pure, framework-free: network.ts, units.ts, format.ts, hex.ts, base58.ts, bech32.ts,
                                     core/header.ts, core/chainlock.ts, linkouts.ts, time.ts
i18n/                                Lingui setup, locales/<locale>/messages.po, useLocale
test/                                setup.ts, server.ts (exist), msw/handlers/*, fixtures loader, sdk and dapi fixture transports
```

Outside `apps/web`: `packages/core-decode` (Rust → wasm), `workers/edge` (radar-web Worker), `e2e/tests` (Playwright), `review/` (harness), `scripts/` (fixture recorder, seed-node list, size budget).

### 1.2 Dependency rules

Enforced by `import-x/no-restricted-paths` zones in `eslint.config.js` (added by WP-0, §11).

| Module | May import | Must not import |
|---|---|---|
| `lib/**` | nothing internal; small pure deps (`@noble/*`) | React, `data`, `ui`, `features` |
| `data/**` | `lib`, `data/**` | React (except `data/health.ts` and `data/query/batch.ts`, which export hooks), `ui`, `features`, `routes` |
| `data/sdk/worker/**` | `lib`, `data/sdk/methods.ts`, `@dashevo/evo-sdk`, `comlink` | anything else (no React, no DOM) |
| `ui/**` | `lib`, `i18n`, type-only `data/envelope.ts`, `data/health.ts` (`useSourceHealth`) | `features`, `routes`, other `data` |
| `features/<x>/**` | `ui`, `data`, `lib`, `i18n`, `features/entity`, `features/search` (their `index.ts` only) | other features' internals |
| `routes/**` | `features/*/index.ts`, `app/*`, `data/query/*`, `data/*/queries.ts` (for loaders) | `ui` internals, clients directly |
| `shell/**` | `ui`, `lib`, `i18n`, `app`, `features/search` (palette) | `data` clients |

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

### 2.2 What `asOf` means per source

| Source | `asOf` | `height` | `immutable` |
|---|---|---|---|
| `sdk` | `metadata.timeMs` (Platform block time of the answer) | `metadata.height` | finalized epochs, historic contract versions |
| `dapi` | `fetchedAt`; tip-relative facts from the header stream | block height | block or tx at or below the best ChainLock height |
| `radar` | the document's crawl or publish time field (each schema names it), else `Last-Modified` | — | no |
| `pe` | `fetchedAt` (indexer lag is a health matter, §2.5) | indexed Platform height when the response has it | no |
| `hyphen` | `fetchedAt` | `asOfHeight` | no |
| `rate` | `fetchedAt` | — | no |
| `local` | computation time | — | inputs' |

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
  asOf?: (body: z.output<S>, res: Response) => number
  height?: (body: z.output<S>) => number | undefined
}): Promise<Sourced<z.output<S>>>
```

`fetchSourced` adds the timeout, reports `{ok, latencyMs, kind}` to the health registry, parses with zod, and maps failures to `SourceError`. HTTP 404 resolves to `Sourced<null>` only with `notFound: 'null'`; otherwise it throws `http`. ETag revalidation is left to the browser HTTP cache (Radar sends `no-cache` with an ETag, so browsers revalidate and get 304s); no manual `If-None-Match`.

```ts
// data/radar/client.ts (shape repeated by pe, hyphen, rate)
export const radar = {
  status: (signal?: AbortSignal) => Promise<Sourced<RadarStatus>>,           // global, not per network
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
- **Hyphen**: base `/x/hy/{mainnet|testnet}` (the edge Worker pass-through; in `vite dev` a proxy in `vite.config.ts` points at the same path). `{asOfHeight, value, nextCursor}` → `Page<T>` with `height = asOfHeight`. Cursors are hex-encoded JSON (`{"asOfHeight":H,"height":h}`). `hyphen.cursorFromHeight(asOfHeight, height)` builds one, so "jump to height" works without walking. `/stream` is read with `readNdjson(res.body, signal): AsyncIterable<HyStreamEvent>`.
- **Radar**: absolute base `https://radar.dashhq.org/api/v1`. `{net}` is `mainnet|testnet` only.
- **Rate**: `rate.usd(signal)` reads PE mainnet `/rate` → `Sourced<{ usd: number; provider: string }>`, used on every network. Testnet never shows fiat.

**zod conventions** (`data/zod.ts`):
- Schemas live in `<source>/schemas.ts`, one per endpoint, named `XxxSchema`; types are `z.output<typeof XxxSchema>` exported as `Xxx`.
- Objects are non-strict (unknown keys stripped). Fields Radar reads are required; fields it doesn't read are left out.
- Amounts become `bigint` at the edge: `zBigint` accepts a number or a numeric string. Duffs, credits and token units are `bigint` everywhere after parsing; heights, counts and times are `number`.
- Hashes become lower-case hex (`zHex64`); Hyphen and Radar already send lower case, PE sends upper case.
- Times become ms epoch numbers (`zIsoDate`, `zUnixSeconds`).
- A schema failure throws `invalid-response`, marks the source `degraded`, and logs the zod issue path with `console.error` in every build (so the issue is visible in reviewers' consoles).

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
  report(net: NetworkId, source: SourceId, r: { ok: boolean; latencyMs: number; kind?: SourceErrorKind }): void
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
| `down` | 3 consecutive failures of kind `network`/`timeout`/`http` 5xx, or no success in the last 120 s while calls are failing. Recovers on the next success |
| `stale` | Lag over the source's threshold (below) |
| `degraded` | ≥ 25 % failures over the last 20 calls, any `invalid-response` in the last 5 min, or (dapi) budget pressure `tight`/`exhausted` |
| `slow` | p50 latency over the last 10 calls > 3 s (dapi, sdk: > 5 s) |
| `ok` | at least one success, none of the above |
| `unknown` | no calls yet |

Freshness probes are TanStack queries under `[net, 'health', source]`, refetched every 60 s while visible. They run only when a mounted card uses that source, or on `/status`:

| Source | Probe | Stale when |
|---|---|---|
| radar | `GET /api/v1/status` | network's last crawl > 45 min (Radar's own rule) |
| pe | `GET /status` | indexer height behind Tenderdash height by > 10 blocks, or the PE status reports itself unhealthy (503) |
| hyphen | `GET /status` | min `indices.*.indexedHeight` behind the DAPI tip by > 3 blocks (testnet today: weeks) |
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
| quorums (node list, SDK trust) | `https://quorums.mainnet.networks.dash.org` | `https://quorums.testnet.networks.dash.org` | config `quorumUrl` or `https://quorums.<name>.networks.dash.org` |
| DAPI default port | 443 | 1443 | from config |
| radar | `https://radar.dashhq.org/api/v1/mainnet` | `…/testnet` | none |
| pe | `https://api.pe.dashhq.org` | `https://api.testnet.pe.dashhq.org` | none |
| hyphen | `/x/hy/mainnet` | `/x/hy/testnet` | none |
| rate | PE mainnet `/rate` | none | none |

`endpoint(net, source)` returns `null` where a cell says none; the client then throws `unavailable` without a request, and cards render `Empty kind="unsupported-network"`.

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
  /** Idempotent. Resolves when the SDK for that network is connected and its trusted context is prefetched. */
  connect(cfg: SdkNetworkConfig): Promise<{ sdkVersion: string; protocolVersion: number; tookMs: number }>
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
}
export const sdk: SdkClient
export const sdkQueries: { [M in SdkMethodName]: (net: NetworkId, args: SdkMethods[M]['args']) => QueryOptions } // generated from the map
```

- **Lazy loading.** `sdk.worker.ts` is created with `new Worker(new URL('./worker/sdk.worker.ts', import.meta.url), { type: 'module' })` on the first `warm` or `call`. The SDK package is imported only inside the worker, so it never enters the main bundle. `scripts/size.mjs` fails the build if `@dashevo/evo-sdk` appears in any main-thread chunk.
- **Warm-up.** Three triggers, all `requestIdleCallback`-gated after first paint: on `/` and every Platform route, on hover or focus of a Platform nav link or Platform `EntityChip`, and on the first ⌘K open.
- **Cold-start fallback (rule 4 applied to time).** Where PE indexes the same figure (Platform height, epoch, identity balance in lists), the card shows the PE value with `fallback: 'sdk-cold'` until the SDK answer lands; the SDK value then replaces it. Facts PE doesn't index show `Skeleton` with "Loading the Platform SDK (once per visit)".
- **Proof store.** `proofStore.put(record)` keeps the last 300 full proofs (method, args, meta, bytes) in memory for the proof inspector and evidence export (NX-61). The envelope carries only `ProofMeta` with the record's `id`.
- **Network switch.** The network is part of every query key (§5.1), so a switch reads a different cache; `sdk.warm(newNet)` runs on switch. Nothing is torn down.
- **Testing.** `SdkClient` has two transports, `WorkerTransport` and `InlineTransport` (same `impl.ts`, in-thread), plus `FixtureTransport` in tests (§10). `VITE_SDK_TRANSPORT=worker|inline` picks between the first two; worker is the default.

---

## 4. DAPI Core client (`data/dapi-core`, façade in `data/core`)

### 4.1 Transport

`@connectrpc/connect-web` `createGrpcWebTransport({ baseUrl: node.url, useBinaryFormat: true })`, generated with `@bufbuild/protoc-gen-es` from `platform/packages/dapi-grpc/protos/core/v0/core.proto` into `data/dapi-core/gen/` (checked in; `pnpm gen:dapi` regenerates). `broadcastTransaction` is removed from the generated service, along with `getEstimatedTransactionFee`, which Radar doesn't use.

Facts that shape the client (dashmate gateway, `templates/platform/gateway/envoy.yaml.dot`):
- CORS allows any origin and exposes `grpc-status`, `grpc-message`, `ratelimit-reset`, `ratelimit-limit` and `ratelimit-remaining`. Over-limit replies are HTTP 200 with `grpc-status: 8` and `ratelimit-reset` as headers.
- The limit is per client IP per node: 150 requests per minute by default. A stream counts as one request when it opens.
- Core streams end after at most 601 s (`max_stream_duration`). Unary requests time out upstream at 10 s.
- `getMasternodeStatus` takes no arguments: it reports the status of the node that serves it. Radar uses it only to ask an evonode about itself on its `/mn/` page.

### 4.2 Node discovery and selection (`nodes.ts`)

1. **Discover.** `GET {quorums}/masternodes` (CORS `*`; about 370 entries on mainnet). Keep `status === 'ENABLED' && versionCheck === 'success'` (242 on mainnet and 41 on testnet on 2026-11-10). URL: `https://{ip}:{platformHTTPPort ?? defaultPort}`. Cache the list in IndexedDB for 1 h. If discovery fails, use `scripts/seed-nodes.mjs` output bundled at build (`data/dapi-core/seed.<net>.json`, 30 nodes). Devnets use their configured `dapiAddresses`.
2. **Active set.** At session start, pick 8 nodes at random. This keeps HTTP/2 connections warm and spreads load across visitors. When a node is benched, replace it with a random unused one.
3. **Choose per request.** Pick the active, unbenched node with the most budget headroom, breaking ties by lowest latency EWMA (α = 0.3). Never use a node more than 2 blocks behind the best tip seen for height-sensitive calls (`getBestBlockHeight`, `getBlock` by height near the tip).

### 4.3 Budget (`budget.ts`)

| Limit | Value | Why |
|---|---|---|
| Per node | ≤ 50 requests in any rolling 60 s, ≤ 4 in flight | Under the 60/min target, well under dashmate's 150, leaving room for other tabs and for visitors behind one NAT |
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

Requests over budget wait in a priority queue: detail pages first, then lists, then prefetch. They never go out early.

### 4.4 Racing, retries, benching

- **Hedge.** A unary call goes to node A. If A hasn't answered after 1.5 s and pressure is `ok`, the same call goes to node B; the first success wins and the other is aborted. Both count against the budget.
- **Attempts.** 8 s timeout per attempt; at most 3 attempts on distinct nodes.
- **Bench table:**

| Signal | Bench for |
|---|---|
| `grpc-status: 8` (RESOURCE_EXHAUSTED) or HTTP 429 | `ratelimit-reset` seconds if readable, else 60 s |
| Fetch failure (refused, TLS, CORS, DNS) | the rest of the session |
| `UNAVAILABLE` (14), `DEADLINE_EXCEEDED` (4), HTTP 5xx, timeout | 60 s; 10 min after 3 strikes |
| Behind the best tip by > 2 blocks | excluded from height-sensitive calls until it catches up |
| `NOT_FOUND` (5) | no bench: it is an answer (`Sourced<null>`) |

Benching updates `healthRegistry` for `dapi`. The source is `down` when every node in the active set and 8 replacements have failed within 2 min.

### 4.5 Cache (`cache.ts`, IndexedDB `radar-core`, via `idb`)

| Store | Key | Value | Written when |
|---|---|---|---|
| `blocks` | `net:hash` | raw bytes, height | height ≤ best ChainLock height |
| `heights` | `net:height` | hash | same |
| `txs` | `net:txid` | raw bytes, blockHash, height, `isChainLocked: true` | its block is chainlocked |
| `headers` | `net:height` | 80-byte header, hash | same |
| `meta` | `net:nodes` | discovered node list | every discovery (1 h TTL) |

- Mempool and unlocked answers are never written; they live only in TanStack memory.
- Reads check the cache before the budget is touched; a hit costs nothing and returns `immutable: true`.
- Size cap 200 MB per origin, LRU by `lastRead`, trimmed to 150 MB at startup and every 10 min. Quota errors disable writes for the session; reads keep working.
- Decoded JSON is not stored; decoding is cheap compared with fetching.

### 4.6 Streams (`streams.ts`)

All streams are shared and reference-counted per network: the first subscriber opens one, the last unsubscribe closes it after a 10 s linger.

| Stream | Opened by | Behaviour |
|---|---|---|
| `subscribeToBlockHeadersWithChainLocks` (live: `fromBlockHeight = tip`, `count = 0`) | `coreLive.tip`, mounted by the shell on every page | Emits `{ height, hash, time }` per header and `{ height, hash }` per ChainLock (decoded in `lib/core/header.ts`, `lib/core/chainlock.ts`, no wasm). Updates `[net,'dapi','tip']` and `[net,'dapi','chainlock']` with `setQueryData`, and invalidates `[net,'view','latest-blocks']` |
| same RPC, `count = N` | `core.headers(from, n)` | Historic header range in one request (heights and times for lists, date binary search). N ≤ 2000 |
| `subscribeToTransactionsWithProofs`, match-all bloom filter (`vData = [0xff]`, `nHashFuncs = 1`) | the live feed card (IN-01), while visible | Raw txs and IS locks. Falls back to Hyphen `/stream` `mempool_tx` if the node refuses the filter or sends nothing for 60 s while the tip moves |
| `subscribeToMasternodeList` | masternode views (RA-20, HY-10) while mounted | First message is the full list diff; later ones are updates. Decoded by core-decode into `Map<protx, DapiMnEntry>` |

Reconnects: on end or error, reopen on a different node, resuming from the last height + 1, with backoff 1, 2, 4 … 30 s. The 601 s server cap means a clean reconnect about every 10 min; that's expected and not a health event. If the header stream fails 3 times in a row, `coreLive.tip` switches to polling `getBestBlockHeight` every 30 s and keeps trying the stream every 2 min.

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

**Prefetch budget.** Route loaders and hover prefetch may issue DAPI calls only when pressure is `ok`, at most 1 call per hover, and only for detail routes (`/block/`, `/tx/`).

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

- Polling uses `refetchInterval` with `refetchIntervalInBackground: false`, so hidden tabs never poll.
- `refetchOnWindowFocus` is off globally, and on for `live` and `index`.
- Retry: `retry: (n, e) => n < 2 && retryable(e)`, `retryDelay: (n, e) => e.retryAfterMs ?? 1000 * 2 ** n` (§2.3).

### 5.3 Persistence

`experimental_createQueryPersister` with an `idb-keyval` store (`radar-query`), and `serialize`/`deserialize` set to identity, so IndexedDB's structured clone keeps `bigint`, `Map` and `Uint8Array`. Only queries with `meta.persist === true` (classes `immutable` and `structural`) are persisted. `maxAge` 7 days; `buster` = app version + `SCHEMA_VERSION` (bump when any DTO or schema changes shape). Raw Core bytes have their own store (§4.5); the persister holds decoded DTOs and backend answers.

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
- Hyphen `/stream` is opened only for address pages (IN-06 new-tx notice) and as the live-feed fallback.

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

Loaders prefetch HTTP sources freely. They prefetch DAPI and SDK only under the §4.7 prefetch budget, and the SDK only when it's already `ready`.

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
// column meta: { align?: 'start' | 'end'; numeric?: boolean; phone?: 'title' | 'primary' | 'secondary' | 'hidden'; filterable?: boolean; width?: string }

// Actions out
LinkOut: { to: LinkOutTarget; children?: ReactNode }  // secondary button, external glyph, never amber
// lib/linkouts.ts:
type LinkOutTarget =
  | { app: 'bridge'; action: 'identity' | 'name' | 'token' | 'contract' | 'platform-address'; id: string; net: NetworkId }
  | { app: 'gov'; action: 'contest-vote'; label: string } | { app: 'gov'; action: 'proposal'; hash: string }
  | { app: 'pe'; path: string; net: NetworkId } | { app: 'hyphen'; path: string; net: NetworkId } | { app: 'insight'; path: string; net: NetworkId }
```

### 7.3 `SourceLine` wording (i18n messages in `ui/source-labels.ts`)

| Stamp | Text | Glyph |
|---|---|---|
| `sdk`, `proved` | Proof-checked | check; opens the proof inspector |
| `sdk`, not proved | Served by DAPI · not proved | — |
| `sdk`, `fallback: 'sdk-cold'` on a PE value | Indexed by Platform Explorer · checking… | spinner |
| `dapi` | Served by DAPI | node on hover |
| `radar` | Crawled by Radar · 6 min ago | — |
| `pe` | Indexed by Platform Explorer · 12 s ago | — |
| `hyphen` | Indexed by Hyphen · 30 s ago | — |
| `hyphen`, `fallback` | Indexed by Hyphen · DAPI busy / DAPI unreachable | — |
| `rate` | Price from {provider} via Platform Explorer | — |
| `local` | Computed in your browser | — |

Age is hidden when `immutable`. The age turns warning orange (`--dh-warn`; amber is reserved for the primary action) past the data class's staleTime × 4, and the dot follows `useSourceHealth`. `SourceLine` renders `data-source`, `data-proved` and `data-fallback` attributes, which e2e tests assert on (§10).

### 7.4 Entities and hover cards

`ui/EntityChip` renders the hover card through a registry, so `ui` never imports features:

```ts
// ui/hover-cards.ts
export function registerHoverCard(kind: EntityKind, C: ComponentType<{ id: string }>): void
```

`features/entity/register.ts` registers one card per kind at startup; each card uses the entity's cheapest source (X-06). Features render entities through `features/entity`'s `<Entity kind id label? />`, which builds the route `href` and wraps `EntityChip`. Raw `EntityChip` with a hand-built `href` is only for the kit page.

### 7.5 Palette and kit page

- `CommandPalette` (cmdk inside a Radix dialog) is exported from `features/search`, mounted once by `shell/`, and opened with ⌘K / Ctrl+K, `/`, or `useCommandPalette().open(initialQuery?)`.
- `/__kit` (dev and e2e builds only) renders every component in every state, light and dark. Playwright screenshots it, and axe checks it.

---

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
  - `local` resolvers (ProTx and IP over the cached masternode join, saved items, route names) always run.
- **Enter.** With exactly one rank-100 hit, Enter navigates to it; otherwise it opens `/search?q=`.
- **Ownership.** The resolver set is in `features/search/resolvers/index.ts`. Each feature package adds resolvers for its own entity kinds there (one file per resolver).

---

## 9. i18n, units, errors and empty states

### 9.1 i18n (Lingui 5)

- `@lingui/vite-plugin` + `@lingui/babel-plugin-lingui-macro` (through `@vitejs/plugin-react`'s babel option). Messages use the macros `` t`…` ``, `<Trans>`, `<Plural>`, with ICU syntax. No string concatenation of translatable text.
- Source locale `en`. Ten locales, the union of Insight's and Hyphen's: `en, de, es, fr, ja, pt, ru, tr, uk, zh-Hans`. Catalogues: `src/i18n/locales/<locale>/messages.po`, compiled at build and lazy-loaded per locale. Machine translation (D6) runs as `pnpm i18n:translate`; CI runs `lingui extract --clean` and fails if `en` has untranslated or obsolete IDs in the committed catalogue.
- Locale choice: `localStorage` `radar.locale`, else the first match in `navigator.languages`, else `en`. `<html lang>` follows it.
- Formatting goes only through `lib/format.ts` (`formatNumber`, `formatInt`, `formatPercent`, `formatBytes`, `formatDuration`, `formatDate`), built on `Intl` with the active locale. Hashes, IDs and heights are never localised (heights get grouping separators; hashes don't).
- Times: absolute times in the viewer's time zone with the zone abbreviation; the tooltip always shows ISO UTC. Settings has a "Show times in UTC" switch (`radar.utc`).

### 9.2 Units and fiat (`lib/units.ts`)

- Base units are `bigint` throughout: duffs (1 DASH = 10⁸), credits (1 DASH = 10¹¹), token base units with the token's decimals.
- Display unit preference `radar.unit` ∈ `AmountUnit` (default `DASH`) applies to Core amounts and credits shown as DASH. Credits also show their raw count on hover. Testnet labels the unit `tDASH` (and `tmDASH`, …).
- Fiat: USD only, from `rate`, rounded to three significant figures (family PRICE rule), shown after the DASH figure, never instead of it. Testnet and devnets show no fiat.
- Conversion and formatting are integer-exact (`bigint` division with remainder), and unit-tested against Hyphen's and Insight's renderings.

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
| Decoder | `cargo test` + Vitest vectors | `packages/core-decode` | `pnpm test` |

**Fixtures.**
- `scripts/record-fixtures.mjs --net mainnet|testnet` reads `review/fixtures/<net>.json` (the picked entities, §5.4 of the plan) and records:
  - HTTP sources as `apps/web/src/test/fixtures/http/<source>/<net>/<slug>.json`: `{ request: { method, url }, recordedAt, status, headers, body }`. MSW handlers in `src/test/msw/handlers/<source>.ts` serve them by URL (query string normalised).
  - DAPI as `…/dapi/<net>/<method>/<sha256(request bytes)>.bin` (raw response message) plus stream transcripts as `….ndjson` (base64 messages). Served by `FixtureDapiTransport`, which replaces the Connect transport.
  - SDK as `…/sdk/<net>/<method>/<sha256(stable-json(args))>.json`, holding the `WireResult` with proof bytes base64-encoded. Served by `FixtureSdkTransport`, so the worker isn't involved and proof verification isn't rerun.
- Fixture mode is the build flag `VITE_DATA_MODE=fixtures` (used by `build:e2e`). It starts the MSW browser worker and swaps the two transports. A request with no fixture fails the test with the URL or method it wanted, never a silent empty.
- The fixtures' `recordedAt` drives a frozen clock in fixture e2e (`page.clock.setFixedTime`), so ages are stable in screenshots.

**Story tags.**
- Every Playwright test title carries its story IDs as tags: `test('block page shows header, cbTx, reward and pool @IN-03 @HY-05', …)`.
- `review/check-stories.mjs` (in CI) fails if a story in `review/stories.yaml` has no test or a tag names no story.
- Spec files are grouped by area: `core.spec.ts`, `network.spec.ts`, `platform-state.spec.ts`, `platform-history.spec.ts`, `tools.spec.ts`, `unification.spec.ts`. Per-page files can split them (`core-tx.spec.ts`) when they pass 400 lines.
- Projects: `desktop` (1440×900) and `phone` (390×844, Pixel 7 profile) for fixtures; `live` for `@live`.
- Assertions use roles and accessible names first. Provenance assertions use `SourceLine`'s attributes (`[data-source="dapi"]`, `[data-proved="true"]`). `data-testid` is allowed only where no role fits.

**Live smoke (`@live`).** About 25 tests, each touching one source on one network, so a failure points at a source: home tip and ChainLock (DAPI), block and tx pages (DAPI + decode), masternode list join (DAPI + RAD), `/mn/` evonode, identity proof-checked (SDK), contract documents (SDK), PE transitions list, Hyphen address (mainnet), Hyphen fallback forced by `?debug=budget-exhausted` (dev flag), status page with every source, search for each input class. They run with retries 2, serially (`workers: 1`), so one CI run stays well inside the DAPI budget. `@smoke` stays the scaffold's "app boots" check.

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
| **Match-all filter refused** | Live feed from Hyphen `/stream` `mempool_tx` (already the in-flight fallback) |
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
- **`dist/` is committed**, so the app and the main CI job build without Rust. `build:wasm` and `test:rust` rebuild and test it natively; they need a native `wasm-opt` and a clang that targets wasm32 (libsecp256k1 is C). Package E adds a separate CI job that rebuilds the wasm and fails if `dist/` differs.
- **Pinned to rust-dashcore `dev` at 568d5866**, because that is where the special-transaction types live.
- **Gaps:** MNHF has no real mainnet vector (none in the last 30 days), and ProDissolveTx, ProUpShareTx and ProUpSharedRegTx are mapped but untested (they exist only on rust-dashcore `dev`). The UI renders an unknown or failed payload as raw hex with its type number; it never hides the transaction.

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
- **Version.** The spike ran 5.0.3. The repo pins 5.0.2 until 5.0.3 clears the 7-day release-age rule (2026-11-10 19:40 UTC); package E bumps it.
- Reference code to lift into `data/sdk`: `spikes/sdk-worker/src/`.

### Not decided by spikes, owned elsewhere

- Hyphen CORS fix, testnet resync, `spentBy` and unconfirmed balance: upstream asks (plan §7.2). When CORS is fixed, `endpoints.ts` points `hyphen` at `https://{hy,ts}.kw.vg/api/v1` and the Worker route is removed. Nothing else changes.
- Bridge prefilled URLs: `lib/linkouts.ts` builds the best URL Bridge supports today. Its unit tests list each target's current URL, so a Bridge change is one edit.
