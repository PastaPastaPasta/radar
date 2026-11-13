import { useLingui } from '@lingui/react/macro'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { useSeenPending, type SeenTx } from '@/data/core/seen-pending'
import { stampOf } from '@/data/envelope'
import type { HyMempoolTx } from '@/data/hyphen/schemas'
import { useIndexHealth } from '@/data/index-health'
import { POLL_MS } from '@/data/query/stale'
import { Entity, useNetwork } from '@/features/entity'
import { formatBytes, formatInt, formatPercent } from '@/lib/format'
import { Amount, Card, DataTable, Empty, LiveDot, Stat, Time, TypeBadge, Unavailable } from '@/ui'
import { HyphenGate, StaleIndexNotice } from '../hy-shared/HyphenGate'
import { cardState, firstPageStamp, infiniteTableProps } from '../hy-shared/infinite-list'
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
      <HyphenGate unavailable={false}>
        <MempoolContent />
      </HyphenGate>
    </PageFrame>
  )
}

/** How many transactions the live view keeps: a busy mempool would otherwise grow the page without end. */
const SEEN_LIMIT = 100

/**
 * The mempool from Hyphen while its index is current. While the index is behind the chain, or Decentralized only mode
 * keeps Hyphen off, the page shows what DAPI's live feed has delivered since it opened and asks Hyphen nothing.
 */
function MempoolContent() {
  const index = useIndexHealth(useNetwork())
  if (index.off) return <SeenMempool reason="mode" />
  if (index.state === 'stale') return <SeenMempool reason="stale" />
  return <IndexedMempool />
}

function SeenMempool({ reason }: { reason: 'mode' | 'stale' }) {
  const { t } = useLingui()
  const net = useNetwork()
  const seen = useSeenPending(net, true, SEEN_LIMIT)
  const [openedAt] = useState(() => Date.now())
  const bytes = seen.rows.reduce((n, r) => n + r.size, 0)
  const live = seen.stamp !== undefined
  const columns = useMemo<ColumnDef<SeenTx>[]>(
    () => [
      {
        id: 'tx',
        header: t`Transaction`,
        cell: ({ row }) => <Entity kind="tx" id={row.original.txid} />,
        meta: { phone: 'title' },
      },
      {
        id: 'type',
        header: t`Type`,
        cell: ({ row }) => <TypeBadge type={row.original.type} />,
        meta: { phone: 'secondary' },
      },
      {
        id: 'size',
        header: t`Size`,
        cell: ({ row }) => formatBytes(row.original.size),
        meta: { align: 'end', numeric: true, phone: 'secondary' },
      },
      {
        id: 'value',
        header: t`Value`,
        cell: ({ row }) => <Amount value={row.original.value} kind="duffs" />,
        meta: { align: 'end', numeric: true, phone: 'primary' },
      },
      {
        id: 'seen',
        header: t`Seen`,
        cell: ({ row }) => <Time ms={row.original.seenAt} live />,
        meta: { phone: 'secondary' },
      },
    ],
    [t],
  )
  return (
    <>
      {reason === 'stale' ? (
        <StaleIndexNotice
          scope={t`The full mempool and its totals need that index, so this page shows what DAPI's live feed has delivered since you opened it.`}
        />
      ) : (
        <Unavailable compact title={t`The full mempool list and its totals need an indexer`} />
      )}
      <p role="status" className="flex items-center gap-2 text-sm" data-mempool-view="seen">
        <LiveDot state={live ? 'live' : 'unknown'} />
        {t`From DAPI's live feed: transactions this page has seen arrive, minus those since mined. It is not the whole mempool.`}
      </p>
      <Card title={t`Since you opened this page`} layer="core" source={seen.stamp}>
        <div className="grid gap-4 sm:grid-cols-3" data-mempool-summary="seen">
          <Stat size="lg" label={t`Seen and still pending`} value={formatInt(seen.rows.length)} />
          <Stat label={t`Their size`} value={formatBytes(bytes)} />
          <Stat label={t`Watching since`} value={<Time ms={openedAt} mode="absolute" />} />
        </div>
      </Card>
      <Card
        title={t`Pending transactions`}
        subtitle={t`Seen since you opened this page`}
        layer="core"
        id="pending"
        padding="flush"
        source={seen.stamp}
      >
        <DataTable
          caption={t`Pending transactions seen since you opened this page, newest first`}
          columns={columns}
          rows={seen.rows}
          getRowId={(r) => r.txid}
          state="ready"
          empty={
            <Empty
              kind="none-yet"
              title={t`Nothing seen yet`}
              body={t`Nothing has arrived since you opened this page. New transactions appear here as DAPI delivers them.`}
            />
          }
          rowLink={(r) => ({ to: '/tx/$txid', params: { txid: r.txid } })}
        />
      </Card>
    </>
  )
}

function IndexedMempool() {
  const { t } = useLingui()
  const net = useNetwork()
  const summary = useQuery(mempoolQueries.summary(net))
  const txs = useInfiniteQuery(mempoolQueries.txs(net))
  const m = summary.data?.data
  const table = infiniteTableProps(txs)
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
      <p role="status" className="flex items-center gap-2 text-sm" data-mempool-view="index">
        <LiveDot state="live" />
        {t`Refreshes every ${POLL_MS.mempool / 1000} seconds.`}
      </p>
      <Card
        title={t`Summary`}
        layer="core"
        source={summary.data ? stampOf(summary.data) : undefined}
        state={cardState(summary)}
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
          <Stat label={t`Updated`} value={m ? <Time ms={m.updatedAt} live /> : '—'} />
        </div>
      </Card>
      <Card
        title={t`Pending transactions`}
        subtitle={total === undefined ? undefined : t`${formatInt(total)} in the mempool`}
        layer="core"
        id="pending"
        padding="flush"
        source={firstPageStamp(txs)}
      >
        <DataTable
          caption={t`Pending transactions, newest first`}
          columns={columns}
          {...table}
          getRowId={(r) => r.txHash}
          empty={<Empty kind="none-yet" title={t`No transactions in the mempool right now.`} />}
          rowLink={(r) => ({ to: '/tx/$txid', params: { txid: r.txHash } })}
        />
      </Card>
    </>
  )
}
