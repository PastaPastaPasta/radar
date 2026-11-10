# T-010 spike: `@radar/core-decode`

**Result: works.** rust-dashcore compiles to wasm32 and decodes real mainnet blocks and every special transaction type of the brief. No fallback to `@dashevo/dashcore-lib` is needed for anything in scope.

Location: `/work/scratch/radar-m0/core-decode/`, laid out for `packages/core-decode/`. Built output is in `dist/`. Run `pnpm build` and `pnpm test` in the package dir.

## Numbers

| | |
|---|---|
| wasm, raw (after `wasm-opt -Oz`) | 1,135,116 B (1,213,841 B before wasm-opt) |
| **wasm, gzip -9** | **319,807 B (312 KB)**, target was 600 KB |
| wasm, brotli 11 | 227,362 B |
| JS glue (`dist/core_decode.js`) | 11 KB, 2.7 KB gzipped |
| instantiate | 2.5 to 10 ms in Node |

Decode time in Node 24 (wasm plus building the JS objects), median of 30 runs on real mainnet blocks. This box runs at low CPU weight, so treat it as indicative:

| block | size | txs | median |
|---|---|---|---|
| 1010831 | 586 KiB | 313 | 18 ms |
| 1635888 | 891 KiB | 128 | 16 ms |
| 2079458 | 552 KiB | 307 | 15 ms |

The first call after instantiation takes 17 to 50 ms (JIT warm-up). A typical 50 to 100 KB block is a few ms. Reproduce with `node scripts/bench.mjs`.

Size choices: `opt-level="z"`, `lto`, `codegen-units=1`, `panic="abort"`, `strip`. `dashcore` is used with `default-features = false`, which drops bincode, serde and BLS crypto. The one native piece is libsecp256k1, compiled to wasm by `clang` through `secp256k1-sys`, so the build needs clang with wasm32 support (clang 21 here). `wasm-opt -Oz` saves only about 6%, but it costs 1 to 3 minutes. `scripts/postbuild.mjs` runs it only if `wasm-opt` is on PATH. The npm `binaryen` package's `wasm-opt` is a wasm port and took over 10 minutes, so I used binaryen 129's native binary, now at `~/.local/bin/wasm-opt`. CI should install a native binaryen too.

## API

```ts
import init, { decodeBlock, decodeTx } from "@radar/core-decode"; // or initSync({module}) in Node
await init();
decodeBlock(bytes: Uint8Array, network: "mainnet" | "testnet" | "devnet" | "regtest"): DecodedBlock
decodeTx(bytes: Uint8Array, network): DecodedTx
```

- Output is plain objects. Optional values are `null`, never `undefined`. Failures throw an `Error`, and malformed input does not panic.
- `dist/core_decode.d.ts` is hand-written (`types/core_decode.d.ts`, copied by `postbuild`) and replaces wasm-bindgen's `any` typings. `tests/core-decode.test.mjs` checks every decoded object against it key by key, with types and nullability, on every fixture and vector. That check catches drift between the Rust output (`src/model.rs`) and the typings.
- A block gives: `hash` (X11, verified against Insight), `version`, `prevBlockHash`, `merkleRoot`, `time`, `bits`, `nonce`, `size`, `txCount`, `coinbase {scriptSigHex, text}` and `txs[]`.
- A tx gives: `txid`, `version`, `txType`, `txTypeName`, `lockTime`, `size`, `isCoinbase`, `coinbase`, `inputs[]` (prev txid and vout, scriptSig hex and asm, sequence) and `outputs[]` (value in duffs, scriptPubKey hex and asm, `scriptType`, `address`). `address` is set for p2pkh, p2sh and p2pk, and is `null` for OP_RETURN and non-standard scripts. `payload` is a union tagged by `kind`.
- `coinbase.text` is the scriptSig read as UTF-8, with control and invalid bytes collapsed to spaces. Pool tags such as `/poolin.com/` and emoji survive, so it works for pool lookup. Match pool names on `text`, and keep `scriptSigHex` for hex-based tags.
- Hash display order: block, tx and quorum hashes, merkle roots and `proTxHash` are in Dash Core's display order (byte-reversed). Keys, signatures and scripts are in wire order.
- **Output limit:** u64 fields become JS numbers. A value at or above 2^53 makes the decode throw. Real chain data never gets near that (max supply is about 1.9e15 duffs).

## Special-transaction coverage

Tested means: decoded and asserted in `tests/vectors.rs` (cargo) or `tests/core-decode.test.mjs` (Node on the built wasm).

