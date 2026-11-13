import { useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import type { SourceStamp } from '@/data/envelope'
import type { RadarActivation, RadarActivationDeployment } from '@/data/radar/schemas'
import { formatInt } from '@/lib/format'
import { Badge, Card, DataTable } from '@/ui'
import { share, when } from './v24-format'
import { isDecided, thresholdRows, type ThresholdRow } from './v24-math'

/** The lock-in threshold of every window, each with the time it starts (an estimate while to come) and its count. */
export function ThresholdsSection({
  doc,
  d,
  stamp,
}: {
  doc: RadarActivation
  d: RadarActivationDeployment
  stamp: SourceStamp
}) {
  const { t } = useLingui()
  const p = d.params
  const rows = useMemo(() => thresholdRows(d, doc.block_seconds), [d, doc.block_seconds])
  const columns = useMemo<ColumnDef<ThresholdRow>[]>(
    () => [
      {
        id: 'window',
        header: t`Window`,
        cell: ({ row: { original: r } }) => (
          <>
            #{r.attempt + 1}
            {r.now ? (
              <>
                {' '}
                <Badge tone="info" size="sm">
                  {t`now`}
                </Badge>
              </>
            ) : null}
          </>
        ),
        meta: { phone: 'title' },
      },
      {
        id: 'from',
        header: t`From block`,
        cell: ({ row: { original: r } }) =>
          r.startHeight === undefined ? '–' : formatInt(r.startHeight),
        meta: { numeric: true, phone: 'secondary' },
      },
      {
        id: 'starts',
        header: t`Starts`,
        cell: ({ row: { original: r } }) =>
          r.startTime === undefined
            ? '–'
            : `${r.estimated ? `${t`about`} ` : ''}${when(r.startTime)}`,
        meta: { phone: 'secondary' },
      },
      {
        id: 'threshold',
        header: t`Threshold`,
        cell: ({ row: { original: r } }) => t`${formatInt(r.threshold)} of ${formatInt(p.window)}`,
        meta: { align: 'end', numeric: true, phone: 'primary' },
      },
      {
        id: 'share',
        header: t`Share`,
        cell: ({ row: { original: r } }) => share(r.threshold, p.window),
        meta: { align: 'end', numeric: true, phone: 'secondary' },
      },
      {
        id: 'signalled',
        header: t`Signalled`,
        cell: ({ row: { original: r } }) =>
          r.count === undefined
            ? '–'
            : `${formatInt(r.count)}${r.mined !== undefined && r.mined < p.window ? ` ${t`of ${formatInt(r.mined)} so far`}` : ''}`,
        meta: { align: 'end', numeric: true, phone: 'secondary' },
      },
    ],
    [t, p.window],
  )
  return (
    <Card
      title={t`Thresholds by window`}
      id="thresholds"
      layer="network"
      subtitle={t`The threshold starts at ${formatInt(p.threshold_start)} of ${formatInt(p.window)} blocks and drops after each window that misses it: ${formatInt(p.threshold_start)} − attempt² × ${formatInt(p.window)} ÷ 100 ÷ ${String(p.falloff_coeff)}, rounded down at each step, never below ${formatInt(p.threshold_min)}.${isDecided(d) ? '' : ` ${t`Dates of windows to come are estimates.`}`}`}
      source={stamp}
      padding="flush"
    >
      <DataTable
        caption={t`Lock-in threshold of each window`}
        columns={columns}
        rows={rows}
        getRowId={(r) => String(r.attempt)}
        state="ready"
      />
    </Card>
  )
}
