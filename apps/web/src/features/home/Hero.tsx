import { plural } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { coreQueries } from '@/data/core/queries'
import { stampOf } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { radarQueries } from '@/data/radar/queries'
import { v24Pending } from '@/data/radar/schemas'
import { networkName, PageLink, useNetwork } from '@/features/entity'
import { useCommandPalette } from '@/features/search'
import { isCrawlStale } from '@/lib/crawl'
import { formatInt, formatPercent } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import {
  Icon,
  LiveDot,
  SectionSources,
  Skeleton,
  SourceSection,
  Time,
  Unavailable,
  useLiveView,
  useNow,
} from '@/ui'
import { useCoreRows } from './core-rows'
import { Figure, Figures } from './Figure'
import { agedFromRead, pushed } from './freshness'
import { HomeMap } from './HomeMap'
import { TIP_POLL_MS, usePlatformTip } from './platform-tip'

const UNKNOWN = 'Unknown'

type Dist = readonly (readonly [string, number])[] | undefined

const countOf = (rows: Dist, key: string): number => rows?.find(([k]) => k === key)?.[1] ?? 0

function Kicker({ crawlStale }: { crawlStale: boolean }) {
  const { t } = useLingui()
  const live = useLiveView()
  const net = useNetwork()
  // The word follows the connection first. While that is live, it follows the crawl the claim is built from.
  const dataStale = crawlStale && live.dot === 'live'
  return (
    <p className="rx-hero__kicker">
      <LiveDot state={dataStale ? 'stale' : 'live'} bare />
      <b data-live-word data-connection={live.state} data-data={dataStale ? 'stale' : 'fresh'}>
        {dataStale ? t`Behind` : live.word}
      </b>
      <span className={net === 'mainnet' ? undefined : 'rx-tnbadge'} data-net>
        {networkName(net)}
      </span>
    </p>
  )
}

/** Opens the palette; a modified click, or no script, follows the link to the search page. */
function SearchButton() {
  const { t } = useLingui()
  const palette = useCommandPalette()
  return (
    <PageLink
      to="/search"
      className="dh-btn rx-hero__search"
      data-palette-trigger
      aria-keyshortcuts="/ Control+K Meta+K"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        palette.open()
      }}
    >
      <Icon name="search" />
      {t`Search Radar`}
      <kbd aria-hidden="true">/</kbd>
    </PageLink>
  )
}

