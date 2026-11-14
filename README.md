# Radar

A read-only explorer for the Dash network: Core blocks and transactions, masternodes and the node census, and Dash Platform. Platform reads go through the Evo SDK and are proof-checked where Platform offers a proof; Core reads go to DAPI nodes first, with hosted indexers (Hyphen, Insight, Platform Explorer, Radar's crawl) for what DAPI cannot answer. Decentralized only mode turns the hosted indexers off. Every figure carries its source. Radar holds no keys and signs nothing.

It is a static single-page app (React, TanStack Router and Query, Lingui) served by a Cloudflare Worker (`workers/edge`). It covers mainnet, testnet and custom devnets.

## Pages

The pages follow the site map in `apps/web/src/features/entity/site-map.ts`. Each section's rail lists its pages; a group shares one rail entry and a row of tabs.

**Home**

- `/`: Network pulse. The Core tip and ChainLock, Platform height and epoch, the node map and census headline, the latest blocks and transitions, and upgrade status.
- `/search`: full results for a height, hash, address, ProTx, IP, identity, contract, token, name or epoch. The palette (⌘K / Ctrl+K or `/`) searches from any page.

**Core**

- `/blocks`: Blocks, with a date picker for one day's blocks.
- `/mempool`: Mempool.
- `/rich-list`: Rich list.
- `/charts`: Charts.
- `/governance`: Governance proposals and the next superblock.
- `/internals`: Network internals.
- `/status`: the health of every data source and the DAPI request budget.
- Record pages: `/block/$id`, `/tx/$txid`, `/address/$address`, `/governance/$hash`.

**Network**

- `/nodes`: Nodes, the census of the last crawl.
- `/masternodes`: Masternodes, with a Platform view of the evonodes (`/validators` redirects there).
- `/map`: Map.
- `/epochs`: Epochs.
- `/protocol`: Protocol version voting.
- `/v24`: Core 24 activation.
- `/changes`: Changes to the masternode list.
- Record pages: `/mn/$protx`, `/epoch/$n`.

**Platform**

- `/platform`: Platform home.
- `/platform/blocks`: Platform blocks.
- `/platform/txs`: State transitions.
- `/identities`: Identities.
- `/contracts`: Contracts.
- `/tokens`: Tokens.
- `/names`: Names.
- Voting: `/contests` (Name contests), `/votes` (Masternode votes), `/polls` (Vote polls).
- Chain state: `/quorums` (Quorums), `/credits` (Credits), `/shielded` (Shielded pool).
- Record pages: `/platform/block/$id`, `/platform/tx/$hash`, `/identity/$id`, `/identity/lookup`, `/contract/$id`, `/contract/$id/documents/$type`, `/document/$contract/$type/$id`, `/token/$id`, `/token/$id/holders`, `/name/$label`, `/contest/$label`, `/groups/$contract`, `/group/$contract/$pos`, `/platform-address/$addr`.

**Tools**

- `/query`: Query, read-only SQL over a contract's documents.
- `/tools/transition`: Transition decoder.
- `/tools/$decoder`: Decoders for raw bytes (transaction, block, identity, contract, document, proof); the rail opens `/tools/contract`.
- `/tools/verify-message`: Verify message.
- `/tools/qr`: QR reader.
- `/sdk-reference`: SDK reference.
- `/api`: Radar API.
- `/sources`: Data sources, and the switch for Decentralized only mode.

**You**

- `/saved`: Saved items, kept in this browser.
- `/settings`: Settings.
- `/about`: About.

## Running it

Node 24 and pnpm (pinned in `packageManager`; `corepack enable` picks it up).

```sh
pnpm install
pnpm --filter @radar/web dev   # dev server against live sources
pnpm build                     # production build of every package
pnpm typecheck
pnpm lint
pnpm test                      # Vitest unit and component tests
pnpm e2e:fixtures              # Playwright against a fixture build; no live service
```

`CONTRIBUTING.md` lists every script, the e2e setup, the wasm build and the translation workflow.

## Documentation

- `docs/ARCHITECTURE.md`: modules, data sources and provenance, the SDK worker, the DAPI client, query conventions, URL state, the UI kit, search, i18n and testing.
- `docs/RADAR-DESIGN.md`: the visual design and its departures from the dashhq family.
- `docs/spikes/`: the measurements behind the SDK worker, the Core decoder and DAPI.
- `CONTRIBUTING.md`: setup, checks and conventions.
