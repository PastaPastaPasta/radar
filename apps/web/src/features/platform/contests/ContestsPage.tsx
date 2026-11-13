import { useLingui } from '@lingui/react/macro'
import { useQueries, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState, type ReactNode } from 'react'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { peQueries } from '@/data/pe/queries'
import type { PeContestedResource } from '@/data/pe/schemas'
import {
  contestVoteStateArgs,
  DPNS,
  peContestsQuery,
  type ContestsFilters,
} from '@/data/query/prefetch/p-vote'
import { sdkQueries } from '@/data/sdk/queries'
import { Entity, PageFrame, PageGroupTabs, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
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
  Stat,
  Stats,
  TableTools,
  Time,
  Unavailable,
  type DataTableProps,
  type LoadState,
} from '@/ui'
import { CURSOR_PAGE, CursorPages } from '../contest/CursorPages'
import { loadState, pageLink, usePeList, useSetSearch, useUpcomingPolls } from '../contest/shared'
import { TallyText } from '../contest/Tally'

export type ContestsPageSearch = ContestsFilters

const lastValue = (values: readonly string[]): string => values[values.length - 1] ?? ''

/** The contest a row names: DPNS contests by label alone, anything else with the place to look it up. */
function contestLink(
  values: readonly string[],
  contract: string | null | undefined,
  type: string | null | undefined,
  index: string | null | undefined,
) {
  const dpns = !contract || (contract === DPNS.contractId() && type === DPNS.type)
  return {
    id: lastValue(values),
    search: dpns
      ? undefined
      : { contract: contract ?? undefined, type: type ?? undefined, index: index ?? undefined },
  }
}

export function ContestsPage({ search }: { search: ContestsPageSearch }) {
  const { t } = useLingui()
  const decentralized = useDecentralizedOnly()
  const wanted = search.status ?? []
  const onlyFinished = wanted.length > 0 && !wanted.includes('active')
  return (
    <PageFrame
      path="/contests"
      title={t`Name contests`}
      eyebrow={t`Platform`}
      layer="platform"
      lede={t`Active contested names with end time, votes and status.`}
    >
      <PageGroupTabs group="voting" />
      <Filters search={search} />
      {onlyFinished ? null : <OpenContests search={search} />}
      {decentralized ? (
        <>
          {search.contract || search.type || wanted.includes('active') ? null : (
            <AllDpnsContests search={search} />
          )}
          <Unavailable
            title={t`Platform Explorer’s totals, full list and date filters need its index`}
          />
        </>
      ) : (
        <>
          <ContestStats />
          <AllContests search={search} />
        </>
      )}
    </PageFrame>
  )
}

const statusOf = (search: ContestsPageSearch): '' | 'active' | 'finished' =>
  search.status?.includes('active')
    ? 'active'
    : search.status && search.status.length > 0
      ? 'finished'
      : ''

function Filters({ search }: { search: ContestsPageSearch }) {
  const { t } = useLingui()
  const setFilters = useSetSearch()
  const decentralized = useDecentralizedOnly()
  return (
    <TableTools>
      <SegFilter
        label={t`Status`}
        value={statusOf(search)}
        onChange={(id) => {
          setFilters({ status: id === '' ? undefined : [id] })
        }}
        options={[
          { id: '', label: t`All` },
          { id: 'active', label: t`Active` },
          { id: 'finished', label: t`Finished` },
        ]}
      />
      <ContractTypeForm key={`${search.contract ?? ''}|${search.type ?? ''}`} search={search} />
      {decentralized ? null : (
        <>
          <DateRangeFilter
            label={t`Started`}
            from={search.from}
            to={search.to}
            onChange={(r) => {
              setFilters({ from: r.from, to: r.to })
            }}
          />
          <SegFilter
            label={t`Order`}
            value={search.sort === 'oldest' ? 'oldest' : 'newest'}
            onChange={(id) => {
              setFilters({ sort: id === 'oldest' ? 'oldest' : undefined })
            }}
            options={[
              { id: 'newest', label: t`Newest first` },
              { id: 'oldest', label: t`Oldest first` },
            ]}
          />
          <ListModeToggle listId="contests" />
        </>
      )}
    </TableTools>
  )
}

