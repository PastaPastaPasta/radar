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
  windowOutlook,
  type PoolStanding,
} from './v24-math'

interface Segment {
  key: string
  name: string
  blocks: number
  on: boolean
  /** Blocks that didn't signal from a pool that signals now. */
  before?: number
}

/**
 * Pools that signal in every block first, then each pool's signalling blocks beside its blocks that didn't, so a pool
 * that signals for some reads as one span across the divide; pools that signal in none last.
 */
function segmentsOf(standings: readonly PoolStanding[], untagged: string): Segment[] {
  const name = (s: PoolStanding) => s.row.pool ?? untagged
  const mixed = standings.filter((s) => s.row.signalling > 0 && s.row.signalling < s.row.blocks)
  const full = standings.filter((s) => s.row.signalling === s.row.blocks && s.row.blocks > 0)
  const none = standings
    .filter((s) => s.row.signalling === 0 && s.row.blocks > 0)
    .sort((a, b) => b.row.blocks - a.row.blocks)
  const yes = (s: PoolStanding): Segment => ({
    key: `y:${name(s)}`,
    name: name(s),
    blocks: s.row.signalling,
    on: true,
  })
  const no = (s: PoolStanding): Segment => ({
    key: `n:${name(s)}`,
    name: name(s),
    blocks: s.row.blocks - s.row.signalling,
    on: false,
    before: s.trend.kind === 'on' ? s.trend.since : undefined,
  })
  return [...full.map(yes), ...mixed.map(yes), ...mixed.toReversed().map(no), ...none.map(no)]
}

interface Span {
  name: string
  blocks: number
  left: number
  width: number
}

/** Where each pool that signals for some of its blocks spans the bar, across its two segments. */
function spansOf(
  segments: readonly Segment[],
  standings: readonly PoolStanding[],
  mined: number,
  untagged: string,
): Span[] {
  const starts = new Map<string, number>()
  let at = 0
  for (const s of segments) {
    if (!starts.has(s.name)) starts.set(s.name, at)
    at += s.blocks
  }
  return standings
    .filter((s) => s.row.signalling > 0 && s.row.signalling < s.row.blocks)
    .map((s) => {
      const name = s.row.pool ?? untagged
      return {
        name,
        blocks: s.row.blocks,
        left: (starts.get(name) ?? 0) / mined,
        width: s.row.blocks / mined,
      }
    })
}

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
  const segments = segmentsOf(standings, t`Untagged`)
  const blocker = segments.find((s) => !s.on && s.before === undefined)
  const yes = segments.filter((s) => s.on).reduce((a, s) => a + s.blocks, 0)
  const before = segments.reduce((a, s) => a + (s.before === undefined ? 0 : s.blocks), 0)
  const needed = w.threshold == null ? undefined : w.threshold / d.params.window
  const spans = spansOf(segments, standings, mined, t`Untagged`)
  const say = (s: Segment) =>
    s.on
      ? t`${s.name}: ${pct(s.blocks, mined)}, signalling`
      : s.before !== undefined
        ? t`${s.name}: ${pct(s.blocks, mined)}, not signalling before block ${formatInt(s.before)}`
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
              {t`Radar counts each pool's blocks, not where they fall. A pool reads as now signalling when every block since the window's last one that didn't has signalled and its share says it mined several of them.`}
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
                      : s.before !== undefined
                        ? 'rx-v24-no rx-v24-was'
                        : 'rx-v24-no'
                  }
                  style={{ flexGrow: s.blocks }}
                  title={say(s)}
                  data-pool={s.name}
                  data-blocker={s === blocker || undefined}
                  data-switched={s.before !== undefined || undefined}
                >
                  <span className="rx-v24-seg">
                    <span className="rx-v24-seg__name">{s.name}</span>{' '}
                    <span>{pct(s.blocks, mined)}</span>
                    {s === blocker ? (
                      <span className="rx-v24-seg__not"> · {t`not signalling`}</span>
                    ) : s.before !== undefined ? (
                      <span className="rx-v24-seg__not"> · {t`before it switched`}</span>
                    ) : null}
                  </span>
                </span>
              ))}
            </div>
            {spans.length > 0 ? (
              <div className="rx-v24-spans" aria-hidden="true">
                {spans.map((x) => (
                  <span
                    key={x.name}
                    style={{ left: `${x.left * 100}%`, width: `${x.width * 100}%` }}
                    data-pool-span={x.name}
                  >
                    <span>{t`${x.name} ${pct(x.blocks, mined)} in all`}</span>
                  </span>
                ))}
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
              since block <BlockAt height={trend.since} /> ({formatInt(trend.streak)} blocks, about{' '}
              {ago(trend.streak)} ago) · {signalled} of {blocks} this window
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
  const streak = lastMiss < 0 ? 0 : marks.length - 1 - lastMiss
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
          : t`If every pool keeps signalling as it does now (${share} of blocks), this window ends with about ${ends} of the ${needs} it needs, and no window locks in at that share.`
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
