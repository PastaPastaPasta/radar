import { useLingui } from '@lingui/react/macro'
import type { SourceStamp } from '@/data/envelope'
import type { HyRichRow } from '@/data/hyphen/schemas'
import { Entity } from '@/features/entity'
import { formatInt, formatPercent } from '@/lib/format'
import { shareOf } from './concentration'
import { Amount, Empty, ErrorState, Skeleton, SourceLine, type LoadState } from '@/ui'

export interface RichListCompactProps {
  rows: HyRichRow[]
  state: LoadState
  error?: unknown
  onRetry?: () => void
  paging: { hasNext: boolean; fetching: boolean; fetchNext: () => void }
  source?: SourceStamp
  summaryId: string
  /** The duffs each row's share is of; undefined while it is still being read. */
  total: bigint | undefined
}

/**
 * The phone layout of the rich list: two lines per address: rank, address link, balance and share, then
 * received, sent and transaction count, so nothing sits behind a tap and fifty ranks fit a few screens.
 */
export function RichListCompact({
  rows,
  state,
  error,
  onRetry,
  paging: { hasNext, fetching, fetchNext },
  source,
  summaryId,
  total,
}: RichListCompactProps) {
  const { t } = useLingui()
  if (state === 'loading') return <Skeleton shape="row" count={8} />
  if (state === 'error') return <ErrorState error={error} source="hyphen" onRetry={onRetry} />
  if (rows.length === 0) return <Empty kind="none-yet" title={t`No balances indexed yet.`} />
  return (
    <div data-rich-compact>
      <ol className="m-0 list-none p-0" aria-label={t`Addresses ranked by balance`}>
        {rows.map((r) => (
          <RichRow key={r.address} row={r} total={total} />
        ))}
      </ol>
      <div className="rx-tfoot">
        {source ? <SourceLine stamp={source} compact /> : null}
        <div className="rx-pager">
          <span>{t`${formatInt(rows.length)} loaded`}</span>
          {hasNext ? (
            <button
              type="button"
              className="dh-btn dh-btn--sm"
              disabled={fetching}
              onClick={fetchNext}
            >
              {t`Show more`}
            </button>
          ) : null}
          <a
            className="rx-go rx-go--up"
            href={`#${summaryId}`}
            onClick={(e) => {
              e.preventDefault()
              document.getElementById(summaryId)?.scrollIntoView({ block: 'start' })
            }}
          >
            {t`Back to summary`}
          </a>
        </div>
      </div>
    </div>
  )
}

function RichRow({ row: r, total }: { row: HyRichRow; total: bigint | undefined }) {
  const { t } = useLingui()
  return (
    <li className="rx-rich-item border-b border-[var(--dh-line)] px-4 py-1" data-rank={r.rank}>
      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-2">
        <span className="rx-num text-[var(--dh-ink-2)]">{formatInt(r.rank)}</span>
        <span className="rx-rich-addr min-w-0">
          <Entity kind="address" id={r.address} copy={false} hover={false} />
        </span>
        <span className="rx-num text-right">
          <Amount value={r.balance} kind="duffs" compact />
          <span className="block text-xs text-[var(--dh-ink-2)]">
            {total === undefined ? '—' : formatPercent(shareOf(r.balance, total), 2)}
          </span>
        </span>
      </div>
      <p className="rx-rich-flow m-0 pb-1.5 ps-[2.75rem] text-xs text-[var(--dh-ink-2)]">
        <span>
          {t`Received`} <Amount value={r.totalReceived} kind="duffs" compact />
        </span>
        <span aria-hidden="true"> · </span>
        <span>
          {t`Sent`} <Amount value={r.totalSent} kind="duffs" compact />
        </span>
        <span aria-hidden="true"> · </span>
        <span className="rx-num">{t`${formatInt(r.txCount)} tx`}</span>
      </p>
    </li>
  )
}
