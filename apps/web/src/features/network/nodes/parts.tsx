import { useLingui } from '@lingui/react/macro'
import { Link, type LinkProps } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { formatInt, formatPercent } from '@/lib/format'
import { Chart } from '@/ui'

import { donutOption, type Slice } from './census-charts'
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

export function FigureGrid({
  children,
  columns = 3,
}: {
  children: ReactNode
  columns?: 2 | 3 | 4 | 6
}) {
  const cols = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
    6: 'sm:grid-cols-3 lg:grid-cols-6',
  }[columns]
  return <div className={`rx-statgrid grid grid-cols-2 gap-2 sm:gap-4 ${cols}`}>{children}</div>
}

/** One notice line: a warning (a stale crawl) or a plain note. */
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
      className={`rx-note rounded border p-3 [&_a]:underline max-sm:px-2.5 max-sm:py-2 ${
        tone === 'warn' ? 'border-[var(--dh-warn,#b45309)]' : 'border-[var(--dh-line)]'
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

/** A donut with a value and a caption in its hole, the same slices as the table equivalent. */
export function Donut({
  slices,
  label,
  center,
  surface,
  height = 180,
}: {
  slices: readonly Slice[]
  label: string
  center?: { value: string; caption: string } | undefined
  surface: string
  height?: number
}) {
  const { t } = useLingui()
  const sum = slices.reduce((a, s) => a + s.value, 0)
  return (
    <div className="relative" data-donut>
      <Chart
        option={donutOption(slices, surface)}
        height={height}
        label={label}
        table={{
          columns: [t`Name`, t`Nodes`, t`Share`],
          rows: slices.map((s) => [
            s.name,
            formatInt(s.value),
            formatPercent(fraction(s.value, sum), 1),
          ]),
        }}
      />
      {center ? (
        <div
          className="pointer-events-none absolute inset-x-0 grid place-items-center text-center"
          style={{ top: 0, height: height - 8 }}
          aria-hidden="true"
        >
          <div>
            <div className="text-xl font-semibold tabular-nums">{center.value}</div>
            <div className="text-xs text-[var(--dh-ink-2)]">{center.caption}</div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export interface RankedRow {
  key: string
  label: ReactNode
  n: number
  color: string
  title?: string
}

/** Ranked rows with a share bar each, dotted with the colour of their donut slice; the rest behind "Show all". */
export function Ranked({
  rows,
  limit = 8,
  sum,
  empty,
}: {
  rows: readonly RankedRow[]
  limit?: number
  sum: number
  empty: ReactNode
}) {
  const { t } = useLingui()
  const share = useShareText()
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
              style={{ background: r.color }}
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
                style={{ width: `${String((r.n / max) * 100)}%`, background: r.color }}
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
          {all ? t`Show fewer` : t`Show all ${formatInt(rows.length)}`}
        </button>
      ) : null}
    </div>
  )
}

/** A 100 % bar of the largest groups with the legend that names them. */
export function ShareBar({
  parts,
  label,
}: {
  parts: readonly { key: string; name: string; n: number; color: string }[]
  label: string
}) {
  const share = useShareText()
  const sum = parts.reduce((a, p) => a + p.n, 0)
  if (sum === 0) return null
  return (
    <div className="grid gap-2" data-sharebar>
      <div
        role="img"
        aria-label={`${label}: ${parts.map((p) => `${p.name} ${share(p.n, sum)}`).join(', ')}`}
        className="flex h-3 overflow-hidden rounded bg-[var(--dh-line)]"
      >
        {parts.map((p) => (
          <div
            key={p.key}
            title={`${p.name}: ${formatInt(p.n)} (${share(p.n, sum)})`}
            style={{ flexGrow: p.n, background: p.color }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {parts.map((p) => (
          <li key={p.key} className="inline-flex min-w-0 items-center gap-1.5">
            <i
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: p.color }}
            />
            <span className="min-w-0 [overflow-wrap:anywhere]">{p.name}</span>
            <b className="tabular-nums">{share(p.n, sum)}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}
