import { useLingui } from '@lingui/react/macro'
import type { UseQueryResult } from '@tanstack/react-query'
import type { Sourced } from '@/data/envelope'
import { staleAfterMs } from '@/data/query/stale'
import type { RadarStatus, RadarSummary } from '@/data/radar/schemas'
import type { NetworkId } from '@/lib/network'
import { Time, useNow } from '@/ui'
import { staleAgeMs } from '@/ui/source-labels'
import { Notice } from './parts'

/** When the crawl behind the page's figures finished: the summary's own crawl first, Radar's status as a fallback. */
function lastCrawlMs(
  net: NetworkId,
  status: Sourced<RadarStatus> | undefined,
  summary: Sourced<RadarSummary> | undefined,
): number | undefined {
  return (
    summary?.data.crawl.finished ??
    status?.data.networks[net === 'testnet' ? 'testnet' : 'mainnet'].crawl.last_finished ??
    undefined
  )
}

/** Once a crawl is old enough for its stamps to turn amber, a sentence at the top of the page says so and since when. */
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
  if (finished === undefined || now - finished <= staleAgeMs('radar', staleAfterMs('crawl')))
    return null
  return (
    <Notice tone="warn" data-stale-crawl>
      <b>{t`The crawl is stale.`}</b> {t`Radar's last crawl finished`}{' '}
      <Time ms={finished} mode="relative" live />
      {t`, so the figures below may be out of date.`}
    </Notice>
  )
}
