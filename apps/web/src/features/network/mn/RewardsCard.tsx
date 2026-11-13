// The rewards section follows dash-nodes' masternode page (MIT, github.com/PastaPastaPasta/dash-nodes).
import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import type { EChartsOption } from 'echarts'
import { useMemo } from 'react'
import type { SourceStamp } from '@/data/envelope'
import { peQueries } from '@/data/pe/queries'
import { radarQueries } from '@/data/radar/queries'
import type { RadarMasternodeDetail, RadarPlatform } from '@/data/radar/schemas'
import { formatInt, formatNumber, formatPercent } from '@/lib/format'
import { Amount, Card, Chart, Empty, KeyValue, Stat, Stats, Time } from '@/ui'
import type { MnContext } from './mn-context'
import { dash, spreadOf } from './platform-math'

type Rewards = NonNullable<RadarMasternodeDetail['platform_rewards']>

export function RewardsCard({
  ctx,
  d,
  stamp,
}: {
  ctx: MnContext
  d: RadarMasternodeDetail
  stamp: SourceStamp
}) {
  const { t } = useLingui()
  const p = d.platform_rewards
  const census = useQuery(radarQueries.platform(ctx.net))
  const pe = useQuery(peQueries.validator(ctx.net, ctx.protx))
  const stamps = [stamp, census.data, pe.data].filter((s): s is NonNullable<typeof s> => !!s)
  if (!p?.totals) {
    return (
      <Card title={t`Platform rewards`} layer="platform" source={stamp} id="platform-rewards">
        <Empty
          kind="none-yet"
          title={t`Radar has no reward record for this evonode yet.`}
          body={t`Rewards appear after it has proposed a block in a finished epoch.`}
        />
      </Card>
    )
  }
  const totals = p.totals
  const current = p.current
  const lastEpoch = p.epochs?.find((e) => e.epoch === totals.last_epoch_index)
  const peTotal = pe.data?.data?.totalReward ?? p.explorer?.total_reward ?? null
  const peAhead = p.explorer?.before_ours ?? null
  const returns = d.returns
  const coreMonthly =
    returns?.window_days && returns.paid_90d != null
      ? (returns.paid_90d * 30n) / BigInt(returns.window_days)
      : null
  const yearly =
    returns?.annual_yield != null && p.annual_yield != null
      ? returns.annual_yield + p.annual_yield
      : null
  const watched = p.watched?.find((w) => w.coverage >= 0.8 && w.expected != null)
  return (
    <Card
      title={t`Platform rewards`}
      layer="platform"
      source={stamps}
      id="platform-rewards"
      subtitle={
        p.first_epoch != null
          ? t`Per finished epoch since epoch ${formatInt(p.first_epoch)}, worked out the way Drive pays them`
          : undefined
      }
    >
      <div className="grid gap-5">
        <Stats data-reward-tiles>
          <Stat
            label={t`Claimable now`}
            value={p.balance ? <Amount value={p.balance.credits} kind="credits" /> : '—'}
            note={
              p.balance ? (
                <>
                  {t`its identity’s balance, read`} <Time ms={p.balance.ts} />
                </>
              ) : (
                t`not read yet`
              )
            }
            layer="platform"
          />
          <Stat
            label={t`Last epoch (${totals.last_epoch_index ?? '—'})`}
            value={
              totals.last_epoch != null ? <Amount value={totals.last_epoch} kind="credits" /> : '—'
            }
            note={
              lastEpoch?.blocks
                ? lastEpoch.rank
                  ? t`${plural(lastEpoch.blocks, { one: '# block', other: '# blocks' })}, ${formatInt(lastEpoch.rank)} of ${formatInt(lastEpoch.of ?? 0)} evonodes`
                  : plural(lastEpoch.blocks, { one: '# block', other: '# blocks' })
                : t`it proposed no blocks`
            }
            layer="platform"
          />
          <Stat
            label={t`This epoch so far`}
            value={current ? plural(current.blocks, { one: '# block', other: '# blocks' }) : '—'}
            note={
              current?.accrued != null ? (
                <>
                  ≈ <Amount value={current.accrued} kind="credits" />{' '}
                  {t`if it ended now (an estimate)`}
                </>
              ) : (
                t`nothing yet`
              )
            }
            layer="platform"
          />
          <Stat
            label={t`Next block`}
            value={p.next?.eta ? <Time ms={p.next.eta} mode="relative" /> : '—'}
            note={
              p.next
                ? p.next.slots === 1
                  ? t`its turn is next; an estimate`
                  : t`its turn is ${formatInt(p.next.slots ?? 0)} blocks away; an estimate`
                : p.in_validator_sets === false
                  ? t`not in a validator set that takes turns now`
                  : t`unknown: the validator sets haven’t been read lately`
            }
            layer="platform"
          />
        </Stats>

        {census.data ? <RankStrip platform={census.data.data} p={p} /> : null}

        <div className="rx-kvgrid" data-columns="2">
          <div>
            <h4 className="rx-sm rx-dim">{t`Earned on Platform`}</h4>
            <KeyValue
              items={[
                { label: t`Last 30 days`, value: money(totals.d30) },
                { label: t`Last 90 days`, value: money(totals.d90) },
                { label: t`Last 365 days`, value: money(totals.d365) },
                {
                  label: t`Since epoch ${formatInt(p.first_epoch ?? 0)}`,
                  value: <Amount value={totals.lifetime} kind="credits" />,
                  hint: plural(totals.epochs_paid ?? 0, {
                    one: '# epoch paid',
                    other: '# epochs paid',
                  }),
                },
                ...(peTotal !== null
                  ? [
                      {
                        label: t`Platform Explorer says`,
                        value: <Amount value={peTotal} kind="credits" />,
                        hint:
                          peAhead && peAhead > 100_000_000n
                            ? t`more than Radar’s total, for epochs before Radar’s record`
                            : peTotal === totals.lifetime
                              ? t`the same as Radar’s total`
                              : t`Platform Explorer is a third party; Radar has not verified it`,
                      },
                    ]
                  : []),
              ]}
            />
          </div>
          <div>
            <h4 className="rx-sm rx-dim">{t`Estimates`}</h4>
            <KeyValue
              items={[
                {
                  label: t`Platform, a month`,
                  value: p.monthly != null ? <Amount value={p.monthly} kind="credits" /> : '—',
                  hint: p.monthly_basis_days
                    ? t`at its pace of the last ${formatInt(p.monthly_basis_days)} days`
                    : t`once six epochs have finished`,
                },
                ...(coreMonthly !== null
                  ? [
                      {
                        label: t`Core, a month`,
                        value: <Amount value={coreMonthly} kind="duffs" />,
                        hint: t`from its payments over ${returns?.window_days ?? 90} days`,
                      },
                      ...(p.monthly != null
                        ? [
                            {
                              label: t`Both, a month`,
                              value: (
                                <Amount value={p.monthly / 1000n + coreMonthly} kind="duffs" />
                              ),
                            },
                          ]
                        : []),
                    ]
                  : []),
                {
                  label: t`Both, a year`,
                  value:
                    yearly !== null
                      ? t`${formatPercent(yearly, 1)} on 4,000 DASH`
                      : t`too new to tell`,
                },
                ...(current?.turns?.expected_blocks != null && (current.blocks_total ?? 0) > 0
                  ? [
                      {
                        label: t`This epoch, blocks`,
                        value: t`${formatInt(current.blocks)} made, about ${formatNumber(current.turns.expected_blocks)} expected`,
                      },
                    ]
                  : []),
                ...(watched
                  ? [
                      {
                        label: t`Epoch ${formatInt(watched.epoch)}, blocks`,
                        value: t`${formatInt(watched.actual)} made, about ${formatNumber(watched.expected ?? 0)} expected`,
                        hint: watched.missed
                          ? t`${formatInt(watched.missed)} missed turns seen`
                          : undefined,
                      },
                    ]
                  : []),
                ...(p.turns_30d?.turns
                  ? [
                      {
                        label: t`Missed turns Radar saw`,
                        value: t`${formatInt(p.turns_30d.missed)} of ${formatInt(p.turns_30d.turns)} turns, last 30 days`,
                      },
                    ]
                  : []),
                {
                  label: t`Upgrade vote`,
                  value: p.vote
                    ? t`protocol ${p.vote.version}`
                    : t`none yet this epoch: it votes with the blocks it proposes`,
                },
              ]}
            />
          </div>
        </div>
        <p className="rx-dim rx-sm">
          {t`Drive keeps per-evonode records only from epoch ${formatInt(p.first_epoch ?? 0)} on, so rewards before it can’t be checked. Rewards are gross: reward shares are not deducted.`}
        </p>

        <EpochBars p={p} platform={census.data?.data ?? null} />
      </div>
    </Card>
  )
}

