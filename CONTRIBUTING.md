# Contributing

## Setup

Node 24 (`.nvmrc`) and pnpm (pinned in `packageManager`; `corepack enable` picks it up).

```sh
pnpm install
pnpm --filter @radar/web dev
```

## Commands

| Command                           | What it does                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm typecheck`                  | `tsc --noEmit` in every package                                              |
| `pnpm lint`                       | ESLint, then Prettier in check mode. `pnpm format` rewrites files            |
| `pnpm test`                       | Vitest unit and component tests                                              |
| `pnpm build`                      | Production build of every package                                            |
| `pnpm size`                       | Fails if the initial JS of `apps/web/dist` exceeds 220 kB gzipped            |
| `pnpm test:review`                | Unit tests for the review harness in `review/`                               |
| `pnpm check:stories`              | Lists user stories no e2e test is tagged with; fails on tags naming no story |
| `pnpm e2e:fixtures`               | Playwright (Chromium) against a `vite preview` of a fresh web build          |
| `pnpm e2e:fixtures --grep @RA-20` | Only tests tagged `@RA-20`; `pnpm e2e:smoke` runs the `@smoke` subset        |
| `pnpm e2e:live`                   | The `@live` tests against live services; not part of CI                      |

`packages/core-decode` builds with Rust (`wasm32-unknown-unknown` and `wasm-bindgen-cli` 0.2.118): `pnpm --filter @radar/core-decode build:wasm`, then `test:wasm` and `test:rust` in that package. CI runs them in their own job.

First run of Playwright needs the browser: `pnpm --filter @radar/e2e exec playwright install chromium`.

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
