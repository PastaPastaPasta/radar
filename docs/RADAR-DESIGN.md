# Radar design

Radar is the read-only explorer for the whole Dash network: Core blocks and transactions, the masternode network, and Dash Platform. It ships first at explorer.dashhq.org. This document sets how Radar looks and moves. `docs/ARCHITECTURE.md` owns component names, props and data flow; this document uses the same names and owns what they look like.

Radar is a dashhq product. It sits on shell 1.9.3 (`dashhq-tokens.css`, `dashhq-shell.css`, `dashhq-components.css`) and follows `dashhq-lab/design/DESIGN.md`: Archivo, sentence case, one amber primary per view, blue for wayfinding, status green/orange/red always with a word, sources beside figures. Everything below adds to that; nothing here overrides a family rule without saying so (§15).

Mockups: `docs/mockups/index.html` (static HTML, live data captured 10 Nov 2026). Screenshots: `docs/mockups/shots/`. The CSS in `docs/mockups/assets/radar.css` is the reference implementation of every value in this file.

---

## 1. What Radar should feel like

An instrument, not a document. A visitor should see the network moving within a second of landing, recognise any entity by its shape before reading its hash, and know where every figure came from without asking.

Five ideas carry that:

1. **Three layers, three hues.** Core is Dash blue, Platform is teal, the masternode network is plate navy. Every page, badge, keyline, chart series and map ping says which layer it belongs to by colour before the words do.
2. **The plate.** Network pages and the home page open on a deep navy ground with a faint dot grid: a dark island in both themes. It is Radar's signature surface and the only place the map lives.
3. **Entities have faces.** Identities get identicons, masternodes get nodeprints, blocks and transactions get layer tiles. Chips carry them everywhere, with copy and a hover card.
4. **Figures carry their source.** A small source mark (`SourceLine`) sits beside the figure it describes, not in a footer: Proof-checked, Served by DAPI, Indexed by Platform Explorer or Hyphen, Crawled by Radar, plus age.
5. **Live means visibly live.** New blocks slide in, rows flash once, pings ripple on the map, the freshness dot pulses on update. Every live feed can be paused. Reduced motion keeps the information and drops the movement.

### 1.1 Home signature: the scope

The home page opens on the plate with a full-bleed **scope** (mockup `home.html`):

- **Left column (400 px):** kicker with live dot and network ("Live · Mainnet · Core, Platform and the masternode network"), the headline "The Dash network, now" (40 px, weight 680, stretch 116%; 28 px on phone), a two-line lede, the omni search (50 px high, 8 px radius, `/` hint), three *Try* chips with real examples, the page's one amber button ("Open the map") and a blue text link ("Network census →").
- **Right, bleeding to the viewport edge:** an Equal Earth **dot-matrix world map** (hex-offset land dots, 6 px pitch at 1000 px width) with every masternode cluster drawn as a pale-blue disc and evonode clusters in teal, radius `2 + √n × 0.85` (map units). Two **pings** show the latest events: a blue three-ring ping where the newest Core block paid a masternode, a teal one where the newest Platform block's proposer sits. Each ping has a **callout** (`--rx-callout` panel with a 1 px `--rx-plate-edge` border and a 3 px layer keyline on the left: "Block 2,569,992 · Paid a masternode in Singapore"). Legend bottom-left.
- **Pulse row (3 tiles, full container width):** Core height (ChainLocked lock + age), Platform height (Proof-checked, epoch meter "Epoch 88 · 18% through"), masternodes answering (99.1%, good colour, "2,187 of 2,207"). Each tile has a 40 px layer tile, its `SourceLine` in the label row, and a 28 px value (weight 680; 22 px on phone).
- **Two-lane chain:** the latest 8 Core blocks on the top lane and the latest 10 Platform blocks under them, as 44 px block cards. **Tie lines** (1 px, teal, 70% opacity) run from each Platform block up to the Core block it is locked to (`l1LockedHeight`), so the relationship between the two chains is visible at a glance. A Live/Pause toggle sits at the lane's top right.

Below the scope the page changes to the light page ground and proceeds in **zones** (§5): latest activity, masternode network, Dash Platform, Dash Core, and the link-out cards to Governance and Bridge.

### 1.2 Per-page signatures

Each record type gets one visual that only it has. They earn their place by answering the page's main question faster than a table can.

| Page | Signature | Answers |
|---|---|---|
| `/` | the scope (map + pulses + two-lane chain) | Is the network alive, and where is it working right now? |
| `/tx/<txid>` | value-flow ribbon + settlement steps (seen → InstantSend → mined → ChainLocked) | Where did the money go, and is it final? |
| `/mn/<protx>` | 90-day uptime strip + rewards-by-epoch bars against the middle 80% band | Is this node healthy and earning like its peers? |
| `/identity/<id>` | activity calendar (one square a day, a year wide) | How active is this identity, and when? |
| `/epoch`, Platform home | epoch clock (track with blocks-so-far and ETA) | Where are we in the epoch? |
| `/masternodes` | status stack bar above the census stats | How much of the list is healthy? |

---

## 2. Layout

### 2.1 Grid

| Token | Value | Use |
|---|---|---|
| `--dh-max` | 1200 px | container (family) |
| `--dh-gutter` | `clamp(16px, 4vw, 40px)` | side gutter (family); 16 px at 390 px wide |
| grid | 12 columns, 16 px gap (`.rx-grid`, `.rx-c3…c12`) | zones, card rows |
| split | `minmax(0, 1fr) 360px`, 24 px gap (`.rx-split`) | record pages: main column + facts aside |
| bar | 52 px (`--dh-bar-h`), sticky | family shell |
| tab bar | 44 px, sticky under the bar | record pages |

Radar keeps the family 1200 px container. Two things break out on purpose: the scope map bleeds to the right viewport edge (`margin-right: calc(-1 * ((100vw - min(100vw, var(--dh-max))) / 2 + var(--dh-gutter)))`), and bands and zones run full width with their content in the container.

### 2.2 Breakpoints

| Width | Changes |
|---|---|
| ≥ 1024 | full layout; 12-col grid; split with 360 px aside |
| 1023 – 861 | grid items fall to 6 columns (wide ones full); split stacks (aside under main); scope stacks map under copy |
| 860 – 641 | inputs/outputs stack with a rotated arrow; record actions wrap under the title |
| ≤ 640 (phone) | single column; stat rows 2-up; tables become cards (§6.7); bottom tab bar (§11); the ⌘K palette goes full screen; card padding 14 px |

Page rhythm: band padding 28/32 px; zone padding 40 px top; section gap 56 px (40 px on phone); card gap 16–20 px; inside cards 20 px sides (14 px phone).

---

## 3. Type

Archivo variable (family), system mono for hashes, addresses, versions and keys. All numbers use tabular figures.

