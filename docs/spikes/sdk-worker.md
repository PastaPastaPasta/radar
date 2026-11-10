# T-011 spike: Dash Evo SDK in a Web Worker behind Comlink

**Verdict: it works.** `@dashevo/evo-sdk@5.0.3` (wasm-sdk 5.0.3, protocol 14) runs in a module Web Worker behind Comlink. It connects to mainnet and testnet, returns proof-verified answers with full proof metadata, and needs only `script-src 'self' 'wasm-unsafe-eval'` plus a broad `connect-src`. It needs no COOP/COEP. There are three things to handle: a bundling choice, a hang risk on dead DAPI nodes, and a few SDK quirks (below).

Everything was driven with Playwright headless Chromium (1.65) against a Vite page served from localhost. Data comes from the live networks. Machine: strixbox, 28 CPUs at low scheduling weight, so wall-clock numbers are noisy. Network RTT to DAPI nodes is ~100 ms TCP and ~200 ms through TLS.

Project: `/work/scratch/radar-m0/spike-sdk/`
- Reusable worker code: `src/worker.ts` (Comlink API), `src/ops.ts` (read whitelist), `src/convert.ts` (wasm-object → cloneable data, base58). `src/netlog.ts` is spike instrumentation: fetch logging, a tamper hook and a wasm-memory probe. Drop it for production.
- Harness: `scripts/run.mjs` (full scenario), `scripts/bench-cold.mjs` (N=5 cold and warm), `scripts/quick.mjs` (CSP and isolation matrix), `scripts/failover.mjs` (dead-node pool). Run them from the project root.
- Raw results: `results-{embedded,split}-strict-0.json`, `bench-*.json`, `sizes.json`.

## 1. What was exercised (all `*WithProof`, mainnet and testnet)

| op (worker name) | SDK call | notes |
|---|---|---|
| `identity.fetch` / `identity.balance` / `identity.keys` | `identities.fetchWithProof` / `balanceWithProof` / `getKeysWithProof({request:{type:'all'}})` | |
| `dpns.byName` / `dpns.usernames` | `dpns.getUsernameByNameWithProof` / `usernamesWithProof` | see quirk Q1 |
| `contract.fetch` | `contracts.fetchWithProof` | |
| `dpns.domainsByPrefix` | `documents.queryWithProof` on DPNS `domain`, `startsWith` on `normalizedLabel` | |
| `token.totalSupply` | `tokens.totalSupplyWithProof` | mainnet only (no testnet token id was at hand) |
| `epoch.current` / `epoch.info` | `epoch.currentWithProof` / `epochsInfoWithProof` | |
| `protocol.upgradeState` | `protocol.versionUpgradeStateWithProof` | |
| `system.totalCredits` | `system.totalCreditsInPlatformWithProof` | |

Real inputs came from `api.pe.dashhq.org`: identity `BjixEUbq…iYqp` (alias `pshenmic.dash`), DPNS contract `GWRSAVFM…S31Ec`, token `AxAYWyXV…mzsB` (supply 2.1e15). Testnet inputs were discovered through a DPNS document query on testnet itself (`a00.dash`, `43eotCGD…YMA`).

Every call returned `ok`. Sample proof metadata (mainnet, `identity.fetch`):
```
height 468963, coreChainLockedHeight 2570006, epoch 88, timeMs 1794322771100, protocolVersion 14,
chainId "evo1", quorumHash 0000000000000009d4409d0b…d17c, quorumType 4, round 0,
blockIdHash 6ea23ddd…2120, signature (96-byte BLS, hex), proofSize 3013 bytes, verified true
```
Testnet reports chainId `dash-testnet-51`. The metadata comes from `ProofMetadataResponse.{metadata,proof}`; the worker flattens it into `ProofMeta`.

**"Verification status" is not a field the SDK exposes.** `*WithProof` only resolves after wasm has verified the GroveDB proof and the quorum BLS signature against the trusted context; on failure it throws. So `verified: true` is true by construction. Proof sizes are 0.4–4.4 KB, and the gRPC response is about 230 bytes larger than the proof (metadata and signature).

### Are plain (non-WithProof) calls proof-verified anyway? Yes.
Three pieces of evidence:
1. Wire traffic is byte-identical between the plain and `WithProof` call (for example `getIdentity` returns 3243 bytes both ways), so plain calls request and receive proofs.
2. With a tamper hook in the worker (`setTamper`; flips one byte at 50% or 80% of every Platform gRPC response), both the plain and the `WithProof` calls reject with `grovedb: invalid proof: V1 mismatch in lower layer hash …`. This held for `identity.fetch` and `identity.balance`, at both byte positions.
3. `new EvoSDK({network:'mainnet'})` (no trusted context) connects, but every read then fails with `quorum key unavailable … Non-trusted mode is not supported in WASM`. Plain calls need the quorum keys too.

