import { useLingui } from '@lingui/react/macro'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { stampOf } from '@/data/envelope'
import type { HyMempoolTx } from '@/data/hyphen/schemas'
import { POLL_MS } from '@/data/query/stale'
import { Entity, useNetwork } from '@/features/entity'
import { formatBytes, formatInt, formatPercent } from '@/lib/format'
import { Amount, Card, DataTable, Empty, LiveDot, Stat, Time } from '@/ui'
import { HyphenGate, StaleIndexNotice } from '../hy-shared/HyphenGate'
import { PageFrame } from '../hy-shared/PageFrame'
import { TxTypeBadge } from '../hy-shared/TxTypeBadge'
import { mempoolQueries } from './queries'

export function MempoolPage() {
  const { t } = useLingui()
  return (
    <PageFrame
      path="/mempool"
      title={t`Mempool`}
      lede={t`Transactions the network has seen and not yet mined.`}
    >
      <HyphenGate>
        <MempoolContent />
      </HyphenGate>
    </PageFrame>
  )
}

function MempoolContent() {
  const { t } = useLingui()
  const net = useNetwork()
  const summary = useQuery(mempoolQueries.summary(net))
  const txs = useInfiniteQuery(mempoolQueries.txs(net))
  const m = summary.data?.data
  const rows = txs.data?.pages.flatMap((p) => p.data.items) ?? []
  const total = txs.data?.pages[0]?.data.total
  const usage = m?.usageBytes != null && m.maxBytes ? m.usageBytes / m.maxBytes : undefined

  const columns = useMemo<ColumnDef<HyMempoolTx>[]>(
    () => [
      {
        id: 'tx',
        header: t`Transaction`,
        cell: ({ row }) => <Entity kind="tx" id={row.original.txHash} />,
        meta: { phone: 'title' },
      },
      {
        id: 'type',
        header: t`Type`,
        cell: ({ row }) => <TxTypeBadge type={row.original.txType} />,
        meta: { phone: 'secondary' },
      },
      {
        id: 'size',
        header: t`Size`,
        cell: ({ row }) => formatBytes(row.original.txSize),
        meta: { align: 'end', numeric: true, phone: 'secondary' },
      },
      {
        id: 'value',
        header: t`Value`,
        cell: ({ row }) => <Amount value={row.original.valueOut} kind="duffs" />,
        meta: { align: 'end', numeric: true, phone: 'primary' },
      },
      {
        id: 'seen',
        header: t`First seen`,
        cell: ({ row }) => <Time ms={row.original.firstSeenAt} live />,
        meta: { phone: 'secondary' },
      },
    ],
    [t],
  )

  return (
    <>
      <StaleIndexNotice />
      <p role="status" className="flex items-center gap-2 text-sm">
        <LiveDot state="live" />
        {t`Refreshes every ${POLL_MS.mempool / 1000} seconds.`}
      </p>
      <Card
        title={t`Summary`}
        layer="core"
        source={summary.data ? stampOf(summary.data) : undefined}
        state={summary.isPending ? 'loading' : summary.isError ? 'error' : 'ready'}
        error={summary.error}
        onRetry={() => void summary.refetch()}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-mempool-summary>
          <Stat size="lg" label={t`Transactions`} value={m ? formatInt(m.count) : '—'} />
          <Stat label={t`Size`} value={m ? formatBytes(m.totalBytes) : '—'} />
          <Stat
            label={t`Memory in use`}
            value={m?.usageBytes != null ? formatBytes(m.usageBytes) : '—'}
            note={
              usage !== undefined && m?.maxBytes
                ? t`${formatPercent(usage, 2)} of ${formatBytes(m.maxBytes)}`
                : undefined
            }
            meter={usage !== undefined ? { value: usage, max: 1 } : undefined}
          />
          <Stat
            label={t`Updated`}
            value={m ? <Time ms={m.updatedAt} live /> : '—'}
          />
        </div>
      </Card>
      <Card
        title={t`Pending transactions`}
        subtitle={total === undefined ? undefined : t`${formatInt(total)} in the mempool`}
        layer="core"
        id="pending"
        padding="flush"
        source={txs.data?.pages[0] ? stampOf(txs.data.pages[0]) : undefined}
      >
        <DataTable
          caption={t`Pending transactions, newest first`}
          columns={columns}
          rows={rows}
          getRowId={(r) => r.txHash}
          state={
            txs.isPending
              ? 'loading'
              : txs.isError && rows.length === 0
                ? 'error'
                : rows.length === 0
                  ? 'empty'
                  : 'ready'
          }
          error={txs.error}
          onRetry={() => void txs.refetch()}
          empty={<Empty kind="none-yet" title={t`No transactions in the mempool right now.`} />}
          paging={{
            kind: 'infinite',
            hasNext: txs.hasNextPage,
            fetchNext: () => void txs.fetchNextPage(),
            fetching: txs.isFetchingNextPage,
          }}
          rowLink={(r) => ({ to: '/tx/$txid', params: { txid: r.txHash } })}
        />
      </Card>
    </>
  )
}