function ContractTypeForm({ search }: { search: ContestsPageSearch }) {
  const { t } = useLingui()
  const setFilters = useSetSearch()
  const [contract, setContract] = useState(search.contract ?? '')
  const [type, setType] = useState(search.type ?? '')
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        setFilters({ contract: contract.trim() || undefined, type: type.trim() || undefined })
      }}
    >
      <SearchField
        label={t`Contract ID`}
        value={contract}
        onChange={setContract}
        placeholder={t`Contract ID`}
      />
      <SearchField
        label={t`Document type`}
        value={type}
        onChange={setType}
        placeholder={t`Document type`}
      />
      <button type="submit" className="dh-btn dh-btn--sm">
        {t`Apply`}
      </button>
    </form>
  )
}

function ContestStats() {
  const { t } = useLingui()
  const net = useNetwork()
  const stats = useQuery(peQueries.contestedResourcesStats(net))
  const s = stats.data?.data
  return (
    <Card
      layer="platform"
      id="contest-stats"
      title={t`Contests at a glance`}
      source={stats.data ? stampOf(stats.data) : undefined}
      state={loadState(stats)}
      error={stats.error}
      onRetry={() => void stats.refetch()}
    >
      <Stats>
        <Stat label={t`Contests`} value={s ? formatInt(s.totalContestedResources) : '—'} />
        <Stat label={t`Open now`} value={s ? formatInt(s.totalPendingContestedResources) : '—'} />
        <Stat label={t`Votes cast`} value={s ? formatInt(s.totalVotesCount) : '—'} />
      </Stats>
    </Card>
  )
}

interface SdkRow {
  key: string
  contractId: string
  type: string
  index: string
  indexValues: string[]
  endsAt?: number | undefined
}

interface RowTable {
  id: string
  title: string
  subtitle: string
  caption: string
  rows: SdkRow[]
  state: LoadState
  error?: unknown
  onRetry?: () => void
  source: SourceStamp[]
  paging: DataTableProps<unknown>['paging']
  empty: ReactNode
}

/** Contests read from Platform: each row's tally and outcome come from its own proof-checked vote state. */
function SdkContestTable(props: RowTable) {
  const { t } = useLingui()
  const net = useNetwork()
  const states = useQueries({
    queries: props.rows.map((r) =>
      sdkQueries['voting.contestedResourceVoteState'](net, contestVoteStateArgs(r)),
    ),
  })
  const rows = props.rows.map((r, i) => ({ ...r, query: states[i]! }))
  const stamps = [...props.source, ...states.flatMap((q) => (q.data ? [stampOf(q.data)] : []))]
  const columns = useMemo<ColumnDef<(typeof rows)[number]>[]>(
    () => [
      {
        id: 'name',
        header: t`Name`,
        cell: ({ row }) => {
          const r = row.original
          const c = contestLink(r.indexValues, r.contractId, r.type, r.index)
          return (
            <Entity
              kind="contest"
              id={c.id}
              search={c.search}
              {...(c.search ? {} : { label: `${c.id}.dash` })}
            />
          )
        },
        enableSorting: false,
        meta: { phone: 'title' },
      },
      {
        id: 'status',
        header: t`Status`,
        cell: ({ row }) => {
          const s = row.original.query.data?.data
          if (!s) return row.original.query.isError ? t`Unavailable` : t`Loading…`
          return s.winner?.kind === 'won' ? (
            <Badge tone="info">{t`Won`}</Badge>
          ) : s.winner?.kind === 'locked' ? (
            <Badge tone="warning">{t`Locked`}</Badge>
          ) : s.winner ? (
            <Badge>{t`Decided`}</Badge>
          ) : (
            <Badge tone="success">{t`Active`}</Badge>
          )
        },
        enableSorting: false,
        meta: { phone: 'primary' },
      },
      {
        id: 'tally',
        header: t`Votes`,
        cell: ({ row }) => {
          const s = row.original.query.data?.data
          return s ? <TallyText state={s} /> : '—'
        },
        enableSorting: false,
        meta: { phone: 'secondary' },
      },
      {
        id: 'contenders',
        header: t`Contenders`,
        cell: ({ row }) => {
          const n = row.original.query.data?.data.contenders.length
          return n === undefined ? '—' : formatInt(n)
        },
        enableSorting: false,
        meta: { align: 'end', numeric: true, phone: 'hidden' },
      },
      {
        id: 'ends',
        header: t`Voting ends`,
        cell: ({ row }) =>
          row.original.endsAt ? <Time ms={row.original.endsAt} mode="both" /> : '—',
        enableSorting: false,
        meta: { phone: 'secondary' },
      },
    ],
    [t],
  )
  return (
    <Card
      layer="platform"
      id={props.id}
      title={props.title}
      subtitle={props.subtitle}
      source={stamps.length > 0 ? stamps : undefined}
    >
      <DataTable
        caption={props.caption}
        columns={columns}
        rows={rows}
        getRowId={(r) => r.key}
        state={props.state}
        error={props.error}
        onRetry={props.onRetry}
        paging={props.paging}
        empty={props.empty}
      />
    </Card>
  )
}