| Role | Size / line | Weight / stretch | Token |
|---|---|---|---|
| Home headline (scope) | 40 px / 1.05 (28 px phone) | 680 / 116% | — (fixed so the scope column holds two lines) |
| Pulse tile value | 28 px (22 px phone) | 680 / 108% | — |
| Hero number (one per page, optional) | 62 px | 660 / 108% | `--rx-fs-hero` |
| Page title (`h1`, record header) | 30 px (24 px phone) | 660 / 110% | `--dh-fs-h1` |
| Section title (`h2`, ruled) | 21 px | 660 / 110% | `--dh-fs-h2` |
| Card title | 17 px | 620 | `--dh-fs-h3` |
| Band KPI value | 34 px | 660 / 108% | `--rx-fs-big` |
| Stat value | 26 px | 660 / 108% | `--dh-fs-stat` |
| Body | 15 px / 1.5 | 400 | `--dh-fs-body` |
| UI (tabs, buttons, table) | 14 px | 520 | `--dh-fs-ui` |
| Small (labels, notes, sources) | 13 px; notes 12.5 px | 400–520 | `--dh-fs-sm` |
| Mono chip | 13 px; mono small 12.5 px | 400 | `--rx-fs-mono-sm` |
| Badge / count | 11–12 px | 600–650 | — |

Rules:

- Units after a value are 14 px, weight 520, `--dh-ink-2`, 2 px gap ("10.1333 DASH", "666 duffs").
- Eight-decimal DASH amounts dim the last four digits (`.rx-d2`, `--dh-ink-2`) so the significant part reads first: 50.0000**0000**.
- Hashes in running text are short: first 6, ellipsis, last 4 (`cb4c0d…cdf0`). Full hashes appear once per record header, with the first 4 and last 2 characters bold.
- Usernames: label bold, `.dash` in `--dh-ink-2`.
- Sentence case everywhere, including buttons, tabs and badges.

---

## 4. Colour

### 4.1 Layer hues

Layers are grounds, tiles and keylines; they are not status. Each layer has five tokens: fill, ink on fill, soft ground, line (keylines, chart marks, ≥ 3:1 on white), text (≥ 4.5:1 on its soft ground and on white).

| Layer | Fill | Ink | Soft | Line | Text | Dark fill / soft / text |
|---|---|---|---|---|---|---|
| Core | `#0070C4` | `#FFFFFF` | `#E0EFFA` | `#008DE4` | `#0067AD` | `#1A9CF0` / `#0D2B40` / `#5EC2F6` |
| Platform | `#25B8A6` | `#0A2A3D` | `#DCF4F1` | `#1E9586` | `#0B6B60` | `#25B8A6` / `#103A40` / `#5FD9C7` |
| Network | `#0A2A3D` | `#CFE6F7` | `#E4EBF0` | `#0A2A3D` | `#0A2A3D` | `#A6D8F7` / `#10222F` / `#A6D8F7` |

Tokens: `--rx-core`, `--rx-core-ink`, `--rx-core-soft`, `--rx-core-line`, `--rx-core-text`, and the same for `--rx-plat-*` and `--rx-net-*`.

`[data-layer="core|platform|network"]` on any element maps the right set to generic names that components use: `--rx-l` (line), `--rx-l-fill`, `--rx-l-ink`, `--rx-l-soft`, `--rx-l-text`. Components only read the generic names.

Which layer a thing belongs to:

- Core: blocks, transactions, addresses, mempool, ChainLocks, InstantSend, supply, asset locks, credit withdrawals, shielding from an asset lock.
- Platform: Platform blocks, state transitions, identities, contracts, documents, tokens, names, epochs, credits.
- Network: masternodes, evonodes, quorums, the census, versions, hosting, countries, masternode votes, governance link-outs.

A **type badge takes the layer the type touches**, not the chain it is recorded on: "Shield from asset lock" and "Credit withdrawal" are Platform transitions but show Core blue, because they move value across the bridge; "Masternode vote" shows network navy.

### 4.2 The plate

| Token | Light | Dark | Use |
|---|---|---|---|
| `--rx-plate` | `#0A2A3D` | `#0D3149` | plate ground |
| `--rx-plate-2` | `#103650` | `#123A52` | cards and callouts on the plate |
| `--rx-plate-3` | `#16435F` | `#18475F` | raised, meter tracks, chips |
| `--rx-plate-line` | `rgba(166,216,247,.16)` | same | rules and the 22 px dot grid |
| `--rx-plate-dot` | `rgba(166,216,247,.36)` | same | map land dots |
| `--rx-plate-0` | `#061E2D` | same | wells on the plate (`--dh-sunken` inside it) |
| `--rx-plate-4` | `#1E5170` | same | hover on plate-3 |
| `--rx-plate-edge` | `#2C5A78` | same | decorative edges (callouts, kbd) |
| `--rx-plate-ctl` | `#7A9DB4` | same | control borders: 3:1 or more on every plate surface, both themes |
| `--rx-callout` | `rgba(6,30,45,.92)` | same | map callouts |
| `--rx-tip-core` / `-line` | `#123F5C` / `#3D7BA6` | same | newest Core block in the lane chain |
| `--rx-tip-plat` / `-line` | `#0F4447` / `#2E9C8F` | same | newest Platform block in the lane chain |

`.rx-plate` redeclares every `--dh-*` token to its dark value inside the element (ink `#E4F3FC`, ink-2 `#9BBDD2`, brand-ink `#8FD0FA`, line-2 `--rx-plate-ctl`, good `#4CC38A`, warn `#F29C5F`, bad `#FF8F86`, focus `#8FD0FA`), so family components (buttons, badges, kv lists, seg controls) work unchanged on the navy. The plate is the same navy in both themes and a step lighter in dark so it still reads as a distinct band against the dark page (`#06131B`).

### 4.3 Data colours

- **Single series:** the layer line colour (`--rx-l`). Platform bars use `--rx-plat-line` in light (`#1E9586`, 3.7:1 on white); `--rx-plat` (`#25B8A6`) is only for fills that carry text in `--rx-plat-ink` or for marks on the plate.
- **Ordered series** (versions, ranks): the family blue ramp `--dh-ramp-1…5`, newest/most first, then `--dh-line-2` for "Other".
- **Platform ordered series:** teal ramp `--rx-teal-1…5` (`#0B6B60 #1E9586 #25B8A6 #7FD6CA #BDEBE4`; reversed in dark).
- **Heatmaps** (activity calendar): `--rx-cal-1…3`, each at least 3:1 against the empty cell: light `#1E9586 #0B6B60 #06403A`, dark `#1E9586 #5FD9C7 #BDEBE4`.
- **Comparison band** ("middle 80% of evonodes"): the layer fill at 18% opacity behind the bars.
- **Status in data** (answering / no answer / banned; uptime cells): `--dh-good`, `--dh-warn`, `--dh-bad` with a legend that names them.
- **Fee** is `--dh-warn` in the value-flow chart; change is `--dh-line-2`.
- Never more than five hues in one chart. No purple, indigo, magenta, gradients or neon.

### 4.4 Identicons and nodeprints

