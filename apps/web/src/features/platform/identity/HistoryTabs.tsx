import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import type { LinkProps } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { stampOf } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { peQueries } from '@/data/pe/queries'
import type { PeDataContract, PeDocument, PeTransfer } from '@/data/pe/schemas'
import { Entity, IdentityRef, TransitionTable, useNetwork } from '@/features/entity'
import { Amount, Badge, Card, DataTable, Empty, Time, Unavailable } from '@/ui'
import { loadState, PE_PAGE, peChildQuery, useSetSearch, type IdentityTabProps } from './common'

type Tab = 'transactions' | 'contracts' | 'documents' | 'transfers'

const pageTo = (n: number): LinkProps =>
  ({
    to: '.',
    search: ((prev: Record<string, unknown>) => ({
      ...prev,
      page: n === 1 ? undefined : n,
    })) as never,
  }) as LinkProps

export function HistoryTab({
  id,
  tab,
  page,
  type,
}: IdentityTabProps & { tab: Tab; page: number; type?: string | undefined }) {
  const { t } = useLingui()
  const decentralized = useDecentralizedOnly()
  if (decentralized) {
    const title: Record<Tab, string> = {
      transactions: t`This identity’s transitions need an indexer`,
      contracts: t`The contracts this identity created need an indexer`,
      documents: t`This identity’s documents need an indexer`,
      transfers: t`This identity’s credit transfers need an indexer`,
    }
    return <Unavailable title={title[tab]} />
  }
  return tab === 'transactions' ? (
    <Transactions id={id} page={page} />
  ) : tab === 'contracts' ? (
    <Contracts id={id} page={page} />
  ) : tab === 'documents' ? (
    <Documents id={id} page={page} type={type} />
  ) : (
    <Transfers id={id} page={page} />
  )
}

function Transactions({ id, page }: { id: string; page: number }) {
  const { t } = useLingui()
  const net = useNetwork()
  const q = useQuery(peQueries.identityTransactions(net, id, peChildQuery(page)))
  return (
    <Card
      title={t`Transitions`}
      layer="platform"
      id="identity-transactions"
      source={q.data ? stampOf(q.data) : undefined}
    >
      <TransitionTable
        rows={q.data?.data.items ?? []}
        state={loadState(q)}
        error={q.error}
        onRetry={() => void q.refetch()}
        caption={t`Transitions`}
        columns={['type', 'hash', 'status', 'block', 'gas', 'time']}
        paging={{ kind: 'page', page, limit: PE_PAGE, total: q.data?.data.total, to: pageTo }}
        empty={<Empty kind="none-yet" title={t`This identity has sent no transitions.`} />}
      />
    </Card>
  )
}

function Contracts({ id, page }: { id: string; page: number }) {
  const { t } = useLingui()
  const net = useNetwork()
  const q = useQuery(peQueries.identityDataContracts(net, id, peChildQuery(page)))
  const columns = useMemo<ColumnDef<PeDataContract>[]>(
    () => [
      {
        id: 'contract',
        header: t`Contract`,
        cell: ({ row }) => (
          <Entity
            kind="contract"
            id={row.original.identifier}
            label={row.original.name ?? undefined}
          />
        ),
        meta: { phone: 'title' },
      },
      {
        id: 'version',
        header: t`Version`,
        accessorFn: (c) => c.version ?? '—',
        meta: { numeric: true, phone: 'secondary' },
      },
      {
        id: 'docs',
        header: t`Documents`,
        accessorFn: (c) => c.documentsCount ?? '—',
        meta: { numeric: true, phone: 'secondary' },
      },
      {
        id: 'time',
        header: t`Created`,
        cell: ({ row }) =>
          row.original.timestamp ? <Time ms={row.original.timestamp} mode="absolute" /> : '—',
        meta: { phone: 'primary' },
      },
    ],
    [t],
  )
  return (
    <Card
      title={t`Contracts`}
      layer="platform"
      id="identity-contracts"
      source={q.data ? stampOf(q.data) : undefined}
    >
      <DataTable
        caption={t`Contracts`}
        columns={columns}
        rows={q.data?.data.items ?? []}
        getRowId={(c) => c.identifier}
        state={loadState(q)}
        error={q.error}
        onRetry={() => void q.refetch()}
        paging={{ kind: 'page', page, limit: PE_PAGE, total: q.data?.data.total, to: pageTo }}
        empty={<Empty kind="none-yet" title={t`This identity has created no contracts.`} />}
      />
    </Card>
  )
}

