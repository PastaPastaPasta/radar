import { useLingui } from '@lingui/react/macro'
import type { SourceStamp } from '@/data/envelope'
import { Card, Empty } from '@/ui'
import { dayTone, type DayTone, type UptimeDay } from './mn-info'

const TONE_CLASS: Record<DayTone, string | undefined> = {
  good: undefined,
  warn: 'w',
  bad: 'b',
  none: 'n',
}

export function UptimeStrip({ daily, label }: { daily: readonly UptimeDay[]; label: string }) {
  const { t } = useLingui()
  return (
    <div className="rx-up rx-up--lg" role="img" aria-label={label} data-uptime-strip>
      {daily.map((d) => {
        const tone = dayTone(d)
        return (
          <i
            key={d.day}
            className={TONE_CLASS[tone]}
            data-tone={tone}
            title={d.attempts > 0 ? t`${d.day}: answered ${d.ok} of ${d.attempts} checks` : d.day}
          />
        )
      })}
    </div>
  )
}

export function UptimeCard({ daily, stamp }: { daily: readonly UptimeDay[]; stamp: SourceStamp }) {
  const { t } = useLingui()
  const missed = daily.filter((d) => d.attempts > 0 && d.ok < d.attempts)
  const first = daily[0]
  const last = daily[daily.length - 1]
  const label =
    missed.length === 0
      ? t`Answered every check on each of the ${daily.length} days Radar has checked this node`
      : t`Missed some checks on ${missed.length} of ${daily.length} days`
  const legend = [
    { color: 'good', text: t`Answered every check` },
    { color: 'warn', text: t`Missed some` },
    { color: 'bad', text: t`Missed most` },
  ]
  return (
    <Card title={t`Uptime`} layer="network" source={stamp} id="uptime">
      {first && last ? (
        <>
          <UptimeStrip daily={daily} label={label} />
          <div className="rx-axis">
            <span>{first.day}</span>
            <span>{t`${daily.length} days checked`}</span>
            <span>{last.day}</span>
          </div>
          <ul className="rx-legend">
            {legend.map(({ color, text }) => (
              <li key={color}>
                <span
                  className="rx-sw"
                  style={{ '--c': `var(--dh-${color})` } as React.CSSProperties}
                />
                {text}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Empty kind="none-yet" title={t`Radar has no uptime checks for this node yet.`} />
      )}
    </Card>
  )
}
