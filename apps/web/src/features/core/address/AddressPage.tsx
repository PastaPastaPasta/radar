import { Plural, useLingui } from '@lingui/react/macro'
import { type UseQueryResult } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState, type ReactNode } from 'react'
import { stampOf, type SourceStamp, type Sourced } from '@/data/envelope'
import type { HyAddress, HyAddressTx, HyPage, HyUtxo } from '@/data/hyphen/schemas'
import { Entity, PageLink, useNetwork } from '@/features/entity'
import { classify } from '@/features/search'
import { formatInt } from '@/lib/format'
import { isDevnet, type NetworkId } from '@/lib/network'
import {
  Amount,
  Badge,
  Card,
  DataTable,
  Empty,
  Hash,
  LiveDot,
  Skeleton,
  SourceLine,
  Stat,
  Time,
  useMediaQuery,
} from '@/ui'
import { deferred } from '@/ui/deferred'
import { HyphenGate, StaleIndexNotice } from '../hy-shared/HyphenGate'
import { cardState, firstPageStamp, infiniteTableProps } from '../hy-shared/infinite-list'
import { PageFrame } from '../hy-shared/PageFrame'
import { TxTypeBadge } from '../hy-shared/TxTypeBadge'
import type { PendingTx, WatchStatus } from './live'
import { useAddressActivity } from './useAddressActivity'
import { useAddressData } from './useAddressData'

