import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { EChartsOption } from 'echarts'
import { useId, useMemo, useState } from 'react'
import { stampOf } from '@/data/envelope'
import type { HyProposal } from '@/data/hyphen/schemas'
import { Entity, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import {
  Amount,
  Card,
  Chart,
  Empty,
  ErrorState,
  KeyValue,
  Skeleton,
  Stat,
  Time,
  useNow,
} from '@/ui'
import { HyphenGate, StaleIndexNotice } from '../hy-shared/HyphenGate'
import { PageFrame } from '../hy-shared/PageFrame'
import { governanceQueries } from './queries'
import { budgetSplit, netVotes, proposalStatus, type ProposalStatus } from './status'
import { ProposalLinks } from './ProposalLinks'
import { StatusBadge } from './StatusBadge'

export function GovernancePage() {
  const { t } = useLingui()
  return (
    <PageFrame
      path="/governance"
      title={t`Governance`}
      lede={t`Budget proposals and where their votes stand. Voting happens in Governance.`}
    >
      <HyphenGate>
        <GovernanceContent />
      </HyphenGate>
    </PageFrame>
  )
}

const ORDER: Record<ProposalStatus, number> = {
  funded: 0,
  passing: 1,
  failing: 2,
  ended: 3,
  invalid: 4,
}

function GovernanceContent() {
  const { t } = useLingui()
  const net = useNetwork()
  const query = useQuery(governanceQueries.proposals(net))
  const now = useNow(false)
  const proposals = useMemo(
    () =>
      [...(query.data?.data.items ?? [])].sort(
        (a, b) =>
          ORDER[proposalStatus(a, now)] - ORDER[proposalStatus(b, now)] ||
          netVotes(b) - netVotes(a),
      ),
    [query.data, now],
  )
  const split = useMemo(() => budgetSplit(proposals, now), [proposals, now])
  const stamp = query.data ? stampOf(query.data) : undefined

  const option: EChartsOption = {
    tooltip: {
      trigger: 'item',
      valueFormatter: (v) => `${formatInt(Math.round(Number(v)))} DASH`,
    },
    series: [
      {
        type: 'pie',
        name: t`Requested payments`,
        radius: ['58%', '82%'],
        label: { show: false },
        data: [
          { name: t`Funded`, value: Number(split.funded / 100_000_000n) },
          { name: t`Passing, not yet funded`, value: Number(split.passing / 100_000_000n) },
          { name: t`Not passing`, value: Number(split.failing / 100_000_000n) },
        ],
      },
    ],
  }

  return (
    <>
      <StaleIndexNotice />
      <Card
        title={t`Budget`}
        subtitle={t`Open proposals by what their payment would be`}
        layer="network"
        source={stamp}
        state={query.isPending ? 'loading' : 'ready'}
      >
        {query.isError && !query.data ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_1fr] md:items-center">
            <Chart
              option={option}
              height={220}
              label={t`Requested payments of open proposals: funded, passing and not passing`}
              loading={query.isPending}
              table={{
                columns: [t`Status`, t`Proposals`, t`Requested`],
                rows: (['funded', 'passing', 'failing'] as const).map((s) => [
                  s === 'funded'
                    ? t`Funded`
                    : s === 'passing'
                      ? t`Passing, not yet funded`
                      : t`Not passing`,
                  split.count[s],
                  `${formatInt(split[s] / 100_000_000n)} DASH`,
                ]),
              }}
            />
            <div className="grid gap-4 sm:grid-cols-3" data-budget>
              <Stat
                label={t`Funded`}
                value={<Amount value={split.funded} kind="duffs" compact />}
                note={t`${formatInt(split.count.funded)} proposals`}
                tone="good"
              />
              <Stat
                label={t`Passing, not yet funded`}
                value={<Amount value={split.passing} kind="duffs" compact />}
                note={t`${formatInt(split.count.passing)} proposals`}
              />
              <Stat
                label={t`Not passing`}
                value={<Amount value={split.failing} kind="duffs" compact />}
                note={t`${formatInt(split.count.failing)} proposals`}
              />
            </div>
          </div>
        )}
      </Card>

      <Card
        title={t`Proposals`}
        subtitle={
          query.data
            ? t`${formatInt(query.data.data.total ?? proposals.length)} proposals`
            : undefined
        }
        layer="network"
        id="proposals"
        padding="flush"
        source={stamp}
      >
        {query.isPending ? (
          <Skeleton shape="row" count={6} />
        ) : proposals.length === 0 ? (
          <Empty kind="none-yet" title={t`No proposals on this network.`} />
        ) : (
          <ProposalTable proposals={proposals} now={now} />
        )}
      </Card>
    </>
  )
}