| type | decoded | mainnet fixture vs Insight | rust-dashcore vector / construction |
|---|---|---|---|
| ProRegTx v1 to v3, incl. DIP-26 payouts and shared collateral | yes | yes (v2) | yes: testnet v1, collateral-in-tx, devnet v3 one payout, two payouts, p2sh payout |
| ProUpServTx | yes | yes | yes: testnet v1, devnet Evo v3 (platform node id, net-info ports) |
| ProUpRegTx | yes | yes | yes: testnet v1, devnet v3 |
| ProUpRevTx | yes | yes | built with rust-dashcore's encoder, plus a hand-assembled DIP-3 layout |
| CbTx v2 to v4 | yes | yes (v3) | yes: mainnet v2, devnet v4 blocks, testnet blocks |
| quorum commitment (qcTx) | yes | yes | yes: devnet and testnet blocks |
| MNHF signal | yes | **no** (see gaps) | built with rust-dashcore's encoder from its real 130-byte payload, plus a hand-assembled layout |
| asset lock | yes | yes | yes: Core asset lock from rust-dashcore |
| asset unlock | yes | yes | built with rust-dashcore's encoder, plus a hand-assembled layout |
| ProDissolveTx, ProUpShareTx, ProUpSharedRegTx (DIP-26, in rust-dashcore `dev` only) | yes | n/a, not on mainnet | **no tests** |
| unknown type or payload layout | returned as `{kind:"raw", txType, hex}`, no throw | | tested (CbTx version 99) |

The mainnet fixtures (`tests/fixtures/`, manifest in `manifest.json`) come from `scripts/fetch-fixtures.mjs`. It scanned 17,000 blocks back from tip 2,570,002 for one real tx of each type, and saved Insight's own JSON next to each. For every mainnet tx the Node test compares our output with Insight:

- **All txs:** txid, version, locktime, every input (prevout, sequence), every output (value, scriptPubKey hex, address), and that Insight's `extraPayload` appears verbatim in the tx bytes.
- **Payload fields:** each decoded type is compared to Insight's own decoded fields, e.g. CbTx merkle roots, best-CL diff and signature, credit pool balance; ProReg collateral, service, owner/voting/payout addresses, operator key, inputs hash; the qc commitment; the ProUpRev reason.
- **Block:** the whole block (X11 hash, header fields, size, the ordered txid list, CbTx height) is compared against Insight's `/block` JSON. The block hash is X11, so the X11 path is verified on real data. All 17,000 scanned blocks were also checked: their decoded hash equals the hash Insight gave for that height.

An independent review (Opus) caught that CbTx merkle roots print in wire order, not Core's display order. That is fixed, and the Insight comparison now covers it. The review also drove: `merkleRootQuorums` is `null` on CbTx v1, empty operator payout and reward scripts are `null`, p2pk outputs get an address, and `collateralInTx` was added.

## Gaps

- **No real mainnet MNHF tx.** None appeared in the 17,000 most recent blocks (about 30 days). A second scan of 4,000 blocks below height 1,987,776 died on a network reset before finishing. Insight has no tx-type search. Its decoding is covered by rust-dashcore's real payload bytes and a hand-built wire layout. To get a real one, find the txid of a hard-fork signal (e.g. from Dash Core release notes or a masternode explorer), fetch `/rawtx/<txid>` and `/tx/<txid>`, and add them to `tests/fixtures/` with a manifest entry.
- **ProDissolveTx, ProUpShareTx, ProUpSharedRegTx** (new in rust-dashcore `dev`) are mapped but have no test vectors. They do not exist on mainnet yet.
- **Not decoded:** witness data (Dash has none), BLS verification (not compiled in; the explorer only displays), and reconstruction of BIP34 height from the coinbase scriptSig (CbTx gives the height anyway). IPv6, Tor and I2P service addresses decode, but only IPv4/IPv6 text forms are human-readable; the others come back as hex.
- A transaction with zero inputs that is not asset unlock, quorum commitment, MNHF or coinbase fails to decode ("unsupported segwit version") because rust-dashcore reads it as BIP144. That matches Dash Core's rules: such a tx is invalid.
- Pinned to rust-dashcore `dev` at `568d5866133ad4ce1fbc164823c995df7bec8c34` (2026-11-10), `wasm-bindgen =0.2.118`, Rust 1.98.1. The `dev` branch is moving and has many unreleased changes. Pin deliberately and re-run `pnpm test` when bumping.
- Tests run offline from the committed fixtures. `tests/fixtures/large/` is 4 MB of hex (benchmark blocks only) and could be left out of the repo or put under Git LFS.

## Fallback

None is needed for the task. If wasm becomes a problem (size, CSP), `@dashevo/dashcore-lib` can parse blocks, classic txs and most DIP-2/3/4 payloads, but I did not test it. From memory it is a much larger bundle and may lack X11 block hashing, MNHF and the DIP-26 v3 payloads, so verify before relying on it. The `decodeBlock` / `decodeTx` JSON shape in `types/core_decode.d.ts` can stay as the contract, with a JS adapter behind it.

## Files

- `src/lib.rs` is the wasm exports, `src/decode.rs` the rust-dashcore to DTO conversion, and `src/model.rs` the output types.
- `types/core_decode.d.ts` is the hand-written typings.
- `tests/vectors.rs` holds the cargo tests (15), and `tests/vectors/README.md` says where each vector came from.
- `tests/core-decode.test.mjs` holds the Node tests (16).
- `tests/fixtures/` holds the mainnet fixtures and Insight references.
- `scripts/postbuild.mjs`, `fetch-fixtures.mjs`, `fetch-large.mjs` and `bench.mjs` are the build and fixture scripts and the benchmark.
- `.gitignore` covers `/target` and `/node_modules`. `Cargo.lock` is kept.