const AddressQr = deferred(
  () => import('./AddressQr').then((m) => m.default),
  <Skeleton shape="block" height={200} />,
)

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
  const phone = useMediaQuery('(max-width: 640px)')
  const [qrOpen, setQrOpen] = useState(false)
  const { index, from, seen, summary, txs, utxos, pendingInIndex } = useAddressData(net, address)
  const live = useAddressActivity(net, address, !isDevnet(net) && !index.pending, from)

  const stamp: SourceStamp | undefined = summary.data ? stampOf(summary.data) : undefined
  const a = summary.data?.data ?? NONE
  const pending = useMemo<PendingTx[]>(() => {
    const known = new Set(live.pending.map((p) => p.txid))
    const first = txs.data?.pages[0]
    const reported: PendingTx[] =
      first === undefined
        ? []
        : pendingInIndex
            .filter((p) => !known.has(p.txid))
            .map((p) => ({ ...p, confirmed: false, stamp: stampOf(first) }))
    return [...live.pending, ...reported]
  }, [live.pending, pendingInIndex, txs.data])
  const unconfirmed = pending.reduce((sum, p) => sum + p.net, 0n)
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
      <StaleIndexNotice reads="insight" />
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
          actions={
            phone ? (
              <button
                type="button"
                className="dh-btn dh-btn--sm"
                aria-expanded={qrOpen}
                aria-controls="address-qr"
                data-address-qr-toggle
                onClick={() => {
                  setQrOpen((v) => !v)
                }}
              >
                {qrOpen ? t`Hide QR code` : t`Show QR code`}
              </button>
            ) : undefined
          }
          state={cardState(summary)}
          error={summary.error}
          onRetry={() => void summary.refetch()}
        >
          <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3" data-address-summary>
            <div className="col-span-2 sm:col-span-1">
              <Stat
                size="lg"
                label={t`Balance`}
                value={
                  <span className="max-sm:text-[length:clamp(18px,6.5cqi,36px)]">
                    <Amount value={a.balance} kind="duffs" fiat />
                  </span>
                }
              />
            </div>
            <Stat
              label={t`Unconfirmed`}
              value={<Amount value={unconfirmed} kind="duffs" signed />}
              source={pending[0]?.stamp}
            />
            <Stat label={t`Transactions`} value={formatInt(a.txCount)} />
            <Stat
              label={t`Total received`}
              value={<Amount value={a.totalReceived} kind="duffs" />}
            />
            <Stat label={t`Total sent`} value={<Amount value={a.totalSent} kind="duffs" />} />
            <div className="col-span-2 sm:col-span-1">
              <SeenStat
                first={seen ? seen.first : (a.firstSeen ?? undefined)}
                last={seen ? seen.last : (a.lastSeen ?? undefined)}
                firstStamp={seen?.firstStamp}
                lastStamp={seen?.lastStamp}
                firstApproximate={seen?.firstApproximate ?? false}
                loading={seen ? seen.loading : false}
                failed={seen?.failed ?? false}
                historyFailed={seen?.historyFailed ?? false}
                onRetry={seen?.retry}
              />
            </div>
          </div>
          {phone ? (
            <div id="address-qr" className="mt-3" data-address-qr hidden={!qrOpen}>
              {qrOpen ? <AddressQr address={address} /> : null}
            </div>
          ) : null}
        </Card>
        {phone ? null : (
          <Card title={t`QR code`} layer="core">
            <AddressQr address={address} />
          </Card>
        )}
      </div>

      {pending.length > 0 ? (
        <Card title={t`Unconfirmed activity`} layer="core" id="unconfirmed">
          <ul className="grid gap-2" data-pending>
            {pending.map((p) => (
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

function SeenLine({
  label,
  stamp,
  children,
}: {
  label: string
  stamp?: SourceStamp
  children: ReactNode
}) {
  return (
    <span>
      <span className="text-[var(--dh-ink-2)]">{label}: </span>
      {children}
      {stamp ? <SourceLine stamp={stamp} compact /> : null}
    </span>
  )
}

function SeenStat({
  first,
  last,
  firstStamp,
  lastStamp,
  firstApproximate,
  loading,
  failed,
  historyFailed,
  onRetry,
}: {
  first?: number
  last?: number
  firstStamp?: SourceStamp
  lastStamp?: SourceStamp
  firstApproximate: boolean
  loading: boolean
  failed: boolean
  historyFailed: boolean
  onRetry?: () => void
}) {
  const { t } = useLingui()
  return (
    <Stat
      label={t`First and last seen`}
      loading={loading}
      value={
        last ? (
          <span className="grid gap-1 text-base font-normal" data-seen>
            {first ? (
              <SeenLine
                label={firstApproximate ? t`First (approximately)` : t`First`}
                stamp={firstStamp}
              >
                <Time ms={first} mode="absolute" />
              </SeenLine>
            ) : (
              <span className="text-[var(--dh-ink-2)]">{t`First: not available`}</span>
            )}
            <SeenLine label={t`Last`} stamp={lastStamp}>
              <Time ms={last} mode="absolute" />
            </SeenLine>
          </span>
        ) : historyFailed ? (
          <span className="grid gap-1 text-base font-normal" role="alert" data-seen-error>
            {t`Could not be read`}
            {onRetry ? (
              <button
                type="button"
                className="dh-btn dh-btn--sm justify-self-start"
                onClick={onRetry}
              >
                {t`Try again`}
              </button>
            ) : null}
          </span>
        ) : (
          t`Not seen yet`
        )
      }
      note={
        historyFailed
          ? t`Insight could not return this address’s transactions.`
          : failed && last
            ? t`Insight could not return this address’s oldest transactions.`
            : undefined
      }
    />
  )
}

function LiveNotice({ status, arrived }: { status: WatchStatus; arrived: number }) {
  const { t } = useLingui()
  return (
    <div
      role="status"
      data-live={status}
      className="grid gap-1 text-sm sm:flex sm:flex-wrap sm:items-center sm:gap-x-3"
    >
      <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1">
        <LiveDot state={status === 'live' ? 'live' : 'unknown'} />
        <span className="min-w-0">
          {status === 'live'
            ? t`Watching for new transactions on this address.`
            : status === 'connecting'
              ? t`Connecting to the live feed…`
              : status === 'paused'
                ? t`Live updates are paused while this tab is in the background.`
                : t`Live feed interrupted, reconnecting…`}
        </span>
      </p>
      {arrived > 0 ? (
        <strong data-arrived className="min-w-0">
          <Plural
            value={arrived}
            one="# transaction seen since you opened this page"
            other="# transactions seen since you opened this page"
          />
        </strong>
      ) : null}
    </div>
  )
}

const UTXO_PAGE = 25

function UtxoCard({ query }: { query: UseQueryResult<Sourced<HyPage<HyUtxo>>> }) {
  const { t } = useLingui()
  const [shown, setShown] = useState(UTXO_PAGE)
  const all = query.data?.data.items ?? []
  const rows = all.slice(0, shown)
  const total = query.data?.data.total
  const pending = all.filter((u) => u.height == null).length
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
        cell: ({ row }) =>
          row.original.height == null ? (
            <Badge tone="warning">{t`Pending`}</Badge>
          ) : (
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
  const subtitle =
    total !== undefined && total > all.length
      ? t`First ${formatInt(all.length)} of ${formatInt(total)}`
      : total !== undefined && total > rows.length
        ? t`${formatInt(rows.length)} of ${formatInt(total)}`
        : undefined
  return (
    <Card
      title={t`Unspent outputs`}
      subtitle={subtitle}
      layer="core"
      id="utxos"
      padding="flush"
      source={query.data ? stampOf(query.data) : undefined}
    >
      {pending > 0 ? (
        <p className="rx-note p-3" data-utxo-pending>
          {t`Pending outputs are not mined yet, so the balance above does not count them.`}
        </p>
      ) : null}
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
        paging={
          all.length > UTXO_PAGE
            ? {
                kind: 'infinite',
                hasNext: all.length > rows.length,
                fetchNext: () => setShown((n) => n + UTXO_PAGE),
                fetching: false,
              }
            : undefined
        }
      />
    </Card>
  )
}
