import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { platformTipQuery } from '@/data/sdk/queries'
import { Entity, PageLink, useNetwork } from '@/features/entity'
import { formatInt, formatPercent } from '@/lib/format'
import { Card, DataTable } from '@/ui'
import { homeQueries, type EpochProposers, type Proposer } from './queries'
import { queryView, stampsOf } from './state'

const TOP = 10

interface Row extends Proposer {
  rank: number
  share: number
}

/** NX-02: the ten evonodes that proposed the most blocks this epoch. */
export function Proposers({ active }: { active: boolean }) {
  const { t } = useLingui()
  const net = useNetwork()
  const tip = useQuery({ ...platformTipQuery(net), enabled: active })
  const epoch = tip.data?.data.epoch.number
  const query = useQuery({
    ...homeQueries.proposers(net, epoch ?? 0),
    enabled: active && epoch !== undefined,
  })
  const answer = query.data?.data
  const rows = useMemo<Row[]>(() => {
    if (!answer) return []
    const total = Number(answer.total)
    return answer.proposers.slice(0, TOP).map((p, i) => ({
      ...p,
      rank: i + 1,
      share: total === 0 ? 0 : Number(p.blocks) / total,
    }))
  }, [answer])
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
  const pages = answer?.pages ?? 0
  const base = (a: EpochProposers) =>
    t`Epoch ${formatInt(a.epoch)}. Evonodes: ${formatInt(a.proposers.length)}. Blocks proposed: ${formatInt(Number(a.total))}.`
  return (
    <Card
      id="proposers"
      layer="platform"
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
      actions={
        <PageLink to="/masternodes" search={{ view: 'platform' }} className="rx-go">
          {t`All evonodes`}
        </PageLink>
      }
    >
      <DataTable
        caption={t`Top proposers this epoch`}
        columns={columns}
        rows={rows}
        getRowId={(r) => r.proTxHash}
        {...queryView(query, tip)}
        empty={t`No evonode has proposed a block in this epoch yet.`}
      />
    </Card>
  )
}
