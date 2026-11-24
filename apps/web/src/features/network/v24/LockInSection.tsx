import { useLingui } from '@lingui/react/macro'
import type { SourceStamp } from '@/data/envelope'
import type { RadarActivation, RadarActivationDeployment } from '@/data/radar/schemas'
import { formatInt, formatNumber, formatPercent } from '@/lib/format'
import { Card } from '@/ui'
import { Figure, FigureGrid } from '../nodes/parts'
import { InfoTip } from './InfoTip'
import { day, pinAt, when } from './v24-format'
import {
  estimateMs,
  locksIn,
  projectLockIn,
  rateOf,
  todaysPace,
  windowOutlook,
  type Pace,
  type Verdict,
  type WindowOutlook,
} from './v24-math'

const pct = (n: number, of: number) => formatPercent(of > 0 ? n / of : 0, 1)

const VERDICT_TONE: Record<Verdict, 'good' | 'warn' | 'bad'> = {
  reached: 'good',
  'on-track': 'good',
  'needs-more': 'warn',
  impossible: 'bad',
}

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
  if (!pace) return null
  const rate = rateOf(pace)
  const w = windowOutlook(d, rate)
  if (!w) return null
  const p = d.params
  const at = (height: number) => day(estimateMs(doc, height))

  const chip = {
    reached: t`Threshold reached`,
    'on-track': t`On pace`,
    'needs-more': t`Not on pace`,
    impossible: t`Out of reach`,
  }[w.verdict]
  const line = {
    reached: t`Core 24 locks in at block ${formatInt(w.endHeight + 1)}.`,
    'on-track': t`Needs ${pct(w.needed, w.remaining)} of the blocks left; signalling runs at ${formatPercent(rate, 1)}.`,
    'needs-more': t`Needs ${pct(w.needed, w.remaining)} of the blocks left; signalling runs at ${formatPercent(rate, 1)}.`,
    impossible: t`Needs ${formatInt(w.needed)} more signalling blocks; only ${formatInt(w.remaining)} are left.`,
  }[w.verdict]
  const tone = VERDICT_TONE[w.verdict]

  return (
    <Card
      level="section"
      title={t`Can this window lock in?`}
      id="lock-in"
      layer="network"
      source={stamp}
    >
      <div className="grid gap-5" data-v24-lock-in data-verdict={w.verdict}>
        <p className="rx-v24-answer">
          <span className={`dh-pill dh-pill--dot dh-pill--${tone} rx-v24-verdict`}>{chip}</span>
          <span>{line}</span>
        </p>
        <WindowBar w={w} size={p.window} />
        <FigureGrid columns={4}>
          <Figure
            label={t`Signalling`}
            value={w.mined > 0 ? pct(w.count, w.mined) : '–'}
            note={w.mined > 0 ? t`${formatInt(w.count)} of ${formatInt(w.mined)}` : undefined}
          />
          <Figure
            label={t`Blocks left`}
            value={formatInt(w.remaining)}
            note={t`ends about ${at(w.endHeight)}`}
          />
          <Figure
            label={t`Needed`}
            value={formatInt(w.threshold)}
            note={t`${pct(w.threshold, p.window)} of ${formatInt(p.window)}`}
          />
          <Figure
            label={t`Needed from the rest`}
            value={w.needed > w.remaining ? t`out of reach` : pct(w.needed, w.remaining)}
            tone={tone}
            note={t`${formatInt(w.needed)} of ${formatInt(w.remaining)}`}
          />
        </FigureGrid>
        <Projection doc={doc} d={d} pace={pace} at={at} />
      </div>
    </Card>
  )
}

/**
 * The window as one bar of its blocks: those that signalled fill from the left, those that didn't from the right, and
 * the blocks still to come split between them at today's pace. The threshold is a marker; it locks in when green
 * reaches it.
 */
