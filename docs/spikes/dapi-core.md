# T-009 – Can a web page call DAPI's Core gRPC service on Dash evonodes directly?

Run: 2026-11-10, from one IP (strixbox, EU), headless Chromium 158 via Playwright 1.65, Connect 2.3.0.
Code and raw data: this directory (`README.md` lists files; `results-*.json`, `survey/`, `certs/` are the raw outputs).

## 1. Answer: **works, with caveats**

A static page can call the Core service on evonodes directly, with no proxy. Every RPC and all three streams worked from a real browser on both networks.

- **TLS:** evonodes serve publicly trusted certificates issued for their *IP address* (Let's Encrypt and ZeroSSL, IP SAN). No hostname is needed. Chromium validates them.
- **CORS:** the Envoy gateway reflects any `Origin` and exposes `grpc-status`, `grpc-message` and `ratelimit-*`. The rate-limit headers and the over-limit error are readable cross-origin.
- **Rate limit:** 150 requests per minute per client IP per node, fixed window. Over the limit you get a clean `ResourceExhausted` plus `ratelimit-reset` (seconds). Recovery is exactly at the advertised reset (≤ 60 s).
- **Caveats:**
  1. About 4% of evonodes fail at any moment. Mainnet: 350 of 363 enabled and reachable nodes answered. The failures are expired certs, `no healthy upstream` and HTTP 500.
  2. Certificates are short-lived. About 20% of mainnet nodes have under 3 days left, and 1.4% were expired during the run.
  3. Streams are cut by the server at about 600 s and must be reconnected.
  4. The Core API is raw: block, transaction and masternode-list bytes. Radar must decode them client-side.
  5. `getEstimatedTransactionFee` returns 403 on every node tried.
  6. Radar's node list has no Platform HTTP port. 443 and 1443 worked for every node that answered.

Connect (`@connectrpc/connect-web`) is **not blocked**. `@dashevo/dapi-client` also works in a browser and is a valid fallback, but it ships 18.6 MB (6.4 MB gzip) against Connect's ~35 KB gzip.

## 2. Setup

| Item | Value |
|---|---|
| Client | `@connectrpc/connect` 2.3.0, `@connectrpc/connect-web` 2.3.0 (`createGrpcWebTransport`, binary), `@bufbuild/protobuf` 2.17.0 |
| Codegen | `@bufbuild/buf` 1.75.0, `@bufbuild/protoc-gen-es` 2.17.0, `target=ts`, from a copy of `core/v0/core.proto` |
| Build / browser | Vite 8.3.7 (build + `vite preview`), Playwright 1.65.0, Chromium 158.0.8127.18 headless |
| Page origin | `http://127.0.0.1:5197` (any origin is accepted, see §3) |
| Node list | `radar.dashhq.org/api/v1/{mainnet,testnet}/masternodes`, type `Evo`, IPv4, plus port 443 / 1443 |
| Compared | `@dashevo/dapi-client` 5.0.3, built with webpack 5.112.2, using the repo's own fallback set |

Use `vite preview`, not the dev server. Dev-server HMR reloads the page when you touch a file and kills open streams. This cost me one rerun.

Radar's `/masternodes` has **no Platform HTTP port or Platform node ID for the HTTP endpoint**. It only has the Core `service` (IP:9999). The port comes from `platformHTTPPort` in the masternode list diff. I assumed 443 and 1443 and that was right for every node that answered.

## 3. CORS and TLS

| Question | Result |
|---|---|
| Preflight | `OPTIONS` returns 200. It allows `content-type, x-grpc-web, x-user-agent, grpc-timeout, keep-alive, …`, `max-age` 1728000, and POST. Preflights are **not** counted against the rate limit (5 preflights, counter unchanged). |
| Allowed origin | Reflected for any value. Tested `https://radar.dashhq.org`, `https://example.com`, `http://localhost:3000` and `null`. The dashmate config says `prefix: "*"`, and in practice this behaves as "allow all". |
| Exposed headers | `grpc-status, grpc-message, code, drive-error-data-bin, dash-serialized-consensus-error-bin, stack-bin, ratelimit-reset, ratelimit-limit, ratelimit-remaining`. `ratelimit-*` read fine from JS. |
| Protocol | HTTP/2 via ALPN. 10 parallel unary calls to one node take 111 to 543 ms in total (one connection, multiplexed). |
| Certificates | 404 of 405 probed nodes presented a cert (1 mainnet node gave none) and every one of those had the node's IP in its SAN. Issuers, mainnet: Let's Encrypt 345, ZeroSSL 12, Sectigo 4, GoGetSSL 1. Testnet: Let's Encrypt 40, ZeroSSL 1, self-signed 1. |
| Cert lifetime | Let's Encrypt IP certs are short-lived (about 6 days). Median time left is 4.1 days (mainnet) and 4.7 days (testnet). 74 of 363 mainnet nodes have under 3 days left. |
| Bad certs | Mainnet: 5 expired (one for 715 days), 1 unknown issuer. Testnet: 1 self-signed. Chromium blocks them (`ERR_CERT_DATE_INVALID`, `ERR_CERT_AUTHORITY_INVALID`). |
| How the failure surfaces | JS sees only `TypeError: Failed to fetch`, the same as a CORS failure. There is no way to tell a bad cert from other network errors in page code. Treat it as "node down". |

## 4. Methods

All tested through Connect in the browser on 6 mainnet and 4 testnet nodes, and also on the node used in each later test.

| RPC | Result | Notes |
|---|---|---|
| `getBlockchainStatus` | OK | 211 B mainnet, 206 B testnet. Gives `chain.blocksCount`, `bestBlockHash` (little-endian bytes), `chainWork`, `difficulty`, `peersCount`, `time.median`, `network.fee`, `status` and `syncProgress`. |
| `getBestBlockHeight` | OK | 30 B. |
| `getBlock` by height | OK | **Raw block bytes** (no verbose form). Mainnet block 2,569,988 was 96 KB. Testnet blocks are 0.3 to 14 KB. `Invalid block height` returns `InvalidArgument`. |
| `getBlock` by hash | OK | Hash is a display-order hex string. |
| `getTransaction` | OK | Raw tx plus `blockHash`, `height`, `confirmations`, `isInstantLocked`, `isChainLocked`. 400 to 430 B for a coinbase. Unknown txid returns `NotFound`, bad hex returns `InvalidArgument`. The txid lookup worked for a 2016-era tx (block 1,000,000), so the nodes have txindex. |
| `getMasternodeStatus` | OK | It reports the *queried node's* own status. Not useful for Radar's explorer data. |
| `getEstimatedTransactionFee` | **Fails everywhere** | `Unavailable: transport error: unexpected HTTP code: 403` on all 10 nodes. rs-dapi calls Core `estimatesmartfee`, which the node's RPC user does not allow. Use `getBlockchainStatus.network.fee` (relay and incremental) instead. |
| `broadcastTransaction` | Not called | As instructed. |

There is no RPC for block hash by height, block list, address history, mempool, or verbose tx. The JSON-RPC route `POST /` on the same host (CORS works) has `getBestBlockHash`, `getBlockHash {height}` and `sendRawTransaction`. Two quirks:

- `getBestBlockHash` returns the hash in *internal* byte order (trailing zeros), while `getBlockHash` returns display order.
- The `getBlockHash` JSON-RPC call is the only way to turn a height into a hash.

Radar therefore needs a block and transaction decoder in the browser (for example `@dashevo/dashcore-lib`). Block lists and charts have to come from Radar's own API, not from DAPI.

## 5. Latency and payload sizes

Measured in-browser, sequential calls, using the Connect transport, with a node reused for all calls. "Cold" is the first call on a fresh connection (TCP + TLS + request). "Warm" excludes the first call of each node. The numbers come from this box in the EU, so absolute values depend on where the user is.

**Per method** (6 mainnet nodes, 3 testnet nodes, 20 to 25 calls per node per method; each row pools those calls):

| Net / method | Calls | Warm p50 | Warm p90 | Warm p99 | Cold p50 | Cold p90 | Response |
|---|---|---|---|---|---|---|---|
| mainnet `getBestBlockHeight` | 150 | 152 ms | 226 ms | 259 ms | 564 ms | 873 ms | 30 B |
| mainnet `getBlockchainStatus` | 120 | 162 ms | 247 ms | 331 ms | 339 ms | 458 ms | 211 B |
| mainnet `getBlock` (96 KB) | 120 | 219 ms | 335 ms | 1087 ms | 622 ms | 1082 ms | 96,018 B |
| testnet `getBestBlockHeight` | 75 | 60 ms | 134 ms | 191 ms | 291 ms | 532 ms | 29 B |
| testnet `getBlockchainStatus` | 60 | 76 ms | 143 ms | 354 ms | 131 ms | 255 ms | 206 B |
| testnet `getBlock` (10 KB) | 60 | 64 ms | 139 ms | 171 ms | 121 ms | 271 ms | 9,969 B |

**Whole fleet**, one cold and one warm `getBestBlockHeight` per node, 20 in parallel:

| Net | Nodes answering | Cold p50 / p90 / p99 | Warm p50 / p90 / p99 |
|---|---|---|---|
| mainnet | 352 | 533 / 900 / 1675 ms | 138 / 283 / 828 ms |
| testnet | 42 | 315 / 631 / 1331 ms | 59 / 140 / 307 ms |

**Per node** (`getBestBlockHeight`, 25 calls, first call excluded from p50 and p90):

| Net | Node | Cold | p50 | p90 | TCP RTT |
|---|---|---|---|---|---|
| mainnet | 81.14.228.87 | 564 | 136 | 146 | 127 ms |
| mainnet | 65.108.74.75 | 545 | 144 | 153 | 123 ms |
| mainnet | 89.35.131.219 | 510 | 136 | 175 | 98 ms |
| mainnet | 173.212.196.214 | 548 | 174 | 208 | 127 ms |
| mainnet | 103.214.68.131 | 592 | 153 | 206 | 144 ms |
| mainnet | 5.199.166.140 | 873 | 226 | 248 | 212 ms |
| testnet | 68.67.122.17 | 287 | 57 | 62 | – |
| testnet | 68.67.122.9 | 291 | 59 | 69 | – |
| testnet | 85.209.243.2 | 532 | 132 | 139 | – |

A warm call costs about one RTT. A cold call costs about 4 RTT: TCP, TLS 1.3, a CORS preflight, then the request. The preflight is per URL, so the **first call to each RPC on an already-warm connection costs about 2 RTT** (see `getBlockchainStatus` and `getBlock` first-call p50 of 339 and 622 ms against warm p50 of 162 and 219 ms, consistent with a preflight each). gRPC-web needs `content-type: application/grpc-web+proto` and `x-grpc-web`, so the preflight cannot be avoided. Opening a connection to a node you will use for only one call is the expensive part. Keep a few warm nodes and reuse them.

## 6. Fleet coverage (what share of evonodes answer)

One `getBestBlockHeight` from the browser to every Radar `Evo` node with an IPv4 address.

| | Mainnet | Testnet |
|---|---|---|
| Evo nodes listed by Radar (IPv4) | 370 | 63 |
| `status=enabled` and `reachable` | 363 | 42 |
| **Answered OK (of enabled and reachable)** | **350 (96.4%)** | **41 (97.6%)** |
| Answered OK (of all listed, including banned) | 352 (95.1%) | 42 (66.7%) |
| Failures among enabled and reachable | 5 `Failed to fetch` (4 expired cert, 1 unknown CA), 4 `no healthy upstream` (503), 4 HTTP 500 (empty reply) | 1 `Failed to fetch` (self-signed cert) |
| Agreed on tip height | all 352 returned the same height | 41 of 42 on the tip, 1 stale |
| Answered *without* `ratelimit-*` headers | 14 of 352 | 11 of 42 |

The 14 and 11 nodes answered without rate-limit headers, so their limiter may be off or they run an older gateway. I did not probe them further.

The `no healthy upstream` and HTTP 500 cases also show in the curl survey (§9), so they are node-side faults and not browser-specific. The other fleet failures (`Loading block index…`, timeouts, connection refused) were all `pose_banned` or unreachable nodes, so they do not count against the share.

The `curl` survey (§9), run earlier, gave the same counts, and the same 13 mainnet nodes and 1 testnet node failed in both passes.

DNS seeds also work. `seed-{1,2,3}.mainnet.networks.dash.org:443` and `seed-{1..5}.testnet.networks.dash.org:1443` answered from the browser with a valid hostname certificate. `seed-4.mainnet…` refused the connection. The mainnet seeds returned no `ratelimit-*` headers, the testnet seeds did.

## 7. Streams

Each stream was opened from a page via Connect (`for await`). Short probe: 30 s on one mainnet node. Long run: 600 s on one mainnet node (81.14.228.87) and one testnet node (68.67.122.17), all three streams concurrent.

| Stream | Request | First message | Observed |
|---|---|---|---|
| `subscribeToBlockHeadersWithChainLocks` | `fromBlockHeight = tip-3`, `count = 0` (continuous) | 122 to 378 ms | Initial `blockHeaders` and `chainLock`. Then a header plus chain lock per new block. 26 messages in 10 min on mainnet (9 header batches, 17 chain locks). |
| `subscribeToMasternodeList` | empty | 0.3 s (testnet) to 2.9 s (mainnet) | **First message is the full diff: about 1.35 MB binary on mainnet** (1.8 MB as JSON). Then small diffs (1.7 KB and up, 4 to 9 messages in 10 min). Testnet's full diff was about 0.27 MB. |
| `subscribeToTransactionsWithProofs` | **match-all bloom filter** `vData=[0xff]`, `nHashFuncs=1`, `nTweak=0`, `nFlags=0`; `fromBlockHeight = tip-3`, `count=0` | 0.3 to 2.6 s | **Accepted by DAPI and streams mempool transactions**, plus InstantSend locks and merkle blocks. Mainnet in 10 min: 172 `rawTransactions` messages, 156 `instantSendLockMessages`, 12 `rawMerkleBlock`. Largest single message about 187 KB (history from `tip-3`). Longest silence 29 s. |

Behaviour of all streams:

- **Keep-alive:** the stream stayed open through gaps of 173 s without any message (headers stream on testnet). gRPC-web has no keep-alive frames, and I saw no heartbeat. The gateway's `idle_timeout` for `subscribeTo*` is 300 s. I did not test an idle gap longer than 173 s. On mainnet a Dash block gap over 300 s is rare but happens, so a header-only stream can be cut on idle.
- **Hard cut at about 601 s:** Envoy's `max_stream_duration` is 601 s. All 6 long streams ended at 601.1 to 601.3 s. Connect reports `Unknown: missing trailer` on mainnet and `Unknown: network error` on testnet. Both are `Code.Unknown`, not a clean end. Any `Unknown` on a stream (when the app did not abort it) must trigger a reconnect.
- **Reconnect cost:** one counted request. Time to first message on a fresh stream was 122 to 378 ms for headers, which is similar to a unary call plus the handshake. A masternode-list reconnect pays for the 1.35 MB initial diff again (1 to 3 s).
- **Server limit:** rs-dapi allows 64 concurrent block-header streams per node (`MAX_ACTIVE_BLOCK_HEADER_STREAMS`) and answers `ResourceExhausted: too many active block-header streams` beyond that. Many Radar users on the same few nodes could hit it. Spread the load.
- **Rate limit:** opening a stream counts as one request (counter went 146 to 145 on open). Messages after that are free. Stream responses carried the `ratelimit-*` headers on nodes that send them.
- **One unexplained early drop:** on the first attempt both long streams died at 79 s with `network error`, at the moment a 20-way fleet scan from the same host finished. A repeat with the same scan and later calls in parallel ran to 601 s without a drop. I could not reproduce it, so I count it as a one-off network blip. It is a reason to always reconnect.

## 8. Rate limiter

Gateway config (dashmate default, `getBaseConfigFactory.js`): `rateLimiter.requestsPerUnit: 150`, `unit: minute`, `responseHeaders.enabled: true`. The rate-limit descriptor is `remote_address`, so the limit is per client IP per node.

I pushed one testnet node (68.67.122.19) and one mainnet node (89.35.131.219) past the limit with sequential `getBestBlockHeight` calls and stopped at the first limited response. I then sent one probe per 5 s until the node answered again. Nothing else was sent to either node. I did not try to trigger blacklisting.

| | Mainnet 89.35.131.219 | Testnet 68.67.122.19 |
|---|---|---|
| Calls that succeeded in the window | 150 | 148, plus 2 earlier probes in the same minute (150 total) |
| First limited call | 151st, after 17.9 s | 149th, after 9.2 s |
| HTTP status | **200** (not 429) | **200** |
| `grpc-status` / message | `8` / `rate limited` | `8` / `rate limited` |
| Connect error | `ResourceExhausted`, `rawMessage: "rate limited"` | same |
| `ratelimit-limit` / `-remaining` / `-reset` | 150 / 0 / 31 | 150 / 0 / 32 |
| Headers readable from JS | **Yes**, all three (via `ConnectError.metadata`, and via the fetch `Response.headers`) | Yes |
| Recovery | first probe at 31 s succeeded with `remaining=149, reset=60` | first probe at 32 s succeeded |

What this tells us:

- The window is a **fixed window that looks clock-aligned**: `reset` at the first call was 48 s and 41 s (not 60), and a probe right after the boundary showed `reset=60`. Recovery is exactly at `ratelimit-reset`, never more than 60 s. There is no penalty beyond the window. The over-limit calls themselves did not extend it.
- The over-limit reply is the *mapped* gRPC-web reply from dashmate's `local_reply_config` mapper (HTTP 200 + `grpc-status: 8`). This matters: Connect sees `ResourceExhausted` with metadata, not a bare 429 with an opaque network error. Browsers get the same clean signal that native clients do. Both nodes returned it, so this is not limited to the testnet.
- `ratelimit-remaining` is on every response from nodes that run the limiter. A client can track its own budget per node without counting.
- Preflights (`OPTIONS`) do not count. Unary calls and stream opens count as one each. JSON-RPC `POST /` calls share the same counter.
- Behind NAT or a corporate proxy, all Radar users share one IP and therefore one 150/min budget per node. Plan for that.

## 9. `curl` survey (supporting data)

One preflight and one `getBestBlockHeight` per node with `Origin: https://radar.dashhq.org`, run before the browser fleet scan. Files: `survey/`.

| | Mainnet | Testnet |
|---|---|---|
| Nodes probed | 363 | 42 |
| TLS verified | 358 | 41 |
| Preflight 200 with the origin reflected | 358 | 41 |
| `getBestBlockHeight` OK | 350 | 41 |
| Failures | 5 TLS (4 expired, 1 unknown CA), 4 HTTP 500 (no `grpc-status`), 4 HTTP 503 `no healthy upstream` | 1 self-signed |
| Height | all 350 on the same block | all 41 on the same block |
| Total request time p50 / p90 (cold, incl. TLS) | 0.42 / 0.91 s | 0.17 / 0.40 s |

## 10. `@dashevo/dapi-client` as the fallback

Bundled `@dashevo/dapi-client@5.0.3` with webpack, using the same fallback set as the repo's `webpack.config.js`, and ran it in the same Chromium.

| | Connect (`connect-web`) | `@dashevo/dapi-client` 5.0.3 |
|---|---|---|
| Works in browser | Yes | **Yes** |
| Bundle size | 126 KB / **35 KB gzip** (whole Core service) | **18.6 MB / 6.4 MB gzip** (webpack, bundles dashcore-lib, wasm-dpp, dash-spv) |
| Load + eval | negligible | 1.1 s |
| Node selection | none, you write it (see §11) | Built in. Seeds or a list, plus an SML-based provider. Default mainnet seeds worked: it opened `subscribeToMasternodeList` on `seed-1.mainnet.networks.dash.org`, picked `44.240.99.214` from the list and returned the tip in 1.85 s total. |
| Explicit-address calls (mainnet node) | cold 564 ms, warm about 140 ms | cold 607 ms, warm 144 ms |
| Explicit-address calls (testnet node) | cold 287 ms, warm about 58 ms | cold 222 ms, warm 71 ms |
| Methods it exposes | any RPC in the proto | `getBestBlockHeight`, `getBlockByHeight/Hash`, `getTransaction`, `getMasternodeStatus`, `getBlockchainStatus`-like status, `subscribeTo*` helpers. No `getStatus` on `core` in this version. |
| Rate-limit handling | you write it | `GrpcTransport` retries retriable errors on another address but has `// TODO: Shouldn't we call address.markAsBanned() here?` (`GrpcTransport.js:107`). Only `JsonRpcTransport` marks an address banned. Over-limit nodes stay in rotation. |
| Typing | generated TS types | JS with JSDoc, CommonJS, needs Node polyfills |
| Risk | – | Heavy. Unneeded wasm. My own attempt to parse the initial diff with `@dashevo/dashcore-lib` 0.26.1 in Node threw `Unknown special transaction type` on both a node and a seed (not investigated; its browser SML provider did work). |

Verdict: if Connect were blocked, `dapi-client` is a working fallback. It is not blocked, and nothing it provides is worth 18 MB.

## 11. Recommended client design

**Transport.** Use `src/dapi.ts` as is: `createGrpcWebTransport({ baseUrl, useBinaryFormat: true, fetch })` with a thin `fetch` wrapper that records response headers, plus the generated `Core` client. No credentials, no cookies. Binary format, not JSON. Use only the RPCs Radar needs (the generated file shrinks with tree-shaking).

**Node candidates.**
1. *Cold start:* the DNS seeds, `seed-{1,2,3}.mainnet.networks.dash.org:443` and `seed-{1..5}.testnet.networks.dash.org:1443` (valid hostname certificates). They give the first answer in about 0.3 to 0.9 s without waiting for Radar's list.
2. *Steady state:* Radar's `/{net}/masternodes?type=Evo`, filtered to `status=enabled`, `reachable`, IPv4, and `dkg_readiness.overall=pass` (or whatever Radar considers healthy). URL: `https://{ip}:{443|1443}`. Ask Radar's API to add `platform_http_port` and, ideally, a `dapi_ok` flag with the cert expiry date.
3. *Optional:* take the Platform HTTP port from the first message of `subscribeToMasternodeList` (needs a decoder) and cross-check against Radar.

**Selection** (`src/pool.ts`, type-checked, not exercised):
- Pick the faster of two random usable nodes ("power of two choices"), with a per-node latency EWMA. This spreads load across hundreds of nodes, so no node sees more than a few requests per minute from one user.
- Track a client-side budget of about 100 per node per minute (of 150, to leave room for other tabs behind the same NAT), and re-sync from `ratelimit-remaining` on every response.
- On `ResourceExhausted`: ban the node for `ratelimit-reset + 1` s. It is a normal event, not a node fault.
- On `Unavailable`, HTTP 500/503, `Failed to fetch`, timeouts, or `Unknown` on a unary call: exponential ban of 15 s doubling to 10 min, and retry on another node. Do not retry `NotFound` or `InvalidArgument`: those are real answers.
- Verify the tip. Ignore a node whose `getBestBlockHeight` is more than 2 behind the median of the nodes you have seen (testnet had one stale node).
- Pool size: keep 4 to 6 warm connections and reuse them. A cold connection costs about 4 RTT (TCP, TLS, preflight, request). Do not scatter single calls across 300 hosts.
- Because bad certificates look like network errors, mark a node dead after two `Failed to fetch` in a row and re-test later (certs renew every few days).

**Request budget.**
- Tip tracking: use one `subscribeToBlockHeadersWithChainLocks` stream (a new block roughly every 2.6 min) instead of polling. Reconnect every 600 s on another node with jitter: 0.1 requests per minute.
- Do not subscribe to the masternode list or the match-all transaction stream by default. The first is a 1.35 MB initial download, and the second is a firehose (about 17 `rawTransactions` messages per minute plus IS locks on mainnet, each message holding one or more transactions). Open them only on a page that needs them, and close on navigation.
- Fan-out is a design choice: a block detail page needs 1 call (`getBlock`, up to ~100 KB), a transaction page 1 call (`getTransaction`). Even a page with 20 transactions is 20 calls, spread over several nodes.
- Realistic per-tab load is under 10 requests per minute, far below the 150 limit. The limit only matters for bulk loops (history scans, charts): cap concurrency at 4 per node, and let the pool spread the rest.
- Use Radar's own API for lists, charts and search. DAPI cannot answer them.

**Fallback.**
1. Node failure: retry on 2 other nodes (3 attempts total, as in `pool.call`).
2. Pool exhausted: fall back to the DNS seeds, then to Radar's server-side API for the same data where it exists.
3. If Connect were ever blocked: `@dashevo/dapi-client` 5.0.3 (§10), lazy-loaded.

**Streams.** Treat any error that is not the app's own abort as "reconnect": a short randomised delay (0.5 to 2 s), a different node, and resume from the last seen height (`fromBlockHeight = lastHeight + 1`, `count = 0`), so no block is missed.

## 12. Blockers and risks

No blocker for a read-only Radar. Risks to track:

1. **Raw data only.** The browser must decode blocks and transactions (for example `@dashevo/dashcore-lib`; I did not test how that bundles). Radar needs `getBlock` plus its own API, not DAPI alone.
2. **Short-lived certificates.** The LE IP certs last about 6 days and renew continuously. About 1 in 70 nodes is expired at any moment and 1 in 5 is within 3 days of expiry. Expiry is invisible to page code (just `Failed to fetch`). Radar's crawler should record cert expiry and publish a "TLS ok" flag.
3. **Shared IP budget.** Per-IP, per-node limits mean offices and mobile carriers share 150/min per node. Spread across nodes and keep the budget at about 100.
4. **Stream cut at 601 s and the 300 s idle timeout** need reconnect logic. I did not test an idle gap above 173 s.
5. **Platform HTTP port** is not in Radar's API. The default worked; a node with a custom port would be missed.
6. **`getEstimatedTransactionFee`** returns 403 everywhere. Do not depend on it.
7. **Gateway versions differ.** 14 mainnet and 11 testnet nodes send no `ratelimit-*` headers. Treat the headers as optional.
8. **Not tested:** IPv6-only nodes (1 on mainnet); a real `https://` page origin (CORS tested with `curl` for `https://radar.dashhq.org`, and with a `http://127.0.0.1` page); mixed-content rules do not apply since the node URLs are HTTPS; Safari and Firefox (only Chromium); behaviour from other regions or a mobile network; blacklisting (deliberately not tried); load from many users at once.
9. **One-off stream drop** at 79 s (§7). Cause unknown.

## 13. Reproduce

```
cd /work/scratch/radar-m0/spike-dapi
npm ci && npx buf generate
npx vite build --outDir dist-connect && (npx vite preview --outDir dist-connect --port 5197 &)
node exp-fleet.mjs && node fleet-sum.mjs        # coverage, ~1 min
node exp-latency.mjs && node lat-sum.mjs        # latency
node exp-streams.mjs mainnet 81.14.228.87 60000 out.json
node exp-ratelimit.mjs testnet <ip>            # stops at the first limit
cd dapi-client && npm ci && npx webpack && node run.mjs
```

Rate-limit runs hit one node each, sequentially, and stop at the first limited reply.