/** The contests still open: Platform schedules every one's end in its poll tree, so that list is exact. */
function OpenContests({ search }: { search: ContestsPageSearch }) {
  const { t } = useLingui()
  const contractId = search.contract ?? DPNS.contractId()
  const type = search.type ?? DPNS.type
  const polls = useUpcomingPolls()
  const all: SdkRow[] = (polls.data?.data ?? []).flatMap((bucket) =>
    bucket.polls
      .filter((p) => p.contractId === contractId && p.documentTypeName === type)
      .map((p) => ({
        key: `${bucket.timestampMs}:${p.indexValues.join('/')}`,
        contractId,
        type,
        index: p.indexName,
        indexValues: p.indexValues.map(String),
        endsAt: bucket.timestampMs,
      })),
  )
  const rows = all.slice((search.page - 1) * search.limit, search.page * search.limit)
  return (
    <SdkContestTable
      id="contests-active"
      title={t`Open contests`}
      subtitle={t`Read from Platform and proof-checked: the contests still open, with their current tallies.`}
      caption={t`Open contests`}
      rows={rows}
      state={loadState(polls)}
      error={polls.error}
      onRetry={() => void polls.refetch()}
      source={polls.data ? [stampOf(polls.data)] : []}
      paging={{
        kind: 'page',
        page: search.page,
        limit: search.limit,
        total: all.length,
        to: pageLink,
      }}
      empty={<Empty kind="none-yet" title={t`No contest is open.`} />}
    />
  )
}

/** Every DPNS contest ever held, A to Z, from Platform alone: for when no index is in use. */
function AllDpnsContests({ search }: { search: ContestsPageSearch }) {
  const { t } = useLingui()
  const net = useNetwork()
  return (
    <CursorPages
      target={search.page}
      cursor={undefined}
      cursorOf={(label: string) => label}
      queryFor={(cursor) =>
        sdkQueries['group.contestedResources'](net, {
          contractId: DPNS.contractId(),
          type: DPNS.type,
          index: DPNS.index,
          prefix: [DPNS.tld],
          limit: CURSOR_PAGE + 1,
          ...(cursor ? { startAt: cursor, startAtIncluded: false } : {}),
        })
      }
      render={(q) => {
        const labels = q.data?.data ?? []
        const rows: SdkRow[] = labels.slice(0, CURSOR_PAGE).map((label) => ({
          key: label,
          contractId: DPNS.contractId(),
          type: DPNS.type,
          index: DPNS.index,
          indexValues: [DPNS.tld, label],
        }))
        return (
          <SdkContestTable
            id="contests-sdk-all"
            title={t`All name contests`}
            subtitle={t`Every contest Platform still holds, in name order. A contest’s end time is shown while it is open.`}
            caption={t`All name contests`}
            rows={rows}
            state={loadState(q)}
            error={q.error}
            onRetry={() => void q.refetch()}
            source={q.data ? [stampOf(q.data)] : []}
            paging={{
              kind: 'cursor',
              ...(labels.length > CURSOR_PAGE ? { next: pageLink(search.page + 1) } : {}),
              ...(search.page > 1 ? { prev: pageLink(search.page - 1) } : {}),
            }}
            empty={<Empty kind="none-yet" title={t`No contests on record.`} />}
          />
        )
      }}
    />
  )
}

