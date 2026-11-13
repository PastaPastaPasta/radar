import { useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import type { ContractGroupDto } from '@/data/sdk/methods'
import { formatInt } from '@/lib/format'
import { Card, DataTable, Empty } from '@/ui'
import { Link } from '@tanstack/react-router'
import type { ContractContext } from './contract-context'

/** The groups the contract defines, with the power each decision needs; each opens its members and actions. */
export function GroupsTab({ ctx }: { ctx: ContractContext }) {
  const { t } = useLingui()
  const { id, contract, stamp } = ctx
  const columns = useMemo<ColumnDef<ContractGroupDto>[]>(
    () => [
      {
        id: 'position',
        header: t`Position`,
        cell: ({ row }) => (
          <Link
            to="/group/$contract/$pos"
            params={{ contract: id, pos: String(row.original.position) }}
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
    [t],
  )
  return (
    <Card
      title={t`Groups`}
      layer="platform"
      source={stamp}
      id="groups"
      actions={
        contract.groups.length > 0 ? (
          <Link className="dh-btn dh-btn--sm" to="/groups/$contract" params={{ contract: id }}>
            {t`Open groups page`}
          </Link>
        ) : undefined
      }
    >
      <DataTable
        caption={t`Groups of this contract`}
        columns={columns}
        rows={contract.groups}
        getRowId={(g) => String(g.position)}
        state={contract.groups.length === 0 ? 'empty' : 'ready'}
        empty={<Empty kind="none-yet" title={t`This contract defines no groups.`} />}
        rowLink={(g) =>
          ({
            to: '/group/$contract/$pos',
            params: { contract: id, pos: String(g.position) },
          }) as never
        }
      />
    </Card>
  )
}
