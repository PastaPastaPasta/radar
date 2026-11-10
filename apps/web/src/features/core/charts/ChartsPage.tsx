import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { stampOf } from '@/data/envelope'
import { useNavigate } from '@tanstack/react-router'
import { useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Amount, Card, Chart, Empty, SegFilter, Stat, Tabs } from '@/ui'
import { NetworkInternals } from '../network/NetworkInternals'
import { HyphenGate, StaleIndexNotice } from '../hy-shared/HyphenGate'
import { PageFrame } from '../hy-shared/PageFrame'
import { chartQueries } from './queries'
import { buildOption, formatHashrate, METRICS, points, type MetricId } from './options'
import { DEFAULT_RANGE, RANGES, type Range } from './ranges'

export type ChartsTab = 'charts' | 'internals'

const ORDER: MetricId[] = ['hashrate', 'transactions', 'difficulty', 'supply', 'utxos', 'credit-pool']

export function ChartsPage({
  range = DEFAULT_RANGE,
  tab = 'charts',
}: {
  range?: Range
  tab?: ChartsTab
}) {
  const { t } = useLingui()
  return (
    <PageFrame
      path="/charts"
      title={t`Charts`}
      lede={t`How the Core chain is doing: mining, transactions, supply and the state it carries.`}
    >
      <HyphenGate>
        <Tabs
          layer="core"
          tabs={[
            { id: 'charts', label: t`Charts` },
            { id: 'internals', label: t`Network internals` },
          ]}
          value={tab}
          to={(id) => ({
            to: '/charts',
            search: ((prev: Record<string, unknown>) => ({
              ...prev,
              tab: id === 'charts' ? undefined : id,
            })) as never,
          })}
        />
        <StaleIndexNotice />
        {tab === 'internals' ? <NetworkInternals /> : <ChartGrid range={range} />}
      </HyphenGate>
    </PageFrame>
  )
}

function ChartGrid({ range }: { range: Range }) {
  const { t } = useLingui()
  const net = useNetwork()
  const latest = useQuery(chartQueries.latest(net))
  const series = useQuery(chartQueries.series(net, range, latest.data?.data.height))
  const chart = series.data?.data
  const navigate = useNavigate()
  const l = latest.data?.data

  const titles: Record<MetricId, string> = {
    hashrate: t`Hash rate`,
    transactions: t`Transactions processed`,
    difficulty: t`Difficulty`,
    supply: t`Circulating supply`,
    utxos: t`Unspent outputs`,
    'credit-pool': t`Credit pool`,
  }
  const labels: Record<Range, string> = {
    '1h': t`1 h`,
    '1d': t`1 d`,
    '1w': t`1 w`,
    '1m': t`1 m`,
    '1y': t`1 y`,
    all: t`All`,
  }

  const view = useMemo(
    () =>
      ORDER.map((id) => {
        const metric = METRICS[id]
        const data = chart ? points(metric, chart.value) : []
        return { id, metric, data }
      }),
    [chart],
  )

  return (
    <>
      <Card
        title={t`Now`}
        layer="core"
        source={latest.data ? stampOf(latest.data) : undefined}
        state={latest.isPending ? 'loading' : latest.isError ? 'error' : 'ready'}
        error={latest.error}
        onRetry={() => void latest.refetch()}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-charts-now>
          <Stat size="lg" label={t`Hash rate`} value={l ? formatHashrate(l.hashrate) : '—'} />
          <Stat label={t`Difficulty`} value={l ? formatInt(Math.round(l.difficulty)) : '—'} />
          <Stat
            label={t`Circulating supply`}
            value={l ? <Amount value={l.circulatingSupply} kind="duffs" compact /> : '—'}
          />
          <Stat label={t`Transactions, all time`} value={l ? formatInt(l.txCount) : '—'} />
          <Stat label={t`Unspent outputs`} value={l ? formatInt(l.utxosSpendable) : '—'} />
          <Stat
            label={t`Credit pool`}
            value={
              l?.creditPoolBalance != null ? (
                <Amount value={l.creditPoolBalance} kind="duffs" compact />
              ) : (
                '—'
              )
            }
          />
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegFilter
          label={t`Range`}
          value={range}
          options={RANGES.map((r) => ({ id: r, label: labels[r] }))}
          onChange={(r) => {
            void navigate({
              to: '/charts',
              search: ((s: Record<string, unknown>) => ({
                ...s,
                range: r === DEFAULT_RANGE ? undefined : r,
              })) as never,
              replace: true,
            })
          }}
        />
        {chart ? (
          <p className="text-sm text-[var(--dh-ink-2,inherit)]" data-chart-span>
            {t`Blocks ${formatInt(chart.startHeight)} to ${formatInt(chart.endHeight)}, one point per ${formatInt(chart.bucketBlocks)} ${chart.bucketBlocks === 1 ? t`block` : t`blocks`}`}
          </p>
        ) : null}
      </div>

      {series.isError ? (
        <Empty kind="blocked" title={t`The chart data didn’t load.`} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {view.map(({ id, metric, data }) => (
            <Card
              key={id}
              title={titles[id]}
              layer="core"
              source={series.data ? stampOf(series.data) : undefined}
              id={`chart-${id}`}
            >
              <Chart
                option={buildOption(metric, data, titles[id])}
                height={240}
                group="core-metrics"
                label={t`${titles[id]} by block height`}
                loading={!chart}
                table={{
                  columns: [t`Block height`, titles[id]],
                  rows: data.map((p) => [formatInt(p.height), metric.format(p.value)]),
                }}
              />
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

