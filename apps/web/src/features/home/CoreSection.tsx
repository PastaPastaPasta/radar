import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { coreQueries } from '@/data/core/queries'
import { SEEN_STORE_LIMIT, useSeenPending } from '@/data/core/seen-pending'
import type { BlockRow } from '@/data/core/types'
import { stampOf } from '@/data/envelope'
import { useHyphenFit } from '@/data/hyphen/fit'
import { hyQueries } from '@/data/hyphen/queries'
import { useIndexHealth } from '@/data/index-health'
import { dapiKeys } from '@/data/query'
import {
  Entity,
  keepPreviousOnNetwork,
  PageLink,
  useCatchUpToTip,
  useNetwork,
  useRefetchOnRise,
} from '@/features/entity'
import { formatBytes, formatInt, formatSignificant } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import {
  Amount,
  Card,
  DataTable,
  Empty,
  LiveControl,
  LockMark,
  Time,
  useHyphenLagSentence,
  useMediaQuery,
  usePausedFeed,
} from '@/ui'
import { Figure, Figures, SourceRow, SourceScope, useSectionSources } from './Figure'
import { atTip, pushed } from './freshness'
import { CORE_ROWS } from './Hero'
import { LiveNotice } from './LiveNotice'
import { useFrozen } from './use-frozen'

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
    /** Decentralized only mode: Hyphen is not asked, so the DAPI-only figures and the seen list show, as on a stale network. */
    off: index.off,
  }
}

/** Difficulty, supply and size, read again on each new block; the height itself is the hero's Core figure. */
function useCoreFigures() {
  const { t } = useLingui()
  const { net, fit, lag, devnet, stale, off } = useHyphenBlocked()
  const dapiOnly = stale || off
  const tip = useQuery(coreQueries.tip(net))
  const status = useQuery(coreQueries.status(net))
  const chainLock = useQuery({ ...coreQueries.chainLock(net), enabled: dapiOnly })
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
  const tipHeight = tip.data?.data.height
  const sources = {
    status: status.data ? atTip(stampOf(status.data), tipHeight) : undefined,
    lock: chainLock.data ? pushed(stampOf(chainLock.data)) : undefined,
    metrics: metrics.data ? atTip(stampOf(metrics.data), tipHeight) : undefined,
  }
  return {
    stamps: [
      tip.data ? pushed(stampOf(tip.data)) : undefined,
      sources.status,
      sources.lock,
      sources.metrics,
    ],
    figures: (
      <Figures data-headline>
        <Figure
          layer="core"
          label={t`Difficulty`}
          value={status.data ? formatSignificant(status.data.data.difficulty) : '—'}
          loading={status.isPending}
          source={sources.status}
        />
        {dapiOnly ? (
          <Figure
            layer="core"
            label={t`Best ChainLock`}
            value={chainLock.data ? formatInt(chainLock.data.data.height) : '—'}
            note={chainLock.data?.data.claim ? t`ChainLock reported by one node` : undefined}
            loading={chainLock.isPending}
            source={sources.lock}
          />
        ) : (
          <>
            <Figure
              layer="core"
              label={t`Circulating supply`}
              value={m ? <Amount value={m.circulatingSupply} kind="duffs" compact fiat /> : '—'}
              note={m || fit ? undefined : note}
              loading={fit && metrics.isPending}
              source={sources.metrics}
            />
            <Figure
              layer="core"
              label={t`Blockchain size`}
              value={m ? formatBytes(m.blockchainSize) : '—'}
              note={m || fit ? undefined : note}
              loading={fit && metrics.isPending}
              source={sources.metrics}
            />
          </>
        )}
      </Figures>
    ),
  }
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

function useCoreBlocks(paused: boolean) {
  const net = useNetwork()
  const tip = useQuery(coreQueries.tip(net))
  const from = tip.data?.data.height
  const rows = useQuery({
    ...coreQueries.blockRows(net, { fromHeight: from ?? 0, count: CORE_ROWS }),
    enabled: from !== undefined,
    placeholderData: keepPreviousOnNetwork(net),
  })
  const shown = useFrozen(rows.data, paused)
  const newCount =
    paused && rows.data && shown
      ? Math.max(0, (rows.data.data[0]?.height ?? 0) - (shown.data[0]?.height ?? 0))
      : 0
  return { tip, rows, shown, newCount }
}

function BlocksCard({ blocks }: { blocks: ReturnType<typeof useCoreBlocks> }) {
  const { t } = useLingui()
  const { rows, shown } = blocks
  const phone = useMediaQuery('(max-width: 640px)')
  const hasPool = (shown?.data ?? []).some((r) => r.pool)
  const columns = useMemo<ColumnDef<BlockRow>[]>(
    () => [
      {
        id: 'block',
        header: t`Block`,
        cell: ({ row }) => (
          <span className="rx-row" style={{ gap: 6 }}>
            <Entity kind="block" id={String(row.original.height)} copy={false} />
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
        meta: { numeric: true, phone: 'secondary', phoneUnit: t`tx` },
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
              meta: { phone: phone ? ('hidden' as const) : undefined },
            },
          ]
        : []),
    ],
    [t, hasPool, phone],
  )
  return (
    <Card
      title={t`Core blocks`}
      padding="flush"
      source={shown ? stampOf(shown) : undefined}
      actions={
        <PageLink to="/blocks" className="rx-go">
          {t`All blocks`}
        </PageLink>
      }
    >
      <DataTable
        caption={t`Latest Core blocks`}
        columns={columns}
        rows={shown?.data ?? []}
        getRowId={(r) => String(r.height)}
        state={rows.isError && !shown ? 'error' : shown ? 'ready' : 'loading'}
        error={rows.error}
        onRetry={() => void rows.refetch()}
        rowLink={(r) => ({ to: '/block/$id', params: { id: String(r.height) } })}
      />
    </Card>
  )
}

