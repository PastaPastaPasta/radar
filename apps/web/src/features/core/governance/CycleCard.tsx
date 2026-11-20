import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { stampOf, type SourceStamp } from '@/data/envelope'
import {
  cycleBudget,
  insightBehind,
  showsPastTime,
  type PastSuperblock,
  superblockEta,
  superblockPaid,
  votingDeadline,
} from '@/data/governance-cycle'
import { hyQueries } from '@/data/hyphen/queries'
import { insQueries } from '@/data/insight/queries'
import { formatCountdown, formatDate, formatInt, formatIsoUtc, formatNumber } from '@/lib/format'
import type { NetworkId } from '@/lib/network'
import { Entity } from '@/features/entity'
import { Amount, Card, ErrorState, Skeleton, SourceLine, Stat } from '@/ui'
import type { BudgetSplit } from './status'

/** How often the cycle is read again while a time it shows has passed or Insight is behind. */
const STALE_POLL_MS = 60_000

/** A countdown that ticks every second while it is on screen, and says once when it reaches zero. */
function Countdown({ to, onDone }: { to: number; onDone?: () => void }) {
  const { t } = useLingui()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const done = to - now <= 0
  const told = useRef(false)
  useEffect(() => {
    if (done && !told.current) {
      told.current = true
      onDone?.()
    }
    if (!done) told.current = false
  }, [done, onDone])
  return (
    <time dateTime={formatIsoUtc(to)} data-countdown data-due={done ? '' : undefined}>
      {done ? t`Any moment now` : formatCountdown(to - now)}
    </time>
  )
}

/**
 * The governance cycle: the next superblock, when it is due and when its voting closes, from Dash Core's
 * `getgovernanceinfo` through Insight and DAPI's tip; this cycle's budget against what passing proposals ask for; and
 * the last few superblocks with what each paid, from Hyphen's blocks.
 */
