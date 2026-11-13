import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { stampOf } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { peQueries } from '@/data/pe/queries'
import { sdkQueries } from '@/data/sdk/queries'
import type { IdentityGroupDto } from '@/data/sdk/methods/p-id'
import { Entity, useNetwork } from '@/features/entity'
import { isPlatformId } from '@/lib/base58'
import { Card, DataTable, Empty } from '@/ui'
import { loadState, useSetSearch, type IdentityTabProps } from './common'

/** The most contracts one group query names. */
const MAX_CONTRACTS = 100

/** Platform answers group membership only for contracts it is told about. */
export function ContractInput({
  initial,
  onSubmit,
  label,
}: {
  initial?: string
  onSubmit: (contract: string | undefined) => void
  label: string
}) {
  const { t } = useLingui()
  const [draft, setDraft] = useState(initial ?? '')
  const [problem, setProblem] = useState<string>()
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const value = draft.trim()
        if (value !== '' && !isPlatformId(value)) {
          setProblem(t`That isn’t a contract ID: it is 43 or 44 base58 characters.`)
          return
        }
        setProblem(undefined)
        onSubmit(value === '' ? undefined : value)
      }}
    >
      <label className="flex flex-wrap items-center gap-2">
        <span>{label}</span>
        <input
          className="dh-input dh-input--sm"
          value={draft}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={problem ? true : undefined}
          onChange={(e) => {
            setDraft(e.target.value)
          }}
        />
      </label>
      <button type="submit" className="dh-btn dh-btn--sm">
        {t`Check`}
      </button>
      {problem ? (
        <span role="alert" className="text-bad">
          {problem}
        </span>
      ) : null}
    </form>
  )
}

export function GroupsTab({ id, contract }: IdentityTabProps & { contract?: string | undefined }) {
  const { t } = useLingui()
  const net = useNetwork()
  const decentralized = useDecentralizedOnly()
  const setSearch = useSetSearch()
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
      <ContractInput
        key={contract ?? ''}
        initial={contract}
        label={t`Contract ID`}
        onSubmit={(c) => {
          setSearch({ contract: c })
        }}
      />
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
