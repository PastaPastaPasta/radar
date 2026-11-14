# Contributing

## Setup

Node 24 (`.nvmrc`) and pnpm (pinned in `packageManager`; `corepack enable` picks it up).

```sh
pnpm install
pnpm --filter @radar/web dev
```

## Commands

| Command                              | What it does                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `pnpm typecheck`                     | `tsc --noEmit` in every package                                              |
| `pnpm lint`                          | ESLint, then Prettier in check mode. `pnpm format` rewrites files            |
| `pnpm test`                          | Vitest unit and component tests                                              |
| `pnpm build`                         | Production build of every package                                            |
| `pnpm size`                          | Fails if the initial JS of `apps/web/dist` exceeds 220 kB gzipped            |
| `pnpm check:bundle`                  | Fails if the production build contains the fixture worker or the kit page    |
| `pnpm test:review`                   | Unit tests for the review harness in `review/`                               |
| `pnpm check:stories`                 | Lists user stories no e2e test is tagged with; fails on tags naming no story |
| `pnpm e2e:fixtures`                  | Playwright (Chromium) against a fixture build served by the edge Worker      |
| `pnpm e2e:fixtures -- --grep @RA-20` | Only tests tagged `@RA-20`; `pnpm e2e:smoke` runs the `@smoke` subset        |
| `pnpm e2e:live`                      | The `@live` tests against live services; not part of CI                      |
| `pnpm i18n:extract`                  | Rewrites the message catalogs; commit the result. `pnpm i18n:check` is in CI |

`packages/core-decode` builds with Rust (`wasm32-unknown-unknown` and `wasm-bindgen-cli` 0.2.118): `pnpm --filter @radar/core-decode build:wasm`, then `test:wasm` and `test:rust` in that package. CI runs them in their own job.

The committed `packages/core-decode/dist` is reproducible, so the build refuses to finish without [binaryen](https://github.com/WebAssembly/binaryen/releases/tag/version_129) `version_129` (`wasm-opt` on `PATH`; CI installs that release and fails if a rebuild changes `dist/`). A change to the Rust sources, `Cargo.lock`, `rust-toolchain.toml` or binaryen needs a rebuilt `dist/` committed with it. For a local build you won't commit, set `RADAR_SKIP_WASM_OPT=1` to skip the size pass; the result is larger and differs from the committed files, so don't commit it.

First run of Playwright needs the browser: `pnpm --filter @radar/e2e exec playwright install chromium`.

## Fixtures and e2e

- The e2e suite never touches a live service. `build:e2e` builds with `VITE_DATA_MODE=fixtures` into `apps/web/dist-e2e`, which `review/serve.mjs` serves through the real edge Worker. A request with no recording fails the test and names itself.
- Recorded answers live under `apps/web/src/test/fixtures`. Record HTTP sources with `node scripts/record-fixtures.mjs --net mainnet|testnet` (add `--extra <source>:<path> --only-extra` to record one more path without touching the rest), DAPI with `node scripts/record-dapi-fixtures.mjs --net mainnet|testnet` (`--rows` adds block-list pages), and SDK answers with `node scripts/record-sdk-fixtures.mjs`. Recording reads from live nodes, so keep it to a handful of requests.
- A transaction page with spent outputs looks up each spender through Hyphen's address history. A spec that opens another such transaction needs two more recordings per output: `node scripts/record-fixtures.mjs --net mainnet --only-extra --extra "hyphen:/address/<address>/txs?limit=100" --extra "hyphen:/tx/<spender txid>"`.
- `review/fixtures.mjs` regenerates `review/fixtures/{mainnet,testnet}.json` and keeps two entities that are not picked from live data: `signed_message`, which comes from `apps/web/src/features/tools/verify-message/dashcore-vectors.json`, and `special_txs`, which it copies from the committed file.
- Tests of first paint hold the DAPI read behind a gate the test releases (`e2e/tests/app-shell.spec.ts`, "first paint"). Don't replace that with a wall-clock limit.
- `node scripts/dapi-smoke.mjs mainnet|testnet` is a read-only live check of the production DAPI transport (about a dozen requests).
- Wait for `settled(page)` (`e2e/helpers/settled.ts`) before measuring layout or checking for an error; a page's data arrives after its heading.
- The SDK wasm is over the 25 MiB per-asset limit of Cloudflare Workers, so `build/sdk-split.ts` ships it in 16 MiB parts that the SDK worker reassembles. Fixture builds leave the SDK worker and the wasm out. After an SDK upgrade, run `pnpm test` (the plugin's test checks the package layout it depends on) and `pnpm build && pnpm size`.

## Translations

Ten languages ship: `en` (source), `de`, `fr`, `es`, `pt`, `ja`, `zh`, `ru`, `tr` and `uk`. `pnpm i18n:check` (CI) fails if a catalog is stale, a message has no translation in any locale, a placeholder or tag differs from the source, a translation is marked fuzzy, or a plural lacks a category its language needs.

1. Mark the text: `t`, `plural`, `<Trans>` or `msg` from the Lingui macros, with every placeholder inside the message. Don't join translated fragments. In `apps/web/src/ui` use the global `t` from `@lingui/core/macro`; elsewhere in components use `useLingui()` from `@lingui/react/macro`. A module-level table of labels holds `msg` descriptors and renders them with `i18n._()`.
2. `pnpm i18n:extract` adds the new messages to `apps/web/src/i18n/locales/*/messages.po`.
3. Fill the `msgstr` of every new message in all nine non-English catalogs, in the same commit. Keep ICU placeholders (`{count}`, `<0>…</0>`) as they are and product names unchanged (Radar, Dash, DAPI, ChainLock, InstantSend, Hyphen, Platform Explorer). Write the plural forms the language needs: Russian and Ukrainian take `one`, `few`, `many` and `other`; Japanese and Chinese only `other`.
4. `pnpm i18n:check`.

Switch language in the footer to see a page in another locale. `key={locale}` on the routed content remounts the page on a switch, so a string read with the global `t` still updates.

## Layout

- `apps/web`: the single-page app (Vite, React, TanStack Router and Query, Tailwind v4).
- `packages/`, `workers/`: shared libraries and Cloudflare Workers.
- `e2e/`: Playwright tests, one file per story group.

## Conventions

- Conventional commits: `feat(web): add block page`, `fix(e2e): wait for hydration`, `chore: bump vite`.
- Every dependency is pinned to an exact version. No `^` or `~`.
- Every e2e test that covers a user story carries its story ID as a tag, so it can be selected with `--grep`:

  ```ts
  test('block page shows the header', { tag: ['@IN-03', '@HY-05'] }, async ({ page }) => {
    // ...
  })
  ```

- Routes are files under `apps/web/src/routes`. Filters, tabs and pages live in typed search params, not component state.
- Comments only for a non-obvious reason.
