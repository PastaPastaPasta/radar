import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useMemo, type ReactNode } from 'react'
import type { SourceStamp } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { radarQueries } from '@/data/radar/queries'
import type { RadarMasternodeDetail } from '@/data/radar/schemas'
import { Entity, PageLink, useDocumentTitle, useNetwork } from '@/features/entity'
import { formatInt, formatPercent } from '@/lib/format'
import { isDevnet, type NetworkId } from '@/lib/network'
import {
  Amount,
  Card,
  Empty,
  Hash,
  Icon,
  KeyValue,
  LinkOut,
  Nodeprint,
  QueryView,
  Skeleton,
  Stat,
  Stats,
  Time,
  Unavailable,
} from '@/ui'
import { PaymentsCard } from './PaymentsCard'
import { PlatformCard } from './PlatformCard'
import { ReadinessCard } from './ReadinessCard'
import { UptimeCard } from './UptimeCard'
import {
  heightOrNull,
  isEvonode,
  otherNetwork,
  parseOutpoint,
  placeOf,
  poseState,
  PROTX,
  splitService,
  uptimeSummary,
} from './mn-info'

export function MasternodePage({ protx }: { protx: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const id = protx.toLowerCase()
  const off = useDecentralizedOnly()
  useDocumentTitle(t`Masternode ${id.slice(0, 8)}`)

  return (
    <article data-page="/mn/$protx" data-layer="network" className="grid gap-6">
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
      ) : off ? (
        <PlainTitle>
          <Unavailable title={t`Masternode records need Radar's crawler`} />
        </PlainTitle>
      ) : (
        <Record net={net} protx={id} />
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

function Record({ net, protx }: { net: NetworkId; protx: string }) {
  const { t } = useLingui()
  const query = useQuery(radarQueries.masternode(net, protx))
  const plain = (node: ReactNode) => <PlainTitle>{node}</PlainTitle>
  return (
    <>
      {query.isError && query.data === undefined ? plain(null) : null}
      <QueryView
        query={query}
        skeleton={plain(<Skeleton shape="block" height={220} />)}
        isEmpty={(d) => d === null}
        empty={plain(<Unknown net={net} protx={protx} />)}
      >
        {(d, stamp) =>
          d === null ? null : (
            <>
              <Header d={d} net={net} stamp={stamp} />
              <Kpis d={d} stamp={stamp} />
              <div className="rx-split">
                <div className="grid gap-5">
                  <UptimeCard daily={d.uptime_daily} stamp={stamp} />
                  {isEvonode(d) ? <PlatformCard d={d} stamp={stamp} /> : null}
                  <PaymentsCard d={d} stamp={stamp} />
                </div>
                <aside className="grid gap-5" aria-label={t`Facts`}>
                  <LocationCard d={d} stamp={stamp} />
                  <RegistrationCard d={d} stamp={stamp} />
                  <ReadinessCard d={d} stamp={stamp} />
                </aside>
              </div>
            </>
          )
        }
      </QueryView>
    </>
  )
}

/** A ProTx Radar doesn't know here may be registered on the other network. */
function Unknown({ net, protx }: { net: NetworkId; protx: string }) {
  const { t } = useLingui()
  const other = otherNetwork(net)
  const there = useQuery({
    ...radarQueries.masternode(other ?? 'mainnet', protx),
    enabled: !!other,
  })
  const found = !!other && there.data?.data !== null && there.data?.data !== undefined
  const otherName = other === 'mainnet' ? t`mainnet` : t`testnet`
  const here = net === 'mainnet' ? t`mainnet` : t`testnet`
  return (
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
              ? t`Radar’s crawl of ${here} doesn’t list it.`
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
}

function Header({
  d,
  net,
  stamp,
}: {
  d: RadarMasternodeDetail
  net: NetworkId
  stamp: SourceStamp
}) {
  const { t } = useLingui()
  const evo = isEvonode(d)
  const service = d.service ? splitService(d.service) : null
  const pose = poseState(d)
  const place = placeOf(d)
  return (
    <header className="rx-rec" data-masternode-header>
      <span className="rx-rec__glyph">
        <Nodeprint id={d.protx} evonode={evo} size={60} />
      </span>
      <p className="rx-rec__kicker">
        <span className="rx-type" data-layer={evo ? 'platform' : 'network'} data-type={d.type}>
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
          t`Masternode ${d.protx.slice(0, 8)}`
        )}
      </h1>
      <div className="rx-rec__actions">
        <LinkOut to={{ app: 'gov', action: 'masternodes', net }}>{t`Vote in Governance`}</LinkOut>
      </div>
      <div className="rx-rec__meta">
        <span className="rx-dim">{t`ProTx`}</span>
        <Hash value={d.protx} display="full" />
      </div>
      <div className="rx-rec__meta" data-status>
        <span
          className={`rx-st ${d.reachable ? 'rx-st--good' : d.reachable === false ? 'rx-st--bad' : ''}`}
        >
          {d.reachable
            ? t`Answering`
            : d.reachable === false
              ? t`Not answering`
              : t`Not checked yet`}
        </span>
        <span
          className={`rx-st ${pose === 'clear' ? 'rx-st--good' : pose === 'banned' ? 'rx-st--bad' : 'rx-st--warn'}`}
        >
          {pose === 'banned'
            ? t`PoSe banned`
            : pose === 'penalised'
              ? t`Enabled, PoSe penalty ${d.pose_penalty}`
              : t`Enabled, no PoSe penalty`}
        </span>
        {d.version ? <span className="rx-ver">{d.version}</span> : null}
        <CrawlLine stamp={stamp} />
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

function Kpis({ d, stamp }: { d: RadarMasternodeDetail; stamp: SourceStamp }) {
  const { t } = useLingui()
  const up = useMemo(() => uptimeSummary(d.uptime_daily, 30), [d.uptime_daily])
  const lastPaid = d.payments.find((p) => p.height === d.last_paid_height)
  const paid90 = d.returns?.paid_90d
  const window = d.returns?.window_days ?? 90
  return (
    <Stats data-masternode-kpis>
      <Stat
        label={t`Uptime, 30 days`}
        value={up ? formatPercent(up.ratio, up.ratio === 1 ? 0 : 1) : '—'}
        note={
          up
            ? t`answered ${formatInt(up.ok)} of ${formatInt(up.attempts)} checks in ${up.days} days`
            : t`Radar has no checks for this node yet`
        }
        layer="network"
        source={stamp}
      />
      <Stat
        label={t`Last paid`}
        value={lastPaid ? <Time ms={lastPaid.time} /> : '—'}
        note={
          heightOrNull(d.last_paid_height) === null ? (
            t`not paid yet`
          ) : (
            <>
              {t`block`}{' '}
              <Entity
                kind="block"
                id={String(d.last_paid_height)}
                label={formatInt(d.last_paid_height)}
              />
            </>
          )
        }
        layer="core"
        source={stamp}
      />
      <Stat
        label={t`Earned on Core, ${window} days`}
        value={
          paid90 === undefined || paid90 === null ? (
            '—'
          ) : (
            <Amount value={paid90} kind="duffs" fiat />
          )
        }
        note={
          d.payments_summary
            ? t`${formatInt(d.payments_summary.count)} payments indexed in total`
            : undefined
        }
        layer="core"
        source={stamp}
      />
      <Stat
        label={t`PoSe penalty`}
        value={formatInt(d.pose_penalty)}
        note={
          heightOrNull(d.pose_ban_height) === null
            ? t`never banned`
            : t`banned at block ${formatInt(d.pose_ban_height)}`
        }
        layer="network"
        source={stamp}
      />
    </Stats>
  )
}

function LocationCard({ d, stamp }: { d: RadarMasternodeDetail; stamp: SourceStamp }) {
  const { t } = useLingui()
  const items = [
    d.city || d.country ? { label: t`Place`, value: placeOf(d) } : null,
    d.as_org ? { label: t`Hosting`, value: d.asn ? `${d.as_org} · AS${d.asn}` : d.as_org } : null,
    d.latency_ms === null
      ? null
      : { label: t`Latency`, value: t`${formatInt(d.latency_ms)} ms from Radar’s crawler` },
    d.network ? { label: t`Address type`, value: d.network } : null,
    d.last_seen === null
      ? null
      : { label: t`Last reached`, value: <Time ms={d.last_seen} mode="both" /> },
    d.first_seen === null
      ? null
      : { label: t`First seen`, value: <Time ms={d.first_seen} mode="absolute" /> },
    d.last_error ? { label: t`Last error`, value: d.last_error } : null,
  ].filter((x) => x !== null)
  return (
    <Card title={t`Where it is`} layer="network" source={stamp} id="location">
      {items.length > 0 ? <KeyValue items={items} /> : <p>{t`Radar hasn’t located this node.`}</p>}
    </Card>
  )
}

function RegistrationCard({ d, stamp }: { d: RadarMasternodeDetail; stamp: SourceStamp }) {
  const { t } = useLingui()
  const collateral = parseOutpoint(d.collateral)
  const votingSame = d.voting_address !== null && d.voting_address === d.owner_address
  const operatorPayout = d.operator_payout_address
  const items = [
    { label: t`Payout`, value: <Entity kind="address" id={d.payout_address} /> },
    { label: t`Owner`, value: <Entity kind="address" id={d.owner_address} /> },
    {
      label: t`Voting`,
      value: d.voting_address ? <Entity kind="address" id={d.voting_address} /> : '—',
      hint: votingSame ? t`Same as the owner address` : undefined,
    },
    {
      label: t`Operator key`,
      value: <Hash value={d.pubkey_operator} display="short" head={10} tail={6} />,
      hint:
        d.operator_reward > 0
          ? t`Operator reward ${formatPercent(d.operator_reward / 10000, 2)}`
          : undefined,
    },
    ...(operatorPayout
      ? [{ label: t`Operator payout`, value: <Entity kind="address" id={operatorPayout} /> }]
      : []),
    {
      label: t`Collateral`,
      value: collateral ? (
        <Entity
          kind="tx"
          id={collateral.txid}
          label={`${collateral.txid.slice(0, 8)}…:${collateral.index}`}
        />
      ) : (
        <Hash value={d.collateral} display="short" />
      ),
      hint: isEvonode(d) ? t`Evonode collateral` : t`Masternode collateral`,
    },
    {
      label: t`Registered`,
      value: (
        <Entity
          kind="block"
          id={String(d.registered_height)}
          label={formatInt(d.registered_height)}
        />
      ),
      hint: t`Block ${formatInt(d.registered_height)}`,
    },
    {
      label: t`PoSe`,
      value:
        poseState(d) === 'banned'
          ? t`Banned`
          : d.pose_penalty > 0
            ? t`Penalty ${formatInt(d.pose_penalty)}`
            : t`No penalty`,
      hint:
        [
          heightOrNull(d.pose_ban_height) === null
            ? null
            : t`Banned at block ${formatInt(d.pose_ban_height)}`,
          heightOrNull(d.pose_revived_height) === null
            ? null
            : t`Revived at block ${formatInt(d.pose_revived_height ?? 0)}`,
        ]
          .filter(Boolean)
          .join(' · ') || undefined,
    },
    ...(d.platform_node_id
      ? [
          {
            label: t`Platform node`,
            value: <Hash value={d.platform_node_id} display="short" head={8} tail={6} />,
          },
        ]
      : []),
  ]
  return (
    <Card title={t`Registration`} layer="network" source={stamp} id="registration">
      <KeyValue items={items} />
    </Card>
  )
}
