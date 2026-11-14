import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { sdkQueries } from '@/data/sdk/queries'
import { useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Card, DataTable } from '@/ui'
import {
  PROPOSER_SORT_KEYS,
  rankProposers,
  useProposerColumns,
  type ProposerRow,
} from './proposer-table'
import { epochsQueries, type EpochProposers } from './queries'
import { queryView, sortRows, stampsOf, useAfterIdle } from './state'

const TOP = 20
const NONE = {} as const

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
  const rows = useMemo<ProposerRow[]>(() => {
    if (!answer) return []
    const top = rankProposers(answer.proposers.slice(0, TOP), Number(answer.total))
    return sortRows(top, sort, PROPOSER_SORT_KEYS)
  }, [answer, sort])
  const columns = useProposerColumns()
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
        {...queryView(query, tip)}
        empty={t`No evonode has proposed a block in this epoch yet.`}
      />
    </Card>
  )
}