function AllContests({ search }: { search: ContestsPageSearch }) {
  const { t } = useLingui()
  const net = useNetwork()
  const list = usePeList('contests', search, (page, limit) =>
    peQueries.contestedResources(net, peContestsQuery({ ...search, limit }, page)),
  )
  const columns = useMemo<ColumnDef<PeContestedResource>[]>(
    () => [
      {
        id: 'value',
        header: t`Value`,
        cell: ({ row }) => {
          const r = row.original
          const c = contestLink(
            r.resourceValue ?? [],
            r.dataContractIdentifier,
            r.documentTypeName,
            r.indexName,
          )
          return <Entity kind="contest" id={c.id} search={c.search} />
        },
        enableSorting: false,
        meta: { phone: 'title' },
      },
      {
        id: 'status',
        header: t`Status`,
        cell: ({ row }) =>
          row.original.finished ? (
            <Badge>{t`Finished`}</Badge>
          ) : (
            <Badge tone="success">{t`Active`}</Badge>
          ),
        enableSorting: false,
        meta: { phone: 'primary' },
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
        id: 'index',
        header: t`Index`,
        accessorFn: (r) => r.indexName ?? '',
        enableSorting: false,
        meta: { phone: 'hidden' },
      },
      {
        id: 'type',
        header: t`Type`,
        accessorFn: (r) => r.documentTypeName ?? '',
        enableSorting: false,
        meta: { phone: 'hidden' },
      },
      {
        id: 'votes',
        header: t`Votes`,
        cell: ({ row }) => formatInt(row.original.totalCountVotes ?? 0),
        enableSorting: false,
        meta: { align: 'end', numeric: true, phone: 'secondary' },
      },
      {
        id: 'end',
        header: t`Ends`,
        cell: ({ row }) =>
          row.original.endTimestamp ? <Time ms={row.original.endTimestamp} mode="absolute" /> : '—',
        enableSorting: false,
        meta: { phone: 'secondary' },
      },
    ],
    [t],
  )
  const setFilters = useSetSearch()
  const status = statusOf(search)
  const tokens = [
    ...(search.contract ? [{ id: 'contract', label: t`Contract: ${search.contract}` }] : []),
    ...(search.type ? [{ id: 'type', label: t`Type: ${search.type}` }] : []),
    ...(status
      ? [{ id: 'status', label: status === 'active' ? t`Status: Active` : t`Status: Finished` }]
      : []),
    ...(search.from || search.to
      ? [{ id: 'dates', label: t`Started ${search.from ?? ''}–${search.to ?? ''}` }]
      : []),
  ]
  return (
    <>
      {tokens.length > 0 ? (
        <ActiveFilters
          matches={list.total ?? list.rows.length}
          tokens={tokens}
          onRemove={(id) => {
            setFilters(id === 'dates' ? { from: undefined, to: undefined } : { [id]: undefined })
          }}
          onClear={() => {
            setFilters({
              contract: undefined,
              type: undefined,
              status: undefined,
              from: undefined,
              to: undefined,
            })
          }}
        />
      ) : null}
      <Card
        layer="platform"
        id="contests-all"
        title={t`All contests`}
        subtitle={t`From Platform Explorer’s index: every contest that has been held, with its vote count.`}
        source={list.pages.map(stampOf)}
      >
        <DataTable
          caption={t`All contests`}
          columns={columns}
          rows={list.rows}
          getRowId={(r) => `${r.dataContractIdentifier ?? ''}/${(r.resourceValue ?? []).join('/')}`}
          state={list.state}
          error={list.error}
          onRetry={list.onRetry}
          paging={list.paging}
          empty={<Empty kind="no-match" title={t`No contests match.`} />}
        />
      </Card>
    </>
  )
}
