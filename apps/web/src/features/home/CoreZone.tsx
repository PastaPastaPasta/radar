import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { coreQueries } from '@/data/core/queries'
import { stampOf } from '@/data/envelope'
import { dapiKeys } from '@/data/query'
import { useIndexHealth } from '@/data/index-health'
import { hyQueries } from '@/data/hyphen/queries'
import { Entity, PageLink, useCatchUpToTip, useNetwork, useRefetchOnRise } from '@/features/entity'
import { formatBytes, formatInt, formatSignificant } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import {
  Amount,
  Card,
  DataTable,
  Empty,
  SectionBand,
  Stat,
  Stats,
  Time,
  useHyphenLagSentence,
} from '@/ui'
import { useHyphenFit } from '@/data/hyphen/fit'
import { useSeenPending } from './seen-pending'

const PENDING = 8

interface PendingRow {
  txid: string
  value: bigint
  size: number
  at: number
}

function useHyphenBlocked() {
  const net = useNetwork()
  const fit = useHyphenFit(net)
  const index = useIndexHealth(net)
  return {
    net,
    fit,
    lag: index.lag,
    devnet: isDevnet(net),
    stale: index.state === 'stale',
  }
}

function Headline() {
  const { t } = useLingui()
  const { net, fit, lag, devnet, stale } = useHyphenBlocked()
  const tip = useQuery(coreQueries.tip(net))
  const status = useQuery(coreQueries.status(net))
  const chainLock = useQuery({ ...coreQueries.chainLock(net), enabled: stale })
  const metrics = useQuery({ ...hyQueries.metricsLatest(net), enabled: fit })
  useRefetchOnRise(net, tip.data?.data.height, { keys: [dapiKeys(net, 'status')] })
  useCatchUpToTip(net, {
    key: dapiKeys(net, 'metrics-latest'),
    tipHeight: tip.data?.data.height,
    dataHeight: metrics.data?.height,
    enabled: fit,
  })
  const m = metrics.data?.data
  const note = devnet ? t`Hyphen doesn't index devnets` : (lag ?? t`Checking Hyphen…`)
  // The tip read follows its status read with a header read; the status already carries the height.
  const height = tip.data?.data.height ?? status.data?.data.blocks
  const heightSource = tip.data ? stampOf(tip.data) : status.data ? stampOf(status.data) : undefined
  return (
    <Stats data-headline>
      <Stat
        layer="core"
        label={t`Height`}
        value={height === undefined ? '—' : formatInt(height)}
        loading={height === undefined && (tip.isPending || status.isPending)}
        source={heightSource}
      />
      <Stat
        layer="core"
        label={t`Difficulty`}
        value={status.data ? formatSignificant(status.data.data.difficulty) : '—'}
        loading={status.isPending}
        source={status.data ? stampOf(status.data) : undefined}
      />
      {stale
        ? [
            <Stat
              key="lock"
              layer="core"
              label={t`Best ChainLock`}
              value={chainLock.data ? formatInt(chainLock.data.data.height) : '—'}
              note={chainLock.data?.data.claim ? t`ChainLock reported by one node` : undefined}
              loading={chainLock.isPending}
              source={chainLock.data ? stampOf(chainLock.data) : undefined}
            />,
            <Stat
              key="last"
              layer="core"
              label={t`Last block`}
              value={tip.data ? <Time ms={tip.data.data.time} mode="relative" live /> : '—'}
              loading={tip.isPending}
              source={tip.data ? stampOf(tip.data) : undefined}
            />,
          ]
        : [
            <Stat
              key="supply"
              layer="core"
              label={t`Circulating supply`}
              value={m ? <Amount value={m.circulatingSupply} kind="duffs" compact fiat /> : '—'}
              note={m ? undefined : fit ? undefined : note}
              loading={fit && metrics.isPending}
              source={metrics.data ? stampOf(metrics.data) : undefined}
            />,
            <Stat
              key="size"
              layer="core"
              label={t`Blockchain size`}
              value={m ? formatBytes(m.blockchainSize) : '—'}
              note={m ? undefined : fit ? undefined : note}
              loading={fit && metrics.isPending}
              source={metrics.data ? stampOf(metrics.data) : undefined}
            />,
          ]}
    </Stats>
  )
}

function StaleNote() {
  const { t } = useLingui()
  const { net, lag, stale } = useHyphenBlocked()
  const lagged = useHyphenLagSentence(net, stale ? lag : undefined)
  if (lagged === undefined) return null
  return (
    <p className="rx-note" role="note" data-hyphen-lag>
      {lagged} {t`Supply and blockchain size are not shown until it catches up.`}{' '}
      <PageLink to="/status">{t`See the sources`}</PageLink>
    </p>
  )
}

