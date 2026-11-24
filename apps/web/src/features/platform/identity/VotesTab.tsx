import { useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { stampOf } from '@/data/envelope'
import type { IdentityVoteDto } from '@/data/sdk/methods/p-id'
import { Entity, IdentityRef, ScrollList, useNetwork, usePageChain } from '@/features/entity'
import { systemContract } from '@/lib/well-known'
import { Badge, Card, DataTable, Empty } from '@/ui'
import type { IdentityTabProps } from './common'
import { identityVotesPage, nextVotesCursor } from './queries'

/** A DPNS contest is named by its label; any other contested resource by its last index value, with where to look it up. */
function contestOf(v: IdentityVoteDto): { id: string; search?: Record<string, string> } {
  const tail = v.indexValues[v.indexValues.length - 1]
  const last = typeof tail === 'string' || typeof tail === 'number' ? String(tail) : ''
  const dpns = v.contractId === systemContract('dpns').id && v.documentTypeName === 'domain'
  return dpns
    ? { id: last }
    : { id: last, search: { contract: v.contractId, type: v.documentTypeName, index: v.indexName } }
}

export function VotesTab({ id }: IdentityTabProps) {
  const { t } = useLingui()
  const net = useNetwork()
  const votes = usePageChain({
    listKey: id,
    start: undefined as string | undefined,
    query: (after) => identityVotesPage(net, id, after),
    rows: (p) => p.data,
    getRowId: (v) => v.voteId,
    next: nextVotesCursor,
  })
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
  const first = votes.pages.find((p) => p.data)?.data
  return (
    <Card
      title={t`Contested-resource votes`}
      layer="platform"
      id="identity-votes"
      source={first ? stampOf(first) : undefined}
      subtitle={t`Only masternode voting identities vote, and Platform drops a vote once its contest is decided.`}
    >
      <ScrollList chain={votes}>
        <DataTable
          caption={t`Contested-resource votes`}
          columns={columns}
          rows={votes.rows}
          getRowId={votes.getRowId}
          state={votes.state}
          error={votes.error}
          onRetry={votes.onRetry}
          paging={votes.paging.hasNext ? votes.paging : undefined}
          empty={
            <Empty
              kind="none-yet"
              title={t`This identity has no votes on record.`}
              body={t`Only masternode voting identities cast contested-resource votes, and Platform deletes a vote once the contest is decided.`}
            />
          }
        />
      </ScrollList>
    </Card>
  )
}
