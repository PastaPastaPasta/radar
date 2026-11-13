import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { stampOf } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { peQueries } from '@/data/pe/queries'
import type { PeTokenHolder, PeTokenTransition } from '@/data/pe/schemas'
import { useHydratedFact } from '@/data/query/batch'
import { sdkBatchers } from '@/data/sdk/queries'
import { Entity, IdentityRef, transitionBadgeType } from '@/features/entity'
import { isDevnet } from '@/lib/network'
import { Amount, Badge, Card, DataTable, Empty, Time, TypeBadge, Unavailable } from '@/ui'
import { loadState, PE_PAGE, pageTo, peChildQuery } from '../identity/common'
import { tokenAmountKind, type TokenView } from './use-token'

const humanize = (raw: string): string => {
  const text = raw.toLowerCase().split('_').join(' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const pePaging = (page: number, total: number | undefined) =>
  ({ kind: 'page', page, limit: PE_PAGE, total, to: pageTo }) as const

/** The index-backed tabs: Decentralized only mode and devnets say so once, the rest read Platform Explorer. */
export function IndexedTab({
  token,
  tab,
  page,
}: {
  token: TokenView
  tab: 'activity' | 'holders'
  page: number
}) {
  const { t } = useLingui()
  const decentralized = useDecentralizedOnly()
  if (decentralized) {
    return (
      <Unavailable
        source="pe"
        title={
          tab === 'activity'
            ? t`Platform keeps no list of a token's transfers; this needs Platform Explorer's index`
            : t`Platform keeps no holder index; this needs Platform Explorer's index`
        }
      />
    )
  }
  if (isDevnet(token.net)) {
    return <Empty kind="unsupported-network" title={t`Platform Explorer doesn't index devnets`} />
  }
  return tab === 'activity' ? (
    <Activity token={token} page={page} />
  ) : (
    <Holders token={token} page={page} />
  )
}

function Activity({ token, page }: { token: TokenView; page: number }) {
  const { t } = useLingui()
  const q = useQuery(peQueries.tokenTransitions(token.net, token.id, peChildQuery(page)))
  const kind = tokenAmountKind(token)
  const columns = useMemo<ColumnDef<PeTokenTransition>[]>(
    () => [
      {
        id: 'action',
        header: t`Action`,
        cell: ({ row }) => {
          const type = transitionBadgeType(row.original.action)
          return type ? <TypeBadge type={type} /> : <Badge>{humanize(row.original.action)}</Badge>
        },
        meta: { phone: 'title' },
      },
      {
        id: 'amount',
        header: t`Amount`,
        cell: ({ row }) =>
          row.original.amount != null && kind ? (
            <Amount value={row.original.amount} kind={kind} />
          ) : (
            '—'
          ),
        meta: { numeric: true, phone: 'primary' },
      },
      {
        id: 'from',
        header: t`From`,
        cell: ({ row }) => {
          const id = row.original.owner?.identifier
          return id ? <IdentityRef id={id} /> : '—'
        },
      },
      {
        id: 'to',
        header: t`To`,
        cell: ({ row }) =>
          row.original.recipient ? <IdentityRef id={row.original.recipient} /> : '—',
      },
      {
        id: 'hash',
        header: t`Transition`,
        cell: ({ row }) => <Entity kind="transition" id={row.original.stateTransitionHash} />,
        meta: { phone: 'secondary' },
      },
      {
        id: 'time',
        header: t`Time`,
        cell: ({ row }) => <Time ms={row.original.timestamp} mode="relative" live />,
        meta: { phone: 'secondary' },
      },
    ],
    [t, kind],
  )
  return (
    <Card
      title={t`Activity`}
      layer="platform"
      id="token-activity"
      source={q.data ? stampOf(q.data) : undefined}
    >
      <DataTable
        caption={t`Token transitions`}
        columns={columns}
        rows={q.data?.data.items ?? []}
        getRowId={(r) => r.stateTransitionHash}
        state={loadState(q)}
        error={q.error}
        onRetry={() => void q.refetch()}
        paging={pePaging(page, q.data?.data.total)}
        rowLink={(r) => ({
          to: '/platform/tx/$hash',
          params: { hash: r.stateTransitionHash.toLowerCase() },
        })}
        empty={<Empty kind="none-yet" title={t`No transitions have touched this token yet.`} />}
      />
    </Card>
  )
}

function HolderBalance({ token, row }: { token: TokenView; row: PeTokenHolder }) {
  const kind = tokenAmountKind(token)
  const fact = useHydratedFact(
    sdkBatchers.tokenBalance,
    { tokenId: token.id, identityId: row.holder.identifier ?? '' },
    undefined,
  )
  const value = fact?.value ?? row.balance
  return kind ? <Amount value={value} kind={kind} /> : <>—</>
}

function Holders({ token, page }: { token: TokenView; page: number }) {
  const { t } = useLingui()
  const q = useQuery(peQueries.tokenHolders(token.net, token.id, peChildQuery(page)))
  const columns = useMemo<ColumnDef<PeTokenHolder>[]>(
    () => [
      {
        id: 'holder',
        header: t`Holder`,
        cell: ({ row }) =>
          row.original.holder.identifier ? (
            <IdentityRef id={row.original.holder.identifier} />
          ) : (
            '—'
          ),
        meta: { phone: 'title' },
      },
      {
        id: 'balance',
        header: t`Balance`,
        cell: ({ row }) => <HolderBalance token={token} row={row.original} />,
        meta: { numeric: true, phone: 'primary' },
      },
    ],
    [t, token],
  )
  return (
    <Card
      title={t`Holders`}
      layer="platform"
      id="token-holders"
      source={q.data ? stampOf(q.data) : undefined}
    >
      <DataTable
        caption={t`Token holders`}
        columns={columns}
        rows={q.data?.data.items ?? []}
        getRowId={(r) => r.holder.identifier ?? ''}
        state={loadState(q)}
        error={q.error}
        onRetry={() => void q.refetch()}
        paging={pePaging(page, q.data?.data.total)}
        empty={<Empty kind="none-yet" title={t`Nobody holds this token yet.`} />}
      />
    </Card>
  )
}
