import { useLingui } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { formatInt } from '@/lib/format'
import { segments, type Concentration, type Share } from './map-model'

export interface ShareBarProps {
  title: string
  c: Concentration
  /** The group's name as the legend shows it. */
  name: (s: Share) => ReactNode
  /** Plain text of the name, for the segment's hover note. */
  plain: (s: Share) => string
  share: (n: number) => string
  /** What the unknown part is ("No location (Tor, I2P)"). */
  unknown: string
  /** Narrows the page to one group; leave out where the page has no filter for it. */
  onPick?: ((s: Share) => void) | undefined
  /** The group the page is narrowed to, if any. */
  picked?: string | undefined
}

/** One stacked bar of the largest groups, with a tick at half, and its legend as the text and the controls. */
export function ShareBar({ title, c, name, plain, share, unknown, onPick, picked }: ShareBarProps) {
  const { t } = useLingui()
  const parts = segments(c)
  const others = c.ranked.length - Math.min(5, c.ranked.length)
  const label = (p: (typeof parts)[number]): string =>
    p.share ? plain(p.share) : p.kind === 'rest' ? t`${formatInt(others)} others` : unknown
  return (
    <div className="rx-sharebar" data-sharebar>
      <h3 className="rx-sharebar__title">{title}</h3>
      <div className="rx-sharebar__track" aria-hidden="true">
        {parts.map((p) => (
          <span
            key={p.share?.key ?? p.kind}
            className="rx-sharebar__seg"
            data-kind={p.kind}
            data-rank={p.kind === 'group' ? p.rank + 1 : undefined}
            title={`${label(p)}: ${formatInt(p.n)} (${share(p.n)})`}
            style={{ width: `${String((p.n / Math.max(1, c.total)) * 100)}%` }}
          />
        ))}
        <i className="rx-sharebar__half" />
      </div>
      <ul className="rx-sharebar__legend">
        {parts.map((p) => {
          const body = (
            <>
              <i
                className="rx-sharebar__dot"
                data-kind={p.kind}
                data-rank={p.kind === 'group' ? p.rank + 1 : undefined}
                aria-hidden="true"
              />
              <span className="rx-sharebar__name">{p.share ? name(p.share) : label(p)}</span>
              <span className="rx-sharebar__pct">{share(p.n)}</span>
            </>
          )
          const s = p.share
          return (
            <li key={s?.key ?? p.kind}>
              {s && onPick ? (
                <button
                  type="button"
                  className="rx-sharebar__item"
                  aria-pressed={picked === s.key}
                  title={t`Show only these: ${formatInt(s.n)}`}
                  onClick={() => {
                    onPick(s)
                  }}
                >
                  {body}
                </button>
              ) : (
                <span className="rx-sharebar__item">{body}</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