- **Identicon** (identities, contract owners): 5×5 grid mirrored left–right from bytes 1–2 of the identifier, on a tinted square with a 24% corner radius. Fill comes from byte 0 mod 8: `--rx-id-0…7` = `#0070C4 #1E9586 #0A2A3D #2B90BC #0B6B60 #4A6B85 #1F7FB8 #2E8F99` (dark swaps `--rx-id-2` to `#A6D8F7` and `--rx-id-5` to `#8FB3CC`). Background is the fill at 14%. Sizes: 18 (chips), 28 (palette), 48 (preview), 64 (record header).
- **Nodeprint** (masternodes, evonodes): a 12-segment ring, each segment on or off from the ProTx hash (every fifth always on), with a centre dot whose radius varies 2.2–3.6. Masternode: ring and core in `--dh-ink`. Evonode: core in `--rx-plat` and a teal ring tint. Sizes 18, 28, 60.
- **Layer tile** (blocks, transactions, contracts, documents, tokens, epochs): rounded square (22% radius) in the layer fill with a white or ink glyph at 55%. Sizes 26 (card titles), 28 (palette), 36 (default), 44 (pulse), 60 (record header).

These are recognition aids, never the only label: the hash or name always sits next to them.

### 4.5 Status, amber, links

- Status uses family tokens and always pairs with a word or icon: `--dh-good` (answering, executed, unspent, ready), `--dh-warn` (no answer, missed some, not ready, outdated version, stale data), `--dh-bad` (banned, failed, missed most, source down).
- **Amber** (`--dh-act`, the family action token) is the one primary action per view. On the home page it is "Open the map". Record pages usually have none: their actions are secondary buttons or link-outs. Amber never marks state; stale ages use `--dh-warn`.
- Blue (`--dh-brand-ink`) is for links and wayfinding. Entity chips are links: blue text, underline on hover.
- Proof: the family "Verified" proof badge (`.dh-proof--ok`) appears only on a record whose identity data was proof-checked in the browser (identity header). Figure-level proof is the `SourceLine` "Proof-checked" mark in good green.

### 4.6 Tailwind `@theme` additions

The app loads the dashhq tokens first, then adds these. Values are `var()` references so the theme switch and the plate island keep working.

```css
@theme inline {
  /* layers */
  --color-core: var(--rx-core);         --color-core-ink: var(--rx-core-ink);   --color-core-soft: var(--rx-core-soft);
  --color-core-line: var(--rx-core-line); --color-core-text: var(--rx-core-text);
  --color-plat: var(--rx-plat);         --color-plat-ink: var(--rx-plat-ink);   --color-plat-soft: var(--rx-plat-soft);
  --color-plat-line: var(--rx-plat-line); --color-plat-text: var(--rx-plat-text);
  --color-net: var(--rx-net);           --color-net-ink: var(--rx-net-ink);     --color-net-soft: var(--rx-net-soft);
  --color-net-line: var(--rx-net-line); --color-net-text: var(--rx-net-text);
  --color-layer: var(--rx-l);           --color-layer-fill: var(--rx-l-fill);   --color-layer-ink: var(--rx-l-ink);
  --color-layer-soft: var(--rx-l-soft); --color-layer-text: var(--rx-l-text);
  /* plate */
  --color-plate: var(--rx-plate); --color-plate-2: var(--rx-plate-2); --color-plate-3: var(--rx-plate-3);
  --color-plate-line: var(--rx-plate-line); --color-plate-dot: var(--rx-plate-dot);
  --color-plate-0: var(--rx-plate-0); --color-plate-4: var(--rx-plate-4); --color-plate-edge: var(--rx-plate-edge);
  --color-plate-ctl: var(--rx-plate-ctl); --color-callout: var(--rx-callout);
  --color-tip-core: var(--rx-tip-core); --color-tip-core-line: var(--rx-tip-core-line);
  --color-tip-plat: var(--rx-tip-plat); --color-tip-plat-line: var(--rx-tip-plat-line);
  --color-cal-1: var(--rx-cal-1); --color-cal-2: var(--rx-cal-2); --color-cal-3: var(--rx-cal-3);
  /* data */
  --color-teal-1: var(--rx-teal-1); --color-teal-2: var(--rx-teal-2); --color-teal-3: var(--rx-teal-3);
  --color-teal-4: var(--rx-teal-4); --color-teal-5: var(--rx-teal-5);
  --color-id-0: var(--rx-id-0); /* … through */ --color-id-7: var(--rx-id-7);
  --color-testnet: var(--rx-testnet); --color-testnet-ink: var(--rx-testnet-ink); --color-testnet-soft: var(--rx-testnet-soft);
  --color-flash-core: var(--rx-flash-core); --color-flash-plat: var(--rx-flash-plat);
  /* type, motion, sizes */
  --text-hero: 62px; --text-big: 34px; --text-mono-sm: 12.5px;
  --ease-out-expo: cubic-bezier(.16, 1, .3, 1);
  --animate-enter: rx-enter 240ms cubic-bezier(.16, 1, .3, 1);
  --animate-flash: rx-flash 1200ms ease-out;
  --width-hovercard: 340px;
}
```