export function CycleCard({
  net,
  split,
  proposalsFailed = false,
}: {
  net: NetworkId
  split: BudgetSplit | undefined
  proposalsFailed?: boolean
}) {
  const { t } = useLingui()
  const query = useQuery({
    ...insQueries.governanceCycle(net),
    refetchInterval: (q) =>
      q.state.data && showsPastTime(q.state.data.data, Date.now()) ? STALE_POLL_MS : false,
  })
  const c = query.data?.data
  const info = query.data ? stampOf(query.data) : undefined
  const tipStamp = query.data?.tipStamp
  const minutes = c ? formatNumber(c.blockMs / 60_000, { maximumFractionDigits: 2 }) : ''
  const eta = c ? superblockEta(c) : undefined
  const deadline = c ? votingDeadline(c) : undefined
  const behind = c?.tip && insightBehind(c) ? c.tip.height : undefined
  const noTip =
    c && !c.tip
      ? t`DAPI’s tip couldn’t be read, so its time isn’t estimated.`
      : behind !== undefined
        ? t`Insight is behind: DAPI’s tip is already at block #${formatInt(behind)}.`
        : undefined
  const refetch = () => {
    void query.refetch()
  }
  const money = c && split ? cycleBudget(c.budget, split.funded, split.passing) : undefined
  const stamps = [info, tipStamp].filter((s): s is SourceStamp => s !== undefined)

  return (
    <Card
      title={t`Governance cycle`}
      subtitle={t`The next superblock, when its voting closes, and what its budget covers`}
      layer="network"
      id="cycle"
      source={stamps.length ? stamps : undefined}
      state={query.isPending ? 'loading' : 'ready'}
    >
      {query.isError && !c ? (
        <ErrorState
          error={query.error}
          source="insight"
          compact
          onRetry={() => {
            void query.refetch()
          }}
        />
      ) : (
        <div className="grid gap-5" data-cycle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div data-next-superblock={String(c?.nextSuperblock ?? '')}>
              <Stat
                label={t`Next superblock`}
                value={c?.nextSuperblock == null ? '—' : `#${formatInt(c.nextSuperblock)}`}
                note={
                  eta !== undefined
                    ? t`Due about ${formatDate(eta)}`
                    : c?.nextSuperblock == null
                      ? t`Core gave no next superblock`
                      : noTip
                }
                source={info}
                loading={query.isPending}
              />
            </div>
            <div data-superblock-eta={String(eta === undefined ? '' : formatIsoUtc(eta))}>
              <Stat
                label={t`Superblock in`}
                value={eta === undefined ? '—' : <Countdown to={eta} onDone={refetch} />}
                note={
                  eta === undefined || !c?.tip || c.nextSuperblock == null
                    ? noTip
                    : c.rateMeasured
                      ? plural(c.nextSuperblock - c.tip.height, {
                          one: `# block to go, at ${minutes} minutes a block, as the last superblocks ran`,
                          other: `# blocks to go, at ${minutes} minutes a block, as the last superblocks ran`,
                        })
                      : plural(c.nextSuperblock - c.tip.height, {
                          one: '# block to go, at Dash Core’s 2.62 minutes a block',
                          other: '# blocks to go, at Dash Core’s 2.62 minutes a block',
                        })
                }
                source={tipStamp}
                loading={query.isPending}
              />
            </div>
            <div data-voting-deadline={String(deadline?.height ?? '')}>
              <Stat
                label={t`Voting closes`}
                value={
                  !deadline ? (
                    '—'
                  ) : deadline.passed ? (
                    t`Deadline passed`
                  ) : deadline.at === undefined ? (
                    `#${formatInt(deadline.height)}`
                  ) : (
                    <Countdown to={deadline.at} onDone={refetch} />
                  )
                }
                note={
                  !deadline
                    ? c
                      ? t`Core gave no maturity window`
                      : undefined
                    : deadline.at === undefined
                      ? noTip
                      : deadline.passed
                        ? t`At block #${formatInt(deadline.height)}: the superblock’s payments are being settled`
                        : t`At block #${formatInt(deadline.height)}, about ${formatDate(deadline.at)}`
                }
                source={tipStamp ?? info}
                loading={query.isPending}
              />
            </div>
            <div data-cycle-budget="">
              <Stat
                label={t`Budget this cycle`}
                value={c ? <Amount value={c.budget} kind="duffs" /> : '—'}
                note={
                  c?.cycleBlocks == null
                    ? undefined
                    : plural(c.cycleBlocks, {
                        one: 'One superblock every # block',
                        other: 'One superblock every # blocks',
                      })
                }
                source={info}
                loading={query.isPending}
              />
            </div>
          </div>
          <BudgetUse
            money={money}
            known={eta !== undefined}
            closed={deadline?.passed === true}
            pending={query.isPending || (!split && !proposalsFailed)}
            failed={proposalsFailed}
          />
          {c ? <PastSuperblocks net={net} past={c.past} stamp={query.data?.pastStamp} /> : null}
        </div>
      )}
    </Card>
  )
}