function money(v: bigint | null | undefined) {
  return v == null ? '—' : <Amount value={v} kind="credits" />
}

/** Last epoch's rewards across evonodes: how many earned each amount, this one marked, the middle 80 % shaded. */
function RankStrip({ platform, p }: { platform: RadarPlatform; p: Rewards }) {
  const { t } = useLingui()
  const mine = p.totals?.last_epoch ?? 0n
  const values = platform.evonodes
    .filter((e) => (e.last_blocks ?? 0) > 0 && e.last_epoch != null)
    .map((e) => e.last_epoch ?? 0n)
  const spread = spreadOf(values)
  const counts = useMemo(() => {
    const m = new Map<bigint, number>()
    for (const v of values) m.set(v, (m.get(v) ?? 0) + 1)
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps -- values follows the census
  }, [platform])
  if (!spread || values.length === 0) return null
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const max = sorted[sorted.length - 1] ?? 1n
  const most = Math.max(...counts.values())
  const W = 1000
  const H = 44
  const x = (v: bigint) => (Number(v) / Number(max || 1n)) * (W - 6) + 3
  const below = values.filter((v) => v < mine).length
  return (
    <div data-rank-strip>
      <h4 className="rx-sm rx-dim">{t`Where it sits`}</h4>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        className="w-full"
        height={H}
        aria-label={t`${formatInt(values.length)} evonodes’ rewards last epoch, from ${formatNumber(dash(sorted[0] ?? 0n), { maximumFractionDigits: 2 })} to ${formatNumber(dash(max), { maximumFractionDigits: 2 })} DASH; this one ${formatNumber(dash(mine), { maximumFractionDigits: 2 })} DASH`}
      >
        <rect
          x={x(spread.p10)}
          y={0}
          width={Math.max(1, x(spread.p90) - x(spread.p10))}
          height={H}
          fill="var(--rx-l, #008DE4)"
          opacity={0.12}
        />
        {[...counts].map(([v, n]) => {
          const h = 4 + ((H - 8) * n) / most
          return (
            <rect
              key={String(v)}
              x={x(v) - 2}
              y={H - h}
              width={4}
              height={h}
              fill={v === mine ? 'var(--rx-l, #008DE4)' : 'var(--dh-line-2, #7A8B98)'}
            />
          )
        })}
        <rect x={x(spread.p50) - 0.75} y={0} width={1.5} height={H} fill="var(--dh-ink, #0C1D2B)" />
      </svg>
      <p className="rx-dim rx-sm">
        {mine > 0n
          ? t`It earned more than ${formatPercent(below / values.length, 0)} of the ${formatInt(values.length)} evonodes that proposed blocks last epoch; the median is ${formatNumber(dash(spread.p50), { maximumFractionDigits: 2 })} DASH.`
          : t`It proposed no blocks last epoch.`}{' '}
        {p.d30_percentile != null && p.d30_of != null
          ? t`Over the last 30 days, more than ${formatPercent(p.d30_percentile, 0)} of all ${formatInt(p.d30_of)} enabled evonodes.`
          : ''}
      </p>
    </div>
  )
}