The raw `--rx-*` values live in one stylesheet (`apps/web/src/styles/radar-tokens.css`), copied from section 1 of `docs/mockups/assets/radar.css`, with the light set on `:root`, the dark set under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` and again under `:root[data-theme="dark"]` (the family pattern).

---

## 5. Bands, zones, sections and cards

### 5.1 Page band

Every page starts with one band directly under the bar. It holds the band nav (the layer's sub-pages), breadcrumbs, the record header and the page's KPI row.

| Page family | Band ground |
|---|---|
| Home, Network pages (`/masternodes`, `/mn/*`, `/map`, census) | the plate |
| Core pages (`/block/*`, `/tx/*`, `/address/*`, mempool) | `--rx-core-soft` |
| Platform pages (`/identity/*`, `/contract/*`, `/epoch/*`, names) | `--rx-plat-soft` |

Band padding 28 px top, 32 px bottom; 1 px `--dh-line` bottom edge (none on the plate). Band nav: 30 px pill links (11 px side padding, 6 px radius), `--dh-ink-2`, current page on `--dh-surface` with ink text.

**Record header** (`.rx-rec`): glyph (60–64 px identicon, nodeprint or tile) | kicker (type badge + context line) | title (30 px; mono for hashes, the port of an IP:port in `--dh-ink-2`) | actions on the right (link-outs, copy link, save) | full ID with copy | status badges and `SourceLine`s. Then the KPI row: 5 stats (4 on tx), 12 px gap, the first one `--big` with the layer keyline.

### 5.2 Zones and sections

A **`SectionBand`** is a full-width zone in its layer's soft ground (`--rx-l-soft`, 1 px rules top and bottom, 40 px top padding) with a ruled section head. The home page stacks three: Masternode network, Dash Platform, Dash Core. Record pages use plain sections on the page ground instead.

A **section head** is the family ruled head: 4 px rounded keyline in the layer line colour to the left of a 21 px title, a one-line description in `--dh-ink-2` beside it, actions ("All 2,997 masternodes →") right-aligned. A hidden copy-link icon appears on hover/focus of the head.

### 5.3 Card

`Card`: `--dh-surface`, 1 px `--dh-line` border, `--dh-r3` (10 px) radius, no shadow at rest.

- Head: 14 px top / 12 px bottom, 20 px sides. Title 17 px, optionally preceded by a 26 px layer tile. `actions` and the card's `SourceLine` right-aligned in the head, so the source sits beside the figures (see §15). The foot keeps the "All … →" link and keyboard hints.
- Body: 0 20 px 18 px. `padding="flush"` for tables, which run edge to edge.
- Foot: 11 px × 20 px, 1 px top rule, 13 px `--dh-ink-2`; "All … →" link at the right; keyboard hints on the left (desktop only).
- `layer` sets `data-layer`, which tints the title tile, the table flash and focus row.
- States: loading → `Skeleton` blocks in the body; empty → `Empty` in the body; error → `ErrorState` in the body; source down → body at 74% opacity and greyscale with the down message on top and the last-good age (§6.13).

### 5.4 Composition rules

- One plate band per page at most. Never put the plate inside a card.
- One amber button per view, and no amber on record pages unless the page has a real primary action.
- No more than two layer hues side by side in one card. A card is one layer.
- Every figure in a stat, tile or KPI has its `SourceLine` in its label row or the card head.
- Lists show 8–22 rows before "All … →"; long lists page (§6.7).

---

## 6. Component catalogue (looks and states)

Names and props are in `docs/ARCHITECTURE.md` §7.2. Measurements are desktop unless noted. A `layer` of `neutral` (or none) maps `--rx-l` to `--dh-brand` for marks and `--dh-line-2` for keylines, with no tinted ground.

### 6.1 `Card`, `SectionBand`, `KeyValue`

See §5. `KeyValue` uses the family `dh-kv dh-kv--ruled`: label 13 px `--dh-ink-2` in a 110 px column (aside) or 160 px (main), value 14 px ink, 1 px rules between rows, 10 px row padding. `columns={2|3}` sets a CSS grid of kv blocks with 24 px gaps. A row with `source` puts a compact `SourceLine` after the value. `hint` is a 12.5 px `--dh-ink-2` line under the value.

### 6.2 `Stat`

Box: `--dh-surface` (plate-2 on the plate), 1 px line, 10 px radius, padding 14 16 14 18 px. A 3 px **keyline** runs down the left edge (inside the radius): the layer line colour when `layer` is set, `--dh-line-2` otherwise, and `--dh-good/warn/bad` when the figure itself is a status (needs a `tone` prop, §15).

- Label: 13 px `--dh-ink-2`, with the `SourceLine` (compact) inline after it.
- Value: 26 px (`size="lg"`: 34 px), weight 660, stretch 108%, tabular; tone colours the value too for good/warn/bad.
- Unit: 14 px `--dh-ink-2`.
- Note: 12.5 px `--dh-ink-2`, one or two lines.
- `meter`: 6 px meter under the note. `spark`: 28 px high sparkline under the note.
- `delta`: "+14 this week" in the note; coloured only when `goodWhen` makes it meaningful, with ↑/↓.
- `href`: the whole tile is a link; hover raises the border to `--dh-line-2` and turns the label link blue.
- Loading: label stays, value becomes a 120 × 26 px skeleton.
- Value change (live): the new digits roll in from above (`rx-roll`, 240 ms). Reduced motion: swap.

Stat rows: 5 across at ≥ 1024 (`.rx-stats`, 12 px gap), 2 across on phone.

### 6.3 `EntityChip`

Inline link: glyph + label, 7 px gap, `--dh-brand-ink`, underline on hover/focus.

- Glyph: identicon (identity, name owner), nodeprint (masternode, evonode), or a 20 px glyph square in the layer soft ground with the layer glyph (block, tx, address, contract, document, token, epoch, quorum).
- Label: name (bold, `.dash` dimmed) or a short hash in 13 px mono; masternodes show IP:port in mono weight 600.
- `size="sm"`: glyph 16 px, label 12.5 px. `size="md"`: 20 px / 13 px.
- Box variant (`.rx-chip--box`, in dense rows): 26 px high, 1 px line, 6 px radius.
- **Copy**: a 24 px ghost icon button after the chip (`Copy`), always visible (it is the only copy affordance on touch). On click the icon becomes a check for 1.4 s and the live region announces "Copied".
- **Hover card**: opens after 350 ms hover or immediately on keyboard focus; closes 200 ms after the pointer leaves both chip and card; Esc closes. 340 px wide, 10 px radius, `--dh-shadow-pop`, 3 px layer keyline along the top. Content: glyph 28–32 px + type line ("Masternode · Hetzner, Falkenstein DE") + title; full hash in 11.5 px mono; 3–5 kv rows; foot with `SourceLine` and an "Open … →" link. Never on touch: tap navigates.

### 6.4 `Hash`

Mono, `--dh-ink`. `short`: 6…4 with the ellipsis in `--dh-ink-2`. `full`: one line, first 4 and last 2 characters bold, `word-break: break-all` only when it must wrap (`wrap`). Copy button follows (`copy` default true). Never truncate in the middle of a record header without a full form on the same page.

### 6.5 `Amount` and `Time`

- `Amount` default unit DASH. Eight decimals in tables (last four dimmed, §3), four decimals in stats and prose ("50.0061 DASH"). `duffs` for fees under 0.0001 DASH ("666 duffs"). Credits show as DASH with the credit count in the note ("10.1333 DASH · 1,013,331,591,984 credits"). `mDASH` for Platform fees ("0.7460 mDASH").
- `fiat`: "≈ $2,310" in the note, never as the main value, mainnet only.
- `signed`: "+1.3916" in `--dh-good`, "−0.5" in ink (outflows are not errors).
- `compact`: "1.2k DASH", "12.66 M DASH" (supply). Use it in tiles where the exact value is one click away; stats on record pages stay exact ("36,921 DASH").
- `Time` `mode="both"`: "14:28 UTC · 2 min ago". Relative: "21 s", "8 min", "2 h", "yesterday", then "6 Nov". Absolute: "14:28 UTC" or "10 Nov 2026, 14:28 UTC". Relative values tick every 10 s when `live`. A `title` always carries the full UTC time.

### 6.6 `Badge` and `TypeBadge`

- `Badge`: family `dh-badge` (22 px high, 4 px radius, 12 px 600). Tones: success → `--dh-good`, warning → `--dh-warn`, danger → `--dh-bad`, info → `--dh-info` (brand ink on brand-soft), neutral → `--dh-chip`. `size="sm"` is 18 px / 11 px.
- `TypeBadge`: 22 px high, radius 4 px, padding 0 7 0 5 px, 12 px weight 520, glyph 13 px + label; 18 px / 11 px inside two-line table cells. Ground is the layer soft colour, text the layer text colour (`.rx-type`). On the plate it uses plate-3 with the plate text tokens. Solid variant (`--solid`, layer fill + ink) only in the record header kicker when the type is the page subject.

Type → glyph → layer:

| Types | Glyph | Layer |
|---|---|---|
| Payment, coinbase, asset lock, asset unlock | arrows, coin, lock | Core |
| ProRegTx, ProUpServTx, ProUpRegTx, ProUpRevTx, quorum commitment, MnHF signal | node, quorum, flag | Network |
| Identity create, top-up, update | person, plus | Platform |
| Credit transfer, credit withdrawal | arrows, up-arrow | Platform / Core |
| Shield from asset lock, shielded transfer, shielded withdrawal | shield | Core (from/to Core) / Platform |
| Data contract create/update | cube | Platform |
| Document create/replace/delete/transfer/purchase | document | Platform |
| Token mint/burn/transfer/freeze/claim/… | token | Platform |
| Masternode vote | ballot | Network |

### 6.7 `DataTable`

Desktop:

- Header: 13 px weight 520 `--dh-ink-2`, 9 px × 12 px, sticky under the bar, 1 px bottom rule. Sortable headers are buttons; the sorted one is ink with ↓/↑ in brand blue and `aria-sort`.
- Rows: 8 px × 12 px (feeds: 7 px), 1 px `--dh-line` rule, middle aligned, no zebra. Numeric columns right-aligned and tabular. Two-line cells (`.rx-2l`): primary 14 px, secondary 12.5 px `--dh-ink-2`.
- Hover: `--dh-hover` ground. Focused row (`j`/`k` or keyboard): `--dh-select-soft` ground and a 3 px `--dh-select` inset keyline on the left. Whole-row links via `rowLink`; inner chips and filter buttons stay separately clickable.
- Click-to-filter cells (country, version, host) are ghost buttons that show an underline and a filter glyph on hover.
- Tools row above (16 px padding): segmented type filter with counts, search input (grows), filter buttons (`is-on` = brand ring and value), "Filters n" on phone. Active-filter row on `--dh-sunken`: match count, removable tokens, Clear, sort description.
- Foot (`.rx-tfoot`): keyboard hints, `SourceLine`s, pager ("1–22 of 2,207", Previous/Next). Infinite lists show a 40 px "Loading more" row with a skeleton.
- **Live** (`live.newRowIds`): new rows slide down 8 px and fade in over 240 ms, then their ground flashes in the layer flash colour and fades over 1.2 s. While the pointer is over the table or a row has focus, inserts queue and a "3 new blocks · show" pill appears above the table instead.
- States: loading → 8 skeleton rows at real row height; empty → `Empty` spanning the table; error → `ErrorState` row with Retry.

Paging: `page` shows "1–22 of 2,207" + Previous/Next (small secondary buttons, Previous disabled on page 1); `cursor` shows only Previous/Next with "Newer"/"Older" labels for time-ordered lists; `infinite` appends with the loading row and keeps a "Back to top" link in the foot.

Phone (`phone="cards"`, default) — each row becomes a 2-column card, 12 × 14 px padding, 1 px rule between cards. Column `phone` meta places cells:

| meta | Position |
|---|---|
| `title` | row 1, left; 15 px ink; the row link stretches over the whole card |
| `primary` | row 1, right; right-aligned (status, age) |
| `secondary` | row 2, left and right (`u`, `s` slots in the mockup) |
| (no meta) | full-width line below, label prefix from the header ("Paid 2,569,990") |
| `hidden` | not shown |

Masternode card: nodeprint + IP:port + type tag | Answering; version | country + city; "Paid 2,569,990 · 5 min ago".

`phone="scroll"` (wide numeric tables such as rich lists and epoch history): the table keeps its columns and scrolls sideways inside the card, the first column sticky with a 1 px right rule, and a 24 px fade on the scrolling edge.

### 6.8 `Tabs`

Links, not buttons. 44 px high, 22 px gap, 14 px weight 520 `--dh-ink-2`; current tab ink weight 620 with a 3 px layer keyline on the bottom edge (rounded top corners). Counts: 18 px pill, 11 px 600, `--dh-chip`. Scrolls horizontally on overflow with no visible scrollbar; the current tab scrolls into view. A `disabled` tab is `--dh-ink-3`, not focusable, with its reason in a `title` ("No tokens on this identity"). Focus is a 2 px inset ring (the row clips outlines). The tab bar is sticky under the bar on record pages, on the page ground with a 1 px rule.

### 6.9 `SourceLine` and `LiveDot`

Compact mark (the family source tag): 20 px min height, 1 × 6 px padding, 1 px dotted `--dh-line-2` border, 3 px radius, transparent ground, 12 px weight 520 `--dh-ink-2`, 12–13 px glyph. Wording is ARCHITECTURE.md §7.3; the looks:

| Stamp | Look |
|---|---|
| `sdk`, proved — Proof-checked | `--dh-good` text, solid border at 45% good; shield-check glyph; a button that opens the proof inspector (hover: good-soft ground) |
| `sdk`, not proved — Served by DAPI · not proved | neutral, antenna glyph |
| `sdk-cold` — Indexed by Platform Explorer · checking… | neutral, database glyph, 12 px spinner in place of the age |
| `dapi` — Served by DAPI | neutral, antenna glyph; the serving node in a tooltip |
| `pe` / `hyphen` — Indexed by … | neutral, database glyph |
| `hyphen` fallback — Indexed by Hyphen · DAPI busy / unreachable | neutral; "DAPI unreachable" also turns the mark `--stale` |
| `radar` — Crawled by Radar | neutral, radar glyph |
| `local` — Computed in your browser | neutral, cpu glyph |
| `rate` — Price from … | neutral, coin glyph |

ARCHITECTURE.md lists a glyph only for Proof-checked; the glyphs above are part of the look and every mark keeps its words, so the glyph never carries meaning alone.

Age follows after a middle dot ("· 12 s ago"). When the age passes staleTime × 4 the text turns `--dh-warn` and the border becomes dashed in the same colour (`--stale`). When the source is down: `--dh-bad` text, dashed bad border, "isn't answering · last good 4 min ago" (`--down`). Joined sources render one mark per source. Examples of every state: the States section of `mockups/index.html`.

`LiveDot`: 8 px dot, always followed by a word. Health states: `live` and `ok` → `--dh-good` with one 900 ms ring pulse each time data lands (not on a loop), word "Live"; `slow` → `--dh-good`, no pulse, "Slow"; `degraded` and `stale` → `--dh-warn`, "Behind"; `down` → `--dh-bad`, "Down"; `unknown` → `--dh-ink-3` hollow dot, "Checking". Paused feeds use `--dh-ink-3`.

**Live/Pause control** (every auto-updating feed, WCAG 2.2.2): a 26 px pill on `--dh-good-soft` with the `LiveDot`, "Live" and a pause icon button; paused, it turns neutral (`--dh-chip`) and reads "Paused · 4 new" with a play button.

### 6.10 `Empty`, `ErrorState`, `Skeleton`

- `Empty`: centred in the card body (28 px top, 30 px bottom), 32 px tile in `--dh-chip` with a relevant glyph, 15 px weight 620 title, one or two lines of 14 px `--dh-ink-2` body (max 46 ch), optional secondary button. Kinds and copy:
  - `none-yet`: "No transitions yet" + why.
  - `no-match`: "Nothing matches these filters" + Clear filters.
  - `not-found`: "Not found on Mainnet" + "Found on Testnet →" when it exists there.
  - `unsupported-network`: "Testnet doesn't have this yet" + a link to the same page on Mainnet.
  - `blocked`: "Hidden by the operator" (tile `--dh-warn-soft`) + a link to the policy.
- `ErrorState`: same layout, bad-soft tile with an alert glyph, title says what failed and from where ("Platform Explorer isn't answering"), body says what still works, Retry is a secondary button. `compact` is a single 40 px row for table bodies.
- `Skeleton` shapes: `line` (12 px high, 4 px radius, widths vary 55–90%), `block` (any size, 10 px radius), `stat` (label line + 120 × 26 px value), `row` (the table's real row height with cell-width lines), `chip` (20 px glyph square + 80 px line, 6 px radius), `chart` (the chart's height with 12 faint bars). They use `--dh-sunken` with a 1.4 s shimmer (`linear-gradient` sweep, the only gradient allowed besides the plate grid); radius matches the shape (chips 6 px, stats 10 px, lines 4 px). Reduced motion: static blocks.

### 6.11 `Sparkline`, `Meter`, `Chart`

- `Sparkline`: 1.75 px line in the layer line colour, 14% area, last point as a 3 px dot with a 2 px surface ring when `highlightLast`. Default full width × 36 px. No axes; the `label` and an `aria-describedby` summary carry the meaning.
- Bar strips (`.rx-bars`): 56 px high, 2 px gaps, 2 px top radius, layer line colour at 90%; `dim` bars at 35% for incomplete periods.
- `Meter`: 8 px track (`--dh-sunken`, plate-3 on the plate), 4 px radius, fill in the layer line colour or the threshold tone; `--lg` is 14 px. `marker`: a 2 px ink tick 4 px taller than the track with its label above.
- Stack bar (status mix): 14–16 px, 4 px radius, 2 px gaps between segments, min segment 3 px, always with a legend that has counts.
- Uptime strip: 90 cells (masternode page), 2 px gap, 34 px high, good/warn/bad; 30-cell compact form 2 px wide × 14 px in tables. A tooltip and a hidden text summary ("Missed 9 of 48 checks on 5–6 Sep") per bad stretch.
- Epoch clock: 18 px track, 9 px radius, `--rx-plat-line` fill, blocks-so-far tick, end time and "Ends in about 7.4 days" at the right.
- Activity calendar: 7 rows × 53 columns of square cells that fill the card width (about 10 px in the 1440 layout), 3 px gap, 2 px radius; levels 1 / 2–4 / 5+ in `--rx-cal-1…3`; empty days `--dh-sunken`. Month labels under it. Each cell's count is in its accessible table equivalent, not only in a tooltip.
- `Chart` (ECharts): §7. `loading` shows the `chart` skeleton at the chart's height.

### 6.12 Value flow and settlement (tx page)

- Flow: SVG 1060 × 270; inputs at x = 300, outputs at x = 760; nodes are 8 px bars in the layer fill (change `--dh-line-2`, fee `--dh-warn`); ribbons are cubic curves at 22% fill (change 14% ink-2, fee 35% warn). Amounts tiny relative to the largest get a 16 px minimum height and the caption says so. Labels: address mono 12 px brand-ink, value 13.5 px weight 650. Phone: one 22 px stacked bar plus a ruled legend (address, change, fee with amounts).
- Settlement: four steps in a row (stacked on phone), 14 px dots on a 2 px line; done steps `--dh-good` dot and line, pending step hollow with a pulsing ring, future steps `--dh-line-2`. Each step: glyph + 14 px weight 620 title, 13 px time and detail.

### 6.13 Source down on a card

When `useSourceHealth` reports the card's source down, the body drops to 74% opacity with a greyscale filter (45% failed colour contrast) and an overlay band (bad-soft, 1 px bad border, 8 px radius) sits over its top: "Platform Explorer isn't answering · showing data from 4 min ago · Retry". Stale keeps full opacity and only the `SourceLine` changes.

### 6.14 ⌘K palette (`CommandPalette`)

- Opens with ⌘K / Ctrl+K or `/`, from the bar's search trigger (240 × 34 px, "Search Radar" with a `/` key hint) or the home omni search.
- Scrim `rgba(4,16,24,.55)`. Panel 880 px wide (`min(880px, 100vw − 32px)`), top 9vh, max-height `min(640px, 82vh)`, 12 px radius, deep shadow plus a 1 px line ring. Opens with a 160 ms fade + 6 px rise; closes instantly.
- Input row 60 px: 20 px search glyph, 19 px input, Esc hint.
- **Classifier row** on `--dh-sunken`: a `TypeBadge` naming what the query looks like ("Name prefix", "Block height", "Txid or block hash", "Core address", "Identity ID", "IP address") and one sentence saying where Radar is looking ("Searching Mainnet names, identities and saved items").
- Body: results list (left) and a 340 px **preview** (right, on the page ground). Groups have 12 px weight 620 headings with a glyph and count. Options: 28 px glyph | title (match underlined with a 2 px brand line, not highlighted) and 12.5 px detail line | end slot (`↵`, age, count). Selected option: `--dh-select-soft` ground and 3 px left keyline; the preview follows the selection and shows glyph 48 px, title, type badge, full ID, 4–5 kv rows, `SourceLine`, "Open … ↵" and Copy.
- Groups, in order, only when non-empty: exact match; Usernames; Identities; Masternodes; Blocks / Transactions; Documents (text search); Go to (pages); Recent (on this device).
- Foot: key hints (↑↓ move, ↵ open, ⇧↵ new tab, Esc close) and a cross-network hint ("Testnet · 1 match on Testnet · Show").
- Phone: full screen, no preview, Cancel instead of Esc, 17 px input; results are 10 px-padded rows.
- No-result state: "Nothing on Mainnet for 'xyz'" with suggestions ("Try a full txid, a block height, an IP or a username") and the Testnet hint if it matches there.

### 6.15 `LinkOut` (Governance, Bridge, other explorers)

Radar never asks for keys. Actions that need them leave Radar through `LinkOut`:

- Inline: secondary button with a 24 px app tile (Governance `#0070C4` with a ballot glyph, Bridge `#25B8A6` with a bridge glyph, white/ink glyph) + label + external glyph ("Vote in Governance ↗", "Manage in Bridge ↗"). Never amber.
- Card (home "Act on what you see"): 40 px tile, 17 px title, one-line description, external glyph top right; 1 px line, hover border `--dh-line-2`.
- Explorer cross-links (PE, Hyphen, Insight) are plain text links with the external glyph in record footers.

---

## 7. ECharts theme

Charts read tokens at mount and on theme change (`getComputedStyle(document.documentElement)`), then call `setOption` with this theme. Inside the plate, read from the plate element instead so the island values apply.

```js
export const radarChartTheme = (t /* resolved token values */) => ({
  color: [t['rx-l'], t['dh-ramp-2'], t['dh-ramp-3'], t['dh-ramp-4'], t['dh-ramp-5']], // layer first
  backgroundColor: 'transparent',
  textStyle: { fontFamily: 'Archivo, system-ui, sans-serif', fontSize: 12, color: t['dh-ink-2'] },
  grid: { left: 8, right: 8, top: 16, bottom: 24, containLabel: true },
  categoryAxis: {
    axisLine: { lineStyle: { color: t['dh-line-2'] } }, axisTick: { show: false },
    axisLabel: { color: t['dh-ink-2'], fontSize: 12, hideOverlap: true }, splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { show: false }, axisTick: { show: false },
    axisLabel: { color: t['dh-ink-2'], fontSize: 12 },
    splitLine: { lineStyle: { color: t['dh-line'], type: [2, 4] } },
  },
  timeAxis: { /* as categoryAxis */ },
  line: { symbol: 'none', lineStyle: { width: 1.75 }, areaStyle: { opacity: 0.14 }, emphasis: { focus: 'series' } },
  bar: { barMaxWidth: 18, barCategoryGap: '24%', itemStyle: { borderRadius: [2, 2, 0, 0] } },
  pie: { itemStyle: { borderColor: t['dh-surface'], borderWidth: 2 } }, // donuts only, never pies
  tooltip: {
    trigger: 'axis', backgroundColor: t['dh-surface'], borderColor: t['dh-line'], borderWidth: 1,
    padding: [8, 10], textStyle: { color: t['dh-ink'], fontSize: 12.5 },
    extraCssText: 'border-radius:8px;box-shadow:0 8px 24px -8px rgba(0,30,50,.35);',
    axisPointer: { type: 'line', lineStyle: { color: t['dh-ink-2'], width: 1 } },
  },
  legend: { show: false },              // legends are HTML (.rx-legend) beside the chart
  dataZoom: { borderColor: t['dh-line'], fillerColor: t['dh-brand-soft'], handleStyle: { color: t['dh-surface'], borderColor: t['dh-line-2'] } },
  animationDuration: 400, animationDurationUpdate: 240, animationEasing: 'cubicOut',
})
```

Rules:

- Default height 200 px (cards), 280 px (chart pages). Bars for counts per period, lines for levels over time, stacked bars for composition over time, donut only for a single composition with ≤ 5 parts. No 3D, no gradients, no dual axes.
- Legends and axis titles are HTML around the chart so they follow the family type; the chart's `label` names it for screen readers and `table` is the accessible equivalent (a "Show as a table" link toggles it visibly).
- Charts that share an x-axis on one page share a `group` so tooltips and brushing link.
- Under reduced motion set `animation: false`.

---

## 8. Map (MapLibre)

The full map (`/map`, "View on map", "Open the map") keeps Radar's existing MapLibre basemap: self-hosted Natural Earth GeoJSON (`world-low.json` below zoom 3.2, `world-high.json` with lakes and state lines above), self-hosted Noto Sans glyphs, `places.json` labels, no tile server. Radar restyles it onto the plate so the map page and the home scope read as one surface. The map always uses the plate colours, in both themes.

| Style token | Value (light and dark) |
|---|---|
| ocean (background) | `--rx-plate` `#0A2A3D` (dark `#0D3149`) |
| land | `--rx-plate-3` `#16435F` |
| border-line | `rgba(166,216,247,.28)`, 0.7 px → 1.4 px by zoom 8 |
| state-line | `rgba(166,216,247,.14)`, 0.6 px |
| label / halo | `#9BBDD2` / land colour, halo 1.2 px, opacity .85 (countries), .7 (cities) |
| masternode point | `#A6D8F7` (`--rx-net` dark value), stroke plate 1 px |
| evonode point | `#25B8A6`, stroke plate 1 px |
| selected | 2 px ring `#E4F3FC` + 8 px halo at 25% |
| clusters | DOM donuts, 28–56 px, ring split by the active colour mode, count in 12 px weight 650 |
| ping | three expanding rings in the layer colour, 2.4 s, once per event |

