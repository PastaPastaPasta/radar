import { useLingui } from '@lingui/react/macro'
import { useSearch } from '@tanstack/react-router'
import { useMemo, useRef } from 'react'
import type { SourceStamp } from '@/data/envelope'
import type { PeBlock } from '@/data/pe/schemas'
import { TransitionTable } from '@/features/entity'
import { Card, Empty, useListPosition, useReveal } from '@/ui'

const PAGE_SIZE = 25
const COLUMNS = ['type', 'hash', 'status', 'gas', 'owner'] as const

/** The transitions a block holds, revealed as the reader scrolls: Explorer returns them all with the block. */
export function TransitionsTab({ block, stamp }: { block: PeBlock; stamp: SourceStamp }) {
  const { t } = useLingui()
  const search: { page?: number } = useSearch({ strict: false })
  const page = search.page ?? 1
  const total = block.txs.length
  const reveal = useReveal({ total, step: PAGE_SIZE, steps: page, reset: block.header.hash })
  const list = useRef<HTMLDivElement>(null)
  useListPosition(list, { at: page, step: PAGE_SIZE, count: reveal.count, total })
  const rows = useMemo(
    () =>
      block.txs
        .slice(0, reveal.count)
        .map((tx) => ({ ...tx, blockHeight: tx.blockHeight ?? block.header.height })),
    [block, reveal.count],
  )
  return (
    <Card layer="platform" source={stamp} title={t`State transitions in this block`}>
      <div ref={list}>
        <TransitionTable
          rows={rows}
          state={total === 0 ? 'empty' : 'ready'}
          columns={COLUMNS}
          caption={t`State transitions in this block`}
          empty={<Empty kind="none-yet" title={t`This block holds no state transitions`} />}
          paging={reveal.paging}
        />
      </div>
    </Card>
  )
}
