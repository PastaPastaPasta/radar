import { useLingui } from '@lingui/react/macro'
import type { SourceStamp } from '@/data/envelope'
import type { RadarMasternodeDetail } from '@/data/radar/schemas'
import { PageLink } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Badge, Card, KeyValue, Time } from '@/ui'
import { BenchCard } from './BenchCard'
import { CheckNow } from './CheckNow'
import type { MnContext } from './mn-context'
import { placeOf } from './mn-info'
import { PlatformCard } from './PlatformCard'
import { RadarOnly } from './RadarOnly'

const SERVICE_BITS: [bigint, string][] = [
  [1n, 'NETWORK'],
  [2n, 'GETUTXO'],
  [4n, 'BLOOM'],
  [64n, 'COMPACT_FILTERS'],
  [1024n, 'NETWORK_LIMITED'],
  [2048n, 'HEADERS_COMPRESSED'],
  [4096n, 'P2P_V2'],
]

/** The names of the service bits a node announced, followed by the bitmask itself. */
function servicesText(services: unknown): string | null {
  if (
    typeof services !== 'number' &&
    typeof services !== 'string' &&
    typeof services !== 'bigint'
  ) {
    return null
  }
  let mask: bigint
  try {
    mask = BigInt(services)
  } catch {
    return null
  }
  const names = SERVICE_BITS.filter(([bit]) => (mask & bit) !== 0n).map(([, name]) => name)
  return `${names.join(', ') || '—'} (0x${mask.toString(16)})`
}

export function NetworkTab({ ctx }: { ctx: MnContext }) {
  const { t } = useLingui()
  const { d, radar } = ctx
  if (!d || !radar) {
    return (
      <RadarOnly
        ctx={ctx}
        what={t`The port check, location, speed test and endpoint health need Radar’s crawl`}
      />
    )
  }
  return (
    <div className="grid gap-5">
      <div className="rx-split">
        <div className="grid gap-5">
          <PortCheckCard ctx={ctx} d={d} stamp={radar} />
          <BenchCard ctx={ctx} />
        </div>
        <aside className="grid gap-5" aria-label={t`Facts`}>
          <LocationCard d={d} stamp={radar} />
        </aside>
      </div>
      {ctx.evo ? <PlatformCard d={d} stamp={radar} /> : null}
    </div>
  )
}

function PortCheckCard({
  ctx,
  d,
  stamp,
}: {
  ctx: MnContext
  d: RadarMasternodeDetail
  stamp: SourceStamp
}) {
  const { t } = useLingui()
  const services = servicesText(d.services)
  const items = [
    {
      label: t`Latest port check`,
      value:
        d.reachable === null ? (
          t`not checked in the latest crawl`
        ) : (
          <Badge tone={d.reachable ? 'success' : 'danger'}>
            {d.reachable ? t`Answered` : t`No answer`}
          </Badge>
        ),
    },
    d.last_error
      ? { label: t`Error`, value: <span className="rx-mono">{d.last_error}</span> }
      : null,
    {
      label: t`Last answered`,
      value: d.last_seen === null ? t`never` : <Time ms={d.last_seen} mode="both" />,
    },
    { label: t`User agent`, value: d.user_agent ? <code>{d.user_agent}</code> : '—' },
    { label: t`Protocol`, value: d.protocol === null ? '—' : String(d.protocol) },
    services ? { label: t`Services`, value: services } : null,
    {
      label: t`Height it reported`,
      value: d.start_height == null ? '—' : formatInt(d.start_height),
    },
    {
      label: t`Latency`,
      value: d.latency_ms === null ? '—' : t`${formatInt(d.latency_ms)} ms from Radar’s crawler`,
    },
  ].filter((x) => x !== null)
  return (
    <Card title={t`Port check`} layer="network" source={stamp} id="port-check">
      <KeyValue items={items} />
      {d.service && !ctx.off ? (
        <div className="mt-4">
          <CheckNow net={ctx.net} protx={ctx.protx} />
        </div>
      ) : null}
    </Card>
  )
}

function LocationCard({ d, stamp }: { d: RadarMasternodeDetail; stamp: SourceStamp }) {
  const { t } = useLingui()
  const place = placeOf(d)
  const items = [
    place
      ? {
          label: t`Place`,
          value: place,
          hint:
            d.lat !== null && d.lat !== undefined ? (
              <PageLink to="/map" search={{ protx: d.protx }} data-show-on-map>
                {t`Show on map`}
              </PageLink>
            ) : undefined,
        }
      : null,
    d.asn && d.as_org
      ? {
          label: t`Hosting`,
          value: (
            <PageLink
              to="/masternodes"
              search={{ host: String(d.asn) }}
              title={t`Masternodes on this network`}
              data-host-filter
            >
              {d.as_org}
            </PageLink>
          ),
          hint: t`AS${d.asn}`,
        }
      : d.as_org
        ? { label: t`Hosting`, value: d.as_org }
        : null,
    d.network ? { label: t`Address type`, value: d.network } : null,
    d.first_seen === null
      ? null
      : { label: t`First seen`, value: <Time ms={d.first_seen} mode="absolute" /> },
  ].filter((x) => x !== null)
  return (
    <Card title={t`Where it is`} layer="network" source={stamp} id="location">
      {items.length > 0 ? <KeyValue items={items} /> : <p>{t`Radar hasn’t located this node.`}</p>}
    </Card>
  )
}