The SDK also has a deliberately unproved path (`identities.fetchUnproved`, `proofs:false`). With `proofs:false`, plain `identity.balance` is refused with "unproved queries are not supported for this query; enable proofs". The worker never exposes either. Recommendation: use the `WithProof` variants anyway, because they are the only way to get metadata.

## 2. Numbers

### Download size
| variant | file | raw | gzip -9 | brotli -11 |
|---|---|---|---|---|
| **embedded** (package default; wasm is gzip+base64 inside JS) | one worker chunk | 12.75 MB | 9.18 MB | 9.12 MB |
| **split** (wasm as a separate asset) | `wasm_sdk_bg-*.wasm` | 26.73 MB | 9.09 MB | **5.82 MB** |
| | worker JS | 0.63 MB | 67 KB | 53 KB |

The main-thread bundle (Comlink and glue) is 4–5 KB. The split variant moves 5.9 MB versus 9.1 MB for embedded, if the host serves the `.wasm` with brotli. At 25 Mbps that is about 1.9 s versus 2.9 s; at 100 Mbps, about 0.5 s versus 0.7 s. The embedded copy cannot be improved by the CDN, because the base64 and gzip are already inside the JS. The split `.wasm` also gets its own HTTP cache entry and Chrome's wasm code cache (below).

### Cold start to first proved answer (fresh browser context; localhost serving, so download time is not included)
Measured from navigation start to the first resolved `identity.balance` with proof; N=5, median (min–max).

| | embedded | split |
|---|---|---|
| cold (empty cache) | 1317 ms (936–1512) | **844 ms (466–1189)** |
| warm (same context, new page) | 1524 ms (1096–1990) | **668 ms (414–733)** |

Breakdown, medians:
- Wasm init (`wasmInitMs`): embedded 208 ms cold and 211 ms warm. Split is 178 ms cold and **84 ms warm** (code cache hit). The embedded path decompresses and compiles from bytes every time, and gets no code cache.
- `connect()` (3 requests to `quorums.<net>.networks.dash.org`: `/quorums`, `/previous` and `/masternodes`, about 170 KB, plus builder): 55–62 ms cold, 33–40 ms warm.
- First proved read: 460–570 ms median. This includes a fresh TLS handshake to a DAPI node.
- Worker spawn: ~40–120 ms.

The box was noisy, so the warm number for embedded was slower than the cold one. In a single full run, the cold first `epoch.current` took 1.2–2.2 s, and a few other first reads took 0.5–1.0 s. Plan for roughly 1 s after assets are local, plus transfer time.

### Warm call latency (per method, median over 11 calls, sequential, mainnet)
Network-dominated: one round trip to a DAPI node, ~100 ms RTT plus node time. wasm verification time is not visible next to it.

| op | median ms (embedded / split) | p95 ms | proof bytes | wire bytes | testnet median ms |
|---|---|---|---|---|---|
| `identity.fetch` | 163 / 161 | 623 | 3013 | 3243 | 203 |
| `identity.balance` | 166 / 146 | 424 | 1262 | 1492 | 126 |
| `identity.keys` | 152 / 158 | 283 | 1837 | 2067 | 121 |
| `dpns.byName` | 129 / 147 | 402 | 2142 | 2372 | 145 |
| `dpns.usernames` | 137 / 154 | 271 | 2145 | 2375 | 153 |
| `contract.fetch` | 136 / 153 | 449 | 4425 | 4655 | 140 |
| `dpns.domainsByPrefix` (limit 10) | 138 / 148 | 251 | 2397 | 2627 | 143 |
| `token.totalSupply` | 154 / 147 | 291 | 1218 | 1448 | n/a |
| `epoch.current` | **282 / 271** | 461 | 1914 | 3561 | 208 |
| `epoch.info` (3 epochs) | 129 / 143 | 245 | 1823 | 2053 | 137 |
| `protocol.upgradeState` | 158 / 153 | 299 | 382 | 612 | 145 |
| `system.totalCredits` | 148 / 167 | 292 | 2046 | 2276 | 262 |

`epoch.current` is two sequential `getEpochsInfo` calls inside the SDK, hence about 2×. Unpredictable stalls come from node selection (section 5).

### Memory
Measured as RSS of the Chromium renderer process (the page plus its worker), because `performance.memory` is zeroed inside workers.
- Renderer before connect (worker spawned): ~96 MB.
- After connect and a full sweep: 190–260 MB renderer RSS. The worker and wasm cost roughly **+90–140 MB**. The wasm *linear memory* is only 5.8–6.0 MB; the rest is V8's compiled code for the 26 MB module, plus JS heap.
- Both networks connected at once: +65 KB of wasm memory, a few MB of RSS. Six dispose and reconnect cycles grew wasm memory 5.77 → 6.03 MB (no real leak). `dispose` calls `wasm.free()`.

