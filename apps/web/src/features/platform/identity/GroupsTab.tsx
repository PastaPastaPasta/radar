import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { stampOf } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { peQueries } from '@/data/pe/queries'
import { sdkQueries } from '@/data/sdk/queries'
import type { IdentityGroupDto } from '@/data/sdk/methods/p-id'
import { Entity, useNetwork } from '@/features/entity'
import { Card, DataTable, Empty, ErrorState } from '@/ui'
import { loadState, type IdentityTabProps } from './common'
import { ContractForm } from './IdForm'

/** The most contracts one group query names. */
const MAX_CONTRACTS = 100

export function GroupsTab({ id, contract }: IdentityTabProps & { contract?: string | undefined }) {
  const { t } = useLingui()
  const net = useNetwork()
  const decentralized = useDecentralizedOnly()
  const owned = useQuery({
    ...peQueries.identityDataContracts(net, id, { limit: MAX_CONTRACTS, order: 'desc' }),
    enabled: !decentralized,
  })
  const contracts = useMemo(() => {
    const list = new Set<string>()
    if (contract) list.add(contract)
    for (const c of owned.data?.data.items ?? []) list.add(c.identifier)
    return [...list].sort().slice(0, MAX_CONTRACTS)
  }, [contract, owned.data])
  const waiting = !decentralized && owned.isPending
  const groups = useQuery({
    ...sdkQueries['group.identityGroups'](net, { identityId: id, memberContracts: contracts }),
    enabled: contracts.length > 0 && !waiting,
  })

  const columns = useMemo<ColumnDef<IdentityGroupDto>[]>(
    () => [
      {
        id: 'group',
        header: t`Group`,
        cell: ({ row }) => (
          <Entity
            kind="group"
            id={`${row.original.contractId}/${row.original.position}`}
            label={t`Group ${row.original.position}`}
          />
        ),
        meta: { phone: 'title' },
      },
      {
        id: 'contract',
        header: t`Contract`,
        cell: ({ row }) => <Entity kind="contract" id={row.original.contractId} />,
        meta: { phone: 'secondary' },
      },
      {
        id: 'position',
        header: t`Position`,
        accessorFn: (g) => g.position,
        meta: { numeric: true, phone: 'secondary' },
      },
      { id: 'role', header: t`Role`, accessorFn: (g) => g.role, meta: { phone: 'secondary' } },
      {
        id: 'power',
        header: t`Power`,
        accessorFn: (g) => (g.power === null ? '—' : String(g.power)),
        meta: { align: 'end', numeric: true, phone: 'primary' },
      },
    ],
    [t],
  )

  return (
    <Card
      title={t`Groups`}
      layer="platform"
      id="identity-groups"
      source={groups.data ? stampOf(groups.data) : undefined}
      subtitle={t`Platform answers group membership only for the contracts it is asked about: the ones this identity owns, and the one you name.`}
    >
      <ContractForm contract={contract} />
      {owned.isError ? (
        <ErrorState error={owned.error} source="pe" compact onRetry={() => void owned.refetch()} />
      ) : null}
      {contracts.length === 0 && !waiting ? (
        <Empty kind="none-yet" title={t`Name a contract to see this identity’s groups in it.`} />
      ) : (
        <DataTable
          caption={t`Groups`}
          columns={columns}
          rows={groups.data?.data ?? []}
          getRowId={(g) => `${g.contractId}/${g.position}`}
          state={waiting ? 'loading' : loadState(groups)}
          error={groups.error}
          onRetry={() => void groups.refetch()}
          empty={
            <Empty
              kind="none-yet"
              title={t`This identity is not a member of any group in those contracts.`}
            />
          }
        />
      )}
    </Card>
  )
}
