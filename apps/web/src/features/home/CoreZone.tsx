import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { coreQueries } from '@/data/core/queries'
import { stampOf } from '@/data/envelope'
import { useSourceHealth } from '@/data/health'
import { hyQueries } from '@/data/hyphen/queries'
import type { HyMempoolTx } from '@/data/hyphen/schemas'
import { Entity, PageLink, networkName, useNetwork } from '@/features/entity'
import { formatBytes, formatInt, formatSignificant } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import { Amount, Card, DataTable, Empty, SectionBand, Stat, Stats, Time } from '@/ui'
import { useHyphenFit } from '@/data/hyphen/fit'

const PENDING = 8

function useHyphenBlocked() {
  const net = useNetwork()
  const fit = useHyphenFit(net)
  const health = useSourceHealth('hyphen')
  return {
    net,
    fit,
    lag: health.lag?.detail,
    devnet: isDevnet(net),
    stale: health.state === 'stale' && health.lag !== undefined,
  }
}

function Headline() {
  const { t } = useLingui()
  const { net, fit, lag, devnet, stale } = useHyphenBlocked()
  const tip = useQuery(coreQueries.tip(net))
  const status = useQuery(coreQueries.status(net))
  const chainLock = useQuery({ ...coreQueries.chainLock(net), enabled: stale })
  const metrics = useQuery({ ...hyQueries.metricsLatest(net), enabled: fit })
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
  const net = useNetwork()
  const health = useSourceHealth('hyphen')
  const { stale } = useHyphenBlocked()
  if (!stale || !health.lag) return null
  const name = networkName(net)
  return (
    <p className="rx-note" role="note" data-hyphen-lag>
      {t`Supply, blockchain size and pending transactions come only from Hyphen, whose ${name} index is behind the chain: ${health.lag.detail}. The height, difficulty, ChainLock and latest blocks here come from DAPI.`}
    </p>
  )
}

function PendingCard() {
  const { t } = useLingui()
  const { net, fit, lag, devnet } = useHyphenBlocked()
  const query = useQuery({ ...hyQueries.mempoolTxs(net, { limit: 20 }), enabled: fit })
  const columns = useMemo<ColumnDef<HyMempoolTx>[]>(
    () => [
      {
        id: 'tx',
        header: t`Transaction`,
        cell: ({ row }) => <Entity kind="tx" id={row.original.txHash} />,
        meta: { phone: 'title' },
      },
      {
        id: 'value',
        header: t`Value`,
        cell: ({ row }) => <Amount value={row.original.valueOut} kind="duffs" />,
        meta: { numeric: true, align: 'end', phone: 'secondary' },
      },
      {
        id: 'size',
        header: t`Size`,
        accessorFn: (r) => formatBytes(r.txSize),
        meta: { numeric: true, phone: 'secondary' },
      },
      {
        id: 'seen',
        header: t`First seen`,
        cell: ({ row }) => <Time ms={row.original.firstSeenAt} mode="relative" live />,
        meta: { phone: 'primary' },
      },
    ],
    [t],
  )
  return (
    <Card
      layer="core"
      title={t`Pending transactions`}
      padding="flush"
      source={query.data ? stampOf(query.data) : undefined}
      actions={
        <PageLink to="/mempool" className="rx-go">
          {t`Mempool`}
        </PageLink>
      }
    >
      {devnet || !fit ? (
        <Empty
          kind={devnet ? 'unsupported-network' : 'blocked'}
          title={devnet ? t`Hyphen doesn't index devnets` : t`Pending transactions are unavailable`}
          body={devnet ? undefined : (lag ?? t`Hyphen's index is still being checked.`)}
        />
      ) : (
        <DataTable
          caption={t`Pending transactions`}
          columns={columns}
          rows={(query.data?.data.items ?? []).slice(0, PENDING)}
          getRowId={(r) => r.txHash}
          state={query.isError && !query.data ? 'error' : query.data ? 'ready' : 'loading'}
          error={query.error}
          onRetry={() => void query.refetch()}
          empty={<Empty kind="none-yet" title={t`No transactions in the mempool right now`} />}
          rowLink={(r) => ({ to: '/tx/$txid', params: { txid: r.txHash } })}
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
      description={t`The chain itself: height, difficulty, supply and what is waiting to be mined.`}
      actions={
        <PageLink to="/charts" className="rx-go">
          {t`Charts`}
        </PageLink>
      }
    >
      <Headline />
      <StaleNote />
      <div className="rx-grid" style={{ marginTop: 16 }}>
        <div className="rx-c12">
          <PendingCard />
        </div>
      </div>
    </SectionBand>
  )
}
