import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { EChartsOption } from 'echarts'
import { useCallback, useId, useMemo, useState } from 'react'
import { stampOf } from '@/data/envelope'
import { useIndexHealth } from '@/data/index-health'
import type { HyProposal } from '@/data/hyphen/schemas'
import { Entity, useNetwork } from '@/features/entity'
import { formatDate, formatInt, formatIsoUtc } from '@/lib/format'
import {
  Amount,
  Card,
  Chart,
  Empty,
  ErrorState,
  Icon,
  KeyValue,
  SearchField,
  SegFilter,
  Skeleton,
  Stat,
  TableTools,
  Time,
  useNow,
} from '@/ui'
import { HyphenGate, StaleIndexNotice } from '../hy-shared/HyphenGate'
import { PageFrame } from '../hy-shared/PageFrame'
import { governanceQueries, insightGovernanceQueries } from './queries'
import { budgetSplit, netVotes, proposalStatus, type ProposalStatus } from './status'
import { ProposalLinks } from './ProposalLinks'
import { DerivedFundingNote } from './DerivedFundingNote'
import { StatusBadge } from './StatusBadge'

export function GovernancePage() {
  const { t } = useLingui()
  return (
    <PageFrame
      path="/governance"
      title={t`Governance`}
      lede={t`Budget proposals and where their votes stand. Voting happens in Governance.`}
    >
      <HyphenGate unavailable={t`Governance proposals need an indexer`}>
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
  const index = useIndexHealth(net)
  const insight = index.readFrom === 'insight'
  // While Insight is the source, Hyphen's list still holds the proposals Insight's node no longer has.
  const hy = useQuery({ ...governanceQueries.proposals(net), enabled: !index.pending })
  const ins = useQuery({ ...insightGovernanceQueries.proposals(net), enabled: insight })
  const query = insight ? ins : hy
  const waiting = index.pending || query.isPending
  const now = useNow(false)
  const rank = useMemo(
    () => (list: readonly HyProposal[]) =>
      [...list].sort(
        (a, b) =>
          ORDER[proposalStatus(a, now)] - ORDER[proposalStatus(b, now)] ||
          netVotes(b) - netVotes(a),
      ),
    [now],
  )
  const data = index.pending ? undefined : query.data
  const proposals = useMemo(() => rank(data?.data.items ?? []), [data, rank])
  const earlier = useMemo(() => {
    if (!insight || !hy.data) return []
    const current = new Set(proposals.map((p) => p.hash))
    return rank(hy.data.data.items.filter((p) => !current.has(p.hash)))
  }, [insight, hy.data, proposals, rank])
  const split = useMemo(() => budgetSplit(proposals, now), [proposals, now])
  const stamp = data ? stampOf(data) : undefined
  const stamps = hy.data && earlier.length > 0 && stamp ? [stamp, stampOf(hy.data)] : stamp

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
      <StaleIndexNotice
        reads="insight"
        scope={
          earlier.length > 0
            ? t`Earlier proposals below are from Hyphen’s index, as of that block, not live.`
            : undefined
        }
      />
      <Card
        title={t`Budget`}
        subtitle={t`Open proposals by what their payment would be`}
        layer="network"
        source={stamp}
        state={waiting ? 'loading' : 'ready'}
      >
        {query.isError && !query.data ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_1fr] md:items-center">
            <Chart
              option={option}
              height={220}
              label={t`Requested payments of open proposals: funded, passing and not passing`}
              loading={waiting}
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
        subtitle={data ? t`${formatInt(data.data.total ?? proposals.length)} proposals` : undefined}
        layer="network"
        id="proposals"
        padding="flush"
        source={stamps}
      >
        {insight && data ? <DerivedFundingNote proposals={proposals} /> : null}
        {waiting ? (
          <Skeleton shape="row" count={6} />
        ) : proposals.length === 0 && earlier.length === 0 ? (
          <Empty kind="none-yet" title={t`No proposals on this network.`} />
        ) : (
          <ProposalList proposals={proposals} earlier={earlier} now={now} />
        )}
        {insight && hy.isError && !hy.data ? (
          <p role="status" className="rx-note p-3" data-earlier-missing>
            {t`Earlier proposals could not be read from Hyphen.`}
          </p>
        ) : null}
      </Card>
    </>
  )
}

type StatusFilter = 'all' | 'funded' | 'passing' | 'failing' | 'ended'

/** A proposal matches a typed fragment of its name or hash, ignoring case. */
export function matchesText(p: Pick<HyProposal, 'name' | 'hash'>, text: string): boolean {
  const needle = text.trim().toLowerCase()
  return (
    needle === '' || p.name.toLowerCase().includes(needle) || p.hash.toLowerCase().includes(needle)
  )
}