Colour modes (segmented control top-left, on plate-2): Type (masternode / evonode), Status (good / warn / bad plate values), Version (blue ramp), Hosting (top 5 in the blue ramp + other). The legend always shows counts. Controls: zoom +/− and reset in a plate-2 pill bottom-right; filter sheet bottom on phone.

The **home scope and minimaps** don't load MapLibre: they are static SVG dot-matrix projections (Equal Earth) drawn from the same node clusters, cheap enough to render on first paint. The record minimap ("Where it is" on `/mn/*`) crops to the node's region, draws the node as a focus ring, and links to `/map?protx=…`.

---

## 9. Motion

Motion shows that something changed or arrived. It never decorates.

| Event | Motion | Duration / easing |
|---|---|---|
| New row in a live table | slide down 8 px + fade, then layer flash fading out | 240 ms `--rx-ease-out` (`cubic-bezier(.16,1,.3,1)`), flash 1200 ms ease-out |
| New block in the two-lane chain | enters from the right 24 px, the oldest leaves; tie line draws in | 520 ms `--rx-ease-out`; tie 400 ms |
| Map event | ping: three rings scale .2 → 3.2 and fade | 2400 ms `--rx-ease-out`, once |
| Stat value change | digits roll down .45 em | 240 ms |
| Freshness dot on data landing | one ring pulse | 900 ms |
| Hover card | fade + 4 px rise | 160 ms `--dh-ease` |
| Palette open | fade + 6 px rise; close instant | 160 ms |
| Tabs, buttons, hovers | colour only | 90 ms (`--dh-dur-1`) |
| Skeleton | shimmer sweep | 1400 ms loop |

