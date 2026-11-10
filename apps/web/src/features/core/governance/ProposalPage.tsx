import { useLingui } from '@lingui/react/macro'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { stampOf } from '@/data/envelope'
import type { HyProposalVote } from '@/data/hyphen/schemas'
import { Entity, PageLink, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import {
  Amount,
  Badge,
  Card,
  DataTable,
  Empty,
  Hash,
  KeyValue,
  QueryView,
  Skeleton,
  Stat,
  Time,
  useNow,
} from '@/ui'
import { HyphenGate, StaleIndexNotice } from '../hy-shared/HyphenGate'
import { PageFrame } from '../hy-shared/PageFrame'
import { ProposalLinks } from './ProposalLinks'
import { governanceQueries } from './queries'
import { netVotes, proposalStatus, totalVotes } from './status'
import { StatusBadge } from './StatusBadge'

export function ProposalPage({ hash }: { hash: string }) {
  const { t } = useLingui()
  return (
    <PageFrame path="/governance/$hash" title={t`Proposal`} eyebrow={t`Governance`}>
      <HyphenGate>
        <ProposalContent hash={hash} />
      </HyphenGate>
    </PageFrame>
  )
}

function ProposalContent({ hash }: { hash: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const query = useQuery(governanceQueries.proposal(net, hash))
  const now = useNow(false)

  return (
    <>
      <StaleIndexNotice />
      <QueryView
        query={query}
        skeleton={<Skeleton shape="block" height={160} />}
        isEmpty={(p) => p === null}
        empty={
          <Empty
            kind="not-found"
            title={t`No proposal with this hash on this network.`}
            body={<Hash value={hash} display="wrap" />}
            action={<PageLink to="/governance">{t`All proposals`}</PageLink>}
          />
        }
      >
        {(p, stamp) =>
          p === null ? null : (
            <>
              <header className="grid gap-2">
                <h2 className="text-2xl font-semibold" data-proposal-name>
                  {p.name} <StatusBadge status={proposalStatus(p, now)} />
                </h2>
                <Hash value={p.hash} display="wrap" />
              </header>
              <Card title={t`Votes`} layer="network" source={stamp}>
                <div className="grid gap-4 sm:grid-cols-4" data-votes>
                  <Stat label={t`Yes`} value={formatInt(p.votes.yes)} tone="good" />
                  <Stat label={t`No`} value={formatInt(p.votes.no)} tone="bad" />
                  <Stat label={t`Abstain`} value={formatInt(p.votes.abstain)} />
                  <Stat
                    label={t`Net votes`}
                    value={formatInt(netVotes(p))}
                    note={
                      p.fundingThreshold == null
                        ? undefined
                        : t`${formatInt(p.fundingThreshold)} needed · ${formatInt(totalVotes(p))} cast`
                    }
                    meter={
                      p.fundingThreshold
                        ? { value: Math.max(0, netVotes(p)), max: p.fundingThreshold }
                        : undefined
                    }
                  />
                </div>
              </Card>
              <Card title={t`Details`} layer="network" source={stamp}>
                <KeyValue
                  columns={2}
                  items={[
                    { label: t`Paid to`, value: <Entity kind="address" id={p.paymentAddress} /> },
                    {
                      label: t`Amount per cycle`,
                      value: <Amount value={p.paymentAmount} kind="duffs" fiat />,
                    },
                    {
                      label: t`Voting window`,
                      value: (
                        <>
                          <Time ms={p.startTime} mode="absolute" /> –{' '}
                          <Time ms={p.endTime} mode="absolute" />
                        </>
                      ),
                    },
                    {
                      label: t`Created`,
                      value:
                        p.creationTime == null ? '—' : <Time ms={p.creationTime} mode="absolute" />,
                    },
                    ...(p.collateralHash
                      ? [
                          {
                            label: t`Collateral`,
                            value: <Entity kind="tx" id={p.collateralHash} />,
                          },
                        ]
                      : []),
                    {
                      label: t`Counted as valid`,
                      value: p.valid === false ? t`No` : t`Yes`,
                    },
                  ]}
                />
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <ProposalLinks p={p} />
                </div>
              </Card>
              <VoteHistory hash={hash} />
            </>
          )
        }
      </QueryView>
    </>
  )
}

function VoteHistory({ hash }: { hash: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const votes = useInfiniteQuery(governanceQueries.votes(net, hash))
  const rows = votes.data?.pages.flatMap((p) => p.data.items) ?? []

  const columns = useMemo<ColumnDef<HyProposalVote>[]>(
    () => [
      {
        id: 'node',
        header: t`Masternode`,
        cell: ({ row }) => <Entity kind="masternode" id={row.original.proTxHash} />,
        meta: { phone: 'title' },
      },
      {
        id: 'vote',
        header: t`Vote`,
        cell: ({ row }) => {
          const v = row.original.vote.toLowerCase()
          return (
            <Badge tone={v === 'yes' ? 'success' : v === 'no' ? 'danger' : 'neutral'}>
              {v === 'yes'
                ? t`Yes`
                : v === 'no'
                  ? t`No`
                  : v === 'abstain'
                    ? t`Abstain`
                    : row.original.vote}
            </Badge>
          )
        },
        meta: { phone: 'primary' },
      },
      {
        id: 'time',
        header: t`When`,
        cell: ({ row }) => <Time ms={row.original.voteTime} mode="absolute" />,
        meta: { phone: 'secondary' },
      },
    ],
    [t],
  )

  return (
    <Card
      title={t`Vote history`}
      layer="network"
      id="vote-history"
      padding="flush"
      source={votes.data?.pages[0] ? stampOf(votes.data.pages[0]) : undefined}
    >
      <DataTable
        caption={t`Masternode votes on this proposal, newest first`}
        columns={columns}
        rows={rows}
        getRowId={(r) => `${r.proTxHash}:${r.voteTime}`}
        state={
          votes.isPending
            ? 'loading'
            : votes.isError && rows.length === 0
              ? 'error'
              : rows.length === 0
                ? 'empty'
                : 'ready'
        }
        error={votes.error}
        onRetry={() => void votes.refetch()}
        empty={<Empty kind="none-yet" title={t`No votes recorded for this proposal.`} />}
        paging={{
          kind: 'infinite',
          hasNext: votes.hasNextPage,
          fetchNext: () => void votes.fetchNextPage(),
          fetching: votes.isFetchingNextPage,
        }}
      />
    </Card>
  )
}
