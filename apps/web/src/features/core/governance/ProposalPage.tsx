import { useLingui } from '@lingui/react/macro'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import type { HyProposalVote } from '@/data/hyphen/schemas'
import { useIndexHealth } from '@/data/index-health'
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
import { firstPageStamp, infiniteTableProps } from '../hy-shared/infinite-list'
import { PageFrame } from '../hy-shared/PageFrame'
import { DerivedFundingNote } from './DerivedFundingNote'
import { ProposalLinks } from './ProposalLinks'
import { governanceQueries, insightGovernanceQueries } from './queries'
import { netVotes, proposalStatus, totalVotes } from './status'
import { StatusBadge } from './StatusBadge'

export function ProposalPage({ hash }: { hash: string }) {
  const { t } = useLingui()
  return (
    <PageFrame path="/governance/$hash" title={t`Proposal`} eyebrow={t`Governance`}>
      <HyphenGate unavailable={t`Governance proposals need an indexer`}>
        <ProposalContent hash={hash} />
      </HyphenGate>
    </PageFrame>
  )
}

function ProposalContent({ hash }: { hash: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const index = useIndexHealth(net)
  const insight = index.readFrom === 'insight'
  const hy = useQuery({
    ...governanceQueries.proposal(net, hash),
    enabled: !index.pending && !insight,
  })
  const ins = useQuery({ ...insightGovernanceQueries.proposal(net, hash), enabled: insight })
  // Insight lists only the proposals its node still holds; one it lacks may be in Hyphen's older index.
  const missing = insight && ins.isSuccess && ins.data.data === null
  const older = useQuery({ ...governanceQueries.proposal(net, hash), enabled: missing })
  const fromInsight = insight && !missing
  const query = !insight ? hy : missing ? older : ins
  const now = useNow(false)

  return (
    <>
      <StaleIndexNotice
        reads="insight"
        scope={
          missing
            ? t`This proposal and its vote history are from Hyphen’s index, as of that block, not live.`
            : undefined
        }
      />
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
                {fromInsight ? (
                  <DerivedFundingNote proposals={[p]} className="rx-note mb-3" />
                ) : null}
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
                    ...(fromInsight
                      ? []
                      : [
                          {
                            label: t`Counted as valid`,
                            value: p.valid === false ? t`No` : t`Yes`,
                          },
                        ]),
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
  const table = infiniteTableProps(votes)

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
      source={firstPageStamp(votes)}
    >
      <DataTable
        caption={t`Masternode votes on this proposal, newest first`}
        columns={columns}
        {...table}
        getRowId={(r) => `${r.proTxHash}:${r.voteTime}`}
        empty={<Empty kind="none-yet" title={t`No votes recorded for this proposal.`} />}
      />
    </Card>
  )
}
