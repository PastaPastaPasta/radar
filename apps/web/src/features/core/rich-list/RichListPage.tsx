import { useLingui } from '@lingui/react/macro'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import type { EChartsOption } from 'echarts'
import { useMemo } from 'react'
import { stampOf } from '@/data/envelope'
import type { HyRichRow } from '@/data/hyphen/schemas'
import { Entity, useNetwork } from '@/features/entity'
import { formatInt, formatPercent } from '@/lib/format'
import { Amount, Card, Chart, DataTable, Empty, Stat } from '@/ui'
import { HyphenGate, StaleIndexNotice } from '../hy-shared/HyphenGate'
import { PageFrame } from '../hy-shared/PageFrame'
import { concentration } from './concentration'
import { richListQueries } from './queries'

export function RichListPage() {
  const { t } = useLingui()
  return (
    <PageFrame path="/rich-list" title={t`Rich list`} lede={t`The largest Core balances, ranked.`}>
      <HyphenGate>
        <RichListContent />
      </HyphenGate>
    </PageFrame>
  )
}

function RichListContent() {
  const { t } = useLingui()
  const net = useNetwork()
  const list = useInfiniteQuery(richListQueries.rows(net))
  const top = useQuery(richListQueries.top(net))

  const rows = list.data?.pages.flatMap((p) => p.data.items) ?? []
  const first = list.data?.pages[0]?.data
  const bands = useMemo(() => concentration(top.data?.data.items ?? []), [top.data])

  const columns = useMemo<ColumnDef<HyRichRow>[]>(
    () => [
      {
        id: 'rank',
        header: t`Rank`,
        cell: ({ row }) => formatInt(row.original.rank),
        meta: { numeric: true, phone: 'secondary' },
      },
      {
        id: 'address',
        header: t`Address`,
        cell: ({ row }) => <Entity kind="address" id={row.original.address} />,
        meta: { phone: 'title' },
      },
      {
        id: 'balance',
        header: t`Balance`,
        cell: ({ row }) => <Amount value={row.original.balance} kind="duffs" fiat />,
        meta: { align: 'end', numeric: true, phone: 'primary' },
      },
      {
        id: 'share',
        header: t`% of supply`,
        cell: ({ row }) => formatPercent(row.original.pctSupply, 2),
        meta: { align: 'end', numeric: true, phone: 'secondary' },
      },
      {
        id: 'received',
        header: t`Received`,
        cell: ({ row }) => <Amount value={row.original.totalReceived} kind="duffs" compact />,
        meta: { align: 'end', numeric: true, phone: 'hidden' },
      },
      {
        id: 'sent',
        header: t`Sent`,
        cell: ({ row }) => <Amount value={row.original.totalSent} kind="duffs" compact />,
        meta: { align: 'end', numeric: true, phone: 'hidden' },
      },
      {
        id: 'txs',
        header: t`Transactions`,
        cell: ({ row }) => formatInt(row.original.txCount),
        meta: { align: 'end', numeric: true, phone: 'hidden' },
      },
    ],
    [t],
  )

  const option: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v) => formatPercent(Number(v), 2),
    },
    grid: { left: 8, right: 8, top: 16, bottom: 24, containLabel: true },
    xAxis: { type: 'category', data: bands.map((b) => t`Top ${b.id}`) },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (v: number) => formatPercent(v, 0) },
    },
    series: [{ type: 'bar', name: t`Share of supply`, data: bands.map((b) => b.share) }],
  }

  return (
    <>
      <StaleIndexNotice />
      <Card
        title={t`Supply concentration`}
        subtitle={t`Share of the supply held by each rank band`}
        layer="core"
        source={top.data ? stampOf(top.data) : undefined}
        state={top.isError ? 'error' : 'ready'}
        error={top.error}
        onRetry={() => void top.refetch()}
      >
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat
              label={t`Addresses with a balance`}
              value={first?.positiveBalanceCount ? formatInt(first.positiveBalanceCount) : '—'}
            />
            <Stat
              label={t`Held by the top 10`}
              value={
                top.data
                  ? formatPercent(
                      bands.slice(0, 3).reduce((s, b) => s + b.share, 0),
                      1,
                    )
                  : '—'
              }
            />
            <Stat
              label={t`Held by the top 100`}
              value={
                top.data
                  ? formatPercent(
                      bands.reduce((s, b) => s + b.share, 0),
                      1,
                    )
                  : '—'
              }
            />
          </div>
          <Chart
            option={option}
            height={240}
            label={t`Share of the supply held by the top addresses, by rank band`}
            loading={top.isPending}
            table={{
              columns: [t`Rank band`, t`Share of supply`],
              rows: bands.map((b) => [b.id, formatPercent(b.share, 2)]),
            }}
          />
        </div>
      </Card>
      <Card
        title={t`Largest balances`}
        subtitle={
          first?.total === undefined ? undefined : t`${formatInt(first.total)} addresses ranked`
        }
        layer="core"
        padding="flush"
        source={list.data?.pages[0] ? stampOf(list.data.pages[0]) : undefined}
      >
        <DataTable
          caption={t`Addresses ranked by balance`}
          columns={columns}
          rows={rows}
          getRowId={(r) => r.address}
          state={
            list.isPending
              ? 'loading'
              : list.isError && rows.length === 0
                ? 'error'
                : rows.length === 0
                  ? 'empty'
                  : 'ready'
          }
          error={list.error}
          onRetry={() => void list.refetch()}
          empty={<Empty kind="none-yet" title={t`No balances indexed yet.`} />}
          paging={{
            kind: 'infinite',
            hasNext: list.hasNextPage,
            fetchNext: () => void list.fetchNextPage(),
            fetching: list.isFetchingNextPage,
          }}
          rowLink={(r) => ({ to: '/address/$address', params: { address: r.address } })}
        />
      </Card>
    </>
  )
}
