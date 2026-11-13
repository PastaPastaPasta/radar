import { useLingui } from '@lingui/react/macro'
import type { UseQueryResult } from '@tanstack/react-query'
import type { Sourced } from '@/data/envelope'
import type { RadarStatus, RadarSummary } from '@/data/radar/schemas'
import type { NetworkId } from '@/lib/network'
import { Time, useNow } from '@/ui'
import { STALE_CRAWL_MS } from './census-math'
import { Notice } from './parts'

/** When Radar's last crawl of `net` finished: its status document says so first, the summary's crawl as a fallback. */
function lastCrawlMs(
  net: NetworkId,
  status: Sourced<RadarStatus> | undefined,
  summary: Sourced<RadarSummary> | undefined,
): number | undefined {
  const fromStatus =
    status?.data.networks[net === 'testnet' ? 'testnet' : 'mainnet'].crawl.last_finished
  return fromStatus ?? summary?.data.crawl.finished
}

/** After 45 minutes without a crawl, a warning at the top of the page. */
export function StaleCrawl({
  net,
  status,
  summary,
}: {
  net: NetworkId
  status: UseQueryResult<Sourced<RadarStatus>>
  summary: UseQueryResult<Sourced<RadarSummary>>
}) {
  const { t } = useLingui()
  const now = useNow()
  const finished = lastCrawlMs(net, status.data, summary.data)
  if (finished === undefined || now - finished <= STALE_CRAWL_MS) return null
  return (
    <Notice tone="warn" data-stale-crawl>
      <b>{t`The crawl is stale.`}</b> {t`Radar's last crawl finished`}{' '}
      <Time ms={finished} mode="relative" live />
      {t`, so the figures below may be out of date.`}
    </Notice>
  )
}
