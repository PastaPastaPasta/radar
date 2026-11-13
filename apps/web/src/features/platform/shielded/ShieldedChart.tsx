import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { EChartsOption } from 'echarts'
import { useMemo } from 'react'
import { useDecentralizedOnly } from '@/data/health'
import { peQueries } from '@/data/pe/queries'
import { useNetwork } from '@/features/entity'
import { formatDate, formatNumber } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import { CREDITS_PER_DASH } from '@/lib/units'
import { Card, Chart, Empty, SegFilter, Unavailable } from '@/ui'
import { queryView, stampsOf } from '../quorums/state'

const RANGES = ['24h', '3d', '1w', '1m'] as const
type Range = (typeof RANGES)[number]

const dash = (credits: bigint): number => Number(credits) / Number(CREDITS_PER_DASH)

interface Point {
  t: number
  amount: bigint
}

/** Shielded and unshielded amounts on one time axis: every bucket either side has, 0 where one side has none. */
export function poolSeries(shielded: readonly Point[], unshielded: readonly Point[]) {
  const into = new Map(shielded.map((p) => [p.t, dash(p.amount)]))
  const out = new Map(unshielded.map((p) => [p.t, dash(p.amount)]))
  const times = [...new Set([...into.keys(), ...out.keys()])].sort((a, b) => a - b)
  return {
    times,
    shielded: times.map((ms) => into.get(ms) ?? 0),
    unshielded: times.map((ms) => out.get(ms) ?? 0),
  }
}

const label = (ms: number, range: Range): string =>
  range === '24h'
    ? formatDate(ms, { date: false, zone: false })
    : formatDate(ms, { time: range === '3d', year: false, zone: false })

/** The index's shield and unshield history: the complement to the proved state above, behind Platform Explorer. */
export function ShieldedChart({ range }: { range: Range }) {
  const { t } = useLingui()
  const net = useNetwork()
  const off = useDecentralizedOnly()
  const navigate = useNavigate()
  const enabled = !off && !isDevnet(net)
  const shield = useQuery({ ...peQueries.shieldHistory(net, range), enabled })
  const unshield = useQuery({ ...peQueries.unshieldHistory(net, range), enabled })
  const pool = useMemo(
    () => poolSeries(shield.data?.data ?? [], unshield.data?.data ?? []),
    [shield.data, unshield.data],
  )
  const names: Record<Range, string> = { '24h': t`24 h`, '3d': t`3 d`, '1w': t`1 w`, '1m': t`1 m` }
  const dashText = (v: number) => t`${formatNumber(v, { maximumFractionDigits: 2 })} DASH`
  const option = useMemo<EChartsOption>(
    () => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 8, right: 12, top: 16, bottom: 28, containLabel: true },
      xAxis: { type: 'category', data: pool.times.map((ms) => label(ms, range)) },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: (v: number) => formatNumber(v, { notation: 'compact' }) },
      },
      series: [
        { type: 'bar', name: t`Shielded`, stack: 'total', data: pool.shielded },
        { type: 'bar', name: t`Unshielded`, stack: 'total', data: pool.unshielded },
      ],
    }),
    [pool, range, t],
  )
  return (
    <section id="shield-history" className="rx-sec" aria-labelledby="shield-history-title">
      <div className="rx-sec__head">
        <h2 className="rx-sec__title" id="shield-history-title">
          {t`Shield and unshield history`}
        </h2>
      </div>
      {off ? (
        <Unavailable
          source="pe"
          title={t`The history of shielding and unshielding needs Platform Explorer’s index`}
        />
      ) : isDevnet(net) ? (
        <Empty kind="unsupported-network" title={t`Platform Explorer doesn’t index devnets`} />
      ) : (
        <Card
          id="chart-shielded"
          layer="platform"
          title={t`Shielded and unshielded`}
          subtitle={t`In DASH, over the last ${names[range]}.`}
          source={stampsOf(shield.data, unshield.data)}
          actions={
            <SegFilter
              label={t`Range`}
              value={range}
              options={RANGES.map((r) => ({ id: r, label: names[r] }))}
              onChange={(r) => {
                void navigate({
                  to: '/shielded',
                  replace: true,
                  search: ((s: Record<string, unknown>) => ({ ...s, range: r })) as never,
                })
              }}
            />
          }
          {...{
            ...queryView(shield),
            error: shield.error ?? unshield.error,
            onRetry: () => {
              void shield.refetch()
              void unshield.refetch()
            },
          }}
        >
          {pool.times.length === 0 && shield.data && unshield.data ? (
            <Empty kind="none-yet" title={t`Nothing was shielded or unshielded in this range.`} />
          ) : (
            <Chart
              option={option}
              height={260}
              label={t`Shielded and unshielded amounts, last ${names[range]}`}
              loading={!shield.data || !unshield.data}
              table={{
                columns: [t`Time`, t`Shielded`, t`Unshielded`],
                rows: pool.times.map((ms, i) => [
                  label(ms, range),
                  dashText(pool.shielded[i] ?? 0),
                  dashText(pool.unshielded[i] ?? 0),
                ]),
              }}
            />
          )}
        </Card>
      )}
    </section>
  )
}
