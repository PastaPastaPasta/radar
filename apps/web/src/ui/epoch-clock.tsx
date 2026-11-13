import { t } from '@lingui/core/macro'
import { Trans } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { formatDate, formatDuration, formatInt, formatPercent, formatRelative } from '@/lib/format'
import { cx } from './cx'
import { useNow } from './hooks'

export interface EpochClockProps {
  index: number
  /** Milliseconds since the epoch began. */
  startedAt: number
  blocksSoFar?: number
  expectedEndAt?: number
  /** The end time is a forecast (most are), not a boundary the chain has fixed. */
  estimated: boolean
  size?: 'md' | 'lg'
}

const TICKS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => (n * 100) / 9)

function progressOf(startedAt: number, expectedEndAt: number | undefined, now: number) {
  if (expectedEndAt === undefined || expectedEndAt <= startedAt) return undefined
  return Math.min(1, Math.max(0, (now - startedAt) / (expectedEndAt - startedAt)))
}

/** The epoch signature of RADAR-DESIGN §1.2: a track filling with the epoch's progress and when it ends. */
export function EpochClock({
  index,
  startedAt,
  blocksSoFar,
  expectedEndAt,
  estimated,
  size = 'lg',
}: EpochClockProps) {
  const now = useNow()
  const ratio = progressOf(startedAt, expectedEndAt, now)
  const over = expectedEndAt !== undefined && now >= expectedEndAt
  const epoch = formatInt(index)
  const startedText = formatDate(startedAt, { year: false })
  const percent = ratio === undefined ? '' : formatPercent(ratio, 0)
  const blockCount = blocksSoFar === undefined ? '' : formatInt(blocksSoFar)
  const axis = [
    t`Started ${startedText}`,
    ratio === undefined ? undefined : t`${percent} through`,
    blocksSoFar === undefined ? undefined : t`${blockCount} blocks so far`,
  ]
    .filter(Boolean)
    .join(' · ')

  const left = expectedEndAt === undefined ? '' : formatDuration(expectedEndAt - now)
  const ago = expectedEndAt === undefined ? '' : formatRelative(expectedEndAt, now)
  const endText = formatDate(expectedEndAt ?? 0, { year: false })
  let endLine: string
  let endVisual: ReactNode
  if (expectedEndAt === undefined) {
    endLine = t`End time not known yet`
    endVisual = <span>{endLine}</span>
  } else if (over) {
    endLine = estimated ? t`Expected to end any moment now` : t`Ended ${ago}`
    endVisual = estimated ? (
      <span>
        <b>{t`Any moment now`}</b>
      </span>
    ) : (
      <span>
        <Trans>
          Ended <b>{ago}</b>
        </Trans>
      </span>
    )
  } else {
    endLine = estimated ? t`Ends in about ${left}` : t`Ends in ${left}`
    endVisual = (
      <span>
        {estimated ? (
          <Trans>
            Ends in about <b>{left}</b>
          </Trans>
        ) : (
          <Trans>
            Ends in <b>{left}</b>
          </Trans>
        )}
      </span>
    )
  }
  const summary = [
    t`Epoch ${epoch}`,
    axis,
    endLine,
    expectedEndAt === undefined ? undefined : endText,
    estimated ? t`The end time is an estimate.` : undefined,
  ]
    .filter(Boolean)
    .join('. ')

  return (
    <div
      className={cx('rx-clock', size === 'md' && 'gap-x-4 p-3')}
      data-layer="platform"
      data-size={size}
      data-estimated={estimated ? 'true' : 'false'}
    >
      <div className="rx-clock__n">
        <span className="rx-dim rx-sm">{t`Epoch`}</span>
        <b className={size === 'md' ? 'text-[22px]' : undefined}>{epoch}</b>
      </div>
      <div className="rx-clock__mid">
        <div
          className="rx-clock__track"
          {...(ratio === undefined
            ? { role: 'img', 'aria-label': summary }
            : {
                role: 'meter',
                'aria-label': t`Epoch ${epoch} progress`,
                'aria-valuenow': Math.round(ratio * 100),
                'aria-valuemin': 0,
                'aria-valuemax': 100,
                'aria-valuetext': summary,
              })}
        >
          {ratio === undefined ? null : <i style={{ width: `${(ratio * 100).toFixed(2)}%` }} />}
          {TICKS.map((at) => (
            <s key={at} style={{ left: `${at.toFixed(2)}%` }} />
          ))}
        </div>
        <div className="rx-clock__axis">
          <span>{axis}</span>
        </div>
      </div>
      <div className="rx-clock__end">
        {endVisual}
        {expectedEndAt === undefined ? null : <span>{endText}</span>}
        {estimated && expectedEndAt !== undefined ? (
          <span className="rx-dim">{t`Estimate`}</span>
        ) : null}
      </div>
    </div>
  )
}
