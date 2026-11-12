import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { coreQueries } from '@/data/core/queries'
import type { BlockRow } from '@/data/core/types'
import { stampOf } from '@/data/envelope'
import { peQueries } from '@/data/pe/queries'
import type { PeTransaction } from '@/data/pe/schemas'
import { Entity, PageLink, useNetwork, keepPreviousOnNetwork } from '@/features/entity'
import { formatBytes, formatInt } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import { Card, DataTable, Empty, Icon, LockMark, Time, TYPE_META } from '@/ui'
import { PendingCard } from './CoreZone'
import { useHomeWidth, type HomeWidth } from './home-width'
import { CORE_ROWS } from './Scope'
import { transitionKind } from './transition-types'

const TRANSITIONS = 8

function BlocksCard({ compact }: { compact: boolean }) {
  const { t } = useLingui()
  const net = useNetwork()
  const tip = useQuery(coreQueries.tip(net))
  const from = tip.data?.data.height
  const rows = useQuery({
    ...coreQueries.blockRows(net, { fromHeight: from ?? 0, count: CORE_ROWS }),
    enabled: from !== undefined,
    placeholderData: keepPreviousOnNetwork(net),
  })
  const hasPool = (rows.data?.data ?? []).some((r) => r.pool)
  const columns = useMemo<ColumnDef<BlockRow>[]>(
    () => [
      {
        id: 'block',
        header: t`Block`,
        cell: ({ row }) => (
          <span className="rx-row" style={{ gap: 6 }}>
            <Entity kind="block" id={String(row.original.height)} />
            <LockMark locked={row.original.chainLocked} claim={row.original.chainLockClaim} />
          </span>
        ),
        meta: { phone: 'title' },
      },
      {
        id: 'age',
        header: t`Age`,
        cell: ({ row }) => <Time ms={row.original.time} mode="relative" live />,
        meta: { phone: 'primary' },
      },
      {
        id: 'txs',
        header: t`Txs`,
        accessorFn: (r) => formatInt(r.txCount),
        meta: { numeric: true, phone: 'secondary' },
      },
      {
        id: 'size',
        header: t`Size`,
        accessorFn: (r) => formatBytes(r.size),
        meta: { numeric: true, phone: 'secondary' },
      },
      ...(hasPool
        ? [
            {
              id: 'pool',
              header: t`Mined by`,
              accessorFn: (r: BlockRow) => r.pool ?? '—',
              meta: { phone: 'hidden' as const },
            },
          ]
        : []),
    ],
    [t, hasPool],
  )
  const shown = useMemo(
    () =>
      compact
        ? columns.filter((c) => c.id === 'block' || c.id === 'age' || c.id === 'txs')
        : columns,
    [columns, compact],
  )
  return (
    <Card
      layer="core"
      title={t`Core blocks`}
      padding="flush"
      source={rows.data ? stampOf(rows.data) : undefined}
      actions={
        <PageLink to="/blocks" className="rx-go">
          {t`All blocks`}
        </PageLink>
      }
    >
      <DataTable
        caption={t`Latest Core blocks`}
        columns={shown}
        rows={rows.data?.data ?? []}
        getRowId={(r) => String(r.height)}
        state={rows.isError && !rows.data ? 'error' : rows.data ? 'ready' : 'loading'}
        error={rows.error}
        onRetry={() => void rows.refetch()}
        rowLink={(r) => ({ to: '/block/$id', params: { id: String(r.height) } })}
      />
    </Card>
  )
}

function TransitionsCard() {
  const { t } = useLingui()
  const net = useNetwork()
  const query = useQuery({ ...peQueries.latestTransactions(net, 10), enabled: !isDevnet(net) })
  const columns = useMemo<ColumnDef<PeTransaction>[]>(
    () => [
      {
        id: 'type',
        header: t`Type`,
        cell: ({ row }) => {
          const kind = transitionKind(row.original.type, row.original.batchType)
          const meta = TYPE_META[kind.type]
          return (
            <span className="rx-type" data-layer={meta.layer} data-type={kind.type}>
              <Icon name={meta.icon} />
              {kind.label}
            </span>
          )
        },
        meta: { phone: 'title' },
      },
      {
        id: 'hash',
        header: t`Transition`,
        cell: ({ row }) => <Entity kind="transition" id={row.original.hash} />,
        meta: { phone: 'secondary' },
      },
      {
        id: 'age',
        header: t`Age`,
        cell: ({ row }) => <Time ms={row.original.timestamp} mode="relative" live />,
        meta: { phone: 'primary' },
      },
    ],
    [t],
  )
  return (
    <Card
      layer="platform"
      className="rx-card--feed"
      title={t`Platform transitions`}
      padding="flush"
      source={query.data ? stampOf(query.data) : undefined}
      actions={
        <PageLink to="/platform/txs" className="rx-go" aria-label={t`View all transitions`}>
          {t`View all`}
        </PageLink>
      }
    >
      {isDevnet(net) ? (
        <Empty kind="unsupported-network" title={t`Platform Explorer doesn't index devnets`} />
      ) : (
        <DataTable
          caption={t`Latest Platform transitions`}
          columns={columns}
          rows={(query.data?.data.items ?? []).slice(0, TRANSITIONS)}
          getRowId={(r) => r.hash}
          state={query.isError && !query.data ? 'error' : query.data ? 'ready' : 'loading'}
          error={query.error}
          onRetry={() => void query.refetch()}
          rowLink={(r) => ({ to: '/platform/tx/$hash', params: { hash: r.hash } })}
        />
      )}
    </Card>
  )
}

/** Core blocks, Platform transitions and, beyond a phone, the pending transactions, in that order in the page and on screen. */
export function Activity() {
  const { t } = useLingui()
  const width: HomeWidth = useHomeWidth()
  const phone = width === 'phone'
  return (
    <section className="rx-sec rx-activity" aria-labelledby="h-latest">
      <div className="rx-sec__head">
        <h2 className="rx-sec__title" id="h-latest">
          {t`Latest activity`}
        </h2>
        <p className="rx-sec__desc">{t`New rows appear at the top.`}</p>
      </div>
      <div className="rx-activity__grid">
        <BlocksCard compact={!phone} />
        <TransitionsCard />
        {phone ? null : <PendingCard compact={width === 'wide'} />}
      </div>
    </section>
  )
}