function usePending(paused: boolean) {
  const { net, fit, devnet, stale, off } = useHyphenBlocked()
  const query = useQuery({ ...hyQueries.mempoolTxs(net, { limit: 20 }), enabled: fit })
  const seenOnly = (stale || off) && !devnet
  // Asking for every stored row returns the hook's own array, which keeps its identity between events; a shorter limit is
  // a fresh slice on each render, and `useFrozen` follows identity.
  const seen = useSeenPending(net, seenOnly, SEEN_STORE_LIMIT)
  const live = useMemo<PendingRow[]>(
    () =>
      seenOnly
        ? seen.rows
            .slice(0, PENDING)
            .map((r) => ({ txid: r.txid, value: r.value, size: r.size, at: r.seenAt }))
        : (query.data?.data.items ?? []).map((r) => ({
            txid: r.txHash,
            value: r.valueOut,
            size: r.txSize,
            at: r.firstSeenAt,
          })),
    [seenOnly, seen.rows, query.data],
  )
  const rows = useFrozen(live, paused)
  const stamp = seenOnly ? seen.stamp : query.data ? stampOf(query.data) : undefined
  return { query, rows, stamp, seenOnly, seenAny: seen.rows.length > 0, fit, devnet, off }
}

function PendingCard({ pending }: { pending: ReturnType<typeof usePending> }) {
  const { t } = useLingui()
  const { query, rows, stamp, seenOnly, seenAny, fit, devnet, off } = pending
  const columns = useMemo<ColumnDef<PendingRow>[]>(() => {
    return [
      {
        id: 'tx',
        header: t`Transaction`,
        cell: ({ row }) => <Entity kind="tx" id={row.original.txid} copy={false} />,
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
  return (
    <Card
      title={t`Pending transactions`}
      subtitle={seenOnly && seenAny ? t`Seen since you opened this page` : undefined}
      padding="flush"
      source={stamp}
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
          body={
            off
              ? t`Nothing has arrived since you opened this page. The full mempool list needs an indexer, which Decentralized only mode doesn't use.`
              : t`Nothing has arrived since you opened this page. The full mempool list needs Hyphen’s index, which is behind the chain.`
          }
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

/** Dash Core: the chain's figures, then its latest blocks beside what is waiting to be mined. */
export function CoreSection() {
  const { t } = useLingui()
  const [paused, setPaused] = usePausedFeed('home-core')
  const figures = useCoreFigures()
  const blocks = useCoreBlocks(paused)
  const pending = usePending(paused)
  const { line, covered } = useSectionSources([
    ...figures.stamps,
    blocks.shown ? stampOf(blocks.shown) : undefined,
    pending.stamp,
  ])
  return (
    <section className="rx-home__sec" id="core" data-layer="core" aria-labelledby="h-core">
      <div className="rx-sec__head">
        <h2 className="rx-sec__title" id="h-core">
          {t`Dash Core`}
        </h2>
        <div className="rx-sec__actions">
          <PageLink to="/charts" className="rx-go">
            {t`Charts`}
          </PageLink>
          <LiveControl
            paused={paused}
            onToggle={() => setPaused(!paused)}
            newCount={blocks.newCount}
            pulseKey={blocks.tip.data?.data.height}
            noun={t`block updates`}
          />
        </div>
      </div>
      <SourceRow line={line} />
      <SourceScope value={covered}>
        <div id="core-figures">
          {figures.figures}
          <StaleNote />
        </div>
        <LiveNotice lastTipAt={blocks.tip.data?.fetchedAt} />
        <div className="rx-home__lists">
          <BlocksCard blocks={blocks} />
          <PendingCard pending={pending} />
        </div>
      </SourceScope>
    </section>
  )
}
