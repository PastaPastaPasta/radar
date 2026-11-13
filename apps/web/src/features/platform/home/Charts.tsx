import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { SourceStamp } from '@/data/envelope'
import { peQueries } from '@/data/pe/queries'
import type { PeTxStatistic } from '@/data/pe/schemas'
import { transitionBadgeType, useNetwork } from '@/features/entity'
import { formatInt, formatNumber } from '@/lib/format'
import { Card, Chart, Empty, SegFilter, TYPE_META, type ChartProps } from '@/ui'
import { barsOption, bucketLabel, HOME_RANGES, timeOption, type HomeRange } from './chart-options'
import { stampsOf, queryView, type QueryView } from './state'

const CREDITS_PER_DASH = 1e11
const TYPES_SHOWN = 8

const dash = (credits: bigint): number => Number(credits) / CREDITS_PER_DASH

interface AmountPoint {
  t: number
  amount: bigint
}

/** Shielded and unshielded amounts on one time axis: every bucket either side has, 0 where one side has none. */
function poolSeries(shielded: readonly AmountPoint[], unshielded: readonly AmountPoint[]) {
  const into = new Map(shielded.map((p) => [p.t, dash(p.amount)]))
  const out = new Map(unshielded.map((p) => [p.t, dash(p.amount)]))
  const times = [...new Set([...into.keys(), ...out.keys()])].sort((a, b) => a - b)
  return {
    times,
    shielded: times.map((ms) => into.get(ms) ?? 0),
    unshielded: times.map((ms) => out.get(ms) ?? 0),
  }
}

function typeRows(stat: PeTxStatistic, label: (key: string) => string): [string, number][] {
  const rows: [string, number][] = stat.flatMap((s) =>
    s.batchTypes?.length
      ? s.batchTypes.map((b): [string, number] => [
          label(`${s.transactionType}:${b.batchType}`),
          b.count,
        ])
      : [[label(s.transactionType), s.count] as [string, number]],
  )
  return rows.sort((a, b) => b[1] - a[1]).slice(0, TYPES_SHOWN)
}

/** A chart in its card, or the card's empty note when there is nothing to draw. */
function ChartCard({
  id,
  title,
  subtitle,
  view,
  source,
  empty,
  ...chart
}: Omit<ChartProps, 'height'> & {
  id: string
  title: string
  subtitle?: string
  view: QueryView
  source: SourceStamp[]
  /** The note to show instead of the chart; undefined when there is data. */
  empty: string | undefined
}) {
  return (
    <Card id={id} layer="platform" title={title} subtitle={subtitle} {...view} source={source}>
      {empty === undefined ? (
        <Chart height={220} {...chart} />
      ) : (
        <Empty kind="none-yet" title={empty} />
      )}
    </Card>
  )
}

/** PE-04: four charts. The range is in the URL; the type split is all-time because the index has no ranged form. */
export function PlatformCharts({ range, active }: { range: HomeRange; active: boolean }) {
  const { t, i18n } = useLingui()
  const net = useNetwork()
  const navigate = useNavigate()
  const txs = useQuery({ ...peQueries.transactionsHistory(net, range), enabled: active })
  const identities = useQuery({ ...peQueries.identitiesHistory(net, range), enabled: active })
  const types = useQuery({ ...peQueries.transactionsStatistic(net), enabled: active })
  const shield = useQuery({ ...peQueries.shieldHistory(net, range), enabled: active })
  const unshield = useQuery({ ...peQueries.unshieldHistory(net, range), enabled: active })

  const labels: Record<HomeRange, string> = {
    '24h': t`24 h`,
    '3d': t`3 d`,
    '1w': t`1 w`,
    '1m': t`1 m`,
  }
  const typeLabel = (key: string): string => {
    const [type, batch] = key.split(':')
    const badge = transitionBadgeType(type ?? '', batch)
    return badge
      ? i18n._(TYPE_META[badge].label)
      : (batch ?? type ?? key).toLowerCase().replaceAll('_', ' ')
  }

  const txData = txs.data?.data ?? []
  const idData = identities.data?.data ?? []
  const typeData = types.data ? typeRows(types.data.data, typeLabel) : []
  const pool = poolSeries(shield.data?.data ?? [], unshield.data?.data ?? [])
  const dashText = (v: number) => t`${formatNumber(v, { maximumFractionDigits: 2 })} DASH`

  return (
    <div className="grid grid-cols-1 gap-4" data-charts>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegFilter
          label={t`Range`}
          value={range}
          options={HOME_RANGES.map((r) => ({ id: r, label: labels[r] }))}
          onChange={(r) => {
            void navigate({
              to: '/platform',
              search: ((s: Record<string, unknown>) => ({ ...s, range: r })) as never,
              replace: true,
            })
          }}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          id="chart-transitions"
          title={t`Transition activity`}
          view={queryView(txs)}
          source={stampsOf(txs.data)}
          empty={txData.length === 0 ? t`No transitions in this range` : undefined}
          label={t`Transitions per interval, last ${labels[range]}`}
          option={timeOption(
            txData.map((p) => p.t),
            range,
            [{ name: t`Transitions`, values: txData.map((p) => p.txs) }],
            'bar',
          )}
          table={{
            columns: [t`Time`, t`Transitions`],
            rows: txData.map((p) => [bucketLabel(p.t, range), formatInt(p.txs)]),
          }}
        />
        <ChartCard
          id="chart-identities"
          title={t`Identity growth`}
          view={queryView(identities)}
          source={stampsOf(identities.data)}
          empty={idData.length === 0 ? t`No identity history in this range` : undefined}
          label={t`Registered identities, last ${labels[range]}`}
          option={timeOption(
            idData.map((p) => p.t),
            range,
            [{ name: t`Identities`, values: idData.map((p) => p.registeredIdentities) }],
            'line',
          )}
          table={{
            columns: [t`Time`, t`Registered identities`],
            rows: idData.map((p) => [bucketLabel(p.t, range), formatInt(p.registeredIdentities)]),
          }}
        />
        <ChartCard
          id="chart-types"
          title={t`Transition types`}
          subtitle={t`All time`}
          view={queryView(types)}
          source={stampsOf(types.data)}
          empty={typeData.length === 0 ? t`No transitions yet` : undefined}
          label={t`Transitions by type, all time`}
          option={barsOption(
            typeData.map((r) => r[0]),
            typeData.map((r) => r[1]),
          )}
          table={{
            columns: [t`Type`, t`Transitions`],
            rows: typeData.map(([name, count]) => [name, formatInt(count)]),
          }}
        />
        <ChartCard
          id="chart-shielded"
          title={t`Shielded pool`}
          subtitle={t`Shielded and unshielded, in DASH`}
          view={{
            ...queryView(shield),
            error: shield.error ?? unshield.error,
            onRetry: () => {
              void shield.refetch()
              void unshield.refetch()
            },
          }}
          source={stampsOf(shield.data, unshield.data)}
          empty={pool.times.length === 0 ? t`Nothing shielded in this range` : undefined}
          label={t`Shielded and unshielded amounts, last ${labels[range]}`}
          option={timeOption(
            pool.times,
            range,
            [
              { name: t`Shielded`, values: pool.shielded },
              { name: t`Unshielded`, values: pool.unshielded },
            ],
            'bar',
            dashText,
          )}
          table={{
            columns: [t`Time`, t`Shielded`, t`Unshielded`],
            rows: pool.times.map((ms, i) => [
              bucketLabel(ms, range),
              dashText(pool.shielded[i] ?? 0),
              dashText(pool.unshielded[i] ?? 0),
            ]),
          }}
        />
      </div>
    </div>
  )
}
