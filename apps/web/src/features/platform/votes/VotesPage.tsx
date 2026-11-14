import { useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { stampOf } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { peQueries } from '@/data/pe/queries'
import type { PeVote } from '@/data/pe/schemas'
import { DPNS, peVotesQuery, VOTE_CHOICE, type VotesFilters } from '@/data/query/prefetch/p-vote'
import {
  Entity,
  IdentityRef,
  PageFrame,
  PageGroupTabs,
  PageLink,
  useNetwork,
} from '@/features/entity'
import { formatInt } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import {
  ActiveFilters,
  Badge,
  Card,
  DataTable,
  DateRangeFilter,
  Empty,
  ListModeToggle,
  SearchField,
  SegFilter,
  TableTools,
  Time,
  Unavailable,
} from '@/ui'
import { usePeList, useSetSearch } from '../contest/shared'

export type VotesPageSearch = VotesFilters

export function VotesPage({ search }: { search: VotesPageSearch }) {
  const { t } = useLingui()
  const decentralized = useDecentralizedOnly()
  const devnet = isDevnet(useNetwork())
  return (
    <PageFrame
      path="/votes"
      title={t`Masternode votes`}
      eyebrow={t`Platform`}
      layer="platform"
      lede={t`Every masternode vote with voter, choice, resource and time.`}
    >
      <PageGroupTabs group="voting" />
      {devnet ? (
        <Empty
          kind="unsupported-network"
          title={t`Platform Explorer doesn’t cover devnets.`}
          body={t`This page reads from Platform Explorer. Switch to Mainnet or Testnet to see it.`}
          action={
            <PageLink to="/" search={{ network: 'mainnet' }}>
              {t`Back to Mainnet`}
            </PageLink>
          }
        />
      ) : decentralized ? (
        <>
          <Unavailable title={t`The list of masternode votes needs Platform Explorer’s index`} />
          <p>
            <PageLink to="/contests">{t`See the open contests, with their tallies`}</PageLink>
          </p>
        </>
      ) : (
        <VoteList search={search} />
      )}
    </PageFrame>
  )
}

function VoteList({ search }: { search: VotesPageSearch }) {
  const { t } = useLingui()
  const net = useNetwork()
  const set = useSetSearch()
  const [voter, setVoter] = useState(search.voter ?? '')
  const [towards, setTowards] = useState(search.towards ?? '')
  const list = usePeList('votes', search, (page, limit) =>
    peQueries.masternodeVotes(net, peVotesQuery({ ...search, limit, page })),
  )
  const columns = useMemo<ColumnDef<PeVote>[]>(
    () => [
      {
        id: 'voter',
        header: t`Voter`,
        cell: ({ row }) => <Entity kind="masternode" id={row.original.proTxHash.toLowerCase()} />,
        enableSorting: false,
        meta: { phone: 'title' },
      },
      {
        id: 'choice',
        header: t`Choice`,
        cell: ({ row }) =>
          row.original.choice === VOTE_CHOICE.lock ? (
            <Badge tone="danger">{t`Lock`}</Badge>
          ) : row.original.choice === VOTE_CHOICE.abstain ? (
            <Badge tone="warning">{t`Abstain`}</Badge>
          ) : (
            <Badge>{t`Towards`}</Badge>
          ),
        enableSorting: false,
        meta: { phone: 'primary' },
      },
      {
        id: 'towards',
        header: t`Towards`,
        cell: ({ row }) =>
          row.original.towardsIdentity ? <IdentityRef id={row.original.towardsIdentity} /> : '—',
        enableSorting: false,
        meta: { phone: 'secondary' },
      },
      {
        id: 'resource',
        header: t`Resource`,
        cell: ({ row }) => {
          const v = row.original
          const id = v.indexValues?.[v.indexValues.length - 1]
          if (!id) return '—'
          const dpns =
            v.dataContractIdentifier === DPNS.contractId() && v.documentTypeName === DPNS.type
          return (
            <Entity
              kind="contest"
              id={id}
              search={
                dpns
                  ? undefined
                  : {
                      contract: v.dataContractIdentifier ?? undefined,
                      type: v.documentTypeName ?? undefined,
                      index: v.indexName ?? undefined,
                    }
              }
            />
          )
        },
        enableSorting: false,
        meta: { phone: 'secondary' },
      },
      {
        id: 'power',
        header: t`Power`,
        cell: ({ row }) => formatInt(row.original.power ?? 0),
        enableSorting: false,
        meta: { align: 'end', numeric: true, phone: 'secondary' },
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
        enableSorting: false,
        meta: { phone: 'hidden' },
      },
      {
        id: 'time',
        header: t`Time`,
        cell: ({ row }) => <Time ms={row.original.timestamp} mode="absolute" />,
        enableSorting: false,
        meta: { phone: 'secondary' },
      },
    ],
    [t],
  )
  const tokens = [
    ...(search.voter ? [{ id: 'voter', label: t`Voter: ${search.voter}` }] : []),
    ...(search.towards ? [{ id: 'towards', label: t`Towards: ${search.towards}` }] : []),
    ...(search.choice ? [{ id: 'choice', label: t`Choice: ${search.choice}` }] : []),
    ...(search.from || search.to
      ? [{ id: 'dates', label: t`Voted ${search.from ?? ''}–${search.to ?? ''}` }]
      : []),
  ]
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <TableTools>
        <SegFilter
          label={t`Choice`}
          value={search.choice ?? ''}
          onChange={(id) => {
            set({ choice: id === '' ? undefined : id })
          }}
          options={[
            { id: '', label: t`All` },
            { id: 'towards', label: t`Towards` },
            { id: 'abstain', label: t`Abstain` },
            { id: 'lock', label: t`Lock` },
          ]}
        />
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            set({ voter: voter.trim() || undefined, towards: towards.trim() || undefined })
          }}
        >
          <SearchField
            label={t`Voter identity`}
            value={voter}
            onChange={setVoter}
            placeholder={t`Voter identity`}
          />
          <SearchField
            label={t`Towards identity`}
            value={towards}
            onChange={setTowards}
            placeholder={t`Towards identity`}
          />
          <button type="submit" className="dh-btn dh-btn--sm">
            {t`Apply`}
          </button>
        </form>
        <DateRangeFilter
          label={t`Voted`}
          from={search.from}
          to={search.to}
          onChange={(r) => {
            set({ from: r.from, to: r.to })
          }}
        />
        <ListModeToggle listId="votes" />
      </TableTools>
      {tokens.length > 0 ? (
        <ActiveFilters
          matches={list.total ?? list.rows.length}
          tokens={tokens}
          onRemove={(id) => {
            if (id === 'dates') set({ from: undefined, to: undefined })
            else {
              if (id === 'voter') setVoter('')
              if (id === 'towards') setTowards('')
              set({ [id]: undefined })
            }
          }}
          onClear={() => {
            setVoter('')
            setTowards('')
            set({
              voter: undefined,
              towards: undefined,
              choice: undefined,
              from: undefined,
              to: undefined,
            })
          }}
        />
      ) : null}
      <Card layer="platform" id="votes-list" source={list.pages.map(stampOf)}>
        <DataTable
          caption={t`Masternode votes`}
          columns={columns}
          rows={list.rows}
          getRowId={(v) => `${v.proTxHash}:${v.timestamp}:${(v.indexValues ?? []).join('/')}`}
          state={list.state}
          error={list.error}
          onRetry={list.onRetry}
          paging={list.paging}
          empty={<Empty kind="no-match" title={t`No votes match.`} />}
        />
      </Card>
    </div>
  )
}