function Documents({ id, page, type }: { id: string; page: number; type?: string | undefined }) {
  const { t } = useLingui()
  const net = useNetwork()
  const setSearch = useSetSearch()
  const [draft, setDraft] = useState(type ?? '')
  const q = useQuery(
    peQueries.identityDocuments(net, id, peChildQuery(page, { document_type_name: type })),
  )
  const columns = useMemo<ColumnDef<PeDocument>[]>(
    () => [
      {
        id: 'document',
        header: t`Document`,
        cell: ({ row }) => {
          const d = row.original
          return d.dataContractIdentifier && d.documentTypeName ? (
            <Entity
              kind="document"
              id={`${d.dataContractIdentifier}/${d.documentTypeName}/${d.identifier}`}
            />
          ) : (
            d.identifier
          )
        },
        meta: { phone: 'title' },
      },
      {
        id: 'type',
        header: t`Type`,
        cell: ({ row }) =>
          row.original.documentTypeName ? <Badge>{row.original.documentTypeName}</Badge> : '—',
        meta: { phone: 'secondary' },
      },
      {
        id: 'contract',
        header: t`Contract`,
        cell: ({ row }) =>
          row.original.dataContractIdentifier ? (
            <Entity kind="contract" id={row.original.dataContractIdentifier} />
          ) : (
            '—'
          ),
        meta: { phone: 'secondary' },
      },
      {
        id: 'revision',
        header: t`Revision`,
        accessorFn: (d) => d.revision ?? '—',
        meta: { numeric: true, phone: 'hidden' },
      },
      {
        id: 'time',
        header: t`Time`,
        cell: ({ row }) =>
          row.original.timestamp ? <Time ms={row.original.timestamp} mode="absolute" /> : '—',
        meta: { phone: 'primary' },
      },
    ],
    [t],
  )
  return (
    <Card
      title={t`Documents`}
      layer="platform"
      id="identity-documents"
      source={q.data ? stampOf(q.data) : undefined}
    >
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const value = draft.trim()
          setSearch({ type: value === '' ? undefined : value, page: undefined })
        }}
      >
        <label className="flex flex-wrap items-center gap-2">
          <span>{t`Document type`}</span>
          <input
            className="dh-input dh-input--sm"
            value={draft}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => {
              setDraft(e.target.value)
            }}
          />
        </label>
        <button type="submit" className="dh-btn dh-btn--sm">{t`Filter`}</button>
        {type ? (
          <button
            type="button"
            className="dh-btn dh-btn--sm"
            onClick={() => {
              setDraft('')
              setSearch({ type: undefined, page: undefined })
            }}
          >
            {t`Clear`}
          </button>
        ) : null}
      </form>
      <DataTable
        caption={t`Documents`}
        columns={columns}
        rows={q.data?.data.items ?? []}
        getRowId={(d) => d.identifier}
        state={loadState(q)}
        error={q.error}
        onRetry={() => void q.refetch()}
        paging={{ kind: 'page', page, limit: PE_PAGE, total: q.data?.data.total, to: pageTo }}
        empty={
          <Empty
            kind="none-yet"
            title={
              type
                ? t`No ${type} documents from this identity.`
                : t`This identity has created no documents.`
            }
          />
        }
      />
    </Card>
  )
}

function Transfers({ id, page }: { id: string; page: number }) {
  const { t } = useLingui()
  const net = useNetwork()
  const q = useQuery(peQueries.identityTransfers(net, id, peChildQuery(page)))
  const columns = useMemo<ColumnDef<PeTransfer>[]>(
    () => [
      {
        id: 'amount',
        header: t`Amount`,
        cell: ({ row }) => <Amount value={row.original.amount} kind="credits" fiat />,
        meta: { align: 'end', numeric: true, phone: 'primary' },
      },
      {
        id: 'from',
        header: t`From`,
        cell: ({ row }) => (row.original.sender ? <IdentityRef id={row.original.sender} /> : '—'),
        meta: { phone: 'secondary' },
      },
      {
        id: 'to',
        header: t`To`,
        cell: ({ row }) =>
          row.original.recipient ? <IdentityRef id={row.original.recipient} /> : '—',
        meta: { phone: 'secondary' },
      },
      {
        id: 'tx',
        header: t`Transition`,
        cell: ({ row }) => <Entity kind="transition" id={row.original.txHash} />,
        meta: { phone: 'title' },
      },
      {
        id: 'time',
        header: t`Time`,
        cell: ({ row }) => <Time ms={row.original.timestamp} mode="absolute" />,
        meta: { phone: 'secondary' },
      },
    ],
    [t],
  )
  return (
    <Card
      title={t`Credit transfers`}
      layer="platform"
      id="identity-transfers"
      source={q.data ? stampOf(q.data) : undefined}
    >
      <DataTable
        caption={t`Credit transfers`}
        columns={columns}
        rows={q.data?.data.items ?? []}
        getRowId={(r) => `${r.txHash}:${r.recipient ?? ''}`}
        state={loadState(q)}
        error={q.error}
        onRetry={() => void q.refetch()}
        paging={{ kind: 'page', page, limit: PE_PAGE, total: q.data?.data.total, to: pageTo }}
        empty={<Empty kind="none-yet" title={t`This identity has made no credit transfers.`} />}
      />
    </Card>
  )
}
