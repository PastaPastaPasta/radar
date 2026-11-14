import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { stampOf } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { radarQueries } from '@/data/radar/queries'
import { platformTipQuery } from '@/data/sdk/queries'
import { PageLink, useNetwork } from '@/features/entity'
import { epochLengthMs } from '@/lib/epoch-length'
import { formatInt, formatNumber, formatPercent } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import {
  Amount,
  EpochClock,
  ErrorState,
  Stat,
  Stats,
  epochProgress,
  useAfterIdle,
  useNow,
} from '@/ui'
import { useSectionSource } from '@/ui/section-source'

/** The epoch the chain is in and when it should end: one proof-checked read, shared with the headline. */
export function useEpochNow() {
  const net = useNetwork()
  const ready = useAfterIdle()
  const tip = useQuery({ ...platformTipQuery(net), enabled: ready })
  const epoch = tip.data?.data.epoch
  const length = epochLengthMs(net)
  const endsAt = epoch === undefined || length === undefined ? undefined : epoch.startedAt + length
  return { tip, epoch, height: tip.data?.data.height, endsAt }
}

/** The page's headline: "Epoch 88 is 61% through". Undefined until the epoch and its length are known. */
export function useEpochClaim(): string | undefined {
  const { t } = useLingui()
  const { epoch, endsAt } = useEpochNow()
  const now = useNow()
  const ratio = epoch ? epochProgress(epoch.startedAt, endsAt, now) : undefined
  if (!epoch || ratio === undefined) return undefined
  const number = formatInt(epoch.number)
  // Rounding must not call an epoch that has not reached its expected end complete.
  return ratio >= 1
    ? t`Epoch ${number} is running past its expected end`
    : t`Epoch ${number} is ${formatPercent(Math.min(ratio, 0.99), 0)} through`
}

/**
 * What people open the page for: how far the epoch is, what its pool holds and what proposing a block pays. The clock
 * is the SDK's. The pool and the earnings are Radar's and are left out where its crawl is not read (Decentralized only
 * mode, a devnet): the page's one notice already says what the mode leaves out.
 */
export function EpochNow() {
  const { t } = useLingui()
  const net = useNetwork()
  const off = useDecentralizedOnly()
  const crawled = !off && !isDevnet(net)
  const { tip, epoch, height, endsAt } = useEpochNow()
  const rewards = useQuery({ ...radarQueries.platform(net), enabled: crawled })
  useSectionSource(tip.data ? stampOf(tip.data) : undefined)
  const crawl = rewards.data ? stampOf(rewards.data) : undefined
  const doc = rewards.data?.data
  const last = doc?.epochs.at(-1)
  const lastNote = last ? t`Epoch ${formatInt(last.epoch)}` : undefined
  return (
    <div id="epoch-now" className="rx-pile" data-epoch-now>
      {epoch ? (
        <EpochClock
          bare
          index={epoch.number}
          startedAt={epoch.startedAt}
          blocksSoFar={
            height === undefined ? undefined : Math.max(0, height - epoch.firstBlockHeight + 1)
          }
          expectedEndAt={endsAt}
          estimated
        />
      ) : tip.isError ? (
        <ErrorState error={tip.error} source="sdk" compact onRetry={() => void tip.refetch()} />
      ) : null}
      {!crawled ? null : rewards.isError ? (
        <ErrorState
          error={rewards.error}
          source="radar"
          compact
          onRetry={() => void rewards.refetch()}
        />
      ) : (
        <Stats data-epoch-rewards>
          <Stat
            label={t`Pool so far`}
            value={doc ? <Amount value={doc.now.pool_so_far} kind="credits" compact /> : '…'}
            loading={!doc}
            layer="platform"
            source={crawl}
          />
          <Stat
            label={t`Last pool`}
            value={last ? <Amount value={last.pool} kind="credits" compact /> : '—'}
            note={lastNote}
            loading={!doc}
            layer="platform"
            source={crawl}
          />
          <Stat
            label={t`Per block`}
            value={last ? <Amount value={last.per_block} kind="credits" compact /> : '—'}
            note={lastNote}
            loading={!doc}
            layer="platform"
            source={crawl}
          />
          <Stat
            label={t`Median monthly earnings`}
            value={doc ? <Amount value={doc.returns.median_monthly} kind="credits" compact /> : '…'}
            note={
              doc
                ? t`Per evonode, over ${formatNumber(doc.returns.monthly_basis_days ?? 0, { maximumFractionDigits: 0 })} days`
                : undefined
            }
            loading={!doc}
            layer="platform"
            source={crawl}
          />
          <Stat
            label={t`Median yield`}
            value={
              doc?.returns.median_platform_yield == null
                ? '—'
                : formatPercent(doc.returns.median_platform_yield, 1)
            }
            note={t`A year, on the collateral`}
            loading={!doc}
            layer="platform"
            source={crawl}
          />
        </Stats>
      )}
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <PageLink to="/epochs" className="rx-go">
          {t`Epochs`}
        </PageLink>
      </p>
    </div>
  )
}