function EpochBars({ p, platform }: { p: Rewards; platform: RadarPlatform | null }) {
  const { t } = useLingui()
  const epochs = useMemo(() => [...(p.epochs ?? [])].reverse(), [p.epochs])
  if (epochs.length === 0) {
    return <p className="rx-dim">{t`It hasn’t proposed a block in a finished epoch yet.`}</p>
  }
  const band = new Map((platform?.epochs ?? []).map((e) => [e.epoch, e.credits_spread]))
  const fmt = (v: number) => formatNumber(v, { maximumFractionDigits: 2 })
  const option: EChartsOption = {
    tooltip: { trigger: 'axis', valueFormatter: (v) => `${fmt(Number(v))} DASH` },
    legend: { show: false },
    grid: { left: 8, right: 12, top: 16, bottom: 28, containLabel: true },
    xAxis: { type: 'category', data: epochs.map((e) => String(e.epoch)) },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => fmt(v) } },
    series: [
      { type: 'bar', name: t`This evonode`, data: epochs.map((e) => dash(e.credits)) },
      ...(band.size > 0
        ? [
            {
              type: 'line' as const,
              name: t`Middle 80 % starts`,
              symbol: 'none',
              lineStyle: { type: 'dashed' as const, width: 1 },
              data: epochs.map((e) => {
                const s = band.get(e.epoch)
                return s ? dash(s.p10) : null
              }),
            },
            {
              type: 'line' as const,
              name: t`Middle 80 % ends`,
              symbol: 'none',
              lineStyle: { type: 'dashed' as const, width: 1 },
              data: epochs.map((e) => {
                const s = band.get(e.epoch)
                return s ? dash(s.p90) : null
              }),
            },
          ]
        : []),
    ],
  }
  const first = epochs[0]?.epoch
  const last = epochs[epochs.length - 1]?.epoch
  return (
    <div data-epoch-bars>
      <h4 className="rx-sm rx-dim">{t`Every epoch, in DASH`}</h4>
      <Chart
        option={option}
        height={220}
        label={t`Platform rewards per epoch, epochs ${first ?? 0} to ${last ?? 0}, against the middle 80 % of evonodes`}
        table={{
          columns: [t`Epoch`, t`Blocks`, t`Earned (DASH)`, t`Rank`, t`Middle 80 % (DASH)`],
          rows: [...epochs].reverse().map((e) => {
            const s = band.get(e.epoch)
            return [
              e.epoch,
              e.blocks,
              fmt(dash(e.credits)),
              e.rank ? `${e.rank} / ${e.of ?? ''}` : '—',
              s ? `${fmt(dash(s.p10))} – ${fmt(dash(s.p90))}` : '—',
            ]
          }),
        }}
      />
    </div>
  )
}
