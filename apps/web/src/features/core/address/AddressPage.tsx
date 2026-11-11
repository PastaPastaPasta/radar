import { Plural, useLingui } from '@lingui/react/macro'
import { useInfiniteQuery, useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { lazy, Suspense, useMemo } from 'react'
import { stampOf, type SourceStamp, type Sourced } from '@/data/envelope'
import type { HyAddress, HyAddressTx, HyPage, HyUtxo } from '@/data/hyphen/schemas'
import { Entity, PageLink, useNetwork } from '@/features/entity'
import { classify } from '@/features/search'
import { formatInt } from '@/lib/format'
import { isDevnet, type NetworkId } from '@/lib/network'
import { Amount, Badge, Card, DataTable, Empty, Hash, LiveDot, Skeleton, Stat, Time } from '@/ui'
import { HyphenGate, StaleIndexNotice } from '../hy-shared/HyphenGate'
import { cardState, firstPageStamp, infiniteTableProps } from '../hy-shared/infinite-list'
import { PageFrame } from '../hy-shared/PageFrame'
import { TxTypeBadge } from '../hy-shared/TxTypeBadge'
import { addressQueries } from './queries'
import type { WatchStatus } from './live'
import { useAddressActivity } from './useAddressActivity'

const AddressQr = lazy(() => import('./AddressQr'))

const NONE: HyAddress = {
  address: '',
  balance: 0n,
  totalReceived: 0n,
  totalSent: 0n,
  txCount: 0,
}

export function AddressPage({ address }: { address: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const checked = useMemo(() => classify(address, net), [address, net])
  const elsewhere = checked.networkHint !== undefined && checked.networkHint !== net
  const valid = checked.classes.includes('core-address') && !elsewhere

  return (
    <PageFrame path="/address/$address" title={t`Address`}>
      {valid ? (
        <>
          <p className="grid gap-1">
            <Hash value={address} display="wrap" />
          </p>
          <HyphenGate>
            <AddressContent net={net} address={address} />
          </HyphenGate>
        </>
      ) : checked.networkHint ? (
        <OtherNetwork address={address} hint={checked.networkHint} />
      ) : (
        <Empty
          kind="not-found"
          title={t`That isn’t a Dash address.`}
          body={t`A Dash address is 34 characters and starts with X or 7 on mainnet, y or 8 on testnet.`}
        />
      )}
    </PageFrame>
  )
}

function OtherNetwork({ address, hint }: { address: string; hint: NetworkId }) {
  const { t } = useLingui()
  const name = hint === 'mainnet' ? t`mainnet` : hint === 'testnet' ? t`testnet` : hint
  return (
    <Empty
      kind="not-found"
      title={t`This is a ${name} address.`}
      body={<Hash value={address} display="wrap" />}
      action={
        <PageLink to={`/address/${encodeURIComponent(address)}`} search={{ network: hint }}>
          {t`Open it on ${name}`}
        </PageLink>
      }
    />
  )
}

function AddressContent({ net, address }: { net: NetworkId; address: string }) {
  const { t } = useLingui()
  const summary = useQuery(addressQueries.summary(net, address))
  const txs = useInfiniteQuery(addressQueries.txs(net, address))
  const utxos = useQuery(addressQueries.utxos(net, address))
  const live = useAddressActivity(net, address, !isDevnet(net))

  const stamp: SourceStamp | undefined = summary.data ? stampOf(summary.data) : undefined
  const a = summary.data?.data ?? NONE
  const unconfirmed = live.pending.reduce((sum, p) => sum + p.net, 0n)
  const latestPending = live.latest !== undefined && live.pending.includes(live.latest)
  const table = infiniteTableProps(txs)

  const columns = useMemo<ColumnDef<HyAddressTx>[]>(
    () => [
      {
        id: 'tx',
        header: t`Transaction`,
        cell: ({ row }) => <Entity kind="tx" id={row.original.txHash} />,
        meta: { phone: 'title' },
      },
      {
        id: 'direction',
        header: t`Direction`,
        cell: ({ row }) =>
          row.original.direction === 'in' ? (
            <Badge tone="success">{t`Received`}</Badge>
          ) : (
            <Badge>{t`Sent`}</Badge>
          ),
        meta: { phone: 'secondary' },
      },
      {
        id: 'net',
        header: t`Net value`,
        cell: ({ row }) => <Amount value={row.original.netValue} kind="duffs" signed />,
        meta: { align: 'end', numeric: true, phone: 'primary' },
      },
      {
        id: 'type',
        header: t`Type`,
        cell: ({ row }) => <TxTypeBadge type={row.original.txType} />,
        meta: { phone: 'hidden' },
      },
      {
        id: 'block',
        header: t`Block`,
        cell: ({ row }) => (
          <Entity
            kind="block"
            id={String(row.original.blockHeight)}
            label={formatInt(row.original.blockHeight)}
          />
        ),
        meta: { phone: 'secondary' },
      },
      {
        id: 'time',
        header: t`Time`,
        cell: ({ row }) => <Time ms={row.original.blockTime} mode="absolute" />,
        meta: { phone: 'secondary' },
      },
    ],
    [t],
  )

  return (
    <>
      <StaleIndexNotice />
      <LiveNotice status={live.status} arrived={live.arrived} />
      {live.latest ? (
        <p
          role="status"
          data-new-transaction
          className="flex flex-wrap items-center gap-2 rounded border border-[var(--dh-line)] p-3 text-sm"
        >
          <Badge tone="warning">
            {latestPending ? t`Unconfirmed transaction` : t`New transaction`}
          </Badge>
          <Entity kind="tx" id={live.latest.txid} />
          <Amount value={live.latest.net} kind="duffs" signed />
          {latestPending ? <a href="#unconfirmed">{t`See unconfirmed activity`}</a> : null}
        </p>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <Card
          title={t`Summary`}
          layer="core"
          source={stamp}
          state={cardState(summary)}
          error={summary.error}
          onRetry={() => void summary.refetch()}
        >
          <div
            className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-3"
            data-address-summary
          >
            <Stat
              size="lg"
              label={t`Balance`}
              value={
                <span className="max-sm:text-[length:clamp(18px,6.5cqi,36px)]">
                  <Amount value={a.balance} kind="duffs" fiat />
                </span>
              }
            />
            <Stat
              label={t`Unconfirmed`}
              value={<Amount value={unconfirmed} kind="duffs" signed />}
              source={live.pending[0]?.stamp}
            />
            <Stat label={t`Transactions`} value={formatInt(a.txCount)} />
            <Stat
              label={t`Total received`}
              value={<Amount value={a.totalReceived} kind="duffs" />}
            />
            <Stat label={t`Total sent`} value={<Amount value={a.totalSent} kind="duffs" />} />
            <Stat
              label={t`First and last seen`}
              value={
                a.firstSeen && a.lastSeen ? (
                  <span className="grid gap-1 text-base font-normal">
                    <Time ms={a.firstSeen} mode="absolute" />
                    <Time ms={a.lastSeen} mode="absolute" />
                  </span>
                ) : (
                  t`Not seen yet`
                )
              }
            />
          </div>
        </Card>
        <Card title={t`QR code`} layer="core">
          <Suspense fallback={<Skeleton shape="block" height={200} />}>
            <AddressQr address={address} />
          </Suspense>
        </Card>
      </div>

      {live.pending.length > 0 ? (
        <Card title={t`Unconfirmed activity`} layer="core" id="unconfirmed">
          <ul className="grid gap-2" data-pending>
            {live.pending.map((p) => (
              <li key={p.txid} className="flex flex-wrap items-center gap-3">
                <Entity kind="tx" id={p.txid} />
                <Amount value={p.net} kind="duffs" signed />
                <Badge tone="warning">{t`Unconfirmed`}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card
        title={t`Transactions`}
        layer="core"
        id="history"
        padding="flush"
        source={firstPageStamp(txs)}
      >
        <DataTable
          caption={t`Transactions of this address, newest first`}
          columns={columns}
          {...table}
          getRowId={(r) => r.txHash}
          empty={
            <Empty
              kind="none-yet"
              title={t`No transactions seen for this address on this network.`}
            />
          }
          rowLink={(r) => ({ to: '/tx/$txid', params: { txid: r.txHash } })}
        />
        {txs.isFetchNextPageError ? (
          <p role="alert" className="rx-note flex flex-wrap items-center gap-3 p-3">
            {t`The next transactions could not be loaded.`}
            <button
              type="button"
              className="dh-btn dh-btn--sm"
              disabled={txs.isFetchingNextPage}
              onClick={() => void txs.fetchNextPage()}
            >
              {t`Try again`}
            </button>
          </p>
        ) : null}
      </Card>

      <UtxoCard query={utxos} />
    </>
  )
}

function LiveNotice({ status, arrived }: { status: WatchStatus; arrived: number }) {
  const { t } = useLingui()
  return (
    <p role="status" data-live={status} className="flex items-center gap-2 text-sm">
      <LiveDot state={status === 'live' ? 'live' : 'unknown'} />
      {status === 'live'
        ? t`Watching for new transactions on this address.`
        : status === 'connecting'
          ? t`Connecting to the live feed…`
          : status === 'paused'
            ? t`Live updates are paused while this tab is in the background.`
            : t`Live feed interrupted, reconnecting…`}
      {arrived > 0 ? (
        <strong data-arrived>
          <Plural
            value={arrived}
            one="# transaction seen since you opened this page"
            other="# transactions seen since you opened this page"
          />
        </strong>
      ) : null}
    </p>
  )
}

function UtxoCard({ query }: { query: UseQueryResult<Sourced<HyPage<HyUtxo>>> }) {
  const { t } = useLingui()
  const rows = query.data?.data.items ?? []
  const total = query.data?.data.total
  const columns = useMemo<ColumnDef<HyUtxo>[]>(
    () => [
      {
        id: 'output',
        header: t`Output`,
        cell: ({ row }) => (
          <span>
            <Entity kind="tx" id={row.original.txHash} />
            <span className="rx-mono">:{row.original.vout}</span>
          </span>
        ),
        meta: { phone: 'title' },
      },
      {
        id: 'value',
        header: t`Value`,
        cell: ({ row }) => <Amount value={row.original.value} kind="duffs" />,
        meta: { align: 'end', numeric: true, phone: 'primary' },
      },
      {
        id: 'height',
        header: t`Block`,
        cell: ({ row }) => (
          <Entity
            kind="block"
            id={String(row.original.height)}
            label={formatInt(row.original.height)}
          />
        ),
        meta: { phone: 'secondary' },
      },
    ],
    [t],
  )
  return (
    <Card
      title={t`Unspent outputs`}
      subtitle={
        total !== undefined && total > rows.length
          ? t`First ${formatInt(rows.length)} of ${formatInt(total)}`
          : undefined
      }
      layer="core"
      id="utxos"
      padding="flush"
      source={query.data ? stampOf(query.data) : undefined}
    >
      <DataTable
        caption={t`Unspent outputs of this address`}
        columns={columns}
        rows={rows}
        getRowId={(r) => `${r.txHash}:${r.vout}`}
        state={
          query.isPending
            ? 'loading'
            : query.isError
              ? 'error'
              : rows.length === 0
                ? 'empty'
                : 'ready'
        }
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={<Empty kind="none-yet" title={t`No unspent outputs.`} />}
      />
    </Card>
  )
}