Rules:

- Nothing loops forever except skeleton shimmer while loading and the pending settlement step.
- Live feeds pause on hover/focus of the list and offer Live/Pause (§6.9). Paused feeds count what arrived.
- A tab that is hidden stops animating and catches up silently on return.
- **Reduced motion** (`prefers-reduced-motion: reduce`, also the family `--dh-dur-*: 0ms`): no slides, rolls, pings or shimmer. New rows appear in place with a static layer-flash background that clears on the next update. Map events show as a static ring until the next event. The live region still announces ("New Core block 2,569,993").

---

## 10. Testnet frame

Testnet must be impossible to mistake for mainnet, on every page, in both themes, including screenshots.

- A fixed 4 px inset frame in `--rx-testnet` (`#F2C230`; dark `#F2C94C`) around the viewport, above content, pointer-events none.
- The bar's network switch shows "Testnet" with a hollow dot (family shell `network="testnet"`).
- Any "Mainnet" label in the page (home kicker, search classifier, empty states) becomes a `.rx-tnbadge`: 22 px, `--rx-testnet` ground, `--rx-testnet-ink` text, 12 px weight 650, "Testnet".
- Fiat values are hidden on testnet.
- The testnet yellow is not amber: it is lighter and greener, never used for buttons, and only appears with the word "Testnet".

