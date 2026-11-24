import { useLingui } from '@lingui/react/macro'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { useLayoutEffect, useRef, useState } from 'react'
import type { DecodedTx } from '@/data/core/types'
import { Entity } from '@/features/entity'
import { formatBytes, formatInt } from '@/lib/format'
import { Amount, Icon, Pager, TypeBadge, type DataTableProps } from '@/ui'
import { sumOutputs } from '../tx/tx-info'

export type BlockTx = DecodedTx & { n: number }

const short = (id: string) => `${id.slice(0, 8)}…${id.slice(-4)}`
const LINE_HEIGHT = 45

/**
 * The phone layout of a block's transactions: one line each (position, short id, amount out, type) that opens to the
 * counts, size and the full transaction link, so a block of a hundred transactions is a few screens and not a hundred cards.
 * Only the lines near the view are drawn, so a block of thousands keeps a short page; which lines are open is kept here,
 * since a line is dropped while it is out of view.
 */
export function BlockTxCompact({
  rows,
  caption,
  paging,
}: {
  rows: BlockTx[]
  caption: string
  paging?: DataTableProps<BlockTx>['paging']
}) {
  const { t } = useLingui()
  const list = useRef<HTMLOListElement>(null)
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const [scrollMargin, setScrollMargin] = useState(0)
  useLayoutEffect(() => {
    if (list.current) setScrollMargin(list.current.getBoundingClientRect().top + window.scrollY)
  }, [])
  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => LINE_HEIGHT,
    overscan: 12,
    scrollMargin,
    getItemKey: (i) => rows[i]?.txid ?? i,
    initialRect: { width: 400, height: 900 },
  })
  const measured = virtualizer.getVirtualItems()
  const items: { index: number }[] =
    measured.length > 0 ? measured : rows.slice(0, 40).map((_, index) => ({ index }))
  const first = measured[0]
  const last = measured.at(-1)
  const padTop = first ? first.start - scrollMargin : 0
  const padBottom = last ? virtualizer.getTotalSize() - (last.end - scrollMargin) : 0
  const toggle = (txid: string) => {
    setOpen((was) => {
      const next = new Set(was)
      if (!next.delete(txid)) next.add(txid)
      return next
    })
  }
  return (
    <div data-block-tx-compact>
      <p className="m-0 px-4 py-2 text-sm text-[var(--dh-ink-2)]">
        {t`Tap a transaction for its inputs, outputs and size`}
      </p>
      <ol
        ref={list}
        className="m-0 list-none p-0"
        aria-label={caption}
        style={{ paddingTop: padTop, paddingBottom: padBottom }}
      >
        {items.map((item) => {
          const tx = rows[item.index]
          return tx ? (
            <TxLine
              key={tx.txid}
              tx={tx}
              index={item.index}
              count={rows.length}
              measure={virtualizer.measureElement}
              open={open.has(tx.txid)}
              onToggle={toggle}
            />
          ) : null
        })}
      </ol>
      {paging ? (
        <div className="rx-tfoot">
          <Pager paging={paging} shown={rows.length} />
        </div>
      ) : null}
    </div>
  )
}

function TxLine({
  tx,
  index,
  count,
  measure,
  open,
  onToggle,
}: {
  tx: BlockTx
  index: number
  count: number
  measure: (el: Element | null) => void
  open: boolean
  onToggle: (txid: string) => void
}) {
  const { t } = useLingui()
  const detailId = `blocktx-${tx.n}-detail`
  return (
    <li
      ref={measure}
      className="border-b border-[var(--dh-line)]"
      data-tx-row={tx.n}
      data-index={index}
      aria-posinset={index + 1}
      aria-setsize={count}
    >
      <button
        type="button"
        className="rx-rich-row grid w-full cursor-pointer grid-cols-[2.25rem_minmax(0,1fr)_auto_1rem] items-center gap-x-2 px-4 py-2.5 text-start"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => {
          onToggle(tx.txid)
        }}
      >
        <span className="rx-num text-[var(--dh-ink-2)]">{formatInt(tx.n)}</span>
        <span className="rx-mono truncate">{short(tx.txid)}</span>
        <span className="rx-num text-right">
          <Amount value={sumOutputs(tx)} kind="duffs" compact />
        </span>
        <Icon name="chevron" className="rx-rich-chevron self-center" />
      </button>
      <dl
        id={detailId}
        hidden={!open}
        className="m-0 flex flex-wrap items-center gap-x-5 gap-y-2 px-4 pb-3 pl-[3.25rem] text-sm"
      >
        <div>
          <dt className="text-[var(--dh-ink-2)]">{t`Type`}</dt>
          <dd className="m-0">
            <TypeBadge type={tx.type} />
          </dd>
        </div>
        <div>
          <dt className="text-[var(--dh-ink-2)]">{t`Inputs → outputs`}</dt>
          <dd className="rx-num m-0">{`${formatInt(tx.inputs.length)} → ${formatInt(tx.outputs.length)}`}</dd>
        </div>
        <div>
          <dt className="text-[var(--dh-ink-2)]">{t`Size`}</dt>
          <dd className="rx-num m-0">{formatBytes(tx.size)}</dd>
        </div>
        <div className="basis-full">
          <Entity kind="tx" id={tx.txid} />
        </div>
      </dl>
    </li>
  )
}