function ProposalTable({ proposals, now }: { proposals: HyProposal[]; now: number }) {
  const { t } = useLingui()
  const [open, setOpen] = useState<string | undefined>(undefined)
  const base = useId()
  return (
    <div className="rx-tablewrap rx-tablewrap--scroll">
      <div className="rx-tablescroll">
        <table className="rx-table rx-table--scrolls">
          <caption className="dh-sr">{t`Budget proposals`}</caption>
          <thead>
            <tr>
              <th scope="col">{t`Proposal`}</th>
              <th scope="col">{t`Status`}</th>
              <th scope="col" className="r">{t`Yes`}</th>
              <th scope="col" className="r">{t`No`}</th>
              <th scope="col" className="r">{t`Abstain`}</th>
              <th scope="col" className="r">{t`Net votes`}</th>
              <th scope="col" className="r">{t`Amount`}</th>
              <th scope="col">{t`Ends`}</th>
            </tr>
          </thead>
          {proposals.map((p) => {
            const expanded = open === p.hash
            const panel = `${base}-${p.hash}`
            return (
              <tbody key={p.hash} data-proposal={p.hash}>
                <tr>
                  <td>
                    <button
                      type="button"
                      className="dh-btn dh-btn--link min-h-6 min-w-6"
                      aria-expanded={expanded}
                      aria-controls={panel}
                      onClick={() => {
                        setOpen(expanded ? undefined : p.hash)
                      }}
                    >
                      {p.name}
                    </button>
                  </td>
                  <td>
                    <StatusBadge status={proposalStatus(p, now)} />
                  </td>
                  <td className="r rx-num">{formatInt(p.votes.yes)}</td>
                  <td className="r rx-num">{formatInt(p.votes.no)}</td>
                  <td className="r rx-num">{formatInt(p.votes.abstain)}</td>
                  <td className="r rx-num">
                    {formatInt(netVotes(p))}
                    {p.fundingThreshold == null ? null : (
                      <span className="text-sm"> / {formatInt(p.fundingThreshold)}</span>
                    )}
                  </td>
                  <td className="r">
                    <Amount value={p.paymentAmount} kind="duffs" />
                  </td>
                  <td>
                    <Time ms={p.endTime} mode="absolute" />
                  </td>
                </tr>
                {expanded ? (
                  <tr id={panel} data-proposal-details>
                    <td colSpan={8}>
                      <ProposalDetails p={p} />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            )
          })}
        </table>
      </div>
    </div>
  )
}

function ProposalDetails({ p }: { p: HyProposal }) {
  const { t } = useLingui()
  return (
    <div className="grid gap-3 py-2">
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
                <Time ms={p.startTime} mode="absolute" /> – <Time ms={p.endTime} mode="absolute" />
              </>
            ),
          },
          {
            label: t`Created`,
            value: p.creationTime == null ? '—' : <Time ms={p.creationTime} mode="absolute" />,
          },
          ...(p.collateralHash
            ? [{ label: t`Collateral`, value: <Entity kind="tx" id={p.collateralHash} /> }]
            : []),
          {
            label: t`Funding threshold`,
            value: p.fundingThreshold == null ? '—' : t`${formatInt(p.fundingThreshold)} net votes`,
          },
        ]}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/governance/$hash" params={{ hash: p.hash }} className="dh-btn dh-btn--sm">
          {t`Open the proposal`}
        </Link>
        <ProposalLinks p={p} />
      </div>
    </div>
  )
}