/** The budget against the passing proposals: what they ask, what the superblock pays, what is left. */
function BudgetUse({
  money,
  known,
  closed,
  pending,
  failed,
}: {
  money: ReturnType<typeof cycleBudget> | undefined
  known: boolean
  closed: boolean
  pending: boolean
  failed: boolean
}) {
  const { t } = useLingui()
  const figure = (value: bigint | undefined, needsTime: boolean) =>
    pending ? (
      <Skeleton shape="line" width="8ch" />
    ) : value === undefined || (needsTime && !known) ? (
      '—'
    ) : (
      <Amount value={value} kind="duffs" />
    )
  const duffs = (value: bigint | undefined, needsTime: boolean) =>
    pending || value === undefined || (needsTime && !known) ? undefined : String(value)
  return (
    <div className="grid gap-2" data-cycle-use aria-busy={pending ? true : undefined}>
      <dl className="grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="rx-dim text-sm">{t`Passing proposals ask for`}</dt>
          <dd className="m-0" data-cycle-passing data-duffs={duffs(money?.passing, true)}>
            {figure(money?.passing, true)}
          </dd>
        </div>
        <div>
          <dt className="rx-dim text-sm">{t`The superblock would pay`}</dt>
          <dd className="m-0" data-cycle-funded data-duffs={duffs(money?.funded, true)}>
            {figure(money?.funded, true)}
          </dd>
        </div>
        <div>
          <dt className="rx-dim text-sm">{t`Left unallocated`}</dt>
          <dd className="m-0" data-cycle-left data-duffs={duffs(money?.left, true)}>
            {figure(money?.left, true)}
          </dd>
        </div>
      </dl>
      {pending ? null : (
        <p className="rx-note m-0">
          {failed
            ? t`The proposals couldn’t be read, so what they ask for isn’t known.`
            : !known
              ? t`What the superblock would pay and what is left need its time, which isn’t known.`
              : money && money.over > 0n
                ? t`Passing proposals ask for more than the budget; the ones with fewer net votes that don’t fit wait for a later superblock.`
                : t`Worked out by Radar from the proposals below and Core’s budget, as Funded is.`}
          {!failed && known && closed ? (
            <>
              {' '}
              {t`Voting has closed, but this is still worked out from the votes as they stand now, not from what Core has settled.`}
            </>
          ) : null}
        </p>
      )}
    </div>
  )
}

/** The last superblocks, newest first, each with its date and what it paid, from Hyphen's blocks. */
function PastSuperblocks({
  net,
  past,
  stamp,
}: {
  net: NetworkId
  past: readonly PastSuperblock[]
  stamp: SourceStamp | undefined
}) {
  const { t } = useLingui()
  const heights = past.map((p) => p.height)
  const coinbases = useQueries({
    queries: heights.flatMap((h) => [
      hyQueries.blockTxs(net, h, { limit: 1 }),
      hyQueries.blockTxs(net, h - 1, { limit: 1 }),
    ]),
  })
  if (heights.length === 0) return null
  const failed =
    past.some((p) => p.time === undefined) || coinbases.some((q) => q.isError && !q.data)
  return (
    <div className="grid gap-2" data-past-superblocks>
      <h3 className="m-0 text-sm font-semibold">{t`Last superblocks`}</h3>
      <div className="rx-tablewrap">
        <div className="rx-tablescroll" data-wide="">
          <table className="rx-table">
            <caption className="dh-sr">{t`Last superblocks: height, date and what each paid`}</caption>
            <thead>
              <tr>
                <th scope="col">{t`Superblock`}</th>
                <th scope="col">{t`Date`}</th>
                <th scope="col" className="r">
                  {t`Paid, about`}
                </th>
              </tr>
            </thead>
            <tbody>
              {heights.map((h, i) => {
                const time = past[i]?.time
                const sb = coinbase(coinbases[2 * i]?.data?.data.items)
                const before = coinbase(coinbases[2 * i + 1]?.data?.data.items)
                const paid =
                  sb !== undefined && before !== undefined ? superblockPaid(sb, before) : undefined
                return (
                  <tr key={h} data-superblock={h}>
                    <td>
                      <Entity kind="block" id={String(h)} label={formatInt(h)} />
                    </td>
                    <td>{time === undefined ? '—' : formatDate(time, { time: false })}</td>
                    <td className="r rx-num" data-paid>
                      {paid === undefined ? '—' : <Amount value={paid} kind="duffs" />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="rx-note m-0">
        {failed
          ? t`Some superblocks couldn’t be read from Hyphen; their figures show —.`
          : t`Paid is the superblock’s coinbase less the coinbase of the block before it, to the nearest 0.01 DASH.`}{' '}
        {stamp ? <SourceLine stamp={stamp} compact /> : null}
      </p>
    </div>
  )
}

/** The coinbase's total out, when the first transaction of a block's list is its coinbase. */
function coinbase(
  items: readonly { txType: string; valueOut: bigint }[] | undefined,
): bigint | undefined {
  const first = items?.[0]
  return first?.txType === 'coinbase' ? first.valueOut : undefined
}
