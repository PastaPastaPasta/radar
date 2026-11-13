import { useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { radarQueries } from '@/data/radar/queries'
import type { RadarMnBench } from '@/data/radar/schemas'
import { formatInt, formatPercent } from '@/lib/format'
import { Badge, Card, DataTable, Empty, Meter, Time, type Tone } from '@/ui'

import type { MnContext } from './mn-context'

type Vantage = RadarMnBench['vantages'][number]
type Result = Vantage['results'][number]

const GRADE_TONE: Record<string, Tone> = {
  A: 'success',
  B: 'success',
  C: 'warning',
  D: 'danger',
  F: 'danger',
}

/** The newest run decides: a node that stopped answering must not keep showing an old grade. */
const latest = (v: Vantage): Result | undefined => v.results[0]
const score1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1)

export function BenchCard({ ctx }: { ctx: MnContext }) {
  const { t } = useLingui()
  const query = useQuery({ ...radarQueries.mnBench(ctx.net, ctx.protx), enabled: !ctx.off })
  const stamp = query.data
  const bench = stamp?.data ?? null
  const tested = useMemo(() => (bench?.vantages ?? []).filter((v) => v.results.length > 0), [bench])
  const ms = (v: number | null | undefined) => (v == null ? '—' : t`${formatInt(Math.round(v))} ms`)
  const secs = (v: number | null | undefined) =>
    v == null ? '—' : t`${v < 10 ? v.toFixed(1) : formatInt(Math.round(v))} s`

  const columns = useMemo<ColumnDef<Vantage>[]>(
    () => [
      {
        id: 'where',
        header: t`Location`,
        cell: ({ row }) => row.original.location || row.original.vantage,
        meta: { phone: 'title' },
      },
      {
        id: 'tested',
        header: t`Tested`,
        cell: ({ row }) => {
          const r = latest(row.original)
          return r ? <Time ms={r.ts} /> : '—'
        },
        meta: { phone: 'secondary' },
      },
      {
        id: 'ping',
        header: t`Ping`,
        cell: ({ row }) => ms(latest(row.original)?.ping_ms?.median),
        meta: { align: 'end', numeric: true },
      },
      {
        id: 'connect',
        header: t`Connect`,
        cell: ({ row }) => {
          const r = latest(row.original)
          return ms(
            r?.connect_ms != null && r.handshake_ms != null
              ? r.connect_ms + r.handshake_ms
              : r?.connect_ms,
          )
        },
        meta: { align: 'end', numeric: true },
      },
      {
        id: 'headers',
        header: t`50k headers`,
        cell: ({ row }) => {
          const h = latest(row.original)?.headers
          if (!h) return '—'
          return h.served < h.requested ? t`${secs(h.seconds)} (incomplete)` : secs(h.seconds)
        },
        meta: { align: 'end', numeric: true },
      },
      {
        id: 'rate',
        header: t`Headers/s`,
        cell: ({ row }) => {
          const h = latest(row.original)?.headers
          return h ? formatInt(Math.round(h.per_sec)) : '—'
        },
        meta: { align: 'end', numeric: true, phone: 'hidden' },
      },
      {
        id: 'mnlist',
        header: t`MN list`,
        cell: ({ row }) => {
          const m = latest(row.original)?.mnlistdiff
          return m?.ok ? secs(m.seconds) : '—'
        },
        meta: { align: 'end', numeric: true, phone: 'hidden' },
      },
      {
        id: 'grade',
        header: t`Grade`,
        cell: ({ row }) => {
          const r = latest(row.original)
          const g = r?.grade
          if (!r) return '—'
          if (!r.ok) return <Badge tone="danger">{t`Failed`}</Badge>
          return g ? (
            <Badge tone={GRADE_TONE[g.letter] ?? 'neutral'}>
              {g.letter} · {score1(g.score)}
            </Badge>
          ) : (
            '—'
          )
        },
        meta: { align: 'end', phone: 'primary' },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ms and secs only close over t
    [t],
  )

  const dims: [keyof NonNullable<Result['grade']>, string][] = [
    ['completeness', t`Served everything asked`],
    ['throughput', t`Header throughput`],
    ['reliability', t`No stalls or bad data`],
    ['latency', t`Ping`],
    ['connectivity', t`Connect and handshake`],
  ]

  if (ctx.off) return null
  const body = (() => {
    if (query.isPending) return null
    if (tested.length === 0) {
      return (
        <Empty
          kind="none-yet"
          title={t`Not tested yet. Radar tests every enabled masternode about every two weeks.`}
        />
      )
    }
    const combined = bench?.combined ?? null
    const ranks = tested.map((v) => v.percentile).filter((x): x is number => x != null)
    const rank = ranks.length ? ranks.reduce((a, x) => a + x, 0) / ranks.length : null
    const breakdownFrom = tested.find((v) => latest(v)?.grade)
    const grade = breakdownFrom ? latest(breakdownFrom)?.grade : undefined
    return (
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-4" data-bench-summary>
          <span
            className="text-4xl font-semibold"
            data-grade={combined?.letter ?? 'none'}
            aria-label={combined ? t`Grade ${combined.letter}` : t`No grade`}
          >
            {combined?.letter ?? '—'}
          </span>
          <div>
            <p>
              {combined
                ? t`${score1(combined.score)} out of 100`
                : t`The latest test failed; Radar retries within a day.`}
              {combined && combined.vantages > 1
                ? ` ${t`(average of ${combined.vantages} locations)`}`
                : ''}
            </p>
            {rank !== null ? (
              <p className="rx-dim rx-sm" data-percentile>
                {t`Better than ${formatPercent(rank, 0)} of masternodes tested from the same location.`}
              </p>
            ) : null}
          </div>
        </div>
        {grade ? (
          <div className="grid gap-2" data-bench-dims>
            {dims.map(([key, label]) => {
              const value = grade[key]
              return typeof value === 'number' ? (
                <Meter
                  key={key}
                  label={label}
                  value={value}
                  max={100}
                  format={(v) => String(Math.round(v))}
                  thresholds={[
                    { at: 0, tone: 'danger' },
                    { at: 60, tone: 'warning' },
                    { at: 80, tone: 'success' },
                  ]}
                />
              ) : null
            })}
            {tested.length > 1 && breakdownFrom ? (
              <p className="rx-dim rx-sm">
                {t`Breakdown from ${breakdownFrom.location || breakdownFrom.vantage}.`}
              </p>
            ) : null}
          </div>
        ) : null}
        <DataTable
          caption={t`Speed test results by location`}
          columns={columns}
          rows={tested}
          getRowId={(v) => v.vantage}
          state="ready"
        />
        <p className="rx-dim rx-sm">
          {t`Each test downloads the latest 50,000 block headers and the masternode list from this node and checks them against Radar’s own node.`}
        </p>
      </div>
    )
  })()
  return (
    <Card
      title={t`Speed test`}
      layer="network"
      source={stamp}
      id="speed-test"
      subtitle={t`About every two weeks, from each test location`}
      state={query.isPending ? 'loading' : query.isError && !stamp ? 'error' : 'ready'}
      error={query.error}
      onRetry={() => void query.refetch()}
    >
      {body}
    </Card>
  )
}
