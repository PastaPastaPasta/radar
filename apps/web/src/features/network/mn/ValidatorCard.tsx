import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import type { EChartsOption } from 'echarts'
import { useState } from 'react'
import { peQueries } from '@/data/pe/queries'
import type { RadarMasternodeDetail } from '@/data/radar/schemas'
import { Entity } from '@/features/entity'
import { formatInt, formatNumber } from '@/lib/format'
import { CREDITS_PER_DASH } from '@/lib/units'
import { Amount, Badge, Card, Chart, Empty, KeyValue, Stat, Stats, Time } from '@/ui'
import type { MnContext } from './mn-context'

const TIMEFRAMES = ['24h', '1w'] as const
type Timeframe = (typeof TIMEFRAMES)[number]

/** Platform Explorer's record of this evonode as a validator, with Radar's crawl for reachability. */
export function ValidatorCard({ ctx, d }: { ctx: MnContext; d: RadarMasternodeDetail }) {
  const { t } = useLingui()
  const [timeframe, setTimeframe] = useState<Timeframe>('24h')
  const validator = useQuery(peQueries.validator(ctx.net, ctx.protx))
  const blocks = useQuery(peQueries.validatorBlockStats(ctx.net, ctx.protx, timeframe))
  const rewards = useQuery(peQueries.validatorRewardStats(ctx.net, ctx.protx, timeframe))
  const v = validator.data?.data ?? null
  const state = v?.proTxInfo?.state
  const latest = d.platform?.latest

  const tile = (label: string, ok: boolean | null, detail: string) => (
    <Stat
      label={label}
      value={ok === null ? '—' : ok ? t`Reachable` : t`Not answering`}
      note={detail}
      tone={ok === null ? 'neutral' : ok ? 'good' : 'bad'}
      layer="platform"
    />
  )
  const probe = (p: { ms?: number | null; error?: string | null } | null | undefined) =>
    !p ? null : !p.error
  const detail = (p: { ms?: number | null; error?: string | null } | null | undefined) =>
    !p ? t`not probed` : (p.error ?? t`answered in ${formatInt(p.ms ?? 0)} ms`)

  const fmt = (n: number) => formatNumber(n, { maximumFractionDigits: 2 })
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
  const blockOption: EChartsOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 8, right: 12, top: 16, bottom: 28, containLabel: true },
    xAxis: { type: 'category', data: (blocks.data?.data ?? []).map((p) => day(p.t)) },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      {
        type: 'bar',
        name: t`Blocks proposed`,
        data: (blocks.data?.data ?? []).map((p) => p.blocksCount),
      },
    ],
  }
  const rewardOption: EChartsOption = {
    tooltip: { trigger: 'axis', valueFormatter: (x) => `${fmt(Number(x))} DASH` },
    grid: { left: 8, right: 12, top: 16, bottom: 28, containLabel: true },
    xAxis: { type: 'category', data: (rewards.data?.data ?? []).map((p) => day(p.t)) },
    yAxis: { type: 'value', axisLabel: { formatter: (x: number) => fmt(x) } },
    series: [
      {
        type: 'bar',
        name: t`Rewards`,
        data: (rewards.data?.data ?? []).map((p) => Number(p.reward) / Number(CREDITS_PER_DASH)),
      },
    ],
  }

  const stamps = [validator.data, blocks.data, rewards.data].filter(
    (s): s is NonNullable<typeof s> => !!s,
  )
  return (
    <Card
      title={t`Validator record`}
      layer="platform"
      source={[...stamps, ...(ctx.radar ? [ctx.radar] : [])]}
      id="validator-record"
      subtitle={t`Reachability from Radar’s crawl; blocks, rewards and keys from Platform Explorer`}
      actions={
        v ? (
          <Badge tone={v.isActive ? 'success' : 'neutral'}>
            {v.isActive ? t`In a validator set` : t`Not in a validator set`}
          </Badge>
        ) : undefined
      }
    >
      <div className="grid gap-5">
        <Stats data-reachability>
          {tile(
            t`Core P2P`,
            d.reachable,
            d.last_error ??
              (d.latency_ms == null ? t`not probed` : t`answered in ${formatInt(d.latency_ms)} ms`),
          )}
          {tile(t`Platform P2P`, probe(latest?.p2p), detail(latest?.p2p))}
          {tile(t`gRPC (HTTPS)`, probe(latest?.https), detail(latest?.https))}
        </Stats>
        {validator.isPending ? (
          <p className="rx-dim">…</p>
        ) : validator.isError && !validator.data ? (
          <p className="rx-dim" role="status">
            {t`Platform Explorer didn’t answer, so its record of this validator is missing.`}
          </p>
        ) : !v ? (
          <Empty
            kind="none-yet"
            title={t`Platform Explorer has no validator record for this ProTx.`}
          />
        ) : (
          <>
            <KeyValue
              columns={2}
              items={[
                {
                  label: t`Epoch`,
                  value: v.epochInfo ? (
                    <Entity
                      kind="epoch"
                      id={String(v.epochInfo.number)}
                      label={formatInt(v.epochInfo.number)}
                    />
                  ) : (
                    '—'
                  ),
                },
                {
                  label: t`Rewards this epoch`,
                  value:
                    v.epochReward != null ? <Amount value={v.epochReward} kind="credits" /> : '—',
                },
                {
                  label: t`Rewards in total`,
                  value:
                    v.totalReward != null ? <Amount value={v.totalReward} kind="credits" /> : '—',
                },
                {
                  label: t`Blocks proposed`,
                  value: v.proposedBlocksAmount != null ? formatInt(v.proposedBlocksAmount) : '—',
                },
                {
                  label: t`Last block`,
                  value: v.lastProposedBlockHeader ? (
                    <Entity
                      kind="platform-block"
                      id={String(v.lastProposedBlockHeader.height)}
                      label={formatInt(v.lastProposedBlockHeader.height)}
                    />
                  ) : (
                    t`none`
                  ),
                  hint: v.lastProposedBlockHeader ? (
                    <Time ms={v.lastProposedBlockHeader.timestamp} />
                  ) : undefined,
                },
                {
                  label: t`Withdrawals`,
                  value: v.withdrawalsCount != null ? formatInt(v.withdrawalsCount) : '—',
                  hint: v.lastWithdrawalTime ? (
                    <>
                      {t`last`} <Time ms={v.lastWithdrawalTime} />
                    </>
                  ) : undefined,
                },
                {
                  label: t`PoSe`,
                  value:
                    state?.PoSePenalty != null
                      ? state.PoSePenalty > 0
                        ? t`Penalty ${formatInt(state.PoSePenalty)}`
                        : t`No penalty`
                      : '—',
                  hint:
                    v.poseScoreMax != null ? t`bans at ${formatInt(v.poseScoreMax)}` : undefined,
                },
                {
                  label: t`Registered`,
                  value: v.registeredAt ? <Time ms={v.registeredAt} mode="absolute" /> : '—',
                },
                ...(state?.ownerAddress
                  ? [{ label: t`Owner`, value: <Entity kind="address" id={state.ownerAddress} /> }]
                  : []),
                ...(state?.votingAddress
                  ? [
                      {
                        label: t`Voting`,
                        value: <Entity kind="address" id={state.votingAddress} />,
                      },
                    ]
                  : []),
                ...(state?.payoutAddress
                  ? [
                      {
                        label: t`Payout`,
                        value: <Entity kind="address" id={state.payoutAddress} />,
                      },
                    ]
                  : []),
                ...(v.proTxInfo?.collateralAddress
                  ? [
                      {
                        label: t`Collateral`,
                        value: <Entity kind="address" id={v.proTxInfo.collateralAddress} />,
                      },
                    ]
                  : []),
              ]}
            />
            <div role="group" aria-label={t`Chart range`} className="flex gap-2" data-timeframe>
              {TIMEFRAMES.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={
                    f === timeframe ? 'dh-btn dh-btn--sm dh-btn--primary' : 'dh-btn dh-btn--sm'
                  }
                  aria-pressed={f === timeframe}
                  onClick={() => {
                    setTimeframe(f)
                  }}
                >
                  {f === '24h' ? t`24 hours` : t`1 week`}
                </button>
              ))}
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <Chart
                option={blockOption}
                height={200}
                loading={blocks.isPending}
                label={t`Blocks this evonode proposed, over the last ${timeframe === '24h' ? t`24 hours` : t`week`}`}
                table={{
                  columns: [t`Time (UTC)`, t`Blocks`],
                  rows: (blocks.data?.data ?? []).map((p) => [day(p.t), p.blocksCount]),
                }}
              />
              <Chart
                option={rewardOption}
                height={200}
                loading={rewards.isPending}
                label={t`Platform rewards this evonode earned, over the last ${timeframe === '24h' ? t`24 hours` : t`week`}`}
                table={{
                  columns: [t`Time (UTC)`, t`Rewards (DASH)`],
                  rows: (rewards.data?.data ?? []).map((p) => [
                    day(p.t),
                    fmt(Number(p.reward) / Number(CREDITS_PER_DASH)),
                  ]),
                }}
              />
            </div>
          </>
        )}
      </div>
    </Card>
  )
}
