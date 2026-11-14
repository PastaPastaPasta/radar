import { useLingui } from '@lingui/react/macro'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import type { EChartsOption } from 'echarts'
import { useMemo } from 'react'
import type { Sourced } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { radarQueries } from '@/data/radar/queries'
import type { RadarPlatform } from '@/data/radar/schemas'
import { Entity, useNetwork } from '@/features/entity'
import { dash } from '@/features/network/mn/platform-math'
import { formatInt, formatNumber, formatPercent } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import {
  Section,
  Amount,
  Card,
  Chart,
  DataTable,
  Empty,
  Stat,
  Stats,
  Time,
  Unavailable,
  queryView,
  stampsOf,
} from '@/ui'

const UPCOMING = 12
const HISTORY = 60

/** RA-60, RA-62, RA-63: what Radar's crawl adds to the epoch: the pool, the schedule and the history band. */
export function RadarZone() {
  const { t } = useLingui()
  const net = useNetwork()
  const off = useDecentralizedOnly()
  const devnet = isDevnet(net)
  const query = useQuery({ ...radarQueries.platform(net), enabled: !off && !devnet })
  return (
    <Section id="radar-zone" layer="network" title={t`Rewards and schedule`}>
      {off ? (
        <Unavailable
          source="radar"
          title={t`The epoch’s pool, earnings, yield, proposer schedule and history need Radar’s crawl`}
        />
      ) : devnet ? (
        <Empty kind="unsupported-network" title={t`Radar doesn’t crawl devnets`} />
      ) : (
        <div className="rx-pile">
          <Rewards query={query} />
          <div className="rx-cols">
            <Upcoming query={query} />
            <History query={query} />
          </div>
        </div>
      )}
    </Section>
  )
}

type PlatformQuery = UseQueryResult<Sourced<RadarPlatform>>

function Rewards({ query }: { query: PlatformQuery }) {
  const { t } = useLingui()
  const doc = query.data?.data
  const last = doc?.epochs.at(-1)
  return (
    <Card
      id="rewards"
      layer="network"
      title={t`Epoch rewards`}
      subtitle={t`What the evonodes are paid from, and what that comes to.`}
      source={stampsOf(query.data)}
      {...queryView(query)}
    >
      {doc ? (
        <Stats>
          <Stat
            label={t`Pool so far`}
            value={<Amount value={doc.now.pool_so_far} kind="credits" compact />}
            layer="network"
          />
          <Stat
            label={t`Last pool`}
            value={last ? <Amount value={last.pool} kind="credits" compact /> : '—'}
            note={last ? t`Epoch ${formatInt(last.epoch)}` : undefined}
            layer="network"
          />
          <Stat
            label={t`Per block`}
            value={last ? <Amount value={last.per_block} kind="credits" compact /> : '—'}
            note={last ? t`Epoch ${formatInt(last.epoch)}` : undefined}
            layer="network"
          />
          <Stat
            label={t`Median monthly earnings`}
            value={<Amount value={doc.returns.median_monthly} kind="credits" compact />}
            note={t`Per evonode, over ${formatNumber(doc.returns.monthly_basis_days ?? 0, { maximumFractionDigits: 0 })} days`}
            layer="network"
          />
          <Stat
            label={t`Median yield`}
            value={
              doc.returns.median_platform_yield == null
                ? '—'
                : formatPercent(doc.returns.median_platform_yield, 1)
            }
            note={t`A year, on the collateral`}
            layer="network"
          />
        </Stats>
      ) : null}
    </Card>
  )
}

interface UpcomingRow {
  protx: string
  slots: number
  eta: number
}

function Upcoming({ query }: { query: PlatformQuery }) {
  const { t } = useLingui()
  const rows = useMemo<UpcomingRow[]>(
    () =>
      (query.data?.data.schedule.next ?? []).slice(0, UPCOMING).map((n) => ({
        protx: n.protx,
        slots: n.slots,
        eta: n.eta,
      })),
    [query.data],
  )
  const columns = useMemo<ColumnDef<UpcomingRow>[]>(
    () => [
      {
        id: 'node',
        header: t`Evonode`,
        cell: ({ row }) => <Entity kind="evonode" id={row.original.protx} />,
        meta: { phone: 'title' },
      },
      {
        id: 'slots',
        header: t`Slots`,
        accessorFn: (r) => formatInt(r.slots),
        meta: { numeric: true, phone: 'secondary' },
      },
      {
        id: 'eta',
        header: t`Proposes around`,
        cell: ({ row }) => <Time ms={row.original.eta} mode="both" />,
        meta: { phone: 'primary' },
      },
    ],
    [t],
  )
  return (
    <Card
      id="upcoming"
      layer="network"
      title={t`Who proposes next`}
      subtitle={t`The next twelve proposers in the schedule, with how many blocks in a row each has.`}
      source={stampsOf(query.data)}
    >
      <DataTable
        caption={t`The next proposers`}
        columns={columns}
        rows={rows}
        getRowId={(r) => r.protx}
        {...queryView(query)}
        empty={t`Radar has no proposer schedule right now.`}
      />
    </Card>
  )
}

function History({ query }: { query: PlatformQuery }) {
  const { t } = useLingui()
  const epochs = useMemo(() => (query.data?.data.epochs ?? []).slice(-HISTORY), [query.data])
  const labels = epochs.map((e) => String(e.epoch))
  const p10 = epochs.map((e) => dash(e.credits_spread.p10))
  const p50 = epochs.map((e) => dash(e.credits_spread.p50))
  const p90 = epochs.map((e) => dash(e.credits_spread.p90))
  const option = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v) => `${formatNumber(Number(v), { maximumFractionDigits: 2 })} DASH`,
      },
      grid: { left: 8, right: 12, top: 16, bottom: 28, containLabel: true },
      xAxis: { type: 'category', boundaryGap: false, data: labels },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: (v: number) => formatNumber(v, { notation: 'compact' }) },
      },
      series: [
        {
          type: 'line',
          name: 'p10',
          stack: 'band',
          symbol: 'none',
          lineStyle: { opacity: 0 },
          data: p10,
        },
        {
          type: 'line',
          name: 'p10–p90',
          stack: 'band',
          symbol: 'none',
          lineStyle: { opacity: 0 },
          areaStyle: { opacity: 0.25 },
          data: p90.map((v, i) => v - p10[i]!),
          tooltip: { show: false },
        },
        { type: 'line', name: 'median', symbol: 'none', data: p50 },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the series derive from `epochs`
    [epochs],
  )
  const fmt = (v: number) => formatNumber(v, { maximumFractionDigits: 2 })
  return (
    <Card
      id="history"
      layer="network"
      title={t`Epoch history`}
      subtitle={t`What an evonode earned per epoch: the middle 80% of evonodes and the median, over the last ${epochs.length} epochs.`}
      source={stampsOf(query.data)}
      {...queryView(query)}
    >
      {epochs.length === 0 ? (
        <Empty kind="none-yet" title={t`Radar has no epoch history yet.`} />
      ) : (
        <Chart
          option={option}
          height={260}
          label={t`Earnings per evonode in each of the last ${epochs.length} epochs, in DASH`}
          table={{
            columns: [t`Epoch`, t`p10 (DASH)`, t`Median (DASH)`, t`p90 (DASH)`],
            rows: [...epochs]
              .reverse()
              .map((e) => [
                e.epoch,
                fmt(dash(e.credits_spread.p10)),
                fmt(dash(e.credits_spread.p50)),
                fmt(dash(e.credits_spread.p90)),
              ]),
          }}
        />
      )}
    </Card>
  )
}
