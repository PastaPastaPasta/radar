import { useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, type ReactNode } from 'react'
import type { SourceStamp } from '@/data/envelope'
import type { PeTransaction } from '@/data/pe/schemas'
import { formatInt } from '@/lib/format'
import { Badge, DataTable, Time, TypeBadge, type DataTableProps, type LoadState } from '@/ui'
import { Entity } from '../Entity'
import { IdentityRef } from './IdentityRef'
import { humanizeType, transitionBadgeType } from './transition-type'

export type TransitionColumn = 'type' | 'hash' | 'status' | 'block' | 'gas' | 'owner' | 'time'

export const TRANSITION_COLUMNS: readonly TransitionColumn[] = [
  'type',
  'hash',
  'status',
  'block',
  'gas',
  'owner',
  'time',
]

export interface TransitionTableProps {
  rows: PeTransaction[]
  state: LoadState
  error?: unknown
  onRetry?: () => void
  paging?: DataTableProps<PeTransaction>['paging']
  /** Which columns to draw, in this order; all of them by default. */
  columns?: readonly TransitionColumn[]
  caption?: string
  empty?: ReactNode
  source?: SourceStamp | SourceStamp[]
}

function Status({ value }: { value: string }) {
  const { t } = useLingui()
  const upper = value.toUpperCase()
  if (upper === 'SUCCESS') return <Badge tone="success">{t`Success`}</Badge>
  if (upper === 'FAIL' || upper === 'FAILED' || upper === 'ERROR') {
    return <Badge tone="danger">{t`Failed`}</Badge>
  }
  return <Badge>{humanizeType(value)}</Badge>
}

function TypeCell({ row }: { row: PeTransaction }) {
  const type = transitionBadgeType(row.type, row.batchType)
  return type ? <TypeBadge type={type} /> : <Badge>{humanizeType(row.type)}</Badge>
}

/** Platform Explorer's state transitions as a table, and as cards on a phone; each row opens the transition's page. */
export function TransitionTable({
  rows,
  state,
  error,
  onRetry,
  paging,
  columns = TRANSITION_COLUMNS,
  caption,
  empty,
  source,
}: TransitionTableProps) {
  const { t } = useLingui()
  const defs = useMemo<Record<TransitionColumn, ColumnDef<PeTransaction>>>(
    () => ({
      type: {
        id: 'type',
        header: t`Type`,
        cell: ({ row }) => <TypeCell row={row.original} />,
        meta: { phone: 'title' },
      },
      hash: {
        id: 'hash',
        header: t`Transition`,
        cell: ({ row }) => <Entity kind="transition" id={row.original.hash} />,
        meta: { phone: 'secondary' },
      },
      status: {
        id: 'status',
        header: t`Status`,
        cell: ({ row }) => <Status value={row.original.status} />,
        meta: { phone: 'secondary' },
      },
      block: {
        id: 'block',
        header: t`Block`,
        cell: ({ row }) =>
          row.original.blockHeight == null ? (
            '—'
          ) : (
            <Entity kind="platform-block" id={String(row.original.blockHeight)} />
          ),
      },
      gas: {
        id: 'gas',
        header: t`Gas`,
        cell: ({ row }) => (row.original.gasUsed == null ? '—' : formatInt(row.original.gasUsed)),
        meta: { numeric: true },
      },
      owner: {
        id: 'owner',
        header: t`Owner`,
        cell: ({ row }) => {
          const id = row.original.owner?.identifier
          return id ? <IdentityRef id={id} /> : '—'
        },
      },
      time: {
        id: 'time',
        header: t`Time`,
        cell: ({ row }) => <Time ms={row.original.timestamp} mode="relative" live />,
        meta: { phone: 'primary' },
      },
    }),
    [t],
  )
  const columnDefs = useMemo(() => columns.map((c) => defs[c]), [columns, defs])
  return (
    <DataTable
      caption={caption ?? t`Platform state transitions`}
      columns={columnDefs}
      rows={rows}
      getRowId={(r) => r.hash}
      state={state}
      error={error}
      onRetry={onRetry}
      paging={paging}
      empty={empty}
      source={source}
      rowLink={(r) => ({ to: '/platform/tx/$hash', params: { hash: r.hash } })}
    />
  )
}
