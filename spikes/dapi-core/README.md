# Radar spike T-009: DAPI Core gRPC-web from a browser

Report: `REPORT.md`. Everything runs from this directory.

## Reusable pieces (move into the app)
- `proto/core/v0/core.proto` – copy of `platform/packages/dapi-grpc/protos/core/v0/core.proto`
- `buf.yaml`, `buf.gen.yaml` – `npx buf generate` -> `src/gen/core/v0/core_pb.ts` (protoc-gen-es, target=ts)
- `src/dapi.ts` – Connect gRPC-web transport + typed `Core` client (`createNode`, `nodeUrl`); records status/headers of the last response
- `src/pool.ts` – reference node pool (power-of-two-choices, soft budget, ban on `ResourceExhausted` using `ratelimit-reset`, backoff on faults). Type-checked only.

## Experiment harness
- `src/main.ts` + `index.html` – test page exposing `window.dapi.unary()/stream()`
- `lib.mjs` – Playwright launcher (page URL via `PAGE_URL`, default http://127.0.0.1:5197/ = `vite preview` of `dist-connect`)
- `exp-methods.mjs`, `exp-tx.mjs`, `exp-fleet.mjs`, `exp-latency.mjs`, `exp-streams.mjs`, `exp-ratelimit.mjs`, `exp-seeds.mjs`
- `survey.sh`/`survey-sum.mjs` (curl-level CORS+TLS survey), `cert.sh` (cert issuer/expiry), `txid.mjs` (txid helper)
- `dapi-client/` – `@dashevo/dapi-client@5.0.3` webpack bundle + Playwright comparison (`node run.mjs`)
- `results-*.json`, `survey/`, `certs/` – raw outputs

## Re-run
```
npm ci && npx buf generate
npx vite build --outDir dist-connect && npx vite preview --outDir dist-connect --port 5197 &
node exp-fleet.mjs && node fleet-sum.mjs
```
Node lists come from `https://radar.dashhq.org/api/v1/{mainnet,testnet}/masternodes` (`mn-main.json`, `mn-test.json`, `evo-*.txt`).
Use `vite preview`, not `vite dev`: dev HMR full-reloads the page and kills in-flight streams when files change.
