import { Trans, useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import type { SourceStamp } from '@/data/envelope'
import type { RadarActivation, RadarActivationDeployment } from '@/data/radar/schemas'
import { formatDuration, formatInt, formatPercent } from '@/lib/format'
import { Badge, Card, DataTable } from '@/ui'
import { InfoTip } from './InfoTip'
import { day, pct, pinAt } from './v24-format'
import {
  currentRate,
  estimateMs,
  locksIn,
  poolStandings,
  projectLockIn,
  layoutOf,
  windowOutlook,
  type PoolStanding,
  type Segment,
} from './v24-math'

/** Which pools' blocks in the window signal, by the tag in each coinbase. Shown only while the window counts. */
export function PoolsSection({
  doc,
  d,
  stamp,
}: {
  doc: RadarActivation
  d: RadarActivationDeployment
  stamp: SourceStamp
}) {
  const { t } = useLingui()
  const w = d.window
  const pools = d.state === 'started' ? w?.pools : undefined
  const mined = w?.mined ?? 0
  const standings = useMemo(() => (w && pools ? poolStandings(w) : []), [w, pools])
  const columns = useMemo<ColumnDef<PoolStanding>[]>(
    () => [
      {
        id: 'pool',
        header: t`Pool`,
        cell: ({ row: { original: s } }) => s.row.pool ?? t`Untagged`,
        meta: { phone: 'title' },
      },
      {
        id: 'blocks',
        header: t`Blocks`,
        cell: ({ row: { original: s } }) => (
          <>
            <b>{formatInt(s.row.blocks)}</b>{' '}
            <small className="text-[var(--dh-ink-2)]">{pct(s.row.blocks, mined)}</small>
          </>
        ),
        meta: { align: 'end', numeric: true, phone: 'primary' },
      },
      {
        id: 'status',
        header: t`Signalling`,
        cell: ({ row: { original: s } }) => <PoolStatus s={s} blockSeconds={doc.block_seconds} />,
        meta: { phone: 'secondary' },
      },
    ],
    [t, mined, doc.block_seconds],
  )
  if (!w || !pools || pools.length === 0 || mined <= 0) return null
  const { segments, span, blocker } = layoutOf(standings, t`Untagged`)
  const yes = segments.filter((s) => s.on).reduce((a, s) => a + s.blocks, 0)
  const before = segments.reduce((a, s) => a + (s.since === undefined ? 0 : s.blocks), 0)
  const needed = w.threshold == null ? undefined : w.threshold / d.params.window
  const say = (s: Segment) =>
    s.now !== undefined
      ? t`${s.name}: ${pct(s.blocks, mined)}, signalling since block ${formatInt(s.now)}`
      : s.on
        ? t`${s.name}: ${pct(s.blocks, mined)}, signalling`
        : s.since !== undefined
          ? t`${s.name}: ${pct(s.blocks, mined)}, not signalling before block ${formatInt(s.since)}`
          : t`${s.name}: ${pct(s.blocks, mined)}, not signalling`
  return (
    <Card
      level="section"
      title={t`Pools signalling`}
      id="pools"
      layer="network"
      subtitle={
        <>
          {t`This window's ${formatInt(mined)} blocks by pool.`}{' '}
          <InfoTip label={t`About the pool tags`}>
            <p className="m-0">
              {t`Who mined this window's ${formatInt(mined)} blocks and how many of them signalled. Best effort: we go by the tag in each block's coinbase, which is whatever the miner wrote, and some blocks carry none.`}
            </p>
            <p className="m-0 mt-2 text-[var(--dh-ink-2)]">
              {t`Radar counts each pool's blocks, not where they fall. A pool reads as now signalling when every block since the window's last one that didn't has signalled, and at its own rate of misses it would have missed several of them. A pool that stopped mining or changed its tag reads the same way.`}
            </p>
          </InfoTip>
        </>
      }
      source={stamp}
    >
      <div className="grid gap-4">
        <figure className="rx-v24-wbar" data-v24-pool-bar>
          <div
            className="rx-v24-bar"
            role="img"
            aria-label={`${t`Share of this window's blocks by pool`}: ${segments.map(say).join('; ')}`}
          >
            {needed !== undefined ? (
              <span className="rx-v24-bar__mlabel" style={pinAt(needed)} aria-hidden="true">
                {t({ message: `${formatPercent(needed, 0)} needed`, context: 'share of blocks' })}
              </span>
            ) : null}
            <div className="rx-v24-pools" aria-hidden="true">
              {segments.map((s) => (
                <span
                  key={s.key}
                  className={
                    s.on
                      ? 'rx-v24-yes'
                      : s.since !== undefined
                        ? 'rx-v24-no rx-v24-was'
                        : 'rx-v24-no'
                  }
                  style={{ flexGrow: s.blocks }}
                  title={say(s)}
                  data-pool={s.name}
                  data-blocker={s === blocker || undefined}
                  data-switched={s.since !== undefined || undefined}
                  data-now={s.now !== undefined || undefined}
                >
                  {s.now !== undefined ? (
                    <span className="rx-v24-seg rx-v24-seg--now">
                      <span className="rx-v24-seg__long">{t`${s.name} ${pct(s.blocks, mined)} now`}</span>
                      <span className="rx-v24-seg__short">{t`${pct(s.blocks, mined)} now`}</span>
                      <span className="rx-v24-seg__pct">{pct(s.blocks, mined)}</span>
                    </span>
                  ) : (
                    <span className="rx-v24-seg">
                      <span className="rx-v24-seg__name">{s.name}</span>{' '}
                      <span>{pct(s.blocks, mined)}</span>
                      {s === blocker ? (
                        <span className="rx-v24-seg__not"> · {t`not signalling`}</span>
                      ) : null}
                    </span>
                  )}
                </span>
              ))}
            </div>
            {span ? (
              <div className="rx-v24-spans" aria-hidden="true" data-pool-span={span.name}>
                <span
                  style={{
                    left: `${(span.left / mined) * 100}%`,
                    width: `${(span.blocks / mined) * 100}%`,
                  }}
                />
                <p
                  style={
                    span.left + span.blocks / 2 >= mined / 2
                      ? {
                          textAlign: 'right',
                          paddingRight: `${(1 - (span.left + span.blocks) / mined) * 100}%`,
                        }
                      : { paddingLeft: `${(span.left / mined) * 100}%` }
                  }
                >
                  {span.since === undefined ? (
                    t`${span.name} ${pct(span.blocks, mined)} in all`
                  ) : (
                    <Trans>
                      {span.name} {pct(span.blocks, mined)} in all
                      <br />
                      {pct(span.signalling, mined)} signalling now ·{' '}
                      {pct(span.blocks - span.signalling, mined)} before it switched
                    </Trans>
                  )}
                </p>
              </div>
            ) : null}
            {needed !== undefined ? (
              <b
                className="rx-v24-bar__mark rx-v24-bar__mark--tick"
                style={{ left: `${needed * 100}%` }}
                aria-hidden="true"
              />
            ) : null}
          </div>
          <ul className="rx-legend" aria-hidden="true">
            <li>
              <span className="rx-sw rx-v24-yes" />
              {t`Signalling`} <b>{pct(yes, mined)}</b>
            </li>
            {before > 0 ? (
              <li>
                <span className="rx-sw rx-v24-no rx-v24-was" />
                {t`Not signalling, from pools that since switched`} <b>{pct(before, mined)}</b>
              </li>
            ) : null}
            {mined - yes - before > 0 || before === 0 ? (
              <li>
                <span className="rx-sw rx-v24-no" />
                {t`Not signalling`} <b>{pct(mined - yes - before, mined)}</b>
              </li>
            ) : null}
          </ul>
        </figure>
        <NowLine doc={doc} d={d} standings={standings} />
        <DataTable
          caption={t`Blocks and signalling blocks per pool this window`}
          columns={columns}
          rows={standings}
          getRowId={(s) => s.row.pool ?? ''}
          state="ready"
        />
      </div>
    </Card>
  )
}

/** An estimated span of blocks, to the hour past two hours, else to the minute. */
const aboutBlocks = (blocks: number, blockSeconds: number): string => {
  const ms = blocks * blockSeconds * 1000
  const unit = ms >= 2 * 3_600_000 ? 3_600_000 : 60_000
  return formatDuration(Math.max(unit, Math.round(ms / unit) * unit))
}

function BlockAt({ height }: { height: number }) {
  return (
    <Link to="/block/$id" params={{ id: String(height) }} preload={false}>
      {formatInt(height)}
    </Link>
  )
}

/** A pool's signalling this window: all, none, or how it changed when the window's order of blocks tells. */
function PoolStatus({ s, blockSeconds }: { s: PoolStanding; blockSeconds: number }) {
  const { t } = useLingui()
  const { row, trend } = s
  const signalled = formatInt(row.signalling)
  const blocks = formatInt(row.blocks)
  const ago = (n: number) => aboutBlocks(n, blockSeconds)
  switch (trend.kind) {
    case 'all':
      return <Badge tone="success" size="sm">{t`yes`}</Badge>
    case 'none':
      return <Badge tone="warning" size="sm">{t`no`}</Badge>
    case 'on':
      return (
        <span className="rx-v24-status" data-trend="on">
          <Badge tone="success" size="sm">{t`now signalling`}</Badge>
          <small>
            <Trans>
              every block since <BlockAt height={trend.since} /> (about {ago(trend.streak)} ago) ·{' '}
              {signalled} of {blocks} this window
            </Trans>
          </small>
        </span>
      )
    case 'off':
      return (
        <span className="rx-v24-status" data-trend="off">
          <Badge tone="danger" size="sm">{t`stopped signalling`}</Badge>
          <small>
            <Trans>
              at block <BlockAt height={trend.from} /> (about {ago(trend.streak)} ago) · {signalled}{' '}
              of {blocks} this window
            </Trans>
          </small>
        </span>
      )
    case 'partly':
      return (
        <span className="rx-v24-status" data-trend="partly">
          <Badge tone="warning" size="sm">{t`partly`}</Badge>
          <small>{t`${signalled} of ${blocks} this window`}</small>
        </span>
      )
  }
}

/**
 * Where the window stands if each pool keeps signalling as it does now; shown once a pool has switched, when that
 * differs from the window's pace so far.
 */
function NowLine({
  doc,
  d,
  standings,
}: {
  doc: RadarActivation
  d: RadarActivationDeployment
  standings: readonly PoolStanding[]
}) {
  const { t } = useLingui()
  const w = d.window
  const marks = w?.signalling ?? ''
  if (!w || !standings.some((s) => s.trend.kind === 'on' || s.trend.kind === 'off')) return null
  const rate = currentRate(standings)
  const outlook = rate === undefined ? undefined : windowOutlook(d, rate)
  const lastMiss = marks.lastIndexOf('-')
  const streak =
    lastMiss < 0 || !standings.some((s) => s.trend.kind === 'on') ? 0 : marks.length - 1 - lastMiss
  const at = (height: number) => day(estimateMs(doc, height))
  let projection: string | undefined
  if (rate !== undefined && outlook) {
    const lock = projectLockIn(doc, d, rate)
    const share = formatPercent(rate, 1)
    const ends = formatInt(outlook.projected)
    const needs = formatInt(outlook.threshold)
    projection =
      outlook.verdict === 'reached' || outlook.verdict === 'on-track'
        ? t`If every pool keeps signalling as it does now (${share} of blocks), this window ends with about ${ends} of the ${needs} it needs and locks Core 24 in, about ${at(outlook.endHeight)}.`
        : locksIn(lock)
          ? t`If every pool keeps signalling as it does now (${share} of blocks), this window ends with about ${ends} of the ${needs} it needs; window #${String(lock.attempt + 1)} would lock in, about ${at(lock.end)}.`
          : lock
            ? t`If every pool keeps signalling as it does now (${share} of blocks), this window ends with about ${ends} of the ${needs} it needs, and no window locks in at that share.`
            : undefined
  }
  return (
    <p className="rx-v24-pace-line grid gap-1" data-v24-pools-now>
      {streak > 0 ? (
        <span>
          <Trans>
            <b>
              Every block since <BlockAt height={w.start.height + lastMiss + 1} /> has signalled:
            </b>{' '}
            the last {formatInt(streak)}, about {aboutBlocks(streak, doc.block_seconds)}.
          </Trans>
        </span>
      ) : null}
      {projection ? <span className="text-[var(--dh-ink-2)]">{projection}</span> : null}
    </p>
  )
}
