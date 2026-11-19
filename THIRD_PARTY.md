# Third-party code and data

Code ported or adapted from another project, and data copied from one, is listed here with its source and licence. A
file that holds ported code also names its origin in a header comment. Dependencies installed through npm or cargo are
not listed: their licences travel with the lockfiles.

Add one row per origin at the end of the table; never reorder or edit another row.

| Component                                                              | Source                                                                      | Licence | Where it is used                                                              |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------- |
| Masternode readiness checks, payout rule and Platform rewards sections | [dash-nodes](https://github.com/PastaPastaPasta/dash-nodes) masternode page | MIT     | `features/network/mn/` (`ReadinessCard.tsx`, `mn-info.ts`, `RewardsCard.tsx`) |
| Network census figures and Core 24 activation tracker                  | [dash-nodes](https://github.com/PastaPastaPasta/dash-nodes) overview page   | MIT     | `features/network/nodes/`, `features/network/v24/`                            |
| SQL parser, result export, SDK example and saved queries               | native-platform-explorer `sql-parser.ts`, `query-workspace.ts`              | MIT     | `features/tools/query/` (`sql-parser.ts`, `query-workspace.ts`)               |
| GroveDB proof tree reader and well-known key names                     | native-platform-explorer `parse-proof-tree.ts`, `grovedb-schema.ts`         | MIT     | `features/tools/decoders/` (`parse-proof-tree.ts`, `grovedb-schema.ts`)       |
| GroveDB proof parser (wasm and glue; see its `BUILD.md`)               | native-platform-explorer `src/lib/grovedb-proof-parser`                     | MIT     | `features/tools/decoders/grovedb-parser/`, loaded by `grove-proof.ts`         |
