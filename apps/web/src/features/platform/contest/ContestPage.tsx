import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { peQueries } from '@/data/pe/queries'
import type { PeContestedResource, PeVote } from '@/data/pe/schemas'
import {
  contestRef,
  contestVoteStateArgs,
  peContestVotesQuery,
  PE_CONTEST_VOTES_PAGE,
  VOTE_CHOICE,
  type ContestRef,
} from '@/data/query/prefetch/p-vote'
import type { ContestVoteStateDto } from '@/data/sdk/methods/p-vote'
import { sdkQueries } from '@/data/sdk/queries'
import { Entity, IdentityRef, PageFrame, PageLink, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import {
  Amount,
  Badge,
  Card,
  DataTable,
  Empty,
  JsonView,
  KeyValue,
  LinkOut,
  SegFilter,
  Tabs,
  Time,
  Unavailable,
} from '@/ui'
import { CURSOR_PAGE, CursorPages } from './CursorPages'
import { endOf, loadState, pageLink, pollEnds, useSetSearch, useUpcomingPolls } from './shared'
import { TallyBar, totalVotes, useTallySlices } from './Tally'

export interface ContestPageSearch {
  contract?: string | undefined
  type?: string | undefined
  index?: string | undefined
  tab: 'tally' | 'votes' | 'raw'
  towards?: string | undefined
  page: number
}

const TABS: ContestPageSearch['tab'][] = ['tally', 'votes', 'raw']
const TAB_LABELS: Record<ContestPageSearch['tab'], MessageDescriptor> = {
  tally: msg`Tally`,
  votes: msg`Votes`,
  raw: msg`Raw`,
}

export function ContestPage({ label, search }: { label: string; search: ContestPageSearch }) {
  const { t, i18n } = useLingui()
  const net = useNetwork()
  const decentralized = useDecentralizedOnly()
  const ref = contestRef(label, search)
  const state = useQuery(
    sdkQueries['voting.contestedResourceVoteState'](net, contestVoteStateArgs(ref)),
  )
  const polls = useUpcomingPolls()
  const indexed = useQuery({
    ...peQueries.contestedResource(net, ref.indexValues),
    enabled: !decentralized,
  })
  const s = state.data?.data
  const stamp = state.data ? stampOf(state.data) : undefined
  const indexedContest = indexed.data?.data ?? undefined
  const endsAt = polls.data ? endOf(pollEnds(polls.data.data), ref) : undefined
  const exists = s !== undefined && (s.contenders.length > 0 || s.winner !== null)

  return (
    <PageFrame
      path="/contest/$label"
      title={t`Name contest`}
      eyebrow={t`Platform`}
      layer="platform"
      share
      lede={<span data-contest-label>{ref.isDpns ? `${ref.label}.dash` : ref.label}</span>}
      actions={
        ref.isDpns ? (
          <LinkOut to={{ app: 'gov', action: 'contest-vote', label: ref.label, net }}>
            {t`Vote in Governance`}
          </LinkOut>
        ) : undefined
      }
    >
      {state.isError && !s ? (
        <Card
          layer="platform"
          id="contest-status"
          state="error"
          error={state.error}
          onRetry={() => void state.refetch()}
        >
          {null}
        </Card>
      ) : s && !exists && !state.isPending ? (
        <Empty
          kind="not-found"
          title={t`No contest for ${ref.label} on ${net}.`}
          body={t`Platform holds no contest for this name: it was never contested, or it isn’t a contested name.`}
          action={
            ref.isDpns ? (
              <PageLink to={`/name/${encodeURIComponent(ref.label)}`}>{t`Check the name`}</PageLink>
            ) : undefined
          }
        />
      ) : (
        <>
          <StatusCard state={s} pending={state.isPending} endsAt={endsAt} stamp={stamp} />
          <Tabs
            layer="platform"
            value={search.tab}
            tabs={TABS.map((tab) => ({ id: tab, label: i18n._(TAB_LABELS[tab]) }))}
            to={(tab) =>
              ({
                to: '.',
                search: ((prev: Record<string, unknown>) => ({
                  ...prev,
                  tab: tab === 'tally' ? undefined : tab,
                  page: undefined,
                })) as never,
              }) as never
            }
          />
          {s ? (
            search.tab === 'tally' ? (
              <TallyTab
                ref_={ref}
                state={s}
                search={search}
                indexed={indexedContest}
                stamp={stamp}
              />
            ) : search.tab === 'votes' ? (
              decentralized ? (
                <Unavailable title={t`Who voted, and when, comes from Platform Explorer’s index`} />
              ) : (
                <VotesTab ref_={ref} state={s} search={search} />
              )
            ) : (
              <RawTab state={s} indexed={indexedContest} />
            )
          ) : (
            <Card layer="platform" state={loadState(state)}>
              {null}
            </Card>
          )}
        </>
      )}
    </PageFrame>
  )
}

function StatusCard({
  state,
  pending,
  endsAt,
  stamp,
}: {
  state: ContestVoteStateDto | undefined
  pending: boolean
  endsAt: number | undefined
  stamp: SourceStamp | undefined
}) {
  const { t } = useLingui()
  const slices = useTallySlices(
    state ?? { contenders: [], abstainVotes: null, lockVotes: null, winner: null },
  )
  const total = state ? totalVotes(slices) : undefined
  const winner = state?.winner ?? null
  const kind = winner?.kind
  const decidedAt = winner?.timeMs
  const ended = endsAt ?? decidedAt
  const status =
    kind === 'won'
      ? t`Won`
      : kind === 'locked'
        ? t`Locked`
        : winner
          ? t`Decided`
          : t({ message: 'Active', context: 'contest status' })
  return (
    <Card
      layer="platform"
      id="contest-status"
      title={t`Status`}
      state={pending ? 'loading' : 'ready'}
      source={stamp}
    >
      <KeyValue
        columns={3}
        items={[
          {
            label: t`Status`,
            value: (
              <Badge tone={winner ? 'info' : 'success'} data-status={winner ? kind : 'active'}>
                {status}
              </Badge>
            ),
          },
          {
            label: winner ? t`Decided` : t`Voting ends`,
            value: ended ? <Time ms={ended} mode="both" live={!winner} /> : '—',
          },
          { label: t`Votes cast`, value: total === undefined ? '—' : formatInt(total) },
          ...(winner?.kind === 'won' && winner.identityId
            ? [{ label: t`Winner`, value: <IdentityRef id={winner.identityId} /> }]
            : []),
        ]}
      />
    </Card>
  )
}

/** The contender's prefunded voting balance, in credits, from Platform Explorer's index when it has the contest. */
function prefunded(indexed: PeContestedResource | undefined, index: string): number | undefined {
  const balances = indexed?.prefundedVotingBalance
  if (!balances) return undefined
  return balances[index] ?? Object.values(balances)[0]
}

function TallyTab({
  ref_,
  state,
  search,
  indexed,
  stamp,
}: {
  ref_: ContestRef
  state: ContestVoteStateDto
  search: ContestPageSearch
  indexed: PeContestedResource | undefined
  stamp: SourceStamp | undefined
}) {
  const { t } = useLingui()
  const decentralized = useDecentralizedOnly()
  const aliasOf = new Map(
    (indexed?.contenders ?? []).map((c) => [c.identifier, c.aliases[0]?.alias] as const),
  )
  const slices = useTallySlices(state, aliasOf)
  const fund = prefunded(indexed, ref_.index)
  const picked = search.towards ?? state.contenders[0]?.identityId
  return (
    <>
      <Card layer="platform" id="contest-tally" title={t`Tally`} source={stamp}>
        <TallyBar slices={slices} />
      </Card>
      <Card layer="platform" id="contest-contenders" title={t`Contenders`} source={stamp}>
        <ul className="grid gap-3" data-contenders>
          {state.contenders.map((c) => {
            const winner = state.winner?.kind === 'won' && state.winner.identityId === c.identityId
            const alias = aliasOf.get(c.identityId)
            return (
              <li
                key={c.identityId}
                className="flex flex-wrap items-center gap-x-4 gap-y-1"
                data-contender={c.identityId}
              >
                <IdentityRef id={c.identityId} label={alias} />
                <span className="rx-num">{t`${formatInt(c.voteTally ?? 0)} votes`}</span>
                {winner ? <Badge tone="success">{t`Winner`}</Badge> : null}
                {fund !== undefined ? (
                  <span data-prefunded>
                    {t`Prefunded`} <Amount value={BigInt(Math.round(fund))} kind="credits" />
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
        {decentralized ? (
          <Unavailable
            compact
            title={t`The prefunded voting balance comes from Platform Explorer’s index`}
          />
        ) : null}
      </Card>
      <VotersCard ref_={ref_} state={state} picked={picked} page={search.page} aliasOf={aliasOf} />
    </>
  )
}

function VotersCard({
  ref_,
  state,
  picked,
  page,
  aliasOf,
}: {
  ref_: ContestRef
  state: ContestVoteStateDto
  picked: string | undefined
  page: number
  aliasOf: ReadonlyMap<string, string | undefined>
}) {
  const { t } = useLingui()
  const net = useNetwork()
  const setSearch = useSetSearch()
  const columns = useMemo<ColumnDef<{ id: string }>[]>(
    () => [
      {
        id: 'voter',
        header: t`Voter`,
        cell: ({ row }) => <Entity kind="identity" id={row.original.id} identicon />,
        enableSorting: false,
        meta: { phone: 'title' },
      },
    ],
    [t],
  )
  return (
    <Card
      layer="platform"
      id="contest-voters"
      title={t`Voters`}
      subtitle={t`The masternode voting identities that voted for one contender.`}
    >
      {state.contenders.length === 0 || picked === undefined ? (
        <Empty kind="none-yet" title={t`This contest has no contenders.`} />
      ) : (
        <>
          <SegFilter
            label={t`Contender`}
            value={picked}
            onChange={(id) => {
              setSearch({ towards: id })
            }}
            options={state.contenders.map((c) => ({
              id: c.identityId,
              label: aliasOf.get(c.identityId) ?? `${c.identityId.slice(0, 8)}…`,
              count: c.voteTally ?? 0,
            }))}
          />
          <CursorPages
            key={picked}
            target={page}
            cursor={undefined}
            queryFor={(cursor) =>
              sdkQueries['voting.contestedResourceVotersForIdentity'](net, {
                ...contestVoteStateArgs(ref_),
                contestantId: picked,
                limit: CURSOR_PAGE + 1,
                ...(cursor ? { startAfter: cursor } : {}),
              })
            }
            cursorOf={(id) => id}
            render={(q) => {
              const all = q.data?.data ?? []
              const rows = all.slice(0, CURSOR_PAGE).map((id) => ({ id }))
              return (
                <DataTable
                  caption={t`Voters`}
                  columns={columns}
                  rows={rows}
                  getRowId={(r) => r.id}
                  state={loadState(q)}
                  error={q.error}
                  onRetry={() => void q.refetch()}
                  paging={{
                    kind: 'cursor',
                    ...(all.length > CURSOR_PAGE ? { next: pageLink(page + 1) } : {}),
                    ...(page > 1 ? { prev: pageLink(page - 1) } : {}),
                  }}
                  empty={<Empty kind="none-yet" title={t`No votes for this contender.`} />}
                />
              )
            }}
          />
        </>
      )}
    </Card>
  )
}

function VotesTab({
  ref_,
  state,
  search,
}: {
  ref_: ContestRef
  state: ContestVoteStateDto
  search: ContestPageSearch
}) {
  const { t } = useLingui()
  const net = useNetwork()
  const setSearch = useSetSearch()
  const choice = search.towards ?? 'all'
  const choiceNo =
    choice === 'all'
      ? undefined
      : choice === 'abstain'
        ? VOTE_CHOICE.abstain
        : choice === 'lock'
          ? VOTE_CHOICE.lock
          : VOTE_CHOICE.towards
  const votes = useQuery(
    peQueries.contestedResourceVotes(
      net,
      ref_.indexValues,
      peContestVotesQuery(search.page, choiceNo),
    ),
  )
  const items = votes.data?.data.items ?? []
  const rows =
    choiceNo === VOTE_CHOICE.towards ? items.filter((v) => v.towardsIdentity === choice) : items
  const columns = useMemo<ColumnDef<PeVote>[]>(
    () => [
      {
        id: 'voter',
        header: t`Voter`,
        cell: ({ row }) => <Entity kind="identity" id={row.original.voterIdentifier} identicon />,
        enableSorting: false,
        meta: { phone: 'title' },
      },
      {
        id: 'choice',
        header: t`Choice`,
        cell: ({ row }) =>
          row.original.choice === VOTE_CHOICE.towards && row.original.towardsIdentity ? (
            <span className="flex flex-wrap items-center gap-2">
              <Badge>{t`Towards`}</Badge>
              <IdentityRef id={row.original.towardsIdentity} />
            </span>
          ) : row.original.choice === VOTE_CHOICE.lock ? (
            <Badge tone="danger">{t`Lock`}</Badge>
          ) : (
            <Badge tone="warning">{t`Abstain`}</Badge>
          ),
        enableSorting: false,
        meta: { phone: 'primary' },
      },
      {
        id: 'power',
        header: t`Power`,
        cell: ({ row }) => formatInt(row.original.power ?? 0),
        enableSorting: false,
        meta: { align: 'end', numeric: true, phone: 'secondary' },
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
  return (
    <Card
      layer="platform"
      id="contest-votes"
      title={t`Votes`}
      subtitle={t`Every masternode vote on this contest, from Platform Explorer’s index.`}
      source={votes.data ? stampOf(votes.data) : undefined}
    >
      <SegFilter
        label={t`Choice`}
        value={choice}
        onChange={(id) => {
          setSearch({ towards: id === 'all' ? undefined : id })
        }}
        options={[
          { id: 'all', label: t`All` },
          ...state.contenders.map((c) => ({
            id: c.identityId,
            label: `${c.identityId.slice(0, 8)}…`,
          })),
          { id: 'abstain', label: t`Abstain` },
          { id: 'lock', label: t`Lock` },
        ]}
      />
      <DataTable
        caption={t`Votes`}
        columns={columns}
        rows={rows}
        getRowId={(v) => `${v.proTxHash}:${v.timestamp}`}
        state={loadState(votes)}
        error={votes.error}
        onRetry={() => void votes.refetch()}
        paging={{
          kind: 'page',
          page: search.page,
          limit: PE_CONTEST_VOTES_PAGE,
          total: votes.data?.data.total,
          to: pageLink,
        }}
        empty={<Empty kind="none-yet" title={t`No votes on record.`} />}
      />
    </Card>
  )
}

function RawTab({
  state,
  indexed,
}: {
  state: ContestVoteStateDto | undefined
  indexed: PeContestedResource | undefined
}) {
  const { t } = useLingui()
  return (
    <Card layer="platform" id="contest-raw" title={t`Raw`}>
      <JsonView
        value={{ platform: state ?? null, ...(indexed ? { platformExplorer: indexed } : {}) }}
        label={t`Contest data`}
      />
    </Card>
  )
}
