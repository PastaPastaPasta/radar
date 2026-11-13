import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, type ReactNode } from 'react'
import type { ContractGroupDto } from '@/data/sdk/methods'
import { formatInt } from '@/lib/format'
import { DataTable } from '@/ui'

interface GroupsTableProps {
  contract: string
  rows: ContractGroupDto[]
  caption: string
  empty: ReactNode
}

/** A contract's groups by position, each row opening that group. */
export function GroupsTable({ contract, rows, caption, empty }: GroupsTableProps) {
  const { t } = useLingui()
  const columns = useMemo<ColumnDef<ContractGroupDto>[]>(
    () => [
      {
        id: 'position',
        header: t`Position`,
        cell: ({ row }) => (
          <Link
            to="/group/$contract/$pos"
            params={{ contract, pos: String(row.original.position) }}
          >
            {row.original.position}
          </Link>
        ),
        meta: { numeric: true, phone: 'title' },
      },
      {
        id: 'threshold',
        header: t`Required power`,
        cell: ({ row }) => formatInt(row.original.requiredPower),
        meta: { numeric: true, phone: 'primary' },
      },
      {
        id: 'members',
        header: t`Members`,
        cell: ({ row }) => formatInt(row.original.members.length),
        meta: { numeric: true },
      },
      {
        id: 'total',
        header: t`Total power`,
        cell: ({ row }) => formatInt(row.original.members.reduce((n, m) => n + m.power, 0)),
        meta: { numeric: true },
      },
    ],
    [t, contract],
  )
  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={rows}
      getRowId={(g) => String(g.position)}
      state={rows.length === 0 ? 'empty' : 'ready'}
      empty={empty}
      rowLink={(g) =>
        ({
          to: '/group/$contract/$pos',
          params: { contract, pos: String(g.position) },
        }) as never
      }
    />
  )
}
