import { useLingui } from '@lingui/react/macro'
import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { coreQueries } from '@/data/core/queries'
import { useDecentralizedOnly } from '@/data/health'
import { peQueries } from '@/data/pe/queries'
import { radarQueries } from '@/data/radar/queries'
import { stampOf } from '@/data/envelope'
import { networkName, PageLink, useNetwork, keepPreviousOnNetwork } from '@/features/entity'
import { useCommandPalette } from '@/features/search'
import { formatInt, formatPercent } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import {
  Icon,
  LiveControl,
  LiveDot,
  LockMark,
  Skeleton,
  SourceLine,
  Time,
  useLiveView,
  usePausedFeed,
} from '@/ui'
import { CoreFigures } from './CoreZone'
import { HomeMap } from './HomeMap'
import { useHomeWidth } from './home-width'
import { LiveNotice } from './LiveNotice'
import { usePlatformTip } from './platform-tip'
import { useFrozen } from './use-frozen'

const LANE_CORE = 8
const LANE_PLATFORM = 10
export const CORE_ROWS = 12

function yesterday(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
}

function Kicker() {
  const { t } = useLingui()
  const live = useLiveView()
  const net = useNetwork()
  return (
    <p className="rx-scope__kicker" style={{ flexWrap: 'wrap', whiteSpace: 'normal' }}>
      <LiveDot state="live" bare />
      <b data-live-word data-connection={live.state}>
        {live.word}
      </b>
      <span>
        {net === 'mainnet' ? (
          <span data-net>{networkName(net)}</span>
        ) : (
          <span className="rx-tnbadge" data-net>
            {networkName(net)}
          </span>
        )}
        <span className="rx-scope__tail"> · {t`Core, Platform and the masternode network`}</span>
      </span>
    </p>
  )
}

function Omni() {
  const { t } = useLingui()
  const palette = useCommandPalette()
  return (
    <PageLink
      to="/search"
      className="rx-omni"
      data-palette-trigger
      aria-keyshortcuts="/ Control+K Meta+K"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        palette.open()
      }}
    >
      <Icon name="search" />
      <span>{t`Search blocks, txs, masternodes, names`}</span>
      <kbd aria-hidden="true">/</kbd>
    </PageLink>
  )
}

function CorePulse() {
  const { t } = useLingui()
  const net = useNetwork()
  const tip = useQuery(coreQueries.tip(net))
  const lock = useQuery(coreQueries.chainLock(net))
  const height = tip.data?.data.height
  const rows = useQuery({
    ...coreQueries.blockRows(net, { fromHeight: height ?? 0, count: CORE_ROWS }),
    enabled: height !== undefined,
    placeholderData: keepPreviousOnNetwork(net),
  })
  const tipRow = rows.data?.data.find((r) => r.height === height)
  const best = lock.data?.data
  // The rows are read once per new tip, often before the lock arrives; the best lock is re-read and settles it.
  const bestCoversTip = height !== undefined && best !== undefined && best.height >= height
  const locked = tipRow?.chainLocked === true || (bestCoversTip && !best.claim)
  return (
    <Link
      className="rx-pulse__row"
      data-layer="core"
      data-pulse="core"
      to="/block/$id"
      params={{ id: height === undefined ? 'tip' : String(height) }}
      disabled={height === undefined}
    >
      <span className="rx-tile">
        <Icon name="block" />
      </span>
      <span className="rx-pulse__label">
        {t`Core block height`} {tip.data ? <SourceLine stamp={stampOf(tip.data)} compact /> : null}
      </span>
      <span className="rx-pulse__value">
        {height === undefined ? (
          <Skeleton shape="line" width="6ch" />
        ) : (
          <span className="rx-tick" data-tip="core">
            {formatInt(height)}
          </span>
        )}
      </span>
      <span className="rx-pulse__meta">
        {tip.data ? (
          locked ? (
            <span className="rx-ok">
              <Icon name="cl" size="sm" />
              {t`ChainLocked`}
            </span>
          ) : best?.claim ? (
            <span data-claim="one-node">
              {t`ChainLock at ${formatInt(best.height)}, reported by one node`}
            </span>
          ) : tipRow?.chainLockClaim ? (
            <span data-claim="one-node">{t`ChainLock reported by one node`}</span>
          ) : null
        ) : null}
        {tip.data ? <Time ms={tip.data.data.time} mode="relative" live /> : null}
      </span>
    </Link>
  )
}

