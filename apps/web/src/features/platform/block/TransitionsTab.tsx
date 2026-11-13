import { useLingui } from '@lingui/react/macro'
import { useSearch } from '@tanstack/react-router'
import { useMemo } from 'react'
import type { SourceStamp } from '@/data/envelope'
import type { PeBlock } from '@/data/pe/schemas'
import { TransitionTable } from '@/features/entity'
import { Card, Empty } from '@/ui'

const PAGE_SIZE = 25
const COLUMNS = ['type', 'hash', 'status', 'gas', 'owner'] as const

/** The transitions a block holds, paged here because Explorer returns them all with the block. */
export function TransitionsTab({ block, stamp }: { block: PeBlock; stamp: SourceStamp }) {
  const { t } = useLingui()
  const search: { page?: number } = useSearch({ strict: false })
  const page = search.page ?? 1
  const rows = useMemo(
    () =>
      block.txs
        .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
        .map((tx) => ({ ...tx, blockHeight: tx.blockHeight ?? block.header.height })),
    [block, page],
  )
  return (
    <Card
      layer="platform"
      padding="flush"
      source={stamp}
      title={t`State transitions in this block`}
    >
      <TransitionTable
        rows={rows}
        state={block.txs.length === 0 ? 'empty' : 'ready'}
        columns={COLUMNS}
        caption={t`State transitions in this block`}
        empty={<Empty kind="none-yet" title={t`This block holds no state transitions`} />}
        paging={{
          kind: 'page',
          page,
          limit: PAGE_SIZE,
          total: block.txs.length,
          to: (p) => ({
            to: '.',
            search: ((prev: Record<string, unknown>) => ({ ...prev, page: p })) as never,
          }),
        }}
      />
    </Card>
  )
}
