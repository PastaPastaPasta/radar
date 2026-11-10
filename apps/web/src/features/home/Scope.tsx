import { useLingui } from '@lingui/react/macro'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { coreQueries } from '@/data/core/queries'
import { peQueries } from '@/data/pe/queries'
import { radarQueries } from '@/data/radar/queries'
import { stampOf } from '@/data/envelope'
import { networkName, PageLink, useNetwork } from '@/features/entity'
import { useCommandPalette } from '@/features/search'
import { formatInt, formatPercent } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import { Icon, LiveControl, LiveDot, Skeleton, SourceLine, Time, usePausedFeed } from '@/ui'
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
  const net = useNetwork()
  return (
    <p className="rx-scope__kicker">
      <LiveDot state="ok" bare />
      <b>{t`Live`}</b>
      <span>
        {net === 'mainnet' ? (
          <span data-net>{networkName(net)}</span>
        ) : (
          <span className="rx-tnbadge" data-net>
            {networkName(net)}
          </span>
        )}{' '}
        · {t`Core, Platform and the masternode network`}
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
      aria-label={t`Search Radar (press /)`}
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

function MapPlaceholder() {
  const { t } = useLingui()
  return (
    <div className="rx-scope__map" data-map="pending">
      <svg
        className="rx-map"
        viewBox="0 0 1000 520"
        role="img"
        aria-label={t`The node map is not loaded yet`}
      >
        <defs>
          <pattern id="rx-dots" width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="11" cy="11" r="1.6" style={{ fill: 'var(--rx-plate-dot)' }} />
          </pattern>
        </defs>
        <rect width="1000" height="520" fill="url(#rx-dots)" />
      </svg>
      <div
        className="rx-callout"
        data-layer="network"
        style={{ left: '50%', top: '46%', transform: 'translate(-50%,-50%)' }}
      >
        <b>{t`Node map`}</b>
        <span>{t`Arrives with the network pages. The census figures below are live.`}</span>
      </div>
    </div>
  )
}

function CorePulse() {
  const { t } = useLingui()
  const net = useNetwork()
  const tip = useQuery(coreQueries.tip(net))
  const lock = useQuery(coreQueries.chainLock(net))
  const height = tip.data?.data.height
  const locked = tip.data && lock.data ? lock.data.data.height >= tip.data.data.height : false
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
          ) : lock.data ? (
            <span>{t`ChainLock at ${formatInt(lock.data.data.height)}`}</span>
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
          <span>{t`Platform Explorer isn't answering`}</span>
        ) : null}
      </span>
    </Link>
  )
}

function CensusPulse() {
  const { t } = useLingui()
  const net = useNetwork()
  const summary = useQuery({ ...radarQueries.summary(net), enabled: !isDevnet(net) })
  const crawl = summary.data?.data.crawl
  const share = crawl && crawl.mn_total > 0 ? crawl.mn_reachable / crawl.mn_total : undefined
  return (
    <Link className="rx-pulse__row" data-layer="network" data-pulse="census" to="/masternodes">
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
        ) : isDevnet(net) || summary.isError ? (
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
              {t`crawled`} <Time ms={crawl.finished * 1000} mode="relative" live />
            </span>
          </>
        ) : isDevnet(net) ? (
          <span>{t`Radar doesn't crawl devnets`}</span>
        ) : null}
      </span>
    </Link>
  )
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
    placeholderData: keepPreviousData,
  })
  const platform = useQuery({
    ...peQueries.latestBlocks(net, LANE_PLATFORM),
    enabled: !isDevnet(net),
  })
  const coreRows = useFrozen(rows.data, paused)
  const platRows = useFrozen(platform.data, paused)
  const core = (coreRows?.data ?? []).slice(0, LANE_CORE).reverse()
  const plat = (platRows?.data.items ?? []).slice(0, LANE_PLATFORM).reverse()
  const newCount =
    paused && rows.data && coreRows
      ? Math.max(0, (rows.data.data[0]?.height ?? 0) - (coreRows.data[0]?.height ?? 0))
      : 0
  return (
    <div className="rx-lanes" aria-labelledby="h-lanes">
      <div className="rx-lanes__head">
        <h2 id="h-lanes">{t`Latest blocks`}</h2>
        <span>{t`Each Platform block is locked to a Core block.`}</span>
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
        <div className="rx-lane" id="lane-core" aria-label={t`Latest Core blocks, oldest first`}>
          {core.length === 0 ? <Skeleton shape="chip" count={4} /> : null}
          {core.map((b, i) => (
            <Link
              key={b.hash}
              className={`rx-blk${i === core.length - 1 ? ' is-tip' : ''}`}
              data-layer="core"
              to="/block/$id"
              params={{ id: String(b.height) }}
              data-h={b.height}
            >
              <b>{formatInt(b.height)}</b>
              <span>
                {t`${formatInt(b.txCount)} tx`} · <Time ms={b.time} mode="relative" live />
              </span>
              {b.chainLocked ? <Icon name="cl" size="sm" className="rx-lock" /> : null}
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
          aria-label={t`Latest Platform blocks, oldest first`}
        >
          {isDevnet(net) ? (
            <span className="rx-note">{t`Platform Explorer doesn't index devnets.`}</span>
          ) : null}
          {!isDevnet(net) && plat.length === 0 ? <Skeleton shape="chip" count={4} /> : null}
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
              <PageLink to="/map" className="dh-btn dh-btn--primary">
                <Icon name="map" />
                {t`Open the map`}
              </PageLink>
              <PageLink to="/nodes" className="rx-go">
                {t`Network census`}
              </PageLink>
            </div>
          </div>
          <MapPlaceholder />
        </div>
        <div className="rx-pulse">
          <CorePulse />
          <PlatformPulse />
          <CensusPulse />
        </div>
        <Lanes />
      </div>
    </section>
  )
}
