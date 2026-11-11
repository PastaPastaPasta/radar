import { useLingui } from '@lingui/react/macro'
import type { SourceStamp } from '@/data/envelope'
import type { RadarMasternodeDetail } from '@/data/radar/schemas'
import { formatInt } from '@/lib/format'
import { Badge, Card, Empty, KeyValue, Time } from '@/ui'
import { UptimeStrip } from './UptimeCard'

interface Probe {
  ms?: number | null
  error?: string | null
}

function probeText(
  p: Probe | null | undefined,
  t: (s: TemplateStringsArray, ...v: unknown[]) => string,
) {
  if (!p) return '—'
  if (p.error) return t`Failed: ${p.error}`
  return p.ms === null || p.ms === undefined ? '—' : t`Answered in ${formatInt(p.ms)} ms`
}

export function PlatformCard({ d, stamp }: { d: RadarMasternodeDetail; stamp: SourceStamp }) {
  const { t } = useLingui()
  const latest = d.platform?.latest
  const daily = d.platform?.daily ?? []
  const sw = latest?.software
  const probeFailing = !!latest?.https?.error || !!latest?.p2p?.error
  const protocol = latest?.drive_protocol
  const versions = [
    sw?.dapi ? `DAPI ${sw.dapi}` : null,
    sw?.drive ? `Drive ${sw.drive}` : null,
    sw?.tenderdash ? `Tenderdash ${sw.tenderdash}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <Card
      title={t`Platform endpoints`}
      layer="platform"
      source={stamp}
      id="platform"
      actions={
        d.platform_banned ? (
          <Badge tone="danger">{t`Banned on Platform`}</Badge>
        ) : latest ? (
          <Badge tone={probeFailing ? 'warning' : 'success'}>
            {probeFailing ? t`Probe failing` : t`Healthy`}
          </Badge>
        ) : undefined
      }
    >
      {latest ? (
        <>
          <KeyValue
            columns={2}
            items={[
              { label: t`HTTPS (DAPI)`, value: probeText(latest.https, t), hint: d.platform_https },
              { label: t`P2P (Tenderdash)`, value: probeText(latest.p2p, t), hint: d.platform_p2p },
              {
                label: t`TLS certificate`,
                value: latest.cert?.expires ? (
                  <>
                    {t`Expires`} <Time ms={latest.cert.expires} mode="absolute" />
                  </>
                ) : (
                  '—'
                ),
                hint: latest.cert?.issuer ?? undefined,
              },
              {
                label: t`Platform height`,
                value:
                  latest.height === null || latest.height === undefined
                    ? '—'
                    : formatInt(latest.height),
                hint: latest.catching_up ? t`Catching up` : undefined,
              },
              { label: t`Software`, value: versions || '—' },
              {
                label: t`Drive protocol`,
                value:
                  protocol?.current === null || protocol?.current === undefined
                    ? '—'
                    : formatInt(protocol.current),
                hint:
                  protocol?.next_epoch !== null &&
                  protocol?.next_epoch !== undefined &&
                  protocol.next_epoch !== protocol.current
                    ? t`Next epoch ${formatInt(protocol.next_epoch)}`
                    : undefined,
              },
              { label: t`Probed`, value: <Time ms={latest.ts} mode="both" /> },
            ]}
          />
          {daily.length > 0 ? (
            <div className="mt-4" data-platform-daily>
              <p className="rx-dim rx-sm">{t`Daily health`}</p>
              <UptimeStrip
                daily={daily}
                label={t`Platform endpoint checks answered, day by day, over ${daily.length} days`}
              />
            </div>
          ) : null}
        </>
      ) : (
        <Empty kind="none-yet" title={t`Radar hasn’t probed this node’s Platform endpoints yet.`} />
      )}
    </Card>
  )
}