Mockup: `home.html?testnet`, shot `shots/home-testnet--desk-light.png`.

---

## 11. Phone navigation

- The family bar with `phone-nav="tabs"`: a fixed bottom tab bar, 56 px + safe area, five tabs with 22 px icons and 11 px labels: **Home, Core, Network, Platform, Search**. The current tab follows the shell's tab-bar look (selection keyline and ink text); others `--dh-ink-2`. "Search" opens the full-screen palette.
- The top bar keeps the logo, network switch, theme toggle and the menu (Tools, other dashhq products, settings).
- Band navs and record tabs scroll horizontally; the current one scrolls into view.
- Tables become cards (§6.7). Filters collapse to a "Filters n" button that opens a bottom sheet.
- Hover cards are off; chips navigate on tap and copy buttons are always visible (40 px targets via the family touch rules).
- The home scope stacks: copy, then a cropped map (Europe–Asia), pulse tiles one per row, then the lane chain scrolling horizontally.

---

## 12. Accessibility

Target: WCAG 2.2 AA in light and dark, on the plate and off it.

- **Contrast (measured):** `--rx-core-text` on white 5.9:1, on core-soft 5.1:1; `--rx-plat-text` on white 6.4:1, on plat-soft 5.6:1; white on `--rx-core` 5.1:1; `--rx-plat-ink` on `--rx-plat` 6.0:1; plate ink 13.1:1, plate ink-2 7.5:1, plate brand-ink 8.9:1; on the plate (light and dark plate, plate-2 and plate-3) good is 4.5:1 or more, warn 4.6:1 or more, bad (`#FF8F86`) 4.5:1 or more, control borders (`--rx-plate-ctl`) 3.0:1 or more; testnet ink on testnet 8.9:1. Non-text marks use the `-line` tokens (core 3.5:1, platform 3.7:1 on white); calendar levels are 3:1 or more against empty cells.
- Colour never carries meaning alone: status has words, type badges have glyphs and labels, layer hues are backed by section titles, charts have legends with counts and a table equivalent.
- Focus: family 2 px `--dh-focus` ring with 2 px offset on every interactive element, including chips, table rows (`tabindex="-1"` row focus with the select keyline) and map controls. Links inside horizontally scrolling rows (tabs, band nav) use a 2 px inset ring so the scroll box can't clip it. On the plate the ring is `#8FD0FA`.
- Keyboard: `/` and ⌘K open search; ↑↓ ↵ Esc inside the palette; `j`/`k`/↵ move through and open table rows; Esc closes hover cards and sheets. Shortcuts are listed in table footers and the palette foot, and never fire inside inputs.
- Targets: 24 px minimum (2.5.8); 40 px on touch via the family rules.
- Live regions: one polite `aria-live` region per page announces new blocks (throttled to one message per 10 s), copy confirmations and filter result counts.
- Auto-updating content has Pause (2.2.2), and pausing persists for the session.
- Hover cards are supplementary: everything in them is on the target page. They open on focus and dismiss with Esc (1.4.13), and the pointer can move into them.
- Tables: real `<table>` with `caption` (visually hidden), `th scope`, `aria-sort`; phone cards keep the table semantics (CSS only).
- Charts and maps: `role="img"` with an `aria-label` summary plus the table/list equivalent. The scope map has a text list of the latest events beside it for screen readers.
- Identicons, nodeprints and tiles are `aria-hidden`; the adjacent text names the entity.
- The dialog palette traps focus, restores it on close, and uses the combobox/listbox pattern with `aria-activedescendant`.
- Motion follows §9 under reduced motion.