### Headers and CSP
Tested under `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self' https:`. Zero violations, both variants, full scenario.
- `script-src 'self' 'wasm-unsafe-eval'` is **required and sufficient** for scripts. Without `'wasm-unsafe-eval'`, both variants fail with `CompileError … unsafe-eval is not an allowed source`. No `'unsafe-eval'`, `blob:` or `unsafe-inline` is needed.
- `worker-src 'self'` (or leave it to fall back to `script-src 'self'`). The worker is a normal same-origin module file.
- `connect-src` must allow `https:` broadly. DAPI endpoints are arbitrary masternode `IP:443` taken from the `/masternodes` list (400+ nodes), so a host list is not workable. Pinning `connect-src` to just the quorum host makes every read fail with `Failed to fetch`. With the split variant, `connect-src 'self'` is also needed, because `instantiateStreaming(fetch(wasm))` is governed by `connect-src`.
- **COOP/COEP: not needed.** It works with `crossOriginIsolated=false`, and also works under `COOP: same-origin` plus `COEP: require-corp` (quorum service sends `Access-Control-Allow-Origin: *`). No SharedArrayBuffer is used.
- The quorum service sends `Access-Control-Allow-Origin: *`; no proxy is needed. DAPI nodes work from the browser via gRPC-web.

## 3. Recommended worker API

Keep the wasm objects inside the worker and hand back plain, structured-cloneable data. `bigint`, `Map` and `Uint8Array` survive postMessage and Comlink. **Never let a wasm error cross Comlink.** A thrown wasm error is cloned to `{__wbg_ptr}` and the message is lost (seen on `connect` before the fix). So every method returns an envelope and does not throw.

```ts
// src/worker.ts (implemented)
type Network = 'mainnet' | 'testnet';
api = {
  connect(network, opts?: {addresses?, quorumUrl?, settings?}): ConnectResult   // idempotent per network; {ok:false,error} on failure
  dispose(network): boolean
  read<T>(network, op: OpName, params, {timeoutMs=15000}?): ReadResult<T>        // proof-verified only
  stats(), ops()                                                                 // diagnostics
}
type ReadResult<T> = {ok:true, network, op, data:T, proof:ProofMeta|null, ms, wireBytes}
                   | {ok:false, network, op, error:{name, message, kind?, code?, retriable?}, ms}
type ProofMeta = {height, coreChainLockedHeight, epoch, timeMs, protocolVersion, chainId, quorumHash, quorumType,
                  round, blockIdHash, signature, proofSize, verified:true}
```
- Per-network sessions live in one `Map<Network, Session>`. **Keep both sessions alive** (+~65 KB wasm memory, a few MB RSS). Switching networks is then just a different first argument, with no reload and no rebuild. A cold reconnect costs 15–60 ms of `connect` plus a 0.5–1.5 s first read (new TLS to a node).
- `read` uses a whitelisted `OPS` table (`src/ops.ts`) mapping op names to `*WithProof` calls. The SDK object is never exposed, so no write or state-transition method is reachable from the main thread. Adding an op is one line.
- `read` has its own `timeoutMs` (default 15 s) via `Promise.race`. It is needed: see blocker B2.
- `plain()` in `convert.ts` turns SDK results into data via `toJSON()` and frees them. Identifier objects arrive as byte arrays in some results (for example `DpnsUsernameInfo`), so `ops.ts` has a `shape()` hook (base58 of ids).
- Possible additions: `readMany(ops[])` to batch over one Comlink round trip; a tiny retry (one retry on `DapiClientError` and `Timeout`); a `degraded` flag per session to rebuild with a fresh address list.

Bundling recommendation: **split variant** (see B1). It is 35% smaller on the wire, warms to ~80 ms init via the code cache, and keeps the worker JS at 0.6 MB so the app shell is cacheable independently of the wasm.

## 4. Switching networks and error shapes

**Network switch without reload: works.** `connect('testnet')` while mainnet stays live took 50–65 ms the first time and 13–24 ms on reconnect. A dispose, connect and first read cycle took 0.5–1.6 s. State stays isolated per network; heights differ (mainnet 468 963, testnet 666 9xx).

Error shapes (`error = {name, message, kind, code, retriable}`; `kind` is the numeric wasm error category):

