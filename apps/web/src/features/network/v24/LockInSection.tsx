import { useLingui } from '@lingui/react/macro'
import type { SourceStamp } from '@/data/envelope'
import type { RadarActivation, RadarActivationDeployment } from '@/data/radar/schemas'
import { formatInt, formatNumber, formatPercent } from '@/lib/format'
import { Card } from '@/ui'
import { Figure, FigureGrid } from '../nodes/parts'
import { day, when } from './v24-format'
import {
  estimateMs,
  locksIn,
  projectLockIn,
  rateOf,
  silentPools,
  todaysPace,
  windowOutlook,
  type Pace,
} from './v24-math'

const pct = (n: number, of: number) => formatPercent(of > 0 ? n / of : 0, 1)

/** Whether the window being counted can still lock in, and which window does at today's pace. */
export function LockInSection({
  doc,
  d,
  stamp,
}: {
  doc: RadarActivation
  d: RadarActivationDeployment
  stamp: SourceStamp
}) {
  const { t } = useLingui()
  const pace = todaysPace(d)
  const w = pace ? windowOutlook(d, rateOf(pace)) : undefined
  if (!pace || !w) return null
  const p = d.params
  const rate = rateOf(pace)
  const attempt = (d.window?.attempt ?? 0) + 1
  const next = d.schedule[Math.min(attempt, d.schedule.length - 1)]?.threshold ?? p.threshold_min
  const at = (height: number) => day(estimateMs(doc, height))

  const verdict = {
    reached: t`Yes. This window has ${formatInt(w.count)} signalling blocks, at least its threshold of ${formatInt(w.threshold)}, so Core 24 locks in at block ${formatInt(w.endHeight + 1)}.`,
    'on-track': t`Yes, at this pace. It needs ${formatInt(w.needed)} more signalling blocks in the ${formatInt(w.remaining)} left, and at ${formatPercent(rate, 1)} it ends with about ${formatInt(w.projected)} of the ${formatInt(w.threshold)} it needs.`,
    'needs-more': t`Not at this pace. It needs ${formatInt(w.needed)} more signalling blocks in the ${formatInt(w.remaining)} left, ${pct(w.needed, w.remaining)} of them. At ${formatPercent(rate, 1)} it ends with about ${formatInt(w.projected)} of the ${formatInt(w.threshold)} it needs.`,
    impossible: t`No. It needs ${formatInt(w.needed)} more signalling blocks and only ${formatInt(w.remaining)} are left. The next chance is the next window, at a threshold of ${formatInt(next)} of ${formatInt(p.window)}.`,
  }[w.verdict]
  const good = w.verdict === 'reached' || w.verdict === 'on-track'

  return (
    <Card
      level="section"
      title={t`Can this window lock in?`}
      id="lock-in"
      layer="network"
      subtitle={verdict}
      source={stamp}
    >
      <div className="grid gap-5" data-v24-lock-in data-verdict={w.verdict}>
        <FigureGrid columns={4}>
          <Figure
            label={t`Signalling so far`}
            value={w.mined > 0 ? pct(w.count, w.mined) : '–'}
            note={
              w.mined > 0
                ? t`${formatInt(w.count)} of ${formatInt(w.mined)} blocks`
                : t`no blocks in this window yet`
            }
          />
          <Figure
            label={t`Blocks left`}
            value={formatInt(w.remaining)}
            note={t`to block ${formatInt(w.endHeight)}, about ${at(w.endHeight)}`}
          />
          <Figure
            label={t`Threshold`}
            value={formatInt(w.threshold)}
            note={t`of ${formatInt(p.window)} (${pct(w.threshold, p.window)}), window #${String(attempt)}`}
          />
          <Figure
            label={t`Needed from the rest`}
            value={w.needed > w.remaining ? t`out of reach` : pct(w.needed, w.remaining)}
            tone={good ? 'good' : 'warn'}
            note={t`${formatInt(w.needed)} of the ${formatInt(w.remaining)} left`}
          />
        </FigureGrid>
        <Projection doc={doc} d={d} pace={pace} at={at} />
      </div>
    </Card>
  )
}

function Projection({
  doc,
  d,
  pace,
  at,
}: {
  doc: RadarActivation
  d: RadarActivationDeployment
  pace: Pace
  at: (height: number) => string
}) {
  const { t } = useLingui()
  const p = d.params
  const rate = rateOf(pace)
  const projection = projectLockIn(doc, d, rate)
  if (projection === undefined) return null
  const basis =
    pace.basis === 'window'
      ? t`Today's pace is this window's so far: ${formatInt(pace.signalled)} of ${formatInt(pace.blocks)} blocks signalled (${formatPercent(rate, 1)}).`
      : t`Today's pace is the last ${formatInt(pace.blocks)} blocks': ${formatInt(pace.signalled)} signalled (${formatPercent(rate, 1)}).`
  const floor = p.threshold_min / p.window
  const gap = Math.max(0.1, Math.ceil((floor - rate) * 1000) / 10)
  const outcome = locksIn(projection)
    ? t`At that pace window #${String(projection.attempt + 1)} (blocks ${formatInt(projection.start)}–${formatInt(projection.end)}, threshold ${formatInt(projection.threshold)} of ${formatInt(p.window)}) is the first to lock in, about ${at(projection.end)}. Core 24 would then activate at block ${formatInt(projection.activation)}, about ${at(projection.activation)}.`
    : projection.never === 'timeout'
      ? t`At that pace no window locks in before the timeout, ${when(p.timeout)}.`
      : t`At that pace no window locks in: even the lowest threshold, ${formatInt(p.threshold_min)} of ${formatInt(p.window)} blocks (${formatPercent(floor, 1)}), is above it. Signalling has to rise by about ${formatNumber(gap, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} percentage points.`
  const silent = silentPools(d.window?.pools ?? [])
  const mined = d.window?.mined ?? 0
  return (
    <div
      className="grid gap-2"
      data-v24-projection
      data-lock-in={locksIn(projection) ? projection.attempt : projection.never}
    >
      <h4 className="font-semibold">{t`At today's pace`}</h4>
      <p>
        {basis} {outcome}
      </p>
      {silent.length > 0 && mined > 0 ? (
        <p data-v24-silent>
          {silent
            .map(
              (x) =>
                t`Blocks tagged ${x.pool ?? ''}: ${formatInt(x.blocks)} of this window's ${formatInt(mined)} (${pct(x.blocks, mined)}), none of them signalling.`,
            )
            .join(' ')}
        </p>
      ) : null}
      <p className="text-sm text-[var(--dh-ink-2)]">
        {t`An estimate: the share moves as pools switch, and dates assume ${String(Math.round(doc.block_seconds))} s a block.`}
      </p>
    </div>
  )
}