/** The Core headline figures and the note on a stale Hyphen index, shown in the home plate under the hero. */
export function CoreFigures() {
  return (
    <div className="rx-corefig" id="core-figures">
      <Headline />
      <StaleNote />
    </div>
  )
}

/** The pending list: a table in the full-width tablet row, row cards in the phone band and, as a feed, in a desktop column. */
export function PendingCard({ feed = false }: { feed?: boolean }) {
  const { t } = useLingui()
  const { net, fit, devnet, stale } = useHyphenBlocked()
  const query = useQuery({ ...hyQueries.mempoolTxs(net, { limit: 20 }), enabled: fit })
  const seenOnly = stale && !devnet
  const seen = useSeenPending(net, seenOnly)
  const columns = useMemo<ColumnDef<PendingRow>[]>(() => {
    return [
      {
        id: 'tx',
        header: t`Transaction`,
        cell: ({ row }) => <Entity kind="tx" id={row.original.txid} />,
        meta: { phone: 'title' },
      },
      {
        id: 'value',
        header: t`Value`,
        cell: ({ row }) => <Amount value={row.original.value} kind="duffs" />,
        meta: { numeric: true, align: 'end', phone: 'secondary' },
      },
      {
        id: 'size',
        header: t`Size`,
        accessorFn: (r) => formatBytes(r.size),
        meta: { numeric: true, phone: 'secondary' },
      },
      {
        id: 'seen',
        header: seenOnly ? t`Seen` : t`First seen`,
        cell: ({ row }) => <Time ms={row.original.at} mode="relative" live />,
        meta: { phone: 'primary' },
      },
    ]
  }, [t, seenOnly])
  const rows: PendingRow[] = seenOnly
    ? seen.rows.map((r) => ({ txid: r.txid, value: r.value, size: r.size, at: r.seenAt }))
    : (query.data?.data.items ?? []).map((r) => ({
        txid: r.txHash,
        value: r.valueOut,
        size: r.txSize,
        at: r.firstSeenAt,
      }))
  return (
    <Card
      layer="core"
      className={feed ? 'rx-card--feed' : undefined}
      title={t`Pending transactions`}
      subtitle={stale && seen.rows.length > 0 ? t`Seen since you opened this page` : undefined}
      padding="flush"
      source={stale ? seen.stamp : query.data ? stampOf(query.data) : undefined}
      actions={
        <PageLink to="/mempool" className="rx-go">
          {t`Mempool`}
        </PageLink>
      }
    >
      {seenOnly && rows.length === 0 ? (
        <Empty
          kind="none-yet"
          title={t`Nothing seen yet`}
          body={t`Nothing has arrived since you opened this page. The full mempool list needs Hyphen’s index, which is behind the chain.`}
        />
      ) : seenOnly ? (
        <DataTable
          caption={t`Pending transactions seen since you opened this page`}
          columns={columns}
          rows={rows.slice(0, PENDING)}
          getRowId={(r) => r.txid}
          state="ready"
          rowLink={(r) => ({ to: '/tx/$txid', params: { txid: r.txid } })}
        />
      ) : devnet || !fit ? (
        <Empty
          kind={devnet ? 'unsupported-network' : 'blocked'}
          title={devnet ? t`Hyphen doesn't index devnets` : t`Pending transactions are unavailable`}
          body={devnet ? undefined : t`Hyphen's index is still being checked.`}
        />
      ) : (
        <DataTable
          caption={t`Pending transactions`}
          columns={columns}
          rows={rows.slice(0, PENDING)}
          getRowId={(r) => r.txid}
          state={query.isError && !query.data ? 'error' : query.data ? 'ready' : 'loading'}
          error={query.error}
          onRetry={() => void query.refetch()}
          empty={<Empty kind="none-yet" title={t`No transactions in the mempool right now`} />}
          rowLink={(r) => ({ to: '/tx/$txid', params: { txid: r.txid } })}
        />
      )}
    </Card>
  )
}

export function CoreZone() {
  const { t } = useLingui()
  return (
    <SectionBand
      layer="core"
      id="core"
      title={t`Dash Core`}
      description={t`What is waiting to be mined.`}
      actions={
        <PageLink to="/charts" className="rx-go">
          {t`Charts`}
        </PageLink>
      }
    >
      <div className="rx-grid">
        <div className="rx-c12">
          <PendingCard />
        </div>
      </div>
    </SectionBand>
  )
}