function PlatformPulse() {
  const { t } = useLingui()
  const net = useNetwork()
  const tip = usePlatformTip(net)
  const data = tip.data?.data
  return (
    <Link className="rx-pulse__row" data-layer="platform" data-pulse="platform" to="/platform">
      <span className="rx-tile">
        <Icon name="plat" />
      </span>
      <span className="rx-pulse__label">
        {t`Platform block height`}{' '}
        {tip.data ? <SourceLine stamp={stampOf(tip.data)} compact /> : null}
      </span>
      <span className="rx-pulse__value">
        {isDevnet(net) ? (
          '—'
        ) : data ? (
          <span className="rx-tick" data-tip="platform">
            {formatInt(data.height)}
          </span>
        ) : tip.isError ? (
          '—'
        ) : (
          <Skeleton shape="line" width="6ch" />
        )}
      </span>
      <span className="rx-pulse__meta">
        {data ? (
          <span>
            {t`Epoch ${formatInt(data.epoch.number)} · ${formatInt(Math.max(0, data.height - data.epoch.firstBlockHeight))} blocks in`}
          </span>
        ) : isDevnet(net) ? (
          <span>{t`Platform Explorer doesn't index devnets`}</span>
        ) : tip.isError ? (
          <span>
            {tip.sdkOnly
              ? t`The Platform SDK isn't answering`
              : t`Platform Explorer isn't answering`}
          </span>
        ) : null}
      </span>
    </Link>
  )
}

function CensusPulse() {
  const { t } = useLingui()
  const net = useNetwork()
  const off = useDecentralizedOnly()
  const summary = useQuery({ ...radarQueries.summary(net), enabled: !isDevnet(net) && !off })
  const crawl = summary.data?.data.crawl
  const share = crawl && crawl.mn_total > 0 ? crawl.mn_reachable / crawl.mn_total : undefined
  return (
    <Link
      className="rx-pulse__row"
      data-layer="network"
      data-pulse="census"
      data-unavailable={off ? 'mode' : undefined}
      to="/masternodes"
    >
      <span className="rx-tile">
        <Icon name="radar" />
      </span>
      <span className="rx-pulse__label">
        {t`Masternodes answering`}{' '}
        {summary.data ? <SourceLine stamp={stampOf(summary.data)} compact /> : null}
      </span>
      <span className="rx-pulse__value" style={{ color: 'var(--dh-good)' }}>
        {share !== undefined ? (
          formatPercent(share, 1)
        ) : isDevnet(net) || off || summary.isError ? (
          '—'
        ) : (
          <Skeleton shape="line" width="6ch" />
        )}
      </span>
      <span className="rx-pulse__meta">
        {crawl ? (
          <>
            <span>{t`${formatInt(crawl.mn_reachable)} of ${formatInt(crawl.mn_total)}`}</span>
            <span>
              {t`crawled`} <Time ms={crawl.finished} mode="relative" live />
            </span>
          </>
        ) : isDevnet(net) ? (
          <span>{t`Radar doesn't crawl devnets`}</span>
        ) : off ? (
          <span>{t`Needs Radar's crawler: off in Decentralized only mode`}</span>
        ) : null}
      </span>
    </Link>
  )
}

/** A lane that scrolls (on a phone) opens on its newest block, which is last. */
function useOpenOnNewest(ready: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  const done = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!ready || done.current || !el) return
    done.current = true
    el.scrollLeft = el.scrollWidth
  }, [ready])
  return ref
}