| case | result |
|---|---|
| identity not found | **ok, `data: null`, proof present** (a verified proof of absence) |
| identity balance not found | ok, `data: null`, proof present |
| identity keys of unknown id | ok, `data: []` |
| DPNS name not found / no prefix match | ok, `data: null` / empty `Map`, proof present |
| contract not found | **error** `NotFound` (kind 28): "Data contract not found" |
| token not found | **error** `Proof` (kind 4, `retriable: true`!): "unexpected result in proof error: Token … most likely does not exist" |
| malformed id (`'not-an-id'`) | error `InvalidArgument` (kind 26), ~1 ms, never hits the network |
| out-of-range epoch index | error `InvalidArgument`: "integer out of bounds" |
| call before `connect` | worker-side error (`name: 'Error'`) |
| node refuses connection (`127.0.0.1:1`) | `DapiClientError` (kind 7) "no available addresses to retry … Failed to fetch", in ~13 ms |
| quorum service unreachable | `connect` returns `{ok:false}` `Generic` (kind 18) "Failed to prefetch quorums", ~2 ms; a later `connect` recovers cleanly |
| response tampered | error with `grovedb: invalid proof: …` (message only; no dedicated kind checked) |
| node black-holed | see B2 |

Normalize not-found in the Radar layer: absence is `data === null` or `[]` for most ops, a `NotFound` error for contracts and a misleading `Proof` error for tokens.

## 5. Blockers, risks and fallbacks

**B1: the package only exposes the embedded wasm.** `exports` has `.` and `./module`, both the 12.75 MB bundle with the wasm inlined. The split variant needs a Vite alias past the exports map: `@dashevo/evo-sdk` → `node_modules/@dashevo/evo-sdk/dist/sdk.js`, and `@dashevo/wasm-sdk/compressed` → a 10-line shim that calls `@dashevo/wasm-sdk/raw`'s `init({module_or_path: wasmUrl})` (`src/wasm-split.ts`, `vite.config.ts`). It works, but it depends on the internal file layout of 5.0.x. Fallbacks: use the embedded variant (works as-is, +3 MB transfer, no code cache) or ask upstream for a non-embedded export. Pin the exact version and re-test on upgrade.

**B2: dead DAPI nodes can hang calls.** In the browser, the SDK's `timeoutMs` / `connectTimeoutMs` did not stop a call to a black-holed node: a single-address test (`192.0.2.1`, timeout 3 s, retries 1) took **68–132 s** before failing. With a pool of one dead and two live nodes, 6–10 sequential reads gave latencies 0.1–0.4 s mostly, but intermittently **2.5–3.8 s** and two out of ten calls timed out at the 6 s watchdog. The default pool is every node in `/masternodes` (400+, some flagged `versionCheck:"fail"`), so occasional stalls should be expected on mainnet. Mitigation implemented: the worker-level `timeoutMs` watchdog. Further fallbacks: (a) one automatic retry in the worker; (b) pass a curated `addresses` list (drop nodes whose `versionCheck` is `fail`, skip any that failed recently) instead of the full discovery; (c) a degraded flag that rebuilds the session; (d) a small Radar-hosted health prober. Not tested at scale; real stall rate on a full mainnet pool needs a longer soak.

**B3: trust anchor is the quorum service.** Proof verification is real (GroveDB hash chain plus BLS signature against a quorum key), but the quorum keys come from `quorums.<net>.networks.dash.org`, one HTTPS service run by the Dash side. Radar is not a light client: it trusts that service for key authenticity, and a node can serve a valid but old proof (the metadata `height`/`timeMs`/`coreChainLockedHeight` lets the UI show staleness). Fallback: mirror that endpoint and pass `quorumUrl` (the option exists in the SDK; I verified it fails safe when unreachable but did not test a positive mirror). If the quorum service is down, `connect` fails and no reads are possible.

**Quirks**
- **Q1: `dpns.getUsernameByName*` does not homograph-normalize.** `getUsernameByNameWithProof('pshenmic.dash')` returns `null` for an existing name; `'pshenm1c.dash'` finds it. The worker converts the label with `dpns.convertToHomographSafe` first (`safeName` in `ops.ts`). Document-query prefix searches need the same normalization (`o→0`, `i/l→1`), done locally in `ops.ts`. `dpns.resolveName` (plain, no WithProof variant) handles it itself.
- **Q2:** `*WithProof` data comes back as wasm objects, `Map`s and raw byte arrays, so every op needs the conversion layer (`plain()` plus per-op `shape()`).
- **Q3:** `performance.memory` reports zeros inside workers, and `measureUserAgentSpecificMemory` needs COOP/COEP; track memory via process RSS or the wasm `Memory` handle.
- **Q4:** a synthetic `Response` (as made by a fetch wrapper) has an empty `url`, and the SDK's reqwest-wasm panics with "url parse". If Radar wraps `fetch` in the worker (logging, retries), it must copy `url` over (see `withUrl` in `netlog.ts`).

**Not covered**
- Only headless Chromium was tested. Firefox and Safari need a pass; module workers, `DecompressionStream` (embedded path) and streaming wasm compile are all supported in current versions, but untested here.
- No throttled-network cold start was measured. Download time is estimated from sizes.
- No write or state-transition method was called anywhere in the spike.
