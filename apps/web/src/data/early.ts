let on = false

/**
 * Production turns on the reads that exist only to answer before a slower source does: Hyphen's answer on Core detail
 * pages and the latest blocks (§4.7, indexed first), Radar's crawl height standing in for a slow or failed DAPI tip for the index probe and the
 * index read beside it on a first visit (§4.7a), Radar's masternode rows before DAPI's list (§4.14), and Platform
 * Explorer's epoch before the SDK's (§3.10). Page tests and
 * fixture builds leave them off, so they ask exactly what they recorded; tests of these paths turn them on.
 */
export function enableEarlyAnswers(enabled = true): void {
  on = enabled
}

export const earlyAnswers = (): boolean => on