function useCoreFigure() {
  const { t } = useLingui()
  const net = useNetwork()
  const tip = useQuery(coreQueries.tip(net))
  const status = useQuery(coreQueries.status(net))
  const lock = useQuery(coreQueries.chainLock(net))
  // The tip read follows its status read with a header read; the status already carries the height.
  const height = tip.data?.data.height ?? status.data?.data.blocks
  const rows = useCoreRows(net, tip.data?.data.height)
  const tipRow = rows.data?.data.find((r) => r.height === height)
  const best = lock.data?.data
  // The rows are read once per new tip, often before the lock arrives; the best lock is re-read and settles it.
  const bestCoversTip = height !== undefined && best !== undefined && best.height >= height
  const locked = tipRow?.chainLocked === true || (bestCoversTip && !best.claim)
  const state = !tip.data ? null : locked ? (
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
  const source = tip.data
    ? pushed(stampOf(tip.data))
    : status.data
      ? stampOf(status.data)
      : undefined
  return {
    source,
    figure: (
      <Figure
        layer="core"
        attrs={{ 'data-pulse': 'core' }}
        label={
          <Link
            className="rx-fig__link"
            to="/block/$id"
            params={{ id: height === undefined ? 'tip' : String(height) }}
            disabled={height === undefined}
          >
            {t`Core block height`}
          </Link>
        }
        loading={height === undefined && (tip.isPending || status.isPending)}
        value={
          height === undefined ? (
            '—'
          ) : (
            <span className="rx-tick" data-tip="core">
              {formatInt(height)}
            </span>
          )
        }
        note={
          tip.data ? (
            <>
              {state}
              {state ? ' · ' : null}
              <Time ms={tip.data.data.time} mode="relative" live />
            </>
          ) : undefined
        }
        source={source}
      />
    ),
  }
}

function usePlatformFigure() {
  const { t } = useLingui()
  const net = useNetwork()
  const tip = usePlatformTip(net)
  const data = tip.data?.data
  const devnet = isDevnet(net)
  // The SDK's answer is stamped with its block's time, and Platform can go minutes without a block.
  const source = !tip.data
    ? undefined
    : tip.data.fallback
      ? stampOf(tip.data)
      : agedFromRead(stampOf(tip.data), 2 * TIP_POLL_MS)
  return {
    source,
    figure: (
      <Figure
        layer="platform"
        attrs={{ 'data-pulse': 'platform' }}
        label={
          <Link className="rx-fig__link" to="/platform">
            {t`Platform block height`}
          </Link>
        }
        loading={!devnet && !data && !tip.isError}
        value={
          data && !devnet ? (
            <span className="rx-tick" data-tip="platform">
              {formatInt(data.height)}
            </span>
          ) : (
            '—'
          )
        }
        note={
          devnet
            ? t`Platform Explorer doesn't index devnets`
            : data
              ? t`Epoch ${formatInt(data.epoch.number)} · ${formatInt(Math.max(0, data.height - data.epoch.firstBlockHeight))} blocks in`
              : tip.isError
                ? tip.sdkOnly
                  ? t`The Platform SDK isn't answering`
                  : t`Platform Explorer isn't answering`
                : undefined
        }
        source={source}
      />
    ),
  }
}

export function Hero() {
  const { t } = useLingui()
  const net = useNetwork()
  const off = useDecentralizedOnly()
  const devnet = isDevnet(net)
  const radarOn = !devnet && !off
  const census = { enabled: radarOn }
  const summary = useQuery({ ...radarQueries.summary(net), ...census })
  const activation = useQuery({ ...radarQueries.activation(net), enabled: radarOn })
  const geo = useQuery({ ...radarQueries.geo(net), ...census })
  const now = useNow()
  const core = useCoreFigure()
  const platform = usePlatformFigure()

  const crawl = summary.data?.data.crawl
  const dayAgo = summary.data?.data.day_ago
  const crawled = summary.data ? stampOf(summary.data) : undefined
  const counting = radarOn && !crawl && !summary.isError
  const mn = summary.data?.data.dists.mn
  const all = summary.data?.data.dists.all
  const share = crawl && crawl.mn_total > 0 ? crawl.mn_reachable / crawl.mn_total : undefined
  const silent = crawl ? crawl.mn_total - crawl.mn_reachable : 0
  const diff = crawl && dayAgo ? crawl.mn_reachable - dayAgo.mn_reachable : undefined
  const change =
    diff === undefined
      ? undefined
      : diff === 0
        ? t`As many as a day ago.`
        : diff > 0
          ? plural(diff, {
              one: 'That’s # more than a day ago.',
              other: 'That’s # more than a day ago.',
            })
          : plural(-diff, {
              one: 'That’s # fewer than a day ago.',
              other: 'That’s # fewer than a day ago.',
            })
  const count = crawl ? formatInt(crawl.mn_reachable) : <Skeleton shape="line" width="4ch" />
  const enabled = crawl ? formatInt(crawl.mn_total) : ''
  const addresses = crawl ? formatInt(crawl.reachable) : ''
  const v24 = v24Pending(activation.data?.data, now)
  const sources = [crawled, geo.data ? stampOf(geo.data) : undefined, core.source, platform.source]
  const crawlStale = crawled !== undefined && isCrawlStale(now - crawled.asOf)

  return (
    <section className="rx-hero" aria-labelledby="h-hero" data-census={crawl ? 'ready' : 'none'}>
      <div className="rx-hero__copy" data-source-scope="">
        <SourceSection source={sources}>
          <Kicker crawlStale={crawlStale} />
          <h1 id="h-hero">
            <span className="sr-only">{t`Radar:`} </span>
            {crawl || counting ? (
              <span data-census-claim>
                <Trans>
                  <span className="rx-hero__n">{count}</span> masternodes answered the last crawl
                </Trans>
              </span>
            ) : (
              t`The Dash network, now`
            )}
          </h1>
          <p className="rx-hero__lede" data-census-lede={crawl ? '' : undefined}>
            {crawl ? (
              <>
                {share === undefined
                  ? t`Each masternode is counted once.`
                  : t`That is ${formatPercent(share, 1)} of the ${enabled} enabled masternodes, each counted once.`}{' '}
                {change === undefined ? null : <>{change} </>}
                {t`In all ${addresses} addresses answered; a node reachable on several networks counts at each.`}
              </>
            ) : counting ? (
              <Skeleton shape="line" count={2} />
            ) : (
              t`Core blocks, masternodes and Platform records in one place. Every figure says where it came from and how fresh it is.`
            )}
          </p>
          <Figures data-hero-figures>
            {crawl || counting ? (
              <Figure
                layer="network"
                attrs={{ 'data-pulse': 'census' }}
                tone={
                  share === undefined
                    ? undefined
                    : share >= 0.98
                      ? 'good'
                      : share >= 0.9
                        ? 'warn'
                        : 'bad'
                }
                label={
                  <Link className="rx-fig__link" to="/masternodes">
                    {t`Masternodes answering`}
                  </Link>
                }
                loading={share === undefined}
                value={share === undefined ? '—' : formatPercent(share, 1)}
                note={
                  silent > 0
                    ? plural(silent, { one: "# didn't answer", other: "# didn't answer" })
                    : undefined
                }
                source={crawled}
              />
            ) : null}
            {core.figure}
            {platform.figure}
            {crawl || counting ? (
              <>
                <Figure
                  label={
                    <PageLink
                      className="rx-fig__link"
                      to="/masternodes"
                      search={{ type: 'evo', status: 'enabled' }}
                    >
                      {t`Evonodes`}
                    </PageLink>
                  }
                  loading={!crawl}
                  value={formatInt(countOf(mn?.type, 'Evo'))}
                  note={t({ message: 'enabled', context: 'evonodes counted' })}
                  source={crawled}
                />
                <Figure
                  label={
                    <PageLink className="rx-fig__link" to="/nodes" hash="countries">
                      {t`Countries`}
                    </PageLink>
                  }
                  loading={!crawl}
                  value={formatInt((all?.country ?? []).filter(([k]) => k !== UNKNOWN).length)}
                  note={t`all nodes`}
                  source={crawled}
                />
                <Figure
                  label={
                    <PageLink
                      className="rx-fig__link"
                      to="/masternodes"
                      search={{ status: 'pose-banned' }}
                    >
                      {t`PoSe-banned`}
                    </PageLink>
                  }
                  loading={!crawl}
                  value={formatInt(countOf(mn?.status, 'pose_banned'))}
                  source={crawled}
                />
              </>
            ) : null}
          </Figures>
          {off ? (
            <Unavailable compact title={t`The node count and map need Radar's crawler`} />
          ) : devnet ? (
            <p className="rx-note" data-census-note>
              {t`Radar doesn't crawl devnets, so there is nothing to map.`}
            </p>
          ) : !crawl && summary.isError ? (
            <p className="rx-note" data-census-note>
              {t`Radar isn't answering, so the map shows no nodes.`}
            </p>
          ) : null}
          <SectionSources className="rx-home__src" />
          <div className="rx-hero__actions">
            <PageLink to="/map" className="dh-btn dh-btn--primary">
              {t`Open the map`}
            </PageLink>
            <SearchButton />
            {v24 ? (
              <Link to="/v24" className="rx-go" data-v24-link>
                {t`Core 24 activation`}
              </Link>
            ) : null}
          </div>
        </SourceSection>
      </div>
      <HomeMap />
    </section>
  )
}
