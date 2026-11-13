import { useLingui } from '@lingui/react/macro'
import { useInfiniteQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { stampOf } from '@/data/envelope'
import type { IdentityVoteDto } from '@/data/sdk/methods/p-id'
import { Entity, IdentityRef, useNetwork } from '@/features/entity'
import { systemContract } from '@/lib/well-known'
import { Badge, Card, DataTable, Empty } from '@/ui'
import { loadState, type IdentityTabProps } from './common'
import { identityVotesQuery } from './queries'

/** A DPNS contest is named by its label; any other contested resource by its last index value, with where to look it up. */
export function contestOf(v: IdentityVoteDto): { id: string; search?: Record<string, string> } {
  const last = String(v.indexValues[v.indexValues.length - 1] ?? '')
  const dpns = v.contractId === systemContract('dpns').id && v.documentTypeName === 'domain'
  return dpns
    ? { id: last }
    : { id: last, search: { contract: v.contractId, type: v.documentTypeName, index: v.indexName } }
}

export function VotesTab({ id }: IdentityTabProps) {
  const { t } = useLingui()
  const net = useNetwork()
  const votes = useInfiniteQuery(identityVotesQuery(net, id))
  const pages = votes.data?.pages ?? []
  const rows = pages.flatMap((p) => p.data)
  const columns = useMemo<ColumnDef<IdentityVoteDto>[]>(
    () => [
      {
        id: 'contest',
        header: t`Contest`,
        cell: ({ row }) => {
          const c = contestOf(row.original)
          return <Entity kind="contest" id={c.id} search={c.search} />
        },
        meta: { phone: 'title' },
      },
      {
        id: 'choice',
        header: t`Choice`,
        cell: ({ row }) => {
          const c = row.original.choice
          return c.type === 'towardsIdentity' ? (
            <span className="flex flex-wrap items-center gap-2">
              <Badge>{t`Towards`}</Badge>
              <IdentityRef id={c.identityId} />
            </span>
          ) : c.type === 'lock' ? (
            <Badge tone="warning">{t`Lock`}</Badge>
          ) : (
            <Badge>{t`Abstain`}</Badge>
          )
        },
        meta: { phone: 'primary' },
      },
      {
        id: 'index',
        header: t`Resource`,
        accessorFn: (v) => `${v.documentTypeName} · ${v.indexName}`,
        meta: { phone: 'hidden' },
      },
    ],
    [t],
  )
  const first = pages[0]
  return (
    <Card
      title={t`Contested-resource votes`}
      layer="platform"
      id="identity-votes"
      source={first ? stampOf(first) : undefined}
      subtitle={t`Only masternode voting identities vote, and Platform drops a vote once its contest is decided.`}
    >
      <DataTable
        caption={t`Contested-resource votes`}
        columns={columns}
        rows={rows}
        getRowId={(v) => v.voteId}
        state={loadState(votes)}
        error={votes.error}
        onRetry={() => void votes.refetch()}
        paging={
          votes.hasNextPage
            ? {
                kind: 'infinite',
                hasNext: votes.hasNextPage,
                fetchNext: () => void votes.fetchNextPage(),
                fetching: votes.isFetchingNextPage,
              }
            : undefined
        }
        empty={
          <Empty
            kind="none-yet"
            title={t`This identity has no votes on record.`}
            body={t`Only masternode voting identities cast contested-resource votes, and Platform deletes a vote once the contest is decided.`}
          />
        }
      />
    </Card>
  )
}
