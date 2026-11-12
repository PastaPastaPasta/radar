import { useLingui } from '@lingui/react/macro'
import { useState } from 'react'
import type { DecodedTx } from '@/data/core/types'
import { Entity } from '@/features/entity'
import { formatBytes, formatInt } from '@/lib/format'
import { Amount, Icon, Pager, TypeBadge, type DataTableProps } from '@/ui'
import { sumOutputs } from '../tx/tx-info'

export type BlockTx = DecodedTx & { n: number }

const short = (id: string) => `${id.slice(0, 8)}…${id.slice(-4)}`

/**
 * The phone layout of a block's transactions: one line each (position, short id, amount out, type) that opens to the
 * counts, size and the full transaction link, so a block of a hundred transactions is a few screens and not a hundred cards.
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
  return (
    <div data-block-tx-compact>
      <p className="m-0 px-4 py-2 text-sm text-[var(--dh-ink-2)]">
        {t`Tap a transaction for its inputs, outputs and size`}
      </p>
      <ol className="m-0 list-none p-0" aria-label={caption}>
        {rows.map((tx) => (
          <TxLine key={tx.txid} tx={tx} />
        ))}
      </ol>
      {paging ? (
        <div className="rx-tfoot">
          <Pager paging={paging} shown={rows.length} />
        </div>
      ) : null}
    </div>
  )
}

function TxLine({ tx }: { tx: BlockTx }) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const detailId = `blocktx-${tx.n}-detail`
  return (
    <li className="border-b border-[var(--dh-line)]" data-tx-row={tx.n}>
      <button
        type="button"
        className="rx-rich-row grid w-full cursor-pointer grid-cols-[2.25rem_minmax(0,1fr)_auto_1rem] items-center gap-x-2 px-4 py-2.5 text-start"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => {
          setOpen((v) => !v)
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