function WindowBar({ w, size }: { w: WindowOutlook; size: number }) {
  const { t } = useLingui()
  const x = (n: number) => `${(Math.min(size, Math.max(0, n)) / size) * 100}%`
  const lost = w.mined - w.count
  const projected = Math.max(w.count, Math.min(w.projected, size - lost))
  return (
    <figure className="rx-v24-wbar" data-v24-window-bar>
      <div
        className={`rx-v24-bar${w.remaining > 0 ? ' rx-v24-bar--paced' : ''}`}
        role="img"
        aria-label={t`This window's ${formatInt(size)} blocks: ${formatInt(w.count)} signalled, ${formatInt(lost)} did not and ${formatInt(w.remaining)} are left. ${formatInt(w.threshold)} must signal; at today's pace about ${formatInt(projected)} do.`}
      >
        <span className="rx-v24-bar__mlabel" style={pinAt(w.threshold / size)} aria-hidden="true">
          {t`${formatInt(w.threshold)} needed`}
        </span>
        <div className="rx-v24-bar__track" aria-hidden="true">
          <i className="rx-v24-yes" style={{ left: 0, width: x(w.count) }} />
          <i
            className="rx-v24-yes rx-v24-pace"
            style={{ left: x(w.count), width: x(projected - w.count) }}
          />
          <i
            className="rx-v24-no rx-v24-pace"
            style={{ left: x(projected), width: x(size - lost - projected) }}
          />
          <i className="rx-v24-no" style={{ right: 0, width: x(lost) }} />
        </div>
        <b className="rx-v24-bar__mark" style={{ left: x(w.threshold) }} aria-hidden="true" />
        {w.remaining > 0 ? (
          <>
            <b className="rx-v24-bar__pace" style={{ left: x(projected) }} aria-hidden="true" />
            <span className="rx-v24-bar__plabel" style={pinAt(projected / size)} aria-hidden="true">
              {t`about ${formatInt(projected)} at today's pace`}
            </span>
          </>
        ) : null}
      </div>
      <ul className="rx-legend" aria-hidden="true">
        <li>
          <span className="rx-sw rx-v24-yes" />
          {t`Signalled`} <b>{formatInt(w.count)}</b>
        </li>
        <li>
          <span className="rx-sw rx-v24-no" />
          {t`Not signalled`} <b>{formatInt(lost)}</b>
        </li>
        <li>
          <span className="rx-sw rx-v24-sw-pace" />
          {t`Left, at today's pace`} <b>{formatInt(w.remaining)}</b>
        </li>
      </ul>
    </figure>
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
  const gap = Math.max(0.1, Math.round((floor - rate) * 1000) / 10)
  const lock = locksIn(projection)
  const short = lock
    ? t`At today's pace window #${String(projection.attempt + 1)} locks in, about ${at(projection.end)}.`
    : projection.never === 'timeout'
      ? t`At today's pace no window locks in before the timeout.`
      : t`At today's pace no window locks in: even the lowest threshold is ${formatPercent(floor, 1)}.`
  const outcome = lock
    ? t`At that pace window #${String(projection.attempt + 1)} (blocks ${formatInt(projection.start)}–${formatInt(projection.end)}, threshold ${formatInt(projection.threshold)} of ${formatInt(p.window)}) is the first to lock in, about ${at(projection.end)}. Core 24 would then activate at block ${formatInt(projection.activation)}, about ${at(projection.activation)}.`
    : projection.never === 'timeout'
      ? t`At that pace no window locks in before the timeout, ${when(p.timeout)}.`
      : t`At that pace no window locks in: even the lowest threshold, ${formatInt(p.threshold_min)} of ${formatInt(p.window)} blocks (${formatPercent(floor, 1)}), is above it. Signalling has to rise by about ${formatNumber(gap, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} percentage points.`
  return (
    <p
      className="rx-v24-pace-line"
      data-v24-projection
      data-lock-in={lock ? projection.attempt : projection.never}
    >
      <span>{short}</span>{' '}
      <InfoTip label={t`How the outlook is worked out`}>
        <p className="m-0">
          {basis} {outcome}
        </p>
        <p className="m-0 mt-2 text-[var(--dh-ink-2)]">
          {t`An estimate: the share moves as pools switch, and dates assume ${String(Math.round(doc.block_seconds))} s a block.`}
        </p>
      </InfoTip>
    </p>
  )
}
