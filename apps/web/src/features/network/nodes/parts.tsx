import { useLingui } from '@lingui/react/macro'
import { Link, type LinkProps } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { formatInt, formatPercent } from '@/lib/format'
import { swatchOf, useCensusColors } from './census-colors'
import { fraction, isTiny } from './census-math'

interface FigureProps {
  label: ReactNode
  value: ReactNode
  note?: ReactNode
  tone?: 'good' | 'warn' | 'bad'
}

const figureClass = (tone: FigureProps['tone']) => `rx-stat${tone ? ` rx-stat--${tone}` : ''}`

function FigureBody({ label, value, note }: Omit<FigureProps, 'tone'>) {
  return (
    <>
      <span className="rx-stat__label">{label}</span>
      <span className="rx-stat__value">{value}</span>
      {note ? <span className="rx-stat__note">{note}</span> : null}
    </>
  )
}

/** A figure that opens the list or section it counts. It is the `Stat`'s markup around a router link. */
export function FigureLink({
  label,
  value,
  note,
  tone,
  ...link
}: FigureProps & Pick<LinkProps, 'to' | 'search' | 'hash'>) {
  return (
    <Link {...link} className={figureClass(tone)} data-tone={tone ?? 'neutral'}>
      <FigureBody label={label} value={value} note={note} />
    </Link>
  )
}

/** A figure that is not a link. */
export function Figure({ tone, ...body }: FigureProps) {
  return (
    <div className={figureClass(tone)} data-tone={tone ?? 'neutral'}>
      <FigureBody {...body} />
    </div>
  )
}

/** A grid of figures: two a row on a phone, `columns` from 640 px; `tight` keeps three a row on a phone too. */
export function FigureGrid({
  children,
  columns = 3,
  tight = false,
}: {
  children: ReactNode
  columns?: 3 | 4
  tight?: boolean
}) {
  const wide = columns === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'
  const cols = tight ? 'grid-cols-3' : `grid-cols-2 ${wide}`
  return <div className={`rx-statgrid grid gap-2 sm:gap-4 ${cols}`}>{children}</div>
}

/** A table wider than a phone scrolls sideways, so the scroll area takes focus and arrow keys reach what is cut off. */
export function ScrollRegion({
  label,
  children,
  ...rest
}: { label: string; children: ReactNode } & Record<`data-${string}`, boolean | undefined>) {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard users scroll the table by focusing it
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={label} {...rest}>
      {children}
    </div>
  )
}

/** One notice line: a warning (a stale crawl) or a plain note. */
export function Notice({
  children,
  tone = 'note',
  ...rest
}: {
  children: ReactNode
  tone?: 'warn' | 'note'
} & Record<`data-${string}`, string | undefined>) {
  return (
    <p
      role="status"
      className={`rx-note border-l-2 py-0.5 pl-3 [&_a]:underline ${
        tone === 'warn' ? 'border-[var(--dh-warn)]' : 'border-[var(--dh-line-2)]'
      }`}
      {...rest}
    >
      {children}
    </p>
  )
}

/** "<0.1%" rather than "0.0%" when a few nodes run something. */
export function useShareText(): (n: number, sum: number) => string {
  const { t } = useLingui()
  return (n, sum) => (isTiny(n, sum) ? t`<0.1%` : formatPercent(fraction(n, sum), 1))
}

export interface RankedRow {
  key: string
  label: ReactNode
  n: number
  color: string
  title?: string
}

/** Ranked rows with a share bar each, dotted with the colour of their segment in the bar above; the rest behind "Show all". */
export function Ranked({
  rows,
  limit = 8,
  count = rows.length,
  sum,
  empty,
}: {
  rows: readonly RankedRow[]
  limit?: number
  /** What "Show all" says it reveals: the named groups, when a row for "Unknown" comes besides them. */
  count?: number
  sum: number
  empty: ReactNode
}) {
  const { t } = useLingui()
  const share = useShareText()
  const colors = useCensusColors()
  const [all, setAll] = useState(false)
  const shown = all ? rows : rows.slice(0, limit)
  const max = Math.max(1, ...shown.map((r) => r.n))
  if (rows.length === 0) return <p className="text-sm text-[var(--dh-ink-2)]">{empty}</p>
  return (
    <div className="grid gap-2" data-ranked>
      <ol className="grid gap-1.5">
        {shown.map((r) => (
          <li
            key={r.key}
            title={r.title}
            className="grid grid-cols-[10px_minmax(0,1fr)_auto_auto] items-center gap-x-2 text-sm"
          >
            <i
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: swatchOf(colors, r.color) }}
            />
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="tabular-nums">{formatInt(r.n)}</span>
            <span className="w-14 text-right tabular-nums text-[var(--dh-ink-2)]">
              {share(r.n, sum)}
            </span>
            <span
              aria-hidden="true"
              className="col-span-4 -mt-0.5 h-1 rounded bg-[var(--dh-line)]"
              style={{ gridColumn: '2 / -1' }}
            >
              <span
                className="block h-1 rounded"
                style={{
                  width: `${String((r.n / max) * 100)}%`,
                  background: swatchOf(colors, r.color),
                }}
              />
            </span>
          </li>
        ))}
      </ol>
      {rows.length > limit ? (
        <button
          type="button"
          className="dh-btn dh-btn--link dh-btn--sm justify-self-start"
          aria-expanded={all}
          onClick={() => {
            setAll((v) => !v)
          }}
        >
          {all ? t`Show fewer` : t`Show all ${formatInt(count)}`}
        </button>
      ) : null}
    </div>
  )
}
