import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { peQueries } from '@/data/pe/queries'
import { POLL_MS } from '@/data/query/stale'
import { Entity, useNetwork } from '@/features/entity'
import { formatInt, formatNumber, formatPercent } from '@/lib/format'
import { Card, KeyValue, LiveDot, Time, useNow } from '@/ui'
import { epochLengthMs } from './epoch-length'
import { cardState, stampsOf } from './state'

/** PE-01: what the indexer says about the chain right now. The height follows the indexer's poll. */
export function Pulse() {
  const { t } = useLingui()
  const net = useNetwork()
  const status = useQuery({ ...peQueries.status(net), refetchInterval: POLL_MS.peLatest })
  const detail = useQuery(peQueries.epoch(net))
  const now = useNow()
  const s = status.data?.data
  const tip = s?.tenderdash.block
  const epoch = s?.epoch
  const length = epochLengthMs(net)
  const endsAt = epoch
    ? length === undefined
      ? epoch.endTime
      : epoch.startTime + length
    : undefined
  const avg = detail.data?.data.avgBlockTime
  const synced = s?.indexer.status === 'synced'
  return (
    <Card
      id="pulse"
      layer="platform"
      title={t`Live pulse`}
      subtitle={t`What Platform Explorer has indexed, a few seconds behind the chain.`}
      state={cardState(status)}
      error={status.error}
      onRetry={() => void status.refetch()}
      source={stampsOf(status.data, detail.data)}
    >
      <KeyValue
        columns={3}
        items={[
          {
            label: t`Indexer`,
            value: s ? (
              <span className="inline-flex items-center gap-2" data-pulse="indexer">
                <LiveDot state={synced ? 'ok' : 'slow'} bare />
                {synced
                  ? t`In sync`
                  : t`Catching up, ${formatPercent(s.indexer.syncProgress / 100, 0)}`}
              </span>
            ) : (
              '…'
            ),
          },
          {
            label: t`Platform height`,
            value: tip ? <span data-pulse="height">{formatInt(tip.height)}</span> : '…',
          },
          {
            label: t`Average block time`,
            value:
              avg == null ? (
                '—'
              ) : (
                <span data-pulse="block-time">
                  {t`${formatNumber(avg / 1000, { maximumFractionDigits: 1 })} s`}
                </span>
              ),
          },
          {
            label: t`Last block`,
            value: tip ? (
              <span data-pulse="since">
                <Time ms={tip.timestamp} mode="relative" live />
              </span>
            ) : (
              '…'
            ),
          },
          {
            label: t`Epoch`,
            value: epoch ? (
              <span data-pulse="epoch">
                <Entity kind="epoch" id={String(epoch.number)} />
                {endsAt === undefined ? null : (
                  <>
                    {' · '}
                    {endsAt > now ? t`ends` : t`should have ended`}{' '}
                    <Time ms={endsAt} mode="relative" live />
                  </>
                )}
              </span>
            ) : (
              '…'
            ),
          },
        ]}
      />
    </Card>
  )
}
