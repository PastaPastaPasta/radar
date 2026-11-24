import { useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import type { SourceStamp } from '@/data/envelope'
import type { RadarActivationDeployment } from '@/data/radar/schemas'
import { formatInt } from '@/lib/format'
import { Badge, Card, DataTable } from '@/ui'
import { share } from './v24-format'
import type { PoolRow } from './v24-math'

/** Which pools' blocks in the window signal, by the tag in each coinbase. Shown only while the window counts. */
export function PoolsSection({ d, stamp }: { d: RadarActivationDeployment; stamp: SourceStamp }) {
  const { t } = useLingui()
  const w = d.window
  const pools = d.state === 'started' ? w?.pools : undefined
  const mined = w?.mined ?? 0
  const columns = useMemo<ColumnDef<PoolRow>[]>(
    () => [
      {
        id: 'pool',
        header: t`Pool`,
        cell: ({ row: { original: r } }) => r.pool ?? t`Untagged`,
        meta: { phone: 'title' },
      },
      {
        id: 'blocks',
        header: t`Blocks`,
        cell: ({ row: { original: r } }) => (
          <>
            <b>{formatInt(r.blocks)}</b>{' '}
            <small className="text-[var(--dh-ink-2)]">{share(r.blocks, mined)}</small>
          </>
        ),
        meta: { align: 'end', numeric: true, phone: 'primary' },
      },
      {
        id: 'signalled',
        header: t`Signalled`,
        cell: ({ row: { original: r } }) => t`${formatInt(r.signalling)} of ${formatInt(r.blocks)}`,
        meta: { align: 'end', numeric: true, phone: 'secondary' },
      },
      {
        id: 'status',
        header: t`Signalling`,
        cell: ({ row: { original: r } }) =>
          r.signalling === r.blocks ? (
            <Badge tone="success" size="sm">{t`yes`}</Badge>
          ) : r.signalling === 0 ? (
            <Badge tone="warning" size="sm">{t`no`}</Badge>
          ) : (
            <Badge size="sm">{t`partly`}</Badge>
          ),
        meta: { phone: 'secondary' },
      },
    ],
    [t, mined],
  )
  if (!w || !pools || pools.length === 0) return null
  return (
    <Card
      level="section"
      title={t`Pools signalling`}
      id="pools"
      layer="network"
      subtitle={t`Who mined this window's ${formatInt(mined)} blocks and how many of them signalled. Best effort: we go by the tag in each block's coinbase, which is whatever the miner wrote, and some blocks carry none.`}
      source={stamp}
    >
      <DataTable
        caption={t`Blocks and signalling blocks per pool this window`}
        columns={columns}
        rows={pools}
        getRowId={(r) => r.pool ?? ''}
        state="ready"
      />
    </Card>
  )
}