function Lanes() {
  const { t } = useLingui()
  const net = useNetwork()
  const [paused, setPaused] = usePausedFeed('home-lanes')
  const tip = useQuery(coreQueries.tip(net))
  const from = tip.data?.data.height
  const rows = useQuery({
    ...coreQueries.blockRows(net, { fromHeight: from ?? 0, count: CORE_ROWS }),
    enabled: from !== undefined,
    placeholderData: keepPreviousOnNetwork(net),
  })
  const off = useDecentralizedOnly()
  const indexed = !isDevnet(net) && !off
  const platform = useQuery({
    ...peQueries.latestBlocks(net, LANE_PLATFORM),
    enabled: indexed,
  })
  const coreRows = useFrozen(rows.data, paused)
  const platRows = useFrozen(platform.data, paused)
  const phone = useHomeWidth() === 'phone'
  // The height card above already shows the newest Core block on a phone. A paused or placeholder feed may not hold
  // that block at its head, so it is dropped by height and not by position.
  const tipHeight = tip.data?.data.height
  const core = (coreRows?.data ?? [])
    .filter((r) => !phone || r.height !== tipHeight)
    .slice(0, LANE_CORE)
    .reverse()
  const plat = (platRows?.data.items ?? []).slice(0, LANE_PLATFORM).reverse()
  const coreLane = useOpenOnNewest(core.length > 0)
  const platLane = useOpenOnNewest(plat.length > 0)
  const newCount =
    paused && rows.data && coreRows
      ? Math.max(0, (rows.data.data[0]?.height ?? 0) - (coreRows.data[0]?.height ?? 0))
      : 0
  return (
    <div className="rx-lanes" aria-labelledby="h-lanes">
      <div className="rx-lanes__head">
        <h2 id="h-lanes" title={t`Each Platform block is locked to a Core block.`}>
          {t`Latest blocks`}
        </h2>
        <span>{t`Each Platform block is locked to a Core block.`}</span>
        <span className="rx-lanes__short" aria-hidden="true">
          {t`Platform locks to Core`}
        </span>
        <LiveControl
          paused={paused}
          onToggle={() => setPaused(!paused)}
          newCount={newCount}
          pulseKey={tip.data?.data.height}
          noun={t`block updates`}
        />
      </div>
      <div className="rx-lanes__body">
        <div className="rx-lane__label" data-layer="core">
          <span className="rx-layer-dot" />
          {t`Core`}
        </div>
        <div
          className="rx-lane"
          id="lane-core"
          ref={coreLane}
          role="group"
          aria-label={t`Latest Core blocks, oldest first`}
        >
          {core.length === 0 ? <Skeleton shape="chip" count={4} /> : null}
          {core.map((b, i) => (
            <Link
              key={b.hash}
              className={`rx-blk${!phone && i === core.length - 1 ? ' is-tip' : ''}`}
              data-layer="core"
              to="/block/$id"
              params={{ id: String(b.height) }}
              data-h={b.height}
            >
              <b>{formatInt(b.height)}</b>
              <span>
                {t`${formatInt(b.txCount)} tx`} · <Time ms={b.time} mode="relative" live />
              </span>
              <LockMark locked={b.chainLocked} claim={b.chainLockClaim} compact />
            </Link>
          ))}
        </div>
        <div className="rx-lane__label" data-layer="platform">
          <span className="rx-layer-dot" />
          {t`Platform`}
        </div>
        <div
          className="rx-lane"
          id="lane-plat"
          ref={platLane}
          role="group"
          aria-label={t`Latest Platform blocks, oldest first`}
        >
          {isDevnet(net) ? (
            <span className="rx-note">{t`Platform Explorer doesn't index devnets.`}</span>
          ) : off ? (
            <span className="rx-note" data-unavailable="mode">
              {t`Platform's latest blocks need Platform Explorer, which Decentralized only mode doesn't use.`}
            </span>
          ) : null}
          {indexed && plat.length === 0 ? <Skeleton shape="chip" count={4} /> : null}
          {plat.map((b, i) => (
            <Link
              key={b.header.hash}
              className={`rx-blk${b.txs.length === 0 ? ' rx-blk--empty' : ''}${i === plat.length - 1 ? ' is-tip' : ''}`}
              data-layer="platform"
              to="/platform/block/$id"
              params={{ id: String(b.header.height) }}
              data-locked={b.header.l1LockedHeight ?? undefined}
              title={
                b.header.l1LockedHeight
                  ? t`Locked to Core block ${formatInt(b.header.l1LockedHeight)}`
                  : undefined
              }
            >
              <b>{formatInt(b.header.height)}</b>
              <span>
                {t`${formatInt(b.txs.length)} tx`} ·{' '}
                <Time ms={b.header.timestamp} mode="relative" live />
              </span>
            </Link>
          ))}
        </div>
      </div>
      <LiveNotice lastTipAt={tip.data?.fetchedAt} />
    </div>
  )
}

export function Scope() {
  const { t } = useLingui()
  const net = useNetwork()
  const tip = useQuery(coreQueries.tip(net))
  return (
    <section className="rx-plate rx-scope" aria-labelledby="h-scope" data-layer="network">
      <div className="dh-container">
        <div className="rx-scope__grid">
          <div className="rx-scope__left">
            <Kicker />
            <h1 id="h-scope">
              <span className="sr-only">{t`Radar:`} </span>
              {t`The Dash network, now`}
            </h1>
            <p className="rx-scope__lede">
              {t`Core blocks, masternodes and Platform records in one place. Every figure says where it came from and how fresh it is.`}
            </p>
            <Omni />
            <p className="rx-try">
              <span>{t`Try`}</span>
              {tip.data ? (
                <PageLink to={`/block/${tip.data.data.height}`}>
                  {String(tip.data.data.height)}
                </PageLink>
              ) : null}
              <PageLink to="/blocks" search={{ date: yesterday() }}>
                {yesterday()}
              </PageLink>
              <PageLink to="/mempool">{t`mempool`}</PageLink>
            </p>
            <div className="rx-row" style={{ gap: '10px 16px' }}>
              <PageLink to="/map" className="dh-btn">
                <Icon name="map" />
                {t`Open the map`}
              </PageLink>
              <PageLink to="/nodes" className="rx-go">
                {t`Network census`}
              </PageLink>
              <a href="#core-figures" className="rx-go rx-jump-core">
                {t`Core figures`}
              </a>
              <a href="#h-latest" className="rx-go rx-jump-core" data-jump="latest">
                {t`Latest blocks`}
              </a>
            </div>
          </div>
          <HomeMap />
        </div>
        <div className="rx-pulse">
          <CorePulse />
          <PlatformPulse />
          <CensusPulse />
        </div>
        <CoreFigures />
        <Lanes />
      </div>
    </section>
  )
}