---

## 13. How a page is composed

1. **Pick the layer** of the page subject: Core, Platform or Network. Set `data-layer` on the page root; every keyline, tile and tab underline follows.
2. **Band** (§5.1): band nav for the layer; breadcrumbs; record header with glyph, type badge, title, full ID + copy, status badges with `SourceLine`s, actions (link-outs, copy link, save); KPI row of 4–5 `Stat`s, the first `size="lg"` and proof-checked if it can be.
3. **Tabs** (record pages): Overview first, then one tab per list with counts. Sticky.
4. **Overview** in a split: main column leads with the page **signature** (§1.2), then the most-asked list as a `DataTable` (8–22 rows, "All n →"). Aside: facts in `KeyValue` cards (registration, keys, usernames, location), each card with its own `SourceLine`.
5. **Cross-layer links** go in their own card tinted with the other layer ("Funded from Core" on an identity, "Platform node" on an evonode).
6. **Act elsewhere**: actions that need keys are `LinkOut`s in the header, never in-page forms.
7. **States**: every query renders through `QueryView`/`DataTable` with loading, empty, error and down looks (§6.10, §6.13).
8. **Phone check**: band stacks, KPIs 2-up, tables as cards, nothing scrolls sideways except band navs, tabs and the lane chain.

List pages follow the same band, then one full-width card: tools row → active filters → `DataTable` → foot with sources and pager.

---

## 14. Mockups

| File | Route | Shows |
|---|---|---|
| `mockups/home.html` | `/` | scope, pulses, two-lane chain with ties, live feeds, three `SectionBand`s, link-out cards |
| `mockups/masternodes.html` | `/masternodes` | plate band with status stack and census stats, tools + filters, scannable table with nodeprints, open hover card, phone cards |
| `mockups/mn.html` | `/mn/<protx>` | evonode record header, KPIs, uptime strip, rewards-by-epoch vs the middle 80%, payments, minimap, registration, quorum checks |
| `mockups/identity.html` | `/identity/<id>` | identicon header with Verified, proof-checked balance, activity calendar, transitions, usernames, keys (security level pips), funded from Core |
| `mockups/tx.html` | `/tx/<txid>` | Core band, value flow (phone: stacked bar), settlement steps, inputs/outputs |
| `mockups/search.html` | ⌘K over `/` | classifier row, grouped results, preview, foot hints, testnet hint; full screen on phone |
| `mockups/index.html` | — | links to every mockup, plus a States section: loading skeleton, `Empty`, `ErrorState`, a card whose source is down, every `SourceLine` state and the Live/Pause pill |

Append `?static` to freeze motion (screenshots) and `?testnet` for the frame. Shots: `mockups/shots/<page>--desk-light.png`, `--desk-dark.png` (1440 × 900, full page) and `--phone-light.png` (390 × 844, full page; the search shot is viewport-only).

Data in the mockups is real, captured from the Radar crawl API, Platform Explorer, Hyphen and DAPI on 10 Nov 2026 around 14:30 UTC. Price is $46.20. Where a figure was not available from those sources (for example the mempool size and a few hover-card details), the mockup shows a plausible value.

---

## 15. Departures from the family, to confirm

- **Phone navigation uses tabs.** DESIGN.md keeps core tools on the short menu; Radar uses `phone-nav="tabs"` because it has four peer areas plus search and is used one-handed while checking a node or payment.
- **The plate in light mode.** Network bands and the home scope stay navy in the light theme. It is the product's signature; the family allows it as a "layer ground" but not yet as a full-width dark band in light mode.
- **Layer hues as tokens.** `--rx-core/plat/net-*` live in Radar until the shell ships shared per-layer colour tokens for every product.
- **Card source sits in the head.** ARCHITECTURE.md §7.2 says `Card.source` renders in the card foot; the look puts it at the right of the head, next to the figures it describes. The foot keeps navigation.
- **Proof-checked is a button.** The family source tag is a label, never a link; Radar's Proof-checked mark opens the proof inspector, so it is a button with the same look and a hover ground.
- **Tabs carry the layer.** The current tab's underline is 3 px in the layer line colour instead of the family's 2 px selection blue, so a record page's tabs match its band.
- **`Stat` needs a `tone`.** Status figures (answering %, quorum-ready, failures) colour their keyline and value; ARCHITECTURE.md's `Stat` has no prop for it yet.
- **Stale is orange, not amber.** ARCHITECTURE.md §7.3 says the age "turns amber" when stale; the look is `--dh-warn`, because amber is reserved for the primary action.
