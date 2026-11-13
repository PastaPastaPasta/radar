import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { stampOf } from '@/data/envelope'
import {
  customPollsArgs,
  DPNS,
  POLL_BUCKETS,
  POLLS_PAGE,
  POLL_RANGE_MS,
  upcomingPollsArgs,
} from '@/data/query/prefetch/p-vote'
import type { VotePollDto } from '@/data/sdk/methods'
import { sdkQueries } from '@/data/sdk/queries'
import { Entity, PageFrame, PageGroupTabs, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Card, DataTable, DateRangeFilter, Empty, SegFilter, TableTools, Time } from '@/ui'
import { loadState, pageLink, useSetSearch } from '../contest/shared'

export type PollRange = '24h' | '7d' | '30d' | '90d' | 'upcoming' | 'custom'

export interface PollsPageSearch {
  range: PollRange
  from?: string | undefined
  to?: string | undefined
  dir: 'asc' | 'desc'
  page: number
}

interface PollRow {
  key: string
  endsAt: number
  poll: VotePollDto
}

const RANGES: PollRange[] = ['24h', '7d', '30d', '90d', 'upcoming', 'custom']

/** The contest a poll belongs to: a DPNS name by its label, anything else with the place to look it up. */
export function pollContest(p: VotePollDto): { id: string; search?: Record<string, string> } {
  const tail = p.indexValues[p.indexValues.length - 1]
  const id = typeof tail === 'string' || typeof tail === 'number' ? String(tail) : ''
  const dpns = p.documentTypeName === DPNS.type && p.contractId === DPNS.contractId()
  return dpns
    ? { id }
    : { id, search: { contract: p.contractId, type: p.documentTypeName, index: p.indexName } }
}

export function PollsPage({ search }: { search: PollsPageSearch }) {
  const { t } = useLingui()
  const net = useNetwork()
  const set = useSetSearch()
  const [now] = useState(() => Date.now())
  const custom = search.range === 'custom'
  const polls = useQuery(
    sdkQueries['voting.votePollsByEndDate'](
      net,
      custom ? customPollsArgs(search.from, search.to) : upcomingPollsArgs(),
    ),
  )
  const buckets = polls.data?.data
  const all = useMemo<PollRow[]>(() => {
    const limit =
      search.range === '24h' ||
      search.range === '7d' ||
      search.range === '30d' ||
      search.range === '90d'
        ? now + POLL_RANGE_MS[search.range]
        : Infinity
    const rows = (buckets ?? [])
      .filter((b) => b.timestampMs <= limit)
      .flatMap((b) =>
        b.polls.map((poll, i) => ({ key: `${b.timestampMs}:${i}`, endsAt: b.timestampMs, poll })),
      )
    return search.dir === 'desc' ? rows.reverse() : rows
  }, [buckets, search.range, search.dir, now])
  const rows = all.slice((search.page - 1) * POLLS_PAGE, search.page * POLLS_PAGE)
  const capped = (buckets?.length ?? 0) >= POLL_BUCKETS

  const columns = useMemo<ColumnDef<PollRow>[]>(
    () => [
      {
        id: 'contest',
        header: t`Contest`,
        cell: ({ row }) => {
          const c = pollContest(row.original.poll)
          return <Entity kind="contest" id={c.id} search={c.search} />
        },
        meta: { phone: 'title' },
      },
      {
        id: 'ends',
        header: t`Voting ends`,
        cell: ({ row }) => <Time ms={row.original.endsAt} mode="both" />,
        meta: { phone: 'primary' },
      },
      {
        id: 'resource',
        header: t`Resource`,
        accessorFn: (r) => `${r.poll.documentTypeName} · ${r.poll.indexName}`,
        meta: { phone: 'secondary' },
      },
    ],
    [t],
  )

  const label = (r: PollRange): string =>
    r === '24h'
      ? t`24h`
      : r === '7d'
        ? t`7d`
        : r === '30d'
          ? t`30d`
          : r === '90d'
            ? t`90d`
            : r === 'upcoming'
              ? t`Upcoming`
              : t`Custom`

  return (
    <PageFrame
      path="/polls"
      title={t`Vote polls`}
      eyebrow={t`Platform`}
      layer="platform"
      lede={t`Upcoming vote polls by end date.`}
    >
      <PageGroupTabs group="voting" />
      <TableTools>
        <SegFilter
          label={t`Ends within`}
          value={search.range}
          onChange={(id) => {
            set({ range: id, ...(id === 'custom' ? {} : { from: undefined, to: undefined }) })
          }}
          options={RANGES.map((r) => ({ id: r, label: label(r) }))}
        />
        {custom ? (
          <DateRangeFilter
            label={t`Ends between`}
            from={search.from}
            to={search.to}
            onChange={(r) => {
              set({ from: r.from, to: r.to })
            }}
          />
        ) : null}
        <SegFilter
          label={t`Order`}
          value={search.dir}
          onChange={(id) => {
            set({ dir: id })
          }}
          options={[
            { id: 'asc', label: t`Soonest first` },
            { id: 'desc', label: t`Latest first` },
          ]}
        />
      </TableTools>
      <Card layer="platform" id="polls-list" source={polls.data ? stampOf(polls.data) : undefined}>
        <DataTable
          caption={t`Vote polls`}
          columns={columns}
          rows={rows}
          getRowId={(r) => r.key}
          state={loadState(polls)}
          error={polls.error}
          onRetry={() => void polls.refetch()}
          paging={{
            kind: 'page',
            page: search.page,
            limit: POLLS_PAGE,
            total: all.length,
            to: pageLink,
          }}
          empty={<Empty kind="none-yet" title={t`No vote polls end in this range.`} />}
        />
        {capped ? (
          <p className="rx-dim">
            {t`Showing the first ${formatInt(POLL_BUCKETS)} end dates Platform returned.`}
          </p>
        ) : null}
      </Card>
    </PageFrame>
  )
}
