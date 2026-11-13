# Third-party code and data

Code ported or adapted from another project, and data copied from one, is listed here with its source and licence. A
file that holds ported code also names its origin in a header comment. Dependencies installed through npm or cargo are
not listed: their licences travel with the lockfiles.

Add one row per origin at the end of the table; never reorder or edit another row.

| Component                                                                       | Source                                                                                                                                                           | Licence | Where it is used                                                              |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------- |
| Masternode readiness checks, payout rule and Platform rewards sections          | [dash-nodes](https://github.com/PastaPastaPasta/dash-nodes) masternode page                                                                                      | MIT     | `features/network/mn/` (`ReadinessCard.tsx`, `mn-info.ts`, `RewardsCard.tsx`) |
| Network census figures and Core 24 activation tracker                           | [dash-nodes](https://github.com/PastaPastaPasta/dash-nodes) overview page                                                                                        | MIT     | `features/network/nodes/`, `features/network/v24/`                            |
| Map basemap (Natural Earth land, borders and places) and Noto Sans label glyphs | [dash-nodes](https://github.com/PastaPastaPasta/dash-nodes) `web/assets/map/` (Natural Earth: public domain; glyphs from protomaps/basemaps-assets: SIL OFL 1.1) | MIT     | `apps/web/public/map/` (loaded by `features/network/map/`)                    |
