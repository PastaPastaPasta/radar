import { useLingui } from '@lingui/react/macro'
import { useQueries, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { useDecentralizedOnly } from '@/data/health'
import { peQueries } from '@/data/pe/queries'
import type { PeEpochDetail } from '@/data/pe/schemas'
import type { EpochDto } from '@/data/sdk/methods'
import { platformTipQuery, sdkQueries } from '@/data/sdk/queries'
import { Entity, PageLink, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import { Amount, Card, DataTable, Time, queryView, stampsOf } from '@/ui'

const RECENT = 4

interface Row {
  epoch: EpochDto
  /** Blocks in the epoch: the next epoch's first block less its own; the current epoch counts up to the tip. */
  blocks: number | undefined
  detail: PeEpochDetail | undefined
}

/** PE-03: the current epoch and the three before it. Starts and block counts are proof-checked; totals are the index's. */
export function RecentEpochs({ active }: { active: boolean }) {
  const { t } = useLingui()
  const net = useNetwork()
  const off = useDecentralizedOnly()
  const indexed = !off && !isDevnet(net)
  const tip = useQuery({ ...platformTipQuery(net), enabled: active })
  const current = tip.data?.data.epoch.number
  const height = tip.data?.data.height
  const first = current === undefined ? undefined : Math.max(0, current - (RECENT - 1))
  const infos = useQuery({
    ...sdkQueries['epoch.epochsInfo'](net, { startEpoch: first ?? 0, count: RECENT }),
    enabled: active && first !== undefined,
  })
  const details = useQueries({
    queries: Array.from({ length: RECENT }, (_, i) => ({
      ...peQueries.epoch(net, (first ?? 0) + i),
      enabled: active && indexed && first !== undefined,
    })),
  })
  const rows = useMemo<Row[]>(() => {
    const list = [...(infos.data?.data ?? [])].sort((a, b) => a.index - b.index)
    return list
      .map((epoch, i): Row => {
        const next = list[i + 1]
        return {
          epoch,
          blocks: next
            ? next.firstBlockHeight - epoch.firstBlockHeight
            : height === undefined
              ? undefined
              : height - epoch.firstBlockHeight + 1,
          detail: details.find((d) => d.data?.data.epoch.number === epoch.index)?.data?.data,
        }
      })
      .reverse()
  }, [infos.data, details, height])
  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: 'epoch',
        header: t`Epoch`,
        cell: ({ row }) => <Entity kind="epoch" id={String(row.original.epoch.index)} />,
        meta: { phone: 'title' },
      },
      {
        id: 'started',
        header: t`Started`,
        cell: ({ row }) => <Time ms={row.original.epoch.firstBlockTimeMs} mode="absolute" />,
        meta: { phone: 'primary' },
      },
      {
        id: 'blocks',
        header: t`Blocks`,
        accessorFn: (r) => (r.blocks === undefined ? '—' : formatInt(r.blocks)),
        meta: { numeric: true, phone: 'secondary', phoneUnit: t`blocks` },
      },
      {
        id: 'protocol',
        header: t`Protocol`,
        accessorFn: (r) => `v${r.epoch.protocolVersion}`,
        meta: { numeric: true, phone: 'hidden' },
      },
      ...(indexed
        ? ([
            {
              id: 'transitions',
              header: t`Transitions`,
              accessorFn: (r) =>
                r.detail?.totalTxCount == null ? '—' : formatInt(r.detail.totalTxCount),
              meta: { numeric: true, phone: 'secondary', phoneUnit: t`transitions` },
            },
            {
              id: 'fees',
              header: t`Fees`,
              cell: ({ row }) =>
                row.original.detail?.totalCollectedFees == null ? (
                  '—'
                ) : (
                  <Amount value={row.original.detail.totalCollectedFees} kind="credits" compact />
                ),
              meta: { numeric: true, phone: 'hidden' },
            },
          ] satisfies ColumnDef<Row>[])
        : []),
    ],
    [t, indexed],
  )
  return (
    <Card
      id="recent-epochs"
      layer="platform"
      title={t`Recent epochs`}
      subtitle={
        indexed
          ? t`Start times and block counts are proof-checked; transitions and fees come from Platform Explorer.`
          : t`Start times and block counts are proof-checked.`
      }
      padding="flush"
      source={stampsOf(infos.data, ...details.map((d) => d.data))}
      actions={
        <PageLink to="/epochs" className="rx-go">
          {t`All epochs`}
        </PageLink>
      }
    >
      <DataTable
        caption={t`The current epoch and the three before it`}
        columns={columns}
        rows={rows}
        getRowId={(r) => String(r.epoch.index)}
        {...queryView(infos, tip)}
        rowLink={(r) => ({ to: '/epoch/$n', params: { n: String(r.epoch.index) } })}
      />
    </Card>
  )
}
