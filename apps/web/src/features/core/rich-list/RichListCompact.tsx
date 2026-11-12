import { useLingui } from '@lingui/react/macro'
import { useState } from 'react'
import type { SourceStamp } from '@/data/envelope'
import type { HyRichRow } from '@/data/hyphen/schemas'
import { Entity } from '@/features/entity'
import { formatInt, formatPercent } from '@/lib/format'
import { Amount, Empty, ErrorState, Icon, Skeleton, SourceLine, type LoadState } from '@/ui'

export interface RichListCompactProps {
  rows: HyRichRow[]
  state: LoadState
  error?: unknown
  onRetry?: () => void
  paging: { hasNext: boolean; fetching: boolean; fetchNext: () => void }
  source?: SourceStamp
  summaryId: string
}

const short = (a: string) => (a.length > 16 ? `${a.slice(0, 7)}…${a.slice(-5)}` : a)

/**
 * The phone layout of the rich list: one line per address (rank, address, balance, share) with a chevron
 * that opens received, sent and transactions, so fifty ranks fit a few screens instead of fifty cards.
 */
export function RichListCompact({
  rows,
  state,
  error,
  onRetry,
  paging: { hasNext, fetching, fetchNext },
  source,
  summaryId,
}: RichListCompactProps) {
  const { t } = useLingui()
  if (state === 'loading') return <Skeleton shape="row" count={8} />
  if (state === 'error') return <ErrorState error={error} source="hyphen" onRetry={onRetry} />
  if (rows.length === 0) return <Empty kind="none-yet" title={t`No balances indexed yet.`} />
  return (
    <div data-rich-compact>
      <p className="rx-rich-hint m-0 px-4 py-2 text-sm text-[var(--dh-ink-2)]">
        {t`Tap a row for received, sent and transactions`}
      </p>
      <ol className="m-0 list-none p-0" aria-label={t`Addresses ranked by balance`}>
        {rows.map((r) => (
          <RichRow key={r.address} row={r} />
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

function RichRow({ row: r }: { row: HyRichRow }) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const detailId = `rich-${r.rank}-detail`
  return (
    <li className="border-b border-[var(--dh-line)]" data-rank={r.rank}>
      <button
        type="button"
        className="rx-rich-row grid w-full cursor-pointer grid-cols-[2.25rem_minmax(0,1fr)_auto_1rem] items-baseline gap-x-2 border-0 bg-transparent px-4 py-2.5 text-start font-[inherit] text-[inherit]"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => {
          setOpen((v) => !v)
        }}
      >
        <span className="rx-num text-[var(--dh-ink-2)]">{formatInt(r.rank)}</span>
        <span className="rx-mono truncate">{short(r.address)}</span>
        <span className="rx-num text-right">
          <Amount value={r.balance} kind="duffs" compact />
          <span className="block text-xs text-[var(--dh-ink-2)]">
            {formatPercent(r.pctSupply, 2)}
          </span>
        </span>
        <Icon name="chevron" className="rx-rich-chevron self-center" />
      </button>
      <dl
        id={detailId}
        hidden={!open}
        className="m-0 grid grid-cols-3 gap-2 px-4 pb-3 pl-[3.25rem] text-sm"
      >
        <div>
          <dt className="text-[var(--dh-ink-2)]">{t`Received`}</dt>
          <dd className="m-0">
            <Amount value={r.totalReceived} kind="duffs" compact />
          </dd>
        </div>
        <div>
          <dt className="text-[var(--dh-ink-2)]">{t`Sent`}</dt>
          <dd className="m-0">
            <Amount value={r.totalSent} kind="duffs" compact />
          </dd>
        </div>
        <div>
          <dt className="text-[var(--dh-ink-2)]">{t`Transactions`}</dt>
          <dd className="rx-num m-0">{formatInt(r.txCount)}</dd>
        </div>
        <div className="col-span-3">
          <Entity kind="address" id={r.address} />
        </div>
      </dl>
    </li>
  )
}
