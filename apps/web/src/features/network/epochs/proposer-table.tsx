import { useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { Entity } from '@/features/entity'
import { formatInt, formatPercent } from '@/lib/format'
import type { Proposer } from './queries'

export interface ProposerRow extends Proposer {
  rank: number
  share: number
}

/** The sort values of a proposer table, by column. */
export const PROPOSER_SORT_KEYS = {
  rank: (r: ProposerRow) => r.rank,
  node: (r: ProposerRow) => r.proTxHash,
  blocks: (r: ProposerRow) => r.blocks,
  share: (r: ProposerRow) => r.share,
}

/** `proposers` (already in rank order) with each one's rank and its share of `total` blocks. */
export function rankProposers(proposers: readonly Proposer[], total: number): ProposerRow[] {
  return proposers.map((p, i) => ({
    ...p,
    rank: i + 1,
    share: total === 0 ? 0 : Number(p.blocks) / total,
  }))
}

export function useProposerColumns(): ColumnDef<ProposerRow>[] {
  const { t } = useLingui()
  return useMemo(
    () => [
      {
        id: 'rank',
        header: '#',
        accessorFn: (r) => r.rank,
        meta: { numeric: true, phone: 'hidden' },
      },
      {
        id: 'node',
        header: t`Evonode`,
        accessorFn: (r) => r.proTxHash,
        cell: ({ row }) => <Entity kind="evonode" id={row.original.proTxHash} />,
        meta: { phone: 'title' },
      },
      {
        id: 'blocks',
        header: t`Blocks`,
        accessorFn: (r) => formatInt(Number(r.blocks)),
        meta: { numeric: true, phone: 'primary', phoneUnit: t`blocks` },
      },
      {
        id: 'share',
        header: t`Share`,
        accessorFn: (r) => formatPercent(r.share, 1),
        meta: { numeric: true, phone: 'secondary' },
      },
    ],
    [t],
  )
}
