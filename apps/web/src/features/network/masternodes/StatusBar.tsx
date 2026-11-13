import { useLingui } from '@lingui/react/macro'
import { useMemo } from 'react'
import type { MnRow } from '@/data/masternodes/rows'
import { formatInt } from '@/lib/format'

interface Segment {
  id: string
  label: string
  count: number
  colour: string
}

/** How much of the list is healthy (RADAR-DESIGN §1.2): one stacked bar and its legend, over all rows whatever the filter. */
export function StatusBar({ rows }: { rows: readonly MnRow[] }) {
  const { t } = useLingui()
  const segments = useMemo<Segment[]>(() => {
    const crawled = rows.some((r) => r.crawl)
    let answering = 0
    let silent = 0
    let enabled = 0
    let banned = 0
    for (const r of rows) {
      if (r.status === 'pose-banned') banned++
      else if (!crawled) enabled++
      else if (r.crawl?.reachable === true) answering++
      else if (r.crawl?.reachable === false) silent++
      else enabled++
    }
    const all: Segment[] = [
      { id: 'answering', label: t`Enabled, answering`, count: answering, colour: 'var(--dh-good)' },
      { id: 'silent', label: t`Enabled, no answer`, count: silent, colour: 'var(--dh-warn)' },
      {
        id: 'enabled',
        label: crawled ? t`Enabled, not crawled` : t`Enabled`,
        count: enabled,
        colour: crawled ? 'var(--dh-ink-3)' : 'var(--dh-good)',
      },
      { id: 'banned', label: t`PoSe-banned`, count: banned, colour: 'var(--dh-bad)' },
    ]
    return all.filter((s) => s.count > 0)
  }, [rows, t])
  const summary = segments.map((s) => `${formatInt(s.count)} ${s.label.toLowerCase()}`).join(', ')
  return (
    <div data-status-bar className="grid gap-2">
      <div className="rx-stack" style={{ height: 16 }} role="img" aria-label={summary}>
        {segments.map((s) => (
          <i key={s.id} style={{ flex: s.count, background: s.colour, minWidth: 4 }} />
        ))}
      </div>
      <ul className="rx-legend">
        {segments.map((s) => (
          <li key={s.id}>
            <span className="rx-sw" style={{ ['--c' as string]: s.colour }} />
            {s.label} <b>{formatInt(s.count)}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}
