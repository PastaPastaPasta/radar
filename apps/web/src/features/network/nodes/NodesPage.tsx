import { useLingui } from '@lingui/react/macro'
import { useSearch } from '@tanstack/react-router'
import { PageFrame, PageLink, useNetwork } from '@/features/entity'
import { isDevnet } from '@/lib/network'
import { Empty, SegFilter, Unavailable } from '@/ui'
import { useCensus, useCrawlAvailable, useV24Pending } from './census-data'
import { CENSUS_SCOPES, radarScope } from './census-math'
import { DapiMasternodes } from './DapiMasternodes'
import { Headline } from './Headline'
import { Notice } from './parts'
import { ReachCard } from './ReachCard'
import { SCOPE_LABEL } from './scope-text'
import { StaleCrawl } from './StaleCrawl'
import { useCensusSearch } from './shared'
import { PlatformHealthCard, ReadinessCard, SpeedCard, YieldsCard } from './FleetCards'
import { VersionsCard } from './VersionsCard'
import { WhereCards } from './WhereCards'

export function NodesPage() {
  const { t } = useLingui()
  return (
    <PageFrame
      path="/nodes"
      title={t`Nodes`}
      eyebrow={t`Network`}
      layer="network"
      lede={t`Every Dash node that answers a crawl: what they run, where they are hosted and whether they can be reached.`}
    >
      <Census />
    </PageFrame>
  )
}

function Census() {
  const { t, i18n } = useLingui()
  const net = useNetwork()
  const setSearch = useCensusSearch()
  const { scope, versions, days } = useSearch({ from: '/nodes' })
  const { available, off } = useCrawlAvailable(net)
  const census = useCensus(net, scope, days, versions === 'time')
  const v24 = useV24Pending(net)
  const props = { net, scope, versions, days, summary: census.summary }

  if (!available) {
    return (
      <>
        {off ? (
          <Unavailable title={t`The node census needs Radar's crawl`} source="radar" />
        ) : (
          <Empty
            kind="unsupported-network"
            title={t`Radar doesn't crawl devnets.`}
            body={t`The census comes from Radar's crawl of mainnet and testnet.`}
          />
        )}
        <DapiMasternodes net={net} />
      </>
    )
  }
  if (isDevnet(net)) return null

  return (
    <>
      <StaleCrawl net={net} status={census.status} summary={census.summary} />
      {v24 ? (
        <Notice data-v24-link>
          {t`Dash Core 24 activation is under way.`}{' '}
          <PageLink to="/v24">{t`Follow it on the activation tracker`}</PageLink>
        </Notice>
      ) : null}
      <Headline {...props} />
      <div
        className="flex min-w-0 flex-wrap items-center gap-3 [&_.dh-seg]:max-w-full [&_.dh-seg]:overflow-x-auto"
        data-census-scope
      >
        <span className="text-sm text-[var(--dh-ink-2)]">{t`Describing`}</span>
        <SegFilter
          label={t`Which nodes`}
          value={scope}
          options={CENSUS_SCOPES.map((s) => ({ id: s, label: i18n._(SCOPE_LABEL[s]) }))}
          onChange={(id) => {
            setSearch({ scope: id })
          }}
        />
        <span className="sr-only" data-radar-scope={radarScope(scope)} />
      </div>
      <VersionsCard {...props} census={census} />
      <WhereCards {...props} />
      <ReachCard {...props} census={census} />
      <ReadinessCard {...props} />
      <YieldsCard {...props} />
      <PlatformHealthCard {...props} />
      <SpeedCard {...props} census={census} />
    </>
  )
}
