import { useLingui } from '@lingui/react/macro'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { EChartsOption } from 'echarts'
import { useMemo, type ReactNode } from 'react'
import { stampOf, type SourceStamp, type Sourced } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { radarQueries } from '@/data/radar/queries'
import type { RadarPlatform } from '@/data/radar/schemas'
import { useNetwork } from '@/features/entity'
import { dash } from '@/features/network/mn/platform-math'
import { formatInt, formatNumber, formatPercent } from '@/lib/format'
import { isDevnet, type NetworkId } from '@/lib/network'
import {
  Section,
  Amount,
  Card,
  Chart,
  Empty,
  Stat,
  Stats,
  Unavailable,
  queryView,
  stampsOf,
  useChanged,
} from '@/ui'
import { perBlockSoFar, poolSoFar } from './live/pool'
import { Upcoming } from './live/Upcoming'
import { useLiveSchedule, type LiveSchedule } from './live/useLiveSchedule'

const HISTORY = 60

/** RA-60, RA-62, RA-63: the epoch's pool and the proposer schedule, followed live, and the crawl's history band. */
export function RadarZone() {
  const { t } = useLingui()
  const net = useNetwork()
  const off = useDecentralizedOnly()
  const devnet = isDevnet(net)
  const crawlOn = !off && !devnet
  const query = useQuery({ ...radarQueries.platform(net), enabled: crawlOn })
  return (
    <Section id="radar-zone" layer="network" title={t`Rewards and schedule`}>
      <LiveZone key={net} net={net} query={query} off={off} devnet={devnet} />
    </Section>
  )
}

type PlatformQuery = UseQueryResult<Sourced<RadarPlatform>>

function LiveZone({
  net,
  query,
  off,
  devnet,
}: {
  net: NetworkId
  query: PlatformQuery
  off: boolean
  devnet: boolean
}) {
  const crawlOn = !off && !devnet
  const live = useLiveSchedule(net, crawlOn ? query.data : undefined)
  const crawlState = !crawlOn ? 'off' : query.data ? 'ready' : query.isError ? 'error' : 'loading'
  return (
    <div className="rx-pile">
      <Rewards query={query} live={live} off={off} devnet={devnet} />
      {crawlOn ? (
        <div className="rx-cols">
          <Upcoming live={live} crawlState={crawlState} />
          <History query={query} />
        </div>
      ) : (
        <Upcoming live={live} crawlState={crawlState} />
      )}
    </div>
  )
}

/** A figure that rolls its digits in when it changes, as every live stat does. */
function Ticking({ value, children }: { value: string | undefined; children: ReactNode }) {
  const n = useChanged(value)
  return (
    <span key={n} className={n > 0 ? 'rx-livefig is-new' : 'rx-livefig'}>
      {children}
    </span>
  )
}

/** The pool so far and each block's share of it, from the newest proof-checked epoch read when it has its ChainLock. */
function livePool(live: LiveSchedule) {
  const answer = live.epoch
  const cl = answer?.proof?.coreChainLockedHeight
  if (!answer || cl === undefined || answer.height === undefined) return undefined
  const pool = poolSoFar(answer.data.firstCoreBlockHeight, cl)
  if (pool === undefined) return undefined
  const blocks = Math.max(0, answer.height - answer.data.firstBlockHeight + 1)
  // Worked out here from one proof-checked answer: the figure itself is not what the proof covers.
  const stamp: SourceStamp = { ...stampOf(answer), proved: false, proof: undefined }
  return {
    pool,
    perBlock: perBlockSoFar(pool, blocks),
    blocks,
    cl,
    epoch: answer.data.index,
    stamp,
  }
}

function Rewards({
  query,
  live,
  off,
  devnet,
}: {
  query: PlatformQuery
  live: LiveSchedule
  off: boolean
  devnet: boolean
}) {
  const { t } = useLingui()
  const doc = query.data?.data
  const crawlStamp = query.data ? stampOf(query.data) : undefined
  const last = doc?.epochs.at(-1)
  const pool = livePool(live)
  const crawlOn = !off && !devnet
  const waiting = crawlOn && !doc && !query.isError
  const poolValue = pool?.pool ?? doc?.now.pool_so_far
  const crawlPerBlock =
    doc && doc.now.blocks > 0 ? doc.now.pool_so_far / BigInt(doc.now.blocks) : undefined
  const perBlock = pool ? pool.perBlock : crawlPerBlock
  const stamps = [pool?.stamp, crawlStamp].filter((s): s is SourceStamp => s !== undefined)
  return (
    <Card
      id="rewards"
      layer="network"
      title={t`Epoch rewards`}
      subtitle={t`What the evonodes are paid from, and what that comes to.`}
      source={stamps}
    >
      <Stats>
        <Stat
          label={t`Pool so far`}
          value={
            poolValue === undefined ? (
              '—'
            ) : (
              <Ticking value={poolValue.toString()}>
                <Amount value={poolValue} kind="credits" compact />
              </Ticking>
            )
          }
          note={
            pool
              ? t`Core block rewards to Core block ${formatInt(pool.cl)}; fees not counted`
              : doc
                ? t`From Radar’s crawl; fees not counted`
                : undefined
          }
          source={pool?.stamp ?? crawlStamp}
          loading={poolValue === undefined && (waiting || !live.epoch)}
          layer="network"
        />
        <Stat
          label={t`Per block`}
          value={
            perBlock === undefined ? (
              '—'
            ) : (
              <Ticking value={perBlock.toString()}>
                <Amount value={perBlock} kind="credits" compact />
              </Ticking>
            )
          }
          note={
            pool
              ? t`The pool so far over ${formatInt(pool.blocks)} blocks: an estimate until the epoch ends`
              : perBlock !== undefined
                ? t`From Radar’s crawl: an estimate until the epoch ends`
                : undefined
          }
          source={pool?.stamp ?? crawlStamp}
          loading={perBlock === undefined && (waiting || !live.epoch)}
          layer="network"
        />
        {crawlOn
          ? [
              <Stat
                key="last"
                label={t`Last pool`}
                value={last ? <Amount value={last.pool} kind="credits" compact /> : '—'}
                note={last ? t`Epoch ${formatInt(last.epoch)}` : undefined}
                source={crawlStamp}
                loading={waiting}
                layer="network"
              />,
              <Stat
                key="monthly"
                label={t`Median monthly earnings`}
                value={
                  doc ? <Amount value={doc.returns.median_monthly} kind="credits" compact /> : '—'
                }
                note={
                  doc
                    ? t`Per evonode, over ${formatNumber(doc.returns.monthly_basis_days ?? 0, { maximumFractionDigits: 0 })} days`
                    : undefined
                }
                source={crawlStamp}
                loading={waiting}
                layer="network"
              />,
              <Stat
                key="yield"
                label={t`Median yield`}
                value={
                  doc?.returns.median_platform_yield == null
                    ? '—'
                    : formatPercent(doc.returns.median_platform_yield, 1)
                }
                note={t`A year, on the collateral`}
                source={crawlStamp}
                loading={waiting}
                layer="network"
              />,
            ]
          : null}
      </Stats>
      {off ? (
        <Unavailable
          compact
          source="radar"
          title={t`The last pool, earnings, yield and the epoch history need Radar’s crawl`}
        />
      ) : devnet ? (
        <Empty
          kind="unsupported-network"
          title={t`Radar doesn’t crawl devnets: no last pool, earnings, yield or history`}
        />
      ) : null}
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
