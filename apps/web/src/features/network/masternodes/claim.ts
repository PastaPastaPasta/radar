import { plural } from '@lingui/core/macro'
import { formatInt } from '@/lib/format'
import type { MnRow } from '@/data/masternodes/rows'

/**
 * The page's headline. With a crawl of every enabled masternode it is how many of them answered; with DAPI's list
 * alone, or a crawl that has not reached them all, it is how many of the registered ones are enabled.
 */
export function masternodesClaim(rows: readonly MnRow[]): {
  kind: 'answering' | 'enabled'
  text: string
} {
  let enabled = 0
  let answering = 0
  let unknown = 0
  for (const r of rows) {
    if (r.status !== 'enabled') continue
    enabled++
    if (r.crawl?.reachable === true) answering++
    else if (r.crawl?.reachable !== false) unknown++
  }
  const answered = formatInt(answering)
  const enabledCount = formatInt(enabled)
  const registered = rows.length
  return unknown === 0
    ? {
        kind: 'answering',
        text: plural(enabled, {
          one: `${answered} of # enabled masternode answered the last crawl`,
          other: `${answered} of # enabled masternodes answered the last crawl`,
        }),
      }
    : {
        kind: 'enabled',
        text: plural(registered, {
          one: `${enabledCount} of # masternode is enabled`,
          other: `${enabledCount} of # masternodes are enabled`,
        }),
      }
}
