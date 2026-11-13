import { useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, type ReactNode } from 'react'
import type { SourceStamp } from '@/data/envelope'
import type { PeBlockSummary } from '@/data/pe/schemas'
import { formatInt } from '@/lib/format'
import { DataTable, Hash, Time, type DataTableProps, type LoadState } from '@/ui'
import { Entity } from '../Entity'

export type PlatformBlockColumn =
  'height' | 'hash' | 'epoch' | 'proposer' | 'gas' | 'transitions' | 'time'

export const PLATFORM_BLOCK_COLUMNS: readonly PlatformBlockColumn[] = [
  'height',
  'hash',
  'epoch',
  'proposer',
  'gas',
  'transitions',
  'time',
]

export interface PlatformBlockTableProps {
  rows: PeBlockSummary[]
  state: LoadState
  error?: unknown
  onRetry?: () => void
  paging?: DataTableProps<PeBlockSummary>['paging']
  /**
   * Which columns to draw, in this order. The epoch column is left out unless `epochOf` is given, because a block's
   * header does not carry its epoch.
   */
  columns?: readonly PlatformBlockColumn[]
  /** The epoch a block belongs to, from the epoch list the caller holds. */
  epochOf?: (row: PeBlockSummary) => number | undefined
  caption?: string
  empty?: ReactNode
  source?: SourceStamp | SourceStamp[]
}

/** Platform Explorer's blocks as a table, and as cards on a phone; each row opens the block's page. */
export function PlatformBlockTable({
  rows,
  state,
  error,
  onRetry,
  paging,
  columns = PLATFORM_BLOCK_COLUMNS,
  epochOf,
  caption,
  empty,
  source,
}: PlatformBlockTableProps) {
  const { t } = useLingui()
  const columnDefs = useMemo(() => {
    const defs: Record<PlatformBlockColumn, ColumnDef<PeBlockSummary>> = {
      height: {
        id: 'height',
        header: t`Block`,
        cell: ({ row }) => <Entity kind="platform-block" id={String(row.original.header.height)} />,
        meta: { phone: 'title' },
      },
      hash: {
        id: 'hash',
        header: t`Hash`,
        cell: ({ row }) => <Hash value={row.original.header.hash} />,
        meta: { phone: 'secondary' },
      },
      epoch: {
        id: 'epoch',
        header: t`Epoch`,
        cell: ({ row }) => {
          const n = epochOf?.(row.original)
          return n === undefined ? '—' : <Entity kind="epoch" id={String(n)} />
        },
      },
      proposer: {
        id: 'proposer',
        header: t`Proposer`,
        cell: ({ row }) => <Entity kind="evonode" id={row.original.header.validator} />,
      },
      gas: {
        id: 'gas',
        header: t`Gas`,
        cell: ({ row }) =>
          row.original.header.totalGasUsed == null
            ? '—'
            : formatInt(row.original.header.totalGasUsed),
        meta: { numeric: true },
      },
      transitions: {
        id: 'transitions',
        header: t`Transitions`,
        accessorFn: (r) => formatInt(r.txs.length),
        meta: { numeric: true, phone: 'secondary' },
      },
      time: {
        id: 'time',
        header: t`Time`,
        cell: ({ row }) => <Time ms={row.original.header.timestamp} mode="relative" live />,
        meta: { phone: 'primary' },
      },
    }
    return columns.filter((c) => c !== 'epoch' || epochOf !== undefined).map((c) => defs[c])
  }, [t, columns, epochOf])
  return (
    <DataTable
      caption={caption ?? t`Platform blocks`}
      columns={columnDefs}
      rows={rows}
      getRowId={(r) => String(r.header.height)}
      state={state}
      error={error}
      onRetry={onRetry}
      paging={paging}
      empty={empty}
      source={source}
      rowLink={(r) => ({ to: '/platform/block/$id', params: { id: String(r.header.height) } })}
    />
  )
}