/** The proposals with a name or hash and a status the reader asked for; invalid ones show under "All" only. */
function ProposalList({
  proposals,
  earlier,
  now,
}: {
  proposals: HyProposal[]
  earlier: HyProposal[]
  now: number
}) {
  const { t } = useLingui()
  const [text, setText] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const all = useMemo(() => [...proposals, ...earlier], [proposals, earlier])
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: 0, funded: 0, passing: 0, failing: 0, ended: 0 }
    for (const p of all) {
      if (!matchesText(p, text)) continue
      c.all++
      const s = proposalStatus(p, now)
      if (s !== 'invalid') c[s]++
    }
    return c
  }, [all, text, now])
  const keep = useCallback(
    (p: HyProposal) =>
      matchesText(p, text) && (status === 'all' || proposalStatus(p, now) === status),
    [text, status, now],
  )
  const shown = useMemo(() => proposals.filter(keep), [proposals, keep])
  const shownEarlier = useMemo(() => earlier.filter(keep), [earlier, keep])
  const filtering = text.trim() !== '' || status !== 'all'
  return (
    <>
      <TableTools>
        <SearchField
          label={t`Filter proposals by name or hash`}
          placeholder={t`Name or hash`}
          value={text}
          onChange={setText}
        />
        <SegFilter
          label={t`Filter proposals by status`}
          value={status}
          onChange={(id) => {
            setStatus(id as StatusFilter)
          }}
          options={[
            { id: 'all', label: t`All`, count: counts.all },
            { id: 'funded', label: t`Funded`, count: counts.funded },
            { id: 'passing', label: t`Passing`, count: counts.passing },
            { id: 'failing', label: t`Not passing`, count: counts.failing },
            { id: 'ended', label: t`Ended`, count: counts.ended },
          ]}
        />
      </TableTools>
      <p
        className={filtering ? 'rx-note m-0 px-4 py-2' : 'sr-only'}
        role="status"
        data-filter-result
      >
        {filtering
          ? t`${formatInt(shown.length + shownEarlier.length)} of ${formatInt(all.length)} proposals match`
          : null}
      </p>
      {shown.length + shownEarlier.length === 0 ? (
        <Empty
          kind="none-yet"
          title={t`No proposals match`}
          body={t`Try another name or hash, or choose All.`}
        />
      ) : (
        <ProposalTable proposals={shown} earlier={shownEarlier} now={now} />
      )}
    </>
  )
}

/** A deadline in the current year omits its year, so the column stays short. */
const showYear = (ms: number, now: number) =>
  new Date(ms).getUTCFullYear() !== new Date(now).getUTCFullYear()

function ProposalTable({
  proposals,
  earlier,
  now,
}: {
  proposals: HyProposal[]
  earlier: HyProposal[]
  now: number
}) {
  const { t } = useLingui()
  const [open, setOpen] = useState<string | undefined>(undefined)
  const base = useId()
  const row = (p: HyProposal) => {
    const expanded = open === p.hash
    const status = proposalStatus(p, now)
    const panel = `${base}-${p.hash}`
    return (
      <tbody key={p.hash} data-proposal={p.hash} data-status={status}>
        <tr>
          <td className="rx-propcell">
            <button
              type="button"
              className="rx-propname"
              style={{ minBlockSize: 24, minInlineSize: 24 }}
              aria-expanded={expanded}
              aria-controls={panel}
              onClick={() => {
                setOpen(expanded ? undefined : p.hash)
              }}
            >
              <span className="rx-propname__label">{p.name}</span>
              <Icon name="chevron" size="sm" className="rx-propname__chevron" />
            </button>
            <span className="rx-prophash rx-mono" data-proposal-hash title={p.hash}>
              {p.hash.slice(0, 8)}…{p.hash.slice(-6)}
            </span>
            <span className="rx-propline" aria-hidden="true">
              {t`${formatInt(p.votes.yes)} yes · ${formatInt(p.votes.no)} no · ${formatInt(p.votes.abstain)} abstain · net ${formatInt(netVotes(p))}`}
            </span>
          </td>
          <td>
            <StatusBadge status={status} />
          </td>
          <td className="r rx-num rx-votes rx-votes--first">{formatInt(p.votes.yes)}</td>
          <td className="r rx-num rx-votes">{formatInt(p.votes.no)}</td>
          <td className="r rx-num rx-votes">{formatInt(p.votes.abstain)}</td>
          <td className="r rx-num rx-votes rx-votes--last">
            {formatInt(netVotes(p))}
            {p.fundingThreshold == null ? null : (
              <span className="text-sm"> / {formatInt(p.fundingThreshold)}</span>
            )}
          </td>
          <td className="r">
            <Amount value={p.paymentAmount} kind="duffs" />
          </td>
          <td className="rx-propends">
            <time dateTime={formatIsoUtc(p.endTime)} title={formatIsoUtc(p.endTime)}>
              {formatDate(p.endTime, { year: showYear(p.endTime, now) })}
            </time>
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
  }
  return (
    <div className="rx-tablewrap rx-tablewrap--scroll">
      <div className="rx-tablescroll">
        <table className="rx-table rx-table--scrolls">
          <caption className="dh-sr">{t`Budget proposals`}</caption>
          <thead>
            <tr className="rx-votes-group">
              <td colSpan={2} />
              <th scope="colgroup" colSpan={4} className="rx-votes rx-votes--first rx-votes--last">
                {t`Votes`}
              </th>
              <td colSpan={2} />
            </tr>
            <tr>
              <th scope="col">{t`Proposal`}</th>
              <th scope="col">{t`Status`}</th>
              <th scope="col" className="r rx-votes rx-votes--first">{t`Yes`}</th>
              <th scope="col" className="r rx-votes">{t`No`}</th>
              <th scope="col" className="r rx-votes">{t`Abstain`}</th>
              <th scope="col" className="r rx-votes rx-votes--last">{t`Net votes`}</th>
              <th scope="col" className="r">{t`Amount`}</th>
              <th scope="col">{t`Ends`}</th>
            </tr>
          </thead>
          {proposals.map(row)}
          {earlier.length > 0 ? (
            <tbody data-earlier-proposals>
              <tr>
                <th scope="colgroup" colSpan={8} className="text-start">
                  {t`Earlier proposals, from Hyphen’s index (behind the chain)`}
                </th>
              </tr>
            </tbody>
          ) : null}
          {earlier.map(row)}
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
