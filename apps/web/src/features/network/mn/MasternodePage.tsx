import { useLingui } from '@lingui/react/macro'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { LinkProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { coreQueries } from '@/data/core/queries'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { radarQueries } from '@/data/radar/queries'
import { CopyLinkButton, PageLink, useDocumentTitle, useNetwork } from '@/features/entity'
import { isDevnet, type NetworkId } from '@/lib/network'
import {
  Empty,
  ErrorState,
  Hash,
  Icon,
  LinkOut,
  Nodeprint,
  Skeleton,
  SourceLine,
  Tabs,
  Time,
  Unavailable,
} from '@/ui'
import { HistoryTab } from './HistoryTab'
import type { MnContext } from './mn-context'
import { useDapiFacts, useRadarRecord } from './mn-data'
import {
  isEvonode,
  otherNetwork,
  placeOf,
  poseState,
  PROTX,
  splitService,
  type MnTab,
} from './mn-info'
import { NetworkTab } from './NetworkTab'
import { OverviewTab } from './OverviewTab'
import { PaymentsTab } from './PaymentsTab'
import { PlatformTab } from './PlatformTab'

export interface MasternodePageProps {
  protx: string
  tab?: MnTab | undefined
  epoch?: number | undefined
  before?: number | undefined
}

export function MasternodePage({ protx, tab, epoch, before }: MasternodePageProps) {
  const { t } = useLingui()
  const net = useNetwork()
  const id = protx.toLowerCase()
  const off = useDecentralizedOnly()
  useDocumentTitle(t`Masternode ${id.slice(0, 8)}`)

  return (
    <article
      data-page="/mn/$protx"
      data-layer="network"
      className="grid grid-cols-[minmax(0,1fr)] gap-6"
    >
      {!PROTX.test(protx) ? (
        <NotAProtx value={protx} />
      ) : isDevnet(net) ? (
        <PlainTitle>
          <Empty
            kind="unsupported-network"
            title={t`Radar doesn’t crawl devnets.`}
            body={t`Masternode records come from Radar’s crawl of mainnet and testnet.`}
          />
        </PlainTitle>
      ) : (
        <Record net={net} protx={id} off={off} tab={tab} epoch={epoch} before={before} />
      )}
    </article>
  )
}

/** The page's heading while there is no record to name it. */
function PlainTitle({ children }: { children: ReactNode }) {
  const { t } = useLingui()
  return (
    <>
      <header className="grid gap-2">
        <p data-eyebrow className="text-sm text-[var(--dh-ink-2,inherit)]">
          {t`Network`}
        </p>
        <h1 className="text-3xl font-semibold">{t`Masternode`}</h1>
      </header>
      {children}
    </>
  )
}

function NotAProtx({ value }: { value: string }) {
  const { t } = useLingui()
  return (
    <PlainTitle>
      <Empty
        kind="not-found"
        title={t`That isn’t a ProTx hash.`}
        body={
          <>
            <Hash value={value} display="wrap" copy={false} />
            <span className="block">{t`A ProTx hash is 64 hexadecimal characters.`}</span>
          </>
        }
        action={<PageLink to="/search">{t`Search Radar`}</PageLink>}
      />
    </PlainTitle>
  )
}

interface RecordProps {
  net: NetworkId
  protx: string
  off: boolean
  tab: MnTab | undefined
  epoch: number | undefined
  before: number | undefined
}

function Record({ net, protx, off, tab, epoch, before }: RecordProps) {
  const { t } = useLingui()
  const radar = useRadarRecord(net, protx)
  const dapi = useDapiFacts(net, protx)
  const plain = (node: ReactNode) => <PlainTitle>{node}</PlainTitle>

  const d = radar.data?.data ?? null
  const f = dapi.data?.data ?? null
  const waitingOnRadar = !off && radar.isPending
  const waitingOnDapi = off && dapi.isPending
  if (waitingOnRadar || waitingOnDapi) return plain(<Skeleton shape="block" height={220} />)
  if (!d && !f) {
    if (!off && radar.isError) {
      return plain(
        <ErrorState
          error={radar.error}
          source="radar"
          onRetry={() => {
            void radar.refetch()
          }}
        />,
      )
    }
    if (off && dapi.isError) {
      return plain(<Unavailable title={t`Masternode records need an indexer`} />)
    }
    return plain(<Unknown net={net} protx={protx} off={off} />)
  }

  const evo = f ? f.type === 'Evo' : d ? isEvonode(d) : false
  const ctx: MnContext = {
    net,
    protx,
    d,
    radar: radar.data ? stampOf(radar.data) : null,
    f,
    dapi: dapi.data ? stampOf(dapi.data) : null,
    evo,
    off,
  }
  const current: MnTab = tab === 'platform' && !evo ? 'overview' : (tab ?? 'overview')
  return (
    <>
      <Header ctx={ctx} />
      <PageTabs protx={protx} evo={evo} value={current} />
      {current === 'overview' ? <OverviewTab ctx={ctx} /> : null}
      {current === 'network' ? <NetworkTab ctx={ctx} /> : null}
      {current === 'platform' ? <PlatformTab ctx={ctx} epoch={epoch} /> : null}
      {current === 'history' ? <HistoryTab ctx={ctx} /> : null}
      {current === 'payments' ? <PaymentsTab ctx={ctx} before={before} /> : null}
    </>
  )
}

function PageTabs({ protx, evo, value }: { protx: string; evo: boolean; value: MnTab }) {
  const { t } = useLingui()
  const tabs: { id: MnTab; label: string }[] = [
    { id: 'overview', label: t`Overview` },
    { id: 'network', label: t`Network` },
    ...(evo ? [{ id: 'platform' as const, label: t`Platform` }] : []),
    { id: 'history', label: t`History` },
    { id: 'payments', label: t`Payments` },
  ]
  return (
    <Tabs
      tabs={tabs}
      value={value}
      layer="network"
      to={(id) =>
        ({
          to: '/mn/$protx',
          params: { protx },
          search: (s: Record<string, unknown>) => ({
            ...s,
            tab: id === 'overview' ? undefined : id,
            epoch: undefined,
            before: undefined,
          }),
        }) as LinkProps
      }
    />
  )
}

/** A ProTx Radar doesn't know here may be registered on the other network. */
function Unknown({ net, protx, off }: { net: NetworkId; protx: string; off: boolean }) {
  const { t } = useLingui()
  const client = useQueryClient()
  const other = otherNetwork(net)
  const there = useQuery({
    ...radarQueries.masternode(other ?? 'mainnet', protx),
    enabled: !!other && !off,
  })
  const cached =
    other && off ? client.getQueryData(coreQueries.masternodeList(other).queryKey) : undefined
  const found = off
    ? !!cached && (cached.data.has(protx) || cached.data.has(protx.toUpperCase()))
    : !!other && there.data?.data !== null && there.data?.data !== undefined
  const otherName = other === 'mainnet' ? t`mainnet` : t`testnet`
  const here = net === 'mainnet' ? t`mainnet` : t`testnet`
  const empty = (
    <Empty
      kind="not-found"
      title={
        found
          ? t`This masternode is on ${otherName}.`
          : t`No masternode with this ProTx on ${here}.`
      }
      body={
        <>
          <Hash value={protx} display="wrap" />
          <span className="block">
            {found
              ? t`The masternode list of ${here} doesn’t include it.`
              : off
                ? t`DAPI’s list doesn’t include it. It may be new, removed, or mistyped.`
                : t`Radar’s crawl doesn’t list it. It may be new, removed, or mistyped.`}
          </span>
        </>
      }
      action={
        found && other ? (
          <PageLink to={`/mn/${protx}`} search={{ network: other }} data-other-network={other}>
            {t`Open it on ${otherName}`}
          </PageLink>
        ) : (
          <PageLink to="/search" data-search-offer>
            {t`Search Radar`}
          </PageLink>
        )
      }
    />
  )
  return off ? (
    <>
      {empty}
      <Unavailable
        compact
        title={t`Radar’s crawl, which also lists nodes missing from DAPI’s list, is off`}
      />
    </>
  ) : (
    empty
  )
}

function Header({ ctx }: { ctx: MnContext }) {
  const { t } = useLingui()
  const { d, f, evo, net, protx } = ctx
  const serviceText = f?.service ?? d?.service ?? null
  const service = serviceText ? splitService(serviceText) : null
  const banned = f ? !f.valid : d ? poseState(d) === 'banned' : false
  const penalised = d ? poseState(d) === 'penalised' : false
  const place = d ? placeOf(d) : ''
  return (
    <header className="rx-rec" data-masternode-header>
      <span className="rx-rec__glyph">
        <Nodeprint id={protx} evonode={evo} size={60} />
      </span>
      <p className="rx-rec__kicker">
        <span
          className="rx-type"
          data-layer={evo ? 'platform' : 'network'}
          data-type={evo ? 'Evo' : 'Regular'}
        >
          {evo ? t`Evonode` : t`Regular masternode`}
        </span>
        {place ? <span>{place}</span> : null}
      </p>
      <h1 className="rx-rec__title" data-service>
        {service ? (
          <>
            {service.host}
            {service.port ? <span className="rx-tld">:{service.port}</span> : null}
          </>
        ) : (
          t`Masternode ${protx.slice(0, 8)}`
        )}
      </h1>
      <div className="rx-rec__actions">
        <LinkOut to={{ app: 'gov', action: 'masternodes', net }}>{t`Vote in Governance`}</LinkOut>
        <CopyLinkButton />
      </div>
      <div className="rx-rec__meta">
        <span className="rx-dim">{t`ProTx`}</span>
        <Hash value={protx} display="full" />
      </div>
      <div className="rx-rec__meta" data-status>
        {d ? (
          <span
            className={`rx-st ${d.reachable ? 'rx-st--good' : d.reachable === false ? 'rx-st--bad' : ''}`}
          >
            {d.reachable
              ? t`Answering`
              : d.reachable === false
                ? t`Not answering`
                : t`Not checked yet`}
          </span>
        ) : null}
        <span
          className={`rx-st ${banned ? 'rx-st--bad' : penalised ? 'rx-st--warn' : 'rx-st--good'}`}
        >
          {banned
            ? t`PoSe banned`
            : d
              ? penalised
                ? t`Enabled, PoSe penalty ${d.pose_penalty}`
                : t`Enabled, no PoSe penalty`
              : t`Valid on DAPI’s list`}
        </span>
        {d?.version ? <span className="rx-ver">{d.version}</span> : null}
        {ctx.radar && d ? <CrawlLine stamp={ctx.radar} /> : null}
        {ctx.dapi && f ? <SourceLine stamp={ctx.dapi} compact /> : null}
      </div>
    </header>
  )
}

function CrawlLine({ stamp }: { stamp: SourceStamp }) {
  const { t } = useLingui()
  return (
    <span className="rx-src" data-source={stamp.source}>
      <Icon name="radar" />
      {t`Crawled by Radar`}
      <Time ms={stamp.fetchedAt} />
    </span>
  )
}
