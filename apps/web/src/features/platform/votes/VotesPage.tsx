import { useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
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
  ScrollList,
  useNetwork,
  pagePosition,
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
  SearchField,
  SegFilter,
  TableTools,
  Time,
  Unavailable,
} from '@/ui'
import { usePeList, useSetSearch } from '../contest/shared'
import { classifyIdentityInput, type IdentityInput } from './filter-input'

export type VotesPageSearch = VotesFilters

const voteId = (v: PeVote) => `${v.proTxHash}:${v.timestamp}:${(v.indexValues ?? []).join('/')}`

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
  const [problem, setProblem] = useState<{ voter: IdentityInput; towards: IdentityInput }>({
    voter: classifyIdentityInput(search.voter ?? ''),
    towards: classifyIdentityInput(search.towards ?? ''),
  })
  const identityOnly = (text: string | undefined) =>
    classifyIdentityInput(text ?? '') === 'identity' ? text : undefined
  const asked = {
    ...search,
    voter: identityOnly(search.voter),
    towards: identityOnly(search.towards),
  }
  const list = usePeList(
    JSON.stringify(peVotesQuery({ ...asked, page: 1 })),
    asked,
    (page, limit) => peQueries.masternodeVotes(net, peVotesQuery({ ...asked, limit, page })),
    voteId,
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
        id: 'voting-identity',
        header: t`Voting identity`,
        cell: ({ row }) => <IdentityRef id={row.original.voterIdentifier} />,
        enableSorting: false,
        meta: { phone: 'hidden' },
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
            const kinds = {
              voter: classifyIdentityInput(voter),
              towards: classifyIdentityInput(towards),
            }
            setProblem(kinds)
            const ok = (k: IdentityInput) => k === 'empty' || k === 'identity'
            if (ok(kinds.voter) && ok(kinds.towards))
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
          {problem.voter === 'protx' || problem.voter === 'invalid' ? (
            <span role="alert" className="basis-full text-bad">
              {problem.voter === 'protx'
                ? t`That is a masternode ProTx hash. This filter takes the voter’s identity ID, which the Voting identity column shows beside each vote.`
                : t`That isn’t an identity ID: it is 43 or 44 base58 characters.`}
            </span>
          ) : null}
          {problem.towards === 'protx' || problem.towards === 'invalid' ? (
            <span role="alert" className="basis-full text-bad">
              {t`The Towards filter takes an identity ID: 43 or 44 base58 characters.`}
            </span>
          ) : null}
        </form>
        <DateRangeFilter
          label={t`Voted`}
          from={search.from}
          to={search.to}
          onChange={(r) => {
            set({ from: r.from, to: r.to })
          }}
        />
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
      <Card layer="platform" id="votes-list" source={list.stamps}>
        <ScrollList chain={list} position={pagePosition}>
          <DataTable
            caption={t`Masternode votes`}
            columns={columns}
            rows={list.rows}
            getRowId={voteId}
            state={list.state}
            error={list.error}
            onRetry={list.onRetry}
            paging={list.paging}
            empty={<Empty kind="no-match" title={t`No votes match.`} />}
          />
        </ScrollList>
      </Card>
    </div>
  )
}
