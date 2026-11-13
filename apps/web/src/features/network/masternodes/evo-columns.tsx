import { useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import type { EvoRow } from '@/data/masternodes/platform'
import { Entity } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Amount, AmountDensity, Time } from '@/ui'

const DASH = '—'

export interface EvoColumnOptions {
  /** Radar's Platform record and Platform Explorer's are on offer: their columns appear. */
  indexers: boolean
}

/** The Platform view's columns. Without the indexers it is DAPI's own: the node ID, its ports, and the SDK's count. */
export function useEvoColumns({ indexers }: EvoColumnOptions): ColumnDef<EvoRow>[] {
  const { t } = useLingui()
  return useMemo(() => {
    const evonode: ColumnDef<EvoRow> = {
      id: 'evonode',
      header: t`Evonode`,
      accessorFn: (e) => e.protx,
      cell: ({ row }) => (
        <span className="grid gap-1">
          <Entity kind="evonode" id={row.original.protx} />
          <span className="rx-sub font-mono">
            {row.original.row.service ?? DASH}
            {row.original.row.status === 'pose-banned' ? ` · ${t`PoSe-banned`}` : ''}
          </span>
        </span>
      ),
      meta: { phone: 'title', width: '12rem' },
    }
    const blocks: ColumnDef<EvoRow> = {
      id: 'blocks_epoch',
      header: t`Blocks this epoch`,
      accessorFn: (e) => e.blocks ?? 0,
      cell: ({ row }) => (row.original.blocks == null ? DASH : formatInt(row.original.blocks)),
      meta: { numeric: true, phone: 'primary' },
    }
    if (!indexers) {
      return [
        evonode,
        {
          id: 'node_id',
          header: t`Platform node ID`,
          accessorFn: (e) => e.row.registration?.platformNodeId ?? '',
          cell: ({ row }) => (
            <span className="font-mono break-all">
              {row.original.row.registration?.platformNodeId ?? DASH}
            </span>
          ),
          meta: { phone: 'secondary' },
        },
        blocks,
      ]
    }
    const credits = (
      id: 'last_epoch' | 'd30' | 'monthly' | 'balance',
      header: string,
      phone?: 'secondary',
    ): ColumnDef<EvoRow> => ({
      id,
      header,
      accessorFn: (e) => Number(e.radar?.[id] ?? 0),
      cell: ({ row }) => {
        const v = row.original.radar?.[id]
        return v == null ? (
          DASH
        ) : (
          <AmountDensity value="prose">
            <Amount value={v} kind="credits" compact />
          </AmountDensity>
        )
      },
      meta: { numeric: true, phone: phone ?? 'hidden' },
    })
    const stateLabels = { active: t`Active`, queued: t`Queued`, banned: t`PoSe-banned` }
    return [
      evonode,
      {
        id: 'drive',
        header: t`Drive`,
        accessorFn: (e) => e.radar?.drive ?? '',
        cell: ({ row }) => row.original.radar?.drive ?? DASH,
        meta: { phone: 'secondary' },
      },
      {
        id: 'validator',
        header: t`Validator set`,
        accessorFn: (e) => e.state ?? '',
        cell: ({ row }) => (row.original.state ? stateLabels[row.original.state] : DASH),
        meta: { phone: 'hidden' },
      },
      blocks,
      {
        id: 'blocks_total',
        header: t`Blocks proposed`,
        accessorFn: (e) => e.validator?.proposedBlocksAmount ?? 0,
        cell: ({ row }) => {
          const n = row.original.validator?.proposedBlocksAmount
          return n == null ? DASH : formatInt(n)
        },
        meta: { numeric: true, phone: 'hidden' },
      },
      {
        id: 'last_block',
        header: t`Last block`,
        accessorFn: (e) => e.validator?.lastProposedBlockHeader?.height ?? 0,
        cell: ({ row }) => {
          const block = row.original.validator?.lastProposedBlockHeader
          return block ? (
            <span className="grid gap-1">
              <Entity kind="platform-block" id={String(block.height)} />
              {block.timestamp ? <Time ms={block.timestamp} mode="relative" /> : null}
            </span>
          ) : (
            DASH
          )
        },
        meta: { numeric: true, phone: 'hidden' },
      },
      credits('last_epoch', t`Last epoch`),
      credits('d30', t`30 days`, 'secondary'),
      credits('monthly', t`A month (est.)`),
      credits('balance', t`Claimable`),
      {
        id: 'next',
        header: t`Next block`,
        accessorFn: (e) => e.radar?.next ?? 0,
        cell: ({ row }) => {
          const next = row.original.radar?.next
          return next == null ? DASH : <Time ms={next} mode="relative" />
        },
        meta: { numeric: true, phone: 'hidden' },
      },
      {
        id: 'vote',
        header: t`Vote this epoch`,
        accessorFn: (e) => e.radar?.vote ?? 0,
        cell: ({ row }) => row.original.radar?.vote ?? DASH,
        meta: { numeric: true, phone: 'hidden' },
      },
    ]
  }, [t, indexers])
}
