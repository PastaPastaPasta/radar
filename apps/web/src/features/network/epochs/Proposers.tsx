import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { sdkQueries } from '@/data/sdk/queries'
import { Entity, useNetwork } from '@/features/entity'
import { formatInt, formatPercent } from '@/lib/format'
import { Card, DataTable } from '@/ui'
import { epochsQueries, type EpochProposers, type Proposer } from './queries'
import { queryView, sortRows, stampsOf, useAfterIdle } from './state'

const TOP = 20
const NONE = {} as const

interface Row extends Proposer {
  rank: number
  share: number
}

/** NX-50: the twenty evonodes that proposed the most blocks this epoch, re-sortable. */
export function Proposers() {
  const { t } = useLingui()
  const net = useNetwork()
  const ready = useAfterIdle()
  const [sort, setSort] = useState('-blocks')
  const tip = useQuery({ ...sdkQueries['epoch.current'](net, NONE), enabled: ready })
  const epoch = tip.data?.data.index
  const query = useQuery({
    ...epochsQueries.proposers(net, epoch ?? 0),
    enabled: ready && epoch !== undefined,
  })
  const answer = query.data?.data
  const rows = useMemo<Row[]>(() => {
    if (!answer) return []
    const total = Number(answer.total)
    const top = answer.proposers.slice(0, TOP).map((p, i) => ({
      ...p,
      rank: i + 1,
      share: total === 0 ? 0 : Number(p.blocks) / total,
    }))
    return sortRows(top, sort, {
      rank: (r) => r.rank,
      node: (r) => r.proTxHash,
      blocks: (r) => r.blocks,
      share: (r) => r.share,
    })
  }, [answer, sort])
  const columns = useMemo<ColumnDef<Row>[]>(
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
  const base = (a: EpochProposers) =>
    t`Epoch ${formatInt(a.epoch)}. Evonodes: ${formatInt(a.proposers.length)}. Blocks proposed: ${formatInt(Number(a.total))}.`
  const pages = answer?.pages ?? 0
  return (
    <Card
      id="proposers"
      layer="network"
      title={t`Top proposers`}
      subtitle={
        answer
          ? pages > 1
            ? `${base(answer)} ${plural(pages, {
                one: 'Combined from # proof-checked answer.',
                other: 'Combined from # proof-checked answers.',
              })}`
            : base(answer)
          : t`The evonodes that proposed the most blocks this epoch.`
      }
      padding="flush"
      source={stampsOf(query.data)}
    >
      <DataTable
        caption={t`Top proposers this epoch`}
        columns={columns}
        rows={rows}
        getRowId={(r) => r.proTxHash}
        sort={{ value: sort, onChange: setSort }}
        {...queryView(query)}
        empty={t`No evonode has proposed a block in this epoch yet.`}
      />
    </Card>
  )
}
